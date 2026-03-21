---
title: "Build Product Analytics with PostHog"
description: "Set up a complete product analytics stack — funnel analysis, session recordings, retention curves, and feature flags for gradual rollouts — without paying Mixpanel or Amplitude prices."
skills: [posthog]
difficulty: beginner
time_estimate: "3 hours"
tags: [analytics, posthog, funnels, retention, feature-flags, session-recording, product-management]
---

# Build Product Analytics with PostHog

Your product is live. You have users. You have no idea what they actually do inside the app. You're guessing what to build next. PostHog gives you Mixpanel + Amplitude + LaunchDarkly in one open-source tool — at a fraction of the cost, with your data on your own infra if you want.

## What You'll Build

- PostHog cloud or self-hosted setup
- User identification and event tracking with rich properties
- Funnel analysis: signup → activation → retention
- Session recordings: watch real users navigate your app
- Feature flags: gradual rollout, A/B test new features
- Retention curves: daily/weekly user retention

## Architecture

```
User actions in app
  → posthog.capture() or PostHog SDK auto-capture
  → PostHog cloud or self-hosted instance
  → Funnels, retention, cohorts, dashboards
  → Feature flags: backend checks flag → show/hide feature
  → Session recordings: stored in PostHog, watch in dashboard
```

## Step 1: Install and Initialize

```bash
npm install posthog-js         # frontend (React/Next.js)
npm install posthog-node       # backend (Node.js API routes)
```

```typescript
// lib/posthog.ts — PostHog Node client (backend)
import { PostHog } from "posthog-node";

export const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
  flushAt: 20,
  flushInterval: 10000,
});

// Graceful shutdown in serverless
export async function flushPosthog() {
  await posthog.shutdown();
}
```

```typescript
// app/providers.tsx — PostHog frontend provider
"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      session_recording: { maskAllInputs: true }, // mask passwords etc.
    });
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
```

## Step 2: Identify Users

Always identify users after login. This links anonymous events to a person.

```typescript
// Frontend: after login
import { usePostHog } from "posthog-js/react";

export function useIdentifyUser() {
  const posthog = usePostHog();

  return (user: { id: string; email: string; name: string; plan: string; createdAt: Date }) => {
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan,
      created_at: user.createdAt.toISOString(),
    });

    // Set group (org-level analytics)
    posthog.group("company", user.id, {
      name: user.name,
      plan: user.plan,
    });
  };
}
```

```typescript
// Backend: identify after signup
import { posthog } from "@/lib/posthog";

export async function onUserSignup(user: { id: string; email: string; plan: string }) {
  posthog.identify({
    distinctId: user.id,
    properties: {
      email: user.email,
      plan: user.plan,
      signup_source: "organic",
    },
  });

  posthog.capture({
    distinctId: user.id,
    event: "user_signed_up",
    properties: {
      plan: user.plan,
      $set: { plan: user.plan }, // also update person properties
    },
  });
}
```

## Step 3: Track Key Events

Design your event taxonomy before you start — it's hard to rename events later.

```typescript
// lib/analytics-events.ts — type-safe event tracking
import { usePostHog } from "posthog-js/react";

export function useAnalytics() {
  const posthog = usePostHog();

  return {
    // Activation events
    projectCreated: (projectId: string, template: string) =>
      posthog.capture("project_created", { project_id: projectId, template }),

    onboardingCompleted: (steps: string[]) =>
      posthog.capture("onboarding_completed", { steps_completed: steps }),

    // Core feature usage
    featureUsed: (feature: string, properties?: Record<string, unknown>) =>
      posthog.capture("feature_used", { feature, ...properties }),

    // Engagement
    documentExported: (format: string, pageCount: number) =>
      posthog.capture("document_exported", { format, page_count: pageCount }),

    // Conversion
    upgradeClicked: (fromPlan: string, location: string) =>
      posthog.capture("upgrade_clicked", { from_plan: fromPlan, location }),

    subscriptionStarted: (plan: string, interval: string) =>
      posthog.capture("subscription_started", { plan, interval }),
  };
}
```

## Step 4: Feature Flags

Control rollouts without code deploys. Test new features on 10% of users first.

```typescript
// Backend: check feature flag in API route
import { posthog } from "@/lib/posthog";

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);

  const isEnabled = await posthog.isFeatureEnabled("new-editor-v2", userId);

  return Response.json({
    features: {
      newEditor: isEnabled,
    },
  });
}

// Multi-variant flag: A/B test
export async function getEditorVariant(userId: string): Promise<"control" | "variant_a" | "variant_b"> {
  const variant = await posthog.getFeatureFlag("editor-experiment", userId);
  return (variant as "control" | "variant_a" | "variant_b") ?? "control";
}
```

```typescript
// Frontend: use feature flag in component
import { useFeatureFlagEnabled } from "posthog-js/react";

export function Editor() {
  const isNewEditor = useFeatureFlagEnabled("new-editor-v2");

  if (isNewEditor) {
    return <NewEditorV2 />;
  }
  return <EditorV1 />;
}
```

## Step 5: Define Key Funnels in PostHog

Set up these funnels in PostHog UI (Insights → Funnels):

**Signup → Activation Funnel:**
```
user_signed_up
→ project_created          (within 1 day)
→ feature_used             (within 7 days)
→ subscription_started     (within 30 days)
```

**Upgrade Funnel:**
```
upgrade_clicked
→ checkout_started         (within 1 hour)
→ subscription_started     (within 1 hour)
```

**Onboarding Completion:**
```
user_signed_up
→ onboarding_completed     (within 3 days)
```

## Step 6: Server-Side Event Tracking for Critical Actions

Some events must be tracked server-side (payments, cancellations) to ensure accuracy:

```typescript
// Middleware or API route — track on every authenticated request
export async function trackPageView(req: Request, userId: string, path: string) {
  // Only track app paths, not API calls
  if (path.startsWith("/api")) return;

  posthog.capture({
    distinctId: userId,
    event: "$pageview",
    properties: {
      $current_url: `${process.env.APP_URL}${path}`,
      $pathname: path,
    },
  });
}

// After successful payment
export async function trackSubscriptionEvent(
  userId: string,
  eventType: "started" | "upgraded" | "canceled",
  plan: string,
  mrr: number
) {
  posthog.capture({
    distinctId: userId,
    event: `subscription_${eventType}`,
    properties: { plan, mrr, currency: "USD" },
  });
}
```

## Step 7: Retention Analysis Setup

In PostHog UI: Insights → Retention. Configure:

- **Cohort event (entry):** `user_signed_up`
- **Return event:** `feature_used` or `$pageview`
- **Retention type:** Recurring (DAU/WAU/MAU)
- **Period:** Weekly

This shows what % of users who signed up in week 1 came back in weeks 2, 3, 4...

## Environment Variables

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
# For self-hosted:
# NEXT_PUBLIC_POSTHOG_HOST=https://posthog.yourcompany.com
```

## Self-Hosted Option

```bash
# Docker Compose self-hosted PostHog
git clone https://github.com/PostHog/posthog.git
cd posthog
docker compose -f docker-compose.yml up -d
# Access at localhost:8000
```

## Launch Checklist

- [ ] PostHog key added to env (cloud or self-hosted)
- [ ] `identify()` called after every login
- [ ] Anonymous → identified user linking tested
- [ ] 5–10 key events tracked across core flows
- [ ] Session recording enabled and reviewed
- [ ] Signup → activation funnel set up in dashboard
- [ ] One feature flag live (even if 100% rollout)
- [ ] Retention chart showing week-over-week data

## What's Next

- Cohort analysis: compare retention by plan or signup source
- Heatmaps: click density on key pages
- Surveys: in-app NPS or churn reason surveys
- Correlation analysis: which features predict retention?
- Alert when activation rate drops below threshold
