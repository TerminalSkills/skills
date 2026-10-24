---
name: react-doctor
description: >-
  React Doctor scans a React codebase with deterministic rules and reports bugs, effect and state mistakes, performance problems, accessibility errors, security issues and maintainability hotspots. Use when the user asks to audit a React, Next.js, Vite, Expo or React Native project, check what an AI agent wrote for React mistakes, gate pull requests on React issues, or says "run react-doctor", "scan my React app", "why did this rule fire", "fix useEffect problems".
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.13+ and npm; a React project (Next.js, Vite, Astro, TanStack, React Native, Expo); git for diff-scoped scans"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "react, linting, code-quality, accessibility, ci"
  repository: https://github.com/millionco/react-doctor
---

# React Doctor — deterministic health check for React code

## Overview

React Doctor (`react-doctor` on npm) is a command-line scanner for React projects. It runs a fixed set of rules (no model involved) over the source and prints findings grouped by category such as Bugs, Accessibility, Performance, Security and Maintainability, each with a rule id, a file and a line. It understands Next.js, Vite, Astro, TanStack, React Native and Expo projects, and monorepos.

It suits two jobs: a one-off audit of an existing codebase, and a guardrail that checks what a coding agent or a teammate changed. It can scan only changed files or only newly introduced issues, emits a versioned JSON report, and sets a non-zero exit code when a blocking issue is found.

## Instructions

### Run a scan

Run from the project root (or pass a directory or file paths). No install is needed.

```bash
npx react-doctor@latest                     # whole project, top 3 rules shown
npx react-doctor@latest --verbose           # every rule and file
npx react-doctor@latest ./apps/web          # one package in a monorepo
npx react-doctor@latest src/Cart.tsx src/Checkout.tsx   # selected files
```

The terminal output lists each finding as a severity mark (`✖` error, `⚠` warning), the title, the rule id (for example `react-doctor/no-fetch-in-effect`) and `path:line`. The full list is also written to a temporary folder printed at the end; `--output-dir <dir>` chooses where.

The exit code is `1` when there is an error-level finding and `0` otherwise. `--blocking warning` makes warnings fail too; `--blocking none` makes the run advisory (always `0`). `--warning-exit-code 2` (any value from 2 to 255) gives warnings their own exit code, for CI systems that show a "warning" state.

### Understand a finding

```bash
npx react-doctor@latest why src/OrderList.tsx:7    # explains the rule and shows the code
npx react-doctor@latest rules list                 # all rules and their severity in this config
npx react-doctor@latest rules explain exhaustive-deps
```

`why` also tells you whether a suppression comment applies. To silence one false positive, put a `react-doctor-disable-next-line` comment on the line above (the `why` output shows the exact form). Use `--no-respect-inline-disables` for an audit that ignores existing suppressions.

### Narrow a scan to what changed

```bash
npx react-doctor@latest --scope changed --base main   # only issues new compared with main
npx react-doctor@latest --scope lines --base main     # only issues on changed lines
npx react-doctor@latest --staged                      # staged files, for a pre-commit hook
npx react-doctor@latest --json-out before.json --json . ; npx react-doctor@latest --baseline before.json
```

`--scope` accepts `full` (default), `files`, `changed`, `lines` and `contextual`. The base ref is auto-detected when `--base` is omitted. `--baseline <report.json>` reports only findings that are not in a previously saved JSON report, which suits legacy codebases where you want to stop new problems first.

### Machine-readable output

```bash
npx react-doctor@latest --json --no-score > report.json
```

The report has `schemaVersion` (3), `mode`, `projects`, `diagnostics` and `summary`. Each diagnostic carries `filePath`, `plugin`, `rule`, `severity`, `category`, `title`, `message`, `help`, `line`, `column` and an `id`. Do not conclude a project is clean from an empty `diagnostics` list; check each project's `complete` and `analyzedFiles` fields.

Filter with `--category Security` (repeatable), `--no-warnings` for errors only, or `--project web,admin` for named workspaces.

### Configure rules

Create `doctor.config.ts` (or `.js`, `.mjs`, `.json`, or a `reactDoctor` key in `package.json`) in the project root. CLI flags override it. For quick changes use the CLI instead of editing by hand:

```bash
npx react-doctor@latest rules set no-array-index-as-key off
npx react-doctor@latest rules category Accessibility error
npx react-doctor@latest rules ignore-tag design
```

### Add it to the agent workflow and CI

```bash
npx react-doctor@latest install     # installs the react-doctor skill for detected coding agents, optional git hook, "doctor" script
npx react-doctor@latest ci install  # sets up a pull-request scan in CI
```

Both commands change files in the repository (agent skill files, `package.json`, workflow files). Run them only when the user asked for the setup, and review the diff afterwards.

### Runtime performance trace

```bash
npm run dev &                                   # your app on its own port
npx react-doctor@latest scan http://localhost:5173
```

`scan <url>` opens Chrome, records a DevTools performance trace of one interaction and waits for you to press Enter. It needs a person at a terminal, so an agent should leave it to the user.

### Network use and privacy

By default the CLI sends crash reports and anonymous usage data, calls a score API, and runs a dependency supply-chain check backed by Socket.dev. For private code or offline CI use `--no-score` (alias `--no-telemetry`) and `--no-supply-chain`.

## Examples

### Example 1: Audit a Next.js app before a refactor

Request: "Give me a prioritized list of what is wrong in apps/storefront before we start the migration."

```bash
cd ~/work/storefront
npx react-doctor@latest ./apps/storefront --no-score --verbose --json-out audit.json --json
python3 -c "
import json, collections
d = json.load(open('audit.json'))
c = collections.Counter((x['category'], x['rule']) for x in d['diagnostics'])
for (cat, rule), n in c.most_common(10): print(f'{n:4}  {cat:14} {rule}')
"
```

The output is a ranked table of the ten most frequent rule hits (for example `no-fetch-in-effect` and `exhaustive-deps`). Fix errors first, then one rule family at a time, and re-run the scan after each batch. For a rule that fires in dozens of files, fix a few files, confirm the pattern is right, then ask the owner before changing the rest.

### Example 2: Block new issues in a pull request without fixing the backlog

Request: "CI should fail only if a PR adds React problems, we cannot clean the old ones now."

```bash
git fetch origin main
npx react-doctor@latest --scope changed --base origin/main --no-score --no-supply-chain
echo "exit code: $?"
```

Only findings introduced by the branch are reported. A new `<img>` without `alt` in `src/Hero.tsx` is the only finding listed and exits `1`, failing the job; the older issues in other files are ignored. To make warnings visible but not blocking in GitLab, add `--warning-exit-code 2` and set that code as "allowed failure".

### Example 3: Check what an agent just wrote

Request: "I let the agent add the order list. Check it for React mistakes."

```bash
npx react-doctor@latest --staged --no-score --no-supply-chain
```

With `OrderList.tsx` staged the scan reports a fetch inside `useEffect` with no status check, missing effect dependencies, an array index used as a key, and an image with no `alt` (the only error, so the exit code is `1`). The agent then fixes those and re-runs until the exit code is `0`.

## Guidelines

- The rules are heuristic checks, not proof: treat each finding as a lead and read the code. Suppress confirmed false positives with a comment instead of turning a rule off for the whole project.
- Fix in small batches by rule family, keep behavior unchanged, and run the project's tests after each batch.
- Use `@latest` in docs and CI scripts only if you accept new rules appearing; pin an exact version number after `react-doctor@` in CI for stable results.
- `install` and `ci install` write to the repo; do not run them as a side effect of a plain "scan" request.
- It analyses JS and TS React sources. It does not replace ESLint or TypeScript checks, tests, or a manual accessibility review.
- Scanning does not modify source files.
