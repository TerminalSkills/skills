---
title: "Audit Code Security with AI"
slug: audit-code-security
description: "Run a comprehensive security audit across application code, Docker configurations, and CI/CD pipelines to eliminate vulnerabilities end-to-end."
skills: [security-audit, docker-helper, cicd-pipeline]
category: devops
tags: [security, audit, docker, cicd, vulnerabilities]
---

# Audit Code Security with AI

## The Problem

Your Express.js API handles financial data for 12,000 users. A pen tester found 23 issues — SQL injection, hardcoded secrets, Docker containers running as root. Your team patched the critical items, but nobody audited the other 180 endpoints, 6 Dockerfiles, or the CI pipeline that deploys without any security checks. AppSec engineers cost $200/hour and audits take 2-3 weeks.

## The Solution

The **security-audit** skill scans application code for injection flaws, auth bypasses, and secret leaks. The **docker-helper** skill audits container configs for privilege escalation, exposed ports, and bloated images. The **cicd-pipeline** skill adds automated security gates so vulnerabilities get caught before production.

```bash
npx terminal-skills install security-audit docker-helper cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Scan application code for vulnerabilities

```
Run a security audit on this Express.js API. Focus on injection vulnerabilities, authentication flaws, and secret management.
```

```
Security Audit — 31 findings

CRITICAL (4):
  ✗ src/routes/reports.js:45 — Raw SQL interpolation: WHERE id = ${req.params.id}
  ✗ src/services/export.js:78 — Path traversal in file download endpoint
  ✗ .env.production — Committed to git with live database credentials
  ✗ src/config/jwt.js:12 — JWT secret is "supersecret123"

HIGH (8): 3 endpoints missing rate limiting, no CSRF protection,
  unrestricted file uploads, 2 dependencies with known CVEs

Applying auto-fixes for critical issues...
Fixed: SQL injection (2), path traversal (1), hardcoded secret removed (1)
Manual action needed: Rotate database credentials and JWT secret
```

### 2. Audit Docker configurations

```
Audit all Dockerfiles and docker-compose.yml for security issues. Check privilege escalation, exposed secrets, and image bloat.
```

```
Docker Security Audit — 9 findings

CRITICAL (2):
  ✗ Dockerfile.api — Running as root (no USER directive)
    Fix: Added non-root user with minimal permissions
  ✗ docker-compose.yml — Database password in plain text
    Fix: Moved to Docker secrets

HIGH (4):
  ⚠ Using node:20 full image (1.1GB) → switched to node:20-alpine (180MB)
  ⚠ Worker container has --privileged flag → removed, added only NET_BIND_SERVICE
  ⚠ PostgreSQL port exposed to host → moved to internal network
  ⚠ No HEALTHCHECK → added curl health endpoint

Image size: 1.1GB → 180MB. Attack surface significantly reduced.
```

### 3. Fix dependency vulnerabilities

```
Update the vulnerable dependencies. Check for breaking changes and run tests after each update.
```

```
  ✓ lodash 4.17.15 → 4.17.21 (prototype pollution fix)
  ✓ jsonwebtoken 8.5.1 → 9.0.2 (algorithm confusion fix)
  ✓ express-fileupload 1.2.0 → 1.5.1 (arbitrary file write fix)
  ✓ Removed 3 unused dependencies

npm audit: 0 vulnerabilities (was 11). All 47 tests passing ✓
```

### 4. Set up security gates in CI/CD

```
Add security scanning to our GitHub Actions pipeline. SAST on code, Docker image scanning, dependency audit, and secret detection. Block deployment on critical findings.
```

```
Created: .github/workflows/security.yml

  1. SAST scan — Semgrep with Express.js rules
  2. Dependency audit — npm audit --audit-level=high
  3. Docker image scan — Trivy (fail on CRITICAL/HIGH)
  4. Secret detection — Gitleaks on full diff
  Gate: PR blocked on any CRITICAL finding
  Report: security summary posted as PR comment
  Scan time: ~2 minutes per PR

Updated deploy workflow: production requires green security check
```

### 5. Validate the full security posture

```
Run the complete security pipeline to establish a clean baseline.
```

```
Full Pipeline — PASSED ✓

  ✓ SAST: 0 critical, 0 high (31 resolved)
  ✓ Dependencies: 0 vulnerabilities
  ✓ Docker scan: 0 critical CVEs
  ✓ Secrets: 0 leaked credentials

Manual items remaining:
  1. Rotate production DB credentials (exposed in git history)
  2. Rotate JWT key and invalidate existing tokens
  3. Enable WAF on public endpoints

Security score: 23/100 → 91/100
```

## Real-World Example

A CTO at a 40-person healthtech startup received a pen test report with 19 critical findings two weeks before a hospital partnership deadline. She ran security-audit on the 70,000-line Django API Monday — it found 27 additional issues including an IDOR vulnerability in patient records. Tuesday, docker-helper hardened 4 Dockerfiles, cutting images by 80% and eliminating root containers. Wednesday, cicd-pipeline deployed automated SAST, dependency scanning, and image checks as CI gates.

By Friday, all critical findings were resolved. The pipeline caught two new vulnerabilities in PRs that week — both blocked before merge. The hospital partner approved the integration and the startup signed the $2.4M annual contract on schedule.

## Related Skills

- [test-generator](../skills/test-generator/) — Generate tests for security-critical code paths
- [code-reviewer](../skills/code-reviewer/) — Review security fixes for correctness
