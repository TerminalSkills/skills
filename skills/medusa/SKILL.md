---
name: medusa
description: >-
  Build headless e-commerce backends with Medusa.js. Use when a user asks to
  build an online store backend, create a headless e-commerce platform, set up
  product management and checkout, build a custom storefront, add payment
  processing to an e-commerce app, manage inventory and orders, or replace
  Shopify with an open-source alternative. Covers products, carts, orders,
  payments (Stripe), shipping, plugins, and Next.js storefront integration.
license: Apache-2.0
compatibility: 'Node.js 18+ with PostgreSQL and Redis'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - medusa
    - ecommerce
    - headless
    - store
    - payments
    - orders
---

# Medusa

## Overview

Medusa is an open-source headless e-commerce engine (Node.js + PostgreSQL). It provides a complete backend for products, carts, orders, payments, shipping, and customers — exposed via REST and GraphQL APIs. Think of it as the open-source alternative to Shopify's backend, with full control over customization. This skill covers setup, product management, custom API routes, payment integration (Stripe), and connecting a Next.js storefront.

## Instructions

### Step 1: Project Setup

```bash
# Create new Medusa project
npx create-medusa-app@latest my-store
# This scaffolds: backend (Medusa server) + admin dashboard + storefront (Next.js)

# Or install backend only
npx create-medusa-app@latest my-store --skip-db --no-browser

cd my-store

# Configure database
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/medusa_store
REDIS_URL=redis://localhost:6379

# Run migrations and seed
npx medusa db:migrate
npx medusa seed --seed-file=data/seed.json

# Start development server
npx medusa develop
# API: http://localhost:9000
# Admin: http://localhost:7001
```

### Step 2: Product Management

```typescript
// src/api/routes/admin/custom-products.ts — Custom product creation endpoint
// Medusa's admin API handles CRUD, but custom routes extend it

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [{
        title: req.body.title,
        description: req.body.description,
        status: "published",
        options: [
          { title: "Size", values: ["S", "M", "L", "XL"] },
          { title: "Color", values: ["Black", "White", "Navy"] },
        ],
        variants: [
          {
            title: "Small Black",
            sku: "TSHIRT-S-BLK",
            prices: [{ amount: 2999, currency_code: "usd" }],
            options: { Size: "S", Color: "Black" },
            manage_inventory: true,
            inventory_quantity: 100,
          },
        ],
        images: [{ url: "https://example.com/product.jpg" }],
        categories: [{ id: "cat_tshirts" }],
      }],
    },
  })

  res.json({ product: result })
}
```

```bash
# REST API examples — Product operations
# List products (public storefront API)
curl http://localhost:9000/store/products

# Get single product
curl http://localhost:9000/store/products/prod_01ABC

# Admin: create product
curl -X POST http://localhost:9000/admin/products \
  -H 'Authorization: Bearer admin_token' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Classic T-Shirt", "status": "published"}'
```

### Step 3: Cart and Checkout Flow

```typescript
// lib/storefront-client.ts — Client-side cart operations for Next.js storefront
// This is the typical checkout flow: create cart → add items → add shipping → complete

const API_URL = process.env.NEXT_PUBLIC_MEDUSA_URL || "http://localhost:9000"

export async function createCart() {
  const res = await fetch(`${API_URL}/store/carts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region_id: "reg_us" }),
  })
  return res.json()    // { cart: { id: "cart_01ABC", items: [], total: 0 } }
}

export async function addToCart(cartId: string, variantId: string, quantity: number) {
  const res = await fetch(`${API_URL}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant_id: variantId, quantity }),
  })
  return res.json()
}

export async function completeCheckout(cartId: string) {
  // Add customer email
  await fetch(`${API_URL}/store/carts/${cartId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "customer@example.com" }),
  })

  // Select shipping option
  await fetch(`${API_URL}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option_id: "so_standard" }),
  })

  // Initialize payment (Stripe)
  await fetch(`${API_URL}/store/carts/${cartId}/payment-sessions`, {
    method: "POST",
  })

  // Complete order
  const res = await fetch(`${API_URL}/store/carts/${cartId}/complete`, {
    method: "POST",
  })
  return res.json()    // { type: "order", data: { id: "order_01ABC", ... } }
}
```

### Step 4: Payment Integration (Stripe)

```bash
# Install Stripe payment plugin
npm install @medusajs/payment-stripe
```

```typescript
// medusa-config.ts — Configure Stripe payment provider
import { defineConfig } from "@medusajs/framework"

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
  },
  modules: [
    {
      resolve: "@medusajs/payment",
      options: {
        providers: [{
          resolve: "@medusajs/payment-stripe",
          options: {
            apiKey: process.env.STRIPE_SECRET_KEY,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          },
        }],
      },
    },
  ],
})
```

### Step 5: Custom API Routes

```typescript
// src/api/routes/store/custom-search.ts — Custom storefront endpoint
// Extend Medusa's API with business-specific logic

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.query.q as string
  const productService = req.scope.resolve("product")

  const [products, count] = await productService.listAndCount(
    { q: query, status: "published" },
    { take: 20, relations: ["variants", "images"] }
  )

  res.json({ products, count })
}
```

### Step 6: Subscribers and Events

```typescript
// src/subscribers/order-placed.ts — React to events (send email, update inventory)
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

export default async function orderPlacedHandler({ event, container }: SubscriberArgs) {
  /**
   * Triggered when an order is placed. Use for:
   * - Sending confirmation emails
   * - Notifying warehouse
   * - Updating external systems (ERP, CRM)
   */
  const order = event.data
  const notificationService = container.resolve("notification")

  await notificationService.send("order-confirmation", {
    to: order.email,
    data: {
      order_id: order.id,
      items: order.items,
      total: order.total,
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
```

## Examples

### Example 1: Launch a headless e-commerce store with Next.js frontend
**User prompt:** "I want to build an online clothing store. Open-source backend, custom Next.js frontend, Stripe payments. I need product variants (size, color), inventory tracking, and a proper checkout flow."

The agent will:
1. Scaffold a Medusa project with `create-medusa-app`.
2. Configure PostgreSQL, Redis, and Stripe payment plugin.
3. Create product data model with size/color variants and inventory.
4. Build Next.js storefront pages: product listing, product detail, cart, checkout.
5. Set up order confirmation emails via subscribers.

### Example 2: Migrate from Shopify to a self-hosted solution
**User prompt:** "We're paying $300/month for Shopify Plus. Migrate our 500 products and order history to a self-hosted Medusa backend."

The agent will:
1. Export products and orders from Shopify via their Admin API.
2. Transform the data to Medusa's format (handle variants, images, metadata).
3. Write a migration script that imports products and historical orders.
4. Set up equivalent payment and shipping configurations.

## Guidelines

- Medusa requires PostgreSQL and Redis — both must be running before starting the server. Use Docker Compose to manage all three services together.
- The admin dashboard (port 7001) is separate from the storefront API (port 9000). Keep the admin behind authentication and network restrictions in production.
- Use Medusa's workflow system for complex operations (multi-step processes like checkout) — it provides automatic rollback on failure.
- For storefronts, use Medusa's official Next.js starter as a base rather than building from scratch — it handles cart state, checkout flow, and API integration.
- Medusa's plugin ecosystem covers payments (Stripe, PayPal), shipping (FedEx, DHL), notifications (SendGrid, Twilio), and search (Meilisearch, Algolia). Check the plugin registry before building custom integrations.
