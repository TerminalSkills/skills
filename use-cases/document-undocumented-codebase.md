---
title: "Document an Undocumented Codebase with AI"
slug: document-undocumented-codebase
description: "Generate comprehensive documentation for a legacy codebase — from function docstrings to architecture guides — in hours instead of weeks."
skills: [code-documenter, coding-agent, changelog-generator]
category: development
tags: [documentation, onboarding, legacy-code, architecture, developer-experience]
---

# Document an Undocumented Codebase with AI

## The Problem

A new engineer joins the team and asks "where are the docs?" The answer is a sheepish grin and "the code is the documentation." The codebase has 140,000 lines across 400 files, zero docstrings, no architecture diagram, and the original authors left two years ago. Onboarding takes 6 weeks instead of 1 because every question requires archaeology — reading git blame, decoding cryptic variable names, and reverse-engineering data flows through trial and error. The team knows documentation would save hundreds of hours, but nobody has time to write it because they're too busy onboarding people who can't find documentation.

## The Solution

Point the AI agent at your codebase and let it analyze the code structure, extract function contracts, trace data flows, and produce documentation at every level — from inline docstrings to architecture overviews to onboarding guides. It reads the code the way an experienced engineer would, but documents it immediately instead of keeping the knowledge in their head.

## Step-by-Step Walkthrough

### 1. Map the architecture first

```text
Analyze the codebase in src/ and generate an architecture overview. Show me the module dependency graph, entry points, external service dependencies, key data flows, and environment variables. I want a new engineer to understand the system in 10 minutes.
```

The agent scans the directory structure, traces imports, and produces:

```markdown
# System Architecture

## Overview
E-commerce order processing platform. 3 main domains: catalog, orders, payments.
Monolithic Node.js/Express app with PostgreSQL, Redis, and Stripe integration.

## Module Dependency Graph
  src/
  ├── api/              → HTTP layer (Express routes)
  │   ├── catalog.ts    → depends on: services/catalog, middleware/auth
  │   ├── orders.ts     → depends on: services/orders, services/payments, middleware/auth
  │   └── webhooks.ts   → depends on: services/payments (Stripe webhook handler)
  ├── services/         → Business logic
  │   ├── catalog.ts    → depends on: repositories/products, repositories/categories
  │   ├── orders.ts     → depends on: repositories/orders, services/payments, services/inventory
  │   ├── payments.ts   → depends on: external/stripe, repositories/transactions
  │   └── inventory.ts  → depends on: repositories/products, cache/redis
  ├── repositories/     → Database access (Knex.js query builders)
  ├── middleware/        → Auth (JWT), rate limiting, error handling
  ├── jobs/             → Bull queue workers (order fulfillment, email sends)
  └── utils/            → Shared helpers (formatting, validation, logging)

## Key Data Flows
  Order Placement:
    POST /api/orders → orders.service.create() → payments.service.charge()
    → stripe.charges.create() → transactions.repo.insert()
    → inventory.service.decrement() → orders.repo.updateStatus('paid')
    → jobs.enqueue('send-confirmation-email')

## External Dependencies
  PostgreSQL (main data store), Redis (inventory cache + job queue),
  Stripe (payments), SendGrid (transactional emails)

## Environment Variables (12 found)
  DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  SENDGRID_API_KEY, JWT_SECRET, PORT, NODE_ENV, LOG_LEVEL,
  RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, SENTRY_DSN
```

### 2. Add docstrings to the most critical modules

```text
Add comprehensive JSDoc documentation to every exported function in src/services/orders.ts and src/services/payments.ts. Include parameter types, return types, thrown errors, side effects, and example usage.
```

The agent reads each function, analyzes its behavior, and generates:

```typescript
/**
 * Creates a new order and processes payment in a single transaction.
 *
 * Validates product availability, calculates totals with tax, charges the
 * customer's payment method via Stripe, decrements inventory, and enqueues
 * a confirmation email job.
 *
 * @param userId - Authenticated user ID (e.g., "usr_k82mf9")
 * @param items - Array of {productId, quantity} objects. Minimum 1 item.
 * @param shippingAddress - Full shipping address with country code for tax calculation.
 * @param paymentMethodId - Stripe payment method ID (e.g., "pm_1N2x3Y...")
 * @returns The created order object with status "paid" and Stripe charge ID.
 *
 * @throws {ValidationError} If any product is out of stock or quantity exceeds available inventory.
 * @throws {PaymentError} If Stripe charge fails (card declined, insufficient funds).
 *   The order is rolled back — no inventory deduction occurs.
 * @throws {DatabaseError} If the transaction fails to commit.
 *
 * @sideEffects
 *   - Creates Stripe charge (external API)
 *   - Inserts order and line_items rows (PostgreSQL)
 *   - Decrements product inventory counts
 *   - Enqueues 'send-confirmation-email' job (Redis/Bull)
 *
 * @example
 * const order = await createOrder(
 *   "usr_k82mf9",
 *   [{ productId: "prod_291", quantity: 2 }],
 *   { street: "123 Main St", city: "Portland", state: "OR", zip: "97201", country: "US" },
 *   "pm_1N2x3Y4Z5A6B7C8D"
 * );
 * // => { id: "ord_f83k2", status: "paid", total: 89.98, chargeId: "ch_9x2..." }
 */
```

### 3. Document the tricky parts — the business logic nobody understands

```text
Find the 10 most complex functions in the codebase (highest cyclomatic complexity) and add inline comments explaining the business logic. Focus on WHY, not WHAT.
```

```text
Top 10 Complex Functions (by cyclomatic complexity):

1. services/orders.ts:calculateShipping() — complexity: 23
   Added 14 inline comments explaining:
   - Weight-based tier breakpoints and why they exist (carrier contract terms)
   - The free shipping threshold logic (marketing rule: orders > $75)
   - International shipping surcharge calculation
   - The edge case handler for oversized items (flagged: likely bug —
     oversized surcharge applied twice when item is also fragile)

2. services/payments.ts:handleStripeWebhook() — complexity: 19
   Added 11 inline comments explaining:
   - Why certain event types are ignored (historical: caused duplicate processing)
   - The idempotency check using webhook event ID
   - The 3-retry logic for database writes after webhook (Stripe re-sends if no 200)
   ...

[...8 more functions with comments added]

⚠ Bugs discovered during documentation:
  1. calculateShipping(): oversized + fragile items charged surcharge twice
  2. handleRefund(): partial refunds don't update inventory (items not restocked)
  3. applyDiscount(): percentage discounts calculated before tax, flat discounts after —
     inconsistent and likely unintentional
```

### 4. Generate the onboarding guide

```text
Based on everything we've documented, generate a GETTING_STARTED.md for new engineers. Cover: local setup, architecture overview, key files to read first, how to run and test, common tasks, and who to ask about each domain.
```

The agent produces a comprehensive onboarding guide referencing the architecture doc, linking to the most important documented files, explaining the local development setup, and listing the 5 files a new engineer should read in order.

## Real-World Example

A senior engineer at a 20-person fintech startup is tasked with onboarding 4 new hires in Q1. The payment processing codebase has 140K lines of TypeScript, no documentation, and the two engineers who built it left 18 months ago. Previous onboarding took 6 weeks per engineer.

1. The engineer feeds the entire `src/` directory to the agent for architecture mapping — completed in 8 minutes
2. Docstrings are generated for the 3 most critical service modules (orders, payments, compliance) — 45 minutes of review and minor edits
3. The agent identifies and documents the 10 most complex functions, discovering 3 bugs in the process
4. An onboarding guide is generated and reviewed — 20 minutes of customization
5. New hires use the documentation to become productive in 8 days instead of 6 weeks
6. The 3 discovered bugs are fixed before they reach production

Total documentation effort: one full day instead of the estimated 3 weeks of manual documentation.
