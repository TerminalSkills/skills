---
title: "Migrate a Legacy Codebase with AI"
slug: migrate-legacy-codebase
description: "Use an AI agent to systematically migrate legacy code to modern frameworks, languages, or architectures."
skills: [code-migration]
category: development
tags: [migration, refactoring, legacy-code, modernization, typescript]
---

# Migrate a Legacy Codebase with AI

## The Problem

Legacy codebases accumulate technical debt that eventually blocks progress. A JavaScript project started in 2018 with CommonJS, callbacks, and no type safety becomes painful to maintain as the team grows. Manual migration is risky — renaming 200 files from `.js` to `.ts`, converting `require` to `import`, and adding type annotations to 15,000 lines of code takes weeks and introduces regressions at every step. Teams delay the migration quarter after quarter because the effort feels unbounded.

## The Solution

The `code-migration` skill breaks large migrations into safe, incremental steps: file conversion, syntax transformation, type inference, and validation. It migrates module by module, running tests after each batch to catch regressions immediately.

```bash
npx terminal-skills install code-migration
```

## Step-by-Step Walkthrough

### 1. Analyze the codebase and create a migration plan

```
Analyze this project and create a migration plan from JavaScript (CommonJS) to TypeScript with ES modules. Map all dependencies between modules, identify the leaf modules with no internal dependents, and propose a migration order that minimizes breakage.
```

The agent builds a dependency graph, identifies 12 leaf modules, and proposes four migration batches starting from utilities and working inward toward core business logic.

### 2. Migrate the first batch of leaf modules

```
Migrate all files in src/utils/ and src/helpers/ to TypeScript. Convert require/module.exports to import/export, add type annotations inferred from usage patterns and JSDoc comments, and rename files to .ts. Keep the existing behavior identical.
```

The agent converts 14 files, adds 83 type annotations, and creates two shared interface files for commonly passed objects like `UserContext` and `PaginationOptions`.

### 3. Validate the migration batch

```
Run the existing test suite against the migrated utils and helpers. If any tests fail due to import path changes or type mismatches, fix them. Show me a summary of what passed and what needed adjustment.
```

```
14 files migrated | 47 tests run
45 passed | 2 fixed (import path updates in test files)
0 regressions detected
```

### 4. Migrate the service layer with complex types

```
Now migrate src/services/ to TypeScript. These files have more complex types — infer interfaces from the database models in src/models/ and the API response shapes in src/controllers/. Create shared type definitions in src/types/.
```

The agent processes 9 service files, generates 11 interfaces in `src/types/`, and applies 142 type annotations. It flags two functions with `any` types that need manual review due to dynamic object construction.

### 5. Generate a migration progress report

```
Show me overall migration progress: how many files are converted, type coverage percentage, remaining untyped modules, and estimated effort to complete the migration.
```

```
Migration Progress:
- Files converted: 23/38 (60.5%)
- Type coverage: 72.8% (strict mode)
- Remaining: src/controllers/ (8 files), src/middleware/ (4 files), src/models/ (3 files)
- Estimated remaining effort: 1-2 sessions
```

## Real-World Example

A senior developer at an e-commerce company needs to migrate their 38-file Express.js API from JavaScript to TypeScript before onboarding three new engineers. The untyped codebase causes an average of two runtime type errors per week in production.

1. The agent maps the dependency graph and identifies that `src/utils/` and `src/helpers/` have zero internal dependents — safe to migrate first
2. Batch one converts 14 utility files with 83 inferred types; all 47 existing tests pass after two import path fixes
3. Batch two tackles the 9 service files, generating 11 shared interfaces from database model patterns
4. After three sessions over two days, 35 of 38 files are fully typed with 89% type coverage

The migration that was estimated at 3-4 weeks of manual work is completed in 6 hours of interactive sessions. Runtime type errors drop to zero in the first month after migration.

## Related Skills

- [test-generator](../skills/test-generator/) — Generate tests before migrating to ensure behavior is preserved
- [code-reviewer](../skills/code-reviewer/) — Review migrated code for idiomatic TypeScript patterns
