---
name: snyk
description: >-
  Find and fix vulnerabilities in code and dependencies with Snyk. Use when a
  user asks to scan for security vulnerabilities, audit npm packages, check
  Docker images for CVEs, or integrate security into CI/CD.
license: Apache-2.0
compatibility: 'Node.js, Python, Go, Java, Docker, IaC'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - snyk
    - vulnerability
    - dependencies
    - docker
    - ci-cd
---

# Snyk

## Overview

Snyk finds and fixes vulnerabilities in open-source dependencies, container images, IaC configs, and code. Integrates into CLI, CI/CD, Git repos, and IDEs.

## Instructions

### Step 1: Setup

```bash
npm install -g snyk
snyk auth
```

### Step 2: Scan Dependencies

```bash
snyk test                    # test for vulnerabilities
snyk monitor                 # continuous monitoring
snyk fix                     # auto-fix vulnerabilities
```

### Step 3: Container Scanning

```bash
snyk container test node:20-alpine
snyk container test my-app:latest --file=Dockerfile
```

### Step 4: IaC Scanning

```bash
snyk iac test                # scan Terraform, K8s manifests
snyk iac test --report       # upload to dashboard
```

## Guidelines

- Free tier: 200 dependency tests/month, unlimited container tests.
- Use `--severity-threshold=high` in CI to fail only on critical issues.
- `snyk fix` auto-generates PRs with dependency upgrades.
- Alternatives: npm audit (basic), GitHub Dependabot (free), Socket.dev (supply chain).
