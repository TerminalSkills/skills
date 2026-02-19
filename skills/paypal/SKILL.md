---
name: paypal
description: >-
  Accept payments with PayPal. Use when a user asks to add PayPal checkout,
  accept PayPal payments, create subscriptions with PayPal, handle PayPal
  webhooks, or integrate PayPal alongside Stripe. Covers Orders API, checkout
  buttons, subscriptions, webhooks, and Node.js SDK.
license: Apache-2.0
compatibility: 'Node.js 14+, Python 3.6+, REST API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: payments
  tags:
    - paypal
    - payments
    - checkout
    - subscriptions
---

# PayPal

## Overview

PayPal is used by 400M+ users worldwide. This skill covers the Orders API v2 for one-time payments, PayPal Buttons (JavaScript SDK), recurring subscriptions, webhook handling, and the Node.js/Python server SDK.

## Instructions

### Step 1: Setup

```bash
npm install @paypal/checkout-server-sdk
# Or use REST API directly with fetch
```

```typescript
// lib/paypal.ts — PayPal client initialization
import paypal from '@paypal/checkout-server-sdk'

const environment = process.env.NODE_ENV === 'production'
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)

export const paypalClient = new paypal.core.PayPalHttpClient(environment)
```

### Step 2: Create and Capture Orders

```typescript
// lib/orders.ts — Create PayPal orders and capture payments
export async function createOrder(amount: string, currency: string = 'USD') {
  const request = new paypal.orders.OrdersCreateRequest()
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: currency, value: amount },
    }],
  })
  const order = await paypalClient.execute(request)
  return order.result    // { id: 'ORDER_ID', status: 'CREATED' }
}

export async function captureOrder(orderId: string) {
  /** Capture payment after buyer approves on PayPal. */
  const request = new paypal.orders.OrdersCaptureRequest(orderId)
  const capture = await paypalClient.execute(request)
  return capture.result    // { status: 'COMPLETED', ... }
}
```

### Step 3: Frontend PayPal Buttons

```html
<!-- PayPal Smart Buttons — drop-in checkout UI -->
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&currency=USD"></script>
<div id="paypal-button-container"></div>
<script>
  paypal.Buttons({
    createOrder: async () => {
      const res = await fetch('/api/paypal/create-order', { method: 'POST' })
      const data = await res.json()
      return data.orderId
    },
    onApprove: async (data) => {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderID }),
      })
      const result = await res.json()
      if (result.status === 'COMPLETED') alert('Payment successful!')
    },
  }).render('#paypal-button-container')
</script>
```

### Step 4: Webhooks

```typescript
// app/api/webhooks/paypal/route.ts — Handle PayPal webhook events
export async function POST(req: Request) {
  const body = await req.json()
  const eventType = body.event_type

  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      await handlePaymentCompleted(body.resource)
      break
    case 'PAYMENT.CAPTURE.REFUNDED':
      await handleRefund(body.resource)
      break
  }
  return Response.json({ received: true })
}
```

## Guidelines

- Always create orders server-side and capture server-side — never trust client-side amount values.
- Use PayPal Sandbox for testing — create buyer/seller test accounts at developer.paypal.com.
- PayPal holds funds for new sellers (up to 21 days). Plan for this in marketplace flows.
- Verify webhook signatures using PayPal's webhook verification API to prevent forged events.
