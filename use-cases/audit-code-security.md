---
title: "Audit Code Security with AI-Powered Analysis"
slug: audit-code-security
description: "Find vulnerabilities, leaked secrets, and insecure patterns in your codebase before attackers do."
skills: [security-audit]
category: development
tags: [security, vulnerabilities, audit, secrets, OWASP]
---

# Audit Code Security with AI-Powered Analysis

## The Problem

Your startup just landed a pilot with an enterprise client. Their security questionnaire asks about vulnerability scanning, secret management, and OWASP compliance. You glance at your codebase: API keys hardcoded in config files, dependencies not updated in 8 months, and SQL queries built with string concatenation in three endpoints.

Professional security audits cost $15,000-50,000 and take 4-6 weeks. Automated scanners like Snyk flag hundreds of CVEs — mostly irrelevant noise in transitive dependencies — without telling you which ones actually matter for your application. The average data breach for companies under 500 employees costs $3.31 million (IBM 2024), yet 43% of small companies have no cybersecurity plan.

You need a focused audit that understands your code, prioritizes real risks, and gives you fix-ready patches — not a 200-page PDF that sits in a drawer.

## The Solution

The **security-audit** skill performs a deep, context-aware security analysis. It scans dependencies for exploitable CVEs (filtering out unreachable ones), detects secrets in code and git history, analyzes patterns against the OWASP Top 10, and generates prioritized findings with ready-to-apply fixes. Unlike generic scanners, it understands how your code actually uses dependencies and whether a vulnerable function is reachable.

```bash
npx terminal-skills install security-audit
```

## Step-by-Step Walkthrough

### 1. Run a full security scan

```
Run a comprehensive security audit. Check dependencies, secrets, code patterns, and infrastructure config.
```

```
Security Audit — 347 files, 42,891 lines

CRITICAL (2):
  🔴 Hardcoded Stripe key in src/config/payments.js:14
     sk_live_EXAMPLE_KEY_REDACTED — active production key
     FIX: Move to environment variable, rotate immediately

  🔴 SQL injection in src/routes/search.js:47
     `SELECT * FROM products WHERE name LIKE '%${query}%'`
     FIX: Use parameterized query (patch generated)

HIGH (5):
  🟠 CVE-2024-38816 — jsonwebtoken 8.5.1 (signature bypass) — directly exploitable
  🟠 No rate limiting on /api/auth/login — brute-force vulnerable
  🟠 Session tokens in localStorage (XSS-exfiltrable)
  🟠 Missing CSRF protection on POST routes
  🟠 AWS access key in git history (commit a3f8c21)

Total: 2 critical, 5 high, 8 medium, 12 low
```

### 2. Apply automated fixes for critical findings

```
Fix the SQL injection and patch the hardcoded secrets.
```

```
Patched src/routes/search.js:
  BEFORE: `SELECT * FROM products WHERE name LIKE '%${query}%'`
  AFTER:  'SELECT * FROM products WHERE name LIKE $1', [`%${query}%`]

Patched src/config/payments.js:
  BEFORE: stripe_secret: 'sk_live_EXAMPLE_KEY_REDACTED'
  AFTER:  stripe_secret: process.env.STRIPE_SECRET_KEY

Created: .env.example, updated .gitignore
⚠️  Rotate the exposed Stripe key immediately — it's in git history.
```

### 3. Upgrade vulnerable dependencies

```
Upgrade jsonwebtoken and other exploitable dependencies. Run tests after each upgrade.
```

```
  jsonwebtoken 8.5.1 → 9.0.2 — auto-patched auth.js for required algorithms option
  express 4.17.1 → 4.21.1 — no breaking changes
  axios 0.21.1 → 1.7.9 — auto-patched 3 call sites for response format change

Remaining CVEs (not exploitable in your code):
  nth-check@1.0.2 — build-time CSS only, not runtime
  semver@5.7.1 — transitive dev dep, no runtime exposure

All 19 tests passing after upgrades ✓
```

### 4. Add security hardening middleware

```
Add rate limiting, security headers, CSRF protection, and input sanitization.
```

```
Added to src/app.js:
  + helmet() — security headers (HSTS, CSP, X-Content-Type-Options)
  + express-rate-limit — 100 req/15min per IP on auth routes
  + csurf — CSRF token validation on state-changing routes
  + express-mongo-sanitize — NoSQL injection prevention

Created: src/middleware/security.js (43 lines)
Tests: 19 passing + 6 new security tests ✓
```

### 5. Clean secrets from git history and generate report

```
Remove leaked keys from git history and generate a security report for the enterprise client.
```

```
Purged sk_live_* and AKIA* from git history via git-filter-repo
⚠️  Force push required. Team must re-clone.

Generated: SECURITY-AUDIT-REPORT.md
  27 findings identified, 15 auto-fixed, 7 require manual review
  OWASP Top 10: 8/10 categories assessed
  Dependencies: 3 critical CVEs fixed, 2 non-exploitable documented
  Secrets: 2 removed from history, rotation required
```

## Real-World Example

Priya, CTO of health tech startup MedTrack, received a security questionnaire from a hospital network — their potential largest client at $180K ARR. A professional audit firm quoted $28,000 and 5 weeks. She ran the security-audit skill on a Tuesday afternoon.

Within 20 minutes, the agent identified 31 findings: 3 critical (including a patient ID enumeration vulnerability and an exposed Twilio auth token in git history), 7 high, and 21 medium/low. By that evening, 18 findings were auto-fixed with patches for 8 more. Wednesday, Priya spent 3 hours on 5 architectural decisions — switching from localStorage to httpOnly cookies for sessions. Thursday, she had a clean audit report.

The hospital's security team approved MedTrack for their vendor program the following week. Total time: 2 days versus 5 weeks. Total cost: engineering time versus $28,000. The contract closed 6 weeks ahead of what the audit timeline would have allowed.

## Related Skills

- [test-generator](../skills/test-generator/) — Generate security-focused test cases for vulnerabilities found during audit
- [cicd-pipeline](../skills/cicd-pipeline/) — Add automated security scanning as a CI gate
- [code-reviewer](../skills/code-reviewer/) — Ongoing reviews with security-aware analysis on every PR
