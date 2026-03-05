---
name: koyeb
category: Cloud & Infrastructure
tags: [paas, serverless, deployment, edge, docker, global]
version: 1.0.0
author: terminal-skills
---

# Koyeb — Global Serverless Platform

You are an expert in Koyeb, the serverless cloud platform for deploying full-stack applications, APIs, and workers globally with automatic scaling, built-in CI/CD, and edge networking. You help developers deploy applications from Git or Docker with zero-downtime deployments and pay-per-use pricing.

## Core Capabilities

### CLI Deployment

```bash
# Install Koyeb CLI
curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh

# Login
koyeb login

# Deploy from a Git repository
koyeb app create my-api
koyeb service create my-api/web \
  --git github.com/myorg/my-api \
  --git-branch main \
  --git-build-command "npm ci && npm run build" \
  --git-run-command "node dist/index.js" \
  --port 3000:http \
  --region fra \
  --instance-type nano \
  --min-scale 1 \
  --max-scale 5 \
  --env NODE_ENV=production \
  --env DATABASE_URL=@database-url   # Reference a secret

# Deploy from Docker image
koyeb service create my-api/web \
  --docker ghcr.io/myorg/my-api:latest \
  --port 3000:http \
  --region fra

# Manage secrets
koyeb secret create database-url --value "postgres://..."
koyeb secret list

# Custom domains
koyeb domain create api.myapp.com --app my-api
```

### Service Configuration (koyeb.yaml)

```yaml
# koyeb.yaml — Declarative service configuration
name: my-api
type: web

# Build configuration
git:
  repository: github.com/myorg/my-api
  branch: main
  build_command: npm ci && npm run build
  run_command: node dist/index.js

# Or Docker-based
# docker:
#   image: ghcr.io/myorg/my-api:latest

# Scaling
scaling:
  min: 1
  max: 10
  targets:
    - metric: cpu
      value: 70              # Scale up at 70% CPU
    - metric: requests
      value: 100             # Scale up at 100 req/s per instance

# Instance configuration
instance_type: small          # nano | small | medium | large | xlarge
regions:
  - fra                       # Frankfurt
  - was                       # Washington DC
  - sin                       # Singapore

# Networking
ports:
  - port: 3000
    protocol: http

# Health checks
health_checks:
  - type: http
    port: 3000
    path: /health
    interval: 30
    timeout: 10
    healthy_threshold: 2
    unhealthy_threshold: 3

# Environment
env:
  - key: NODE_ENV
    value: production
  - key: DATABASE_URL
    secret: database-url     # Reference a Koyeb secret
  - key: REDIS_URL
    secret: redis-url

# Volumes (persistent storage)
volumes:
  - name: data
    path: /app/data
    size: 10                  # GB
```

### Workers and Cron Jobs

```bash
# Deploy a background worker (no public port)
koyeb service create my-app/worker \
  --git github.com/myorg/my-api \
  --git-branch main \
  --git-run-command "node dist/worker.js" \
  --type worker \
  --env QUEUE_URL=@queue-url

# There's no native cron in Koyeb — use a lightweight scheduler
# or a cron-to-HTTP service that hits your web endpoint
```

### Multi-Region Deployment

```bash
# Deploy to multiple regions for global low-latency
koyeb service update my-api/web \
  --region fra,was,sin \
  --min-scale 1 \
  --max-scale 3

# Koyeb's edge network automatically routes users to the nearest region
# DNS-based routing: requests from Europe → Frankfurt, US → Washington, Asia → Singapore
```

### Database Integration

```bash
# Koyeb offers managed Postgres (Neon-powered)
koyeb database create main-db \
  --engine postgres \
  --region fra

# Connection string is available as a secret
# Reference it in service env vars:
koyeb service update my-api/web \
  --env DATABASE_URL=@main-db-connection-string
```

## Best Practices

1. **Use Git-based deployment** — Push to deploy; Koyeb handles builds, caching, and zero-downtime rollouts
2. **Multi-region for latency** — Deploy to regions closest to your users; Koyeb's edge routes traffic automatically
3. **Secrets for credentials** — Never put database URLs or API keys in env vars directly; use `koyeb secret create`
4. **Autoscaling with request metrics** — Scale on requests-per-second for web services; CPU-based for compute-heavy workers
5. **Health checks are critical** — Define HTTP health checks; without them, Koyeb can't do zero-downtime deployments
6. **Use nano for staging** — Nano instances are cheap; use them for preview/staging environments
7. **Pin Docker tags** — Don't use `:latest` in production; pin to specific versions for reproducible deployments
8. **Monitor via dashboard** — Koyeb provides built-in logs, metrics, and deployment history in the web console
