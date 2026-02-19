---
name: owasp-zap
description: >-
  Assists with finding security vulnerabilities in web applications using OWASP ZAP. Use
  when configuring automated scans, writing scan policies, integrating security scanning
  into CI/CD pipelines, or analyzing results for OWASP Top 10 vulnerabilities like XSS,
  SQL injection, and CSRF. Trigger words: owasp zap, security scan, vulnerability scanner,
  penetration testing, zap-baseline, active scan, passive scan.
license: Apache-2.0
compatibility: "Requires Docker or Java 11+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["owasp-zap", "security", "vulnerability-scanning", "penetration-testing", "ci-cd"]
---

# OWASP ZAP

## Overview

OWASP ZAP is an open-source web application security scanner that discovers vulnerabilities through spidering, passive analysis, and active attack testing. It detects OWASP Top 10 issues (XSS, SQL injection, CSRF, SSRF, broken access control), integrates with CI/CD via Docker and GitHub Actions, and supports API scanning from OpenAPI specs with configurable scan policies.

## Instructions

- When running quick scans in CI, use `zap-baseline.py` which performs passive-only scanning (non-destructive) on every PR and catches approximately 60% of issues without sending attack payloads.
- When running thorough scans on staging, use `zap-full-scan.py` which combines spidering, passive scanning, and active attack testing; never run active scans on production since they send destructive payloads.
- When scanning APIs, use `zap-api-scan.py` with the OpenAPI/Swagger spec to automatically discover and test all endpoints without manual crawling.
- When configuring authentication, set up form-based, script-based, or header-based auth before scanning so ZAP can reach authenticated endpoints that contain the majority of vulnerabilities.
- When integrating with CI/CD, use the Docker image (`ghcr.io/zaproxy/zaproxy`) or GitHub Actions (`zaproxy/action-baseline`), set fail thresholds by alert level, and generate both HTML and JSON reports.
- When triaging results, prioritize by confidence and risk level (High/High first), exclude known false positives with scan policy rules, and ignore Informational alerts in CI.

## Examples

### Example 1: Add security scanning to a CI/CD pipeline

**User request:** "Run OWASP ZAP on every pull request to catch security issues early"

**Actions:**
1. Add a GitHub Action using `zaproxy/action-baseline@v0.12.0` targeting the staging URL
2. Configure fail thresholds to break the build on High risk alerts only
3. Generate HTML reports as build artifacts for developer review
4. Add scan policy exceptions for known false positives

**Output:** A CI pipeline that runs passive security scanning on every PR with reports and configurable failure thresholds.

### Example 2: Run a full security audit on a staging environment

**User request:** "Perform a comprehensive security scan of our web application before launch"

**Actions:**
1. Configure ZAP authentication with the application's login flow
2. Run the Ajax Spider for JavaScript-heavy SPA crawling
3. Execute a full active scan with High strength on all discovered endpoints
4. Generate HTML and JSON reports, triaging alerts by confidence and risk

**Output:** A comprehensive security audit report with prioritized vulnerabilities and remediation guidance.

## Guidelines

- Use `zap-baseline.py` in CI on every PR since it is non-destructive and catches most common issues passively.
- Run full active scans only on staging, never on production, since active scans send attack payloads.
- Set up authentication before scanning since unauthenticated scans miss vulnerabilities behind login.
- Import OpenAPI specs for API testing to automatically discover endpoints.
- Triage alerts by confidence and risk: address High confidence + High risk first.
- Exclude false positives with scan policy rules rather than ignoring alerts globally.
- Generate both HTML (for humans) and JSON (for automation) reports.
