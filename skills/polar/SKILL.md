---
name: polar
description: >-
   You are an expert in Polar, the monetization platform built for developers
  and open-source maintainers. You help developers add payments,
  subscriptions, product sales, license keys, and sponsorships to their
  projects with a developer-first API, webhooks, and embeddable components —
  replacing Stripe integration complexity with purpose-built tools for
  software monetization.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - monetization
    - open-source
    - payments
    - subscriptions
    - sponsorship
    - api
---

# Polar — Monetization for Developers

You are an expert in Polar, the monetization platform built for developers and open-source maintainers. You help developers add payments, subscriptions, product sales, license keys, and sponsorships to their projects with a developer-first API, webhooks, and embeddable components — replacing Stripe integration complexity with purpose-built tools for software monetization.

## Core Capabilities

### Products and Checkout

```typescript
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

// Create a product
const product = await polar.products.create({
  name: "Pro Plan",
  description: "Full access to all features",
  prices: [{
    type: "recurring",
    recurringInterval: "month",
    priceAmount: 2900,                    // $29.00
    priceCurrency: "usd",
  }],
  benefits: [
    { type: "license_keys", description: "License key for desktop app" },
    { type: "discord", description: "Access to Pro Discord channel" },
    { type: "custom", description: "Priority support" },
  ],
});

// Create checkout session
const checkout = await polar.checkouts.create({
  productId: product.id,
  successUrl: "https://myapp.com/success?session={CHECKOUT_ID}",
  customerEmail: "user@example.com",
  metadata: { userId: "usr-42" },
});
// Redirect user to checkout.url

// Verify checkout
const session = await polar.checkouts.get(checkoutId);
if (session.status === "confirmed") {
  await activateUserPro(session.metadata.userId);
}
```

### Webhooks

```typescript
// Handle Polar webhooks
import { validateEvent } from "@polar-sh/sdk/webhooks";

app.post("/api/webhooks/polar", async (req, res) => {
  const event = validateEvent(req.body, req.headers, process.env.POLAR_WEBHOOK_SECRET!);

  switch (event.type) {
    case "subscription.created":
      await db.users.update(event.data.customer.metadata.userId, { plan: "pro", polarSubId: event.data.id });
      break;
    case "subscription.canceled":
      await db.users.update(event.data.customer.metadata.userId, { plan: "free", cancelAt: event.data.currentPeriodEnd });
      break;
    case "order.created":
      await fulfillOrder(event.data);
      break;
  }

  res.json({ received: true });
});
```

### License Keys

```typescript
// Validate license key (in your desktop/CLI app)
const validation = await polar.licenseKeys.validate({
  key: userProvidedKey,
  organizationId: process.env.POLAR_ORG_ID!,
});

if (validation.valid) {
  console.log(`License valid for: ${validation.customer.email}`);
  console.log(`Activations: ${validation.activations}/${validation.limit}`);
  // Activate features
} else {
  console.log(`Invalid: ${validation.error}`);
}

// Activate (track device)
await polar.licenseKeys.activate({
  key: userProvidedKey,
  label: `${os.hostname()}-${os.platform()}`,
  organizationId: process.env.POLAR_ORG_ID!,
});
```

### Embeddable Components

```tsx
// React component for checkout button
import { PolarCheckout } from "@polar-sh/react";

function PricingPage() {
  return (
    <div className="pricing-grid">
      <div className="plan">
        <h3>Pro</h3>
        <p className="price">$29/mo</p>
        <PolarCheckout
          productId="prod_abc123"
          successUrl="/success"
          className="buy-button"
        >
          Get Pro
        </PolarCheckout>
      </div>
    </div>
  );
}
```

## Installation

```bash
npm install @polar-sh/sdk
npm install @polar-sh/react                # React components
```

## Best Practices

1. **Benefits system** — Attach benefits (license keys, Discord access, downloads) to products; Polar auto-provisions
2. **Webhooks for fulfillment** — Use webhooks for subscription lifecycle; don't rely solely on checkout redirect
3. **License keys** — Use for desktop apps, CLI tools, self-hosted software; activation limits prevent sharing
4. **Metadata** — Pass `userId` in checkout metadata; link Polar customers to your user system
5. **Customer portal** — Polar provides a hosted portal for subscription management; no custom billing UI needed
6. **Open-source funding** — Use Polar for issue funding and sponsorships; backers fund specific features
7. **Usage-based** — Create metered products for API access; track usage and bill accordingly
8. **Multi-currency** — Support USD, EUR, GBP; Polar handles currency conversion and tax calculation
