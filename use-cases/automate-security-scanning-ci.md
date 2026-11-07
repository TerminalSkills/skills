---
title: "Automate Security Scanning in CI with AI"
slug: automate-security-scanning-ci
description: "Integrate automated vulnerability scanning into your CI pipeline and triage findings intelligently."
skills: [security-audit, cicd-pipeline, coding-agent]
category: devops
tags: [security, ci-cd, vulnerability-scanning, devsecops, automation]
---

# Automate Security Scanning in CI with AI

## The Problem

Your team knows security scanning should happen on every pull request, but setting it up is a maze of tool configuration, noisy false positives, and unclear remediation steps. You install a SAST tool, it finds 300 issues on the first run — 280 of which are informational or false positives — and developers start ignoring the results entirely. The scanner that was supposed to catch vulnerabilities becomes the tool that cried wolf.

Meanwhile, actual vulnerabilities slip through because nobody trusts the output. A 25-person engineering org ends up doing manual security reviews before releases, which creates a bottleneck and still misses dependency vulnerabilities. Last quarter, a penetration test found an SQL injection that had been in production for eight months. It was in the scanner's default ruleset the entire time — buried under 280 other findings that everyone learned to scroll past.

The failed scanner attempt has a second-order effect: the team becomes resistant to trying again. "We already tried security scanning and it didn't work" becomes conventional wisdom, when what actually happened was that the tooling was misconfigured and the triage was missing.

## The Solution

Using the **security-audit** skill to configure and tune scanning tools, the **cicd-pipeline** skill's pipeline practices (parallel jobs, required checks, artifacts) to run the scans on every PR, and the **coding-agent** to auto-triage findings and generate fix suggestions, the pipeline catches real vulnerabilities while keeping noise low enough that developers actually pay attention. The key insight: a scanner that surfaces 8 real findings is infinitely more valuable than one that surfaces 300 findings nobody reads.

## Step-by-Step Walkthrough

### Step 1: Assess the Current Security Posture

Before adding scanners, understand what's missing. A gap analysis prevents the "install everything and see what happens" approach that leads to the 300-finding wall:

```text
Audit our Node.js monorepo for security scanning gaps. We have a GitHub Actions
CI pipeline but no security scanning. The repo has 3 services: api/ (Express),
worker/ (Bull queue), and web/ (Next.js). Show me what we're missing.
```

### Step 2: Identify What's Missing

The gap analysis comes back with a clear inventory of blind spots:

**Currently missing:**
- Dependency vulnerability scanning (npm audit / Snyk) — 847 transitive dependencies with no visibility into known CVEs
- Static analysis for code vulnerabilities (semgrep / CodeQL) — no automated detection of injection, XSS, or auth bypass patterns
- Secret detection (no pre-commit hooks or CI checks) — leaked credentials would reach the repository unnoticed
- Container image scanning (Dockerfiles present but unscanned) — base images could contain known vulnerabilities
- License compliance checking — no visibility into GPL or other restrictive licenses in dependencies

**Risk indicators that need immediate attention:**
- `api/package-lock.json` has 847 dependencies, last audit unknown
- 3 Dockerfiles using the `node:18` base image — Node 18 reached end of life in April 2025 and the tag is not pinned to a digest, so a changed image could be pulled silently on any build
- No `.gitignore` entry for `.env` files in `worker/` — one accidental `git add .` away from leaking database credentials to the repository

### Step 3: Generate CI Pipeline Configuration

The scanning workflow covers three dimensions — dependencies, secrets, and static analysis — each running as a parallel job so scans don't add to PR wait time:

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [pull_request]

permissions:
  contents: read
  pull-requests: write   # gitleaks-action comments on the PR

jobs:
  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      # Each workspace's runtime dependencies; exits non-zero on high or critical
      - run: npm audit --omit=dev --audit-level=high --workspace=api --workspace=worker --workspace=web

  secret-detection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0  # Full history for detecting secrets in past commits
      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # required for organization repos, not personal accounts

  static-analysis:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v7
      - run: >-
          semgrep scan --error --severity ERROR
          --config p/nodejs --config p/jwt --config p/sql-injection
```

Three jobs, running in parallel on every PR. Dependency check catches known CVEs in the transitive dependencies. Secret detection scans the full git history, not just the current diff, for leaked credentials, API keys, and tokens. Static analysis runs Semgrep from its official Docker image with rulesets from the public registry (`p/nodejs`, `p/jwt`, `p/sql-injection`). `--error` makes the job fail when a finding is reported, and `--severity ERROR` limits that to the highest-severity rules.

`returntocorp/semgrep-action` is deprecated; the Semgrep project recommends running `semgrep` directly. `gitleaks-action@v2` runs on Node 20, which GitHub is removing from hosted runners, so use `@v3`. For organization repositories gitleaks-action needs a license key stored as a secret (`GITLEAKS_LICENSE`); without one the job fails. If you do not want a license, run the open-source `gitleaks git` command from a release binary instead, after verifying the checksum the project publishes.

The jobs run in parallel, so total scan time is the duration of the slowest job, not the sum of all three. Pin each action to a commit SHA once the workflow is stable: a mutable tag can be moved by whoever controls the action's repository.

### Step 4: Configure Triage Rules to Cut the Noise

This is the step that makes or breaks the entire setup. Without triage, the first scan surfaces 300 findings and developers tune out permanently. The previous team that tried this made exactly that mistake.

Triage is built from options the tools already have, not a separate config file:

| Finding | Location | Action |
|---|---|---|
| ERROR-severity Semgrep rule or high/critical dependency CVE | `src/` | **Block PR** (`--error --severity ERROR`, `--audit-level=high`) |
| WARNING-severity Semgrep rule | `src/` | Report without blocking: run a second non-blocking job without `--error` |
| Any severity | `test/`, `__mocks__/`, generated code | Excluded through `.semgrepignore` |
| Dev-only dependency | Any | Skipped with `npm audit --omit=dev` |

A `.semgrepignore` file (gitignore syntax) lists `test/`, `__mocks__/` and generated ORM or protobuf output. Test files that deliberately contain injection patterns, for example to test input validation, then do not trigger alerts, and generated code is excluded because developers cannot fix those findings anyway. Known false positives from gitleaks go in a `.gitleaksignore` file by fingerprint. Ask the coding agent to draft these files from the first scan's output, then review each exclusion yourself: an ignore rule is a decision to stop looking.

In this example the scanner goes from "300 findings, ignore everything" to "8 findings, all worth reading."

### Step 5: Generate Fixes for Real Vulnerabilities

In this example the initial scan of the codebase surfaces 3 actionable vulnerabilities:

**1. SQL injection in `api/src/routes/search.js:42`** (HIGH)

```javascript
// Before — string interpolation builds the query from user input
db.query(`SELECT * FROM products WHERE name LIKE '%${term}%'`)

// After — parameterized query keeps user input out of the SQL
db.query('SELECT * FROM products WHERE name LIKE $1', [`%${term}%`])
```

This is the exact vulnerability the penetration test found. It's been in production for eight months, hidden under 280 other findings that the team stopped reading.

**2. Prototype pollution via lodash.merge in `worker/`** (HIGH)

```bash
npm audit fix --workspace=worker
```

Usually a one-line fix: `npm audit` reports the patched version, and `npm audit fix` bumps the lockfile to it when a semver-compatible fix exists. The vulnerable version has been in the lockfile since the worker service was created.

**3. Missing rate limiting on `/api/auth/login`** (MEDIUM)

A generated patch adds the `express-rate-limit` middleware, 5 attempts per minute per IP, with a 429 response for the client:

```javascript
import { rateLimit } from 'express-rate-limit'

app.use('/api/auth/login', rateLimit({ windowMs: 60_000, limit: 5 }))
```

Without rate limiting, the login endpoint is open to credential stuffing. Behind a reverse proxy, also set Express `trust proxy` correctly, or every client shares the proxy's IP.

Three findings, three fixes, all applied in one sprint. The contrast with the previous experience is stark: instead of 300 findings that paralyze the team, there are 3 that each have a clear fix. The same SQL injection that the penetration test found would have been caught on the developer's first PR if this pipeline had existed eight months ago.

Going forward, every new PR gets scanned automatically. A developer introducing a string-interpolated SQL query gets blocked at the PR level with a specific fix suggestion — not a generic "vulnerability detected" message, but the exact parameterized query they should use instead.

## Real-World Example

(An invented team; the numbers are the example's own.)

Tomas leads backend engineering at a 25-person SaaS startup. They passed a customer security questionnaire by promising automated scanning, but never actually implemented it. Then a penetration test found an SQL injection that had been in production for eight months — the kind of finding that shakes customer confidence and requires a post-incident disclosure.

He asks the agent to set up comprehensive scanning for the monorepo. The GitHub Actions workflows go in for dependency, SAST, and secret scanning. Triage rules ensure developers only see actionable findings — the first PR scan surfaces 8 real issues instead of 300 noisy alerts. The agent generates fix patches for 5 of the 8, which developers apply in the same sprint. The remaining 3 (two dependency vulnerabilities with no upstream fix, one medium-severity finding requiring architectural changes) get tracked as issues with clear remediation plans.

Within a month, every PR gets scanned automatically, the team trusts the results because false positives are rare, and the next penetration test comes back clean. The security questionnaire answer changes from a promise to a fact — with CI logs to prove it.
