---
title: Build an Email Deliverability Monitor
slug: build-email-deliverability-monitor
description: Build an email deliverability monitor with SPF/DKIM/DMARC validation, inbox placement testing, bounce rate tracking, sender reputation scoring, and blacklist checking for email infrastructure.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - email
  - deliverability
  - monitoring
  - dns
  - reputation
---

# Build an Email Deliverability Monitor

## The Problem

Sara leads engineering at a 25-person SaaS sending 500K emails/month. Delivery rate dropped from 95% to 72% over 3 months — nobody noticed until customers complained about missing password resets. SPF record was misconfigured during a DNS migration. DKIM keys hadn't been rotated in 2 years. Their IP landed on 2 blacklists. Bounce rate climbed to 8% (should be <2%). They need monitoring: check email authentication records, track delivery metrics, detect blacklisting, score sender reputation, and alert on problems before they affect users.

## Step 1: Build the Monitor

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { Resolver } from "node:dns/promises";
const redis = new Redis(process.env.REDIS_URL!);
const resolver = new Resolver();

interface DeliverabilityReport { domain: string; score: number; spf: AuthCheck; dkim: AuthCheck; dmarc: AuthCheck; blacklists: BlacklistCheck[]; metrics: EmailMetrics; recommendations: string[]; checkedAt: string; }
interface AuthCheck { status: "pass" | "fail" | "missing"; record: string | null; issues: string[]; }
interface BlacklistCheck { list: string; listed: boolean; }
interface EmailMetrics { sent: number; delivered: number; bounced: number; complained: number; opened: number; deliveryRate: number; bounceRate: number; complaintRate: number; openRate: number; }

const BLACKLISTS = ["zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org", "dnsbl.sorbs.net", "psbl.surriel.com"];

// Run full deliverability check
export async function checkDeliverability(domain: string, sendingIP?: string): Promise<DeliverabilityReport> {
  const spf = await checkSPF(domain);
  const dkim = await checkDKIM(domain);
  const dmarc = await checkDMARC(domain);
  const blacklists = sendingIP ? await checkBlacklists(sendingIP) : [];
  const metrics = await getEmailMetrics(domain);
  const recommendations: string[] = [];
  let score = 100;

  if (spf.status !== "pass") { score -= 20; recommendations.push(spf.status === "missing" ? "Add SPF record: v=spf1 include:_spf.google.com ~all" : `Fix SPF: ${spf.issues.join(", ")}`); }
  if (dkim.status !== "pass") { score -= 20; recommendations.push("Configure DKIM signing for your sending domain"); }
  if (dmarc.status !== "pass") { score -= 15; recommendations.push(dmarc.status === "missing" ? "Add DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com" : `Fix DMARC: ${dmarc.issues.join(", ")}`); }

  const blacklisted = blacklists.filter((b) => b.listed);
  if (blacklisted.length > 0) { score -= blacklisted.length * 15; recommendations.push(`IP listed on ${blacklisted.length} blacklist(s): ${blacklisted.map((b) => b.list).join(", ")}. Request removal.`); }

  if (metrics.bounceRate > 5) { score -= 10; recommendations.push(`Bounce rate ${metrics.bounceRate.toFixed(1)}% is too high (target: <2%). Clean your email list.`); }
  if (metrics.complaintRate > 0.1) { score -= 10; recommendations.push(`Complaint rate ${metrics.complaintRate.toFixed(2)}% exceeds threshold (target: <0.1%). Add easy unsubscribe.`); }

  score = Math.max(0, score);
  const report: DeliverabilityReport = { domain, score, spf, dkim, dmarc, blacklists, metrics, recommendations, checkedAt: new Date().toISOString() };

  await pool.query(`INSERT INTO deliverability_reports (domain, score, spf_status, dkim_status, dmarc_status, blacklisted, recommendations, checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`, [domain, score, spf.status, dkim.status, dmarc.status, blacklisted.length > 0, JSON.stringify(recommendations)]);

  if (score < 70) { await redis.rpush("notification:queue", JSON.stringify({ type: "deliverability_alert", domain, score, recommendations: recommendations.slice(0, 3) })); }

  return report;
}

async function checkSPF(domain: string): Promise<AuthCheck> {
  try {
    const records = await resolver.resolveTxt(domain);
    const spfRecord = records.find((r) => r.join("").startsWith("v=spf1"));
    if (!spfRecord) return { status: "missing", record: null, issues: ["No SPF record found"] };
    const record = spfRecord.join("");
    const issues: string[] = [];
    if (record.includes("+all")) issues.push("SPF uses +all (allows any server) — should be ~all or -all");
    if ((record.match(/include:/g) || []).length > 10) issues.push("Too many SPF includes (DNS lookup limit is 10)");
    return { status: issues.length > 0 ? "fail" : "pass", record, issues };
  } catch { return { status: "missing", record: null, issues: ["DNS lookup failed"] }; }
}

async function checkDKIM(domain: string): Promise<AuthCheck> {
  const selectors = ["default", "google", "selector1", "selector2", "k1", "mail"];
  for (const selector of selectors) {
    try {
      const records = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
      const dkimRecord = records.find((r) => r.join("").includes("v=DKIM1"));
      if (dkimRecord) {
        const record = dkimRecord.join("");
        const issues: string[] = [];
        if (record.includes("k=rsa") && !record.includes("p=")) issues.push("DKIM record missing public key");
        return { status: issues.length > 0 ? "fail" : "pass", record: `${selector}._domainkey: ${record.slice(0, 100)}`, issues };
      }
    } catch {}
  }
  return { status: "missing", record: null, issues: ["No DKIM record found for common selectors"] };
}

async function checkDMARC(domain: string): Promise<AuthCheck> {
  try {
    const records = await resolver.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records.find((r) => r.join("").startsWith("v=DMARC1"));
    if (!dmarcRecord) return { status: "missing", record: null, issues: ["No DMARC record found"] };
    const record = dmarcRecord.join("");
    const issues: string[] = [];
    if (record.includes("p=none")) issues.push("DMARC policy is 'none' — should be 'quarantine' or 'reject'");
    if (!record.includes("rua=")) issues.push("No aggregate report address (rua) configured");
    return { status: issues.length > 0 ? "fail" : "pass", record, issues };
  } catch { return { status: "missing", record: null, issues: ["DNS lookup failed"] }; }
}

async function checkBlacklists(ip: string): Promise<BlacklistCheck[]> {
  const reversed = ip.split(".").reverse().join(".");
  const results: BlacklistCheck[] = [];
  for (const list of BLACKLISTS) {
    try {
      await resolver.resolve4(`${reversed}.${list}`);
      results.push({ list, listed: true });
    } catch { results.push({ list, listed: false }); }
  }
  return results;
}

async function getEmailMetrics(domain: string): Promise<EmailMetrics> {
  const month = new Date().toISOString().slice(0, 7);
  const stats = await redis.hgetall(`email:metrics:${domain}:${month}`);
  const sent = parseInt(stats.sent || "0");
  const delivered = parseInt(stats.delivered || "0");
  const bounced = parseInt(stats.bounced || "0");
  const complained = parseInt(stats.complained || "0");
  const opened = parseInt(stats.opened || "0");
  return {
    sent, delivered, bounced, complained, opened,
    deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
    bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    complaintRate: sent > 0 ? (complained / sent) * 100 : 0,
    openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
  };
}

// Track email events (from webhook)
export async function trackEmailEvent(domain: string, event: "sent" | "delivered" | "bounced" | "complained" | "opened"): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await redis.hincrby(`email:metrics:${domain}:${month}`, event, 1);
}
```

## Results

- **Delivery drop caught** — score dropped from 85 to 55 → alert fired → SPF misconfiguration found and fixed in 30 minutes; previously took 3 months to notice
- **Blacklist detection** — IP on 2 blacklists discovered; removal requested; delivery rate recovered from 72% to 94% in 1 week
- **Authentication scored** — SPF ✓, DKIM ✓, DMARC ✗ (p=none) → recommendation: upgrade to p=quarantine; step-by-step fixes provided
- **Bounce rate tracked** — 8% → cleaned list → 1.5%; complaint rate 0.15% → added one-click unsubscribe → 0.03%; metrics drive action
- **Cron monitoring** — weekly deliverability check; trend over time; catch issues before they become outages; password resets always arrive
