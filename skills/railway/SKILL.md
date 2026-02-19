---
name: railway
description: >-
  Deploy apps and databases with Railway. Use when a user asks to deploy a backend service, set up a database quickly, deploy Docker containers, or find a simple Heroku alternative.
license: Apache-2.0
compatibility: 'Node.js, Python, Go, Rust, Docker, PostgreSQL, Redis, MongoDB'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: deployment
  tags:
    - railway
    - deploy
    - hosting
    - docker
    - database
---

# Railway

## Overview
Railway deploys apps from Git or Docker with built-in databases (PostgreSQL, Redis, MySQL, MongoDB). Simple Heroku alternative with usage-based pricing.

## Instructions

### Step 1: Deploy
```bash
npm i -g @railway/cli
railway login
railway init
railway up    # deploy from current directory
```

### Step 2: Add Database
```bash
# Add PostgreSQL (auto-provisions and sets DATABASE_URL)
railway add -p postgresql
# Add Redis
railway add -p redis
```

### Step 3: Environment Variables
```bash
railway variables set API_KEY=xxx
railway variables    # list all
```

### Step 4: Dockerfile Deploy
```dockerfile
# Dockerfile — Railway auto-detects and builds
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "server.js"]
```

## Guidelines
- Railway auto-detects language/framework from your repo.
- Usage-based pricing starts at /month (includes  credit).
- Built-in databases are provisioned in seconds with auto-generated connection strings.
- Supports monorepos with root directory configuration.
