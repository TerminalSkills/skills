---
title: "Set Up Automated Container Security Scanning with AI"
slug: set-up-container-security-scanning
description: "Automate vulnerability scanning of Docker container images and generate remediation plans."
skills: [docker-helper, security-audit, coding-agent]
category: devops
tags: [containers, docker, security, vulnerability-scanning, devops]
---

# Set Up Automated Container Security Scanning with AI

## The Problem

Your team builds and deploys 15 Docker images across microservices. Each image pulls in base layers, system packages, and application dependencies — any of which could have known vulnerabilities. You know you should be scanning images, but Trivy output is walls of CVE numbers, severity levels, and package names. Nobody has time to triage 200 vulnerabilities per image, figure out which ones are actually exploitable, and create upgrade plans that won't break anything.

## The Solution

Use **docker-helper** to inspect and manage container images, **security-audit** to analyze vulnerabilities and assess real-world risk, and **coding-agent** to generate Dockerfile fixes and dependency updates.

## Step-by-Step Walkthrough

### 1. Scan your container images

Point the agent at your images:

```text
Scan our Docker images for vulnerabilities: api-server:latest, worker:latest, and web-frontend:latest. Use Trivy and give me a summary grouped by severity and fixability.
```

### 2. The agent runs scans and summarizes

```text
Container Vulnerability Scan Results:

api-server:latest (node:18-bullseye base)
  Critical: 3 (all fixable)  |  High: 12 (9 fixable)  |  Medium: 34  |  Low: 87
  Image size: 1.2GB  |  Layers: 23  |  Base image age: 4 months

worker:latest (python:3.11-slim base)
  Critical: 0  |  High: 4 (3 fixable)  |  Medium: 18  |  Low: 42
  Image size: 340MB  |  Layers: 14  |  Base image age: 2 months

web-frontend:latest (nginx:1.24-alpine base)
  Critical: 1 (fixable)  |  High: 2 (2 fixable)  |  Medium: 8  |  Low: 15
  Image size: 45MB  |  Layers: 8  |  Base image age: 6 months

Total fixable critical/high vulnerabilities: 4 critical, 14 high
```

### 3. Get actionable remediation plans

```text
For each critical and high-severity fixable vulnerability, tell me exactly what to change in the Dockerfile or package files to fix it. Prioritize by exploitability.
```

### 4. The agent creates a remediation plan

```text
Remediation Plan — Priority Order:

1. CRITICAL: CVE-2024-38816 in api-server (Spring Web path traversal)
   Not applicable — this is a Node.js service, Spring is an unused transitive dependency
   Fix: Add to .dockerignore or remove with multi-stage build
   Risk: None (false positive for this service)

2. CRITICAL: CVE-2025-1023 in api-server (OpenSSL buffer overflow)
   Fix: Update base image from node:18-bullseye to node:18-bookworm
   Dockerfile change: Line 1: FROM node:18-bookworm
   Risk: Low — Debian bookworm is the current stable

3. CRITICAL: CVE-2024-45490 in web-frontend (libexpat heap overflow)
   Fix: Update base image from nginx:1.24-alpine to nginx:1.27-alpine
   Dockerfile change: Line 1: FROM nginx:1.27-alpine
   Risk: Low — nginx 1.27 is backward compatible with 1.24 config
```

### 5. Generate fixed Dockerfiles

```text
Generate updated Dockerfiles for all three images with the security fixes applied. Add a comment explaining each change.
```

The agent produces updated Dockerfiles with base image upgrades, removed unnecessary packages, and multi-stage build improvements.

## Real-World Example

Soren is a DevOps engineer at a healthcare startup that must pass security audits quarterly. Their last audit flagged 12 critical CVEs across container images, and the team had 30 days to remediate. Using the container security scanning workflow:

1. Soren asks the agent to scan all 8 production images and triage the findings
2. The agent finds 7 of the 12 critical CVEs are in base image system packages — fixable by updating base images
3. Three more are in transitive npm dependencies not actually imported at runtime — the agent marks these as false positives with evidence
4. The remaining two require actual dependency upgrades — the agent generates the package.json changes and test commands
5. Soren applies all fixes in one afternoon, re-scans to confirm zero critical CVEs, and passes the audit with two weeks to spare

## Tips for Container Security

- **Use minimal base images** — alpine and distroless images have fewer packages and therefore fewer vulnerabilities
- **Pin base image digests** — using `node:18` pulls whatever the latest build is; pin the SHA256 digest for reproducibility
- **Scan in CI, not just locally** — developers forget to scan; automated gates don't
- **Don't ignore unfixable CVEs forever** — track them and re-check monthly; upstream fixes arrive over time
- **Separate build-time from runtime dependencies** — multi-stage builds ensure dev tools don't ship to production
