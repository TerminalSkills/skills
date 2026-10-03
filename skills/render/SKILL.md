---
name: render
description: >-
  Deploys web apps, APIs, static sites, workers, cron jobs and Postgres on Render, the cloud platform configured through a render.yaml Blueprint. Use when a user asks to host an app on Render, write or fix render.yaml, wire environment variables between services, set up auto-deploy from Git, autoscale, add a custom domain, or trigger deploys with the Render API or CLI.
license: Apache-2.0
compatibility: "Render account; a Git repository (GitHub, GitLab, Bitbucket) or a Docker image"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["paas", "deployment", "hosting", "docker", "postgresql"]
---

# Render — Cloud Application Platform

## Overview

Render runs web services, private services, background workers, cron jobs, static sites, Postgres and Key Value (Redis-compatible) instances. Everything can be declared in one `render.yaml` file at the repository root (a Blueprint); Render creates and updates the services from it. Services deploy from a Git branch or a Docker image.

Checked against the Blueprint spec and API docs in October 2026. Older examples use names that are now deprecated: `autoDeploy: true` (use `autoDeployTrigger`), `type: redis` (use `keyvalue`), `customDomains` (the field is `domains`), and plan names like `starter` or `standard` (current plans are named by size, such as `0.5c-512mb`, `1c-2g`).

## Instructions

### Blueprint (render.yaml)

```yaml
services:
  - type: web
    name: api-server
    runtime: node
    region: oregon                  # oregon | ohio | virginia | frankfurt | singapore
    plan: 1c-2g                     # free | 0.5c-512mb | 1c-2g | 2c-4g | ...
    buildCommand: npm ci && npm run build
    startCommand: npm start
    autoDeployTrigger: commit       # commit | checksPass | off
    healthCheckPath: /health
    domains:
      - api.shopwave.io
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: main-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: keyvalue
          name: redis-cache
          property: connectionString
      - key: JWT_SECRET
        generateValue: true         # random value created once
      - key: SENTRY_DSN
        sync: false                 # asked for in the dashboard, never stored in Git
      - fromGroup: shared-config
    scaling:                        # autoscaling needs a Pro workspace or higher
      minInstances: 1
      maxInstances: 5
      targetCPUPercent: 60
      targetMemoryPercent: 70

  - type: worker
    name: job-processor
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm run worker
    envVars:
      - fromGroup: shared-config
      - key: DATABASE_URL
        fromDatabase:
          name: main-db
          property: connectionString

  - type: web
    name: frontend
    runtime: static
    buildCommand: cd frontend && npm ci && npm run build
    staticPublishPath: frontend/dist
    headers:
      - path: /*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /index.html
        name: Cache-Control
        value: no-cache
    routes:
      - type: rewrite
        source: /*
        destination: /index.html

  - type: cron
    name: daily-cleanup
    runtime: node
    buildCommand: npm ci
    startCommand: npm run cleanup
    schedule: "0 3 * * *"           # UTC

  - type: pserv                     # private service, reachable only inside the workspace network
    name: internal-api
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: PORT
        value: "3001"

  - type: keyvalue
    name: redis-cache
    plan: 1g
    ipAllowList: []                 # required; empty = internal connections only

databases:
  - name: main-db
    plan: 1c-2g
    databaseName: shopwave
    postgresMajorVersion: "17"      # a string
    ipAllowList: []

envVarGroups:
  - name: shared-config
    envVars:
      - key: LOG_LEVEL
        value: info
      - key: CORS_ORIGIN
        value: https://shopwave.io
```

Runtimes: `node`, `python`, `ruby`, `go`, `elixir`, `rust`, `docker`, `image` (prebuilt image) and `static`. Env var groups cannot use `fromService` or `sync: false`. Pull request previews are configured with the `previews` object (`generation: automatic`). Create the Blueprint in the dashboard (New, Blueprint) and connect the repo; changes to `render.yaml` on the tracked branch sync automatically.

### Ports

A web service must bind `0.0.0.0` on the port in the `PORT` variable; the default is `10000`. Services that listen elsewhere are reported as failing to detect an open port.

### Render CLI

```bash
brew install render-oss/render/render        # or: winget install Render.CLI
render login                                 # browser sign-in; in CI set RENDER_API_KEY instead
render blueprints validate render.yaml       # check the file before pushing
render deploys create srv-cq1x9k2n8j5s73d4lm0g    # trigger a deploy
render services -o json                      # list services, non-interactive
```

Binaries are also on https://github.com/render-oss/cli/releases; do not run an installer script piped into a shell.

### Docker deployment

Set `runtime: docker` and `dockerfilePath`. A multi-stage build keeps the image small; install dev dependencies in the build stage because the build needs them:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
USER nodejs
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### REST API

Base URL `https://api.render.com/v1`, header `Authorization: Bearer $RENDER_API_KEY`; create the key in Account Settings. OpenAPI spec: https://api.render.com/openapi.json.

```typescript
const headers = {
  Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
  "Content-Type": "application/json",
};
const serviceId = process.env.RENDER_SERVICE_ID;

// POST /services/{id}/deploys  (clearCache: "clear" | "do_not_clear"; optional commitId)
const deploy = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
  method: "POST",
  headers,
  body: JSON.stringify({ clearCache: "do_not_clear" }),
}).then((r) => r.json());

// POST /services/{id}/scale  (ignored while autoscaling is enabled)
await fetch(`https://api.render.com/v1/services/${serviceId}/scale`, {
  method: "POST",
  headers,
  body: JSON.stringify({ numInstances: 3 }),
});
```

## Examples

### Example 1: Node API, React frontend and Postgres from one repo

Request: "I have a Node API in `/api` and a React app in `/web`. Put both on Render with a database."

Write `render.yaml` with a `type: web` Node service (`rootDir: api`, `healthCheckPath: /health`), a `type: web` `runtime: static` service (`rootDir: web`, `staticPublishPath: dist`, the SPA rewrite route) and a `databases` entry whose `connectionString` feeds `DATABASE_URL` through `fromDatabase`. Then run `render blueprints validate render.yaml`, commit and connect the repo as a Blueprint.

Result: validation prints no errors; after the first sync the dashboard shows three resources, the API at `https://api-server.onrender.com` answering `/health`.

### Example 2: Deploy fails with "no open ports detected"

Request: "Render says the deploy timed out and no open port was detected. Logs show the app listening on 3000."

Change the server to listen on `process.env.PORT` and host `0.0.0.0` (or set `PORT: "3000"` in `envVars`), then redeploy with `render deploys create srv-cq1x9k2n8j5s73d4lm0g`.

Result: the deploy goes live once `/health` returns 200.

## Guidelines

- Keep `render.yaml` the source of truth. The Blueprint does not delete dashboard-only settings it does not mention, so review diffs before syncing.
- Always set `healthCheckPath` on web services so deploys switch over only when the new instance is healthy.
- Never put secrets in YAML values: use `sync: false`, `generateValue: true` or the dashboard. Keep API keys in `RENDER_API_KEY`, not in the repo.
- Free instances are not for production: free web services spin down after 15 minutes idle (about a minute to wake), have an ephemeral filesystem, and a free Postgres expires after 30 days. Workers and cron jobs have no free plan.
- Use connection pooling (the database `connectionPool` setting or your ORM's pool); each Postgres plan has a connection limit.
- Cron schedules run in UTC. Use environment groups for config shared by several services.
