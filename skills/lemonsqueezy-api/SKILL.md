---
name: lemonsqueezy-api
description: >-
  Sell digital products with Lemon Squeezy API — subscriptions, one-time payments, 
  license keys, and webhooks. Perfect for selling software, courses, ebooks, and 
  digital downloads with built-in tax compliance and fraud protection.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["lemon-squeezy", "digital-products", "subscriptions", "license-keys", "merchant-of-record"]
---

# Lemon Squeezy API

Build digital product sales systems using Lemon Squeezy's merchant of record platform for software, courses, ebooks, and subscriptions.

## Overview

Lemon Squeezy is optimized for digital products. It handles global tax compliance, EU VAT, US sales tax, fraud protection, and provides features like license key generation, subscription management, and affiliate programs.

## Authentication

```javascript
// Install Lemon Squeezy SDK
// npm install @lemonsqueezy/lemonsqueezy.js

import { lemonSqueezySetup, getAuthenticatedUser, listProducts } from '@lemonsqueezy/lemonsqueezy.js';

lemonSqueezySetup({
  apiKey: process.env.LEMONSQUEEZY_API_KEY,
  onError: (error) => {
    console.error('Lemon Squeezy API Error:', error);
  }
});

// Alternative: Direct API requests
const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';
const headers = {
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`
};
```

## Instructions

### Step 1 — Set Up Products and Variants

```javascript
// List all stores and products
async function getStoreProducts() {
  const user = await getAuthenticatedUser();
  const products = await listProducts({
    include: ['variants', 'store']
  });
  
  return products.data?.map(product => ({
    id: product.id,
    name: product.attributes.name,
    slug: product.attributes.slug,
    description: product.attributes.description,
    status: product.attributes.status
  }));
}

// Create a new product via API
async function createProduct(storeId, productData) {
  const response = await fetch(`${LS_API_BASE}/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'products',
      attributes: {
        store_id: storeId,
        name: productData.name,
        slug: productData.slug,
        description: productData.description,
        status: 'published',
        price: productData.price * 100, // Price in cents
        currency: productData.currency || 'USD'
      }
    })
  });
  
  return response.json();
}

// Create variants for different pricing options
async function createVariant(productId, variantData) {
  const response = await fetch(`${LS_API_BASE}/variants`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'variants',
      attributes: {
        product_id: productId,
        name: variantData.name,
        price: variantData.price * 100,
        is_subscription: variantData.isSubscription || false,
        interval: variantData.interval || null, // 'day', 'week', 'month', 'year'
        interval_count: variantData.intervalCount || null,
        has_free_trial: variantData.hasFreeTrial || false,
        trial_interval_count: variantData.trialIntervalCount || 0,
        has_license_keys: variantData.hasLicenseKeys || false,
        license_activation_limit: variantData.licenseActivationLimit || 1
      }
    })
  });
  
  return response.json();
}
```

### Step 2 — Create Checkouts and Handle Payments

```javascript
// Create a checkout session
async function createCheckout(variantId, customerData = {}, customData = {}) {
  const response = await fetch(`${LS_API_BASE}/checkouts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'checkouts',
      attributes: {
        product_options: {
          name: customData.productName,
          redirect_url: customData.successUrl || `${process.env.APP_URL}/success`,
          receipt_link_url: customData.receiptLinkUrl || `${process.env.APP_URL}/dashboard`
        },
        checkout_options: {
          embed: customData.embed || false,
          dark: customData.darkMode || false,
          subscription_preview: customData.showSubscriptionPreview !== false
        },
        checkout_data: {
          email: customerData.email,
          name: customerData.name,
          custom: {
            user_id: customData.userId,
            utm_source: customData.utmSource
          }
        },
        test_mode: process.env.NODE_ENV !== 'production'
      },
      relationships: {
        store: {
          data: {
            type: 'stores',
            id: customData.storeId
          }
        },
        variant: {
          data: {
            type: 'variants',
            id: variantId.toString()
          }
        }
      }
    })
  });
  
  const checkout = await response.json();
  return {
    id: checkout.data.id,
    url: checkout.data.attributes.url
  };
}

// Frontend checkout integration
class LemonSqueezyCheckout {
  // Open checkout in overlay
  async openOverlay(variantId, options = {}) {
    const checkout = await createCheckout(variantId, {
      email: options.customerEmail,
      name: options.customerName
    }, {
      ...options,
      embed: false,
      userId: options.userId
    });
    
    const popup = window.open(
      checkout.url,
      'lemonsqueezy-checkout',
      'width=800,height=800'
    );
    
    return this.listenForCompletion(popup, checkout.id);
  }
  
  // Listen for checkout completion
  listenForCompletion(popup, checkoutId) {
    return new Promise((resolve, reject) => {
      const listener = (event) => {
        if (event.origin !== 'https://lemonsqueezy.com') return;
        
        if (event.data.type === 'lemon-checkout-success') {
          popup.close();
          window.removeEventListener('message', listener);
          resolve(event.data);
        }
      };
      
      window.addEventListener('message', listener);
    });
  }
}
```

### Step 3 — Webhook Integration

```javascript
// Webhook handler for Lemon Squeezy events
const crypto = require('crypto');

app.post('/lemon-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature'];
  const body = req.body;
  
  if (!verifyLemonSqueezyWebhook(body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = JSON.parse(body.toString());
  await handleLemonSqueezyEvent(event);
  
  res.status(200).json({ success: true });
});

function verifyLemonSqueezyWebhook(body, signature) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const hash = crypto.createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(hash, 'utf8')
  );
}

async function handleLemonSqueezyEvent(payload) {
  const eventType = payload.meta.event_name;
  const data = payload.data;
  
  switch (eventType) {
    case 'order_created':
      await handleOrderCreated(data);
      break;
    case 'subscription_created':
      await handleSubscriptionCreated(data);
      break;
    case 'subscription_updated':
      await handleSubscriptionUpdated(data);
      break;
    case 'license_key_created':
      await handleLicenseKeyCreated(data);
      break;
    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
}

// Handle successful order
async function handleOrderCreated(order) {
  const customData = order.attributes.first_order_item.custom;
  const userId = customData?.user_id;
  
  if (!userId) return;
  
  await updateUserPurchase(userId, {
    lemonSqueezyOrderId: order.id,
    status: order.attributes.status,
    total: parseFloat(order.attributes.total),
    currency: order.attributes.currency,
    purchasedAt: new Date(order.attributes.created_at)
  });
  
  await sendPurchaseConfirmationEmail(order.attributes.user_email, {
    productName: order.attributes.first_order_item.product_name,
    total: parseFloat(order.attributes.total),
    orderId: order.id
  });
}
```

### Step 4 — Subscription Management

```javascript
// Subscription management functions
import { 
  getSubscription, 
  updateSubscription, 
  cancelSubscription
} from '@lemonsqueezy/lemonsqueezy.js';

class LemonSqueezySubscriptionManager {
  // Get subscription details
  async getSubscriptionDetails(subscriptionId) {
    const response = await getSubscription(subscriptionId, {
      include: ['store', 'customer', 'product', 'variant']
    });
    
    return this.formatSubscription(response.data);
  }
  
  // Update subscription (change plan)
  async changeSubscriptionPlan(subscriptionId, newVariantId) {
    const response = await updateSubscription(subscriptionId, {
      variant_id: newVariantId,
      invoice_immediately: true
    });
    
    return this.formatSubscription(response.data);
  }
  
  // Cancel subscription
  async cancelSubscription(subscriptionId) {
    const response = await cancelSubscription(subscriptionId);
    return this.formatSubscription(response.data);
  }
  
  formatSubscription(subscription) {
    return {
      id: subscription.id,
      status: subscription.attributes.status,
      customerEmail: subscription.attributes.customer_email,
      renewsAt: subscription.attributes.renews_at ? 
        new Date(subscription.attributes.renews_at) : null,
      endsAt: subscription.attributes.ends_at ? 
        new Date(subscription.attributes.ends_at) : null
    };
  }
}
```

### Step 5 — License Key Management

```javascript
// License key operations for software products
import { 
  getLicenseKey, 
  listLicenseKeys,
  activateLicenseKey,
  deactivateLicenseKey
} from '@lemonsqueezy/lemonsqueezy.js';

class LicenseKeyManager {
  // Validate license key
  async validateLicense(licenseKey, instanceName) {
    try {
      const licenses = await listLicenseKeys({
        filter: { key: licenseKey }
      });
      
      if (!licenses.data?.length) {
        return { valid: false, error: 'Invalid license key' };
      }
      
      const license = licenses.data[0];
      const attributes = license.attributes;
      
      if (attributes.status !== 'active') {
        return { valid: false, error: 'License is not active' };
      }
      
      if (attributes.expires_at && new Date(attributes.expires_at) < new Date()) {
        return { valid: false, error: 'License has expired' };
      }
      
      return {
        valid: true,
        license: this.formatLicenseKey(license)
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  formatLicenseKey(license) {
    return {
      id: license.id,
      key: license.attributes.key,
      status: license.attributes.status,
      activationLimit: license.attributes.activation_limit,
      expiresAt: license.attributes.expires_at ? 
        new Date(license.attributes.expires_at) : null
    };
  }
}

// License validation endpoint
const licenseManager = new LicenseKeyManager();

app.post('/api/license/validate', async (req, res) => {
  try {
    const { licenseKey, instanceName } = req.body;
    
    if (!licenseKey || !instanceName) {
      return res.status(400).json({ 
        valid: false, 
        error: 'License key and instance name required' 
      });
    }
    
    const validation = await licenseManager.validateLicense(licenseKey, instanceName);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});
```

## Guidelines

- **Use Lemon Squeezy as merchant of record** for automatic global tax compliance
- **Implement robust webhook handling** with signature verification
- **Test thoroughly in test mode** before switching to live mode
- **Handle license key validation** server-side for software products
- **Set up proper subscription lifecycle management**
- **Use custom data fields** to link customers to your internal user system
- **Monitor key metrics** — conversion rates, churn, revenue per customer
- **Handle refunds and disputes** through the Lemon Squeezy dashboard
- **Consider affiliate programs** — Lemon Squeezy has built-in affiliate management
- **Use checkout customization** to match your brand
- **Implement proper license activation limits** for software products
- **Set up email templates** in dashboard for receipts and notifications