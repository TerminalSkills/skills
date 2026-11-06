---
title: "Automate Regression Testing After Refactoring with AI"
slug: automate-regression-testing-after-refactoring
description: "Generate and run targeted regression tests after refactoring to verify behavior is preserved without manual QA."
skills: [regression-tester, test-generator, code-reviewer]
category: development
tags: [regression-testing, refactoring, testing, code-quality, automation]
---

# Automate Regression Testing After Refactoring with AI

## The Problem

Refactoring is essential but terrifying. You restructure a billing module to be more maintainable, and three weeks later a customer reports they were charged the wrong amount. The existing test suite — if it exists — covers happy paths but misses the edge case your refactoring subtly broke. Manual QA is slow and unreliable for catching behavioral regressions. So teams either avoid refactoring (accumulating tech debt) or refactor and pray (accumulating production incidents).

The real danger isn't the things that break loudly — a missing function throws an error, someone notices in CI, it gets fixed. It's the silent changes: a refund calculation that's off by $0.25 on discounted orders, an inventory count that drifts by one unit on bundle cancellations. These bugs can run for weeks before anyone notices, and by then the blast radius is enormous. The refactoring looked clean, the tests passed, and nobody knew anything was wrong until the accounting team found the discrepancy.

## The Solution

Using the **regression-tester**, **test-generator**, and **code-reviewer** skills, the agent analyzes the refactoring diff, identifies every behavior contract in the changed code, and generates targeted tests that verify equivalence between the old and new implementations. It runs those tests against both versions — old code first to establish the baseline, new code second to catch divergence — and pinpoints exactly where behavior changed.

## Step-by-Step Walkthrough

### Step 1: Start the Regression Check

After completing the refactoring, hand it over for verification:

```text
I refactored the order processing module — split OrderService into
OrderService, PricingService, and InventoryService. The public API
hasn't changed — all the same methods exist with the same signatures.
Check for regressions against main.
```

### Step 2: Map the Refactoring Scope

Before generating any tests, the agent needs to understand what changed and what should stay the same — not just which files were modified, but which behaviors could have been affected. The diff analysis (12 files changed, +624 -389) produces a clear picture of what moved where:

| Before | After | Lines |
|---|---|---|
| `src/services/OrderService.ts` (389 lines) | `src/services/OrderService.ts` (142 lines) — orchestration | -247 |
| | `src/services/PricingService.ts` (156 lines) — price calculation | +156 |
| | `src/services/InventoryService.ts` (128 lines) — stock management | +128 |

The public API surface check is the first good sign:

| Method | Signature Preserved | Return Type Preserved |
|---|---|---|
| `createOrder` | Yes | Yes |
| `updateOrder` | Yes | Yes |
| `cancelOrder` | Yes | Yes |
| `getOrder` | Yes | Yes |
| `listOrders` | Yes | Yes |
| `processRefund` | Yes | Yes |

All 6 public methods have preserved signatures and return types. Nothing changed from the caller's perspective. The refactoring split internal implementation without touching the external contract.

But the existing test coverage tells a different story: 12 tests at 67% coverage, all focused on the 3 most common flows. `cancelOrder` edge cases, refund calculations, and inventory rollback on failed orders have zero coverage. Those are exactly the behaviors most likely to break during a split — the logic that depends on interactions between pricing and inventory, which now live in separate files with separate method boundaries.

The agent identifies 31 distinct behavior contracts from the code's branching logic, loop structures, and conditional returns. Each one becomes a regression test.

### Step 3: Run Regression Tests Against Both Versions

31 regression tests get generated across 3 new test files (the **test-generator** skill supplies the framework detection, mocks and fixtures; here the project uses Vitest). The agent checks out the pre-refactor code in a separate git worktree so your working tree stays untouched, copies the new tests in, and runs them on both sides:

```console
$ git worktree add ../app-baseline "$(git merge-base main HEAD)"
$ cp -r tests/regression ../app-baseline/tests/ && (cd ../app-baseline && npm ci && npx vitest run tests/regression)
$ npx vitest run tests/regression
$ git worktree remove --force ../app-baseline
```

The tests run against both versions to establish what "correct" looks like:

**Against the old code (main): 31/31 passed.**
**Against the new code (HEAD): 29/31 passed.**

Two regressions surface. Neither would have been caught by the existing 12 tests. Neither throws an error — both produce a valid result that happens to be wrong. Without running the same logic against both code versions, these bugs would have shipped silently.

**Regression 1: Partial refund calculation on discounted orders**

The test "calculates 50% refund for order with percentage discount" catches a subtle math difference:

For a $50.00 line with a $7.50 discount and a 50% refund:

- **Old behavior:** `refund = lineTotal * 0.5 - discount * 0.5` = **$21.25**
- **New behavior:** `refund = lineTotal * 0.5 - discount` = **$17.50**

The problem is in `PricingService.ts:78`:

```typescript
// Old code — the discount is prorated with the refund
const refundPerItem = lineTotal * refundPercent;      // 25.00
const discountShare = discount * refundPercent;       // 3.75
return refundPerItem - discountShare;                 // 21.25

// New code — the full discount is deducted from a partial refund (wrong)
return lineTotal * refundPercent - discount;          // 17.50
```

The new line looks reasonable on its own: it only drops a variable during the move into the new file, and the signature and return type are unchanged. In production, every customer with a discount who requests a partial refund would receive less than they paid for. Across thousands of refunds, that adds up to real money, and it is the kind of discrepancy that triggers a financial audit.

**Regression 2: Inventory not restored for bundled items on cancellation**

The test "restores stock for all items in a bundle when order is canceled" exposes missing logic:

- **Old behavior:** Iterates `bundle.items` and restores each individual item to stock
- **New behavior:** Restores only the bundle SKU, not the individual component items

The bundle expansion logic didn't make it into `InventoryService.ts:45`. During the split, the method that handled bundle components stayed in `OrderService` where it no longer gets called during the cancellation flow. In production, canceling orders with bundles would permanently reduce available stock for each component item — a phantom inventory leak.

This is the kind of bug that takes weeks to surface. Nobody notices until a popular item mysteriously shows "out of stock" despite warehouse shelves being full. Customer support investigates, warehouse confirms stock is available, and engineering has to trace through order history to find the leak. By that time, dozens of cancellations have each silently removed items from the available count.

### Step 4: Fix and Re-Verify

```text
I fixed both issues — corrected the refund discount order of operations
in PricingService and moved the bundle expansion logic into
InventoryService. Run the regression tests again.
```

All 31 regression tests pass against the updated code. Both specific fixes verified:

- Partial refund on a discounted line: **$21.25** (matches old behavior)
- Bundle cancellation restores **3 individual items** (matches old behavior)
- All 29 other behaviors preserved

The agent also generates additional edge case coverage while it has context on the code:

**PricingService (+8 tests):**
- Discount stacking (percentage on top of flat discount)
- Zero-amount orders (free items, 100% discount)
- Currency rounding at penny boundaries ($X.995 rounds correctly)
- Negative amount guards (discounts can't exceed item total)

**InventoryService (+5 tests):**
- Negative stock guard (cancellation can't push stock below zero)
- Concurrent update handling (two cancellations for the same bundle)
- Partial bundle restoration (only some items in bundle are restorable)

Total test coverage for the refactored modules: **94%** (up from 67%). The refactored code is now better tested than the original ever was — and crucially, the tests verify behavior, not implementation. If someone refactors again in six months, these same tests will catch regressions in the new structure. Safe to merge.

### Step 5: Review the diff itself

Passing tests only prove the contracts the agent found. Before merging, the **code-reviewer** skill reads `git diff main...HEAD` for what tests rarely catch: leftover dead code in `OrderService`, a missing transaction around the pricing and inventory calls that used to share one, and error handling that changed when logic crossed a file boundary. Findings come back ranked by severity and marked as confirmed or suspected.

## Real-World Example

Tomas, a senior developer at a 25-person e-commerce startup, needs to refactor the payment processing module. The code has become a liability — written by a developer who left a year ago, it handles 14 payment scenarios across credit cards, PayPal, and subscriptions, and has grown to 800 lines with deeply nested conditionals that nobody fully understands. Adding a new payment method means touching 6 different branches and hoping nothing breaks. It has 8 tests covering the 3 most common flows — new customer credit card payment, refund, and subscription renewal. The other 11 scenarios are untested.

He splits it into three focused services: PaymentGateway, InvoiceGenerator, and SubscriptionManager. Each service is under 200 lines and actually readable. The agent analyzes the diff, identifies all 14 payment scenarios from the old code's branching logic, and generates 38 regression tests.

Against the old code — all 38 pass. Against the new code — 35 pass, 3 fail. One regression is particularly nasty: subscription trial-to-paid conversion skips the proration step, which would have overcharged roughly 200 trial users on their first bill. The overcharge is small enough per user ($3-8) that most wouldn't notice, but large enough in aggregate to trigger a dispute with the payment processor.

Tomas fixes the three regressions in 20 minutes. The agent re-verifies: all 38 tests pass on both implementations. The refactored code ships with 94% test coverage (up from 31%). Three months later, when a new developer modifies the pricing logic, the regression tests catch two issues before they leave the PR. The safety net pays for itself almost immediately — the team starts refactoring with confidence instead of dread. (Tomas, his team and these figures are illustrative.)

## Related Skills

- **regression-tester**: maps the refactoring scope and runs the generated tests against the old and new code.
- **test-generator**: detects the framework and writes the mocks, fixtures and extra edge-case tests.
- **code-reviewer**: reviews the diff for problems that tests do not exercise.
