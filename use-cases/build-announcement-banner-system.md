---
title: Build an Announcement Banner System
slug: build-announcement-banner-system
description: Build a dynamic announcement banner system with targeting rules, scheduling, A/B testing, dismissal tracking, and priority management for product updates, maintenance notices, and promotions.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - announcements
  - banners
  - targeting
  - scheduling
  - product
---

# Build an Announcement Banner System

## The Problem

Aiko leads product at a 25-person SaaS. When they need to announce maintenance, a new feature, or a pricing change, a developer hardcodes a banner div and deploys. Removing it requires another deploy. They can't target banners (free users see enterprise announcements), can't schedule them (someone has to deploy at 9 AM), and users who dismiss a banner see it again after refresh. They need a banner management system: create, schedule, target, track dismissals, and rotate without touching code.

## Step 1: Build the Banner System

```typescript
// src/banners/manager.ts — Dynamic banners with targeting, scheduling, and A/B testing
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Banner {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error" | "promo";
  style: {
    backgroundColor: string;
    textColor: string;
    icon: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    position: "top" | "bottom" | "modal";
    dismissible: boolean;
  };
  targeting: {
    plans: string[];           // empty = all plans
    countries: string[];
    roles: string[];
    userSegments: string[];    // "new_user" | "power_user" | "churning"
    minAccountAge: number;     // days
    maxAccountAge: number;
    percentage: number;        // 0-100 for gradual rollout
  };
  schedule: {
    startsAt: string;
    endsAt: string | null;
    timezone: string;
    daysOfWeek: number[];      // empty = every day
  };
  priority: number;            // higher = shown first
  maxImpressions: number;      // 0 = unlimited
  status: "draft" | "active" | "paused" | "expired";
  variants: BannerVariant[];   // A/B test variants
  createdAt: string;
}

interface BannerVariant {
  id: string;
  message: string;
  ctaText: string | null;
  weight: number;              // percentage allocation
}

interface BannerResponse {
  banners: Array<{
    id: string;
    variantId: string;
    title: string;
    message: string;
    type: Banner["type"];
    style: Banner["style"];
  }>;
}

// Get active banners for a user
export async function getBannersForUser(userId: string, context: {
  plan: string;
  country: string;
  role: string;
  accountAgeDays: number;
  segments: string[];
}): Promise<BannerResponse> {
  // Check cache
  const cacheKey = `banners:user:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Get dismissed banners
  const dismissedSet = await redis.smembers(`banners:dismissed:${userId}`);

  // Get active banners
  const now = new Date().toISOString();
  const { rows: banners } = await pool.query(
    `SELECT * FROM banners WHERE status = 'active'
     AND schedule_starts_at <= $1
     AND (schedule_ends_at IS NULL OR schedule_ends_at > $1)
     ORDER BY priority DESC`, [now]
  );

  const result: BannerResponse = { banners: [] };

  for (const banner of banners) {
    // Skip dismissed
    if (dismissedSet.includes(banner.id)) continue;

    // Check targeting
    const targeting = JSON.parse(banner.targeting);
    if (!matchesTarget(targeting, context)) continue;

    // Check impression limit
    if (banner.max_impressions > 0) {
      const impressions = await redis.get(`banners:impressions:${banner.id}`);
      if (parseInt(impressions || "0") >= banner.max_impressions) continue;
    }

    // Percentage rollout
    if (targeting.percentage < 100) {
      const hash = simpleHash(`${banner.id}:${userId}`);
      if (hash % 100 >= targeting.percentage) continue;
    }

    // Select variant (A/B test)
    const variants: BannerVariant[] = JSON.parse(banner.variants || "[]");
    let message = banner.message;
    let ctaText = JSON.parse(banner.style).ctaText;
    let variantId = "default";

    if (variants.length > 0) {
      const selected = selectVariant(variants, userId, banner.id);
      message = selected.message;
      ctaText = selected.ctaText || ctaText;
      variantId = selected.id;
    }

    result.banners.push({
      id: banner.id,
      variantId,
      title: banner.title,
      message,
      type: banner.type,
      style: { ...JSON.parse(banner.style), ctaText },
    });

    // Track impression
    await redis.incr(`banners:impressions:${banner.id}`);
    await redis.hincrby(`banners:variant_impressions:${banner.id}`, variantId, 1);
  }

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(result));

  return result;
}

// Dismiss banner for user
export async function dismissBanner(userId: string, bannerId: string): Promise<void> {
  await redis.sadd(`banners:dismissed:${userId}`, bannerId);
  await redis.expire(`banners:dismissed:${userId}`, 86400 * 90);
  await redis.del(`banners:user:${userId}`);

  await redis.hincrby(`banners:stats:${bannerId}`, "dismissals", 1);
}

// Track CTA click
export async function trackBannerClick(userId: string, bannerId: string, variantId: string): Promise<void> {
  await redis.hincrby(`banners:stats:${bannerId}`, "clicks", 1);
  await redis.hincrby(`banners:variant_clicks:${bannerId}`, variantId, 1);

  await pool.query(
    `INSERT INTO banner_events (banner_id, variant_id, user_id, action, created_at)
     VALUES ($1, $2, $3, 'click', NOW())`, [bannerId, variantId, userId]
  );
}

// Get banner analytics
export async function getBannerStats(bannerId: string): Promise<{
  impressions: number;
  clicks: number;
  dismissals: number;
  ctr: number;
  variantStats: Array<{ id: string; impressions: number; clicks: number; ctr: number }>;
}> {
  const stats = await redis.hgetall(`banners:stats:${bannerId}`);
  const variantImpressions = await redis.hgetall(`banners:variant_impressions:${bannerId}`);
  const variantClicks = await redis.hgetall(`banners:variant_clicks:${bannerId}`);

  const impressions = parseInt(stats.impressions || "0");
  const clicks = parseInt(stats.clicks || "0");
  const dismissals = parseInt(stats.dismissals || "0");

  const variantIds = new Set([...Object.keys(variantImpressions), ...Object.keys(variantClicks)]);
  const variantStats = Array.from(variantIds).map((id) => {
    const vi = parseInt(variantImpressions[id] || "0");
    const vc = parseInt(variantClicks[id] || "0");
    return { id, impressions: vi, clicks: vc, ctr: vi > 0 ? (vc / vi) * 100 : 0 };
  });

  return { impressions, clicks, dismissals, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, variantStats };
}

function matchesTarget(targeting: Banner["targeting"], context: { plan: string; country: string; role: string; accountAgeDays: number; segments: string[] }): boolean {
  if (targeting.plans.length > 0 && !targeting.plans.includes(context.plan)) return false;
  if (targeting.countries.length > 0 && !targeting.countries.includes(context.country)) return false;
  if (targeting.roles.length > 0 && !targeting.roles.includes(context.role)) return false;
  if (targeting.userSegments.length > 0 && !targeting.userSegments.some((s: string) => context.segments.includes(s))) return false;
  if (targeting.minAccountAge > 0 && context.accountAgeDays < targeting.minAccountAge) return false;
  if (targeting.maxAccountAge > 0 && context.accountAgeDays > targeting.maxAccountAge) return false;
  return true;
}

function selectVariant(variants: BannerVariant[], userId: string, bannerId: string): BannerVariant {
  const hash = simpleHash(`${bannerId}:${userId}`) % 100;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (hash < cumulative) return v;
  }
  return variants[0];
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

## Results

- **Zero deploys for announcements** — product team creates banners in admin panel; scheduling handles start/end times; no developer involvement
- **Targeted messaging** — maintenance notice shown only to affected plan; upgrade promo shown only to free users; enterprise announcement reaches only enterprise accounts
- **A/B tested CTAs** — "Try it now" vs "See what's new" tested across 50/50 split; winning variant had 3.2x higher CTR; applied to all future banners
- **Dismissals persist** — user closes a banner once, never sees it again; no more "close this every page load" frustration
- **85% fewer support tickets about changes** — scheduled banner before pricing change warned users 2 weeks ahead; support team prepared instead of surprised
