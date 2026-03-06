---
title: "Centralize Application Secrets Management"
slug: centralize-app-secrets-management
description: "Replace scattered .env files with a centralized secrets management system using Doppler and env-manager to eliminate secret sprawl and accidental leaks."
skills:
  - doppler
  - env-managercategory: devops
tags:
  - secrets-management
  - environment-variables
  - security
  - doppler
---

# Centralize Application Secrets Management

## The Problem

A 20-person engineering team has secrets scattered across 14 different locations: .env files committed to private repos, AWS Parameter Store for some services, hardcoded values in Docker Compose files, and a shared 1Password vault that three people update independently. Last quarter, a database password rotation took two days because nobody knew which services used which credentials. A junior developer accidentally pushed a .env file to a public fork during a hackathon, exposing a Stripe test key.

## The Solution

Using the **doppler** skill to set up a centralized secrets manager with environment-specific configs, audit logging, and automatic rotation, paired with the **env-manager** skill to validate environment configurations, detect drift between environments, and enforce naming conventions across all services.

## Step-by-Step Walkthrough

### 1. Audit existing secrets and eliminate duplicates

Scan all repositories and services for scattered secrets.

> Scan our 8 repositories for .env files, docker-helper files with hardcoded credentials, and CI/CD pipeline secrets. Build an inventory of every secret: name, value hash, which services use it, and where it is currently stored. Flag duplicates and inconsistencies.

The audit reveals 47 unique secrets across the 8 repos, with 12 duplicated under different names (DB_URL vs DATABASE_URL vs POSTGRES_CONNECTION_STRING all pointing to the same database). Six secrets exist in .env.example files with real values instead of placeholders.

### 2. Set up Doppler project structure

Organize secrets into Doppler projects with environment hierarchies.

> Create a Doppler project structure for our 8 services. Each project needs four environments: development, staging, production, and ci. Set up shared secrets (database host, Redis URL, API gateway URL) as a root config that child environments inherit. Production secrets should require two-person approval for changes.

Doppler's inheritance model means the shared database host is defined once at the root level. Each environment overrides only what differs -- the database name, credentials, and connection pool size. Changing the database host propagates to all environments automatically.

### 3. Validate environment configurations

Check for missing variables, type mismatches, and drift between environments.

> Run env-manager validation across all 8 services. Check that every variable defined in development also exists in staging and production. Flag any production secrets that match development values (potential copy-paste mistakes). Verify that all URLs use HTTPS in production and that no secret values appear in application logs.

The validation report surfaces problems that would otherwise cause silent failures in production:

```text
Environment Validation Report
===============================
Service: payment-api

CRITICAL — Production values matching development:
  WEBHOOK_URL = http://localhost:3000/webhooks   (should be HTTPS production URL)
  SENTRY_DSN  = https://abc@sentry.io/dev-proj   (points to dev Sentry project)
  S3_BUCKET   = acme-uploads-dev                  (has -dev suffix)

WARNING — Missing in production:
  FEATURE_FLAG_URL  (defined in dev and staging, missing in prod)
  LOG_LEVEL         (defined in dev, missing in staging and prod)

WARNING — Protocol mismatch:
  REDIS_URL uses redis:// in production (expected rediss:// for TLS)

OK — 39 of 47 secrets validated across all environments
```

All three critical findings would have caused silent failures or data leaking to wrong environments.

### 4. Integrate Doppler into deployment pipelines

Wire Doppler into CI/CD and local development workflows.

> Integrate Doppler into our GitHub Actions pipelines and local development setup. CI should pull secrets at build time without storing them in GitHub Secrets. Local development should use `doppler run` to inject secrets. Set up Slack alerts for any secret changes in production and enable the audit log for SOC 2 compliance.

Developers run `doppler run -- npm start` locally, which injects secrets as environment variables without writing any .env file to disk. The CI pipeline uses a Doppler service token scoped to the ci environment. The audit log records every secret access with timestamp, user, and IP address.

## Real-World Example

Priya leads platform engineering at a fintech startup preparing for SOC 2 certification. The auditor flags their secret management as a critical finding -- secrets in git repos, no access logging, and no rotation policy. She migrates all 47 secrets to Doppler in two days, sets up access controls requiring two-person approval for production changes, and enables the audit log. The next password rotation takes 15 minutes instead of two days: change the value in Doppler, and every service picks it up on the next deploy. The SOC 2 auditor signs off on the secrets management control in the following review cycle.

## Tips

- Run the secret audit before migrating. You cannot centralize secrets you do not know exist, and the audit always finds credentials in places nobody expected.
- Use Doppler's root config for shared secrets and override only per-environment differences. This eliminates the most common drift problem: updating a URL in production but forgetting staging.
- Add a pre-commit hook that scans for secret patterns (API keys, connection strings, tokens) and blocks commits containing them. Tools like `gitleaks` or `trufflehog` integrate in seconds.
- Schedule quarterly secret rotation even when there is no incident. Rotation rehearsal means the team knows the process cold when a real leak occurs.
