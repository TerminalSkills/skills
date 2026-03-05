---
name: dokploy
description: Expert guidance for Dokploy, the open-source, self-hosted Platform as a Service alternative to Vercel, Netlify, and Heroku. Helps developers deploy applications, databases, and services on their own VPS with automatic SSL, Docker-based isolation, and a web dashboard for management.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - self-hosted
  - paas
  - deployment
  - docker
  - vps
---

# Dokploy — Self-Hosted PaaS


## Overview

You are an expert in Dokploy, the open-source, self-hosted Platform as a Service alternative to Vercel, Netlify, and Heroku. You help developers deploy applications, databases, and services on their own VPS with automatic SSL, Docker-based isolation, and a web dashboard for management.

## Instructions

### Installation

Deploy Dokploy on any VPS with one command:

```bash
# Install Dokploy (requires Ubuntu 22.04+ or Debian 12+, minimum 1GB RAM)
curl -sSL https://dokploy.com/install.sh | sh

# Access the dashboard at https://your-server-ip:3000
# Default credentials are set during installation

# Or install with Docker Compose manually
git clone https://github.com/Dokploy/dokploy.git
cd dokploy
docker compose up -d
```

### Application Deployment

Deploy applications from Git repositories:

```yaml
# dokploy.yml — Application configuration (optional, can use dashboard)
name: my-api
type: application

# Source configuration
source:
  type: github
  repository: myorg/my-api
  branch: main
  autoDeploy: true              # Deploy on every push

# Build configuration
build:
  type: dockerfile              # dockerfile | buildpacks | nixpacks
  dockerfilePath: ./Dockerfile
  context: .

# Runtime configuration
runtime:
  port: 3000
  replicas: 2
  resources:
    memory: 512M
    cpu: 0.5
  healthCheck:
    path: /health
    interval: 30s
    timeout: 10s

# Environment variables
env:
  NODE_ENV: production
  DATABASE_URL: ${DATABASE_URL}  # Reference from Dokploy secrets

# Domain configuration
domains:
  - host: api.myapp.com
    https: true                  # Auto-provision SSL with Let's Encrypt
    forceHttps: true
```

### Database Services

Provision managed databases alongside your applications:

```yaml
# Deploy PostgreSQL
databases:
  - name: main-db
    type: postgresql
    version: "16"
    storage: 10Gi
    backup:
      enabled: true
      schedule: "0 2 * * *"      # Daily at 2 AM
      retention: 7                # Keep 7 days

  - name: cache
    type: redis
    version: "7"
    storage: 1Gi

  - name: search
    type: mariadb
    version: "11"
    storage: 5Gi
```

### Docker Compose Projects

Deploy complex multi-service applications:

```yaml
# docker-compose.yml — Deployed as a Dokploy compose project
version: "3.8"

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    deploy:
      replicas: 2

  worker:
    build:
      context: ./worker
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=myapp

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### API for Automation

```typescript
// scripts/deploy.ts — Automate Dokploy via REST API
const DOKPLOY_URL = "https://dokploy.myserver.com";
const DOKPLOY_TOKEN = process.env.DOKPLOY_TOKEN!;

async function dokployFetch(path: string, options?: RequestInit) {
  return fetch(`${DOKPLOY_URL}/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DOKPLOY_TOKEN}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  }).then((r) => r.json());
}

// Trigger a deployment
async function deploy(applicationId: string) {
  return dokployFetch(`/application/${applicationId}/deploy`, {
    method: "POST",
  });
}

// Get application logs
async function getLogs(applicationId: string, lines = 100) {
  return dokployFetch(`/application/${applicationId}/logs?lines=${lines}`);
}

// Update environment variables
async function updateEnv(applicationId: string, envVars: Record<string, string>) {
  const envString = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return dokployFetch(`/application/${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify({ env: envString }),
  });
}
```

### Monitoring and Alerts

```yaml
# Built-in monitoring features:
# - Container CPU/memory usage graphs
# - Deployment history with logs
# - SSL certificate expiration alerts
# - Disk usage monitoring
# - Docker container health status

# Webhook notifications for deployment events
notifications:
  - type: webhook
    url: https://hooks.slack.com/services/xxx
    events: [deploy_success, deploy_failure, health_check_failure]

  - type: email
    to: ops@myapp.com
    events: [deploy_failure, ssl_expiring]
```


## Examples

### Example 1

**User request:** "Help me set up Dokploy"

The agent follows the instructions above to configure Dokploy with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Dokploy configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Use a dedicated VPS** — Don't share the Dokploy server with other workloads; it manages Docker and networking
2. **Enable automatic backups** — Configure database backups with retention; test restores regularly
3. **Set resource limits** — Always define memory and CPU limits per application to prevent one service from starving others
4. **Health checks on every service** — Dokploy uses health checks for zero-downtime deployments and auto-restart
5. **Use secrets for sensitive values** — Store API keys and passwords in Dokploy's secret management, not in docker-compose files
6. **Auto-deploy from main branch** — Enable auto-deploy for staging; use manual deploy for production
7. **Monitor disk usage** — Docker images and volumes accumulate; set up image pruning cron jobs
8. **Reverse proxy headers** — Dokploy uses Traefik; your app should trust `X-Forwarded-For` and `X-Forwarded-Proto` headers
