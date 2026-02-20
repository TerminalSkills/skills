---
name: paddle-billing
description: >-
  Implement subscriptions and checkout with Paddle's merchant of record platform. 
  Handle global tax compliance, fraud protection, subscription management, and 
  checkout flows with Paddle's hosted or overlay solutions.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["paddle", "subscriptions", "billing", "merchant-of-record", "tax-compliance"]
---

# Paddle Billing

Build global subscription and payment systems using Paddle as your merchant of record for automatic tax compliance and fraud protection.

## Overview

Paddle acts as the merchant of record, handling global tax compliance (VAT, sales tax), fraud protection, and customer support for chargebacks and refunds. Perfect for SaaS businesses wanting to sell globally without dealing with tax registration.

## Authentication

```javascript
// Install Paddle SDK
// npm install @paddle/paddle-js @paddle/paddle-node-sdk

// Frontend Paddle.js
import { Paddle } from '@paddle/paddle-js';

const paddle = new Paddle(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, {
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
});

// Backend Paddle API
const { PaddleAPI } = require('@paddle/paddle-node-sdk');

const paddleApi = new PaddleAPI({
  apiKey: process.env.PADDLE_API_KEY,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
});
```

## Instructions

### Step 1 — Set Up Products and Prices

```javascript
// Create a product (backend)
async function createProduct(productData) {
  const product = await paddleApi.products.create({
    name: productData.name,
    description: productData.description,
    type: 'standard',
    tax_category: 'standard',
    custom_data: {
      features: JSON.stringify(productData.features),
      plan_type: productData.planType
    }
  });
  
  return product;
}

// Create pricing for the product
async function createPrice(productId, priceData) {
  const price = await paddleApi.prices.create({
    product_id: productId,
    description: priceData.description,
    billing_cycle: priceData.billingCycle, // { interval: 'month', frequency: 1 }
    trial_period: priceData.trialPeriod,   // { interval: 'day', frequency: 14 }
    unit_price: {
      amount: (priceData.amount * 100).toString(), // Amount in cents
      currency_code: priceData.currency || 'USD'
    },
    custom_data: {
      plan_name: priceData.planName
    }
  });
  
  return price;
}
```

### Step 2 — Implement Paddle Checkout

```javascript
// Frontend checkout implementation
class PaddleCheckout {
  constructor(paddleInstance) {
    this.paddle = paddleInstance;
  }
  
  // Open checkout overlay for subscription
  async openSubscriptionCheckout(priceId, customerData = {}) {
    const checkout = await this.paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: {
        email: customerData.email,
        name: customerData.name
      },
      customData: {
        user_id: customerData.userId,
        utm_source: customerData.utmSource || 'direct'
      },
      settings: {
        displayMode: 'overlay',
        theme: 'light'
      }
    });
    
    return checkout;
  }
  
  // One-time payment checkout
  async openOneTimeCheckout(items, customerData = {}) {
    const checkoutItems = items.map(item => ({
      priceId: item.priceId,
      quantity: item.quantity || 1
    }));
    
    const checkout = await this.paddle.Checkout.open({
      items: checkoutItems,
      customer: customerData,
      customData: {
        order_type: 'one_time',
        user_id: customerData.userId
      }
    });
    
    return checkout;
  }
}

// Usage example
const checkoutManager = new PaddleCheckout(paddle);

document.getElementById('upgrade-btn').addEventListener('click', async () => {
  const checkout = await checkoutManager.openSubscriptionCheckout(
    'pri_01h1vjes17h4ycg3n8k35w1sb6',
    {
      userId: currentUser.id,
      email: currentUser.email,
      name: currentUser.name
    }
  );
  
  checkout.on('checkout.completed', (data) => {
    window.location.href = `/success?transaction=${data.transaction_id}`;
  });
});
```

### Step 3 — Webhook Integration

```javascript
// Webhook handler for Paddle events
const crypto = require('crypto');

app.post('/paddle-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['paddle-signature'];
  const body = req.body.toString();
  
  if (!verifyPaddleWebhook(body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = JSON.parse(body);
  await handlePaddleEvent(event);
  
  res.status(200).json({ success: true });
});

function verifyPaddleWebhook(body, signature) {
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

async function handlePaddleEvent(event) {
  switch (event.event_type) {
    case 'transaction.completed':
      await handleTransactionCompleted(event.data);
      break;
    case 'subscription.created':
      await handleSubscriptionCreated(event.data);
      break;
    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;
    case 'subscription.canceled':
      await handleSubscriptionCanceled(event.data);
      break;
    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }
}
```

### Step 4 — Subscription Management

```javascript
// Subscription management functions
class PaddleSubscriptionManager {
  // Get subscription details
  async getSubscription(subscriptionId) {
    const subscription = await paddleApi.subscriptions.get(subscriptionId);
    return this.formatSubscription(subscription);
  }
  
  // Update subscription (change plan)
  async changeSubscriptionPlan(subscriptionId, newPriceId) {
    const updatedSubscription = await paddleApi.subscriptions.update(subscriptionId, {
      items: [{ price_id: newPriceId, quantity: 1 }],
      proration_billing_mode: 'prorated_immediately'
    });
    
    return updatedSubscription;
  }
  
  // Cancel subscription
  async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
    const cancelledSubscription = await paddleApi.subscriptions.cancel(subscriptionId, {
      effective_from: cancelAtPeriodEnd ? 'next_billing_period' : 'immediately'
    });
    
    return cancelledSubscription;
  }
  
  // Pause subscription
  async pauseSubscription(subscriptionId, resumeAt = null) {
    const pauseData = {
      effective_from: 'next_billing_period'
    };
    
    if (resumeAt) {
      pauseData.resume_at = resumeAt.toISOString();
    }
    
    const pausedSubscription = await paddleApi.subscriptions.pause(subscriptionId, pauseData);
    return pausedSubscription;
  }
  
  formatSubscription(subscription) {
    return {
      id: subscription.id,
      status: subscription.status,
      currentStart: subscription.current_start ? new Date(subscription.current_start * 1000) : null,
      currentEnd: subscription.current_end ? new Date(subscription.current_end * 1000) : null,
      customerEmail: subscription.customer_email
    };
  }
}

// API endpoints for subscription management
const subscriptionManager = new PaddleSubscriptionManager();

app.get('/api/subscription/:id', async (req, res) => {
  try {
    const subscription = await subscriptionManager.getSubscription(req.params.id);
    res.json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/:id/cancel', async (req, res) => {
  try {
    const { cancelAtPeriodEnd } = req.body;
    const cancelled = await subscriptionManager.cancelSubscription(
      req.params.id, 
      cancelAtPeriodEnd
    );
    res.json(cancelled);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Step 5 — Customer and Transaction Management

```javascript
// Customer management
async function createOrUpdateCustomer(userData) {
  // Check if customer exists
  const existingCustomers = await paddleApi.customers.list({
    email: userData.email
  });
  
  if (existingCustomers.data.length > 0) {
    const customerId = existingCustomers.data[0].id;
    const updatedCustomer = await paddleApi.customers.update(customerId, {
      name: userData.name,
      email: userData.email
    });
    return updatedCustomer;
  } else {
    const newCustomer = await paddleApi.customers.create({
      name: userData.name,
      email: userData.email,
      custom_data: {
        user_id: userData.userId
      }
    });
    return newCustomer;
  }
}

// Transaction queries and management
async function getTransactionHistory(customerId, limit = 10) {
  const transactions = await paddleApi.transactions.list({
    customer_id: customerId,
    status: ['completed', 'paid'],
    per_page: limit
  });
  
  return transactions.data.map(transaction => ({
    id: transaction.id,
    amount: parseFloat(transaction.details.totals.grand_total.amount) / 100,
    currency: transaction.currency_code,
    status: transaction.status,
    createdAt: new Date(transaction.created_at)
  }));
}
```

## Guidelines

- **Use Paddle as merchant of record** for automatic tax compliance in 200+ countries
- **Implement proper webhook signature verification** to ensure event authenticity  
- **Handle all subscription lifecycle events** — creation, updates, cancellations
- **Leverage Paddle's fraud protection** — transactions are automatically screened
- **Use custom_data fields** to link Paddle customers to your user system
- **Test thoroughly in sandbox** before going live
- **Monitor key metrics** — MRR, churn, customer lifetime value
- **Use Paddle's hosted checkout** for optimal conversion rates and security
- **Consider proration strategies** when users change plans
- **Store Paddle IDs locally** for quick access while keeping Paddle as source of truth