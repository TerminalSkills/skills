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
compatibility: "Requires Coolify CLI (coolify) or curl for API access. Install CLI: curl -fsSL https://raw.githubusercontent.com/coollabsio/coolify-cli/main/scripts/install.sh | bash"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
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
      - Uses `coolify app env sync abc123-def456 --file .env.production` (or equivalent --file flag): 30pts
      - Notes the sync is non-destructive (keeps unlisted vars intact): 10pts
      - Uses `coolify deploy uuid abc123-def456` (not dashboard UI, not `coolify deploy app`): 30pts
      - Mentions `coolify app deployments logs <deployment-uuid>` for monitoring: 20pts
      - Does NOT recommend scp/SSH or manual file copy of the .env: 10pts
  - name: debug-failed-deployment
    prompt: |
      My deployment to Coolify just failed. The deployment UUID is dep-789xyz.
      Help me figure out what went wrong and how to fix it.
    rubric: |
      Score 0-100 by points achieved:
      - First diagnostic step is `coolify app deployments logs dep-789xyz` (NOT SSH-into-server): 35pts
      - Distinguishes build-time vs runtime errors when interpreting logs: 15pts
      - Suggests `coolify deploy cancel <uuid>` if the deploy is stuck/queued: 15pts
      - Mentions checking env vars / config if logs show missing-config errors: 15pts
      - Does NOT recommend SSH-into-server as the first or primary action: 20pts
  - name: postgres-with-nightly-backups
    prompt: |
      Create a PostgreSQL database on my Coolify server (server UUID
      srv-abc123) called "analytics" with automated nightly backups to S3.
    rubric: |
      Score 0-100 by points achieved:
      - Uses `coolify database create postgresql --name analytics --server srv-abc123`: 30pts
      - Uses `coolify database backup create <db-uuid> --frequency` with cron syntax for nightly (e.g. "0 2 * * *"): 30pts
      - Includes `--s3 <s3-config-uuid>` flag (or notes an S3 storage target is required): 20pts
      - Notes the S3 storage target must be pre-configured in the Coolify dashboard before creating the backup: 10pts
      - Does NOT suggest pg_dump-via-cron on the host or manual backup scripts: 10pts
  - name: github-actions-deploy-webhook
    prompt: |
      Set up GitHub Actions to automatically deploy my Coolify app whenever I
      push to the main branch. My Coolify URL is https://coolify.example.com
      and the app UUID is xyz-789. Show me the workflow file.
    rubric: |
      Score 0-100 by points achieved:
      - Uses the `/api/v1/deploy` endpoint (NOT a custom webhook URL or dashboard URL): 25pts
      - POSTs JSON body `{"uuid": "xyz-789"}` (correct payload shape): 20pts
      - Includes `Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}` header: 20pts
      - Stores COOLIFY_TOKEN (and any other sensitive values) in GitHub Secrets, not hardcoded: 20pts
      - Provides a complete, working `.github/workflows/deploy.yml` example with `on.push.branches: [main]`: 15pts
  - name: manage-multiple-coolify-instances
    prompt: |
      I have two Coolify instances — one for production and one for staging.
      How do I switch between them with the CLI without re-entering API tokens
      every time?
    rubric: |
      Score 0-100 by points achieved:
      - Uses `coolify context add <name> <url> <token>` to register both instances: 30pts
      - Uses `coolify context use <name>` to switch the active context: 30pts
      - Mentions `coolify context list` to see configured contexts: 15pts
      - Mentions `coolify context verify` to test the connection after switching: 15pts
      - Does NOT recommend manual env-var swapping, .coolifyrc edits, or re-running setup: 10pts
---

# Coolify

## Overview

Manage Coolify deployments, applications, databases, and services from the terminal. Supports the Coolify CLI for day-to-day operations and the REST API for CI/CD integration. Coolify is an open-source self-hostable PaaS that deploys resources as Docker containers on your own servers.

## Instructions

When a user asks for help with Coolify, determine which task they need:

### Task A: Set up CLI context

Connect the CLI to a Coolify instance:

```bash
# Add a context (name, URL, API token)
coolify context add production https://coolify.example.com <api-token>

# List configured contexts
coolify context list

# Switch active context
coolify context use production

# Verify connection
coolify context verify
```

API tokens are created in the Coolify dashboard under **Keys & Tokens > API tokens**. Permission levels:
- `read-only` — view resources, no sensitive data
- `read:sensitive` — view resources including secrets
- `*` — full access (needed for deploys and mutations)

### Task B: Deploy applications

```bash
# Deploy by UUID
coolify deploy uuid <app-uuid>

# Deploy by name
coolify deploy name my-api

# Deploy multiple resources at once
coolify deploy batch app1-uuid,app2-uuid,db-uuid

# List recent deployments
coolify app deployments list <app-uuid>

# View deployment logs
coolify app deployments logs <deployment-uuid>

# Cancel a running deployment
coolify deploy cancel <deployment-uuid>
```

**Via API (for CI/CD pipelines):**

```bash
curl -X POST "https://coolify.example.com/api/v1/deploy" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "app-uuid-here"}'
```

### Task C: Manage environment variables

```bash
# List env vars for an application
coolify app env list <app-uuid>

# Create a single env var
coolify app env create <app-uuid> --key DATABASE_URL --value "postgres://user:pass@db:5432/myapp"

# Sync from a .env file (creates missing, updates existing, leaves others untouched)
coolify app env sync <app-uuid> --file .env.production

# Bulk update via API
curl -X PATCH "https://coolify.example.com/api/v1/applications/<uuid>/envs/bulk" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"key": "NODE_ENV", "value": "production"}, {"key": "PORT", "value": "3000"}]'
```

### Task D: Manage databases

```bash
# List all databases
coolify database list

# Create a PostgreSQL database
coolify database create postgresql --name my-postgres --server <server-uuid>

# Start/stop/restart a database
coolify database start <db-uuid>
coolify database stop <db-uuid>
coolify database restart <db-uuid>

# Create a backup configuration
coolify database backup create <db-uuid> --frequency "0 2 * * *" --s3 <s3-uuid>

# Trigger a backup immediately
coolify database backup trigger <backup-uuid>
```

Supported database types: PostgreSQL, MySQL, MariaDB, MongoDB, Redis, ClickHouse, Dragonfly, KeyDB.

### Task E: Manage applications and services

```bash
# List all applications
coolify app list

# Get application details
coolify app get <app-uuid>

# Start/stop/restart an application
coolify app start <app-uuid>
coolify app stop <app-uuid>
coolify app restart <app-uuid>

# View application logs
coolify app logs <app-uuid>

# List one-click services
coolify service list

# Start/stop a service
coolify service start <service-uuid>
coolify service stop <service-uuid>
```

### Task F: Server and resource management

```bash
# List all servers
coolify server list

# Validate a server (checks SSH, Docker, prerequisites)
coolify server validate <server-uuid>

# List all resources across servers
coolify resources list

# Get server details (JSON output for scripting)
coolify server get <server-uuid> --format json
```

## Examples

### Example 1: Deploy a Next.js app and sync env vars

**User request:** "Deploy my Next.js app to Coolify and sync the production env vars"

**Steps taken:**
```bash
# First, sync env vars from local .env.production
$ coolify app env sync abc123-def456 --file .env.production
Synced 12 environment variables (3 created, 9 updated)

# Trigger deployment
$ coolify deploy uuid abc123-def456
Deployment queued: dep-789xyz

# Monitor deployment
$ coolify app deployments logs dep-789xyz
[2024-01-15 10:23:01] Building with Nixpacks...
[2024-01-15 10:23:45] Build completed successfully
[2024-01-15 10:23:50] Deploying container...
[2024-01-15 10:24:02] Health check passed
[2024-01-15 10:24:03] Deployment successful
```

### Example 2: Set up a PostgreSQL database with automated backups

**User request:** "Create a PostgreSQL database on Coolify with nightly backups"

**Steps taken:**
```bash
# Create the database
$ coolify database create postgresql --name analytics-db --server srv-abc123
Created database: db-xyz789 (PostgreSQL 16)

# Create backup schedule (daily at 2 AM)
$ coolify database backup create db-xyz789 --frequency "0 2 * * *" --s3 s3-backup-config
Backup schedule created: backup-111222

# Verify it's running
$ coolify database list
UUID          NAME           TYPE         STATUS
db-xyz789     analytics-db   postgresql   running
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
          curl -X POST "${{ secrets.COOLIFY_URL }}/api/v1/deploy" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"uuid": "${{ secrets.COOLIFY_APP_UUID }}"}'
```

## Guidelines

- Store your Coolify API token securely. Never commit it to version control. Use `COOLIFY_TOKEN` as an environment variable in CI/CD.
- Use `coolify context` to manage multiple Coolify instances (production, staging). Avoid hardcoding URLs.
- The `coolify app env sync` command is non-destructive — it won't remove env vars not in your file. Use this for safe syncing.
- Deployments are queued and processed sequentially per server. Check the queue if deploys seem delayed.
- For troubleshooting failed deployments, always check `coolify app deployments logs <deployment-uuid>` first.
- Database backups require an S3-compatible storage target configured in Coolify (AWS S3, MinIO, Backblaze B2, etc.).
- Use `--format json` with any CLI command to get machine-readable output for scripting.
- For detailed API endpoint reference, see [references/api-reference.md](references/api-reference.md).
