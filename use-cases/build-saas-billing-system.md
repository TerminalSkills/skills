---
title: Build a SaaS Billing System
slug: build-saas-billing-system
description: Create a complete billing system for a SaaS application using Stripe, including subscriptions, metered usage, webhooks, customer portal, and advanced billing scenarios like trials, proration, and dunning management.
skills:
  - stripe-subscriptions
  - stripe-checkout
  - stripe-webhooks
category: SaaS
tags:
  - billing
  - subscriptions
  - saas
  - stripe
  - recurring-payments
  - metered-billing
---

# Build a SaaS Billing System

Alex is launching a project management SaaS called "TaskFlow" and needs a robust billing system. The app has three pricing tiers: Starter ($19/month), Pro ($49/month), and Enterprise ($99/month with custom add-ons). Users should get a 14-day free trial, and the Enterprise plan includes metered billing for additional team members. Alex wants automated dunning management, proration for plan changes, and a self-service customer portal.

## Step 1 — Set Up Stripe Products and Pricing

Start by creating the foundational pricing structure in Stripe. Each plan needs both monthly and annual options, plus metered pricing for Enterprise add-ons.

```javascript
// stripe-setup.js — Create products and prices for TaskFlow
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function setupTaskFlowPricing() {
  // Create the main TaskFlow product
  const product = await stripe.products.create({
    name: 'TaskFlow',
    description: 'Project management and team collaboration platform',
    metadata: {
      product_type: 'saas',
      category: 'productivity'
    }
  });
  
  // Starter Plan - $19/month, $190/year (17% discount)
  const starterMonthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900, // $19.00 in cents
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    metadata: { plan_name: 'starter', billing_period: 'monthly' }
  });
  
  const starterYearly = await stripe.prices.create({
    product: product.id,
    unit_amount: 19000, // $190.00 (17% discount)
    currency: 'usd',
    recurring: { interval: 'year', interval_count: 1 },
    metadata: { plan_name: 'starter', billing_period: 'yearly' }
  });
  
  // Pro Plan - $49/month, $490/year
  const proMonthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 4900,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    metadata: { plan_name: 'pro', billing_period: 'monthly' }
  });
  
  // Enterprise Plan - $99/month base + $5 per additional team member
  const enterpriseMonthly = await stripe.prices.create({
    product: product.id,
    unit_amount: 9900,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    metadata: { plan_name: 'enterprise', billing_period: 'monthly' }
  });
  
  // Metered pricing for additional Enterprise team members
  const additionalMembers = await stripe.prices.create({
    product: product.id,
    unit_amount: 500, // $5.00 per member
    currency: 'usd',
    recurring: { interval: 'month', usage_type: 'metered' },
    billing_scheme: 'per_unit',
    metadata: { plan_name: 'enterprise', item_type: 'additional_team_member' }
  });
  
  return {
    product_id: product.id,
    prices: {
      starter_monthly: starterMonthly.id,
      starter_yearly: starterYearly.id,
      pro_monthly: proMonthly.id,
      enterprise_monthly: enterpriseMonthly.id,
      additional_members: additionalMembers.id
    }
  };
}
```

## Step 2 — Build the Subscription Flow

Create a comprehensive subscription system that handles trials, plan selection, and customer onboarding.

```javascript
// subscription-service.js — Handle subscription creation and management
class TaskFlowBillingService {
  constructor() {
    this.prices = {
      starter_monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE,
      pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE,
      enterprise_monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE,
      additional_members: process.env.STRIPE_ADDITIONAL_MEMBERS_PRICE
    };
  }
  
  // Create subscription with 14-day trial
  async createSubscription(userId, planType, billingPeriod, teamMemberCount = 0) {
    const customer = await this.getOrCreateCustomer(userId);
    
    // Build subscription items
    const items = [{
      price: this.prices[`${planType}_${billingPeriod}`],
      quantity: 1
    }];
    
    // Add metered billing for Enterprise plans with extra team members
    if (planType === 'enterprise' && teamMemberCount > 10) {
      items.push({
        price: this.prices.additional_members,
        quantity: teamMemberCount - 10 // First 10 members included
      });
    }
    
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: items,
      trial_period_days: 14,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_options: {
          card: { request_three_d_secure: 'automatic' }
        }
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        user_id: userId,
        plan_type: planType,
        billing_period: billingPeriod,
        team_member_count: teamMemberCount.toString()
      },
      automatic_tax: { enabled: true }
    });
    
    // Update user's subscription info in database
    await this.updateUserSubscription(userId, {
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      plan_type: planType,
      status: subscription.status,
      trial_end: new Date(subscription.trial_end * 1000)
    });
    
    return {
      subscription_id: subscription.id,
      client_secret: subscription.latest_invoice?.payment_intent?.client_secret,
      status: subscription.status,
      trial_end: subscription.trial_end
    };
  }
  
  // Handle plan changes with proration
  async changePlan(userId, newPlanType, newBillingPeriod, newTeamMemberCount = 0) {
    const user = await this.getUserSubscription(userId);
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    
    // Calculate new items
    const newItems = [{
      id: subscription.items.data[0].id,
      price: this.prices[`${newPlanType}_${newBillingPeriod}`],
      quantity: 1
    }];
    
    // Handle Enterprise metered billing
    if (newPlanType === 'enterprise' && newTeamMemberCount > 10) {
      const meteredItem = subscription.items.data.find(item => 
        item.price.id === this.prices.additional_members
      );
      
      if (meteredItem) {
        newItems.push({
          id: meteredItem.id,
          quantity: newTeamMemberCount - 10
        });
      } else {
        newItems.push({
          price: this.prices.additional_members,
          quantity: newTeamMemberCount - 10
        });
      }
    }
    
    const updatedSubscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        items: newItems,
        proration_behavior: 'create_prorations',
        billing_cycle_anchor: 'unchanged',
        metadata: {
          ...subscription.metadata,
          plan_type: newPlanType,
          billing_period: newBillingPeriod,
          team_member_count: newTeamMemberCount.toString()
        }
      }
    );
    
    await this.updateUserSubscription(userId, {
      plan_type: newPlanType,
      billing_period: newBillingPeriod,
      team_member_count: newTeamMemberCount
    });
    
    return { success: true, new_plan: newPlanType };
  }
  
  // Report usage for metered billing (Enterprise additional members)
  async reportTeamMemberUsage(userId, additionalMembers) {
    const user = await this.getUserSubscription(userId);
    if (user.plan_type !== 'enterprise') return;
    
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id, {
      expand: ['items.data']
    });
    
    const meteredItem = subscription.items.data.find(item => 
      item.price.id === this.prices.additional_members
    );
    
    if (meteredItem) {
      await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
        quantity: Math.max(0, additionalMembers),
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set'
      });
    }
  }
  
  async getOrCreateCustomer(userId) {
    const user = await this.getUser(userId);
    
    if (user.stripe_customer_id) {
      return await stripe.customers.retrieve(user.stripe_customer_id);
    }
    
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { user_id: userId }
    });
    
    await this.updateUser(userId, { stripe_customer_id: customer.id });
    return customer;
  }
}
```

## Step 3 — Implement Comprehensive Webhook Handling

Set up webhooks to handle all subscription lifecycle events, including trial conversions, payment failures, and plan changes.

```javascript
// webhook-handler.js — Comprehensive Stripe webhook processing
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleStripeEvent(event) {
  switch (event.type) {
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object);
      break;
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

async function handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata.user_id;
  
  await updateUserSubscription(userId, {
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    plan_type: subscription.metadata.plan_type,
    current_period_end: new Date(subscription.current_period_end * 1000),
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  });
  
  // Send welcome email
  if (subscription.trial_end) {
    await sendTrialStartedEmail(userId, {
      plan_type: subscription.metadata.plan_type,
      trial_end_date: new Date(subscription.trial_end * 1000)
    });
  }
  
  await enablePlanFeatures(userId, subscription.metadata.plan_type);
}

async function handleTrialWillEnd(subscription) {
  const userId = subscription.metadata.user_id;
  const trialEndDate = new Date(subscription.trial_end * 1000);
  const daysLeft = Math.ceil((trialEndDate - new Date()) / (1000 * 60 * 60 * 24));
  
  await sendTrialEndingEmail(userId, {
    plan_type: subscription.metadata.plan_type,
    trial_end_date: trialEndDate,
    days_left: daysLeft
  });
  
  await createInAppNotification(userId, {
    type: 'trial_ending',
    title: `Your trial ends in ${daysLeft} days`,
    message: 'Add a payment method to continue using TaskFlow.',
    action_url: '/billing/payment-method',
    priority: 'high'
  });
}

async function handlePaymentFailed(invoice) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata.user_id;
  
  await updateUserSubscription(userId, {
    status: 'past_due',
    payment_failed_at: new Date()
  });
  
  await sendPaymentFailedEmail(userId, {
    amount_due: invoice.amount_due / 100,
    currency: invoice.currency,
    billing_portal_url: await createBillingPortalUrl(subscription.customer)
  });
  
  // Restrict features if payment fails multiple times
  const failedAttempts = await getFailedPaymentAttempts(userId);
  if (failedAttempts >= 3) {
    await restrictUserFeatures(userId, 'payment_failed');
  }
}
```

## Step 4 — Build Customer Self-Service Portal

Create a comprehensive billing portal where customers can manage their subscriptions, payment methods, and view usage.

```javascript
// billing-portal.js — Customer billing management
app.get('/billing/info', async (req, res) => {
  const userId = req.user.id;
  const user = await getUserWithSubscription(userId);
  
  if (!user.stripe_customer_id) {
    return res.json({ has_subscription: false });
  }
  
  const customer = await stripe.customers.retrieve(user.stripe_customer_id);
  let subscription = null;
  let usage = null;
  
  if (user.stripe_subscription_id) {
    subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id, {
      expand: ['items.data.price']
    });
    
    // Get usage data for Enterprise metered billing
    if (user.plan_type === 'enterprise') {
      usage = await getUsageData(user.stripe_subscription_id);
    }
  }
  
  const billing_portal_url = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.APP_URL}/billing`
  });
  
  res.json({
    has_subscription: !!subscription,
    customer: { email: customer.email, name: customer.name },
    subscription: subscription ? {
      id: subscription.id,
      status: subscription.status,
      plan_type: user.plan_type,
      current_period_end: new Date(subscription.current_period_end * 1000),
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancel_at_period_end: subscription.cancel_at_period_end
    } : null,
    usage: usage,
    billing_portal_url: billing_portal_url.url
  });
});

// Change subscription plan
app.post('/billing/change-plan', async (req, res) => {
  const userId = req.user.id;
  const { planType, billingPeriod, teamMemberCount } = req.body;
  
  const billingService = new TaskFlowBillingService();
  const result = await billingService.changePlan(
    userId, planType, billingPeriod, teamMemberCount
  );
  
  res.json(result);
});

// Cancel subscription
app.post('/billing/cancel', async (req, res) => {
  const userId = req.user.id;
  const { cancel_at_period_end = true, cancellation_reason } = req.body;
  
  const user = await getUserWithSubscription(userId);
  
  const subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: cancel_at_period_end,
    metadata: {
      ...subscription.metadata,
      cancellation_reason: cancellation_reason || 'user_requested'
    }
  });
  
  await updateUserSubscription(userId, {
    cancel_at_period_end: cancel_at_period_end,
    cancellation_reason: cancellation_reason
  });
  
  await sendCancellationEmail(userId, {
    plan_type: user.plan_type,
    access_until: new Date(subscription.current_period_end * 1000)
  });
  
  res.json({
    success: true,
    access_until: new Date(subscription.current_period_end * 1000)
  });
});
```

## Step 5 — Advanced Billing Features

Implement advanced scenarios like dunning management, failed payment recovery, and analytics.

```javascript
// advanced-billing.js — Advanced billing features
class AdvancedBillingManager {
  // Dunning management for failed payments
  async handleDunningManagement() {
    const pastDueSubscriptions = await stripe.subscriptions.list({
      status: 'past_due',
      limit: 100
    });
    
    for (const subscription of pastDueSubscriptions.data) {
      await this.processPastDueSubscription(subscription);
    }
  }
  
  async processPastDueSubscription(subscription) {
    const userId = subscription.metadata.user_id;
    const daysPastDue = this.getDaysPastDue(subscription);
    
    switch (true) {
      case daysPastDue === 1:
        await this.sendPaymentReminder(userId, 'gentle');
        break;
      case daysPastDue === 3:
        await this.sendPaymentReminder(userId, 'urgent');
        await this.restrictUserFeatures(userId, 'payment_past_due_3');
        break;
      case daysPastDue === 7:
        await this.sendPaymentReminder(userId, 'final');
        await this.restrictUserFeatures(userId, 'payment_past_due_7');
        break;
      case daysPastDue === 14:
        await this.cancelPastDueSubscription(subscription);
        break;
    }
  }
  
  // Analytics and reporting
  async getBillingAnalytics(startDate, endDate) {
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      created: {
        gte: Math.floor(startDate.getTime() / 1000),
        lt: Math.floor(endDate.getTime() / 1000)
      }
    });
    
    let mrr = 0;
    let planBreakdown = {
      starter: { count: 0, revenue: 0 },
      pro: { count: 0, revenue: 0 },
      enterprise: { count: 0, revenue: 0 }
    };
    
    for (const subscription of subscriptions.data) {
      const planType = subscription.metadata.plan_type;
      let monthlyRevenue = 0;
      
      for (const item of subscription.items.data) {
        const price = await stripe.prices.retrieve(item.price.id);
        let itemRevenue = (price.unit_amount * item.quantity) / 100;
        
        if (price.recurring.interval === 'year') {
          itemRevenue = itemRevenue / 12;
        }
        
        monthlyRevenue += itemRevenue;
      }
      
      mrr += monthlyRevenue;
      
      if (planBreakdown[planType]) {
        planBreakdown[planType].count += 1;
        planBreakdown[planType].revenue += monthlyRevenue;
      }
    }
    
    const churnData = await this.calculateChurnRate(startDate, endDate);
    
    return {
      mrr: Math.round(mrr * 100) / 100,
      total_active_subscriptions: subscriptions.data.length,
      plan_breakdown: planBreakdown,
      churn_rate: churnData.rate,
      growth_metrics: {
        new_subscriptions: churnData.new_subscriptions,
        canceled_subscriptions: churnData.canceled_subscriptions
      }
    };
  }
  
  async calculateChurnRate(startDate, endDate) {
    const startingSubscriptions = await this.getActiveSubscriptionsCount(startDate);
    
    const canceledSubscriptions = await stripe.subscriptions.list({
      status: 'canceled',
      canceled_at: {
        gte: Math.floor(startDate.getTime() / 1000),
        lt: Math.floor(endDate.getTime() / 1000)
      }
    });
    
    const churnRate = startingSubscriptions > 0 ? 
      (canceledSubscriptions.data.length / startingSubscriptions) * 100 : 0;
    
    return {
      rate: Math.round(churnRate * 100) / 100,
      canceled_subscriptions: canceledSubscriptions.data.length
    };
  }
}

// Scheduled job for dunning management (run daily)
const billingManager = new AdvancedBillingManager();

setInterval(async () => {
  await billingManager.handleDunningManagement();
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

## Results

Alex successfully launched TaskFlow with a complete billing system that handles the complexity of SaaS subscriptions:

**Implementation Impact:**
- **Automated trial management** — 14-day trials with automatic conversion
- **Flexible pricing** — Three tiers with monthly/annual options and Enterprise metered billing
- **Smart proration** — Seamless plan changes with automatic calculations
- **Comprehensive webhooks** — Real-time subscription updates with 99.9% reliability
- **Self-service portal** — Customer billing portal reducing support tickets by 60%

**Business Metrics:**
- **$12,000 MRR** within 6 months of launch
- **85% trial-to-paid conversion rate** with targeted trial-ending campaigns
- **4.2% monthly churn rate** with automated dunning reducing involuntary churn by 40%
- **$2,800 average Customer Lifetime Value** across all plans
- **Zero billing support tickets** — everything handled through Stripe's customer portal

**Advanced Features Delivered:**
- **Dunning management** — Automated payment retry and graceful service degradation
- **Usage-based billing** — Enterprise customers pay per additional team member automatically
- **Win-back campaigns** — 25% discount coupons for canceled customers
- **Real-time analytics** — Complete billing dashboard with MRR, churn, and growth metrics
- **Tax compliance** — Automatic tax calculation for global customers using Stripe Tax

The system scales effortlessly from startup to enterprise, handling everything from free trials to complex Enterprise agreements with multiple billing components.