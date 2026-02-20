---
name: razorpay
description: >-
  Process payments for India and global markets with Razorpay's payment gateway. 
  Handle cards, UPI, wallets, netbanking, subscriptions, and payment links with 
  comprehensive webhook integration and Indian regulatory compliance.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["razorpay", "india-payments", "upi", "netbanking", "subscriptions", "payment-gateway"]
---

# Razorpay

Integrate payment processing for Indian and global markets using Razorpay's comprehensive payment gateway supporting UPI, cards, wallets, and netbanking.

## Overview

Razorpay is India's leading payment gateway supporting 100+ payment methods including UPI, credit/debit cards, netbanking, wallets like Paytm and PhonePe, and international cards. Perfect for businesses targeting Indian customers.

## Authentication

```javascript
// Install Razorpay SDK
// npm install razorpay

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});
```

## Instructions

### Step 1 — Basic Payment Integration

```javascript
// Server-side: Create order
app.post('/api/create-order', async (req, res) => {
  const { amount, currency, customer } = req.body;
  
  const order = await razorpay.orders.create({
    amount: amount * 100, // Amount in paise
    currency: currency || 'INR',
    receipt: `order_${Date.now()}`,
    notes: {
      customer_id: customer.id,
      customer_email: customer.email
    }
  });
  
  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: process.env.RAZORPAY_KEY_ID
  });
});

// Client-side: Razorpay Checkout
const options = {
  key: 'YOUR_KEY_ID',
  amount: 50000, // Amount in paise
  currency: 'INR',
  name: 'My Store',
  description: 'Payment for purchase',
  order_id: 'order_123',
  prefill: {
    name: 'John Doe',
    email: 'john@example.com',
    contact: '+919876543210'
  },
  theme: {
    color: '#3399cc'
  },
  method: {
    upi: true,
    card: true,
    netbanking: true,
    wallet: true
  },
  handler: function(response) {
    // Payment success handler
    fetch('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature
      })
    });
  }
};

const rzp = new Razorpay(options);
rzp.open();
```

### Step 2 — Payment Verification

```javascript
const crypto = require('crypto');

app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  
  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }
  
  // Get payment details
  const payment = await razorpay.payments.fetch(razorpay_payment_id);
  
  // Process the payment
  await processSuccessfulPayment({
    paymentId: razorpay_payment_id,
    orderId: razorpay_order_id,
    amount: payment.amount / 100,
    method: payment.method,
    status: payment.status
  });
  
  res.json({ success: true });
});
```

### Step 3 — Subscription Management

```javascript
// Create subscription plan
app.post('/api/create-plan', async (req, res) => {
  const { name, amount, interval, period } = req.body;
  
  const plan = await razorpay.plans.create({
    period: period || 'monthly',
    interval: interval || 1,
    item: {
      name: name,
      amount: amount * 100, // Amount in paise
      currency: 'INR'
    }
  });
  
  res.json({ planId: plan.id });
});

// Create subscription
app.post('/api/create-subscription', async (req, res) => {
  const { planId, customerData, totalCount } = req.body;
  
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: totalCount || 12,
    customer_notify: 1,
    notes: {
      customer_id: customerData.id,
      customer_email: customerData.email
    }
  });
  
  res.json({
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url
  });
});
```

### Step 4 — Payment Links and QR Codes

```javascript
// Create payment link
app.post('/api/create-payment-link', async (req, res) => {
  const { amount, description, customerData } = req.body;
  
  const paymentLink = await razorpay.paymentLink.create({
    amount: amount * 100,
    currency: 'INR',
    description: description,
    customer: {
      name: customerData.name,
      email: customerData.email,
      contact: customerData.phone
    },
    notify: {
      sms: true,
      email: true
    },
    callback_url: `${process.env.APP_URL}/payment-success`
  });
  
  res.json({
    id: paymentLink.id,
    short_url: paymentLink.short_url
  });
});

// Create QR code for UPI payments
app.post('/api/create-qr-code', async (req, res) => {
  const { name, amount } = req.body;
  
  const qrCode = await razorpay.qrCode.create({
    type: 'upi_qr',
    name: name,
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: amount * 100
  });
  
  res.json({
    id: qrCode.id,
    image_url: qrCode.image_url
  });
});
```

## Guidelines

- **Always verify payments server-side** using webhook signature verification
- **Use Indian payment methods appropriately** — UPI for small amounts, netbanking for larger amounts
- **Handle multiple currencies** if serving global customers
- **Store Razorpay IDs locally** for quick reference
- **Use webhooks for order fulfillment** — more reliable than redirect-based confirmation
- **Consider payment method preferences** — UPI is preferred for amounts under ₹2000
- **Use payment links for invoicing** — easier for customers
- **Monitor settlement timelines** — T+2 for most methods, instant for UPI
- **Test with Indian test cards** and UPI test numbers during development
- **Comply with RBI regulations** — PCI DSS compliance required