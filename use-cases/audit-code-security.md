---
title: "Audit Code Security with AI"
slug: audit-code-security
description: "Use an AI agent to scan your codebase for vulnerabilities, insecure patterns, and dependency risks before they reach production."
skills: [security-audit]
category: development
tags: [security, vulnerabilities, code-audit, dependencies, owasp]
---

# Audit Code Security with AI

## The Problem

Security vulnerabilities slip into codebases through outdated dependencies, hardcoded secrets, SQL injection vectors, and insecure authentication patterns. A 2024 Snyk report found that the average Node.js project has 49 known vulnerabilities in its dependency tree. Small teams without a dedicated security engineer often ship code that hasn't been audited in months — or ever. Traditional SAST tools generate hundreds of noisy alerts with high false-positive rates, making triage exhausting.

## The Solution

The `security-audit` skill performs a structured security review: dependency scanning, secret detection, OWASP Top 10 pattern matching, and authentication flow analysis. It prioritizes findings by exploitability and provides fix-ready patches, not just warnings.

```bash
npx terminal-skills install security-audit
```

## Step-by-Step Walkthrough

### 1. Run a full dependency vulnerability scan

```
Audit all dependencies in this project for known CVEs. Group findings by severity (critical, high, medium, low) and tell me which ones have patches available right now.
```

The agent parses `package-lock.json`, cross-references against the GitHub Advisory Database, and returns a prioritized list:

```
Critical (2): jsonwebtoken 8.5.1 (CVE-2022-23529), node-forge 1.2.1 (CVE-2022-24772)
High (5): axios 0.21.1, lodash 4.17.20, express-fileupload 1.2.1, ...
Medium (11): ...

Patches available: 6 of 7 critical/high issues have fixed versions.
```

### 2. Detect hardcoded secrets and credentials

```
Scan the entire codebase including config files, .env.example, and test fixtures for hardcoded API keys, tokens, passwords, or private keys. Check git history for secrets that were committed and later removed.
```

The agent flags three findings: a Stripe test key in `config/dev.js`, an AWS access key in a test fixture committed 8 months ago, and a JWT secret hardcoded in `src/auth/middleware.ts`.

### 3. Check for OWASP Top 10 vulnerabilities in application code

```
Review src/ for OWASP Top 10 vulnerabilities: SQL injection, XSS, broken authentication, insecure deserialization, and SSRF. Show me the exact file and line number for each finding with a severity rating.
```

The agent identifies an unsanitized user input passed to a raw SQL query in `src/controllers/searchController.ts:47`, an `innerHTML` assignment from user data in `src/views/profileRenderer.ts:23`, and a missing rate limiter on the login endpoint.

### 4. Generate fixes for critical findings

```
Generate patches for all critical and high severity findings. For dependency issues, update to the minimum safe version. For code issues, apply the fix inline. Show me a diff for each change.
```

The agent produces seven diffs: two `package.json` version bumps, a parameterized query replacement, an XSS sanitization wrapper, a rate limiter middleware addition, and two secret externalizations to environment variables.

## Real-World Example

A three-person startup building a healthcare scheduling platform prepares for a HIPAA compliance review. Their CTO runs the security audit agent against their 18-month-old Express.js API.

1. The dependency scan reveals 3 critical CVEs including a remote code execution vector in an XML parser used for insurance claim processing
2. Secret detection finds a production database connection string committed to git 11 months ago — the team rotates credentials immediately
3. The OWASP scan catches two SQL injection points in the patient search endpoint and a missing CSRF token on the appointment booking form
4. The agent generates all patches; the CTO applies and pushes them in a single afternoon

The audit surfaces 4 critical issues that would have failed the compliance review. Total time from scan to merged fixes: 3 hours instead of the 2-week estimate from a contracted penetration testing firm.

## Related Skills

- [code-reviewer](../skills/code-reviewer/) — Catch security issues during regular code review workflows
- [cicd-pipeline](../skills/cicd-pipeline/) — Integrate security scans into your CI pipeline for continuous auditing
