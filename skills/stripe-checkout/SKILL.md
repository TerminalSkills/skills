---
name: stripe-checkout
description: >-
  Accept payments using Stripe Checkout for one-time purchases and subscriptions.
  Handle secure payment processing, customize checkout flows, manage success/failure
  scenarios, and integrate with existing applications seamlessly.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["stripe", "checkout", "payments", "e-commerce", "security"]
---

# Stripe Checkout

Implement secure payment processing using Stripe's pre-built checkout experience for both one-time payments and subscription billing.

## Overview

Stripe Checkout provides a conversion-optimized, mobile-ready payment page that handles the complexity of payment processing. It supports multiple payment methods, automatic tax calculation, and international markets with minimal integration effort.

## Authentication

```javascript
// Install Stripe SDK
// npm install stripe

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

## Instructions

### Step 1 — Basic Checkout Session

```javascript
// Create checkout session for one-time payment
async function createCheckoutSession(items, options = {}) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: items.map(item => ({
      price_data: {
        currency: item.currency || 'usd',
        product_data: {
          name: item.name,
          description: item.description,
          images: item.images || []
        },
        unit_amount: item.amount * 100 // Convert to cents
      },
      quantity: item.quantity || 1
    })),
    mode: 'payment',
    success_url: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.DOMAIN}/cancel`,
    metadata: options.metadata || {}
  });
  
  return session;
}

// Frontend integration
async function redirectToCheckout(items, customerData = {}) {
  const response = await fetch('/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items,
      customer: customerData
    })
  });
  
  const { sessionId } = await response.json();
  
  // Redirect to Stripe Checkout
  const stripe = Stripe(process.env.STRIPE_PUBLISHABLE_KEY);
  const { error } = await stripe.redirectToCheckout({ sessionId });
  
  if (error) {
    console.error('Checkout error:', error);
  }
}
```

### Step 2 — Subscription Checkout

```javascript
// Create checkout session for subscription
async function createSubscriptionCheckout(priceId, options = {}) {
  const sessionData = {
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,
      quantity: options.quantity || 1
    }],
    mode: 'subscription',
    success_url: `${process.env.DOMAIN}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.DOMAIN}/pricing`,
    metadata: options.metadata || {}
  };
  
  // Add trial period
  if (options.trialPeriodDays) {
    sessionData.subscription_data = {
      trial_period_days: options.trialPeriodDays
    };
  }
  
  // Add customer data
  if (options.customerEmail) {
    sessionData.customer_email = options.customerEmail;
  }
  
  // Add coupon
  if (options.couponId) {
    sessionData.discounts = [{ coupon: options.couponId }];
  }
  
  const session = await stripe.checkout.sessions.create(sessionData);
  return session;
}

// Handle subscription checkout with existing customer
async function createSubscriptionCheckoutForCustomer(customerId, priceId, options = {}) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer: customerId,
    line_items: [{
      price: priceId,
      quantity: options.quantity || 1
    }],
    mode: 'subscription',
    success_url: `${process.env.DOMAIN}/dashboard?upgraded=true`,
    cancel_url: `${process.env.DOMAIN}/pricing`,
    subscription_data: {
      trial_period_days: options.trialPeriodDays || 0,
      metadata: options.metadata || {}
    }
  });
  
  return session;
}
```

### Step 3 — Advanced Checkout Customization

```javascript
// Comprehensive checkout configuration
async function createAdvancedCheckout(checkoutConfig) {
  const sessionData = {
    payment_method_types: checkoutConfig.paymentMethods || ['card'],
    mode: checkoutConfig.mode || 'payment',
    success_url: checkoutConfig.successUrl,
    cancel_url: checkoutConfig.cancelUrl,
    
    // Line items
    line_items: checkoutConfig.items.map(item => {
      if (item.priceId) {
        // Use existing price
        return {
          price: item.priceId,
          quantity: item.quantity || 1
        };
      } else {
        // Create price data inline
        return {
          price_data: {
            currency: item.currency || 'usd',
            product_data: {
              name: item.name,
              description: item.description,
              images: item.images
            },
            unit_amount: item.amount * 100
          },
          quantity: item.quantity || 1
        };
      }
    }),
    
    // Customer information
    ...(checkoutConfig.customerId && { customer: checkoutConfig.customerId }),
    ...(checkoutConfig.customerEmail && { customer_email: checkoutConfig.customerEmail }),
    
    // Billing and shipping
    billing_address_collection: checkoutConfig.collectBillingAddress ? 'required' : 'auto',
    ...(checkoutConfig.collectShippingAddress && {
      shipping_address_collection: {
        allowed_countries: checkoutConfig.allowedCountries || ['US', 'CA']
      }
    }),
    
    // Phone number collection
    ...(checkoutConfig.collectPhoneNumber && {
      phone_number_collection: { enabled: true }
    }),
    
    // Automatic tax calculation
    ...(checkoutConfig.enableAutomaticTax && {
      automatic_tax: { enabled: true }
    }),
    
    // Custom fields
    ...(checkoutConfig.customFields && {
      custom_fields: checkoutConfig.customFields.map(field => ({
        key: field.key,
        label: { type: 'custom', custom: field.label },
        type: field.type,
        ...(field.required && { optional: false })
      }))
    }),
    
    metadata: checkoutConfig.metadata || {}
  };
  
  // Add subscription-specific data
  if (checkoutConfig.mode === 'subscription') {
    sessionData.subscription_data = {
      trial_period_days: checkoutConfig.trialPeriodDays || 0,
      metadata: checkoutConfig.subscriptionMetadata || {}
    };
    
    if (checkoutConfig.couponId) {
      sessionData.discounts = [{ coupon: checkoutConfig.couponId }];
    }
  }
  
  const session = await stripe.checkout.sessions.create(sessionData);
  return session;
}

// Multi-currency checkout
async function createMultiCurrencyCheckout(items, currency, customerCountry) {
  // Adjust pricing based on currency and country
  const adjustedItems = items.map(item => ({
    ...item,
    currency: currency,
    amount: convertPrice(item.amount, 'usd', currency) // Your currency conversion logic
  }));
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: getPaymentMethodsForCountry(customerCountry),
    line_items: adjustedItems.map(item => ({
      price_data: {
        currency: currency,
        product_data: {
          name: item.name,
          description: item.description
        },
        unit_amount: Math.round(item.amount * 100)
      },
      quantity: item.quantity || 1
    })),
    mode: 'payment',
    success_url: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.DOMAIN}/cancel`,
    automatic_tax: { enabled: true },
    billing_address_collection: 'required'
  });
  
  return session;
}
```

### Step 4 — Checkout Completion Handling

```javascript
// Verify and process completed checkout
async function handleCheckoutCompletion(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer', 'subscription']
    });
    
    if (session.payment_status === 'paid') {
      const orderData = {
        sessionId: session.id,
        customerId: session.customer?.id,
        customerEmail: session.customer_details?.email,
        amountTotal: session.amount_total / 100,
        currency: session.currency,
        paymentStatus: session.payment_status,
        items: session.line_items.data,
        metadata: session.metadata
      };
      
      if (session.mode === 'subscription') {
        orderData.subscriptionId = session.subscription?.id;
        return await processSubscriptionOrder(orderData);
      } else {
        return await processOneTimeOrder(orderData);
      }
    }
    
    return { success: false, error: 'Payment not completed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processOneTimeOrder(orderData) {
  // Create order in your database
  const order = await createOrder({
    stripeSessionId: orderData.sessionId,
    customerEmail: orderData.customerEmail,
    totalAmount: orderData.amountTotal,
    currency: orderData.currency,
    items: orderData.items.map(item => ({
      name: item.description,
      quantity: item.quantity,
      amount: item.amount_total / 100
    })),
    status: 'completed'
  });
  
  // Send confirmation email
  await sendOrderConfirmationEmail(orderData.customerEmail, {
    orderId: order.id,
    items: order.items,
    totalAmount: orderData.amountTotal,
    currency: orderData.currency
  });
  
  // Fulfill order (send download links, activate services, etc.)
  await fulfillOrder(order.id);
  
  return { success: true, orderId: order.id };
}

async function processSubscriptionOrder(orderData) {
  // Update user's subscription status
  const userId = orderData.metadata.user_id;
  if (userId) {
    await updateUserSubscription(userId, {
      stripeCustomerId: orderData.customerId,
      stripeSubscriptionId: orderData.subscriptionId,
      status: 'active',
      planType: orderData.metadata.plan_type
    });
    
    // Activate premium features
    await activateUserFeatures(userId, orderData.metadata.plan_type);
    
    // Send welcome email
    await sendSubscriptionWelcomeEmail(orderData.customerEmail, {
      planType: orderData.metadata.plan_type,
      billingAmount: orderData.amountTotal,
      currency: orderData.currency
    });
  }
  
  return { success: true, subscriptionId: orderData.subscriptionId };
}
```

### Step 5 — Checkout Integration Patterns

```javascript
// Express.js checkout routes
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items, mode = 'payment', customer, options = {} } = req.body;
    
    let sessionConfig = {
      items: items,
      mode: mode,
      successUrl: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.DOMAIN}/cancel`,
      ...options
    };
    
    if (customer) {
      sessionConfig.customerEmail = customer.email;
      sessionConfig.metadata = { ...sessionConfig.metadata, ...customer.metadata };
    }
    
    const session = await createAdvancedCheckout(sessionConfig);
    
    res.json({ sessionId: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/checkout-success', async (req, res) => {
  const { session_id } = req.query;
  
  if (!session_id) {
    return res.redirect('/error');
  }
  
  const result = await handleCheckoutCompletion(session_id);
  
  if (result.success) {
    res.redirect(`/success?order_id=${result.orderId || result.subscriptionId}`);
  } else {
    res.redirect(`/error?message=${encodeURIComponent(result.error)}`);
  }
});

// React component for checkout button
function CheckoutButton({ items, customerData, mode = 'payment' }) {
  const [loading, setLoading] = useState(false);
  
  const handleCheckout = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items,
          mode: mode,
          customer: customerData
        })
      });
      
      const { sessionId } = await response.json();
      
      const stripe = await loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
      await stripe.redirectToCheckout({ sessionId });
    } catch (error) {
      console.error('Checkout failed:', error);
      setLoading(false);
    }
  };
  
  return (
    <button 
      onClick={handleCheckout}
      disabled={loading}
      className="checkout-button"
    >
      {loading ? 'Processing...' : 'Checkout'}
    </button>
  );
}

// Checkout utility class
class CheckoutManager {
  constructor(options = {}) {
    this.defaultCurrency = options.currency || 'usd';
    this.domain = options.domain || process.env.DOMAIN;
  }
  
  async createQuickCheckout(productName, amount, quantity = 1) {
    return await createCheckoutSession([{
      name: productName,
      amount: amount,
      quantity: quantity
    }]);
  }
  
  async createBundleCheckout(products, discountPercentage = 0) {
    let totalAmount = products.reduce((sum, product) => 
      sum + (product.amount * product.quantity), 0
    );
    
    if (discountPercentage > 0) {
      totalAmount = totalAmount * (1 - discountPercentage / 100);
    }
    
    return await createCheckoutSession([{
      name: `Bundle: ${products.map(p => p.name).join(', ')}`,
      amount: totalAmount,
      quantity: 1,
      description: `${products.length} items with ${discountPercentage}% discount`
    }]);
  }
}
```

## Guidelines

- **Always validate checkout sessions** server-side before fulfilling orders
- **Use HTTPS in production** — Stripe requires secure connections
- **Handle checkout failures gracefully** — network issues and payment declines happen
- **Implement proper success/cancel handling** — never trust client-side state
- **Use metadata extensively** for order tracking and customer identification
- **Test with Stripe's test cards** to simulate various scenarios
- **Implement proper error logging** for debugging payment issues
- **Consider mobile optimization** — Stripe Checkout is mobile-ready by default
- **Use webhooks for order fulfillment** — more reliable than redirect-based confirmation
- **Localize checkout experience** — support multiple currencies and payment methods
- **Monitor checkout conversion rates** — optimize based on user behavior
- **Handle international customers** — different payment methods and tax requirements