---
title: "Manage Monorepo Dependencies with AI"
slug: manage-monorepo-dependencies
description: "Keep dependency versions in sync across monorepo packages and resolve version conflicts automatically."
skills: [monorepo-manager, code-reviewer, security-audit]
category: development
tags: [monorepo, dependencies, workspaces, turborepo, developer-productivity]
---

# Manage Monorepo Dependencies with AI

## The Problem

Your monorepo has 20 packages and 4 apps. React is on three different versions across different workspaces. TypeScript configs are subtly different -- one package uses `strict: true`, another uses `strictNullChecks: false`, and a third has a tsconfig that hasn't been updated since the monorepo was 3 packages. A junior developer adds `lodash` directly to an app instead of the shared utils package, creating the fourth copy in the dependency tree.

Nobody knows which packages depend on which. Builds randomly fail with type errors that disappear when you delete `node_modules` and reinstall -- the classic "have you tried turning it off and on again" of monorepo development. "It works on my machine" is the team motto because different developers have different versions of pnpm, which resolves the dependency tree differently. Last week, a PR that changed nothing in the UI library caused a type error in the web app because TypeScript 5.4 in one package type-checks differently from TypeScript 5.9 in another.

Dependency chaos costs hours per week in debugging phantom type errors, version conflicts, and mysterious CI failures that can't be reproduced locally. The team has gotten so used to flaky builds that they've developed a habit of just re-running CI -- but the failures aren't random. They're deterministic consequences of version mismatches that nobody has mapped out.

## The Solution

Using the **monorepo-manager** skill to audit, sync, and maintain dependencies across all workspaces, **code-reviewer** to review the dependency diff before merging, and **security-audit** to catch vulnerable transitive dependencies, the agent maps the dependency graph, identifies every mismatch, and fixes them in the right order.

## Step-by-Step Walkthrough

### Step 1: Map the Monorepo Structure

```text
Analyze our monorepo structure. Show me all packages, their internal
dependencies, and the tooling we're using.
```

The agent detects the tooling from the config files (`pnpm-workspace.yaml`, `turbo.json`) and lists each workspace. In this example repo: pnpm workspaces plus Turborepo, and an internal dependency graph with no cycles:

```text
packages/types       -> (no deps)
packages/utils       -> types
packages/ui          -> types, utils
packages/database    -> types
apps/web             -> ui, utils, database, types
apps/api             -> database, utils, types
apps/admin           -> ui, utils, types
```

The graph decides the order in which changes propagate. `packages/types` is the foundation, so a breaking change there ripples through everything. The agent also flags that `lodash` appears in 4 separate `package.json` files instead of being provided once through `packages/utils`.

### Step 2: Audit Dependency Versions

```text
Find all dependency version mismatches across our packages. Show the worst offenders.
```

The agent reads every `package.json` and, for a second opinion that does not depend on the model, runs syncpack, which exits non-zero when versions differ:

```console
$ npx syncpack lint
= Default Version Group ========================================================
   2x zod
      ✘ 4.3.6 → 4.6.7 in packages/b/package.json at .dependencies (DiffersToHighestOrLowestSemver)
✗ Issues found
```

The report, ranked by risk:

| Dependency | Versions in Use | Packages Affected | Risk |
|-----------|----------------|-------------------|------|
| typescript | 5.9.3, 5.8.3, 5.4.2 | 8 | High -- different type-checking behavior per package |
| eslint | 10.14.0, 8.57.0 | 5 | High -- major split, `.eslintrc` vs flat config |
| date-fns | 4.4.0, 2.30.0 | 2 | High -- two major versions apart |
| react | 19.2.9, 19.1.10 | 3 | Low -- minor version |
| zod | 4.6.7, 4.3.6 | 4 | Low -- minor version |
| vitest | 4.1.12, 4.0.18 | 4 | Low -- minor version |

The TypeScript mismatch is the most insidious: the shared UI library can produce different errors depending on which compiler version the consuming package uses, which is the real cause of the "works on my machine" reports.

### Step 3: Fix Mismatches with a Plan

```text
Sync all dependencies to their latest compatible versions. Show me what will
change before applying.
```

The agent produces a plan by risk level:

**Low risk (minor bumps, apply first):** react, zod and vitest unified to the highest version already in use.

**High risk (major splits, apply with care):**
- eslint 8 -> 10: ESLint 10 no longer supports the legacy `.eslintrc` format at all, so every package's config moves to `eslint.config.js` (flat config), and Node.js must be 20.19 or newer. See the [ESLint v10 migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0).
- date-fns 2 -> 4: since v3, files are exported by name instead of `export default`, so `import format from 'date-fns/format'` becomes `import { format } from 'date-fns'`. The v2 -> v3 notes are in the [date-fns changelog](https://github.com/date-fns/date-fns/blob/v4.1.0/CHANGELOG.md).

The agent edits the `package.json` files leaf packages first and apps last, then verifies:

```console
$ pnpm install && pnpm turbo build test
```

Before merging, ask the code-reviewer to review the diff:

```text
Review this dependency diff: flag any package whose version range changed
from workspace:* or catalog: to a pinned number, any new direct dependency
that duplicates one in packages/utils, and any major bump without a code
change that goes with it.
```

### Step 4: Check for Security Issues

```text
Now run a security audit on our updated dependencies.
```

With versions unified, the same advisory is not repeated once per copy. The agent runs `pnpm audit`, which queries the registry's security advisory endpoint and identifies each advisory by its GitHub advisory ID (GHSA), then groups findings by how to fix them:

```console
$ pnpm audit --audit-level moderate
```

Typical outcomes: a transitive advisory that disappears with the eslint upgrade, one removed by deduplicating `lodash` to a single copy in `packages/utils`, and a dev-only advisory fixed for a clean report. `pnpm audit --fix` can add overrides for what remains; the security-audit skill reviews each override rather than accepting it blindly.

### Step 5: Set Up Ongoing Enforcement

```text
How do I prevent version drift from happening again?
```

Four mechanisms close the loop:

- **pnpm catalogs** -- define shared versions once in `pnpm-workspace.yaml` (pnpm 9.5+) and reference them with the `catalog:` protocol:

  ```yaml
  # pnpm-workspace.yaml
  packages:
    - "apps/*"
    - "packages/*"
  catalog:
    react: ^19.2.9
    zod: ^4.6.7
    typescript: ~5.9.3
  ```

  ```json
  { "dependencies": { "react": "catalog:", "zod": "catalog:" } }
  ```

  `catalog:` is the default catalog; named catalogs are referenced as `catalog:<name>`.
- **CI check** -- run `npx syncpack lint` as a pipeline step. It exits 1 when any package uses a version that breaks your syncpack config, so a mismatch cannot reach the main branch. `syncpack update --dry-run` also lists available bumps for the catalog entries in `pnpm-workspace.yaml`.
- **Renovate or Dependabot** -- automated PRs for updates. Both can update catalog entries, so one PR moves every package together.
- **A syncpack config** (`.syncpackrc.json`) -- states the version policy, for example which dependencies must come from the catalog.

Run `pnpm install --frozen-lockfile` in CI so the committed lockfile, not a fresh resolution, decides what gets tested.

The agent also recommends dropping the 4 direct `lodash` dependencies: the apps import the helpers they need from `packages/utils`, which owns the single copy.

## Real-World Example

Priya leads a frontend platform team at a 30-person B2B startup. Their monorepo grew from 3 packages to 22 over two years, and nobody owned the dependency graph.

She asks the agent to audit it and gets 14 mismatches, three of them major splits. The most damaging is TypeScript 5.4 versus 5.9 across packages, which breaks the shared UI library intermittently and explains the "flaky" CI.

She has the agent sync TypeScript to 5.9.3 everywhere. It updates 8 `package.json` files in dependency order, runs `pnpm install && pnpm turbo build`, and everything compiles. The eslint 8 to 10 migration takes longer: five `.eslintrc` files become two shared `eslint.config.js` files that the workspaces extend.

The previous manual attempt took a full sprint day and broke staging, because the engineer updated apps before the packages they depend on. The following week the syncpack check in CI catches a new developer adding an older `zod` to `apps/admin`, and the fix takes five minutes.

## Related Skills

- **monorepo-manager** -- maps the workspace graph, finds mismatches and applies the sync in dependency order
- **code-reviewer** -- reviews the dependency diff before it merges
- **security-audit** -- audits the unified dependency tree and judges `pnpm audit` fixes
