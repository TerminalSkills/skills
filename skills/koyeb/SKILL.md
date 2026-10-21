---
name: koyeb
description: >-
  Koyeb is a serverless cloud platform that runs web services, workers and databases from a Git repository or Docker image, with autoscaling, multi-region deployment and a managed Postgres. Use when a user asks to deploy an app to Koyeb, use the koyeb CLI, set secrets and environment variables, add health checks, a custom domain, or scale a service across regions.
license: Apache-2.0
compatibility: "Koyeb account and API token. koyeb CLI 5.x (Linux, macOS, Windows)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["paas", "serverless", "deployment", "docker", "cli"]
  repository: https://github.com/koyeb/koyeb-cli
---

# Koyeb — Global Serverless Platform

## Overview

Koyeb deploys an app as a **service** inside an **app** (the app groups services and owns the public `*.koyeb.app` domain). A service is built from a Git repository (buildpack or Dockerfile), a Docker image, or a local directory, and runs as a `web` service (HTTP/TCP port), a `worker` (no port) or a `sandbox`. Deployments are rolling by default, with blue-green and immediate strategies available. Services scale between `--min-scale` and `--max-scale` on autoscaling targets and can run in several regions at once.

The `koyeb` CLI drives all of it. Flags below were checked against koyeb-cli 5.12.0; run `koyeb services create --help` for the full list. There is no declarative `koyeb.yaml` service file in the CLI; the CLI's declarative option is `koyeb compose <file>` (a `koyeb-compose.yaml`).

## Instructions

### Install and sign in

```bash
brew install koyeb/tap/koyeb       # macOS and Linux with Homebrew
koyeb version
koyeb login                        # prompts for an API token created in the Koyeb console (stored in ~/.koyeb.yaml)
koyeb whoami
```

Without Homebrew, download the archive for your platform from https://github.com/koyeb/koyeb-cli/releases and verify it against `checksums.txt` from the same release before extracting:

```bash
sha256sum --ignore-missing -c checksums.txt && tar xzf koyeb-cli_5.12.0_linux_amd64.tar.gz
```

### Deploy from Git

```bash
koyeb apps create orders-api
koyeb secrets create database-url --value-from-stdin < database-url.txt
koyeb services create web --app orders-api \
  --git github.com/novak-labs/orders-api --git-branch main \
  --git-buildpack-build-command "npm ci && npm run build" \
  --git-buildpack-run-command "node dist/index.js" \
  --ports 3000:http --routes /:3000 \
  --regions fra \
  --instance-type nano --min-scale 1 --max-scale 3 \
  --autoscaling-requests-per-second 100 \
  --checks 3000:http:/health \
  --env NODE_ENV=production \
  --env 'DATABASE_URL={{secret.database-url}}' \
  --wait
```

- A secret is referenced as `{{secret.NAME}}` inside `--env`; quote it so the shell leaves the braces alone.
- Use `--git-builder docker` with `--git-docker-dockerfile` to build a Dockerfile instead of using a buildpack.
- `--git-no-deploy-on-push` stops automatic deployments on every push to the branch.

### Deploy a Docker image or a local directory

```bash
koyeb services create web --app orders-api --docker ghcr.io/novak-labs/orders-api:1.4.2 --ports 3000:http --routes /:3000
koyeb deploy . orders-api/web          # upload the current directory and build it on Koyeb
```

Private registry: create a secret with `koyeb secrets create ghcr-pull --type registry-private --registry-url ghcr.io --registry-username novak-bot --value-from-stdin`, then pass `--docker-private-registry-secret ghcr-pull`.

### Update, scale, observe

```bash
koyeb services update orders-api/web --env LOG_LEVEL=debug --env '!DEBUG'   # '!' deletes a variable
koyeb services update orders-api/web --regions was      # adds a region; remove one with --regions '!was'
koyeb services scale orders-api/web --scale fra:2 --scale was:1             # fixed instance counts per region
koyeb services redeploy orders-api/web --use-cache --wait
koyeb services logs orders-api/web
koyeb deployments list
```

### Workers, domains, databases, volumes

```bash
koyeb services create worker --app orders-api --type worker --docker ghcr.io/novak-labs/orders-api:1.4.2 \
  --docker-command node --docker-args dist/worker.js --env 'QUEUE_URL={{secret.queue-url}}'
koyeb domains create api.novak-labs.dev --attach-to orders-api     # then add the CNAME shown by `koyeb domains describe`
koyeb databases create orders-db --app orders-api --region fra --instance-type free
koyeb volumes create orders-data --region fra --size 10           # fra or was only, 1-10 GB, preview
koyeb services update orders-api/web --scale 1 --volumes orders-data:/app/data   # volumes need scale 1 and a non-free, non-eco instance in the same region
```

There is no built-in cron scheduler flag in `services create`; run scheduled jobs from an external scheduler that calls an HTTP endpoint, or a worker that sleeps between runs.

## Examples

### Example 1: Ship a Node API with a secret and a health check

Request: "Deploy github.com/novak-labs/orders-api to Koyeb in Frankfurt, keep the database URL secret, and make sure bad deploys don't take traffic."

```bash
koyeb apps create orders-api
printf '%s' "$DATABASE_URL" | koyeb secrets create database-url --value-from-stdin
koyeb services create web --app orders-api --git github.com/novak-labs/orders-api --git-branch main \
  --ports 3000:http --routes /:3000 --regions fra --checks 3000:http:/health \
  --env 'DATABASE_URL={{secret.database-url}}' --wait
```

Result: the CLI waits for the deployment; a rolling deploy only shifts traffic once the `/health` check passes, and the app answers on `https://orders-api-<org>.koyeb.app`.

### Example 2: Move traffic to three regions

Request: "Run the API in Frankfurt, Washington and Singapore and scale on requests."

```bash
koyeb services update orders-api/web --regions fra --regions was --regions sin \
  --min-scale 1 --max-scale 4 --autoscaling-requests-per-second 80
koyeb services get orders-api/web
```

Result: a new deployment starts instances in the three regions; `koyeb services get` shows the service status.

## Guidelines

- Put credentials in secrets (`koyeb secrets create`), never in `--env` literals or in shell history; use `--value-from-stdin`.
- Define an HTTP health check on web services; without one Koyeb only knows the process started.
- Pin Docker tags (`:1.4.2`), not `:latest`, so redeploys are reproducible.
- The free instance type is limited to one per organization and is meant for previews, not production; check the instance table at https://www.koyeb.com/docs/reference/instances for current sizes and prices.
- Scaling to zero (deep sleep) cold-starts the first request; set `--deep-sleep-delay 0` for latency-sensitive services.
- Regions available today include `fra`, `par`, `sin`, `tyo`, `was` and `sfo`; eco instance types exist only in some of them.
- Delete test apps (`koyeb apps delete`) so they stop billing.
