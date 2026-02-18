---
title: "Automate Dependency Updates and Catch Breaking Changes with AI"
slug: automate-dependency-updates
description: "Scan your project for outdated dependencies, detect breaking changes before they hit production, and generate safe upgrade plans."
skills: [dependency-updater, code-migration]
category: development
tags: [dependencies, npm, security, upgrades, breaking-changes]
---

# Automate Dependency Updates and Catch Breaking Changes with AI

## The Problem

Your Node.js project has 187 dependencies. Dependabot opens 15 PRs a week that nobody reviews. Three packages are 2 major versions behind. Last time someone batch-upgraded everything, the app broke in production because a library changed its API silently. Now the team is afraid to update anything, and you're running packages with known CVEs.

## The Solution

Use AI to analyze your dependency tree, identify which updates carry breaking changes, generate migration code for API differences, and produce a safe, ordered upgrade plan. The `dependency-updater` skill audits your packages and the `code-migration` skill handles the actual code changes.

## Step-by-Step Walkthrough

### 1. Audit your dependency health

```text
Analyze our package.json and package-lock.json. Show me every outdated dependency grouped by risk level: critical (known CVEs), major (breaking version jump), minor (safe to update), and pinned (intentionally locked). Include how far behind each one is.
```

The agent scans your lockfile and cross-references npm registry data:

```text
Dependency Audit — 187 packages analyzed

CRITICAL (Known Vulnerabilities) — Update Immediately:
  jsonwebtoken 8.5.1 → 9.0.2 (CVE-2022-23529, severity: HIGH)
  axios 0.21.4 → 1.7.2 (CVE-2023-45857, severity: MEDIUM)
  semver 6.3.0 → 7.6.0 (CVE-2022-25883, severity: MEDIUM)

MAJOR (Breaking Changes) — Review Required:
  next 13.4.12 → 14.2.3 (App Router changes, Middleware API update)
  prisma 4.16.2 → 5.14.0 (new client API, changed relation loading)
  stripe 12.18.0 → 15.8.0 (webhook handler signature changed)

MINOR/PATCH (Safe) — 34 packages can be updated with no breaking changes

PINNED — 3 packages locked with exact versions:
  sharp@0.32.1 (pinned due to native build issues on ARM)
```

### 2. Get a detailed breaking change report

```text
For the three MAJOR packages (next, prisma, stripe), show me exactly what APIs changed between our version and the latest. Check our codebase for files that use the affected APIs.
```

The agent reads changelogs and scans your source code:

```text
Breaking Change Impact Report:

next 13.4.12 → 14.2.3:
  - Middleware: `NextResponse.rewrite()` signature changed (2 files affected)
    src/middleware.ts:12 — uses old rewrite pattern
    src/middleware.ts:34 — uses old redirect pattern
  - Image component: `layout` prop removed, use `fill` instead (8 files affected)
  - Minimum React version: 18.2.0 (you have 18.2.0 ✓)

prisma 4.16.2 → 5.14.0:
  - `findUnique` no longer accepts `rejectOnNotFound` (14 files affected)
  - JSON protocol is now default (no code change needed)
  - `@prisma/client` import path unchanged ✓

stripe 12.18.0 → 15.8.0:
  - Constructor: `new Stripe(key)` no longer accepts apiVersion in options (1 file)
  - Webhook: `stripe.webhooks.constructEvent()` unchanged ✓
  - Types: 12 type names renamed with `Stripe.` prefix (6 files affected)
```

### 3. Generate the upgrade plan and migration code

```text
Create a safe upgrade plan with the exact order to update packages. For each major upgrade, generate the migration code diffs. Start with the CVE fixes since those are low-risk, then handle the major bumps one at a time.
```

### 4. Apply and verify

```text
Apply the CVE fixes first — update jsonwebtoken, axios, and semver. Show me the exact npm commands and any code changes needed. Then run the existing test suite to confirm nothing broke.
```

### 5. Set up continuous dependency monitoring

```text
Create a weekly automated check that scans for new CVEs in our current dependencies and alerts us in Slack if anything critical appears. Also flag any dependency that becomes deprecated or unmaintained. Generate the GitHub Action workflow for this.
```

The agent produces a complete CI workflow:

```yaml
# .github/workflows/dependency-monitor.yml
name: Weekly Dependency Check
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday 9 AM UTC
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --json > audit-results.json
      - name: Check for critical vulnerabilities
        run: |
          CRITICAL=$(jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical") | .key' audit-results.json)
          if [ -n "$CRITICAL" ]; then
            curl -X POST $SLACK_WEBHOOK -d "{\"text\":\"🚨 Critical CVEs found: $CRITICAL\"}"
          fi
```

## Real-World Example

Priya is a senior developer at a 40-person fintech startup. Their main API hasn't had a dependency audit in 8 months. The security team flagged 6 CVEs in their last scan, and engineering promised to fix them "next sprint" — three sprints ago.

1. Priya feeds the lockfile to the agent and gets a full audit in 30 seconds — revealing 6 CVEs, 11 major updates pending, and 3 packages that are completely unmaintained
2. The breaking change scan shows that their Prisma upgrade will touch 14 files, but 12 of them are the same one-line pattern change
3. The agent generates a migration script that handles all 14 Prisma files automatically
4. Priya upgrades in order: CVE patches first (zero code changes), then Prisma (auto-migrated), then Next.js (2 manual fixes)
5. Total time: 3 hours instead of the estimated 2 weeks. Zero production incidents from the upgrade.
