---
name: security-audit
description: >-
  Scan code for security vulnerabilities, misconfigurations, and exposed secrets.
  Use when a user asks to audit security, find vulnerabilities, check for OWASP
  issues, scan for secrets, review dependencies for CVEs, detect SQL injection,
  find XSS vulnerabilities, or harden an application. Covers the OWASP Top 10 (2025),
  dependency auditing, secrets detection, and generates fix recommendations
  with severity ratings.
license: Apache-2.0
compatibility: "Node.js with npm 8+ or Python 3.9+. Optional: pip-audit, osv-scanner, trivy, gitleaks"
metadata:
  author: terminal-skills
  version: "1.1.0"
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
# Node.js (reads package-lock.json; --omit=dev skips dev dependencies)
npm audit --json
npm audit --omit=dev --audit-level=high

# Python (installed environment, or a requirements file)
pip install pip-audit
pip-audit -f json
pip-audit -r requirements.txt

# Any ecosystem (lockfiles in the tree), if osv-scanner or trivy is installed
osv-scanner scan source -r .
trivy fs --scanners vuln,secret .
```

`npm audit` exits non-zero when it finds anything, so do not treat the exit code as a tool failure. `trivy fs --security-checks` was replaced by `--scanners`.

Parse results and categorize by severity (Critical, High, Medium, Low).

### Step 3: Scan for hardcoded secrets

Search the codebase for common secret patterns:

```bash
grep -rIn -E "(password|secret|api_?key|token|private_key|AKIA[0-9A-Z]{16}|sk_live_|ghp_|sk-[A-Za-z0-9]{20,})" \
  --include="*.js" --include="*.ts" --include="*.py" --include="*.go" --include="*.rb" \
  --include="*.yml" --include="*.yaml" --include="*.json" --include=".env*" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=vendor .
```

(`--include="*.{js,ts}"` does not work in grep; repeat `--include` instead.) A dedicated scanner finds far more than this grep, including secrets in git history:

```bash
gitleaks dir .      # working tree
gitleaks git .      # full git history
```

Also check for:
- `.env` files committed to git: `git ls-files | grep -i '\.env'`
- Private keys: `grep -rn "BEGIN.*PRIVATE KEY" .`
- High-entropy strings that look like tokens

### Step 4: Analyze code for OWASP Top 10 vulnerabilities

Review source code for these critical patterns:

Use the 2025 edition numbering (A01 Broken Access Control, A02 Security Misconfiguration, A03 Software Supply Chain Failures, A04 Cryptographic Failures, A05 Injection, A06 Insecure Design, A07 Authentication Failures, A08 Software or Data Integrity Failures, A09 Security Logging and Alerting Failures, A10 Mishandling of Exceptional Conditions). Older reports use the 2021 numbers, so state which one you cite.

**A01 Broken Access Control:**
- Missing auth checks on API routes
- Direct object reference without ownership validation
- CORS set to `*` with credentials; server-side request forgery (SSRF now sits here)

**A02 Security Misconfiguration:**
- Debug mode enabled in production, default credentials, verbose stack traces
- Missing security headers (CSP, X-Frame-Options, HSTS)

**A03 Software Supply Chain Failures:**
- Vulnerable or unmaintained dependencies (Step 2), unpinned versions, missing lockfiles
- Install scripts and CI actions referenced by a mutable tag instead of a commit SHA

**A04 Cryptographic Failures:**
- Hardcoded encryption keys
- MD5/SHA1 for passwords (use argon2id, scrypt or bcrypt)
- HTTP URLs for sensitive data transfer

**A05 Injection** (includes XSS):
```python
# VULNERABLE: SQL injection
query = f"SELECT * FROM users WHERE id = {user_input}"
cursor.execute(query)

# SAFE: parameterized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_input,))
```
- String concatenation in SQL queries
- Unsanitized input in shell commands (`os.system`, `exec`, `child_process.exec`)
- Template injection (user input in template strings)
- `dangerouslySetInnerHTML`, `innerHTML` or `v-html` with untrusted data

**A07 Authentication Failures:**
- Weak or missing rate limiting on login, long-lived tokens, JWTs accepted without signature or `alg` checks

**A09 / A10:** security events not logged, and error handling that fails open (an exception in an auth check that lets the request through).

### Step 5: Generate the security report

Produce a structured report with findings grouped by severity:

```markdown
# Security Audit Report

**Project:** project-name
**Date:** 2026-10-13
**Files scanned:** 142
**Issues found:** 8 (2 Critical, 3 High, 2 Medium, 1 Low)

## Critical
### [C1] SQL Injection in user query — src/db/users.py:45
- **Category:** A05 Injection
- **Description:** User input concatenated directly into SQL query
- **Fix:** Use parameterized queries with `cursor.execute(query, params)`

## High
### [H1] Hardcoded Stripe secret key — src/config.js:12
- **Category:** A04 Cryptographic Failures
- **Description:** a live Stripe key (`sk_live_51H...`, masked) found in source
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
  Fix: npm install jsonwebtoken@latest (fixed in 9.0.0)

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
- Pillow==9.0.0 — CVE-2023-44271 (uncontrolled resource use in ImageDraw.textlength)
  Fix: upgrade to the newest Pillow (fixed in 10.0.0)
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
- Automated scanners miss logic flaws (broken authorization, business-rule bypass); read the routes and auth code yourself, and state in the report what was not checked.
- Run only read-only commands. Do not exploit findings or test against production systems.
- If a secret is found committed in git history, advise rotating it immediately — removing from code is not enough.
- Do not report false positives from test fixtures or example files unless they contain real credentials.
- Consider the deployment environment: a debug flag in a local dev server is Low severity, but in production config it's High.
