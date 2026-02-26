---
name: kamal
description: >-
  Deploy web applications to any server with Kamal — zero-downtime Docker
  deployments without Kubernetes. Use when someone asks to "deploy to a VPS",
  "deploy without Kubernetes", "Kamal deploy", "simple Docker deployment",
  "deploy Rails/Node/Python to a server", "zero-downtime deployment to bare
  metal", or "replace Heroku with a VPS". Covers Docker-based deployment, zero
  downtime with Traefik, multi-server, secrets, and accessory services.
license: Apache-2.0
compatibility: "Requires: Docker on target server, SSH access. Deploys any Docker image."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["deployment", "docker", "vps", "kamal", "zero-downtime"]
---

# Kamal

## Overview

Kamal (formerly MRSK) deploys containerized web apps to any server — VPS, bare metal, cloud VM — with zero downtime and no Kubernetes complexity. Created by 37signals (Basecamp/HEY), it uses Docker + Traefik to manage rolling deployments, SSL, and load balancing. Configure once in YAML, deploy with one command.

## When to Use

- Deploying to VPS/bare metal servers (Hetzner, DigitalOcean, Linode)
- Want zero-downtime deployments without Kubernetes
- Migrating off Heroku/Railway to self-hosted
- Need SSL, rolling deploys, and health checks with minimal config
- Multi-server deployment (web + worker + cron on different machines)

## Instructions

### Setup

```bash
gem install kamal
# Or without Ruby:
docker run -it ghcr.io/basecamp/kamal:latest

# Initialize in your project
kamal init
```

### Configuration

```yaml
# config/deploy.yml — Main deployment config
service: my-app
image: myuser/my-app

servers:
  web:
    hosts:
      - 167.235.1.100
      - 167.235.1.101
    labels:
      traefik.http.routers.my-app.rule: Host(`myapp.com`)
      traefik.http.routers.my-app-secure.entrypoints: websecure
      traefik.http.routers.my-app-secure.rule: Host(`myapp.com`)
      traefik.http.routers.my-app-secure.tls.certresolver: letsencrypt
  worker:
    hosts:
      - 167.235.1.102
    cmd: node worker.js

# Docker image registry
registry:
  server: ghcr.io
  username: myuser
  password:
    - KAMAL_REGISTRY_PASSWORD

# Environment variables
env:
  clear:
    NODE_ENV: production
    PORT: 3000
  secret:
    - DATABASE_URL
    - REDIS_URL
    - SECRET_KEY

# Traefik for load balancing + SSL
traefik:
  options:
    publish:
      - "443:443"
    volume:
      - "/letsencrypt:/letsencrypt"
  args:
    entryPoints.web.address: ":80"
    entryPoints.websecure.address: ":443"
    certificatesResolvers.letsencrypt.acme.email: admin@myapp.com
    certificatesResolvers.letsencrypt.acme.storage: /letsencrypt/acme.json
    certificatesResolvers.letsencrypt.acme.httpChallenge.entryPoint: web

# Accessories (databases, Redis, etc.)
accessories:
  db:
    image: postgres:16
    host: 167.235.1.100
    port: 5432
    env:
      secret:
        - POSTGRES_PASSWORD
    directories:
      - data:/var/lib/postgresql/data
  redis:
    image: redis:7
    host: 167.235.1.100
    port: 6379

# Health check
healthcheck:
  path: /health
  port: 3000
  max_attempts: 10
  interval: 3
```

### Deploy

```bash
# First deployment (sets up Docker, Traefik, accessories)
kamal setup

# Subsequent deployments (zero-downtime rolling)
kamal deploy

# Deploy with specific version/tag
kamal deploy --version=abc123

# Rollback to previous version
kamal rollback

# Check status
kamal details

# View logs
kamal app logs
kamal app logs -f  # Follow

# Run one-off commands
kamal app exec "node scripts/migrate.js"
kamal app exec -i "node"  # Interactive shell
```

### Secrets Management

```bash
# .kamal/secrets — Environment file (NOT committed to git)
KAMAL_REGISTRY_PASSWORD=ghp_xxx
DATABASE_URL=postgresql://user:pass@db:5432/myapp
REDIS_URL=redis://redis:6379
SECRET_KEY=super-secret-key

# Secrets from 1Password, AWS SSM, etc.
kamal secrets extract --adapter=1password --account=myteam --from=MyApp/Production
```

## Examples

### Example 1: Deploy a Next.js app to Hetzner

**User prompt:** "Deploy my Next.js app to a Hetzner VPS with SSL and zero downtime."

The agent will create a Dockerfile, configure Kamal with Traefik for SSL via Let's Encrypt, set up health checks, and deploy with `kamal setup`.

### Example 2: Multi-server deployment with worker

**User prompt:** "I have a web app and a background job worker. Deploy web to 2 servers and worker to 1."

The agent will configure Kamal with separate server roles (web × 2, worker × 1), shared environment, and rolling deployment for the web servers.

## Guidelines

- **`kamal setup` for first deploy** — installs Docker, starts Traefik, deploys accessories
- **`kamal deploy` for updates** — zero-downtime rolling deployment
- **Health check is critical** — Kamal waits for `/health` to return 200 before switching traffic
- **Accessories for databases** — Postgres, Redis managed alongside your app
- **Secrets in `.kamal/secrets`** — never in deploy.yml or git
- **Traefik handles SSL** — automatic Let's Encrypt certificates
- **Rollback is instant** — `kamal rollback` switches to previous container
- **Works with any Docker image** — not just Ruby/Rails
- **Multi-server is built-in** — add hosts, Kamal deploys to all
- **No Kubernetes needed** — for most apps, Kamal + VPS is simpler and cheaper
