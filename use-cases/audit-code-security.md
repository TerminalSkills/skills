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

## Step-by-Step Walkthrough

### Step 1: Scan Application Code for Vulnerabilities

```text
Run a security audit on this Express.js API. Focus on injection vulnerabilities, authentication flaws, and secret management.
```

The scan covers all 180 endpoints and returns 31 findings across four severity levels. The critical ones need immediate attention:

**CRITICAL (4 findings):**

- **`src/routes/reports.js:45`** — Raw SQL interpolation: `WHERE id = ${req.params.id}`. Classic SQL injection — an attacker can dump the entire database through the reports endpoint.

- **`src/services/export.js:78`** — Path traversal in the file download endpoint. Requesting `../../etc/passwd` as the filename works. There is no sanitization.

- **`.env.production`** — Committed to git with live database credentials. Every developer who has ever cloned this repo has production credentials on their laptop.

- **`src/config/jwt.js:12`** — The JWT secret is literally `"supersecret123"`. Anyone can forge auth tokens.

**HIGH (8 findings):** 3 endpoints missing rate limiting, no CSRF protection on state-changing routes, unrestricted file upload size and type, and 2 dependencies with known CVEs.

Auto-fixes resolve the injection vulnerabilities immediately:

```javascript
// BEFORE — SQL injection
const result = await db.query(`SELECT * FROM reports WHERE id = ${req.params.id}`);

// AFTER — parameterized query
const result = await db.query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
```

```javascript
// BEFORE — path traversal
const filePath = path.join(uploadsDir, req.params.filename);

// AFTER — sanitized path that cannot escape the uploads directory
const safeName = path.basename(req.params.filename);
const filePath = path.join(uploadsDir, safeName);
```

The `.env.production` file gets added to `.gitignore` and removed from tracking. But the damage is done — those credentials exist in git history and need to be rotated manually.

### Step 2: Audit Docker Configurations

```text
Audit all Dockerfiles and docker-helper.yml for security issues. Check privilege escalation, exposed secrets, and image bloat.
```

Nine findings across 6 Dockerfiles. The two critical issues are both common mistakes that give attackers a much larger blast radius:

**Running as root** — The API container has no `USER` directive, so every process runs as root. If an attacker exploits the path traversal bug, they have root access to the container filesystem.

Fix applied:

```dockerfile
# Create non-root user with minimal permissions
RUN addgroup --system app && adduser --system --ingroup app app
USER app
```

**Plain-text database password** in `docker-helper.yml` — visible to anyone with repo access.

Fix: moved to Docker secrets with a reference in the compose file.

Four high-severity findings also get resolved:

| Issue | Before | After |
|---|---|---|
| Bloated base image | `node:20` (1.1 GB) | `node:20-alpine` (180 MB) |
| Privileged container | `--privileged` flag | Only `NET_BIND_SERVICE` capability |
| Exposed database port | PostgreSQL on host network | Internal Docker network only |
| No health check | Container restarts blindly | `HEALTHCHECK` with curl to `/health` |

Image size drops from 1.1 GB to 180 MB. Less code in the image means less attack surface.

### Step 3: Fix Dependency Vulnerabilities

```text
Update the vulnerable dependencies. Check for breaking changes and run tests after each update.
```

Three dependencies have known CVEs. Each gets updated one at a time with tests run between updates to catch breaking changes:

| Package | Old Version | New Version | Vulnerability |
|---|---|---|---|
| lodash | 4.17.15 | 4.17.21 | Prototype pollution |
| jsonwebtoken | 8.5.1 | 9.0.2 | Algorithm confusion attack |
| express-fileupload | 1.2.0 | 1.5.1 | Arbitrary file write |

Three unused dependencies also get removed — less code, fewer potential vulnerabilities.

After all updates: `npm audit` reports **0 vulnerabilities** (was 11). All 47 existing tests pass.

### Step 4: Set Up Security Gates in CI/CD

```text
Add security scanning to our GitHub Actions pipeline. SAST on code, Docker image scanning, dependency audit, and secret detection. Block deployment on critical findings.
```

The new security workflow runs four checks on every pull request:

```yaml
# .github/workflows/security.yml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - name: SAST scan
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/expressjs  # Express.js-specific rules

      - name: Dependency audit
        run: npm audit --audit-level=high

      - name: Docker image scan
        uses: aquasecurity/trivy-action@master
        with:
          severity: CRITICAL,HIGH

      - name: Secret detection
        uses: gitleaks/gitleaks-action@v2
```

Any critical finding blocks the PR. A security summary posts as a PR comment so developers see the results without digging through CI logs. Scan time: about 2 minutes per PR.

The production deployment workflow now requires a green security check — no more shipping unscanned code.

### Step 5: Validate the Full Security Posture

```text
Run the complete security pipeline to establish a clean baseline.
```

Full pipeline run on the patched codebase:

- **SAST:** 0 critical, 0 high (31 previously found issues resolved)
- **Dependencies:** 0 vulnerabilities
- **Docker scan:** 0 critical CVEs
- **Secrets:** 0 leaked credentials in current code

Three manual items remain that automation cannot fix:

1. **Rotate production database credentials** — they are exposed in git history and must be changed at the infrastructure level
2. **Rotate the JWT secret and invalidate existing tokens** — users will need to log in again
3. **Enable WAF on public endpoints** — requires infrastructure configuration outside the codebase

**Security score: 23/100 to 91/100.** The remaining 9 points come from the manual rotation tasks.

## Real-World Example

A CTO at a 40-person healthtech startup received a pen test report with 19 critical findings two weeks before a hospital partnership deadline. The hospital required HIPAA-compliant infrastructure, and the current state was nowhere close.

Monday, the security-audit skill scanned the 70,000-line Django API. It found all 19 pen test issues plus 8 additional ones the pen testers missed, including an IDOR vulnerability in patient records — a single endpoint that let any authenticated user access any patient's data by changing the ID in the URL.

Tuesday, the docker-helper skill hardened 4 Dockerfiles. Images shrank by 80%, root containers were eliminated, and secrets moved out of compose files.

Wednesday, the cicd-pipeline skill deployed automated SAST, dependency scanning, and image checks as CI gates. Every future PR would be scanned before merge.

By Friday, all critical findings were resolved. The pipeline caught two new vulnerabilities in PRs that same week — both blocked before merge. The hospital partner approved the integration, and the startup signed the $2.4M annual contract on schedule.
