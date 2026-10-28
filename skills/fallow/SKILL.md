---
name: fallow
description: >-
  Fallow is a fast static analyzer for TypeScript and JavaScript repositories that finds unused files, exports and dependencies, circular imports, copy-pasted code and overly complex functions, and gates pull requests on only the problems a change introduces. Use it when asked to "find dead code", "clean up unused dependencies", "check code health before merging", "find complexity hotspots", "audit this PR", or "migrate from knip". Needs no TypeScript compiler and no config to start.
license: Apache-2.0
compatibility: "Node.js 22+ (npm package ships a prebuilt Rust binary); a Git repository for audit and hotspot features"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "dead-code, code-health, complexity, typescript, static-analysis"
  repository: https://github.com/fallow-rs/fallow
---

# Fallow — dead code, duplication and complexity analysis for JS/TS

## Overview

Fallow is a Rust binary, distributed on npm, that builds one graph of a JavaScript or TypeScript repository (modules, exports, dependencies, functions) and answers several questions from it: what does nothing use, what is copied, where is the code hard to change, what forms an import cycle, and is this pull request safe to merge. It is deterministic (no AI inside the analyzer) and fast enough to run on every commit.

Commands verified against fallow 3.37.0:

| Question | Command |
|---|---|
| Everything at once | `npx fallow` |
| Unused files, exports, types, dependencies | `npx fallow dead-code` |
| Duplicated code | `npx fallow dupes` |
| Complexity, health score, refactoring targets | `npx fallow health` |
| Import cycles and boundary rules | `npx fallow architecture` |
| Only what a change introduced | `npx fallow audit --base <ref>` |
| Remove safe unused code | `npx fallow fix` |

Relation to knip: fallow's dead-code analysis covers the same ground as knip (unused files, exports and dependencies), and `fallow migrate` converts a knip, jscpd or stylelint config into a fallow config. The repository also documents duplication, complexity and PR gating in the same tool. Use the catalog's `knip` skill if a project already standardises on knip; use fallow when you also want complexity, duplication and a changed-files gate from one binary.

## Instructions

### Installation

Run without installing, or add it to the project:

```bash
npx fallow --help
npm install --save-dev fallow
```

The package provides three launchers: `fallow` (CLI), `fallow-lsp` (editor language server) and `fallow-mcp` (MCP server). `cargo install fallow-cli` and Docker are also listed in the official installation guide at https://fallow.tools/docs/installation/.

### Check project readiness

```bash
npx fallow doctor
```

Prints `[OK]` / `[-]` lines for root, config, workspaces, plugins, dependencies and cache, ending in `Status: ready` or `Status: ready with warnings` (for example when `node_modules` is missing, which degrades dependency analysis; run your package manager install first). It changes nothing.

### Find unused code and dependencies

```bash
npx fallow dead-code
npx fallow dead-code --format json
```

The text report groups results under "Unused files", "Unused exports", "Unused dependencies" and "Unused devDependencies", with file and line. Exit code 1 means findings at error severity; exit code 2 means an invalid run (do not hide it with `|| true`).

Before deleting anything, prove it is unused:

```bash
npx fallow dead-code --trace src/cart.ts:discount
npx fallow dead-code --trace-dependency lodash
```

The trace output says whether the file is reachable and why the export has no consumers. Static analysis cannot see usage through string-built imports, so for a published library keep the public API (see Guidelines).

### Preview and apply fixes

```bash
npx fallow fix --dry-run
npx fallow fix
```

`--dry-run` prints lines like `Would remove export from src/cart.ts:2 discount` and `Would remove lodash from dependencies in package.json` without touching files. Review the dry run, commit first, then run `fix`. File deletion is never auto-fixed; the JSON output marks it `auto_fixable: false`.

### Measure complexity and pick refactoring targets

```bash
npx fallow health --score
npx fallow health --targets --hotspots
```

`--score` gives a 0-100 health grade with the largest deductions. Functions above the cyclomatic, cognitive or CRAP thresholds are listed with severity (for example CRITICAL). `--hotspots` combines complexity with git churn over the last six months, and `--targets` ranks refactoring candidates by effort and payoff. Add `--coverage <coverage-final.json>` for exact CRAP scores; without it they are estimated from export references.

### Find duplication

```bash
npx fallow dupes
```

Reports clone groups across JS, TS and CSS. A clean run prints `No code duplication found`. To follow one group: `npx fallow dupes --trace dup:<fingerprint>` using a fingerprint from the report.

### Gate a pull request

```bash
npx fallow audit --base origin/main
```

Audit scopes the analysis to files changed against the base ref and fails (exit 1) only on findings the change introduces; older findings are excluded and the summary tells you how many were skipped. Use `--gate all` to enforce inherited findings as well. In CI the checkout needs history for the base ref (`fetch-depth: 0`).

GitHub Actions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: fallow-rs/fallow@v3
  with:
    command: audit
```

Add `fail-on-issues: false` to start in report-only mode.

### Adopt on an existing codebase

```bash
npx fallow recommend
npx fallow --save-baseline fallow-baseline.json
npx fallow --baseline fallow-baseline.json
```

`recommend` proposes a config without changing files. A saved baseline (bare `--save-baseline` stores the dead-code findings only; `audit` rejects the global flags and takes `--dead-code-baseline`, `--health-baseline` and `--dupes-baseline`) makes later runs fail only on new findings.

### Configuration

Config is optional. Fallow auto-discovers `.fallowrc.json` and `.fallowrc.jsonc` (`npx fallow init --toml` generates TOML instead); `npx fallow init` writes one and `npx fallow migrate` converts a knip, jscpd or stylelint config (`--dry-run` previews). Keys seen in the published schema include `entry`, `ignorePatterns`, `ignoreDependencies`, `ignoreExports`, `rules` and `boundaries`:

```json
{
  "$schema": "./node_modules/fallow/schema.json",
  "entry": ["src/cli.ts"],
  "ignorePatterns": ["**/*.generated.ts"],
  "rules": { "unused-exports": "warn" }
}
```

Rule severities are `error` (fails the run), `warn` (reports only) and `off`. To keep one intentional export, put a comment above it:

```ts
// fallow-ignore-next-line unused-export -- kept for plugin consumers
export const TAX = 0.2;
```

`npx fallow suppressions` lists every suppression in the project, and `npx fallow explain unused-export` documents any issue type.

### Monorepos

```bash
npx fallow dead-code --workspace storefront
npx fallow dead-code --changed-workspaces origin/main
```

npm, yarn and pnpm workspaces are discovered automatically.

### Coding-agent integration

```bash
npx fallow agent install --dry-run
npx fallow agent status
```

`agent install` (without `--dry-run`) edits agent configuration: it writes an `AGENTS.md` task map, installs skills, registers the MCP server and adds a gate on `git commit` and `git push`. Run it only when the user asks for that, and preview first. To register only the MCP server, the documented entry is:

```json
{ "mcpServers": { "fallow": { "command": "npx", "args": ["--yes", "--package", "fallow", "fallow-mcp"] } } }
```

## Examples

### Example 1: "Clean up unused code and dependencies before the release"

Request: Rin, who maintains a small storefront app, asks the agent to remove dead code safely.

```bash
npx fallow dead-code
npx fallow dead-code --trace src/cart.ts:discount
npx fallow fix --dry-run
```

Output on a sample project: one unused file (`src/legacy.ts`), two unused exports (`discount` and `TAX` in `src/cart.ts`), and an unused dependency (`lodash`). The trace for `discount` prints `UNUSED discount in src/cart.ts ... No references found, export is unused`. The dry run lists the export removals and `Would remove lodash from dependencies in package.json`. The agent shows the list to Rin, commits the working tree, runs `npx fallow fix`, then deletes `src/legacy.ts` by hand after confirming the trace, and runs `npm install` to refresh the lockfile.

### Example 2: "Is this PR safe to merge?"

Request: a reviewer asks whether the branch that adds `src/pay.ts` makes the codebase worse.

```bash
npx fallow audit --base origin/main
```

Output: `Audit scope: 2 changed files` followed by a "High complexity functions" entry for `pay` in `src/pay.ts` (CRITICAL, 12 cyclomatic, 22 cognitive) and a final line `complexity: 1 finding`; exit code 1. The agent reports the function, splits the payment-kind branches into small helpers, and re-runs the audit until it exits 0.

### Example 3: "Where should we refactor first?"

```bash
npx fallow health --targets --hotspots
```

Output: a metrics line (lines of code, average and p90 cyclomatic complexity, maintainability) and a ranked "Refactoring targets" list, each with effort, confidence, and a suggestion such as "Remove 2 unused exports to reduce surface area". The agent turns the top entries into a ticket list.

## Guidelines

- Treat every finding as a candidate, not proof. Run `--trace` before deleting an export or dependency; dynamic `require`, string-built paths and framework conventions can hide usage. Over 100 framework plugins detect entry points automatically; add missing ones under `entry`.
- For a published library, exported API with no in-repo consumer is intentional. In a monorepo list the package under `publicPackages`, or mark exports with a `/** @public */` JSDoc block comment (line comments do not count), or the dead-code report will be noisy.
- The `fix` command edits `package.json` and source files. Commit or stash first and always run `--dry-run` before applying.
- Exit codes: 0 clean (or audit pass/warn), 1 findings or audit fail, 2 invalid input or runtime error, 3 requested resource unavailable. Scripts may treat 0 and 1 as a completed run, never 2.
- Do not run `fallow watch` in an agent loop; it does not exit. Use `npx fallow viz` only for a human who wants the interactive HTML map.
- `--type-aware` improves symbol identity across re-exports but is an extra pass. Opt-in commands (`security`, `similar-code`, `mutation`) run extra work (mutation runs the project's tests); use them only on request.
- Analysis is local; telemetry is opt-in. Do not install the agent integration or pre-commit hook without being asked, because both modify repository or agent settings.
- Only JavaScript and TypeScript (and Vue, Svelte, Astro and CSS components) are analyzed; do not use fallow on other languages.
