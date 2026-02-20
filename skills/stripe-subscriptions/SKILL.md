---
name: stripe-subscriptions
description: >-
  Build recurring billing systems with Stripe Subscriptions. Handle subscription
  creation, plan changes, prorations, usage-based billing, trial periods, and
  customer lifecycle management with comprehensive webhook integration.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["stripe", "subscriptions", "recurring-billing", "saas", "webhooks"]
---

# Stripe Subscriptions

Build sophisticated recurring billing systems using Stripe's subscription management platform for SaaS applications, membership sites, and usage-based services.

## Overview

Stripe Subscriptions provides complete subscription lifecycle management including trials, plan changes, proration, dunning management, and usage-based billing. Perfect for SaaS platforms requiring flexible billing models.

## Authentication

```javascript
// Install Stripe SDK
// npm install stripe

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

## Instructions

### Step 1 — Set Up Products and Pricing

```javascript
// Create a subscription product
async function createProduct(productData) {
  const product = await stripe.products.create({
    name: productData.name,
    description: productData.description,
    metadata: {
      category: productData.category,
      features: JSON.stringify(productData.features)
    }
  });
  
  return product;
}

// Create pricing plans for the product
async function createPricingPlans(productId, plans) {
  const prices = [];
  
  for (const plan of plans) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.amount * 100, // Convert to cents
      currency: plan.currency || 'usd',
      recurring: {
        interval: plan.interval, // 'month' or 'year'
        interval_count: plan.intervalCount || 1
      },
      metadata: {
        plan_name: plan.name,
        features: JSON.stringify(plan.features)
      }
    });
    
    prices.push(price);
  }
  
  return prices;
}

// Usage-based pricing for metered billing
async function createUsageBasedPrice(productId, unitAmount, currency = 'usd') {
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: currency,
    recurring: {
      interval: 'month',
      usage_type: 'metered'
    },
    billing_scheme: 'per_unit'
  });
  
  return price;
}
```

### Step 2 — Create and Manage Subscriptions

```javascript
// Create subscription with trial period
async function createSubscription(customerId, priceId, options = {}) {
  const subscriptionData = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription'
    },
    expand: ['latest_invoice.payment_intent'],
    metadata: options.metadata || {}
  };
  
  // Add trial period if specified
  if (options.trialPeriodDays) {
    subscriptionData.trial_period_days = options.trialPeriodDays;
  }
  
  // Add coupon if specified
  if (options.couponId) {
    subscriptionData.coupon = options.couponId;
  }
  
  const subscription = await stripe.subscriptions.create(subscriptionData);
  
  return {
    subscriptionId: subscription.id,
    clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
    status: subscription.status,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  };
}

// Update subscription (change plan, quantity, etc.)
async function updateSubscription(subscriptionId, updateData) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  const updateParams = {
    proration_behavior: updateData.prorationBehavior || 'create_prorations',
    billing_cycle_anchor: updateData.billingCycleAnchor || 'unchanged'
  };
  
  // Update subscription items
  if (updateData.newPriceId) {
    updateParams.items = [{
      id: subscription.items.data[0].id,
      price: updateData.newPriceId,
      quantity: updateData.quantity || 1
    }];
  }
  
  // Update metadata
  if (updateData.metadata) {
    updateParams.metadata = { ...subscription.metadata, ...updateData.metadata };
  }
  
  const updatedSubscription = await stripe.subscriptions.update(subscriptionId, updateParams);
  return updatedSubscription;
}

// Cancel subscription
async function cancelSubscription(subscriptionId, cancelImmediately = false) {
  if (cancelImmediately) {
    return await stripe.subscriptions.cancel(subscriptionId);
  } else {
    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  }
}
```

### Step 3 — Handle Usage-Based Billing

```javascript
// Report usage for metered billing
async function reportUsage(subscriptionItemId, quantity, timestamp = null) {
  const usageRecord = await stripe.subscriptionItems.createUsageRecord(
    subscriptionItemId,
    {
      quantity: quantity,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      action: 'set' // or 'increment'
    }
  );
  
  return usageRecord;
}

// Get usage summary for a subscription item
async function getUsageSummary(subscriptionItemId, options = {}) {
  const summary = await stripe.subscriptionItems.listUsageRecordSummaries(
    subscriptionItemId,
    {
      limit: options.limit || 10,
      ending_before: options.endingBefore,
      starting_after: options.startingAfter
    }
  );
  
  return summary.data;
}

// Comprehensive usage tracking service
class UsageTracker {
  constructor(subscriptionId) {
    this.subscriptionId = subscriptionId;
  }
  
  async trackApiUsage(apiCalls) {
    const subscription = await stripe.subscriptions.retrieve(this.subscriptionId, {
      expand: ['items.data']
    });
    
    const meteredItem = subscription.items.data.find(item => 
      item.price.recurring?.usage_type === 'metered'
    );
    
    if (meteredItem) {
      await reportUsage(meteredItem.id, apiCalls);
    }
  }
  
  async getMonthlyUsage() {
    const subscription = await stripe.subscriptions.retrieve(this.subscriptionId, {
      expand: ['items.data']
    });
    
    const meteredItem = subscription.items.data.find(item => 
      item.price.recurring?.usage_type === 'metered'
    );
    
    if (meteredItem) {
      return await getUsageSummary(meteredItem.id, { limit: 1 });
    }
    
    return [];
  }
}
```

### Step 4 — Subscription Lifecycle Management

```javascript
// Comprehensive subscription manager
class SubscriptionManager {
  // Get subscription with expanded details
  async getSubscriptionDetails(subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: [
        'customer',
        'items.data.price.product',
        'latest_invoice',
        'default_payment_method'
      ]
    });
    
    return {
      id: subscription.id,
      status: subscription.status,
      customer: subscription.customer,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      items: subscription.items.data.map(item => ({
        id: item.id,
        priceId: item.price.id,
        quantity: item.quantity,
        productName: item.price.product.name,
        unitAmount: item.price.unit_amount,
        interval: item.price.recurring?.interval
      }))
    };
  }
  
  // Handle subscription upgrades/downgrades
  async changePlan(subscriptionId, newPriceId, prorationBehavior = 'create_prorations') {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }],
      proration_behavior: prorationBehavior
    });
    
    return updatedSubscription;
  }
  
  // Pause subscription
  async pauseSubscription(subscriptionId, resumeAt = null) {
    const pauseCollection = {
      behavior: 'void'
    };
    
    if (resumeAt) {
      pauseCollection.resumes_at = Math.floor(resumeAt.getTime() / 1000);
    }
    
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: pauseCollection
    });
    
    return subscription;
  }
  
  // Resume paused subscription
  async resumeSubscription(subscriptionId) {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: ''
    });
    
    return subscription;
  }
}
```

### Step 5 — Advanced Features

```javascript
// Create subscription with add-ons and multiple items
async function createComplexSubscription(customerId, subscriptionItems, options = {}) {
  const subscriptionData = {
    customer: customerId,
    items: subscriptionItems.map(item => ({
      price: item.priceId,
      quantity: item.quantity || 1
    })),
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription'
    },
    expand: ['latest_invoice.payment_intent'],
    automatic_tax: { enabled: true }, // Enable automatic tax calculation
    metadata: options.metadata || {}
  };
  
  // Add promotional pricing
  if (options.promotionCode) {
    subscriptionData.promotion_code = options.promotionCode;
  }
  
  // Add trial period
  if (options.trialPeriodDays) {
    subscriptionData.trial_period_days = options.trialPeriodDays;
  }
  
  return await stripe.subscriptions.create(subscriptionData);
}

// Subscription analytics
async function getSubscriptionAnalytics(dateRange) {
  const subscriptions = await stripe.subscriptions.list({
    status: 'active',
    created: dateRange,
    limit: 100
  });
  
  let totalMRR = 0;
  let planBreakdown = {};
  
  for (const subscription of subscriptions.data) {
    for (const item of subscription.items.data) {
      const price = await stripe.prices.retrieve(item.price.id);
      let monthlyRevenue = (price.unit_amount * item.quantity) / 100;
      
      if (price.recurring.interval === 'year') {
        monthlyRevenue = monthlyRevenue / 12;
      }
      
      totalMRR += monthlyRevenue;
      
      const planName = price.metadata.plan_name || 'unknown';
      planBreakdown[planName] = (planBreakdown[planName] || 0) + monthlyRevenue;
    }
  }
  
  return {
    totalMRR: Math.round(totalMRR * 100) / 100,
    planBreakdown: planBreakdown,
    totalActiveSubscriptions: subscriptions.data.length
  };
}
```

## Guidelines

- **Always use webhooks** for subscription state management — don't rely on client-side updates
- **Handle proration carefully** — understand how plan changes affect billing cycles
- **Implement proper trial management** — track trial end dates and conversion events
- **Use metadata extensively** for linking subscriptions to your application data
- **Monitor subscription health** — track metrics like churn rate, MRR, and customer lifetime value
- **Handle failed payments gracefully** — implement dunning management for better retention
- **Test subscription scenarios** thoroughly — plan changes, cancellations, and edge cases
- **Use Stripe's test mode** extensively during development
- **Implement proper error handling** for network failures and API limitations
- **Consider tax implications** — use Stripe Tax for automatic tax calculation and compliance