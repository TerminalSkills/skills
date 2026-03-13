---
name: lemon-squeezy
description: >-
   You are an expert in Lemon Squeezy, the all-in-one payments platform that
  acts as your Merchant of Record. You help developers sell software,
  subscriptions, and digital products with automatic global tax handling (VAT,
  sales tax), invoicing, license keys, customer portal, and fraud protection —
  without needing to register for tax IDs or handle payment compliance
  yourself.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - payments
    - subscriptions
    - saas
    - digital-products
    - licensing
    - tax
---

# Lemon Squeezy — Merchant of Record for SaaS

You are an expert in Lemon Squeezy, the all-in-one payments platform that acts as your Merchant of Record. You help developers sell software, subscriptions, and digital products with automatic global tax handling (VAT, sales tax), invoicing, license keys, customer portal, and fraud protection — without needing to register for tax IDs or handle payment compliance yourself.

## Core Capabilities

### Checkout and Products

```typescript
import { lemonSqueezySetup, createCheckout, getProduct, listProducts } from "@lemonsqueezy/lemonsqueezy.js";

lemonSqueezySetup({ apiKey: process.env.LEMON_SQUEEZY_API_KEY! });

// Create checkout session
async function createProCheckout(userId: string, email: string) {
  const checkout = await createCheckout(process.env.LEMON_SQUEEZY_STORE_ID!, {
    variantId: process.env.PRO_VARIANT_ID!,
    checkoutData: {
      email,
      custom: { user_id: userId },          // Your metadata
    },
    checkoutOptions: {
      dark: true,
      successUrl: "https://myapp.com/billing/success",
    },
    productOptions: {
      enabledVariants: [process.env.PRO_VARIANT_ID!],
    },
  });

  return checkout.data.attributes.url;      // Redirect user here
}

// List products
const products = await listProducts({ filter: { storeId: process.env.STORE_ID! } });
products.data.forEach(p => {
  console.log(`${p.attributes.name}: $${p.attributes.price / 100}`);
});
```

### Webhooks

```typescript
import crypto from "crypto";

app.post("/api/webhooks/lemonsqueezy", async (req, res) => {
  // Verify signature
  const signature = req.headers["x-signature"] as string;
  const hash = crypto.createHmac("sha256", process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!)
    .update(JSON.stringify(req.body)).digest("hex");
  if (signature !== hash) return res.status(401).json({ error: "Invalid signature" });

  const { event_name, data } = req.body.meta;

  switch (event_name) {
    case "subscription_created": {
      const { customer_id, variant_id, status } = data.attributes;
      const userId = data.attributes.custom_data?.user_id;
      await db.users.update(userId, {
        plan: "pro",
        lemonCustomerId: customer_id,
        lemonSubscriptionId: data.id,
        subscriptionStatus: status,
      });
      break;
    }
    case "subscription_updated": {
      const userId = data.attributes.custom_data?.user_id;
      await db.users.update(userId, { subscriptionStatus: data.attributes.status });
      break;
    }
    case "subscription_cancelled": {
      const userId = data.attributes.custom_data?.user_id;
      await db.users.update(userId, {
        subscriptionStatus: "cancelled",
        cancelAt: data.attributes.ends_at,
      });
      break;
    }
    case "license_key_created": {
      await db.licenses.create({
        key: data.attributes.key,
        userId: data.attributes.custom_data?.user_id,
        activationLimit: data.attributes.activation_limit,
      });
      break;
    }
  }

  res.json({ received: true });
});
```

### License Key Validation

```typescript
import { validateLicense, activateLicense } from "@lemonsqueezy/lemonsqueezy.js";

// In your desktop app / CLI
async function checkLicense(licenseKey: string) {
  const validation = await validateLicense(licenseKey);
  if (validation.data.attributes.valid) {
    console.log("License valid!");
    console.log(`Customer: ${validation.data.attributes.customer_name}`);
    console.log(`Activations: ${validation.data.attributes.activation_usage}/${validation.data.attributes.activation_limit}`);
    return true;
  }
  return false;
}

// Activate on this device
async function activate(licenseKey: string) {
  const activation = await activateLicense(licenseKey, `${os.hostname()}-${os.platform()}`);
  return activation.data.attributes.activated;
}
```

## Installation

```bash
npm install @lemonsqueezy/lemonsqueezy.js
```

## Best Practices

1. **Merchant of Record** — Lemon Squeezy handles VAT, sales tax, invoicing globally; you're not the seller of record
2. **No tax IDs needed** — They collect and remit taxes in 100+ countries; you just receive payouts
3. **Webhooks for state** — Don't rely on checkout redirect; use webhooks for subscription lifecycle
4. **Custom data** — Pass `user_id` in `custom` field; link Lemon Squeezy customers to your users
5. **License keys** — Enable for desktop apps, CLI tools, self-hosted software; activation limits prevent sharing
6. **Customer portal** — Hosted portal for subscription management; customers update payment, cancel, view invoices
7. **Variant-based pricing** — Create price variants (monthly/yearly, tiers); one product, multiple pricing options
8. **Test mode** — Use test mode API key for development; test the full flow without real charges
