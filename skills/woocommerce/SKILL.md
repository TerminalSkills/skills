---
name: woocommerce
description: >-
  Build e-commerce stores with WooCommerce for WordPress. Use when a user asks
  to add a shop to WordPress, manage products and orders, customize checkout,
  integrate payment gateways, or build a WordPress-based online store.
license: Apache-2.0
compatibility: 'WordPress 7.0+, PHP 7.4+ (WooCommerce 11.x); Node.js 18+ for the REST client'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/woocommerce/woocommerce
  category: business
  tags:
    - woocommerce
    - wordpress
    - ecommerce
    - shop
    - payments
---

# WooCommerce

## Overview

WooCommerce is the open-source e-commerce plugin for WordPress (GPLv3, free; costs come from hosting and paid extensions). Release 11.2.1 (9 October 2026) requires WordPress 7.0+ and PHP 7.4+. You extend it with PHP hooks, talk to it from outside through the REST API (`/wp-json/wc/v3`), and get notified of changes through webhooks.

## Instructions

### Step 1: REST API integration

Create keys in WordPress admin under WooCommerce > Settings > Advanced > REST API (pick a user, choose Read, Write or Read/Write). The key acts with that user's capabilities. Keep both values in environment variables. Over HTTPS the client sends them as HTTP Basic auth; on plain HTTP the API falls back to OAuth 1.0a, so always put the store on HTTPS.

```bash
npm install @woocommerce/woocommerce-rest-api   # 1.0.2, CommonJS with a default export
```

```typescript
// lib/woo.ts
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

export const woo = new WooCommerceRestApi({
  url: 'https://shop.northwindcoffee.co',
  consumerKey: process.env.WOO_CONSUMER_KEY!,
  consumerSecret: process.env.WOO_CONSUMER_SECRET!,
  version: 'wc/v3',
})

// List published products (default page size is 10, max per_page is 100)
const { data: products } = await woo.get('products', { per_page: 20, status: 'publish' })

// Create a product; categories are referenced by id, images are sideloaded from the URL
const { data: created } = await woo.post('products', {
  name: 'Ethiopia Guji Whole Bean 1kg',
  type: 'simple',
  regular_price: '29.99',        // prices are strings
  description: 'Washed Guji, notes of bergamot and peach.',
  categories: [{ id: 15 }],
  images: [{ src: 'https://cdn.northwindcoffee.co/guji-1kg.jpg' }],
})

// Orders waiting to be fulfilled, then mark one completed
const { data: orders } = await woo.get('orders', { status: 'processing', per_page: 50 })
await woo.put(`orders/${orders[0].id}`, { status: 'completed' })

// Several writes in one request (create, update and delete arrays)
await woo.post('products/batch', {
  update: [{ id: created.id, regular_price: '27.50' }],
})
```

Pagination totals come in the `x-wp-total` and `x-wp-totalpages` response headers (`response.headers`). The library exports `default` and `OptionsException`; `queryStringAuth: true` sends the keys in the URL, only for hosts that strip the `Authorization` header (the keys then land in server logs).

### Step 2: Hooks (PHP)

Put code in a small plugin or a child theme, never in the parent theme. Checkout comes in two flavours and the hooks differ:

- Block checkout (the default for new stores): add fields with `woocommerce_register_additional_checkout_field` on the `woocommerce_init` action. Locations are `contact`, `address` and `order`; types are `text`, `select`, `checkbox` and `date`. The id is `namespace/name`. Values are stored on the order and (for `contact` and `address`) on the customer.
- Classic shortcode checkout: the older `woocommerce_after_order_notes` and `woocommerce_checkout_update_order_meta` hooks. They do nothing on the block checkout.

```php
<?php
// wp-content/plugins/northwind-checkout/northwind-checkout.php

add_action( 'woocommerce_init', function () {
    woocommerce_register_additional_checkout_field( array(
        'id'       => 'northwind/delivery-notes',
        'label'    => 'Delivery notes',
        'location' => 'order',
        'type'     => 'text',
        'required' => false,
    ) );
} );

// Read it back from an order later (helper survives storage changes).
// The third argument is the storage group: 'billing' or 'shipping' for `address` fields,
// 'other' for `contact` and `order` fields.
use Automattic\WooCommerce\Blocks\Package;
use Automattic\WooCommerce\Blocks\Domain\Services\CheckoutFields;

function northwind_delivery_notes( int $order_id ): ?string {
    $order  = wc_get_order( $order_id );
    $fields = Package::container()->get( CheckoutFields::class );
    return $order ? $fields->get_field_from_object( 'northwind/delivery-notes', $order, 'other' ) : null;
}

// A fee works on both checkouts; a negative amount is a discount
add_action( 'woocommerce_cart_calculate_fees', function ( WC_Cart $cart ) {
    if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
        return;
    }
    if ( $cart->get_subtotal() > 100 ) {
        $cart->add_fee( 'Bulk discount', -10 );   // 10 off orders over 100
    }
} );
```

Read and write orders through the CRUD objects (`wc_get_order()`, `$order->get_meta()`, `$order->update_meta_data()` then `$order->save()`), not `get_post_meta()`. New stores keep orders in their own tables (High-Performance Order Storage), where post-meta calls return nothing.

### Step 3: Webhooks

Create them under WooCommerce > Settings > Advanced > Webhooks, or with `POST wc/v3/webhooks` (`name`, `topic`, `delivery_url`, `secret`). Topics look like `order.created`, `order.updated`, `product.updated`. Each delivery carries `X-WC-Webhook-Topic` and `X-WC-Webhook-Signature`, the base64 HMAC-SHA256 of the raw body keyed with the webhook secret. Verify it on the raw bytes before parsing.

```typescript
// app/api/woo/webhook/route.ts (Next.js route handler)
import { createHmac, timingSafeEqual } from 'node:crypto'

export async function POST(req: Request) {
  const raw = await req.text()                       // raw body, not req.json()
  const sent = req.headers.get('x-wc-webhook-signature') ?? ''
  // The ping sent when a webhook is saved has no signature and a form body (webhook_id=<id>)
  if (!sent && raw.startsWith('webhook_id=')) return new Response('ok')
  const expected = createHmac('sha256', process.env.WOO_WEBHOOK_SECRET!).update(raw).digest('base64')
  const a = Buffer.from(sent), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('invalid signature', { status: 401 })
  }

  const topic = req.headers.get('x-wc-webhook-topic')
  const order = JSON.parse(raw)
  if (topic === 'order.created') {
    console.log(`New order #${order.id}: ${order.total} ${order.currency}`)  // no customer PII in logs
  }
  return new Response('ok')
}
```

Answer with a 2xx quickly and push slow work onto a queue; an endpoint that keeps failing makes WooCommerce stop delivering.

## Examples

### Example 1: "Raise every coffee price by 5%"

```typescript
import { woo } from './lib/woo'

const { data } = await woo.get('products', { category: '15', per_page: 100 })
const update = data
  .filter((p: any) => p.type === 'simple' && p.regular_price)
  .map((p: any) => ({ id: p.id, regular_price: (Number(p.regular_price) * 1.05).toFixed(2) }))
const { data: result } = await woo.post('products/batch', { update })
console.log(`${result.update.length} products updated`)
```

Result: `12 products updated`. Variable products need their variations updated through `products/<id>/variations/batch`.

### Example 2: "Add a gift message at checkout"

Add the `woocommerce_init` snippet from Step 2 with `id` `northwind/gift-message`, `location` `order` and `type` `text`. Open the checkout page: an optional "Gift message" input appears in the Order information block, and the value is shown with the order in the admin screen.

## Guidelines

- Check whether the store uses the block or the shortcode checkout before choosing hooks; field hooks for one do nothing on the other.
- Declare HPOS and block-checkout compatibility in your own plugin and use CRUD methods for order data.
- Never expose consumer keys in browser code; call the REST API from a server. Give keys the narrowest scope (Read for reporting).
- Rate and size: keep `per_page` at or under 100 and use `/batch` endpoints for bulk changes.
- Shared hosting struggles with large catalogues; use a managed or dedicated host with object caching, or a headless commerce engine such as Medusa if you need a custom storefront at scale.
- Payment gateway and shipping extensions come from the official marketplace and WordPress.org; update them together with WooCommerce.
