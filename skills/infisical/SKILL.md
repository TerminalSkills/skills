---
name: infisical
description: >-
  Infisical is an open-source secrets management platform that stores API
  keys, database URLs and other secrets centrally and delivers them to apps,
  CI/CD pipelines and Kubernetes. Use when someone asks to "manage secrets",
  "Infisical", "centralize environment variables", "secrets manager",
  "replace .env files", "rotate API keys", "scan for leaked secrets", or
  "sync secrets to CI/CD".
license: Apache-2.0
compatibility: "Any language/platform. CLI, SDKs, Docker, Kubernetes. Self-hostable."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["secrets", "security", "infisical", "env-vars", "configuration"]
  repository: https://github.com/Infisical/infisical
---

# Infisical

## Overview

Infisical is an open-source secrets management platform — a centralized place to store, sync, and rotate secrets (API keys, database URLs, tokens) across your team and infrastructure. Instead of `.env` files scattered across repos and Slack messages with passwords, Infisical stores secrets encrypted, syncs them to environments, injects them into CI/CD, and rotates them automatically.

Secrets live in a **project**, split by **environment** (`dev`, `staging`, `prod`) and **folder path** (`/`, `/backend`). People sign in with their account; pipelines and servers authenticate as a **machine identity**. Use Infisical Cloud (`https://app.infisical.com`, EU: `https://eu.infisical.com`) or self-host it.

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
# Install the CLI (pick one)
brew install infisical/get-cli/infisical      # macOS
winget install infisical                      # Windows
npm install -g @infisical/cli                 # any platform with Node.js
infisical --version

# Log in with your own account (opens the browser; -i for a terminal-only login)
infisical login

# Link the current directory to a project; writes .infisical.json (safe to commit)
infisical init
```

For EU Cloud or a self-hosted instance, set `INFISICAL_DOMAIN` (or pass `--domain`) before running other commands, for example `export INFISICAL_DOMAIN="https://secrets.harborline.dev"`.

### Store and Retrieve Secrets

```bash
# Import an existing .env file into the dev environment
infisical secrets set --file=.env --env=dev

# Set individual secrets (values come from the shell, not from the script); the folder must exist first
infisical secrets folders create --name=backend --env=prod
infisical secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" --env=prod --path=/backend

# List secrets, read one value
infisical secrets --env=dev
infisical secrets get DATABASE_URL --env=dev --plain

# Run your app with injected secrets
infisical run -- npm start
# ^ Injects all secrets of the dev environment as environment variables

# Run with a specific environment; restart when a secret changes
infisical run --env=prod --watch -- node server.js

# Write a file for tools that cannot take environment variables
infisical export --env=prod --format=dotenv --output-file=.env.production
```

`--env` defaults to `dev`; set `defaultEnvironment` or `gitBranchToEnvironmentMapping` in `.infisical.json` to change that per directory.

### Machine Identities (CI, servers, containers)

Create a machine identity in the dashboard, add it to the project with a read role, and create a Universal Auth client secret. The CLI exchanges the pair for a short-lived token:

```bash
export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --silent --plain)

# A machine identity does not read .infisical.json: pass the project explicitly
infisical run --projectId="$INFISICAL_PROJECT_ID" --env=prod -- node server.js
```

### SDK Usage

```typescript
// config.ts — Fetch secrets programmatically (npm install @infisical/sdk, Node.js 20+)
import { InfisicalSDK } from "@infisical/sdk";

const client = new InfisicalSDK({
  siteUrl: "https://secrets.harborline.dev", // omit for Infisical Cloud US
});

// Machine identity (Universal Auth); the access token is kept on the client
await client.auth().universalAuth.login({
  clientId: process.env.INFISICAL_CLIENT_ID!,
  clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
});

// All secrets of one environment and folder
const { secrets } = await client.secrets().listSecrets({
  environment: "prod",
  projectId: process.env.INFISICAL_PROJECT_ID!,
  secretPath: "/",
});

// One secret by name
const dbUrl = await client.secrets().getSecret({
  environment: "prod",
  projectId: process.env.INFISICAL_PROJECT_ID!,
  secretName: "DATABASE_URL",
});

console.log(secrets.length, dbUrl.secretKey); // never log secretValue
```

The older `InfisicalClient` class is gone; SDK versions before 4.0.0 are unsupported. Official SDKs also exist for Python, Go, Java, .NET, Ruby, PHP, Rust and C++.

### CI/CD Integration

```yaml
# .github/workflows/deploy.yml — Inject secrets in GitHub Actions
name: Deploy
on: push

permissions:
  id-token: write   # lets GitHub issue the OIDC token Infisical verifies
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Infisical/secrets-action@v1.0.18
        with:
          method: "oidc"
          identity-id: "7c2f6f4e-1d0b-4a53-9a51-5f0c2e8f3b9d"   # machine identity ID, not a secret
          project-slug: "orders-service-k3vd"
          env-slug: "prod"
          # domain: "https://secrets.harborline.dev"   # EU Cloud or self-hosted

      # All secrets are now masked environment variables for later steps
      - run: npm run deploy
```

OIDC stores no Infisical credential in GitHub: add an OIDC Auth method to the identity (issuer `https://token.actions.githubusercontent.com`, subject such as `repo:harborline/orders-service:ref:refs/heads/main`; repositories created after 2026-07-15 use the immutable form with numeric owner and repository IDs, `repo:harborline@48213907/orders-service@912847365:ref:refs/heads/main`). Where OIDC is not possible, drop `method` and `identity-id` and pass `client-id` and `client-secret` from GitHub Secrets. `secret-path`, `recursive` and `export-type: file` narrow or redirect what is fetched.

### Kubernetes Integration

```bash
helm repo add infisical-helm-charts 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
helm repo update
helm install --generate-name infisical-helm-charts/secrets-operator
```

```yaml
# infisical-secret.yaml — Sync to a Kubernetes Secret (v1beta1 CRDs)
apiVersion: secrets.infisical.com/v1beta1
kind: InfisicalConnection
metadata: { name: infisical-connection, namespace: default }
spec:
  address: https://secrets.harborline.dev
---
apiVersion: secrets.infisical.com/v1beta1
kind: InfisicalAuth
metadata: { name: infisical-auth, namespace: default }
spec:
  infisicalConnectionRef: { name: infisical-connection, namespace: default }
  method: universal
  universal:
    clientIdRef: { name: universal-auth-credentials, namespace: default, key: clientId }
    clientSecretRef: { name: universal-auth-credentials, namespace: default, key: clientSecret }
---
apiVersion: secrets.infisical.com/v1beta1
kind: InfisicalStaticSecret
metadata: { name: orders-service-secrets, namespace: default }
spec:
  infisicalAuthRef: { name: infisical-auth, namespace: default }
  syncOptions:
    refreshInterval: 60s
  sources:
    - projectId: 6f1c2b7e-93a4-4d0e-8a61-2b9d5e7c4f10
      environmentSlug: prod
      secretPath: /
  targets:
    - name: orders-service-env        # Created/synced K8s Secret
      namespace: default
      kind: Secret
      creationPolicy: Owner
```

Create the `universal-auth-credentials` Secret (keys `clientId`, `clientSecret`) first. `method: kubernetes` with a service account avoids a stored client secret. The `v1alpha1` `InfisicalSecret` CRD still works but is legacy.

### Secret Rotation

Rotation is configured in the dashboard or the API, not the CLI: open the project, choose **Add Secret Rotation**, pick a provider (PostgreSQL, MySQL, MongoDB, AWS IAM, Stripe and others), an app connection and an interval in days. Database rotations alternate between two dedicated users so the previous credentials stay valid for one more interval — applications must re-read the secret at least once per interval.

### Self-Hosting

```bash
git clone --depth 1 https://github.com/Infisical/infisical.git && cd infisical
cp .env.example .env && chmod 600 .env
# Replace the sample keys in .env before the first start:
#   ENCRYPTION_KEY = output of: openssl rand -hex 16
#   AUTH_SECRET    = output of: openssl rand -base64 32
docker compose -f docker-compose.prod.yml up -d      # UI on http://localhost:80
```

## Examples

### Example 1: Replace .env files with centralized secrets

**User prompt:** "Our team shares .env files via Slack. Set up proper secrets management for the orders-service repo."

```bash
cd orders-service
infisical login
infisical init                                   # choose the "orders-service" project
infisical secrets set --file=.env --env=dev
infisical secrets set --file=.env.production --env=prod
infisical secrets --env=dev                      # verify the import
echo ".env*" >> .gitignore && git rm --cached --ignore-unmatch .env .env.production
```

Then change the scripts in `package.json` so nobody needs a local file:

```json
{
  "scripts": {
    "dev": "infisical run --env=dev -- next dev",
    "start": "infisical run --env=prod -- node server.js"
  }
}
```

`infisical init` writes `.infisical.json` (`{"workspaceId": "6f1c2b7e-…", "defaultEnvironment": "", "gitBranchToEnvironmentMapping": null}`), which is committed. `infisical secrets --env=dev` prints a table of secret names and values, and `npm run dev` starts the app with `DATABASE_URL`, `STRIPE_SECRET_KEY` and the rest in its environment. Rotate every value that was ever posted in Slack.

### Example 2: Block leaked secrets before they reach the repository

**User prompt:** "Check whether this repo has secrets committed, and fail CI if anyone adds one."

```bash
infisical scan --redact -v                       # full git history
infisical scan git-changes --staged              # only what is about to be committed
infisical scan --no-git --source . --report-path scan-report.json
infisical scan install --pre-commit-hook         # scan staged changes on every commit
```

A scan of a folder containing a Stripe key in `.env.production` ends with:

```
INF scanning for exposed secrets...
INF scan completed in 8.97ms
WRN leaks found: 1
```

The command exits 1 when leaks are found, which fails a CI step, and `scan-report.json` lists each finding with `RuleID` (`stripe-access-token`), `File` and `StartLine`. The report holds the matched secret in clear text even with `--redact`, so do not upload it as a public artifact.

## Guidelines

- **`infisical run --` replaces .env files** — inject secrets as env vars
- **Per-environment secrets** — dev, staging, production with different values
- **Machine identities for CI** — prefer OIDC or Kubernetes auth; a Universal Auth client secret is itself a secret to store and rotate
- **Pin the GitHub Action to a release tag** — `Infisical/secrets-action` has no floating `v1` tag
- **Never pass secret values as literals** in scripts or shell history; `--plain` and `export` output are unmasked, so keep them out of CI logs
- **`.infisical.json` holds no secrets**, but a `domain` field in it decides where the CLI sends credentials — review changes to it
- **Self-hosting** — the stock `.env.example` ships sample keys; replace them, back up `ENCRYPTION_KEY` (without it a restored database cannot be decrypted), and pin the image tag instead of `latest`
- **Linux packages** — the apt/yum repository moved to `artifacts-cli.infisical.com`; Cloudsmith stopped serving the CLI on 2026-09-16
- **Audit trail and RBAC** — every secret access is logged; roles can be scoped per environment and folder
- **Version history** — every change to a secret is versioned; point-in-time recovery is a paid feature (Pro tier on Cloud, enterprise license when self-hosted)
