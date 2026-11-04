---
title: "Audit Code Security with AI"
slug: audit-code-security
description: "Run a comprehensive security audit across application code, Docker configurations, and CI/CD pipelines to eliminate vulnerabilities end-to-end."
skills: [security-audit, docker-helper, github-actions]
category: devops
tags: [security, audit, docker, cicd, vulnerabilities]
---

# Audit Code Security with AI

## The Problem

Your Express.js API handles financial data for 12,000 users. A pen tester found 23 issues — SQL injection, hardcoded secrets, Docker containers running as root. Your team patched the critical items, but nobody audited the other 180 endpoints, 6 Dockerfiles, or the CI pipeline that deploys without any security checks. A manual AppSec review of that surface takes weeks and has to be repeated after every release.

## The Solution

The **security-audit** skill scans application code for injection flaws, auth bypasses, and secret leaks. The **docker-helper** skill audits container configs for privilege escalation, exposed ports, and bloated images. The **github-actions** skill writes the workflow that runs those scanners as security gates so vulnerabilities get caught before production.

## Step-by-Step Walkthrough

### Step 1: Scan Application Code for Vulnerabilities

```text
Run a security audit on this Express.js API. Focus on injection vulnerabilities, authentication flaws, and secret management.
```

The scan covers all 180 endpoints. In this example it returns 31 findings across four severity levels. The critical ones need immediate attention:

**CRITICAL (4 findings):**

- **`src/routes/reports.js:45`** — Raw SQL interpolation: `WHERE id = ${req.params.id}`. Classic SQL injection — an attacker can dump the entire database through the reports endpoint.

- **`src/services/export.js:78`** — Path traversal in the file download endpoint. Requesting `../../etc/passwd` as the filename works. There is no sanitization.

- **`.env.production`** — Committed to git with live database credentials. Every developer who has ever cloned this repo has production credentials on their laptop.

- **`src/config/jwt.js:12`** — The JWT secret is literally `"supersecret123"`. Anyone can forge auth tokens.

**HIGH (8 findings):** 3 endpoints missing rate limiting, no CSRF protection on state-changing routes, unrestricted file upload size and type, and 3 dependencies with known advisories.

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
Audit all Dockerfiles and compose.yaml for security issues. Check privilege escalation, exposed secrets, and image bloat.
```

The audit finds nine issues across the 6 Dockerfiles. The two critical issues are both common mistakes that give attackers a much larger blast radius:

**Running as root** — The API container has no `USER` directive, so every process runs as root. If an attacker exploits the path traversal bug, they have root access to the container filesystem.

Fix applied:

```dockerfile
# Create non-root user with minimal permissions
# The official node images already ship a non-root user
USER node
```

**Plain-text database password** in `compose.yaml` — visible to anyone with repo access.

Fix: moved to Compose `secrets:` (a file outside git, mounted at `/run/secrets/db_password`; the Postgres image reads it through `POSTGRES_PASSWORD_FILE`).

Four high-severity findings also get resolved:

| Issue | Before | After |
|---|---|---|
| Bloated, end-of-life base image | `node:20` (Node 20 reached end of life in April 2026) | multi-stage build on `node:24-alpine` |
| Privileged container | `privileged: true` | `cap_drop: [ALL]`, `read_only: true`, `no-new-privileges` |
| Exposed database port | PostgreSQL published on `0.0.0.0:5432` | No `ports:` entry; reachable only on the Compose network |
| No health check | Container restarts blindly | `HEALTHCHECK` using `wget` (alpine has no curl) against `/health` |

The image shrinks to a fraction of its former size. Less code in the image means less attack surface.

### Step 3: Fix Dependency Vulnerabilities

```text
Update the vulnerable dependencies. Check for breaking changes and run tests after each update.
```

Three dependencies have known advisories (`npm audit` lists them with links). Each gets updated one at a time with tests run between updates to catch breaking changes:

| Package | Old Version | New Version | Advisory |
|---|---|---|---|
| lodash | 4.17.15 | 4.18.1 | Prototype pollution, code injection (4.17.21 is itself affected) |
| jsonwebtoken | 8.5.1 | 9.0.3 | Signature validation bypass, key-type confusion |
| express-fileupload | 1.2.0 | 1.6.0 | Arbitrary file overwrite (GHSA-w4m6-x6c2-j5c9, affects up to 1.3.1) |

`jsonwebtoken` 9 is a breaking change: `verify()` now requires an explicit `algorithms` list for the key type, so the tests are re-run after that update.

Three unused dependencies also get removed — less code, fewer potential vulnerabilities.

After all updates `npm audit --omit=dev --audit-level=high` exits cleanly and the 47 existing tests pass.

### Step 4: Set Up Security Gates in CI/CD

```text
Add security scanning to our GitHub Actions pipeline. SAST on code, Docker image scanning, dependency audit, and secret detection. Block deployment on critical findings.
```

The new security workflow runs four checks on every pull request. The tools run from version-pinned container images, so no third-party GitHub Action (and no license key for gitleaks-action, which organizations need) sits in the pipeline:

```yaml
# .github/workflows/security.yml
name: security
on: { pull_request: {} }
permissions: { contents: read }

jobs:
  security:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }          # gitleaks scans history

      - name: SAST (Semgrep)
        run: >-
          docker run --rm -v "$PWD:/src" semgrep/semgrep:1.183.0
          semgrep scan --config p/nodejs --config p/expressjs --error /src

      - name: Dependency audit
        run: npm ci && npm audit --omit=dev --audit-level=high

      - name: Secret detection (gitleaks)
        run: >-
          docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1
          git --redact --exit-code 1 /repo

      - name: Build and scan image (Trivy)
        run: |
          docker build -t app:ci .
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.76.1 \
            image --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 app:ci
```

Any finding fails the job; marking the `security` check as required in the branch protection rules is what turns that into a merge block. Pin the images by digest (`@sha256:...`) once the pipeline is stable. The jobs take a few minutes per PR.

The production deployment workflow now depends on a green security check (`needs: security` in the same workflow, or a required status on `main`) — no more shipping unscanned code.

### Step 5: Validate the Full Security Posture

```text
Run the complete security pipeline to establish a clean baseline.
```

Full pipeline run on the patched codebase:

- **SAST:** no remaining findings from the Semgrep rule sets (the 31 earlier findings resolved)
- **Dependencies:** no high or critical advisories
- **Image scan:** no fixable CRITICAL or HIGH vulnerabilities
- **Secrets:** gitleaks still flags the old `.env.production` commit in history, so it is allow-listed by fingerprint in `.gitleaksignore` only after the credentials are rotated

Three manual items remain that automation cannot fix:

1. **Rotate production database credentials** — they are exposed in git history and must be changed at the infrastructure level
2. **Rotate the JWT secret and invalidate existing tokens** — users will need to log in again
3. **Enable WAF on public endpoints** — requires infrastructure configuration outside the codebase

The automated gates are green; the three manual items are what is left on the list.

## Real-World Example

A CTO at a 40-person healthtech startup received a pen test report with 19 critical findings two weeks before a hospital partnership deadline. The hospital required HIPAA-aligned controls, and the current state was nowhere close.

Monday, the security-audit skill scanned the 70,000-line Django API. It found all 19 pen test issues plus 8 additional ones the pen testers missed, including an IDOR vulnerability in patient records — a single endpoint that let any authenticated user access any patient's data by changing the ID in the URL.

Tuesday, the docker-helper skill hardened 4 Dockerfiles. Images shrank substantially, root containers were eliminated, and secrets moved out of compose files.

Wednesday, the github-actions skill deployed automated SAST, dependency scanning, and image checks as CI gates. Every future PR would be scanned before merge.

By Friday, all critical findings were resolved. The pipeline caught two new vulnerabilities in PRs that same week — both blocked before merge. The hospital partner approved the integration and the contract went ahead on schedule.
