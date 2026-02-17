---
name: dependency-updater
description: >-
  Audit project dependencies for outdated packages, security vulnerabilities, and breaking changes.
  Use when someone asks to "check for outdated packages", "audit dependencies", "find vulnerable
  dependencies", "plan dependency upgrades", "detect breaking changes", or "update npm packages safely".
  Analyzes package.json/lock files, cross-references changelogs, and produces ordered upgrade plans.
license: Apache-2.0
compatibility: "Supports npm (package.json), yarn (yarn.lock), pnpm (pnpm-lock.yaml), pip (requirements.txt), and Go (go.mod)"
metadata:
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["dependencies", "npm", "security", "upgrades", "semver"]
---

# Dependency Updater

## Overview

This skill analyzes your project's dependency tree to find outdated packages, known vulnerabilities, and breaking API changes. It produces a prioritized upgrade plan with specific migration steps, ordered to minimize risk and maximize safety.

## Instructions

### 1. Parse the Dependency File

- Read `package.json` + lockfile (npm/yarn/pnpm), `requirements.txt`/`pyproject.toml`, or `go.mod`
- List all direct dependencies with current pinned versions
- Note version constraints (^, ~, exact, ranges)

### 2. Check Each Package

For each dependency:
- **Latest version**: What's available on the registry
- **Version gap**: How many major/minor/patch versions behind
- **Security**: Known CVEs from npm audit, Snyk, or GitHub Advisory Database
- **Maintenance**: Last publish date, open issues count, whether it's deprecated
- **Breaking changes**: Read CHANGELOG.md or GitHub releases for breaking change notes between current and latest

### 3. Classify by Risk

Group packages into four tiers:
- **Critical**: Known CVE with severity HIGH or CRITICAL — update immediately
- **Major**: Major version bump with confirmed breaking API changes — needs migration
- **Minor**: Minor/patch updates with no breaking changes — safe to batch update
- **Stale**: Package unmaintained (no release in >12 months) — consider replacement

### 4. Scan for Impact

For Major-tier packages:
- Read the changelog/migration guide for the new version
- Search the codebase for imports and usages of changed APIs
- List affected files with line numbers
- Estimate effort: how many patterns need changing and whether they're automatable

### 5. Generate Upgrade Plan

Produce an ordered plan:
1. Critical (CVE fixes) first — usually patch-level, zero code changes
2. Minor/patch batch — single `npm update` command
3. Each Major upgrade individually, with:
   - Exact install command (`npm install package@version`)
   - Code changes needed (as diffs when possible)
   - Test commands to verify

## Examples

### Example 1: Node.js Project Audit

**Input**: User provides package.json with 94 dependencies.

**Output**:
```
Dependency Audit — 94 packages

CRITICAL (2 packages):
  lodash 4.17.20 → 4.17.21
    CVE-2021-23337 (Command Injection, HIGH)
    Fix: npm install lodash@4.17.21 (patch, no code changes)

  node-fetch 2.6.1 → 2.6.13
    CVE-2022-0235 (Information Exposure, MEDIUM)
    Fix: npm install node-fetch@2.6.13 (patch, no code changes)

MAJOR (1 package):
  express 4.18.2 → 5.0.0
    Breaking: req.host now returns host without port
    Breaking: app.del() removed, use app.delete()
    Affected files: src/server.ts:45 (uses req.host), src/routes/legacy.ts:12 (uses app.del)
    Migration effort: Low — 2 files, 2 line changes

MINOR (18 packages):
  Can be batch-updated: npm update (no breaking changes detected)

STALE (1 package):
  request 2.88.2 — DEPRECATED, last release Feb 2020
  Recommended replacement: undici or node-fetch
  Used in: src/lib/http-client.ts (3 call sites)

Upgrade Order:
  Step 1: npm install lodash@4.17.21 node-fetch@2.6.13
  Step 2: npm update
  Step 3: npm install express@5.0.0 (apply 2 code changes first)
  Step 4: Replace request with undici (separate PR recommended)
```

### Example 2: Python Requirements

**Input**: User provides requirements.txt with pinned versions.

**Output**:
```
Dependency Audit — 23 packages

CRITICAL:
  django==3.2.18 → 3.2.25
    CVE-2024-24680 (DoS via intcomma, MEDIUM)
    Fix: pip install django==3.2.25 (patch within same minor)

MAJOR:
  django==3.2.25 → 5.0.6 (if full upgrade desired)
    Breaking: DEFAULT_AUTO_FIELD must be set explicitly
    Breaking: url() removed, use path()
    Affected: 8 files in urls/, settings.py
```

## Guidelines

- Never recommend upgrading all major versions at once — one at a time, with tests between each
- For monorepos, check if packages have peer dependency conflicts before recommending upgrades
- If a package is deprecated with no CVE, it's STALE not CRITICAL — don't panic the user
- Always check if the project has a test suite (`npm test`, `pytest`) and recommend running it after each step
- When generating diffs, use the project's actual code, not generic examples
- For workspaces/monorepos, note which workspace each dependency belongs to
