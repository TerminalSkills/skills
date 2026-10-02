---
name: bigcommerce
description: >-
  BigCommerce is a hosted e-commerce platform with REST and GraphQL APIs for
  headless storefronts. Use when a user asks to set up a large-scale online
  store, build a headless store with the Storefront GraphQL API or the
  Catalyst Next.js storefront, manage products and orders through the REST
  API, or migrate from Shopify to a more API-friendly platform.
license: Apache-2.0
compatibility: 'Any frontend via REST/GraphQL API; Catalyst storefront needs Node.js 24 and pnpm'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/bigcommerce/catalyst
  category: business
  tags:
    - bigcommerce
    - ecommerce
    - headless
    - api
    - enterprise
---

# BigCommerce

## Overview

BigCommerce is a hosted e-commerce platform with strong headless capabilities. Unlike Shopify, it includes more features out of the box (no app fees for basic needs), has a comprehensive REST + GraphQL API, and supports multi-storefront. Works as a backend for headless commerce with Next.js (BigCommerce's own starter is Catalyst) or any other frontend.

## Instructions

### Step 1: Storefront API (GraphQL)

The endpoint is `https://store-{store_hash}.mybigcommerce.com/graphql` for the default channel (or your storefront domain plus `/graphql`); other channels use `store-{store_hash}-{channel_id}.mybigcommerce.com`. Create a token in the control panel or with `POST /v3/storefront/api-token` on the management API. BigCommerce's current docs say server-side integrations created after June 30, 2026 should use private tokens rather than storefront tokens; check the GraphQL authentication page for which applies to you. Limits: query complexity 10,000, depth 16, at most 50 products per page. Try queries in Settings > API > Storefront API Playground first.

```typescript
// lib/bigcommerce.ts — Fetch products via GraphQL Storefront API
const STOREFRONT_TOKEN = process.env.BC_STOREFRONT_TOKEN!
const STORE_HASH = process.env.BC_STORE_HASH!

export async function getProducts(limit = 12) {
  const query = `
    query Products($first: Int!) {
      site {
        products(first: $first) {
          edges {
            node {
              entityId
              name
              path
              prices { price { value currencyCode } }
              defaultImage { url(width: 400) altText }
            }
          }
        }
      }
    }
  `

  const res = await fetch(`https://store-${STORE_HASH}.mybigcommerce.com/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STOREFRONT_TOKEN}`,
    },
    body: JSON.stringify({ query, variables: { first: limit } }),
  })

  const { data } = await res.json()
  return data.site.products.edges.map(e => e.node)
}
```

### Step 2: Management API (REST)

```typescript
// lib/bc-admin.ts — Server-side product and order management
const BC_TOKEN = process.env.BC_API_TOKEN!
const STORE_HASH = process.env.BC_STORE_HASH!
const BASE_URL = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3`

// Create product
await fetch(`${BASE_URL}/catalog/products`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-Token': BC_TOKEN,
  },
  body: JSON.stringify({
    name: 'Premium Headphones',
    type: 'physical',
    price: 199.99,
    weight: 1.5,
    categories: [23],
    is_visible: true,
  }),
})

// Get orders
// Orders are still the V2 API: /v2/orders, not /v3/orders
const orders = await fetch(`https://api.bigcommerce.com/stores/${STORE_HASH}/v2/orders?status_id=11`, {
  headers: { 'X-Auth-Token': BC_TOKEN, Accept: 'application/json' },
}).then(r => r.json()) // status 11 = Awaiting Fulfillment
```

Create the API account under Settings > API > Store-level API accounts and grant only the scopes you need (Products, Orders). The token is shown once; keep it in an environment variable.

### Step 3: Next.js Commerce

BigCommerce's official headless storefront is Catalyst (Next.js, App Router, GraphQL). It needs Node.js 24 and pnpm via Corepack.

```bash
corepack enable pnpm
pnpm create @bigcommerce/catalyst@latest
cd my-catalyst-store   # the directory name you chose
pnpm run dev           # http://localhost:3000
```

The CLI asks for your store hash and channel and writes `.env.local`. The old Vercel `commerce` template no longer ships a BigCommerce provider, so do not follow guides that use it.

## Examples

### Example 1: Show the newest products on a headless page

**User request:** "List the 8 newest products from my BigCommerce store in Next.js"

Use `getProducts(8)` from Step 1 in a Server Component with `process.env.BC_STORE_HASH` and `BC_STOREFRONT_TOKEN` set. The result is an array like `{ entityId: 113, name: 'Premium Headphones', path: '/premium-headphones/', prices: { price: { value: 199.99, currencyCode: 'USD' } } }`. For newest-first ordering add `sortBy: NEWEST` inside `products(...)`, which the playground will validate.

### Example 2: Add a product and find orders waiting to ship

**User request:** "Create a headphones product and list orders awaiting fulfillment"

Run the Step 2 calls from a server script with `BC_API_TOKEN` set. The POST returns `201` with the new product's `data.id`; the orders call returns an array of order objects with `id`, `status`, `total_inc_tax` and `date_created`, an empty array (or `204`) if nothing is waiting.


## Guidelines

- Plans (checked October 2026): Core from $29/month billed annually ($39 monthly), Growth $79, Scale $299, Performance custom. Sales caps trigger automatic upgrades. Transaction fees are $0 with embedded providers such as Stripe and PayPal, but open payment providers carry 2.0% (Core) down to 0.6% (Scale). Re-check pricing before quoting it.
- Multi-storefront: run multiple stores from one account with different domains and catalogs.
- GraphQL Storefront API is read-focused (catalog, carts, customers); use the REST Management API for admin writes, and never expose management tokens in browser code.
- Built-in features (reviews, wishlists, faceted search) that cost extra on Shopify.
