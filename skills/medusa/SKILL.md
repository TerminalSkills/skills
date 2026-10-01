---
name: medusa
description: >-
  Medusa is an open-source headless commerce platform (Node.js, TypeScript,
  PostgreSQL) that serves products, carts, orders, payments and an admin
  dashboard over a REST API. Use when a user asks to build an online store
  backend, create a headless e-commerce platform, set up product management
  and checkout, build a custom storefront, add Stripe payments to a store,
  manage inventory and orders, upgrade Medusa v1 code to v2, or replace
  Shopify with an open-source alternative. Covers Medusa v2: products, carts,
  checkout, Stripe, custom API routes, subscribers and the Next.js storefront.
license: Apache-2.0
compatibility: 'Node.js 20.19+ or 22.12+ (LTS) and PostgreSQL; Redis for production deployments'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/medusajs/medusa
  tags:
    - medusa
    - ecommerce
    - headless
    - payments
    - orders
---

# Medusa

## Overview

Medusa is an open-source headless commerce platform (Node.js + PostgreSQL). It provides a complete backend for products, carts, orders, payments, shipping, and customers, exposed through a REST API (`/store/*` for storefronts, `/admin/*` for back-office clients), plus an admin dashboard served by the same process. Think of it as the open-source alternative to Shopify's backend, with full control over customization. This skill targets **Medusa v2** (2.21 at the time of writing); v1 file layouts, imports and API paths do not work in v2. It covers setup, authentication, product management, checkout, Stripe, custom API routes, subscribers, and the Next.js storefront.

## Instructions

### Step 1: Project Setup

```bash
# Scaffolds a monorepo: apps/backend (server + admin) and apps/storefront (Next.js starter)
npx create-medusa-app@latest linen-shop --with-nextjs-starter --no-browser
# --no-browser exits after setup; without it the command keeps serving and opens the admin. Also: --db-url "$DATABASE_URL", --skip-db

cd linen-shop/apps/backend
npx medusa user -e ops@linenshop.dev -p "$MEDUSA_ADMIN_PASSWORD"   # create an admin user
npm run dev                              # medusa develop; keeps running, so use a second terminal for the rest
# API:        http://localhost:9000
# Admin:      http://localhost:9000/app
# Storefront: http://localhost:8000 (npm run dev in apps/storefront)

npx medusa db:migrate                    # after upgrading Medusa or adding modules and links
npx medusa db:generate brand             # generate a migration for a custom module named "brand"
npx medusa exec ./src/scripts/import-shopify.ts ./data/shopify-products.json   # run a script with the container
```

The installer creates a PostgreSQL database named `medusa-linen-shop` and writes `DATABASE_URL` to `apps/backend/.env`. Redis is not needed in development: the event bus, workflow engine, cache and locking run in memory.

### Step 2: Authenticate

Store routes need a publishable API key (Admin > Settings > Publishable API Keys); admin routes need a JWT or a secret API key.

```bash
# Admin: exchange credentials for a JWT
TOKEN=$(curl -s -X POST http://localhost:9000/auth/user/emailpass \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"ops@linenshop.dev\",\"password\":\"$MEDUSA_ADMIN_PASSWORD\"}" | jq -r .token)

curl -s http://localhost:9000/admin/api-keys -H "Authorization: Bearer $TOKEN" \
  | jq -r '.api_keys[] | select(.type == "publishable") | .token'      # pk_fd8eefbf7...

# Store: every /store request carries the publishable key
curl -s "http://localhost:9000/store/products?limit=20" -H "x-publishable-api-key: $MEDUSA_PUBLISHABLE_KEY"
# without the header: 400 {"type":"not_allowed","message":"Publishable API key required ..."}
```

### Step 3: Product Management

```typescript
// src/api/admin/quick-product/route.ts — the file path is the URL: POST /admin/quick-product
// Routes under /admin require an authenticated admin user by default.
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

type QuickProductBody = { title: string; price: number; shipping_profile_id: string }

export async function POST(req: MedusaRequest<QuickProductBody>, res: MedusaResponse) {
  const { title, price, shipping_profile_id } = req.body
  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [{
        title, status: "published", shipping_profile_id,
        options: [{ title: "Size", values: ["S", "M", "L"] }],
        variants: ["S", "M", "L"].map((size) => ({
          title: `${title} / ${size}`,
          sku: `${title.toUpperCase().replace(/\s+/g, "-")}-${size}`,
          options: { Size: size },
          prices: [{ amount: price, currency_code: "usd" }],   // major units: 39.5 means $39.50
          manage_inventory: false,
        })),
      }],
    },
  })
  res.json({ product: result[0] })
}
```

```bash
# The built-in route does the same; a product must define at least one option
curl -s -X POST http://localhost:9000/admin/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Linen Napkin Set","status":"published","options":[{"title":"Color","values":["Sand","Slate"]}]}'

# Storefront: prices are calculated per region, so pass region_id
curl -s "http://localhost:9000/store/products?region_id=$REGION_ID&fields=*variants.calculated_price" \
  -H "x-publishable-api-key: $MEDUSA_PUBLISHABLE_KEY"
```

### Step 4: Cart and Checkout Flow

```typescript
// lib/checkout.ts — storefront checkout with the JS SDK (npm install @medusajs/js-sdk)
// Flow: cart → line items → email and address → shipping method → payment session → complete
import Medusa from "@medusajs/js-sdk"

export const sdk = new Medusa({
  baseUrl: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

export async function checkout(variantId: string, providerId = "pp_system_default") {
  const { regions } = await sdk.store.region.list()
  let { cart } = await sdk.store.cart.create({ region_id: regions[0].id })   // currency comes from the region
  ;({ cart } = await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity: 2 }))
  ;({ cart } = await sdk.store.cart.update(cart.id, {
    email: "marta.keller@posteo.de",
    shipping_address: {
      first_name: "Marta", last_name: "Keller", address_1: "Lindenstrasse 14",
      city: "Berlin", postal_code: "10969", country_code: "de",
    },
  }))
  const { shipping_options } = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
  ;({ cart } = await sdk.store.cart.addShippingMethod(cart.id, { option_id: shipping_options[0].id }))
  // Creates the payment collection and the session; use "pp_stripe_stripe" for Stripe
  await sdk.store.payment.initiatePaymentSession(cart, { provider_id: providerId })
  const result = await sdk.store.cart.complete(cart.id)
  if (result.type !== "order") throw new Error(result.error.message)   // type "cart" = completion failed
  return result.order                                                  // { id: "order_01...", total: 30, ... }
}
```

The equivalent REST calls are `POST /store/carts`, `POST /store/carts/{id}/line-items`, `POST /store/carts/{id}`, `GET /store/shipping-options?cart_id=`, `POST /store/carts/{id}/shipping-methods`, `POST /store/payment-collections` with `{"cart_id"}`, `POST /store/payment-collections/{id}/payment-sessions` with `{"provider_id"}`, and `POST /store/carts/{id}/complete`.

### Step 5: Payment Integration (Stripe)

The Stripe provider ships inside `@medusajs/medusa`; there is no extra package to install.

```typescript
// medusa-config.ts — add a modules array next to the scaffolded projectConfig
module.exports = defineConfig({
  projectConfig: { /* unchanged: databaseUrl, http.storeCors/adminCors/authCors, jwtSecret, cookieSecret */ },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [{
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: {
            apiKey: process.env.STRIPE_API_KEY,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          },
        }],
      },
    },
  ],
})
```

Then enable Stripe for each region in Admin > Settings > Regions. The provider ID used in checkout is `pp_stripe_stripe`. In production, point a Stripe webhook at `https://api.linenshop.dev/hooks/payment/stripe_stripe` for the events `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed` and `payment_intent.partially_funded`.

### Step 6: Custom API Routes

```typescript
// src/api/store/search/route.ts — GET /store/search?q=shirt
// Query reads data across modules; routes under /store require the publishable key.
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "variants.sku", "variants.prices.amount", "variants.prices.currency_code"],
    filters: { title: { $ilike: `%${req.query.q ?? ""}%` }, status: "published" },
    pagination: { take: 20, skip: 0 },
  })
  res.json({ products, count: metadata?.count })
}
```

### Step 7: Subscribers and Events

```typescript
// src/subscribers/order-placed.ts — runs after an order is placed (email, ERP sync, warehouse notice)
// The event payload holds only the ID; load what you need with Query.
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "total", "currency_code"],
    filters: { id: data.id },
  })
  if (!order?.email) return
  // Needs a Notification Module provider (SendGrid, for example) for the "email" channel; without one this call throws
  await container.resolve(Modules.NOTIFICATION).createNotifications({
    to: order.email, channel: "email", template: "order-confirmation",
    data: { display_id: order.display_id, total: order.total, currency_code: order.currency_code },
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
```

## Examples

### Example 1: Launch a headless e-commerce store with Next.js frontend
**User prompt:** "I want to build an online clothing store. Open-source backend, custom Next.js frontend, Stripe payments. I need product variants (size, color), inventory tracking, and a proper checkout flow."

The agent will:
1. Run `npx create-medusa-app@latest linen-shop --with-nextjs-starter --no-browser`, which creates `apps/backend` and `apps/storefront`, then create the admin user and start both apps (Step 1); the admin is at `http://localhost:9000/app`.
2. Add the Stripe provider to `medusa-config.ts` (Step 5), set `STRIPE_API_KEY` in `apps/backend/.env` and `NEXT_PUBLIC_STRIPE_KEY` in `apps/storefront/.env.local`, and enable Stripe for the region in the admin.
3. Create products with `Size` and `Color` options; for stock tracking leave `manage_inventory` on and set quantities per stock location in the admin.
4. Keep the starter's cart and checkout pages, which already follow the flow in Step 4.
5. Add the `order.placed` subscriber from Step 7 for confirmation emails.

Result: a test order placed in the storefront at `http://localhost:8000` appears under Orders in the admin, and the server log shows `Processing order.placed which has 1 subscribers`.

### Example 2: Migrate from Shopify to a self-hosted solution
**User prompt:** "We're paying $300/month for Shopify Plus. Migrate our 500 products to a self-hosted Medusa backend."

Export the products from Shopify as JSON, then import them with a script that runs inside the Medusa container:

```typescript
// src/scripts/import-shopify.ts
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readFileSync } from "node:fs"

type ShopifyProduct = {
  title: string; handle: string; body_html: string
  options: { name: string; values: string[] }[]
  variants: { title: string; sku: string; price: string; option1: string }[]
}

export default async function importShopify({ container, args }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [profile] } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const { data: [channel] } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { products } = JSON.parse(readFileSync(args[0], "utf8")) as { products: ShopifyProduct[] }
  for (let i = 0; i < products.length; i += 25) {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: products.slice(i, i + 25).map((p) => ({
          title: p.title, handle: p.handle, description: p.body_html, status: "published" as const,
          shipping_profile_id: profile.id, sales_channels: [{ id: channel.id }],
          options: p.options.map((o) => ({ title: o.name, values: o.values })),
          variants: p.variants.map((v) => ({
            title: v.title, sku: v.sku, manage_inventory: false,
            options: { [p.options[0].name]: v.option1 },
            prices: [{ amount: Number(v.price), currency_code: "usd" }],   // "89.00" -> 89, not 8900
          })),
        })),
      },
    })
    console.log(`Imported ${i + result.length} of ${products.length} products`)
  }
}
```

```bash
npx medusa exec ./src/scripts/import-shopify.ts ./data/shopify-products.json
# Imported 25 of 500 products ... Imported 500 of 500 products
```

Each batch is one workflow run, so a failing product rolls back only its batch of 25. Products with more than one option need `option2` and `option3` mapped the same way; order history is imported separately.

## Guidelines

- Check which major version a project uses before editing it. v1 code (`src/api/routes/*`, `medusa seed`, `/store/carts/{id}/payment-sessions`, admin on port 7001, the `medusa-payment-stripe` plugin) does not run on v2. There is no in-place upgrade: v2 needs a new database and a data migration.
- Prices are stored in major units in v2: `amount: 10` is $10.00, not 10 cents. Dividing or multiplying by 100 out of v1 habit is the most common migration bug.
- Medusa has no GraphQL API. Use the REST routes or the JS SDK from clients, and Query (`query.graph`) on the server.
- Every `/store` request needs the `x-publishable-api-key` header; the key also decides which sales channel's products are visible. A product that is not in the key's sales channel does not appear in the storefront.
- Use workflows (`createProductsWorkflow`, `completeCartWorkflow`, or your own) for anything that writes across modules — they roll back completed steps when a later step fails. Do not call module services directly from routes for multi-step writes.
- Always check `result.type === "order"` after completing a cart. `type: "cart"` means completion failed and Medusa has already cancelled or refunded the payment.
- Keep the admin behind authentication and restrict `ADMIN_CORS`, `STORE_CORS` and `AUTH_CORS` to real origins. Replace the scaffolded `JWT_SECRET` and `COOKIE_SECRET` (`supersecret`) before deploying.
- For production, run `npx medusa build` and start from `.medusa/server`, run `medusa db:migrate` on every deploy, set `projectConfig.redisUrl`, and replace the in-memory modules with the Redis event bus, workflow engine, locking and caching modules. Run one instance in `server` mode and one in `worker` mode (`workerMode` in `medusa-config.ts`).
- For storefronts, start from the Next.js starter rather than from scratch — it handles cart state, regions, checkout and Stripe.
