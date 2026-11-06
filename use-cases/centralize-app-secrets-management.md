---
title: "Centralize Application Secrets Management"
slug: centralize-app-secrets-management
description: "Replace scattered .env files with a centralized secrets management system using Doppler and env-manager to eliminate secret sprawl and accidental leaks."
skills:
  - doppler
  - env-manager
category: devops
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

Using the **doppler** skill to set up a centralized secrets manager with one project per service, environment-specific configs and an activity log, paired with the **env-manager** skill to find every variable the code reads, compare environments and catch drift and copy-paste mistakes before they reach production.

## Step-by-Step Walkthrough

### 1. Audit existing secrets and eliminate duplicates

Scan all repositories and services for scattered secrets.

> Scan our 8 repositories for .env files, files with hardcoded credentials, and CI/CD pipeline secrets. Build an inventory of every secret: name, which services use it, and where it is currently stored. Never print values; record only a hash of each. Flag duplicates and inconsistencies.

The agent uses the env-manager audit (grep for every `process.env` / `os.environ` reference, compare with `.env.example`). For history, run a dedicated scanner such as `gitleaks detect` over each repo, because deleted files stay in git history. The audit reveals 47 unique secrets across the 8 repos, with 12 duplicated under different names (DB_URL vs DATABASE_URL vs POSTGRES_CONNECTION_STRING all pointing to the same database). Six secrets exist in .env.example files with real values instead of placeholders. Rotate those six now: anything that was in git history is compromised.

### 2. Set up Doppler project structure

Doppler organizes secrets as projects (one per service) that each contain environments. Each environment has a root config: `dev`, `stg` and `prd` by default, plus a custom `ci` environment you add in the dashboard under the project's options.

> Create a Doppler project for each of our 8 services with the dev, stg, prd and ci configs. Import each service's current .env into its dev config, then give me the list of secrets that differ between environments. Put shared values (database host, Redis URL, API gateway URL) in one `platform-shared` project and reference them from each service.

```bash
doppler login
doppler secrets upload .env -p payment-api -c dev
doppler secrets -p payment-api -c dev --only-names     # verify the import
```

Inheritance works in two places. A branch config (such as each developer's `dev_personal`) inherits from its root config, so a change to the root `dev` config propagates to its branches. Values shared by several services or environments live in one place through secret references: in `payment-api`, set `DB_HOST` to `${platform-shared.prd.DB_HOST}` and Doppler resolves it when the secret is read. Cross-project references need a paid plan.

Require review for production changes with Doppler change requests, which are available on the Team and Enterprise plans: reviewers need the Approve Change Requests permission on the `prd` config, and a merged change triggers the same syncs and webhooks as a direct edit.

### 3. Validate environment configurations

Check for missing variables and drift between environments.

> Run the env-manager comparison across all 8 services. Check that every variable defined in dev also exists in stg and prd. Flag any production value that equals the development value (potential copy-paste mistake). Verify that all URLs use HTTPS in production.

The agent pulls names and values from each config with the Doppler CLI and compares them locally, printing only names:

```bash
for c in dev stg prd; do
  doppler secrets -p payment-api -c "$c" --only-names > "/tmp/payment-api.$c.txt"
done
diff /tmp/payment-api.dev.txt /tmp/payment-api.prd.txt
```

The report surfaces problems that would otherwise cause silent failures in production:

```text
Environment Validation Report
===============================
Service: payment-api

CRITICAL - Production values matching development:
  WEBHOOK_URL = http://localhost:3000/webhooks   (should be HTTPS production URL)
  SENTRY_DSN  = (same value as dev)              (points to dev Sentry project)
  S3_BUCKET   = acme-uploads-dev                 (has -dev suffix)

WARNING - Missing in production:
  FEATURE_FLAG_URL  (defined in dev and staging, missing in prd)
  LOG_LEVEL         (defined in dev, missing in stg and prd)

WARNING - Protocol mismatch:
  REDIS_URL uses redis:// in production (expected rediss:// for TLS)

OK - 39 of 47 secrets validated across all environments
```

Add the required-variable check from the env-manager skill (`node --env-file=...` against a list of required names) to CI so a missing variable fails the pipeline instead of the deploy.

### 4. Integrate Doppler into deployment pipelines

Wire Doppler into CI/CD and local development workflows.

> Integrate Doppler into our GitHub Actions pipelines and local development setup. CI should use a read-only Doppler service token scoped to the ci config. Local development should use `doppler run` to inject secrets. Send Doppler activity-log events to Slack.

Developers run `doppler setup` once and then `doppler run -- npm start`, which injects secrets as environment variables without writing a .env file to disk. Create one service token per pipeline, read-only, with an expiry:

```bash
doppler configs tokens create gha-build -p payment-api -c ci --max-age 720h --plain
```

Store it as the single repository secret `DOPPLER_TOKEN`; every other secret then comes from Doppler at run time:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: dopplerhq/cli-action@v4
  - run: doppler run -- npm test
    env:
      DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

Activity logs record who changed what and when, and a workplace can forward them to Slack (Team plan and above). Put a calendar reminder on the token expiry, since an expired token fails the build.

## Real-World Example

Priya leads platform engineering at a fintech startup preparing for SOC 2 certification. The auditor flags their secret management as a critical finding -- secrets in git repos, no access logging, and no rotation policy. She migrates all 47 secrets to Doppler in two days, turns on change requests for production, and forwards the activity log to Slack. The next password rotation takes 15 minutes instead of two days: change the value in Doppler, and every service picks it up the next time it starts. She gives the auditor the activity log as evidence for the secrets management control.

## Tips

- Run the secret audit before migrating. You cannot centralize secrets you do not know exist, and the audit always finds credentials in places nobody expected.
- Use secret references for values shared across services and root configs for per-environment values. This removes the most common drift problem: updating a URL in production but forgetting staging.
- Add a pre-commit hook that scans for secret patterns (API keys, connection strings, tokens) and blocks commits containing them. Tools like `gitleaks` or `trufflehog` integrate in seconds.
- Schedule quarterly secret rotation even when there is no incident. Rotation rehearsal means the team knows the process cold when a real leak occurs.

## Related Skills

- [doppler](../skills/doppler/SKILL.md): project and config setup, `doppler run` injection, service tokens for CI
- [env-manager](../skills/env-manager/SKILL.md): finds every variable the code reads and compares environments for drift
