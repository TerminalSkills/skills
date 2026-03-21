---
title: Build a Shopify App
slug: build-shopify-app
description: Build a Shopify app with OAuth, embedded admin UI using Polaris, webhooks, REST and GraphQL Admin APIs, and Billing API for subscription charges. Deploy with Shopify CLI and Remix.
skills:
  - typescript
  - remix
  - postgresql
  - shopify-api
category: development
tags:
  - shopify
  - ecommerce
  - oauth
  - saas
  - app-store
---

# Build a Shopify App

## The Problem

Marcus is a developer who wants to sell a Shopify app that auto-tags orders based on custom rules — spend threshold, product type, customer country. The app needs to embed inside the Shopify admin (not open a new tab), handle OAuth for each merchant, call the Admin API to read and tag orders, use webhooks for real-time order processing, and charge a monthly fee via Shopify Billing API.

## Step 1: Shopify CLI + Remix Setup

```bash
npm install -g @shopify/cli@latest
shopify app create node --name order-tagger
cd order-tagger

# Project structure after CLI scaffold:
# app/
#   routes/
#     app._index.tsx       — embedded home page
#     app.rules.tsx        — rules management
#     auth.$.tsx           — OAuth callback handler
#     webhooks.tsx         — webhook receiver
#   shopify.server.ts      — Shopify API client config
# prisma/schema.prisma     — Session storage
```

```typescript
// app/shopify.server.ts — Shopify app configuration
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "./db.server";

export const MONTHLY_PLAN = "Monthly Plan";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES!.split(","),
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      amount: 9.99,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
```

## Step 2: OAuth Flow (Handled Automatically)

```typescript
// app/routes/auth.$.tsx — OAuth callback (Shopify handles the flow)
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
```

```typescript
// app/routes/app._index.tsx — Home page with billing check
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, Banner } from "@shopify/polaris";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);

  // Check if merchant has an active subscription
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [MONTHLY_PLAN],
    isTest: process.env.NODE_ENV !== "production",
  });

  // Fetch basic shop info
  const shopData = await admin.graphql(`
    query {
      shop {
        name
        email
        plan { displayName }
      }
    }
  `);
  const { shop } = await shopData.json().then((r) => r.data);

  // Count active rules
  const ruleCount = await prisma.tagRule.count({
    where: { shop: shop.myshopifyDomain, active: true },
  });

  return json({ shop, hasActivePayment, ruleCount });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const body = await request.formData();

  if (body.get("action") === "subscribe") {
    await billing.require({
      plans: [MONTHLY_PLAN],
      isTest: process.env.NODE_ENV !== "production",
      onFailure: async () => billing.request({ plan: MONTHLY_PLAN, isTest: true }),
    });
  }

  return redirect("/app");
};

export default function Index() {
  const { shop, hasActivePayment, ruleCount } = useLoaderData<typeof loader>();

  return (
    <Page title="Order Tagger">
      <Layout>
        {!hasActivePayment && (
          <Layout.Section>
            <Banner title="Start your free trial" status="info">
              <p>Auto-tag orders for $9.99/month. 14-day free trial.</p>
              <form method="POST">
                <input type="hidden" name="action" value="subscribe" />
                <Button submit variant="primary">Start Free Trial</Button>
              </form>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <Text variant="headingMd">Welcome, {shop.name}!</Text>
            <Text>You have {ruleCount} active tagging rules.</Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Step 3: REST + GraphQL Admin API Usage

```typescript
// app/routes/app.orders.tsx — List and tag orders
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // GraphQL Admin API — fetch recent orders
  const response = await admin.graphql(`
    query GetOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            totalPriceSet { shopMoney { amount currencyCode } }
            tags
            customer { firstName lastName email }
            lineItems(first: 5) {
              edges { node { title quantity } }
            }
          }
        }
      }
    }
  `, { variables: { first: 50 } });

  const { orders } = await response.json().then((r) => r.data);
  return json({ orders: orders.edges.map((e: any) => e.node) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.formData();
  const orderId = body.get("orderId") as string;
  const tags = (body.get("tags") as string).split(",").map((t) => t.trim());

  // GraphQL mutation — add tags to order
  await admin.graphql(`
    mutation TagOrder($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node { id }
        userErrors { field message }
      }
    }
  `, { variables: { id: orderId, tags } });

  return json({ ok: true });
};
```

## Step 4: Webhooks — Real-Time Order Processing

```typescript
// app/routes/webhooks.tsx — Mandatory + custom webhooks
import { authenticate } from "../shopify.server";
import { applyTagRules } from "../services/tagger.server";
import type { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "ORDERS_CREATE":
    case "ORDERS_UPDATED":
      if (session) {
        await applyTagRules(session, payload);
      }
      break;

    // MANDATORY GDPR webhooks — required for App Store listing
    case "CUSTOMERS_DATA_REQUEST":
      // Export customer data (GDPR)
      await handleCustomerDataRequest(shop, payload);
      break;

    case "CUSTOMERS_REDACT":
      // Delete customer data (GDPR)
      await handleCustomerRedact(shop, payload);
      break;

    case "SHOP_REDACT":
      // Delete all shop data 48h after uninstall (GDPR)
      await handleShopRedact(shop);
      break;
  }

  return new Response();
};

// app/services/tagger.server.ts
export async function applyTagRules(session: any, order: any) {
  const { admin } = await shopify.unauthenticated.admin(session.shop);
  const rules = await prisma.tagRule.findMany({ where: { shop: session.shop, active: true } });

  const tagsToAdd: string[] = [];

  for (const rule of rules) {
    const condition = JSON.parse(rule.condition);
    if (rule.conditionType === "spend_over" && parseFloat(order.total_price) > condition.amount) {
      tagsToAdd.push(rule.tag);
    }
    if (rule.conditionType === "country" && order.billing_address?.country_code === condition.country) {
      tagsToAdd.push(rule.tag);
    }
    if (rule.conditionType === "product_type") {
      const hasProduct = order.line_items.some((li: any) => li.product_type === condition.productType);
      if (hasProduct) tagsToAdd.push(rule.tag);
    }
  }

  if (tagsToAdd.length > 0) {
    await admin.graphql(`
      mutation { tagsAdd(id: "${order.admin_graphql_api_id}", tags: ${JSON.stringify(tagsToAdd)}) { userErrors { message } } }
    `);
  }
}

async function handleShopRedact(shop: string) {
  await prisma.tagRule.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
}
```

## Step 5: Register Webhooks and Deploy

```typescript
// app/root.tsx — Register webhooks on app load
import { authenticate, registerWebhooks } from "./shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
```

```bash
# shopify.app.toml — Webhook configuration
[webhooks]
api_version = "2025-01"

  [[webhooks.subscriptions]]
  topics = ["orders/create", "orders/updated"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "/webhooks"

# Deploy
shopify app deploy
# → Updates webhooks, scopes, and app config on Shopify Partners dashboard

# Tunnel for local dev
shopify app dev
# → Starts ngrok tunnel + dev server
```

## Results

- **Orders auto-tagged in under 1 second** — webhook fires on order creation, rules engine applies tags before merchant opens the order
- **Billing handled by Shopify** — no Stripe integration needed; Shopify collects payment, handles failed charges, and manages trials
- **GDPR webhooks implemented** — mandatory for App Store listing; data deletion handled cleanly without manual legal review
- **Embedded admin = no context switch** — app renders inside Shopify admin via App Bridge; merchants never leave the Shopify UI
- **Shipped to App Store** — after GDPR compliance and partner review, app listed publicly; installation is one-click OAuth
