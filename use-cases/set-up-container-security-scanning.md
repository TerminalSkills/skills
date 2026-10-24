---
title: "Set Up Automated Container Security Scanning with AI"
slug: set-up-container-security-scanning
description: "Automate vulnerability scanning of Docker container images and generate remediation plans."
skills: [trivy, docker-helper, security-audit, coding-agent]
category: devops
tags: [containers, docker, security, vulnerability-scanning, devops]
---

# Set Up Automated Container Security Scanning with AI

## The Problem

Soren's team builds and deploys 15 Docker images across microservices at a healthcare startup that must pass security audits quarterly. Each image pulls in base layers, system packages, and application dependencies -- any of which could have known vulnerabilities. Everyone knows they should be scanning images, but Trivy output is a wall of CVE numbers, severity levels, and package names. The last time someone ran it against the API server, over a thousand findings came back, mostly from an end-of-life base image. Nobody had time to triage which ones were actually exploitable, which were false positives for their stack, and which upgrades would break things.

So the scan results sit in a Slack thread, unread, while the team ships features. Then the quarterly security audit arrives and critical CVEs get flagged across container images. The compliance team is concerned. The team has 30 days to remediate, and suddenly container security is everyone's emergency.

## The Solution

Using the **trivy**, **docker-helper**, **security-audit** and **coding-agent** skills, this walkthrough scans the images with Trivy, separates real risks from noise, applies the fixes to the Dockerfiles, and gates CI so new findings are caught at build time.

## Step-by-Step Walkthrough

### Step 1: Scan and Summarize All Images

Install Trivy from a release archive and verify its checksum (never pipe the install script into a shell). Use a current release; Trivy v0.69.4, the Docker Hub images v0.69.5 and v0.69.6, and the version tags of `aquasecurity/trivy-action` and `setup-trivy` were replaced with malicious code in March 2026 ([advisory GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)).

```bash
VERSION=0.76.1
curl -sLO https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/trivy_${VERSION}_Linux-64bit.tar.gz
curl -sLO https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/trivy_${VERSION}_checksums.txt
sha256sum --check --ignore-missing trivy_${VERSION}_checksums.txt
tar -xzf trivy_${VERSION}_Linux-64bit.tar.gz trivy
```

Then ask the agent for a grouped summary instead of raw output:

```text
Scan our Docker images api-server:latest, worker:latest and web-frontend:latest with Trivy. Summarize HIGH and CRITICAL findings per image, split into fixable and not yet fixable.
```

Under the hood each scan is one command per image (Trivy scans one target per run):

```bash
trivy image --severity HIGH,CRITICAL --ignore-unfixed --format json --output api-server.json api-server:latest
trivy image --severity HIGH,CRITICAL --ignore-unfixed worker:latest
```

`--ignore-unfixed` hides CVEs that have no patch yet; report those separately so the exposure is not forgotten.

For scale, Trivy v0.76.1 on two public images (scanned 2026-10-24, fixable HIGH and CRITICAL only):

| Image | Base OS | Critical | High |
|-------|---------|----------|------|
| `node:18-bullseye` | Debian 11 (end of support reported by Trivy) | 183 | 1110 |
| `nginx:1.24-alpine` | Alpine 3.17 (end of support reported by Trivy) | 2 | 11 |

Most findings come from the base image and its system packages, not from application code. That decides the priority: base image updates are usually low-risk and high-impact.

### Step 2: Triage by Exploitability

Raw counts mislead. A critical in a library your code never loads is less urgent than a high in your request path:

```text
For each fixable critical and high finding, say which package it is in, whether our service uses it at runtime, and what to change in the Dockerfile or package files. Prioritize by exploitability.
```

Check the agent's claims before acting on them: read the advisory behind each CVE and confirm the package is really in the final image (`trivy image --format json` lists the package path). A finding in a build tool that never reaches the runtime image disappears with a multi-stage build; a finding in OpenSSL or libexpat in a service that makes TLS calls or parses XML is real and is fixed by a newer base image.

The biggest single fix here is the base image itself. `node:18` reached end of life in April 2025 and Debian 11 (bullseye) is past its end of life, so neither gets security patches. Node.js 24 is a supported LTS line (end of life April 2028) and Debian 12 (bookworm) and 13 (trixie) are supported:

| Image | Bump |
|-------|------|
| `api-server` | `node:18-bullseye` to `node:24-bookworm-slim` (check your code against Node 24 first) |
| `worker` | stay on a supported Python minor, same `-slim-bookworm` or `-slim-trixie` variant |
| `web-frontend` | `nginx:1.24-alpine` to `nginx:1.30-alpine` (current stable line; re-run `nginx -t` on your config) |

### Step 3: Generate Fixed Dockerfiles

```text
Generate updated Dockerfiles for all three images with the fixes applied. Add a comment explaining each change.
```

The api-server moves from a single-stage image with compilers and dev tools to a multi-stage build, so only the compiled output and production dependencies reach the final image:

```dockerfile
# Build stage: full toolchain for compiling the app
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: only what is needed to run
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
USER node
# The slim image has no curl, so the health check uses Node itself
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
```

For reproducible builds, pin each `FROM` to a digest once the tag is chosen (`FROM node:24-bookworm-slim@sha256:...`, taking the digest from `docker buildx imagetools inspect node:24-bookworm-slim`). Pinned digests do not update themselves, which is why Step 5 includes an update bot.

### Step 4: Verify the Fixes

Rebuild and re-scan. On the public base images, the same command shows the effect of the bump (scanned 2026-10-24):

| Image | Critical / High before | Critical / High after |
|-------|------------------------|------------------------|
| `node:18-bullseye` to `node:24-bookworm-slim` | 183 / 1110 | 0 / 4 |
| `nginx:1.24-alpine` to `nginx:1.30-alpine` | 2 / 11 | 0 / 1 |

Your own images will differ, because they add application dependencies on top. Whatever remains goes into a tracking list with a documented risk acceptance, for example "CVE in libfoo: no upstream patch, not reachable in our usage, re-check monthly". Record accepted findings in `.trivyignore` (one ID per line) or `.trivyignore.yaml`, which supports expiry dates so an acceptance cannot live forever.

Smaller images are a side benefit: fewer packages means fewer places for a CVE to appear, and faster pulls.

### Step 5: Add Scanning to the CI Pipeline

```text
Add Trivy scanning to our GitHub Actions workflow. Fail the build on any fixable critical vulnerability and list fixable high ones in the job summary.
```

The workflow installs the verified release archive from Step 1 instead of a third-party action, so no mutable tag is trusted. (If you do use `aquasecurity/trivy-action`, pin it to a full commit SHA, not a tag.)

```yaml
name: image-scan
on: pull_request
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      TRIVY_VERSION: "0.76.1"
    steps:
      - uses: actions/checkout@v7
      - name: Install Trivy (checksum verified)
        run: |
          curl -sLO "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
          curl -sLO "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_checksums.txt"
          sha256sum --check --ignore-missing "trivy_${TRIVY_VERSION}_checksums.txt"
          tar -xzf "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" trivy
      - run: docker build -t api-server:${{ github.sha }} .
      - name: Report fixable HIGH findings
        run: |
          echo '```' >> "$GITHUB_STEP_SUMMARY"
          ./trivy image --severity HIGH --ignore-unfixed api-server:${{ github.sha }} >> "$GITHUB_STEP_SUMMARY"
          echo '```' >> "$GITHUB_STEP_SUMMARY"
      - name: Fail on fixable CRITICAL
        run: ./trivy image --severity CRITICAL --ignore-unfixed --exit-code 1 api-server:${{ github.sha }}
```

`--exit-code 1` is what fails the job; the default exit code is 0 even when findings exist. Keep base images current with Dependabot's `docker` ecosystem (or Renovate), which opens a PR when a pinned tag or digest has a newer version, so the scan runs on that PR too.

## Real-World Example

Soren applies the fixes in one afternoon. The re-scan shows no fixable critical findings in any production image, and the one remaining high-severity item is on the tracking list with an expiry date. The quarterly audit is easier because the evidence is a CI history rather than a one-off cleanup.

Three weeks later a developer adds a dependency whose image layer carries a fixable critical CVE. The pull request fails the scan, the developer picks a patched version, and the build goes green the same day. Nobody had to read a Slack thread.

## Related Skills

- [trivy](/skills/trivy) - scan images, filesystems and IaC; exit-code gating
- [docker-helper](/skills/docker-helper) - multi-stage builds and base image changes
- [security-audit](/skills/security-audit) - triage and risk acceptance
- [coding-agent](/skills/coding-agent) - applies the Dockerfile and workflow edits
