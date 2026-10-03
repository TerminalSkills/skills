---
name: northflank
description: >-
  Northflank is a cloud platform that deploys containers from Git or a registry
  with managed databases, cron jobs and preview environments, on its own
  Kubernetes-based infrastructure or in your own cloud account. Use when the
  user wants to deploy a service, add a Postgres or Redis addon, schedule a
  job, manage secrets, or script Northflank with the CLI, API or JSON templates.
license: Apache-2.0
compatibility: "Node.js 18+ for the CLI (@northflank/cli); a Northflank account and API token"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
  - paas
  - deployment
  - kubernetes
  - docker
  - ci-cd
---

# Northflank — Full-Stack Cloud Platform

## Overview

Northflank organises everything inside a **project**: **services** (build, deployment or combined = build + deploy from Git), **addons** (managed PostgreSQL, MySQL, MongoDB, Redis and others), **jobs** (manual or cron), **secret groups**, and optional **pipelines** with preview environments.

Three ways to drive it, all using the same request bodies as the REST API:

- the **CLI** (`@northflank/cli`, 0.13.x), where `create`, `get`, `list`, `scale`, `run`, `start` take `--file`/`--input` JSON;
- the **JS client** (`@northflank/js-client`) for scripts;
- **templates**: JSON infrastructure-as-code, run from the dashboard, the API/CLI, or automatically from a `northflank.json` in Git.

Builds use either a **Dockerfile** (`buildSettings.dockerfile`) or a **buildpack** (`buildSettings.buildpack.builder`: `HEROKU_24` is the default; others include `HEROKU_22`, `GOOGLE_22`, `PAKETO_BASE`). Nixpacks is not an option.

## Instructions

1. **Install and sign in.** `northflank login` opens the browser; in CI use an API token from the environment: `northflank login -t "$NORTHFLANK_API_TOKEN" -n ci`. Give the token only the permissions it needs (each command's `--help` ends with the permission it requires).

```bash
npm install -g @northflank/cli
northflank login
northflank context use project      # pick a default project so --project can be left out
northflank command-overview         # every command as a tree
```

2. **Create resources from JSON.** Write the body as in the API docs, then `northflank create <kind> --file body.json --project northwind-prod`. Kinds: `project`, `service combined|build|deployment`, `addon`, `secret` (this is a secret group), `job` (cron when `schedule` is set), `template`. Add `-o json` for machine-readable output.

3. **Operate.** `get service --service orders-api`, `get service logs --service orders-api --tail`, `scale service --service orders-api --input '{"instances":3}'`, `start job run --job daily-report`, `get job runs`, `restart service`, `pause service`, `forward service` (port-forward to a private service or addon).

4. **Reuse configuration with templates.** A template is `{ "apiVersion": "v1.2", "name": ..., "spec": { "kind": "Workflow", "spec": { "type": "sequential", "steps": [...] } } }`. Steps are nodes (`Project`, `Addon`, `CombinedService`, `SecretGroup`, `Job`, ...) with a `ref`; later nodes refer to earlier ones as `${refs.<ref>.<property>}`, template arguments as `${args.<name>}`, and `${fn.randomSecret(256)}` generates a secret. Commit it as `northflank.json` to sync from Git (`options.autorun: true` runs it on each change), or run it with `northflank run template --template orders-stack`.

5. **Secrets and addon credentials.** A secret group holds `secrets.variables` and is injected into services in the project (limit it with `restrictions`). `addonDependencies` pulls connection values (for example `POSTGRES_URI`) from an addon into the group, so no one copies a password by hand.

## Examples

### "Deploy my orders-api from GitHub as a service with two replicas and a health check"

```json
{
  "name": "orders-api",
  "billing": { "deploymentPlan": "nf-compute-20" },
  "vcsData": {
    "projectUrl": "https://github.com/northwind-traders/orders-api",
    "projectType": "github",
    "projectBranch": "main"
  },
  "buildSettings": {
    "dockerfile": { "buildEngine": "buildkit", "dockerFilePath": "/Dockerfile", "dockerWorkDir": "/" }
  },
  "deployment": { "instances": 2 },
  "ports": [{ "name": "http", "internalPort": 3000, "protocol": "HTTP", "public": true }],
  "healthChecks": [{
    "protocol": "HTTP", "type": "livenessProbe", "path": "/health", "port": 3000,
    "initialDelaySeconds": 10, "periodSeconds": 30, "timeoutSeconds": 5, "failureThreshold": 3
  }],
  "runtimeEnvironment": { "NODE_ENV": "production" }
}
```

```bash
northflank create service combined --file orders-api.json --project northwind-prod
northflank get service logs --project northwind-prod --service orders-api --tail
```

Result: the CLI prints the new service; Northflank builds the Dockerfile, starts two instances and exposes a public `*.code.run` URL. The Git repository must be linked to your Northflank account first (`northflank link` or the dashboard).

### "Add a Postgres database and give the API its connection string"

```json
{
  "name": "orders-db",
  "type": "postgresql",
  "version": "16",
  "billing": { "deploymentPlan": "nf-compute-20", "storage": 10240, "replicas": 1 },
  "customCredentials": { "dbName": "orders" },
  "backupSchedules": [{
    "scheduling": { "interval": "daily", "minute": [0], "hour": [3] },
    "backupType": "dump", "retentionTime": 7
  }]
}
```

```bash
northflank create addon --file orders-db.json --project northwind-prod
northflank create secret --project northwind-prod --input '{
  "name": "orders-api-env", "secretType": "environment", "priority": 10,
  "addonDependencies": [{ "addonId": "orders-db", "keys": [{ "keyName": "POSTGRES_URI", "aliases": ["DATABASE_URL"] }] }]
}'
```

Result: a managed Postgres 16 with nightly dumps kept 7 days (`storage` is in MB), and `DATABASE_URL` appears in the API's environment after its next deploy.

### "Run a report every morning and a migration on demand"

```json
{
  "name": "daily-report",
  "billing": { "deploymentPlan": "nf-compute-10" },
  "deployment": {
    "vcs": { "projectUrl": "https://github.com/northwind-traders/orders-api", "projectType": "github", "projectBranch": "main" },
    "docker": { "configType": "customCommand", "customCommand": "node scripts/daily-report.js" }
  },
  "buildSettings": { "dockerfile": { "buildEngine": "buildkit", "dockerFilePath": "/Dockerfile", "dockerWorkDir": "/" } },
  "schedule": "0 8 * * *",
  "concurrencyPolicy": "forbid",
  "backoffLimit": 0
}
```

```bash
northflank create job cron --file daily-report.json --project northwind-prod
northflank start job run --project northwind-prod --job daily-report
```

Result: the job runs at 08:00 and can be triggered by hand; `northflank get job runs --job daily-report` lists the history. For a migration use `create job manual` (same body without `schedule`).

## Guidelines

- Validate payloads with `--help` and the API reference rather than memory: the CLI checks fields client side unless `--skipValidation` is set.
- Keep tokens and secret values in environment variables or the secret group; never commit them in `northflank.json` or pass them on a shared shell history.
- Plan names such as `nf-compute-10`, `nf-compute-20`, `nf-compute-50` set CPU and memory (and price): check the pricing page before scaling up.
- Add liveness and readiness health checks to every service so rollouts wait for healthy instances.
- Run migrations as manual jobs, not at application start with several replicas.
- Don't self-manage databases on a plain service when an addon covers it; addons give backups, TLS and replicas.
- Use another tool when you need a persistent VM, or a platform with no container build step.
