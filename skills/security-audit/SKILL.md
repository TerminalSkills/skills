---
name: security-audit
description: >-
  Scan code for security vulnerabilities, misconfigurations, and exposed secrets.
  Use when a user asks to audit security, find vulnerabilities, check for OWASP
  issues, scan for secrets, review dependencies for CVEs, detect SQL injection,
  find XSS vulnerabilities, or harden an application. Covers OWASP Top 10,
  dependency auditing, secrets detection, and generates fix recommendations
  with severity ratings.
license: Apache-2.0
compatibility: "Requires Node.js 16+ or Python 3.9+. Optional: npm audit, pip-audit, trivy, gitleaks"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["security", "owasp", "vulnerabilities", "audit", "secrets"]
---

# Security Audit

## Overview

Perform comprehensive security audits on codebases by scanning for OWASP Top 10 vulnerabilities, checking dependencies for known CVEs, detecting leaked secrets and API keys, and generating prioritized fix recommendations. This skill combines static analysis patterns with dependency auditing tools.

## Instructions

When a user asks you to audit their code for security issues, follow these steps:

### Step 1: Determine audit scope

Ask or infer what to audit:
- **Code vulnerabilities** — OWASP Top 10 patterns in source code
- **Dependencies** — known CVEs in packages
- **Secrets** — hardcoded API keys, passwords, tokens
- **Configuration** — insecure headers, CORS, TLS settings
- **All of the above** (default if not specified)

### Step 2: Scan dependencies for known vulnerabilities

Run the appropriate audit tool for the project:

```bash
# Node.js
npm audit --json 2>/dev/null || npx audit-ci --config /dev/null

# Python
pip-audit --format=json 2>/dev/null || pip install pip-audit && pip-audit --format=json

# General (if trivy is available)
trivy fs --security-checks vuln .
```

Parse results and categorize by severity (Critical, High, Medium, Low).

### Step 3: Scan for hardcoded secrets

Search the codebase for common secret patterns:

```bash
# Check for common patterns
grep -rn --include="*.{js,ts,py,java,go,rb,env,yml,yaml,json,xml,conf}" \
  -E "(password|secret|api_key|apikey|token|private_key|aws_access|stripe_sk|ghp_|gho_|sk-[a-zA-Z0-9]{20,})" \
  --exclude-dir={node_modules,.git,dist,build,vendor,__pycache__} .
```

Also check for:
- `.env` files committed to git: `git ls-files | grep -i '\.env'`
- Private keys: `grep -rn "BEGIN.*PRIVATE KEY" .`
- High-entropy strings that look like tokens

### Step 4: Analyze code for OWASP Top 10 vulnerabilities

Review source code for these critical patterns:

**A01 — Broken Access Control:**
- Missing auth checks on API routes
- Direct object reference without ownership validation
- CORS set to `*` with credentials

**A02 — Cryptographic Failures:**
- Hardcoded encryption keys
- Use of MD5/SHA1 for passwords (instead of bcrypt/argon2)
- HTTP URLs for sensitive data transfer

**A03 — Injection:**
```python
# VULNERABLE — SQL injection
query = f"SELECT * FROM users WHERE id = {user_input}"
cursor.execute(query)

# SAFE — parameterized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_input,))
```
- String concatenation in SQL queries
- Unsanitized input in shell commands (`os.system`, `exec`, `child_process.exec`)
- Template injection (user input in template strings)

**A05 — Security Misconfiguration:**
- Debug mode enabled in production
- Default credentials in config
- Verbose error messages exposing stack traces
- Missing security headers (CSP, X-Frame-Options, HSTS)

**A07 — Cross-Site Scripting (XSS):**
- `dangerouslySetInnerHTML` with user input
- `innerHTML` assignment without sanitization
- `v-html` directive with untrusted data

### Step 5: Generate the security report

Produce a structured report with findings grouped by severity:

```markdown
# Security Audit Report

**Project:** project-name
**Date:** 2026-02-17
**Files scanned:** 142
**Issues found:** 8 (2 Critical, 3 High, 2 Medium, 1 Low)

## Critical
### [C1] SQL Injection in user query — src/db/users.py:45
- **Category:** A03 Injection
- **Description:** User input concatenated directly into SQL query
- **Fix:** Use parameterized queries with `cursor.execute(query, params)`

## High
### [H1] Hardcoded Stripe secret key — src/config.js:12
- **Category:** A02 Cryptographic Failures
- **Description:** `sk_live_EXAMPLE_ROTATE_IMMEDIATELY` found in source
- **Fix:** Move to environment variable, rotate the key immediately
```

### Step 6: Provide actionable fixes

For each finding, provide:
1. The exact file and line number
2. A code snippet showing the vulnerable pattern
3. A fixed version of the code
4. The severity and OWASP category

## Examples

### Example 1: Full security audit of a Node.js Express app

**User request:** "Run a security audit on this Express project"

**Actions taken:**
1. Ran `npm audit` — found 3 vulnerabilities (1 critical in `jsonwebtoken < 9.0.0`)
2. Scanned for secrets — found AWS key in `src/config/aws.js`
3. Reviewed routes — found missing auth middleware on `/api/admin/users`
4. Checked headers — no Helmet.js, missing CSP and HSTS

**Report summary:**
```
Issues found: 7 (1 Critical, 3 High, 2 Medium, 1 Low)

Critical:
- jsonwebtoken@8.5.1 has a signature bypass vulnerability (CVE-2022-23529)
  Fix: npm install jsonwebtoken@9.0.2

High:
- AWS_SECRET_ACCESS_KEY hardcoded in src/config/aws.js:8
  Fix: Move to .env, add .env to .gitignore, rotate the key
- /api/admin/users route missing authentication middleware
  Fix: Add authMiddleware to route: router.get('/api/admin/users', authMiddleware, handler)
- No security headers configured
  Fix: npm install helmet && app.use(helmet())

Medium:
- CORS allows all origins with credentials (src/app.js:15)
  Fix: Specify allowed origins explicitly
- Error handler returns stack traces (src/middleware/error.js:8)
  Fix: Only return stack traces when NODE_ENV !== 'production'
```

### Example 2: Python Django secrets and dependency scan

**User request:** "Check my Django app for leaked secrets and vulnerable packages"

**Actions taken:**
1. Ran `pip-audit` — found 2 vulnerable packages
2. Scanned for secrets — found Django SECRET_KEY in settings.py and a Stripe key in views.py

**Report summary:**
```
Issues found: 4 (1 Critical, 2 High, 1 Medium)

Critical:
- Django SECRET_KEY committed in settings.py:23
  Value: 'django-insecure-x#k2!7...'
  Fix: Use os.environ.get('DJANGO_SECRET_KEY') and generate a new key

High:
- Pillow==9.0.0 — CVE-2023-44271 (DoS via large TIFF)
  Fix: pip install Pillow>=10.0.1
- Stripe secret key in views.py:67: sk_live_...
  Fix: Move to environment variable, rotate key in Stripe dashboard

Medium:
- DEBUG = True in settings.py (check DJANGO_DEBUG env in production)
  Fix: DEBUG = os.environ.get('DJANGO_DEBUG', 'False') == 'True'
```

## Guidelines

- Always run dependency audit first — it catches known CVEs with zero effort.
- When scanning for secrets, never print the full secret in the report. Show first 8 characters + mask the rest.
- Prioritize findings by severity: fix Critical and High before Medium and Low.
- For each vulnerability, always provide a concrete fix — not just "fix this."
- Check `.gitignore` for missing entries (`.env`, `*.pem`, `*.key`).
- Suggest adding pre-commit hooks (e.g., gitleaks) to prevent future secret leaks.
- If a secret is found committed in git history, advise rotating it immediately — removing from code is not enough.
- Do not report false positives from test fixtures or example files unless they contain real credentials.
- Consider the deployment environment: a debug flag in a local dev server is Low severity, but in production config it's High.
