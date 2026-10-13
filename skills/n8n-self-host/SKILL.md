---
name: n8n-self-host
description: >-
  Self-host, configure, scale, and manage n8n instances. Use when a user asks
  to install n8n with Docker, set up n8n in production, configure n8n
  environment variables, scale n8n with workers, back up n8n workflows, restore
  n8n data, manage n8n via CLI or REST API, monitor n8n, troubleshoot n8n
  issues, set up n8n with PostgreSQL, or deploy n8n with a reverse proxy.
  For designing n8n workflows and nodes, see n8n-workflow.
license: Apache-2.0
compatibility: "Requires Docker with Compose v2 (or Node.js for an npm install); n8n 2.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/n8n-io/n8n
  tags: ["n8n", "self-hosting", "docker", "postgresql", "infrastructure"]
---

# n8n Self-Host

## Overview

Install, configure, scale, and operate self-hosted n8n instances. Targets n8n 2.x (stable 2.43 at the time of writing; 2.0 replaced "activate" with publish/unpublish and made task runners the default). Covers Docker Compose production setups, CLI administration, REST API automation, queue-mode scaling with Redis workers, backup/restore, monitoring, and troubleshooting. For building n8n workflows and configuring nodes, see the `n8n-workflow` skill.

## Instructions

### Task A: Production Docker Compose Setup

Basic setup with PostgreSQL (recommended over default SQLite):

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - db_storage:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h localhost -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 5s
      timeout: 5s
      retries: 10

  n8n:
    image: docker.n8n.io/n8nio/n8n:${N8N_VERSION}
    restart: always
    ports:
      - "5678:5678"
    environment:
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB}
      - DB_POSTGRESDB_USER=${POSTGRES_USER}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
      - GENERIC_TIMEZONE=${GENERIC_TIMEZONE:-UTC}
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_PROXY_HOPS=1            # one reverse proxy in front
      - N8N_RUNNERS_MODE=external   # Code nodes run in the sidecar below
      - N8N_RUNNERS_BROKER_LISTEN_ADDRESS=0.0.0.0
      - N8N_RUNNERS_AUTH_TOKEN=${RUNNERS_AUTH_TOKEN}
    volumes:
      - n8n_storage:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

  task-runners:
    image: n8nio/runners:${N8N_VERSION}   # must match the n8n image version
    restart: always
    environment:
      - N8N_RUNNERS_TASK_BROKER_URI=http://n8n:5679
      - N8N_RUNNERS_AUTH_TOKEN=${RUNNERS_AUTH_TOKEN}
    depends_on:
      - n8n

volumes:
  db_storage:
  n8n_storage:
```

Create a `.env` alongside with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `ENCRYPTION_KEY` (generate with `openssl rand -hex 24`), `RUNNERS_AUTH_TOKEN` (same way), `N8N_VERSION` (pin the current stable, e.g. `2.43.4`, from the n8n releases page), `WEBHOOK_URL`, and `GENERIC_TIMEZONE`. Start with `docker compose up -d`.

Task runners isolate Code-node JavaScript and Python from n8n itself. Internal mode (the default child process) shares n8n's user and is deprecated; in production use external mode with the `n8nio/runners` sidecar as above. `N8N_RUNNERS_ENABLED` is deprecated since 2.0 and not needed. From n8n 2.30 `N8N_WEBHOOK_URL` is the preferred name of `WEBHOOK_URL`.

### Task B: Scale with Queue Mode (Redis + Workers)

For high-volume workloads, add Redis and worker processes:

```yaml
# Add to docker-compose.yml
x-n8n-shared: &n8n-shared
  image: docker.n8n.io/n8nio/n8n:${N8N_VERSION}
  restart: always
  environment:
    - DB_TYPE=postgresdb
    - DB_POSTGRESDB_HOST=postgres
    - DB_POSTGRESDB_DATABASE=${POSTGRES_DB}
    - DB_POSTGRESDB_USER=${POSTGRES_USER}
    - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
    - EXECUTIONS_MODE=queue
    - QUEUE_BULL_REDIS_HOST=redis
    - QUEUE_HEALTH_CHECK_ACTIVE=true
    - N8N_ENCRYPTION_KEY=${ENCRYPTION_KEY}
  volumes:
    - n8n_storage:/home/node/.n8n
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy

services:
  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_storage:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s

  n8n:
    <<: *n8n-shared
    ports:
      - "5678:5678"

  n8n-worker:
    <<: *n8n-shared
    command: worker
    # Scale with: docker compose up -d --scale n8n-worker=3
```

Each worker needs its own task-runner sidecar in external mode. Health endpoints on workers (`/healthz`, `/healthz/readiness`) exist only with `QUEUE_HEALTH_CHECK_ACTIVE=true`. Queue mode needs PostgreSQL; SQLite is not supported with workers. Optional webhook processors (`command: webhook`) scale incoming webhooks: route `/webhook/*` and `/webhook-waiting/*` to them and keep `/webhook-test/*` and the editor on the main instance.

### Task C: CLI Administration

Run CLI commands inside Docker: `docker exec -u node -it n8n n8n <command>`.

```bash
# Export/import workflows (use a separate directory per entity type)
n8n export:workflow --backup --output=backups/workflows/
n8n export:workflow --id=Hk3p9WqLm2xYtRvB --published --output=workflow.json   # published version
n8n import:workflow --input=workflow.json
n8n import:workflow --separate --input=backups/workflows/   # imported workflows come in unpublished

# Export/import credentials (--decrypted for cross-instance migration)
n8n export:credentials --backup --output=backups/credentials/
n8n export:credentials --all --decrypted --output=creds.json
n8n import:credentials --separate --input=backups/credentials/

# Full database backup/restore
n8n export:entities --outputDir=./backup --includeExecutionHistoryDataTables=true
n8n import:entities --inputDir=./backup --truncateTables=true

n8n execute --id=Hk3p9WqLm2xYtRvB   # run a saved workflow

# Publish/unpublish workflows (2.0+; update:workflow --active is deprecated).
# These edit the database: restart n8n for them to take effect.
n8n publish:workflow --id=Hk3p9WqLm2xYtRvB
n8n unpublish:workflow --id=Hk3p9WqLm2xYtRvB
n8n unpublish:workflow --all     # publish has no --all, by design

# User management
n8n user-management:reset          # Reset to setup state (forgot password)
n8n mfa:disable --email=user@x.com # Disable MFA for locked-out user

n8n audit               # security audit

```

`--backup` exports only workflows and credentials, not users, variables, execution history or the encryption key. A complete backup also needs the `.n8n` folder (it holds the key) and a PostgreSQL dump. `--activeState=fromJson` on import restores published state, but only in queue or multi-main mode.

### Task D: REST API Automation

Create an API key in the n8n settings and send it in the `X-N8N-API-KEY` header. The self-hosted playground is at `/api/v1/docs`; the base path is `/api/v1`.

```bash
# List all workflows
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" http://localhost:5678/api/v1/workflows | jq '.data[].name'

# Publish a workflow (replaces /activate, deprecated)
curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" http://localhost:5678/api/v1/workflows/Hk3p9WqLm2xYtRvB/publish

# Unpublish a workflow (replaces /deactivate, deprecated)
curl -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" http://localhost:5678/api/v1/workflows/Hk3p9WqLm2xYtRvB/unpublish

# List failed executions
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "http://localhost:5678/api/v1/executions?status=error" | jq '.data[] | {id, workflowId, status}'
```

Lists are paginated: pass the `nextCursor` value back as `cursor` (`limit` max 250).

### Task E: Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_TYPE` | `sqlite` | `sqlite` or `postgresdb` |
| `N8N_ENCRYPTION_KEY` | random | Credential encryption (preserve across restarts) |
| `WEBHOOK_URL` | auto | Public URL for webhooks behind reverse proxy |
| `EXECUTIONS_MODE` | `regular` | `regular` or `queue` (for scaling) |
| `EXECUTIONS_DATA_PRUNE` | `true` | Auto-prune old execution data |
| `N8N_METRICS` | `false` | Enable Prometheus `/metrics` endpoint |
| `N8N_RUNNERS_MODE` | `internal` | `external` runs Code nodes in the `n8nio/runners` sidecar (recommended in production) |
| `GENERIC_TIMEZONE` | `America/New_York` | Timezone for schedule triggers |

Use `_FILE` suffix for Docker Secrets (e.g., `DB_POSTGRESDB_PASSWORD_FILE=/run/secrets/db_pass`).

## Examples

### Example 1: Deploy n8n with PostgreSQL in production

**User request:** "Set up n8n in production with Docker Compose"

**Actions taken:**

```bash
$ mkdir n8n-production && cd n8n-production
$ openssl rand -hex 24   # use for ENCRYPTION_KEY and RUNNERS_AUTH_TOKEN
> 9f2c61b7d0e84a35c1f7a3e92b64d85077ac13e6f2b9d4c8

# Create .env with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, ENCRYPTION_KEY,
# RUNNERS_AUTH_TOKEN, N8N_VERSION=2.43.4, WEBHOOK_URL, GENERIC_TIMEZONE

# Create docker-compose.yml (Task A template)

$ docker compose up -d
> [+] Running 4/4
>  ✔ Network n8n-production_default       Created
>  ✔ Container n8n-production-postgres-1  Healthy
>  ✔ Container n8n-production-n8n-1       Started
>  ✔ Container n8n-production-task-runners-1  Started

$ docker compose logs n8n --tail 5
> n8n  | Editor is now accessible via: http://localhost:5678
```

### Example 2: Back up and restore workflows

**User request:** "Back up all my n8n workflows and credentials"

**Actions taken:**

```bash
$ docker exec -u node n8n n8n export:workflow --backup --output=/home/node/.n8n/backups/workflows/
> Successfully exported 12 workflows
$ docker exec -u node n8n n8n export:credentials --backup --output=/home/node/.n8n/backups/credentials/
> Successfully exported 8 credentials

$ docker cp n8n:/home/node/.n8n/backups/ ./n8n-backups/

# Restore on a new instance (finish the owner setup in the UI first)
$ docker cp ./n8n-backups/ n8n-new:/home/node/.n8n/backups/
$ docker exec -u node n8n-new n8n import:workflow --separate --input=/home/node/.n8n/backups/workflows/
> Successfully imported 12 workflows
$ docker exec -u node n8n-new n8n import:credentials --separate --input=/home/node/.n8n/backups/credentials/
```

The new instance needs the same `N8N_ENCRYPTION_KEY`, or export credentials with `--decrypted` and delete that file after the import. Imported workflows arrive unpublished; publish them in the UI.

### Example 3: Recover from a failed update

**User request:** "My n8n instance is crashing after update"

**Actions taken:**

```bash
$ docker compose logs n8n --tail 30
> Error: Migration "AddWorkflowVersioning" failed ...

# Roll back: stop, pin the previous image tag in .env (N8N_VERSION=2.42.0),
# restore the PostgreSQL dump and the .n8n volume taken before the update
$ docker compose down
$ pg_restore --clean -d n8n backups/n8n-before-update.dump   # run against the postgres container
$ docker compose up -d
> n8n  | Editor is now accessible via: http://localhost:5678
```

Pinning an older image does not undo database migrations, so take a database dump and a copy of the `.n8n` volume before every upgrade.

## Guidelines

- Always set `N8N_ENCRYPTION_KEY` explicitly and back it up; without it credentials cannot be decrypted on a new instance.
- Use PostgreSQL for anything beyond a few workflows; queue mode requires it.
- Set `WEBHOOK_URL` when behind a reverse proxy — webhooks fail silently without it.
- Use `n8n export:credentials --decrypted` when migrating between instances with different encryption keys, and delete the plain-text file afterwards.
- Pin the image to a version (`2.43.4`), not `latest`; the `stable` tag is also fine for production but changes weekly. Keep the `n8nio/runners` tag equal to the n8n tag.
- Enable execution pruning (`EXECUTIONS_DATA_PRUNE=true`) to prevent database bloat.
- In queue mode, all instances must share the same `N8N_ENCRYPTION_KEY` and PostgreSQL database.
- For health checks, use `/healthz` (instance reachable) and `/healthz/readiness` (DB connected and migrated). `/metrics` needs `N8N_METRICS=true`.
- Code nodes without external task runners can reach credentials and the encryption key; do not let untrusted users edit workflows on such an instance.
