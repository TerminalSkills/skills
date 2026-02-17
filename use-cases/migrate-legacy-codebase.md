---
title: "Migrate a Legacy Codebase to Modern Standards"
slug: migrate-legacy-codebase
description: "Incrementally convert legacy JavaScript to TypeScript with ES modules, async/await, and type safety."
skills: [code-migration]
category: development
tags: [migration, typescript, refactoring, legacy-code, modernization]
---

# Migrate a Legacy Codebase to Modern Standards

## The Problem

Your application was built in 2018 with CommonJS `require()`, callback-heavy async, and no type annotations. It works — mostly. Every week, a developer spends two days tracing a `TypeError: Cannot read property of undefined` through six files of untyped callbacks. Refactoring anything feels like defusing a bomb because there's no compiler to catch mistakes.

The codebase is 35,000 lines across 180 files. A full TypeScript migration was estimated at 3-4 months. Management approved "when there's bandwidth" — which means never. Meanwhile, developers move 30-40% slower because they can't trust function signatures. New hires take 3 weeks longer to become productive. Two engineers cited "developer experience" in their exit interviews.

You need an incremental migration that doesn't halt feature development — converting modules in dependency order, with confidence that nothing breaks.

## The Solution

The **code-migration** skill analyzes your dependency graph, determines optimal migration order (leaf modules first), and converts files incrementally. It infers types from usage patterns, converts callbacks to async/await, and validates each batch with your existing test suite. Migration is done in 5-10 file batches with tests after each.

```bash
npx terminal-skills install code-migration
```

## Step-by-Step Walkthrough

### 1. Analyze the dependency graph

```
Analyze this codebase for TypeScript migration. Map dependencies and show migration order.
```

```
Dependency Analysis — 180 files, 35,247 lines

  Leaf modules (0 internal deps):  23 files — migrate FIRST
  Low-dependency (1-2 deps):       41 files — batch 2
  Medium-dependency (3-5 deps):    67 files — batch 3-4
  High-dependency (6+ deps):       38 files — batch 5-6
  Entry points:                    11 files — migrate LAST

Patterns: 100% CommonJS, 26% callbacks, 35% promise chains, 87% no types
Plan: 6 batches over 3-4 sessions (~2 hours total)
```

### 2. Set up TypeScript and migrate leaf modules

```
Initialize TypeScript for incremental migration, then convert all 23 leaf modules.
```

```
Created: tsconfig.json (strict mode, allowJs: true)
Added: typescript, ts-node, @types/node, @types/express

Migrating 23 leaf modules...
  ✓ src/utils/format-date.js → .ts (4 type annotations, Date | string inferred)
  ✓ src/utils/currency.js → .ts (added CurrencyCode enum, Amount interface)
  ✓ src/utils/validators.js → .ts (ValidationResult interface, 6 annotations)
  ... (20 more)

  require → import: 23 files | module.exports → export: 23 files
  Callbacks → async/await: 8 | Types added: 67 annotations, 12 interfaces

Tests: 94 passing ✓ | TypeScript: 0 errors
```

### 3. Migrate the service layer with type inference

```
Convert the 41 service files. Infer types from database queries and API responses.
```

```
Type inference:
  156 database queries → 28 row type interfaces
  23 external API calls → 14 response interfaces
  89 function calls → 134 parameter types inferred

  src/services/payment.js → .ts
    Before: function processPayment(data, callback)
    After:  async function processPayment(data: PaymentRequest): Promise<PaymentResult>

  41/41 files converted | Callbacks → async: 31 | Promise chains → async: 24
Tests: 94 passing ✓ | TypeScript: 0 errors
```

### 4. Handle complex modules with circular deps

```
Convert batches 3-5 (105 files). Flag circular dependencies needing decisions.
```

```
⚠️  Circular dependency: order.ts ↔ inventory.ts
  Resolution: Extracted shared types to src/types/order-inventory.ts — cycle broken

⚠️  2 manual decisions needed (auto-resolved):
  1. Error handler catches `any` → applied custom AppError hierarchy
  2. Dynamic property access on untyped webhook → added StripeWebhookEvent type

105/105 converted | All callbacks eliminated | Tests: 94 passing ✓
Progress: 169/180 files (94%)
```

### 5. Complete migration and enable strict mode

```
Convert remaining entry points and enable strict TypeScript checks.
```

```
11 entry points converted (app.ts, server.ts, workers)

Strict mode check: 12 implicit-any errors → auto-fixed with explicit annotations

FINAL STATS:
  180/180 files converted (100%)
  847 type annotations, 126 interfaces/types created
  47 callbacks → 0, all CommonJS → ES modules
  Strict mode: 0 errors, 0 warnings
  All 94 tests passing ✓
```

## Real-World Example

An engineering lead at a mid-size logistics SaaS company faced a 45,000-line untyped Express API built by rotating contractors. New features taking weeks instead of days. He assigned a mid-level engineer to manual migration — after two weeks, she'd converted 22 files and introduced 3 regressions.

They tried the code-migration skill. Tuesday morning: 65 leaf and low-dependency modules converted — more than two weeks of manual work. Wednesday afternoon: all 200 files in TypeScript with strict mode. The engineer spent Thursday reviewing generated types, correcting 8 that had technically correct but misleadingly named interfaces.

Results over the next month: team velocity increased ~35%. IDE autocomplete worked everywhere. A junior developer caught a data shape mismatch during development that would have shipped as a production bug. The TypeScript compiler blocked 4 PRs with type errors — bugs invisible in the old codebase.

## Related Skills

- [test-generator](../skills/test-generator/) — Generate tests before migration as a safety net for refactoring
- [code-reviewer](../skills/code-reviewer/) — Review migrated code for TypeScript best practices
- [cicd-pipeline](../skills/cicd-pipeline/) — Add TypeScript compilation checks to your CI pipeline
