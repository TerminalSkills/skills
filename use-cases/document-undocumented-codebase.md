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

A new engineer joins the team and asks "where are the docs?" The answer is a sheepish grin and "the code is the documentation." The codebase has 140,000 lines across 400 files, zero docstrings, no architecture diagram, and the original authors left two years ago. Onboarding takes 6 weeks instead of 1 because every question requires archaeology -- reading git blame, decoding cryptic variable names, and reverse-engineering data flows through trial and error.

The team knows documentation would save hundreds of hours, but nobody has time to write it because they're too busy onboarding people who can't find documentation. It's the classic chicken-and-egg problem, except it costs real money: 6 weeks of reduced productivity per new hire, senior engineers pulled into constant knowledge-transfer sessions, and bugs that exist solely because nobody understood what the code was supposed to do.

## The Solution

Point a coding agent at your codebase, with the **code-documenter** skill as its method, and let it analyze the code structure, extract function contracts, trace data flows, and produce documentation at every level -- from inline docstrings to architecture overviews to onboarding guides. It reads the code the way an experienced engineer would, but documents it immediately instead of keeping the knowledge in their head. Use the **coding-agent** skill to hand each module to its own background agent, and the **changelog-generator** skill to rebuild the project's history from git. Generated documentation is a draft that a person who knows the system reviews: the agent can misread intent, so every claim about behavior gets spot-checked against the code before it is merged.

## Step-by-Step Walkthrough

### Step 1: Map the Architecture First

```text
Analyze the codebase in src/ and generate an architecture overview. Show me the module dependency graph, entry points, external service dependencies, key data flows, and environment variables. I want a new engineer to understand the system in 10 minutes.
```

The scan traces every import, catalogs every external call, and maps the whole system:

```markdown
# System Architecture

## Overview
E-commerce order processing platform. 3 main domains: catalog, orders, payments.
Monolithic Node.js/Express app with PostgreSQL, Redis, and Stripe integration.

## Module Dependency Graph
src/
├── api/              -> HTTP layer (Express routes)
│   ├── catalog.ts    -> depends on: services/catalog, middleware/auth
│   ├── orders.ts     -> depends on: services/orders, services/payments, middleware/auth
│   └── webhooks.ts   -> depends on: services/payments (Stripe webhook handler)
├── services/         -> Business logic
│   ├── catalog.ts    -> depends on: repositories/products, repositories/categories
│   ├── orders.ts     -> depends on: repositories/orders, services/payments, services/inventory
│   ├── payments.ts   -> depends on: external/stripe, repositories/transactions
│   └── inventory.ts  -> depends on: repositories/products, cache/redis
├── repositories/     -> Database access (Knex.js query builders)
├── middleware/        -> Auth (JWT), rate limiting, error handling
├── jobs/             -> Bull queue workers (order fulfillment, email sends)
└── utils/            -> Shared helpers (formatting, validation, logging)

## Key Data Flows
Order Placement:
  POST /api/orders -> orders.service.create() -> payments.service.charge()
  -> stripe.paymentIntents.create(confirm) -> transactions.repo.insert()
  -> inventory.service.decrement() -> orders.repo.updateStatus('paid')
  -> jobs.enqueue('send-confirmation-email')

## External Dependencies
PostgreSQL (main data store), Redis (inventory cache + job queue),
Stripe (payments), SendGrid (transactional emails)

## Environment Variables (12 found)
DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SENDGRID_API_KEY, JWT_SECRET, PORT, NODE_ENV, LOG_LEVEL,
RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, SENTRY_DSN
```

A new engineer can now see the entire system in one page: three domains, four external services, one clear data flow for the most important operation. The 12 environment variables are no longer a scavenger hunt through .env.example files and Slack messages.

### Step 2: Add Docstrings to the Most Critical Modules

Documenting 400 files in one conversation overflows any context, so split the work: one scoped task per module, run as background agents with the **coding-agent** skill's pattern. Each agent gets one directory, may edit only comments, and must leave the compiler happy:

```bash
claude -p "Add JSDoc to every exported function in src/services/orders.ts. Change comments only; do not modify code." \
  --permission-mode acceptEdits --allowedTools "Read" "Edit" "Bash(npx tsc --noEmit)" \
  --max-budget-usd 2 > /tmp/doc-orders.log 2>&1 &
```

After each agent finishes, read its diff, confirm only comment lines changed (`git diff --stat` and a skim), and run the type check and tests. The prompt for one module, if you are working interactively instead:

```text
Add comprehensive JSDoc documentation to every exported function in src/services/orders.ts and src/services/payments.ts. Include parameter types, return types, thrown errors, side effects, and example usage.
```

The agent reads each function, traces its dependencies, and produces documentation that captures not just the interface but the behavior:

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
 * @param shippingAddress - Full address with country code for tax calculation.
 * @param paymentMethodId - Stripe payment method ID (e.g., "pm_1N2x3Y4Z5A6B7C8D")
 * @returns The created order with status "paid" and the Stripe PaymentIntent ID.
 *
 * @throws {ValidationError} If any product is out of stock or quantity exceeds inventory.
 * @throws {PaymentError} If Stripe charge fails (card declined, insufficient funds).
 *   The order is rolled back — no inventory deduction occurs.
 * @throws {DatabaseError} If the transaction fails to commit.
 *
 * @remarks
 * Side effects:
 *   - Creates and confirms a Stripe PaymentIntent (external API)
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
 * // => { id: "ord_f83k2", status: "paid", total: 89.98, paymentIntentId: "pi_3N2x..." }
 */
```

The side-effects list is the most valuable part. Without it, a developer calling `createOrder` might not realize it charges a credit card, sends an email, and modifies inventory -- all in one function call. That kind of hidden coupling is where bugs live.

### Step 3: Document the Tricky Parts -- the Business Logic Nobody Understands

```text
Rank the functions by cyclomatic complexity with a tool, not by eyeballing (for TypeScript, ESLint's built-in `complexity` rule reports only functions above its threshold, so run it with a low one: `npx eslint src --rule '{"complexity": ["warn", 5]}'`), take the top 10, and add inline comments explaining the business logic. Focus on WHY, not WHAT.
```

The ranking, taken from the linter's report, shows the functions that need documentation most urgently (illustrative numbers):

| Rank | Function | Complexity | Comments Added |
|---|---|---|---|
| 1 | `services/orders.ts:calculateShipping()` | 23 | 14 comments |
| 2 | `services/payments.ts:handleStripeWebhook()` | 19 | 11 comments |
| 3-10 | (8 more functions) | 11-17 | 6-9 comments each |

The `calculateShipping` documentation explains the weight-based tier breakpoints (carrier contract terms), the free shipping threshold (marketing rule: orders over $75), the international surcharge calculation, and an edge case handler for oversized items.

This is where documentation pays for itself in bug discoveries. Writing the comments surfaced three suspected issues, each to be confirmed with a failing test before anyone changes code:

1. **`calculateShipping()`**: oversized + fragile items get charged the surcharge twice
2. **`handleRefund()`**: partial refunds don't update inventory (items never get restocked)
3. **`applyDiscount()`**: percentage discounts calculated before tax, flat discounts after -- inconsistent and likely unintentional

Three leads, found because documenting code forces you to understand it.

### Step 4: Generate the Onboarding Guide

```text
Based on everything we've documented, generate a GETTING_STARTED.md for new engineers. Cover: local setup, architecture overview, key files to read first, how to run and test, common tasks, and who to ask about each domain.
```

The onboarding guide references the architecture doc, links to the most important documented files, explains the local development setup with copy-pasteable commands, and lists the 5 files a new engineer should read in order. It transforms a 6-week archaeological expedition into a guided tour. Have a new hire follow the setup steps on a clean machine; any command that fails is a documentation bug.

### Step 5: Rebuild the Change History

Nobody remembers why things changed either. Ask the agent to use the **changelog-generator** skill on the repository history:

```text
List the git tags, then write CHANGELOG.md in Keep a Changelog format, one entry per tag, from the commits between tags. Where commit messages are unhelpful, read the diff. Show me the draft before writing it.
```

The skill sorts commits into Added / Changed / Fixed (using Conventional Commit prefixes where they exist, the diff where they do not), so the onboarding guide can link to a readable history of what shipped when. Going forward, the same skill produces the entry for each release.

## Real-World Example

A senior engineer at a 20-person fintech startup was tasked with onboarding 4 new hires in Q1. The payment processing codebase had 140K lines of TypeScript, no documentation, and the two engineers who built it left 18 months ago. Previous onboarding had been taking 6 weeks per engineer.

Architecture mapping completed in 8 minutes and revealed the system's structure for the first time as a single readable document. Docstrings were generated for the 3 most critical service modules -- orders, payments, compliance -- and reviewed by the team in 45 minutes of light editing. The complexity analysis documented the 10 hardest functions and turned up 3 suspected bugs, which tests then confirmed.

The 4 new hires used the documentation to become productive in 8 days instead of 6 weeks. The confirmed bugs were fixed. The team's own estimate: one full day instead of 3 weeks of manual writing. The documentation kept paying dividends -- the next quarter's hires onboarded even faster because the docs were already there.

## Related Skills

- **code-documenter** -- the method for docstrings, module overviews, architecture docs and onboarding guides
- **coding-agent** -- run one scoped, pre-approved background agent per module and collect the results
- **changelog-generator** -- rebuild CHANGELOG.md from git tags and commits
