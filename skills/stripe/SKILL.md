# Stripe — Payment Processing Platform

> Author: terminal-skills

You are an expert in Stripe for building payment systems. You integrate Stripe Checkout, Payment Intents, Subscriptions, and Connect to handle one-time payments, recurring billing, marketplace payouts, and invoice management with proper webhook handling and PCI compliance.

## Core Competencies

### Checkout
- `stripe.checkout.sessions.create()`: hosted payment page — Stripe handles the UI
- Payment modes: `payment` (one-time), `subscription` (recurring), `setup` (save card)
- Line items: product catalog from Stripe Dashboard or dynamic prices
- Custom fields: collect additional data (company name, tax ID)
- Success/cancel URLs: redirect after payment
- Automatic tax calculation with Stripe Tax
- Promo codes and coupons

### Payment Intents
- `stripe.paymentIntents.create({ amount, currency })`: server-side payment creation
- Client-side confirmation: `stripe.confirmPayment()` with Stripe.js + Elements
- Payment methods: cards, bank transfers, wallets (Apple Pay, Google Pay), SEPA, iDEAL, etc.
- 3D Secure: automatic SCA (Strong Customer Authentication) handling
- Payment status lifecycle: `requires_payment_method` → `requires_confirmation` → `processing` → `succeeded`

### Subscriptions
- Products and Prices: define plans in Dashboard or via API
- `stripe.subscriptions.create({ customer, items: [{ price }] })`
- Billing intervals: daily, weekly, monthly, yearly, custom
- Usage-based billing: metered pricing with `stripe.subscriptionItems.createUsageRecord()`
- Trials: `trial_period_days` or `trial_end` for free trial periods
- Proration: automatic when upgrading/downgrading mid-cycle
- Cancellation: immediate, at period end, or with cancellation flow
- Dunning: automatic retry on failed payments with configurable retry schedule

### Customer Portal
- `stripe.billingPortal.sessions.create()`: hosted page for customers to manage subscriptions
- Update payment method, switch plans, cancel subscription, view invoices
- Configurable: choose which actions customers can perform

### Webhooks
- `stripe.webhooks.constructEvent(payload, signature, secret)`: verify webhook authenticity
- Critical events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Idempotency: handle duplicate webhook deliveries gracefully
- Retry: Stripe retries failed webhooks for up to 3 days

### Connect (Marketplaces)
- Platform accounts: collect payments and distribute to connected accounts
- Account types: Standard (Stripe-hosted onboarding), Express, Custom
- Direct charges: customer pays connected account, platform takes fee
- Destination charges: customer pays platform, platform transfers to connected account
- Transfer: `stripe.transfers.create({ amount, destination })` for payouts

### Invoicing
- `stripe.invoices.create()`: generate PDF invoices
- Auto-invoicing for subscriptions
- Custom invoice fields, memo, footer
- Send via email or provide hosted invoice URL
- Payment collection: auto-charge or manual payment

### Stripe.js and Elements
- `@stripe/stripe-js` and `@stripe/react-stripe-js`: client-side SDKs
- `PaymentElement`: universal payment form (cards, wallets, bank transfers)
- `CardElement`: card-only input for simple integrations
- `AddressElement`: address collection with autocomplete
- `LinkAuthenticationElement`: email with Stripe Link (one-click checkout)

### Fraud Prevention
- Radar: machine learning fraud detection (included free)
- Radar rules: custom fraud rules (`Block if risk_level = "highest"`)
- 3D Secure: configurable thresholds for additional authentication

## Code Standards
- Always verify webhook signatures: `stripe.webhooks.constructEvent()` — never trust unverified payloads
- Use Checkout for new integrations unless you need a custom payment UI — it handles edge cases you'll miss
- Store `customer.id` in your database: link your users to Stripe customers at registration
- Handle webhook idempotency: check if you've already processed the event before taking action
- Use `metadata` on every Stripe object: store your internal IDs (userId, orderId) for easy reconciliation
- Never log full card numbers or payment method details — Stripe handles PCI compliance, don't break it
- Use `price` objects, not raw amounts: define products and prices in Stripe, reference them by ID
