---
name: render
description: Expert guidance for Render, the modern cloud platform for deploying web applications, APIs, databases, and background workers. Helps developers configure Render services using `render.yaml` Infrastructure as Code, set up auto-deploy from Git, manage environment variables, and optimize for production workloads.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - paas
  - deployment
  - hosting
  - docker
  - postgresql
---

# Render — Cloud Application Platform


## Overview


Render, the modern cloud platform for deploying web applications, APIs, databases, and background workers. Helps developers configure Render services using `render.yaml` Infrastructure as Code, set up auto-deploy from Git, manage environment variables, and optimize for production workloads.


## Instructions

### Infrastructure as Code

Define all services in a single `render.yaml`:

```yaml
# render.yaml — Complete application infrastructure
services:
  # Web service — auto-deployed from Git
  - type: web
    name: api-server
    runtime: node
    region: oregon
    plan: standard               # free | starter | standard | pro
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: main-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: redis-cache
          type: redis
          property: connectionString
      - key: JWT_SECRET
        generateValue: true      # Auto-generate a random secret
      - key: SENTRY_DSN
        sync: false              # Must be set manually in dashboard
    autoDeploy: true             # Deploy on every push to branch
    healthCheckPath: /health
    numInstances: 2              # Horizontal scaling
    scaling:
      minInstances: 1
      maxInstances: 5
      targetMemoryPercent: 70
      targetCPUPercent: 60

  # Background worker — same repo, different entry point
  - type: worker
    name: job-processor
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm run worker
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: main-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: redis-cache
          type: redis
          property: connectionString

  # Static site — frontend SPA
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
        destination: /index.html   # SPA routing fallback

  # Cron job — scheduled tasks
  - type: cron
    name: daily-cleanup
    runtime: node
    buildCommand: npm ci
    startCommand: npm run cleanup
    schedule: "0 3 * * *"          # 3 AM daily
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: main-db
          property: connectionString

  # Private service (internal only, no public URL)
  - type: pserv
    name: internal-api
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: PORT
        value: "3001"

databases:
  - name: main-db
    plan: standard                 # free | starter | standard | pro
    databaseName: myapp
    postgresMajorVersion: 16
    ipAllowList: []                # Empty = allow all Render services

  - name: redis-cache
    plan: starter
```

### Dockerfile Deployment

Deploy any application with Docker:

```dockerfile
# Dockerfile — Multi-stage build for a Node.js API
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

USER nodejs
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### Blueprint Sync API

Programmatically manage services:

```typescript
// scripts/deploy.ts — Trigger manual deploy via Render API
const RENDER_API_KEY = process.env.RENDER_API_KEY!;
const SERVICE_ID = process.env.RENDER_SERVICE_ID!;

async function triggerDeploy(commitId?: string) {
  const response = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clearCache: "do_not_clear",
      }),
    }
  );

  const deploy = await response.json();
  console.log(`Deploy triggered: ${deploy.id} (status: ${deploy.status})`);
  return deploy;
}

// List recent deploys
async function getDeployHistory() {
  const response = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=10`,
    {
      headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
    }
  );
  return response.json();
}

// Scale service
async function scaleService(numInstances: number) {
  const response = await fetch(
    `https://api.render.com/v1/services/${SERVICE_ID}/scale`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ numInstances }),
    }
  );
  return response.json();
}
```

### Custom Domains and SSL

```yaml
# render.yaml — Custom domain configuration
services:
  - type: web
    name: api-server
    customDomains:
      - domain: api.myapp.com      # SSL auto-provisioned via Let's Encrypt
      - domain: api.myapp.io
```

### Environment Groups

Share environment variables across services:

```yaml
# render.yaml — Using environment groups
envVarGroups:
  - name: shared-config
    envVars:
      - key: LOG_LEVEL
        value: info
      - key: CORS_ORIGIN
        value: https://myapp.com
      - key: AWS_REGION
        value: us-east-1

services:
  - type: web
    name: api-server
    envVars:
      - fromGroup: shared-config
      - key: PORT
        value: "3000"

  - type: worker
    name: job-processor
    envVars:
      - fromGroup: shared-config
```


## Examples


### Example 1: Setting up Render for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Render for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# render.yaml — Complete application infrastructure`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting dockerfile deployment issues

**User request:**

```
Render is showing errors in our dockerfile deployment. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Render issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Use render.yaml** — Infrastructure as Code is versioned with your app; no manual dashboard config to reproduce
2. **Health checks are mandatory** — Set `healthCheckPath` so Render knows when your service is ready and can route traffic
3. **Auto-scaling for production** — Configure min/max instances with CPU/memory targets instead of fixed instance counts
4. **Environment groups for shared config** — Don't duplicate environment variables across services; use `fromGroup`
5. **Use `generateValue: true` for secrets** — Let Render generate random values for JWT secrets, API keys, etc.
6. **Preview environments** — Enable pull request previews for staging; each PR gets its own URL
7. **Multi-stage Docker builds** — Keep production images small; separate build and runtime stages
8. **Database connection pooling** — Use PgBouncer or connection pooling in your ORM; Render databases have connection limits
