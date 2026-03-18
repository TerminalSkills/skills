---
name: dokku
description: >-
  Deploy apps with Dokku — self-hosted Heroku alternative on any VPS. Use when: self-hosting
  web apps without Kubernetes, setting up git-push deployments, running PaaS on your own server.
license: Apache-2.0
compatibility: "Ubuntu 22.04/20.04 or Debian 11/12 VPS"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: [dokku, self-hosted, deployment, paas, heroku-alternative, vps]
  use-cases:
    - "Deploy a Node.js/Python/Ruby app to a DigitalOcean droplet with git push"
    - "Set up Postgres and Redis for a self-hosted SaaS app"
    - "Add custom domain with automatic SSL via Let's Encrypt"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Dokku

## Overview

Dokku is an open-source PaaS that turns any VPS into a Heroku-like platform. Deploy apps with `git push`, manage databases with plugins, and get automatic SSL — all on infrastructure you control.

## Install on VPS

```bash
# Ubuntu 22.04 (run as root)
wget -NP . https://dokku.com/install/v0.35.0/bootstrap.sh
sudo DOKKU_TAG=v0.35.0 bash bootstrap.sh

# Set up SSH key and hostname
cat ~/.ssh/authorized_keys | dokku ssh-keys:add admin
dokku domains:set-global yourdomain.com
```

## Deploy an App

```bash
# On your VPS: create app
dokku apps:create myapp

# On your local machine: add remote and push
git remote add dokku dokku@your-server.com:myapp
git push dokku main
```

Dokku auto-detects buildpacks (Node.js, Python, Ruby, Go, etc.) or uses your `Dockerfile`.

## Procfile

```
web: node server.js
worker: node worker.js
release: npm run migrate
```

## Environment Variables

```bash
# Set config vars
dokku config:set myapp NODE_ENV=production SECRET_KEY=abc123

# View all vars
dokku config:show myapp

# Import from .env file
cat .env | xargs dokku config:set myapp
```

## PostgreSQL Plugin

```bash
# Install plugin
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres

# Create database and link to app
dokku postgres:create myapp-db
dokku postgres:link myapp-db myapp
# Sets DATABASE_URL automatically
```

## Redis Plugin

```bash
sudo dokku plugin:install https://github.com/dokku/dokku-redis.git redis
dokku redis:create myapp-redis
dokku redis:link myapp-redis myapp
# Sets REDIS_URL automatically
```

## Custom Domains + SSL

```bash
# Add domain
dokku domains:add myapp myapp.com www.myapp.com

# Install Let's Encrypt plugin
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
dokku config:set --global DOKKU_LETSENCRYPT_EMAIL=you@email.com

# Enable SSL
dokku letsencrypt:enable myapp
dokku letsencrypt:cron-job --add  # auto-renew
```

## Zero-Downtime Deploys

```bash
# Enable checks (waits for app to respond before switching)
dokku checks:enable myapp

# Or use rolling restarts
dokku ps:set-restart-policy myapp always
```

## Scaling

```bash
# Scale web processes
dokku ps:scale myapp web=2 worker=1

# View process status
dokku ps:report myapp
```

## Persistent Storage

```bash
# Mount a directory (for uploads, etc.)
dokku storage:mount myapp /var/lib/dokku/data/storage/myapp:/app/uploads
```

## Useful Commands

```bash
dokku apps:list           # List all apps
dokku logs myapp -t       # Tail logs
dokku run myapp bash      # Open shell in container
dokku ps:restart myapp    # Restart app
dokku backup              # Backup all data
```

## Dockerfile Deploy

Dokku auto-uses your `Dockerfile` if present. Expose a port and Dokku routes traffic to it:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## Multi-Server Setup

```bash
# Add additional nodes (Dokku Scheduler)
dokku scheduler:set myapp selected docker-local

# Or use Kubernetes scheduler plugin for K8s deployments
sudo dokku plugin:install https://github.com/dokku/dokku-scheduler-kubernetes.git
```
