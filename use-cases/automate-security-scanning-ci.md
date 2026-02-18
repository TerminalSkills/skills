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

Your team knows security scanning should happen on every pull request, but setting it up is a maze of tool configuration, noisy false positives, and unclear remediation steps. You install a SAST tool, it finds 300 issues on the first run — 280 of which are informational or false positives — and developers start ignoring the results entirely. Meanwhile, actual vulnerabilities slip through because nobody trusts the scanner output. A 25-person engineering org ends up doing manual security reviews before releases, which creates a bottleneck and still misses dependency vulnerabilities.

## The Solution

Use the **security-audit** skill to configure and tune scanning tools, the **cicd-pipeline** skill to integrate scans into your PR workflow, and the **coding-agent** to auto-triage findings and generate fix suggestions.

## Step-by-Step Walkthrough

### 1. Ask the agent to assess your current security posture

```text
Audit our Node.js monorepo for security scanning gaps. We have a GitHub Actions
CI pipeline but no security scanning. The repo has 3 services: api/ (Express),
worker/ (Bull queue), and web/ (Next.js). Show me what we're missing.
```

### 2. The agent identifies scanning gaps

```text
Security Scanning Gap Analysis:

Currently missing:
- Dependency vulnerability scanning (npm audit / Snyk)
- Static analysis for code vulnerabilities (semgrep / CodeQL)
- Secret detection (no pre-commit hooks or CI checks)
- Container image scanning (Dockerfiles present but unscanned)
- License compliance checking

Risk assessment:
- api/package-lock.json: 847 dependencies, last audit unknown
- 3 Dockerfiles using node:18 base image (not pinned to digest)
- No .gitignore entry for .env files in worker/
```

### 3. The agent generates CI pipeline configuration

The agent writes GitHub Actions workflows with smart defaults:

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: [pull_request]
jobs:
  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high --workspace=api
      - run: npm audit --audit-level=high --workspace=worker
      - run: npm audit --audit-level=high --workspace=web

  secret-detection:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2

  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: p/nodejs p/jwt p/sql-injection
```

### 4. The agent creates a triage configuration to reduce noise

```text
Created .semgrep-ignore with 12 rules for test files and generated code.
Created security-triage.json with severity mappings:
- CRITICAL/HIGH in src/: block PR, require fix
- MEDIUM in src/: warn, add comment, don't block
- Any severity in test/ or __mocks__/: suppress
- Dependency vulnerabilities with no fix available: warn only

Expected noise reduction: ~80% fewer false positive comments on PRs.
```

### 5. The agent generates fix suggestions for real findings

```text
Found 3 actionable vulnerabilities in current codebase:

1. [HIGH] SQL injection in api/src/routes/search.js:42
   Current:  db.query(`SELECT * FROM products WHERE name LIKE '%${term}%'`)
   Fix:      db.query('SELECT * FROM products WHERE name LIKE $1', [`%${term}%`])

2. [HIGH] Prototype pollution via lodash.merge in worker/
   Fix:      npm install lodash@4.17.21 --workspace=worker

3. [MEDIUM] Missing rate limiting on /api/auth/login
   Fix:      Add express-rate-limit middleware (see generated patch)
```

## Real-World Example

Tomás leads backend engineering at a 25-person SaaS startup. They passed a customer security questionnaire by promising automated scanning, but never actually implemented it. A penetration test found an SQL injection that had been in production for eight months.

1. Tomás asks the agent to set up comprehensive security scanning for their monorepo
2. The agent generates GitHub Actions workflows for dependency, SAST, and secret scanning
3. It configures triage rules so developers only see actionable findings — the first PR scan surfaces 8 real issues instead of 300 noisy alerts
4. The agent generates fix patches for 5 of the 8 issues, which developers apply in the same sprint
5. Within a month, every PR gets scanned automatically, the team trusts the results, and the next pen test comes back clean
