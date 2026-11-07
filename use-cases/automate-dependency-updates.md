---
title: "Automate Dependency Updates and Catch Breaking Changes with AI"
slug: automate-dependency-updates
description: "Scan your project for outdated dependencies, detect breaking changes before they hit production, and generate safe upgrade plans."
skills: [dependency-updater, code-migration, axios]
category: development
tags: [dependencies, npm, security, upgrades, breaking-changes]
---

# Automate Dependency Updates and Catch Breaking Changes with AI

## The Problem

Priya's Node.js project has 187 dependencies. Dependabot opens 15 PRs a week that nobody reviews — they pile up in the queue like unread emails, each one a small gamble between "safe patch" and "subtle breaking change." Three packages are 2 major versions behind. Last time someone batch-upgraded everything on a Friday afternoon, the app broke in production because a library changed its API in a patch release without documenting it. The rollback took 40 minutes and ruined the weekend.

Now the team is afraid to update anything. Six packages have known CVEs sitting in the backlog under a Jira ticket labeled "tech debt — Q3." The security team flags it every quarter. Engineering says they will get to it next sprint. Nobody does.

The worst part is that nobody knows which updates are safe. A minor version bump in `stripe` might just add a new method, or it might change how webhook signatures are verified. Without reading every changelog line by line — and cross-referencing each change against the actual codebase — the only way to find out is to upgrade and pray.

## The Solution

Using the **dependency-updater** and **code-migration** skills, the agent audits the full dependency tree, cross-references changelogs against the actual codebase to identify which breaking changes affect specific files, and generates migration code for API differences. CVE patches ship first because they rarely change APIs. Then major upgrades go one at a time with tested migration code, so any breakage points to exactly one package.

## Step-by-Step Walkthrough

### Step 1: Audit Dependency Health

Priya starts with a full picture of what she is working with:

```text
Analyze our package.json and package-lock.json. Show me every outdated dependency grouped by risk level: critical (known CVEs), major (breaking version jump), minor (safe to update), and pinned (intentionally locked). Include how far behind each one is.
```

The audit groups 187 packages into four buckets:

**Critical (Known Vulnerabilities) — update immediately:**

| Package | Current | Latest | CVE | Severity |
|---|---|---|---|---|
| `jsonwebtoken` | 8.5.1 | 9.0.2 | CVE-2022-23529 | HIGH |
| `axios` | 0.21.4 | 1.7.2 | CVE-2023-45857 | MEDIUM |
| `semver` | 6.3.0 | 7.6.0 | CVE-2022-25883 | MEDIUM |

**Major (Breaking Changes) — review required:**

| Package | Current | Latest | Key Changes |
|---|---|---|---|
| `next` | 13.4.12 | 14.2.3 | App Router changes, Middleware API update |
| `prisma` | 4.16.2 | 5.14.0 | New client API, changed relation loading |
| `stripe` | 12.18.0 | 15.8.0 | Webhook handler signature changed |

**Minor/Patch (Safe):** 34 packages with backward-compatible updates. These can be batch-updated with minimal risk.

**Pinned:** 3 packages locked with exact versions. `sharp@0.32.1` is pinned due to native build issues on ARM — the newer versions break on the team's M1 Macs. The pin has a comment explaining why, and the issue is tracked upstream.

### Step 2: Get a Detailed Breaking Change Report

The raw version numbers are useful but not actionable. Priya needs to know exactly what code in her project will break, and where:

```text
For the three MAJOR packages (next, prisma, stripe), show me exactly what APIs changed between our version and the latest. Check our codebase for files that use the affected APIs.
```

The report cross-references changelogs with actual source files:

**next 13.4.12 to 14.2.3:**
- `NextResponse.rewrite()` signature changed — **2 files affected** (`src/middleware.ts` lines 12 and 34, both using the old single-argument pattern)
- Image component `layout` prop removed, replaced by `fill` — **8 files affected** across the dashboard and marketing pages
- Minimum React version 18.2.0 — already satisfied, no change needed

**prisma 4.16.2 to 5.14.0:**
- `findUnique` no longer accepts `rejectOnNotFound` — **14 files affected**
- JSON protocol is now default — no code change needed
- Import paths unchanged

**stripe 12.18.0 to 15.8.0:**
- Constructor no longer accepts `apiVersion` in options — **1 file affected** (`src/lib/stripe.ts`)
- `stripe.webhooks.constructEvent()` — unchanged, which is a relief since this handles payment processing
- 12 type names renamed with `Stripe.` prefix — **6 files affected** in type definitions

This is where the automation pays for itself. The Prisma change touches 14 files, but scanning the actual code shows that 12 of them are the exact same one-line pattern: `findUnique({ where: ..., rejectOnNotFound: true })` becomes `findUniqueOrThrow({ where: ... })`. A mechanical find-and-replace handles 86% of the affected files.

### Step 3: Generate the Upgrade Plan and Migration Code

```text
Create a safe upgrade plan with the exact order to update packages. For each major upgrade, generate the migration code diffs. Start with the CVE fixes since those are low-risk, then handle the major bumps one at a time.
```

The plan sequences upgrades to minimize risk:

1. **CVE patches first** — `jsonwebtoken`, `axios`, `semver`. These rarely change APIs (the CVE in `jsonwebtoken` is an exception — it requires adding the `algorithms` option).
2. **Prisma** — the most files touched, but the most mechanical migration. One automated script handles 12 of 14 files.
3. **Stripe** — mostly type renames, low runtime risk.
4. **Next.js** — the most complex upgrade, saved for last when everything else is stable.

Each major upgrade comes with a generated diff showing every file change, so Priya can review the migration before applying it.

### Step 4: Apply and Verify

```text
Apply the CVE fixes first — update jsonwebtoken, axios, and semver. Show me the exact npm commands and any code changes needed. Then run the existing test suite to confirm nothing broke.
```

The `jsonwebtoken` upgrade from 8.x to 9.x requires one code change: the `algorithms` option is now required when verifying tokens. This is the security hardening that the CVE was about — without specifying `algorithms: ['HS256']`, an attacker could force the library to use a weaker algorithm. The fix is one line, but it is the line that makes the CVE meaningful.

The `axios` and `semver` upgrades are drop-in replacements — version bumps with no code changes needed. All three CVE fixes are committed, tests pass, and the patch ships to production by lunch.

### Step 5: Set Up Continuous Dependency Monitoring

After the one-time cleanup, a weekly automated check prevents the backlog from growing again. The goal is simple: never let CVEs sit for 8 months again.

```text
Create a weekly automated check that scans for new CVEs in our current dependencies and alerts us in Slack if anything critical appears. Also flag any dependency that becomes deprecated or unmaintained. Generate the GitHub Action workflow for this.
```

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
            curl -X POST $SLACK_WEBHOOK -d "{\"text\":\"Critical CVEs found: $CRITICAL\"}"
          fi
```

The workflow also checks for deprecated packages and flags any dependency that has not had a commit in over a year. These are the packages that silently become liabilities — no CVEs yet, but no security patches either.

## Real-World Example

Priya runs the full workflow on a Tuesday morning. The audit takes 30 seconds and reveals 6 CVEs, 11 major updates pending, and 3 packages that are completely unmaintained — one of them has not had a commit in 2 years and its GitHub repo is archived.

The CVE patches go in first: three version bumps and one one-line code change for the `jsonwebtoken` algorithms option. Tests pass. She ships it to production by lunch. The security team's quarterly flag is resolved before it even comes up.

The Prisma upgrade is next. The breaking change scan shows 14 affected files, but the migration script handles 12 of them automatically — it is the same `rejectOnNotFound` to `findUniqueOrThrow` swap repeated across the codebase. Priya manually adjusts the remaining 2 files where the query pattern is slightly different. The Next.js upgrade needs 2 manual fixes for the middleware rewrite pattern. Stripe takes 20 minutes for the type renames.

Total time: 3 hours instead of the 2 weeks the team had budgeted. Zero production incidents from the upgrade. And the Monday morning Slack alert means the next CVE gets caught within a week instead of sitting in a backlog for 8 months.

## Related Skills

- [axios](/skills/axios) — when the audit flags axios: which versions fix the advisories (1.20.0 or newer), the two npm releases that were published with malicious code, and how to check every copy in the tree
