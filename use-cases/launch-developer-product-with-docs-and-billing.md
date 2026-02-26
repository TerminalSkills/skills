---
title: Launch a Developer Product with Docs, Billing, and Feedback
slug: launch-developer-product-with-docs-and-billing
description: Set up the complete go-to-market stack for a developer product — Mintlify for docs, Polar for billing, Infisical for secrets, and Formbricks for user feedback.
skills:
  - mintlify
  - polar
  - infisical
  - formbricks
category: development
tags:
  - developer-tools
  - documentation
  - billing
  - launch
  - saas
---

## The Problem

Alex built an API product and it's ready for users. The code works, but the business infrastructure doesn't exist: no documentation, no billing, no way to collect feedback, and secrets are hardcoded in environment variables across three deployment environments. Alex needs to go from "working code" to "paying customers can self-serve" in a week, without building billing UI, documentation CMS, or survey tools from scratch.

## The Solution

Stand up the complete developer product stack using purpose-built tools: Mintlify for beautiful docs with interactive API playground, Polar for subscriptions and usage-based billing, Infisical for secrets management across environments, and Formbricks for in-app user feedback. All open-source or developer-friendly, all with APIs for automation.

## Step-by-Step Walkthrough

### Step 1: Documentation with Mintlify

Developer products live or die by their docs. Set up Mintlify for an API reference with an interactive playground — users can try the API before signing up.

```json
// docs/mint.json — Documentation site configuration
{
  "name": "DataForge API",
  "logo": { "dark": "/logo/dark.svg", "light": "/logo/light.svg" },
  "favicon": "/favicon.svg",
  "colors": { "primary": "#6366F1", "light": "#818CF8", "dark": "#4F46E5" },
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart", "authentication"]
    },
    {
      "group": "API Reference",
      "pages": [
        "api-reference/overview",
        { "group": "Data Sources", "pages": ["api-reference/sources/list", "api-reference/sources/create", "api-reference/sources/sync"] },
        { "group": "Transforms", "pages": ["api-reference/transforms/run", "api-reference/transforms/schedule"] }
      ]
    },
    { "group": "Guides", "pages": ["guides/webhooks", "guides/rate-limits", "guides/errors"] }
  ],
  "api": {
    "baseUrl": "https://api.dataforge.dev",
    "auth": { "method": "bearer", "name": "API Key" }
  },
  "tabs": [
    { "name": "Docs", "url": "/" },
    { "name": "API Reference", "url": "api-reference" }
  ]
}
```

```mdx
// docs/quickstart.mdx — Getting started guide
---
title: "Quickstart"
description: "Start syncing data in under 5 minutes"
---

## Get your API key

Create an account at [dashboard.dataforge.dev](https://dashboard.dataforge.dev) and copy your API key from Settings.

<Note>
  Free tier includes 10,000 API calls/month. No credit card required.
</Note>

## Install the SDK

<CodeGroup>
```bash npm
npm install @dataforge/sdk
```
```bash pip
pip install dataforge
```
</CodeGroup>

## Create your first data source

<Steps>
  <Step title="Initialize the client">
    ```typescript
    import { DataForge } from "@dataforge/sdk";
    const df = new DataForge({ apiKey: process.env.DATAFORGE_API_KEY });
    ```
  </Step>
  <Step title="Connect a data source">
    ```typescript
    const source = await df.sources.create({
      name: "Production DB",
      type: "postgresql",
      connectionString: "postgresql://...",
    });
    console.log(`Connected: ${source.id}`);
    ```
  </Step>
  <Step title="Run your first sync">
    ```typescript
    const sync = await df.sources.sync(source.id);
    console.log(`Synced ${sync.rowCount} rows in ${sync.durationMs}ms`);
    ```
  </Step>
</Steps>
```

### Step 2: Billing with Polar

Set up subscription tiers and usage-based billing — Polar handles checkout, invoicing, and tax.

```typescript
// src/billing/setup.ts — Create products and pricing on Polar
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

// Free tier — no payment required
const freePlan = await polar.products.create({
  name: "Free",
  description: "10,000 API calls/month, 1 data source",
  prices: [{ type: "recurring", amount: 0, currency: "usd", interval: "month" }],
});

// Pro tier
const proPlan = await polar.products.create({
  name: "Pro",
  description: "100,000 API calls/month, unlimited sources, priority support",
  prices: [
    { type: "recurring", amount: 4900, currency: "usd", interval: "month" },
    { type: "recurring", amount: 49000, currency: "usd", interval: "year" },
  ],
});

// Enterprise — usage-based
const enterprisePlan = await polar.products.create({
  name: "Enterprise",
  description: "Unlimited calls, $0.001 per call after 500K, SLA, SSO",
  prices: [{ type: "recurring", amount: 29900, currency: "usd", interval: "month" }],
});
```

```typescript
// src/billing/middleware.ts — Check subscription in API middleware
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

async function checkSubscription(apiKey: string): Promise<{
  plan: "free" | "pro" | "enterprise";
  callsRemaining: number;
}> {
  const customer = await getCustomerByApiKey(apiKey);
  const subscription = await polar.subscriptions.list({
    customerId: customer.polarId,
    active: true,
  });

  const plan = subscription.items[0]?.product.name.toLowerCase() || "free";
  const limits = { free: 10_000, pro: 100_000, enterprise: Infinity };

  const usage = await getMonthlyUsage(customer.id);
  return {
    plan: plan as any,
    callsRemaining: limits[plan] - usage,
  };
}
```

### Step 3: Secrets Management with Infisical

```bash
# Move from .env files to centralized secrets
infisical init --project=dataforge

# Import existing secrets
infisical secrets set \
  DATABASE_URL="postgresql://..." \
  POLAR_ACCESS_TOKEN="pat_xxx" \
  FORMBRICKS_API_KEY="fbk_xxx" \
  --env=production

# Development
infisical secrets set \
  DATABASE_URL="postgresql://localhost/dataforge_dev" \
  --env=development

# Update your start scripts
# Before: source .env && npm start
# After:
infisical run --env=production -- npm start
```

### Step 4: In-App Feedback with Formbricks

```typescript
// src/dashboard/feedback.tsx — Collect feedback at the right moments
import formbricks from "@formbricks/js/app";

// Initialize on dashboard load
formbricks.init({
  environmentId: process.env.NEXT_PUBLIC_FORMBRICKS_ENV_ID!,
  apiHost: "https://feedback.dataforge.dev",
});

// After first successful sync — ask about onboarding experience
function SyncSuccess({ syncResult }) {
  useEffect(() => {
    if (syncResult.isFirstSync) {
      formbricks.track("first_sync_completed", {
        sourceType: syncResult.sourceType,
        rowCount: syncResult.rowCount,
      });
    }
  }, []);
  // ...
}

// After 30 days — NPS survey
function DashboardLayout({ user }) {
  useEffect(() => {
    formbricks.setUserId(user.id);
    formbricks.setAttributes({
      plan: user.plan,
      signupDate: user.createdAt,
      totalSyncs: user.totalSyncs,
    });
  }, []);
  // ...
}
```

## The Outcome

Alex launches DataForge in 5 days. The docs site at docs.dataforge.dev looks polished with an interactive API playground — users test endpoints before writing a single line of code. Polar handles billing: 3 tiers, usage tracking, checkout, and tax compliance across 40 countries. Secrets live in Infisical instead of scattered .env files. Formbricks collects feedback at critical moments — after first sync (89% positive), after 30 days (NPS: 62), and on cancellation (top reason: "only needed it for a one-time migration"). Within the first month: 340 signups, 28 paid conversions, $1,372 MRR.
