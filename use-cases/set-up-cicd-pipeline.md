---
title: "Set Up a CI/CD Pipeline with AI"
slug: set-up-cicd-pipeline
description: "Use an AI agent to create a production-ready CI/CD pipeline with testing, security scanning, and automated deployments."
skills: [cicd-pipeline]
category: devops
tags: [cicd, github-actions, deployment, automation, devops]
---

# Set Up a CI/CD Pipeline with AI

## The Problem

Setting up a CI/CD pipeline from scratch involves stitching together dozens of configuration details: build steps, test runners, environment variables, secret management, deployment targets, caching strategies, and notification hooks. GitHub Actions alone has 400+ configuration options. A misconfigured pipeline wastes hours on failed runs, and most teams end up with a fragile YAML file that nobody wants to touch. Engineers spend an average of 8-12 hours getting a production-grade pipeline working, then another 4-6 hours debugging intermittent failures over the following weeks.

## The Solution

The `cicd-pipeline` skill generates complete CI/CD configurations tailored to your stack, including build caching, parallel test execution, security scanning gates, and multi-environment deployment with rollback support.

```bash
npx terminal-skills install cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Analyze the project and recommend a pipeline architecture

```
Analyze this project's stack (Next.js 14, PostgreSQL, Prisma ORM, deployed on Vercel) and design a CI/CD pipeline for GitHub Actions. I need: lint, type-check, unit tests, integration tests against a real database, security audit, preview deployments on PRs, and production deployment on merge to main.
```

The agent inspects `package.json`, `prisma/schema.prisma`, and `vercel.json`, then proposes a three-workflow architecture: PR checks, preview deploy, and production release.

### 2. Generate the pipeline configuration files

```
Generate the GitHub Actions workflow files. Use PostgreSQL 16 as a service container for integration tests, enable dependency caching with pnpm, run tests in parallel across 3 shards, and add a security audit step that blocks merge on critical vulnerabilities.
```

The agent creates `.github/workflows/ci.yml` with job definitions for lint, typecheck, test (matrix: 3 shards), security-audit, and deploy-preview — all with proper `needs` dependencies and concurrency controls.

### 3. Configure secrets and environment variables

```
List all the secrets and environment variables this pipeline needs. Generate a .env.example with placeholders and tell me exactly what to add in GitHub repository settings under Settings > Secrets.
```

```
Required GitHub Secrets:
  VERCEL_TOKEN — from Vercel dashboard > Settings > Tokens
  VERCEL_ORG_ID — from .vercel/project.json
  VERCEL_PROJECT_ID — from .vercel/project.json
  DATABASE_URL — PostgreSQL connection string for staging

Generated: .env.example with 7 variables documented
```

### 4. Add deployment safeguards

```
Add these safeguards to the production deployment: require all CI checks to pass, add a 5-minute manual approval gate for production deploys, auto-rollback if the health check at /api/health fails within 2 minutes of deploy, and notify the team Slack channel on success or failure.
```

The agent updates the workflow with an `environment: production` gate requiring approval, a post-deploy health check step, a conditional rollback job, and Slack notification via `slackapi/slack-github-action`.

## Real-World Example

A full-stack developer launches a SaaS project management tool built with Next.js and PostgreSQL. She's been deploying by running `vercel --prod` from her laptop — no tests run, no security checks, no team visibility.

1. The agent analyzes her stack and generates three GitHub Actions workflows totaling 185 lines of YAML
2. Integration tests run against a real PostgreSQL service container, catching a Prisma migration bug that would have broken production
3. The security audit gate blocks a PR that introduced `lodash 4.17.20` with a known prototype pollution vulnerability
4. After two weeks, the pipeline has run 47 times with zero manual intervention needed — deploys that used to take 15 minutes of manual steps now complete automatically in 4 minutes

The developer estimates saving 3 hours per week on deployment tasks and has caught two bugs that would have reached production.

## Related Skills

- [security-audit](../skills/security-audit/) — Deep security scanning to integrate into the CI pipeline
- [test-generator](../skills/test-generator/) — Generate the test suites that the pipeline runs
