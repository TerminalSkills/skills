---
title: "Build Customer Journey Analytics"
description: "Track every user touchpoint from first visit to churn. Build funnel analysis, cohort retention charts, journey maps, and segment power users vs at-risk accounts."
skills: [posthog, prisma]
difficulty: advanced
time_estimate: "6 hours"
tags: [analytics, customer-journey, posthog, prisma, funnel, cohorts, retention, churn, growth]
---

# Build Customer Journey Analytics

**Persona:** You're a growth engineer at a B2B SaaS. 70% of trial users don't convert — and you have no idea why. Are they stuck at setup? Not finding value? Leaving to competitors? You need to see every step users take before they convert or churn, then identify the patterns.

---

## What You'll Build

- **Event tracking:** structured events from frontend, backend, and API
- **Journey maps:** visualize paths users take before converting/churning
- **Funnel analysis:** conversion rates and drop-off per step
- **Cohort analysis:** retention by signup week
- **Segments:** power users, at-risk, dormant, champions

---

## Data Model (Prisma)

```prisma
// prisma/schema.prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  signedUpAt  DateTime @default(now())
  plan        String?  @default("trial")
  convertedAt DateTime?
  churned     Boolean  @default(false)
  churnedAt   DateTime?
  events      Event[]
}

model Event {
  id         String   @id @default(cuid())
  userId     String
  name       String
  properties Json     @default("{}")
  sessionId  String?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([name, createdAt])
}
```

---

## Step 1: Event Tracking Setup

Track events from multiple sources and mirror to PostHog:

```ts
// lib/analytics.ts
import { PostHog } from 'posthog-node';
import { prisma } from './prisma';

const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
});

export interface TrackOptions {
  userId: string;
  event: string;
  properties?: Record<string, any>;
  sessionId?: string;
}

export async function track({ userId, event, properties = {}, sessionId }: TrackOptions) {
  // Store in own DB for custom queries
  await prisma.event.create({
    data: { userId, name: event, properties, sessionId },
  });

  // Mirror to PostHog for UI and funnels
  posthog.capture({
    distinctId: userId,
    event,
    properties: { ...properties, $session_id: sessionId },
  });
}

// Flush on serverless shutdown
export async function flushAnalytics() {
  await posthog.shutdown();
}
```

---

## Step 2: Structured Event Taxonomy

Define events as constants to avoid typos:

```ts
// lib/events.ts
export const Events = {
  // Acquisition
  SIGNED_UP: 'signed_up',
  INVITED_BY: 'invited_by',

  // Activation (the "aha moment" funnel)
  ONBOARDING_STARTED: 'onboarding_started',
  WORKSPACE_CREATED: 'workspace_created',
  FIRST_ITEM_CREATED: 'first_item_created',
  FIRST_INTEGRATION_CONNECTED: 'first_integration_connected',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Engagement
  FEATURE_USED: 'feature_used',
  FILE_UPLOADED: 'file_uploaded',
  TEAM_MEMBER_INVITED: 'team_member_invited',
  REPORT_GENERATED: 'report_generated',
  API_CALL_MADE: 'api_call_made',

  // Monetization
  TRIAL_EXTENDED: 'trial_extended',
  UPGRADE_PAGE_VIEWED: 'upgrade_page_viewed',
  PLAN_UPGRADED: 'plan_upgraded',

  // Retention / Churn signals
  SESSION_STARTED: 'session_started',
  EXPORT_DOWNLOADED: 'export_downloaded',
  CANCELLATION_STARTED: 'cancellation_started',
  ACCOUNT_DELETED: 'account_deleted',
} as const;
```

Usage in your app:

```ts
// In your API routes or server actions
await track({
  userId: session.userId,
  event: Events.FIRST_ITEM_CREATED,
  properties: { itemType: 'project', source: 'dashboard' },
});
```

---

## Step 3: Funnel Analysis

Calculate conversion rates for your activation funnel:

```ts
// lib/funnel.ts
import { prisma } from './prisma';
import { Events } from './events';

const ACTIVATION_FUNNEL = [
  Events.SIGNED_UP,
  Events.ONBOARDING_STARTED,
  Events.WORKSPACE_CREATED,
  Events.FIRST_ITEM_CREATED,
  Events.ONBOARDING_COMPLETED,
];

export async function getFunnelAnalysis(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    ACTIVATION_FUNNEL.map(async (step, i) => {
      if (i === 0) {
        const count = await prisma.user.count({ where: { signedUpAt: { gte: since } } });
        return { step, count };
      }

      // Users who completed this step AND all prior steps
      const priorStep = ACTIVATION_FUNNEL[i - 1];
      const usersWithPrior = await prisma.event.findMany({
        where: { name: priorStep, createdAt: { gte: since } },
        select: { userId: true },
        distinct: ['userId'],
      });
      const priorUserIds = usersWithPrior.map(e => e.userId);

      const count = await prisma.event.count({
        where: { name: step, userId: { in: priorUserIds }, createdAt: { gte: since } },
      });

      return { step, count };
    })
  );

  // Calculate drop-off
  return results.map((r, i) => ({
    step: r.step,
    count: r.count,
    conversionFromPrev: i === 0 ? 100 : Math.round(r.count / results[i - 1].count * 100),
    dropOff: i === 0 ? 0 : results[i - 1].count - r.count,
  }));
}
```

---

## Step 4: Cohort Retention Analysis

Retention by signup week — the classic SaaS health metric:

```ts
// lib/cohorts.ts
import { prisma } from './prisma';
import { startOfWeek, addWeeks, format } from 'date-fns';

export async function getCohortRetention(weeksBack = 8) {
  const cohorts = [];

  for (let w = weeksBack; w >= 0; w--) {
    const cohortStart = startOfWeek(new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000));
    const cohortEnd = addWeeks(cohortStart, 1);

    const cohortUsers = await prisma.user.findMany({
      where: { signedUpAt: { gte: cohortStart, lt: cohortEnd } },
      select: { id: true },
    });

    if (!cohortUsers.length) continue;
    const userIds = cohortUsers.map(u => u.id);

    // Check activity in each subsequent week
    const weeklyRetention = [];
    for (let wk = 0; wk <= w; wk++) {
      const weekStart = addWeeks(cohortStart, wk);
      const weekEnd = addWeeks(weekStart, 1);

      const activeCount = await prisma.event.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, createdAt: { gte: weekStart, lt: weekEnd } },
        _count: true,
      });

      weeklyRetention.push({
        week: wk,
        retained: activeCount.length,
        rate: Math.round(activeCount.length / userIds.length * 100),
      });
    }

    cohorts.push({
      cohort: format(cohortStart, 'MMM d'),
      size: userIds.length,
      retention: weeklyRetention,
    });
  }

  return cohorts;
}
```

---

## Step 5: User Segmentation

Automatically classify users into segments:

```ts
// lib/segments.ts
import { prisma } from './prisma';

export async function classifyUsers() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { churned: false },
    include: {
      _count: { select: { events: true } },
      events: { where: { createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  return users.map(user => {
    const lastActive = user.events[0]?.createdAt;
    const daysSinceActive = lastActive ? Math.floor((Date.now() - lastActive.getTime()) / 86400000) : 999;
    const eventCount = user._count.events;

    let segment: 'champion' | 'power_user' | 'active' | 'at_risk' | 'dormant';
    if (eventCount >= 100 && daysSinceActive <= 7) segment = 'champion';
    else if (eventCount >= 30 && daysSinceActive <= 14) segment = 'power_user';
    else if (daysSinceActive <= 14) segment = 'active';
    else if (daysSinceActive <= 30) segment = 'at_risk';
    else segment = 'dormant';

    return { userId: user.id, segment, daysSinceActive, totalEvents: eventCount };
  });
}
```

---

## Step 6: PostHog Dashboard

Use PostHog's built-in UI for journey visualization:

```ts
// In your Next.js app — PostHog provider
// app/providers.tsx
'use client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: '/ingest',  // proxy via next.config.js rewrites
      capture_pageview: false,  // manual control
      session_recording: { maskAllInputs: true },
    });
  }, []);
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
```

---

## Key Outcomes

- See exactly where 70% of trials drop off in your activation funnel
- Weekly cohort retention — track if product improvements stick
- Automatic user segmentation — know who's at risk before they churn
- PostHog for heatmaps + session recordings on top of structured data
- Data lives in your own Prisma DB for custom SQL queries
