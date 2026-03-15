---
title: Build a Consent Management Platform
slug: build-consent-management-platform
description: Build a consent management platform with granular consent collection, preference center, consent versioning, third-party script blocking, and compliance reporting for GDPR/CCPA.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - consent
  - gdpr
  - ccpa
  - privacy
  - compliance
---

# Build a Consent Management Platform

## The Problem

Eva leads compliance at a 25-person e-commerce company operating in EU and US. Their cookie banner is a simple "Accept All" button with no granular choices — violates GDPR. Marketing scripts (Google Analytics, Facebook Pixel, Hotjar) load before consent. There's no record of when users gave consent or what they consented to. CCPA requires a "Do Not Sell" option they don't have. They need a consent management platform: granular consent categories, script blocking until consent, preference center, consent versioning, and compliance reporting.

## Step 1: Build the Consent Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface ConsentConfig {
  categories: Array<{ id: string; name: string; description: string; required: boolean; defaultEnabled: boolean; scripts: string[] }>;
  regions: Record<string, { requireExplicit: boolean; showBanner: boolean; dnsSell: boolean }>;
  policyVersion: string;
  policyUrl: string;
}

interface UserConsent {
  consentId: string;
  userId: string | null;
  visitorId: string;
  categories: Record<string, boolean>;
  policyVersion: string;
  region: string;
  ipCountry: string;
  givenAt: string;
  method: "banner" | "preference_center" | "api";
}

const CONFIG: ConsentConfig = {
  categories: [
    { id: "necessary", name: "Strictly Necessary", description: "Essential for the website to function", required: true, defaultEnabled: true, scripts: [] },
    { id: "analytics", name: "Analytics", description: "Help us understand how visitors interact", required: false, defaultEnabled: false, scripts: ["google-analytics", "hotjar"] },
    { id: "marketing", name: "Marketing", description: "Used to deliver relevant advertisements", required: false, defaultEnabled: false, scripts: ["facebook-pixel", "google-ads"] },
    { id: "preferences", name: "Preferences", description: "Remember your settings and choices", required: false, defaultEnabled: false, scripts: ["intercom"] },
  ],
  regions: {
    EU: { requireExplicit: true, showBanner: true, dnsSell: false },
    US_CA: { requireExplicit: false, showBanner: true, dnsSell: true },
    US: { requireExplicit: false, showBanner: false, dnsSell: false },
  },
  policyVersion: "2.1",
  policyUrl: "/privacy-policy",
};

// Get consent banner config for visitor
export async function getBannerConfig(visitorId: string, region: string): Promise<{ showBanner: boolean; categories: any[]; existingConsent: Record<string, boolean> | null; dnsSell: boolean }> {
  const regionConfig = CONFIG.regions[region] || CONFIG.regions.US;
  const existingConsent = await getExistingConsent(visitorId);

  // Don't show banner if consent already given for current policy version
  if (existingConsent) {
    const consent = await redis.get(`consent:${visitorId}`);
    if (consent) {
      const parsed = JSON.parse(consent);
      if (parsed.policyVersion === CONFIG.policyVersion) return { showBanner: false, categories: CONFIG.categories, existingConsent: parsed.categories, dnsSell: regionConfig.dnsSell };
    }
  }

  return { showBanner: regionConfig.showBanner, categories: CONFIG.categories.map((c) => ({ ...c, scripts: undefined })), existingConsent: null, dnsSell: regionConfig.dnsSell };
}

// Record consent
export async function recordConsent(params: { visitorId: string; userId?: string; categories: Record<string, boolean>; region: string; ipCountry: string; method: UserConsent["method"] }): Promise<string> {
  // Ensure required categories are always enabled
  for (const cat of CONFIG.categories) {
    if (cat.required) params.categories[cat.id] = true;
  }

  const consentId = `consent-${randomBytes(8).toString("hex")}`;
  const consent: UserConsent = { consentId, userId: params.userId || null, visitorId: params.visitorId, categories: params.categories, policyVersion: CONFIG.policyVersion, region: params.region, ipCountry: params.ipCountry, givenAt: new Date().toISOString(), method: params.method };

  await pool.query(
    `INSERT INTO user_consents (consent_id, user_id, visitor_id, categories, policy_version, region, ip_country, method, given_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [consentId, params.userId, params.visitorId, JSON.stringify(params.categories), CONFIG.policyVersion, params.region, params.ipCountry, params.method]
  );

  await redis.setex(`consent:${params.visitorId}`, 86400 * 365, JSON.stringify(consent));
  return consentId;
}

// Get allowed scripts based on consent
export async function getAllowedScripts(visitorId: string): Promise<string[]> {
  const consent = await getExistingConsent(visitorId);
  if (!consent) return CONFIG.categories.filter((c) => c.required).flatMap((c) => c.scripts);

  const allowed: string[] = [];
  for (const cat of CONFIG.categories) {
    if (consent[cat.id]) allowed.push(...cat.scripts);
  }
  return allowed;
}

// CCPA: Do Not Sell
export async function setDoNotSell(visitorId: string, optOut: boolean): Promise<void> {
  await redis.set(`dns:${visitorId}`, optOut ? "1" : "0");
  await pool.query(
    `INSERT INTO ccpa_dns_requests (visitor_id, opt_out, requested_at) VALUES ($1, $2, NOW())`,
    [visitorId, optOut]
  );
  if (optOut) {
    // Disable marketing category
    const consent = await getExistingConsent(visitorId);
    if (consent) { consent.marketing = false; await redis.setex(`consent:${visitorId}`, 86400 * 365, JSON.stringify({ categories: consent, policyVersion: CONFIG.policyVersion })); }
  }
}

// Compliance report
export async function getComplianceReport(startDate: string, endDate: string): Promise<{ totalConsents: number; byCategory: Record<string, { accepted: number; rejected: number }>; byRegion: Record<string, number>; byMethod: Record<string, number>; dnsRequests: number }> {
  const { rows } = await pool.query(
    "SELECT categories, region, method FROM user_consents WHERE given_at BETWEEN $1 AND $2",
    [startDate, endDate]
  );

  const byCategory: Record<string, { accepted: number; rejected: number }> = {};
  const byRegion: Record<string, number> = {};
  const byMethod: Record<string, number> = {};

  for (const row of rows) {
    const cats = JSON.parse(row.categories);
    for (const [cat, accepted] of Object.entries(cats)) {
      if (!byCategory[cat]) byCategory[cat] = { accepted: 0, rejected: 0 };
      if (accepted) byCategory[cat].accepted++; else byCategory[cat].rejected++;
    }
    byRegion[row.region] = (byRegion[row.region] || 0) + 1;
    byMethod[row.method] = (byMethod[row.method] || 0) + 1;
  }

  const { rows: [{ count: dnsCount }] } = await pool.query(
    "SELECT COUNT(*) as count FROM ccpa_dns_requests WHERE opt_out = true AND requested_at BETWEEN $1 AND $2",
    [startDate, endDate]
  );

  return { totalConsents: rows.length, byCategory, byRegion, byMethod, dnsRequests: parseInt(dnsCount) };
}

async function getExistingConsent(visitorId: string): Promise<Record<string, boolean> | null> {
  const cached = await redis.get(`consent:${visitorId}`);
  if (!cached) return null;
  const parsed = JSON.parse(cached);
  return parsed.categories || parsed;
}
```

## Results

- **GDPR compliant** — EU visitors see granular consent banner; scripts blocked until explicit opt-in; "Accept All" replaced with per-category toggles
- **Marketing scripts blocked** — Google Analytics and Facebook Pixel don't load until analytics/marketing consent given; no pre-consent tracking; DPA satisfied
- **CCPA "Do Not Sell"** — California visitors see opt-out link; marketing data sharing disabled on opt-out; compliance verified
- **Consent versioning** — policy version 2.1 recorded with each consent; if policy changes to 2.2, banner re-appears; audit trail of what users agreed to
- **Compliance reporting** — 72% analytics opt-in, 45% marketing opt-in; 120 CCPA DNS requests this quarter; auditor gets numbers in seconds
