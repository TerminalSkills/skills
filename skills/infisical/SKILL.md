---
name: infisical
description: >-
  Manage application secrets and environment variables with Infisical —
  open-source secrets management platform. Use when someone asks to "manage
  secrets", "Infisical", "centralize environment variables", "secrets manager",
  "replace .env files", "rotate API keys", or "sync secrets to CI/CD".
  Covers secret storage, team sharing, auto-rotation, CI/CD injection,
  and Kubernetes integration.
license: Apache-2.0
compatibility: "Any language/platform. CLI, SDKs, Docker, Kubernetes. Self-hostable."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["secrets", "security", "infisical", "env-vars", "configuration"]
---

# Infisical

## Overview

Infisical is an open-source secrets management platform — a centralized place to store, sync, and rotate secrets (API keys, database URLs, tokens) across your team and infrastructure. Instead of `.env` files scattered across repos and Slack messages with passwords, Infisical stores secrets encrypted, syncs them to environments, injects them into CI/CD, and rotates them automatically.

## When to Use

- Team sharing secrets via Slack/email (insecure)
- `.env` files in repos or shared drives
- Need secrets in CI/CD without hardcoding
- Rotating API keys and database passwords
- Multi-environment config (dev/staging/prod)
- Compliance requirement for secrets audit trail

## Instructions

### Setup

```bash
# Install CLI
npm install -g @infisical/cli

# Or self-host
docker compose up -d  # From infisical/infisical repo

# Login
infisical login
```

### Store and Retrieve Secrets

```bash
# Initialize in your project
infisical init

# Push secrets from .env file
infisical secrets set DATABASE_URL="postgresql://..." API_KEY="sk-..."

# List secrets
infisical secrets list --env=dev

# Run your app with injected secrets
infisical run -- npm start
# ^ Injects all secrets as environment variables

# Run with specific environment
infisical run --env=production -- node server.js
```

### SDK Usage

```typescript
// config.ts — Fetch secrets programmatically
import { InfisicalClient } from "@infisical/sdk";

const infisical = new InfisicalClient({
  clientId: process.env.INFISICAL_CLIENT_ID,
  clientSecret: process.env.INFISICAL_CLIENT_SECRET,
  siteUrl: "https://infisical.mycompany.com", // Self-hosted URL
});

// Get all secrets for an environment
const secrets = await infisical.listSecrets({
  environment: "production",
  projectId: "proj_xxx",
  path: "/",
});

// Get a specific secret
const dbUrl = await infisical.getSecret({
  environment: "production",
  projectId: "proj_xxx",
  secretName: "DATABASE_URL",
});

console.log(dbUrl.secretValue);
```

### CI/CD Integration

```yaml
# .github/workflows/deploy.yml — Inject secrets in GitHub Actions
name: Deploy
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Infisical/secrets-action@v1
        with:
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          project-id: proj_xxx
          env-slug: production

      # All secrets are now environment variables
      - run: npm run deploy
```

### Kubernetes Integration

```yaml
# infisical-secret.yaml — Sync to Kubernetes secrets
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
spec:
  hostAPI: https://infisical.mycompany.com
  authentication:
    universalAuth:
      credentialsRef:
        secretName: infisical-credentials
        secretNamespace: default
  managedSecretReference:
    secretName: my-app-env          # Created/synced K8s Secret
    secretNamespace: default
    creationPolicy: Owner
  resyncInterval: 60                # Refresh every 60 seconds
```

### Secret Rotation

```bash
# Auto-rotate database credentials
infisical secrets rotation create \
  --provider=postgres \
  --interval=30d \
  --secret-name=DATABASE_URL \
  --env=production
```

## Examples

### Example 1: Replace .env files with centralized secrets

**User prompt:** "Our team shares .env files via Slack. Set up proper secrets management."

The agent will set up Infisical, import existing .env files, configure per-environment secrets, and update the dev workflow to use `infisical run`.

### Example 2: Inject secrets into CI/CD pipeline

**User prompt:** "Our GitHub Actions workflow hardcodes API keys in repository secrets. Centralize them."

The agent will set up Infisical with a machine identity for CI, configure the GitHub Action to inject secrets, and remove hardcoded values.

## Guidelines

- **`infisical run --` replaces .env files** — inject secrets as env vars
- **Per-environment secrets** — dev, staging, production with different values
- **Machine identities for CI** — client ID + secret for non-human access
- **Audit trail** — every secret access is logged
- **Self-hostable** — run on your infrastructure for compliance
- **Kubernetes operator** — auto-sync secrets to K8s
- **Secret rotation** — auto-rotate database passwords, API keys
- **RBAC** — control who can access which environments
- **Version history** — see who changed what and when
- **Point-in-time recovery** — rollback to previous secret values
