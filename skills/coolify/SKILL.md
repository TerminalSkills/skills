---
name: coolify
description: >-
  Deploy and manage applications, databases, and services on Coolify. Use when
  a user asks to deploy an app to Coolify, manage Coolify deployments, check
  deployment logs, sync environment variables, create or manage databases on
  Coolify, trigger a deployment, manage Coolify servers, or troubleshoot Coolify
  issues. Covers the Coolify CLI and REST API. For infrastructure provisioning
  on Hetzner, see hetzner-cloud.
license: Apache-2.0
compatibility: "Requires the Coolify CLI (coolify, install with Homebrew or go install) or curl for the REST API, plus an API token from a Coolify v4 instance"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/coollabsio/coolify-cli
  tags: ["coolify", "paas", "deployment", "self-hosting", "docker"]
evals:
  - name: deploy-nextjs-with-env-sync
    prompt: |
      Deploy my Next.js app to my Coolify instance. The app UUID is
      abc123-def456. Before deploying, sync the production env vars from my
      local .env.production file. Then trigger the deploy and tell me how
      to monitor the logs.
    rubric: |
      Score 0-100 by points achieved:
      - Uses `coolify app env sync abc123-def456 --file .env.production`: 30pts
      - Notes the sync is non-destructive (keeps unlisted vars intact): 10pts
      - Uses `coolify deploy uuid abc123-def456`: 30pts
      - Monitors with `coolify app deployments logs abc123-def456` (app UUID first, optional deployment UUID second) and may use --follow: 20pts
      - Does NOT recommend scp/SSH or manual file copy of the .env: 10pts
  - name: debug-failed-deployment
    prompt: |
      My deployment to Coolify just failed. The app UUID is abc123-def456 and
      the deployment UUID is dep-789xyz. Help me figure out what went wrong.
    rubric: |
      Score 0-100 by points achieved:
      - First step is `coolify app deployments logs abc123-def456 dep-789xyz` (not SSH): 35pts
      - Distinguishes build-time vs runtime errors: 15pts
      - Suggests `coolify deploy cancel dep-789xyz` if the deploy is stuck or queued: 15pts
      - Mentions checking env vars and their build-time/runtime flags when config is missing: 15pts
      - Does NOT recommend SSH-into-server as the first action: 20pts
  - name: postgres-with-nightly-backups
    prompt: |
      Create a PostgreSQL database on my Coolify server (server UUID
      srv-abc123, project UUID prj-456, environment production) called
      "analytics" with automated nightly backups to S3.
    rubric: |
      Score 0-100 by points achieved:
      - Uses `coolify database create postgresql --name analytics --server-uuid srv-abc123 --project-uuid prj-456 --environment-name production`: 30pts
      - Uses `coolify database backup create db-xyz789 --frequency "0 2 * * *"`: 25pts
      - Includes `--save-s3 --s3-storage-uuid u5ualfp30j27qtfpgcen8p03`: 25pts
      - Notes the S3 storage must be configured in the Coolify dashboard first: 10pts
      - Does NOT suggest pg_dump-via-cron on the host: 10pts
  - name: github-actions-deploy-webhook
    prompt: |
      Set up GitHub Actions to deploy my Coolify app whenever I push to main.
      My Coolify URL is https://coolify.acme-ops.net and the app UUID is
      xyz-789. Show me the workflow file.
    rubric: |
      Score 0-100 by points achieved:
      - POSTs to `/api/v1/deploy` with the UUID in the query string (`?uuid=xyz-789`), not a JSON body: 30pts
      - Includes `Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}`: 20pts
      - Keeps the token in GitHub Secrets: 20pts
      - Uses `curl --fail` or checks the response so a rejected deploy fails the job: 15pts
      - Complete workflow with `on.push.branches: [main]`: 15pts
  - name: manage-multiple-coolify-instances
    prompt: |
      I have two Coolify instances, production and staging. How do I switch
      between them with the CLI without re-entering API tokens?
    rubric: |
      Score 0-100 by points achieved:
      - Uses `coolify context add production https://coolify.acme-ops.net $COOLIFY_TOKEN` for both: 30pts
      - Uses `coolify context use my-api` (or `set-default`): 30pts
      - Mentions `coolify context list`, `verify` or the global `--context` flag: 30pts
      - Does NOT recommend env-var swapping or manual config edits: 10pts
---

# Coolify

## Overview

Manage Coolify deployments, applications, databases, and services from the terminal. Supports the Coolify CLI (v1.10 at the time of writing) for day-to-day operations and the REST API for CI/CD integration. Coolify is an open-source self-hostable PaaS that deploys resources as Docker containers on your own servers. Some flags need a recent instance (for example `--docker-tag` needs Coolify 4.0.0-beta.471 or later).

## Instructions

When a user asks for help with Coolify, determine which task they need:

### Task A: Install the CLI and set up a context

```bash
# Install with Homebrew or Go; update later with `coolify update`
brew install coollabsio/coolify-cli/coolify-cli
go install github.com/coollabsio/coolify-cli/coolify@latest

# Add a context (name, URL, API token); -d makes it the default
coolify context add -d production https://coolify.acme-ops.net "$COOLIFY_TOKEN"
coolify context add staging https://staging-coolify.acme-ops.net "$COOLIFY_STAGING_TOKEN"

# List configured contexts
coolify context list

# Switch active context
coolify context use production

# Verify connection
coolify context verify

# One-off command against another context
coolify --context=staging app list
```

On Coolify Cloud use `coolify context set-token cloud "$COOLIFY_TOKEN"` instead of `context add`. Create API tokens in the dashboard under **Keys & Tokens > API tokens** (`/security/api-tokens`). Token permissions: `read`, `read:sensitive` (also returns logs and secrets), `write`, `write:sensitive`, `deploy` (trigger deployments, restarts, stops, cancellations) and `root` (everything). Give CI only `deploy`.

### Task B: Deploy applications

```bash
# Deploy by UUID
coolify deploy uuid u5ualfp30j27qtfpgcen8p03

# Deploy by name; several resources by name; --force rebuilds
coolify deploy name my-api
coolify deploy batch api,worker,frontend --force

# List deployments of an app, then read logs
coolify app deployments list u5ualfp30j27qtfpgcen8p03
coolify app deployments logs u5ualfp30j27qtfpgcen8p03                  # latest deployment
coolify app deployments logs u5ualfp30j27qtfpgcen8p03 dep-789xyz --follow

# All deployments on the instance, details, cancel
coolify deploy list && coolify deploy get dep-789xyz
coolify deploy cancel dep-789xyz
```

**Via API (for CI/CD pipelines):** `POST /api/v1/deploy` takes its parameters in the query string (`uuid` or `tag` but not both, `force`, `pr`, `docker_tag`); the Coolify docs say a JSON body with the same names also works, but the query form is the documented one. `uuid` and `tag` accept comma-separated lists.

```bash
curl --fail-with-body -X POST "https://coolify.acme-ops.net/api/v1/deploy?uuid=u5ualfp30j27qtfpgcen8p03&force=false" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

### Task C: Manage environment variables

```bash
# List env vars for an application
coolify app env list u5ualfp30j27qtfpgcen8p03

# Create a single env var (build-time and runtime both default to true)
coolify app env create u5ualfp30j27qtfpgcen8p03 --key DATABASE_URL --value "$DATABASE_URL"

# Sync from a .env file (creates missing, updates existing, leaves others untouched)
coolify app env sync u5ualfp30j27qtfpgcen8p03 --file .env.production

# Bulk update via API (the array goes inside a "data" object)
curl -X PATCH "https://coolify.acme-ops.net/api/v1/applications/u5ualfp30j27qtfpgcen8p03/envs/bulk" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": [{"key": "NODE_ENV", "value": "production"}, {"key": "PORT", "value": "3000"}]}'
```

### Task D: Manage databases

```bash
# List all databases
coolify database list

# Create a PostgreSQL database
coolify database create postgresql --name my-postgres \
  --server-uuid srv-abc123 --project-uuid prj-456 --environment-name production

# Start/stop/restart a database
coolify database start db-xyz789   # also: stop, restart

# Create a backup configuration
coolify database backup create db-xyz789 --frequency "0 2 * * *" --enabled \
  --save-s3 --s3-storage-uuid s3-backup-config --retention-days-s3 14

# Trigger a backup now, list runs, restore a local dump
coolify database backup trigger db-xyz789 bkp-111222
coolify database backup executions db-xyz789 bkp-111222
coolify database import start db-xyz789 --file ./analytics.dump
```

Supported database types: PostgreSQL, MySQL, MariaDB, MongoDB, Redis, KeyDB, ClickHouse, Dragonfly, SQLite. Project UUIDs come from `coolify project list`, server UUIDs from `coolify server list`.

### Task E: Manage applications and services

```bash
# List all applications
coolify app list

# Get application details
coolify app get u5ualfp30j27qtfpgcen8p03

# Start/stop/restart an application
coolify app start u5ualfp30j27qtfpgcen8p03   # also: stop, restart

# View application logs (-f follows, -n sets lines, --service picks a compose service)
coolify app logs u5ualfp30j27qtfpgcen8p03 -n 200

# List one-click services
coolify service list

# Start/stop a service
coolify service start svc-555aaa && coolify service stop svc-555aaa
```

### Task F: Server and resource management

```bash
# List all servers
coolify server list

# Validate a server (checks SSH, Docker, prerequisites)
coolify server validate srv-abc123

# List all resources across servers
coolify resources list

# Server details, or the resources running on it (JSON for scripting)
coolify server get srv-abc123 --format json
coolify server get srv-abc123 --resources
```

## Examples

### Example 1: Deploy a Next.js app and sync env vars

**User request:** "Deploy my Next.js app to Coolify and sync the production env vars"

**Steps taken:**
```bash
# First, sync env vars from local .env.production
coolify app env sync abc123-def456 --file .env.production

# Trigger deployment; the output names the new deployment UUID
coolify deploy uuid abc123-def456

# Follow the latest deployment's log until it ends
coolify app deployments logs abc123-def456 --follow
```

The log shows the build (Nixpacks or Dockerfile steps), then the container start and health check. Exact lines depend on the build pack and Coolify version.

### Example 2: Set up a PostgreSQL database with automated backups

**User request:** "Create a PostgreSQL database on Coolify with nightly backups"

**Steps taken:**
```bash
# Create the database
coolify database create postgresql --name analytics-db \
  --server-uuid srv-abc123 --project-uuid prj-456 --environment-name production --instant-deploy

# Backup schedule (daily at 2 AM) uploading to a preconfigured S3 storage
coolify database backup create db-xyz789 --frequency "0 2 * * *" --enabled \
  --save-s3 --s3-storage-uuid s3-backup-config

# Verify the database is running and the schedule exists
coolify database list
coolify database backup list db-xyz789
```

### Example 3: CI/CD deployment from GitHub Actions

**User request:** "Set up automatic deployment from GitHub Actions"

**GitHub Actions workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Coolify
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deployment
        run: |
          curl --fail-with-body -X POST \
            "${{ secrets.COOLIFY_URL }}/api/v1/deploy?uuid=${{ secrets.COOLIFY_APP_UUID }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

The request only queues the deployment and returns its UUID; poll `GET /api/v1/deployments/dep-789xyz` if the job must wait for the result.

## Guidelines

- Store your Coolify API token securely. Never commit it to version control. Use `COOLIFY_TOKEN` as an environment variable in CI/CD.
- Use `coolify context` to manage multiple Coolify instances (production, staging). Avoid hardcoding URLs.
- The `coolify app env sync` command is non-destructive — it won't remove env vars not in your file. Use this for safe syncing.
- Deployments can sit queued behind other builds on the same server; check `coolify deploy list` before assuming a failure.
- For failed deployments, check `coolify app deployments logs u5ualfp30j27qtfpgcen8p03 [deployment-uuid]` first; without the second argument you get the latest deployment.
- S3 backups need an S3-compatible storage target created in the Coolify dashboard first (AWS S3, MinIO, Backblaze B2, etc.); local backups work without one.
- Use `--format json` (or `pretty`) for scripting. Secrets and IPs are hidden unless you pass `-s`.
- `coolify database delete` removes volumes by default; confirm the UUID first.
- For detailed API endpoint reference, see [references/api-reference.md](references/api-reference.md).
