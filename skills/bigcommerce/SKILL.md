---
name: bigcommerce
description: >-
  Build enterprise e-commerce with BigCommerce. Use when a user asks to set up
  a large-scale online store, use a hosted e-commerce platform with headless
  API, integrate with Next.js Commerce, or migrate from Shopify to a more
  API-friendly platform.
license: Apache-2.0
compatibility: 'Any frontend via REST/GraphQL API, Next.js Commerce'
metadata:
  author: terminal-skills
  version: 1.0.0
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

BigCommerce is a hosted e-commerce platform with strong headless capabilities. Unlike Shopify, it includes more features out of the box (no app fees for basic needs), has a comprehensive REST + GraphQL API, and supports multi-storefront. Works as a backend for headless commerce with Next.js, Gatsby, or any frontend.

## Instructions

### Step 1: Storefront API (GraphQL)

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
const orders = await fetch(`${BASE_URL}/orders?status_id=11`, {
  headers: { 'X-Auth-Token': BC_TOKEN },
}).then(r => r.json())
```

### Step 3: Next.js Commerce

```bash
# Use the official Next.js Commerce template with BigCommerce
npx create-next-app -e https://github.com/vercel/commerce
# Configure BigCommerce provider in .env.local
```

## Guidelines

- BigCommerce starts at $29/month with no transaction fees (Shopify charges 2% unless using Shopify Payments).
- Multi-storefront: run multiple stores from one account with different domains and catalogs.
- Headless-first: GraphQL Storefront API is well-documented and performant.
- Built-in features (reviews, wishlists, faceted search) that cost extra on Shopify.
