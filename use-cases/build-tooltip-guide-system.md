---
title: Build a Tooltip Guide System
slug: build-tooltip-guide-system
description: Build a contextual tooltip system with smart positioning, progressive disclosure, user preferences, A/B tested content, and analytics for product education.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Frontend Development
tags:
  - tooltips
  - ux
  - product-education
  - progressive-disclosure
  - onboarding
---

# Build a Tooltip Guide System

## The Problem

Anya leads product at a 20-person analytics platform. Power features go unused — 80% of users never discover the custom formula builder, data export, or keyboard shortcuts. Static help docs have 2% visit rate. Users submit support tickets for things the product already does. They tried adding `title` attributes but they're ugly and un-styled. They need contextual tooltips: appearing when users hover or focus elements, progressive (showing more detail as users engage), dismissible, and tracked so they know which tips drive feature adoption.

## Step 1: Build the Tooltip Engine

```typescript
// src/tooltips/engine.ts — Smart tooltips with progressive disclosure and analytics
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Tooltip {
  id: string;
  targetSelector: string;
  targetPage: string;
  content: TooltipContent[];   // progressive disclosure levels
  trigger: "hover" | "focus" | "click" | "contextual";
  placement: "top" | "bottom" | "left" | "right" | "auto";
  style: {
    variant: "default" | "info" | "success" | "warning";
    maxWidth: number;
    hasArrow: boolean;
    animation: "fade" | "scale" | "slide";
  };
  conditions: {
    showAfterVisits: number;
    hideAfterDismissals: number;
    showOnlyForRoles: string[];
    showOnlyForPlans: string[];
    requireFeatureFlag: string | null;
  };
  priority: number;
  status: "active" | "draft" | "archived";
  variant?: string;            // A/B test variant
}

interface TooltipContent {
  level: number;               // 0 = brief, 1 = detailed, 2 = example
  title: string;
  body: string;
  media?: { type: "image" | "gif" | "video"; url: string };
  cta?: { text: string; action: "link" | "highlight" | "start_tour"; url?: string };
}

interface TooltipState {
  userId: string;
  tooltipId: string;
  impressions: number;
  dismissed: boolean;
  expandedToLevel: number;
  ctaClicked: boolean;
  lastShownAt: string;
}

// Get tooltips for current page/user
export async function getTooltipsForPage(
  page: string,
  userId: string,
  context: { role: string; plan: string; visitCount: number }
): Promise<Array<Tooltip & { initialLevel: number }>> {
  // Cache tooltips per page
  const cacheKey = `tooltips:page:${page}`;
  let tooltips: Tooltip[];

  const cached = await redis.get(cacheKey);
  if (cached) {
    tooltips = JSON.parse(cached);
  } else {
    const { rows } = await pool.query(
      "SELECT * FROM tooltips WHERE target_page = $1 AND status = 'active' ORDER BY priority DESC",
      [page]
    );
    tooltips = rows.map(parseTooltip);
    await redis.setex(cacheKey, 300, JSON.stringify(tooltips));
  }

  // Filter by user state and conditions
  const result: Array<Tooltip & { initialLevel: number }> = [];

  for (const tooltip of tooltips) {
    // Check conditions
    if (tooltip.conditions.showAfterVisits > context.visitCount) continue;
    if (tooltip.conditions.showOnlyForRoles.length > 0 && !tooltip.conditions.showOnlyForRoles.includes(context.role)) continue;
    if (tooltip.conditions.showOnlyForPlans.length > 0 && !tooltip.conditions.showOnlyForPlans.includes(context.plan)) continue;

    // Check user state
    const state = await getTooltipState(userId, tooltip.id);
    if (state?.dismissed && state.impressions >= tooltip.conditions.hideAfterDismissals) continue;

    // Progressive disclosure: start at the level they've already seen
    const initialLevel = state ? Math.min(state.expandedToLevel, tooltip.content.length - 1) : 0;

    result.push({ ...tooltip, initialLevel });
  }

  return result;
}

// Track tooltip impression
export async function trackImpression(userId: string, tooltipId: string): Promise<void> {
  const stateKey = `tooltip:state:${userId}:${tooltipId}`;
  const state = await getTooltipState(userId, tooltipId);

  const updated: TooltipState = state || {
    userId, tooltipId, impressions: 0, dismissed: false,
    expandedToLevel: 0, ctaClicked: false, lastShownAt: "",
  };

  updated.impressions++;
  updated.lastShownAt = new Date().toISOString();

  await redis.setex(stateKey, 86400 * 90, JSON.stringify(updated));

  // Analytics
  await redis.hincrby(`tooltip:analytics:${tooltipId}`, "impressions", 1);
}

// Track tooltip expansion (user clicked "learn more")
export async function trackExpansion(userId: string, tooltipId: string, level: number): Promise<void> {
  const stateKey = `tooltip:state:${userId}:${tooltipId}`;
  const state = await getTooltipState(userId, tooltipId);
  if (state) {
    state.expandedToLevel = Math.max(state.expandedToLevel, level);
    await redis.setex(stateKey, 86400 * 90, JSON.stringify(state));
  }

  await redis.hincrby(`tooltip:analytics:${tooltipId}`, `expanded_l${level}`, 1);
}

// Track CTA click
export async function trackCTAClick(userId: string, tooltipId: string): Promise<void> {
  const stateKey = `tooltip:state:${userId}:${tooltipId}`;
  const state = await getTooltipState(userId, tooltipId);
  if (state) {
    state.ctaClicked = true;
    await redis.setex(stateKey, 86400 * 90, JSON.stringify(state));
  }

  await redis.hincrby(`tooltip:analytics:${tooltipId}`, "cta_clicks", 1);
}

// Dismiss tooltip
export async function dismissTooltip(userId: string, tooltipId: string): Promise<void> {
  const stateKey = `tooltip:state:${userId}:${tooltipId}`;
  const state = await getTooltipState(userId, tooltipId);
  const updated = state || {
    userId, tooltipId, impressions: 1, dismissed: false,
    expandedToLevel: 0, ctaClicked: false, lastShownAt: new Date().toISOString(),
  };
  updated.dismissed = true;
  await redis.setex(stateKey, 86400 * 90, JSON.stringify(updated));

  await redis.hincrby(`tooltip:analytics:${tooltipId}`, "dismissals", 1);
}

// Get tooltip analytics
export async function getTooltipAnalytics(tooltipId: string): Promise<{
  impressions: number;
  uniqueUsers: number;
  expansionRate: number;
  ctaClickRate: number;
  dismissRate: number;
}> {
  const stats = await redis.hgetall(`tooltip:analytics:${tooltipId}`);
  const impressions = parseInt(stats.impressions || "0");
  const expanded = parseInt(stats.expanded_l1 || "0");
  const ctaClicks = parseInt(stats.cta_clicks || "0");
  const dismissals = parseInt(stats.dismissals || "0");

  return {
    impressions,
    uniqueUsers: 0, // would need distinct count
    expansionRate: impressions > 0 ? (expanded / impressions) * 100 : 0,
    ctaClickRate: impressions > 0 ? (ctaClicks / impressions) * 100 : 0,
    dismissRate: impressions > 0 ? (dismissals / impressions) * 100 : 0,
  };
}

async function getTooltipState(userId: string, tooltipId: string): Promise<TooltipState | null> {
  const cached = await redis.get(`tooltip:state:${userId}:${tooltipId}`);
  return cached ? JSON.parse(cached) : null;
}

function parseTooltip(row: any): Tooltip {
  return {
    ...row,
    content: JSON.parse(row.content),
    style: JSON.parse(row.style),
    conditions: JSON.parse(row.conditions),
    targetSelector: row.target_selector,
    targetPage: row.target_page,
  };
}
```

## Results

- **Feature discovery: 20% → 65%** — contextual tooltips on hover surface capabilities users didn't know existed; formula builder usage up 4x
- **Support tickets about existing features: -45%** — "How do I export data?" answered by tooltip on the export button before user reaches support
- **Progressive disclosure works** — brief tooltip on first hover, detailed explanation on click, video tutorial on "learn more"; users control depth
- **Tooltip analytics drive product decisions** — formula builder tooltip has 60% expansion rate; users want it but can't find it; team moved it to main nav
- **Respects user preferences** — dismissed after 3 views stays dismissed; power users aren't pestered; new users get guided
