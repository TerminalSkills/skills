---
name: porter
description: >-
  Porter is a platform as a service that gives a Heroku-style deploy experience on your own AWS, GCP or Azure account, running apps on a managed Kubernetes cluster it provisions for you. Use when someone asks to deploy an app on Porter, write a porter.yaml, run `porter apply`, tail logs, run a one-off command, set environment groups, add Postgres or Redis, set up preview environments, or deploy from CI.
license: Apache-2.0
compatibility: "Porter CLI (Homebrew) and a Porter project with a linked AWS, GCP or Azure account; datastores are AWS only"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
  - paas
  - kubernetes
  - aws
  - gcp
  - azure
---

# Porter — PaaS on Your Own Cloud

## Overview

Porter runs applications in your own AWS, GCP or Azure account while managing the Kubernetes cluster underneath. You connect a cloud account, create a cluster in the dashboard (dashboard.porter.run), then deploy apps from a GitHub repository or a container registry. Apps are made of services of three types: `web` (HTTP), `worker` (background) and `job` (cron or on demand). Configuration as code lives in a `porter.yaml` (schema `version: v2`) applied with `porter apply`. Docs: https://docs.porter.run.

## Instructions

### Setup and CLI basics

```bash
brew install porter-dev/porter/porter     # macOS (Homebrew)
porter version
porter auth login                          # opens the browser, sets default project and cluster
porter config                              # show current project and cluster
porter projects list
porter clusters list --json                # the table hides cluster IDs
porter config set-project 12345
porter config set-cluster 67890
```

Global flags `--project`, `--cluster`, `--token` and the variables `PORTER_PROJECT`, `PORTER_CLUSTER`, `PORTER_TOKEN`, `PORTER_HOST`, `PORTER_APP_NAME` override the config file (flags win over variables). Create the cloud account link and the cluster in the dashboard first; the CLI can also manage them with `porter cloud-accounts` and `porter clusters`.

### porter.yaml

`services` is a list. Each service needs `name`, `type`, `run`, `cpuCores` and `ramMegabytes`; `web` also needs `port`. Use either `build` or `image`, never both. The app name is `name` (max 31 chars, lowercase, digits, `-`) or `PORTER_APP_NAME`.

```yaml
version: v2
name: billing-api
build:
  method: docker            # docker | pack
  context: .
  dockerfile: ./Dockerfile  # Porter recommends a Dockerfile over buildpacks
env:
  NODE_ENV: production
  PORT: "8080"              # values must be strings
envGroups:
  - billing-secrets         # project-wide group, must already exist
predeploy:
  run: npx prisma migrate deploy
services:
  - name: api
    type: web
    run: node dist/server.js
    port: 8080
    cpuCores: 0.5
    ramMegabytes: 512
    domains:
      - name: api.billing-demo.dev
    healthCheck:
      enabled: true
      httpPath: /health
    autoscaling:
      enabled: true         # while enabled, `instances` is ignored
      minInstances: 2
      maxInstances: 10
      cpuThresholdPercent: 60
      memoryThresholdPercent: 70
  - name: queue-worker
    type: worker
    run: node dist/worker.js
    cpuCores: 1
    ramMegabytes: 1024
    instances: 2
  - name: daily-report
    type: job
    run: node dist/cron/daily-report.js
    cpuCores: 0.25
    ramMegabytes: 256
    cron: "0 8 * * *"       # default is every 5 minutes if omitted
    timeoutSeconds: 300
autoRollback:
  enabled: true
```

Other top-level fields: `image: {repository, tag}` for a pre-built image, `initialDeploy` (runs once on the first deploy of a preview environment, for seeding), `efsStorage` (AWS). Web services default to the cluster's public load balancer; `loadBalancers: [private_lb]` or `private: true` (no load balancer, cluster-internal) change that. Secrets belong in environment groups, not in `porter.yaml`.

### Deploy and operate from the CLI

```bash
porter apply -f porter.yaml --validate     # YAML syntax only
porter apply -f porter.yaml --dry-run      # server-side validation, nothing applied
porter apply -f porter.yaml --wait         # build, deploy, wait for rollout
porter apply -f porter.yaml --no-build --tag v1.4.2   # redeploy an existing image

porter app list
porter app yaml billing-api > porter.yaml  # export the live config
porter app logs billing-api --service api  # stream; add --since 1h, --search "error", --limit 500
porter app run billing-api -- npm run seed # one-off command in a copy of the app
porter app run billing-api -e -- bash      # shell in an existing replica
porter app run billing-api --job daily-report --wait   # trigger a job service
porter app update billing-api --tag v1.4.2 --wait     # config/tag only, no build
porter app rollback billing-api            # back to the last successful revision
```

### Environment groups and secrets

```bash
porter env list
porter env create --name billing-secrets --variables LOG_LEVEL=info --secrets STRIPE_API_KEY="$STRIPE_API_KEY"
porter env set billing-secrets -v LOG_LEVEL=debug -s SENDGRID_API_KEY="$SENDGRID_API_KEY"
porter env pull billing-secrets -f .env.local
porter env pull --app billing-api --merged
```

Updating an environment group redeploys every app attached to it. Secrets are not readable after creation.

### Datastores and multi-app files

Managed Postgres and Redis datastores are provisioned from Add-ons in the dashboard, on AWS only, in a separate VPC peered to the cluster. Porter creates an environment group named after the datastore with the connection variables; attach it with `envGroups`. For a local tunnel: `porter datastore connect billing-db --port 5433`, then `psql -h 127.0.0.1 -p 5433 -U postgres`.

A single file can hold several apps and in-cluster datastores (needs CLI 0.68.30+; apply with `--wait` so the datastore exists before the apps start):

```yaml
apps:
  - version: v2
    name: backend
    image: {repository: ghcr.io/acme-demo/backend, tag: "1.4.2"}
    envGroups: [cache]
    services:
      - {name: server, type: web, run: node server.js, port: 8080, cpuCores: 0.5, ramMegabytes: 512}
addons:
  - name: cache
    type: redis
    kind: in-cluster
    config: {storageGigabytes: 2, cpuCores: 0.1, ramMegabytes: 110}
```

### Preview environments

Configured in the dashboard (Preview environments > preview template). Porter opens a pull request that adds a GitHub Actions workflow; once merged, every PR gets an isolated environment that is deleted when the PR closes. The template sets addons and per-service overrides. From CI, `porter apply -f porter.yaml --preview` deploys the current branch as a preview. Use `initialDeploy` for seeding.

### Deploying from CI

```yaml
# .github/workflows/deploy.yml
name: Deploy to Porter
on:
  push:
    branches: [main]
jobs:
  porter-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: porter-dev/setup-porter@v0.2.0
      - run: porter apply -f porter.yaml --wait
        timeout-minutes: 30
        env:
          PORTER_HOST: https://dashboard.porter.run
          PORTER_PROJECT: ${{ secrets.PORTER_PROJECT }}
          PORTER_CLUSTER: ${{ secrets.PORTER_CLUSTER }}
          PORTER_TOKEN: ${{ secrets.PORTER_TOKEN }}
          PORTER_APP_NAME: billing-api
          PORTER_TAG: ${{ github.sha }}
```

Other CI systems can run the `ghcr.io/porter-dev/releases/porter-cli` image with the same variables.

## Examples

### Example 1: Deploy a Node API with a worker and nightly job

**User request:** "Put our Express API and queue worker on Porter, run migrations before each deploy, and send a report every morning."

Write the `porter.yaml` above (web, worker and job services, `predeploy.run` for the migration), create the `billing-secrets` environment group with the database URL as a secret, then run `porter apply -f porter.yaml --dry-run` followed by `porter apply -f porter.yaml --wait`. Check the result with `porter app logs billing-api --service api --since 15m`.

### Example 2: Debug a crash-looping service

**User request:** "The worker keeps restarting after the last deploy."

Run `porter app logs billing-api --service queue-worker --since 1h --search "error"` and compare memory use in the dashboard; out-of-memory kills, wrong `run` commands and failing health checks are the usual causes. Raise `ramMegabytes`, fix the command, and redeploy with `porter apply -f porter.yaml --wait`. If the new revision is bad, `autoRollback.enabled: true` rolls all services back, or run `porter app rollback billing-api`.

## Guidelines

- Porter creates real cloud resources (Kubernetes cluster, load balancers, datastores) that you pay for to your cloud provider; check that bill, and delete clusters through Porter so dependent resources are cleaned up.
- Keep `porter.yaml` in the repository and prefer it over dashboard-only edits; `porter apply` merges with the existing config unless you pass `--exact`.
- Run migrations in `predeploy`, not in the service start command.
- Set `minInstances` to at least 2 for web services that must not drop during a deploy, and define a `healthCheck`.
- Use environment groups for secrets; never put them in `porter.yaml` or in the workflow file.
- Datastores are AWS only. Do not install the CLI by piping a script into a shell; use Homebrew on macOS, or the CI image (`ghcr.io/porter-dev/releases/porter-cli`); on Linux workstations download the installer from docs.porter.run/cli/installation, read it and check it before you run it.
- A browser-based login does not work in CI: use `PORTER_TOKEN`.
