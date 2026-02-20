---
name: stripe-webhooks
description: >-
  Handle Stripe webhook events reliably for payment confirmations, subscription
  updates, failed payments, and customer lifecycle management. Implement secure
  webhook processing with proper validation, idempotency, and error handling.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["stripe", "webhooks", "events", "automation", "security"]
---

# Stripe Webhooks

Build reliable webhook processing systems to handle Stripe events including payments, subscriptions, disputes, and customer updates in real-time.

## Overview

Stripe webhooks deliver real-time notifications about events in your Stripe account. They're essential for order fulfillment, subscription management, and maintaining data consistency between Stripe and your application.

## Authentication

```javascript
// Install required packages
// npm install stripe express

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
```

## Instructions

### Step 1 — Webhook Endpoint Setup

```javascript
// Basic webhook handler with signature verification
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  handleStripeEvent(event)
    .then(() => res.json({received: true}))
    .catch(error => {
      console.error('Webhook processing failed:', error);
      res.status(500).json({error: 'Webhook processing failed'});
    });
});

// Robust event handler with logging and error recovery
async function handleStripeEvent(event) {
  console.log(`Processing event: ${event.type} (${event.id})`);
  
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    await logWebhookEvent(event, 'processed');
  } catch (error) {
    await logWebhookEvent(event, 'failed', error.message);
    throw error;
  }
}
```

### Step 2 — Payment Event Handlers

```javascript
// Handle successful payments
async function handlePaymentSucceeded(paymentIntent) {
  console.log(`Payment succeeded: ${paymentIntent.id}`);
  
  // Extract order information from metadata
  const orderId = paymentIntent.metadata.order_id;
  const userId = paymentIntent.metadata.user_id;
  
  if (orderId) {
    await updateOrderStatus(orderId, 'paid');
    await fulfillOrder(orderId);
  }
  
  if (userId) {
    await recordPaymentForUser(userId, {
      stripePaymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: 'succeeded'
    });
  }
  
  // Send confirmation email
  if (paymentIntent.receipt_email) {
    await sendPaymentConfirmationEmail(
      paymentIntent.receipt_email,
      paymentIntent
    );
  }
}

// Handle failed payments
async function handlePaymentFailed(paymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);
  
  const orderId = paymentIntent.metadata.order_id;
  const userId = paymentIntent.metadata.user_id;
  
  if (orderId) {
    await updateOrderStatus(orderId, 'payment_failed');
  }
  
  if (userId) {
    await recordPaymentForUser(userId, {
      stripePaymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: 'failed',
      failureReason: paymentIntent.last_payment_error?.message
    });
    
    await sendPaymentFailedEmail(userId, {
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      reason: paymentIntent.last_payment_error?.message
    });
  }
}

// Handle checkout session completion
async function handleCheckoutSessionCompleted(session) {
  console.log(`Checkout session completed: ${session.id}`);
  
  if (session.mode === 'payment') {
    await handleOneTimePaymentCompleted(session);
  } else if (session.mode === 'subscription') {
    await handleSubscriptionPaymentCompleted(session);
  }
}

async function handleOneTimePaymentCompleted(session) {
  const customerEmail = session.customer_details?.email;
  const orderId = session.metadata?.order_id;
  
  if (orderId) {
    await updateOrderStatus(orderId, 'completed');
    await fulfillOrder(orderId);
    
    if (customerEmail) {
      await sendOrderConfirmationEmail(customerEmail, orderId);
    }
  }
}
```

### Step 3 — Subscription Event Handlers

```javascript
// Handle subscription lifecycle events
async function handleSubscriptionCreated(subscription) {
  console.log(`Subscription created: ${subscription.id}`);
  
  const customerId = subscription.customer;
  const userId = subscription.metadata.user_id;
  
  if (userId) {
    await updateUserSubscription(userId, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    });
    
    // Activate user's plan features
    const planType = subscription.metadata.plan_type;
    if (planType) {
      await activateUserPlan(userId, planType);
    }
    
    // Send welcome email
    const customer = await stripe.customers.retrieve(customerId);
    await sendSubscriptionWelcomeEmail(customer.email, {
      planType: planType,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    });
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log(`Subscription updated: ${subscription.id}`);
  
  const userId = subscription.metadata.user_id;
  const previousAttributes = subscription.previous_attributes;
  
  if (userId) {
    await updateUserSubscription(userId, {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
    
    // Handle plan changes
    if (previousAttributes?.items) {
      await handlePlanChange(userId, subscription, previousAttributes);
    }
    
    // Handle cancellation
    if (subscription.cancel_at_period_end && !previousAttributes?.cancel_at_period_end) {
      await handleSubscriptionCancellationScheduled(userId, subscription);
    }
  }
}

async function handleSubscriptionCanceled(subscription) {
  console.log(`Subscription canceled: ${subscription.id}`);
  
  const userId = subscription.metadata.user_id;
  
  if (userId) {
    await updateUserSubscription(userId, {
      status: 'canceled',
      canceledAt: new Date()
    });
    
    // Deactivate premium features
    await deactivateUserPlan(userId);
    
    // Send cancellation confirmation
    const customer = await stripe.customers.retrieve(subscription.customer);
    await sendSubscriptionCanceledEmail(customer.email, {
      subscriptionId: subscription.id,
      accessUntil: new Date(subscription.current_period_end * 1000)
    });
  }
}

async function handleTrialWillEnd(subscription) {
  console.log(`Trial ending soon: ${subscription.id}`);
  
  const userId = subscription.metadata.user_id;
  const customer = await stripe.customers.retrieve(subscription.customer);
  
  const trialEnd = new Date(subscription.trial_end * 1000);
  const daysLeft = Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
  
  await sendTrialEndingEmail(customer.email, {
    daysLeft: daysLeft,
    trialEndDate: trialEnd,
    planType: subscription.metadata.plan_type
  });
  
  // Create in-app notification
  if (userId) {
    await createNotification(userId, {
      type: 'trial_ending',
      title: `Your trial ends in ${daysLeft} days`,
      message: 'Add a payment method to continue your subscription.',
      actionUrl: '/billing/payment-method'
    });
  }
}
```

### Step 4 — Advanced Webhook Patterns

```javascript
// Idempotent webhook processing to handle duplicate events
class WebhookProcessor {
  constructor() {
    this.processedEvents = new Set();
  }
  
  async processEvent(event) {
    // Check if event was already processed
    if (await this.isEventProcessed(event.id)) {
      console.log(`Event ${event.id} already processed, skipping`);
      return;
    }
    
    try {
      await this.handleEvent(event);
      await this.markEventProcessed(event.id);
    } catch (error) {
      console.error(`Failed to process event ${event.id}:`, error);
      throw error;
    }
  }
  
  async isEventProcessed(eventId) {
    // Check database or cache for processed events
    const processed = await db.processedWebhooks.findOne({ eventId });
    return !!processed;
  }
  
  async markEventProcessed(eventId) {
    await db.processedWebhooks.create({
      eventId: eventId,
      processedAt: new Date()
    });
  }
  
  async handleEvent(event) {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }
  
  async handleInvoicePaymentSucceeded(invoice) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.user_id;
    
    if (userId) {
      await recordPayment(userId, {
        invoiceId: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        paidAt: new Date(invoice.status_transitions.paid_at * 1000),
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000)
      });
      
      // Extend access if subscription was past due
      if (subscription.status === 'past_due') {
        await reactivateUserAccess(userId);
      }
    }
  }
  
  async handleInvoicePaymentFailed(invoice) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.user_id;
    
    if (userId) {
      const attemptCount = invoice.attempt_count;
      
      await recordFailedPayment(userId, {
        invoiceId: invoice.id,
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        attemptCount: attemptCount,
        failedAt: new Date()
      });
      
      // Handle dunning management
      if (attemptCount === 1) {
        await sendPaymentRetryEmail(userId, invoice);
      } else if (attemptCount >= 3) {
        await suspendUserAccess(userId);
        await sendAccountSuspensionEmail(userId, invoice);
      }
    }
  }
}

// Webhook retry mechanism
class WebhookRetryHandler {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }
  
  async processWithRetry(event) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.processEvent(event);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`Webhook processing attempt ${attempt} failed:`, error);
        
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed, log for manual review
    await this.logFailedWebhook(event, lastError);
    throw lastError;
  }
  
  async logFailedWebhook(event, error) {
    await db.failedWebhooks.create({
      eventId: event.id,
      eventType: event.type,
      eventData: event.data,
      error: error.message,
      failedAt: new Date()
    });
  }
}
```

### Step 5 — Webhook Testing and Monitoring

```javascript
// Webhook testing utilities
class WebhookTester {
  // Simulate webhook events for testing
  async simulateEvent(eventType, data) {
    const mockEvent = {
      id: `evt_test_${Date.now()}`,
      type: eventType,
      data: { object: data },
      created: Math.floor(Date.now() / 1000)
    };
    
    return await handleStripeEvent(mockEvent);
  }
  
  // Test subscription creation flow
  async testSubscriptionFlow() {
    const mockSubscription = {
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      metadata: {
        user_id: 'test_user_123',
        plan_type: 'pro'
      }
    };
    
    await this.simulateEvent('customer.subscription.created', mockSubscription);
    console.log('Subscription creation test completed');
  }
  
  // Test payment failure handling
  async testPaymentFailure() {
    const mockPaymentIntent = {
      id: 'pi_test_failed',
      amount: 2000,
      currency: 'usd',
      status: 'requires_payment_method',
      last_payment_error: {
        message: 'Your card was declined.'
      },
      metadata: {
        user_id: 'test_user_123',
        order_id: 'order_123'
      }
    };
    
    await this.simulateEvent('payment_intent.payment_failed', mockPaymentIntent);
    console.log('Payment failure test completed');
  }
}

// Webhook monitoring and alerting
async function monitorWebhookHealth() {
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Check for failed webhooks
  const failedWebhooks = await db.failedWebhooks.count({
    failedAt: { $gte: last24Hours }
  });
  
  // Check for processing delays
  const avgProcessingTime = await db.webhookLogs.aggregate([
    { $match: { createdAt: { $gte: last24Hours } } },
    { $group: { _id: null, avgTime: { $avg: '$processingTime' } } }
  ]);
  
  if (failedWebhooks > 10) {
    await sendAlert('High webhook failure rate', {
      failedCount: failedWebhooks,
      timeframe: '24 hours'
    });
  }
  
  if (avgProcessingTime[0]?.avgTime > 5000) {
    await sendAlert('Slow webhook processing', {
      avgTime: avgProcessingTime[0].avgTime,
      threshold: 5000
    });
  }
}

// Run monitoring every hour
setInterval(monitorWebhookHealth, 60 * 60 * 1000);
```

## Guidelines

- **Always verify webhook signatures** to ensure events are from Stripe
- **Implement idempotent processing** — handle duplicate events gracefully
- **Use proper error handling** and return appropriate HTTP status codes
- **Process webhooks quickly** — acknowledge receipt within 20 seconds
- **Use HTTPS endpoints** in production — Stripe requires secure delivery
- **Log all webhook events** for debugging and audit purposes
- **Implement retry logic** for transient failures
- **Monitor webhook health** — track failure rates and processing times
- **Handle all relevant event types** for your use case
- **Use metadata extensively** for linking events to your application data
- **Test webhook handling** thoroughly with Stripe's webhook testing tools
- **Set up alerting** for webhook failures and anomalies