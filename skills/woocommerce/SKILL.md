---
name: woocommerce
description: >-
  Build e-commerce stores with WooCommerce for WordPress. Use when a user asks
  to add a shop to WordPress, manage products and orders, customize checkout,
  integrate payment gateways, or build a WordPress-based online store.
license: Apache-2.0
compatibility: 'WordPress 6.0+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ecommerce
  tags:
    - woocommerce
    - wordpress
    - ecommerce
    - shop
    - payments
---

# WooCommerce

## Overview

WooCommerce is the most popular e-commerce platform — powers ~40% of all online stores. It's a free WordPress plugin with extensions for payments, shipping, subscriptions, and multi-currency. Fully customizable with PHP hooks and REST API.

## Instructions

### Step 1: REST API Integration

```typescript
// lib/woo.ts — WooCommerce REST API client
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api'

const woo = new WooCommerceRestApi({
  url: 'https://store.example.com',
  consumerKey: process.env.WOO_KEY!,
  consumerSecret: process.env.WOO_SECRET!,
  version: 'wc/v3',
})

// List products
const { data: products } = await woo.get('products', { per_page: 20, status: 'publish' })

// Create product
await woo.post('products', {
  name: 'Premium T-Shirt',
  type: 'simple',
  regular_price: '29.99',
  description: 'High-quality cotton t-shirt',
  categories: [{ id: 15 }],
  images: [{ src: 'https://example.com/tshirt.jpg' }],
})

// Get orders
const { data: orders } = await woo.get('orders', { status: 'processing' })

// Update order status
await woo.put(`orders/${orderId}`, { status: 'completed' })
```

### Step 2: Custom Hooks (PHP)

```php
// functions.php — WooCommerce customization hooks

// Add custom field to checkout
add_action('woocommerce_after_order_notes', function($checkout) {
    woocommerce_form_field('delivery_notes', [
        'type' => 'textarea',
        'label' => 'Delivery Notes',
        'placeholder' => 'Special instructions for delivery',
    ], $checkout->get_value('delivery_notes'));
});

// Custom discount logic
add_action('woocommerce_cart_calculate_fees', function($cart) {
    if ($cart->get_subtotal() > 100) {
        $cart->add_fee('Bulk discount', -10);    // $10 off orders over $100
    }
});
```

### Step 3: Webhooks

```typescript
// api/woo/webhook.ts — Handle WooCommerce events
export async function POST(req: Request) {
  const event = req.headers.get('x-wc-webhook-topic')
  const data = await req.json()

  switch (event) {
    case 'order.created':
      await notifySlack(`New order #${data.id}: $${data.total} from ${data.billing.email}`)
      break
    case 'order.completed':
      await sendThankYouEmail(data.billing.email, data)
      break
  }
  return new Response('OK')
}
```

## Guidelines

- WooCommerce is free; costs come from hosting and premium extensions.
- Use REST API for headless commerce — build custom frontends with Next.js/React.
- Performance: WooCommerce on shared hosting struggles past ~500 products. Use dedicated hosting or consider Medusa for headless.
- Extensions marketplace has 800+ plugins for payments, shipping, subscriptions, etc.
