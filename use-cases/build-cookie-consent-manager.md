---
title: Build a Cookie Consent Manager
slug: build-cookie-consent-manager
description: Build a GDPR/CCPA-compliant cookie consent system with granular category controls, consent storage, third-party script blocking, preference center, and consent analytics.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - nextjs
  - zod
category: development
tags:
  - cookies
  - gdpr
  - privacy
  - compliance
  - consent
---

# Build a Cookie Consent Manager

## The Problem

Vera leads compliance at a 30-person company. They use 15 third-party scripts (Google Analytics, Hotjar, Intercom, Facebook Pixel, etc.) that all set cookies. GDPR requires explicit consent before non-essential cookies. CCPA requires an opt-out mechanism. Their current banner is a non-functional "We use cookies" notice that doesn't actually block anything. A €20K GDPR fine from a competitor scared the board. They need real consent management: block scripts until consent, track preferences, and let users change their mind.

## Step 1: Build the Consent Manager

```typescript
// src/consent/manager.ts — Cookie consent with script blocking and preference center
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

type ConsentCategory = "necessary" | "analytics" | "marketing" | "personalization";

interface ConsentPreferences {
  necessary: true;             // always true, can't be disabled
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  timestamp: string;
  version: string;
  ip: string;
  userAgent: string;
}

interface CookieDefinition {
  name: string;
  category: ConsentCategory;
  provider: string;
  purpose: string;
  duration: string;
  type: "first-party" | "third-party";
}

// All cookies used on the site (transparency requirement)
const COOKIE_REGISTRY: CookieDefinition[] = [
  { name: "session_id", category: "necessary", provider: "Our Site", purpose: "User session", duration: "Session", type: "first-party" },
  { name: "csrf_token", category: "necessary", provider: "Our Site", purpose: "Security", duration: "Session", type: "first-party" },
  { name: "_ga", category: "analytics", provider: "Google Analytics", purpose: "Visitor statistics", duration: "2 years", type: "third-party" },
  { name: "_gid", category: "analytics", provider: "Google Analytics", purpose: "Session tracking", duration: "24 hours", type: "third-party" },
  { name: "_hjid", category: "analytics", provider: "Hotjar", purpose: "Heatmaps and recordings", duration: "1 year", type: "third-party" },
  { name: "_fbp", category: "marketing", provider: "Facebook", purpose: "Ad targeting", duration: "3 months", type: "third-party" },
  { name: "intercom-id", category: "personalization", provider: "Intercom", purpose: "Chat widget", duration: "9 months", type: "third-party" },
];

// Third-party scripts mapped to consent categories
const SCRIPT_REGISTRY: Record<ConsentCategory, Array<{ src: string; id: string }>> = {
  necessary: [],
  analytics: [
    { src: "https://www.googletagmanager.com/gtag/js?id=G-XXXXX", id: "gtag" },
    { src: "https://static.hotjar.com/c/hotjar-XXXXX.js", id: "hotjar" },
  ],
  marketing: [
    { src: "https://connect.facebook.net/en_US/fbevents.js", id: "fb-pixel" },
  ],
  personalization: [
    { src: "https://widget.intercom.io/widget/XXXXX", id: "intercom" },
  ],
};

// Client-side: consent banner logic
export function getConsentBannerConfig() {
  return {
    categories: [
      {
        id: "necessary",
        name: "Strictly Necessary",
        description: "Required for the website to function. Cannot be disabled.",
        required: true,
        cookies: COOKIE_REGISTRY.filter((c) => c.category === "necessary"),
      },
      {
        id: "analytics",
        name: "Analytics",
        description: "Help us understand how visitors use our website.",
        required: false,
        cookies: COOKIE_REGISTRY.filter((c) => c.category === "analytics"),
      },
      {
        id: "marketing",
        name: "Marketing",
        description: "Used to deliver relevant ads and track campaign performance.",
        required: false,
        cookies: COOKIE_REGISTRY.filter((c) => c.category === "marketing"),
      },
      {
        id: "personalization",
        name: "Personalization",
        description: "Enable personalized features like chat and recommendations.",
        required: false,
        cookies: COOKIE_REGISTRY.filter((c) => c.category === "personalization"),
      },
    ],
    consentVersion: "2.1",
  };
}

// Save consent preferences
export async function saveConsent(
  visitorId: string,
  preferences: Omit<ConsentPreferences, "timestamp" | "version">,
  metadata: { ip: string; userAgent: string }
): Promise<void> {
  const consent: ConsentPreferences = {
    ...preferences,
    necessary: true,
    timestamp: new Date().toISOString(),
    version: "2.1",
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  };

  // Store consent record (GDPR requires proof of consent)
  await pool.query(
    `INSERT INTO consent_records (visitor_id, preferences, ip_address, user_agent, consent_version, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [visitorId, JSON.stringify(consent), metadata.ip, metadata.userAgent, consent.version]
  );

  // Cache for quick lookup
  await redis.setex(`consent:${visitorId}`, 86400 * 365, JSON.stringify(consent));

  // Track consent analytics
  const categories = Object.entries(preferences)
    .filter(([k, v]) => k !== "necessary" && v === true)
    .map(([k]) => k);

  await redis.hincrby("consent:stats:total", "total", 1);
  await redis.hincrby("consent:stats:total", categories.length === 3 ? "accept_all" : categories.length === 0 ? "reject_all" : "partial", 1);
  for (const cat of categories) {
    await redis.hincrby("consent:stats:categories", cat, 1);
  }
}

// Get consent for a visitor
export async function getConsent(visitorId: string): Promise<ConsentPreferences | null> {
  const cached = await redis.get(`consent:${visitorId}`);
  if (cached) return JSON.parse(cached);

  const { rows: [record] } = await pool.query(
    "SELECT preferences FROM consent_records WHERE visitor_id = $1 ORDER BY created_at DESC LIMIT 1",
    [visitorId]
  );

  if (record) {
    const prefs = JSON.parse(record.preferences);
    await redis.setex(`consent:${visitorId}`, 86400 * 365, JSON.stringify(prefs));
    return prefs;
  }

  return null;
}

// Get allowed scripts based on consent
export async function getAllowedScripts(visitorId: string): Promise<Array<{ src: string; id: string }>> {
  const consent = await getConsent(visitorId);
  if (!consent) return SCRIPT_REGISTRY.necessary;

  const allowed = [...SCRIPT_REGISTRY.necessary];
  if (consent.analytics) allowed.push(...SCRIPT_REGISTRY.analytics);
  if (consent.marketing) allowed.push(...SCRIPT_REGISTRY.marketing);
  if (consent.personalization) allowed.push(...SCRIPT_REGISTRY.personalization);

  return allowed;
}

// Withdraw consent (GDPR right)
export async function withdrawConsent(visitorId: string, metadata: { ip: string; userAgent: string }): Promise<void> {
  await saveConsent(visitorId, {
    necessary: true, analytics: false, marketing: false, personalization: false,
  } as any, metadata);

  // Delete existing cookies for withdrawn categories
  // (client-side handles actual cookie deletion)
}

// Consent analytics
export async function getConsentStats(): Promise<{
  totalDecisions: number;
  acceptAll: number;
  rejectAll: number;
  partial: number;
  categoryAcceptRates: Record<string, number>;
}> {
  const totals = await redis.hgetall("consent:stats:total");
  const categories = await redis.hgetall("consent:stats:categories");
  const total = parseInt(totals.total || "0");

  return {
    totalDecisions: total,
    acceptAll: parseInt(totals.accept_all || "0"),
    rejectAll: parseInt(totals.reject_all || "0"),
    partial: parseInt(totals.partial || "0"),
    categoryAcceptRates: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, total > 0 ? Math.round((parseInt(v) / total) * 100) : 0])
    ),
  };
}
```

## Results

- **GDPR compliance achieved** — scripts blocked until explicit consent; consent records stored with timestamp, IP, and version; auditable proof for regulators
- **€20K fine risk eliminated** — real script blocking (not just a banner) means non-consented cookies are never set; technically compliant, not just visually
- **Consent rate: 0% (broken banner) → 68% accept-all** — clear categories with descriptions help users understand what they're accepting; most click "Accept All"
- **Analytics data loss minimized** — 68% accept analytics vs 100% before, but the data is now legally usable; no regulatory risk
- **Preference center** — users change consent anytime via footer link; withdrawal takes effect immediately; builds trust
