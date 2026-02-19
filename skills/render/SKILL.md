---
name: render
description: >-
  Deploy web services, databases, and cron jobs with Render. Use when a user
  asks to deploy a backend service, host a web app, set up managed PostgreSQL,
  or find a modern Heroku alternative with free tier.
license: Apache-2.0
compatibility: 'Node.js, Python, Go, Rust, Docker, static sites'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: deployment
  tags:
    - render
    - deploy
    - hosting
    - docker
    - postgresql
---

# Render

## Overview

Render is a cloud platform for deploying web services, static sites, cron jobs, and managed databases. It auto-deploys from Git, supports Docker, and offers a free tier for web services and PostgreSQL.

## Instructions

### Step 1: Deploy a Web Service

Connect your GitHub/GitLab repo in the Render dashboard. Render auto-detects the runtime.

```yaml
# render.yaml — Infrastructure as Code (Blueprint)
services:
  - type: web
    name: my-api
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: mydb
          property: connectionString
      - key: NODE_ENV
        value: production

databases:
  - name: mydb
    plan: free
    databaseName: myapp
```

### Step 2: Deploy with Docker

```dockerfile
# Dockerfile — Render builds and runs any Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Step 3: Cron Jobs

```yaml
# render.yaml — Scheduled job
services:
  - type: cron
    name: daily-cleanup
    runtime: node
    schedule: "0 3 * * *"
    buildCommand: npm install
    startCommand: node scripts/cleanup.js
```

## Guidelines

- Free web services sleep after 15 minutes of inactivity — first request takes ~30 seconds.
- Use Blueprints (render.yaml) for reproducible infrastructure.
- Managed PostgreSQL free tier: 256MB, auto-deleted after 90 days.
- Render supports persistent disks for stateful services.
