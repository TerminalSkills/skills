---
name: dokku
description: >-
  Dokku is an open-source, single-server platform-as-a-service: it builds an
  app from a git push (buildpacks or a Dockerfile), runs it in Docker
  containers behind nginx, and manages domains, TLS, config and datastores
  through one CLI. Use when a user asks to "self-host a Heroku alternative",
  "set up git push deploys on a VPS", "deploy my app with Dokku", "add
  Postgres or Redis to a Dokku app", "get Let's Encrypt on Dokku", or "fix
  ports for a Dockerfile app on Dokku". Covers installation from the apt
  repository, deploys, environment variables, plugins, zero-downtime checks,
  storage and the k3s scheduler.
license: Apache-2.0
compatibility: "Ubuntu 22.04/24.04/26.04 or Debian 11+ server (amd64 or arm64) with at least 1 GB RAM and root access"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/dokku/dokku
  tags: [dokku, self-hosted, paas, heroku-alternative, deployment]
  use-cases:
    - "Deploy a Node.js/Python/Ruby app to a DigitalOcean droplet with git push"
    - "Set up Postgres and Redis for a self-hosted SaaS app"
    - "Add custom domain with automatic SSL via Let's Encrypt"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Dokku

## Overview

Dokku is an open-source PaaS that turns any VPS into a Heroku-like platform. Deploy apps with `git push`, manage databases with plugins, and get automatic SSL — all on infrastructure you control. This skill targets Dokku 0.38 (latest release v0.38.31, September 2026).

## Instructions

### Install on a VPS

Dokku ships as a Debian package in its own apt repository. Install Docker from the distribution first, then add the repository with its signing key:

```bash
# Ubuntu 22.04/24.04/26.04, as a user with sudo
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 docker-buildx wget gpg
# Debian 13: docker.io docker-compose docker-buildx
# Debian 11/12 have no buildx package: add Docker's own apt repository and install
#   docker-ce docker-compose-plugin docker-buildx-plugin

wget -qO dokku.asc https://packagecloud.io/dokku/dokku/gpgkey
gpg --show-keys --with-fingerprint dokku.asc     # inspect the key before trusting it
sudo install -d -m 0755 /etc/apt/keyrings
sudo gpg --dearmor -o /etc/apt/keyrings/dokku.gpg dokku.asc

. /etc/os-release
echo "deb [signed-by=/etc/apt/keyrings/dokku.gpg] https://packagecloud.io/dokku/dokku/${ID}/ ${VERSION_CODENAME} main" \
  | sudo tee /etc/apt/sources.list.d/dokku.list
sudo apt-get update
sudo apt-get install -y dokku
sudo dokku plugin:install-dependencies --core
```

The repository carries the suites `jammy`, `noble` and `resolute` (Ubuntu) and `bullseye`, `bookworm`, `trixie` (Debian), so `${VERSION_CODENAME}` resolves on every supported release. The package's debconf questions (virtual hosts, hostname, initial SSH key file) can be preseeded with `debconf-set-selections` for unattended installs.

The project's quick start offers a bootstrap script that performs the same steps. It is published without a checksum, so use the apt repository above instead.

Finish the installation with a deploy key and a global domain:

```bash
cat ~/.ssh/authorized_keys | sudo dokku ssh-keys:add admin   # one key per call; with several keys in the file, pass a single .pub file instead
dokku domains:set-global apps.northwind.dev    # wildcard A record *.apps.northwind.dev -> server IP
```

Upgrade later with `sudo apt-get update` followed by `sudo apt-get --no-install-recommends install dokku herokuish sshcommand plugn gliderlabs-sigil dokku-update dokku-event-listener`, then `dokku ps:rebuild --all`; read the migration guide of every minor version you cross.

### Deploy an App

```bash
# On your VPS: create app
dokku apps:create invoice-api

# On your local machine: add remote and push (the SSH user must be "dokku")
git remote add dokku dokku@dokku.northwind.dev:invoice-api
git push dokku main
```

Buildpacks (Herokuish) are the default builder. A `Dockerfile` in the repository root is used instead, unless a `.buildpacks` file, a `BUILDPACK_URL` variable or a `project.toml` is present; force the choice with `dokku builder:set invoice-api selected dockerfile`. Buildpack apps must listen on `$PORT`. On arm64 servers Herokuish is blocked by default: deploy with a Dockerfile, or allow it with `dokku builder-herokuish:set --global allowed true`.

### Procfile

```
web: node server.js
worker: node worker.js
release: npm run migrate
```

`release` runs after the image is built and before new containers start.

### Environment Variables

```bash
# Set config vars (restarts the app)
dokku config:set invoice-api NODE_ENV=production SESSION_SECRET="$SESSION_SECRET"
# Set without a restart, for example before the first deploy
dokku config:set --no-restart invoice-api LOG_LEVEL=info
# View all vars
dokku config:show invoice-api
# Import a KEY=VALUE file that is on the server (Dokku 0.37+)
dokku config:import invoice-api /home/deploy/invoice-api.env
```

Do not set `PORT` yourself; Dokku derives it from the port mapping.

### PostgreSQL and Redis Plugins

```bash
# Install plugin (root)
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git --name postgres

# Create database and link to app
dokku postgres:create invoice-db
dokku postgres:link invoice-db invoice-api      # sets DATABASE_URL automatically
# Dump and restore
dokku postgres:export invoice-db > invoice-db.dump
dokku postgres:import invoice-db < invoice-db.dump
# Redis follows the same pattern
sudo dokku plugin:install https://github.com/dokku/dokku-redis.git --name redis
dokku redis:create invoice-cache
dokku redis:link invoice-cache invoice-api      # sets REDIS_URL automatically
```

### Custom Domains + SSL

```bash
# Add domain (its DNS record must already point at the server)
dokku domains:add invoice-api invoices.northwind.dev
# Install Let's Encrypt plugin
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
dokku letsencrypt:set --global email ops@northwind.dev
# Enable SSL (the app must be deployed and reachable over HTTP first)
dokku letsencrypt:enable invoice-api
dokku letsencrypt:cron-job --add  # auto-renew
```

Run `letsencrypt:enable` again after adding or changing domains.

### Zero-Downtime Deploys

Checks are on by default: Dokku starts the new containers, waits (10 seconds unless a healthcheck is defined), switches nginx over, and retires the old containers 60 seconds later. Define a real healthcheck in `app.json` at the repository root:

```json
{
  "healthchecks": {
    "web": [
      { "type": "startup", "name": "web ready", "path": "/healthz", "attempts": 5, "timeout": 5 }
    ]
  }
}
```

```bash
dokku checks:set invoice-api wait-to-retire 30         # shorter drain period
dokku ps:set invoice-api restart-policy on-failure:20  # default is on-failure:10; needs ps:rebuild
```

### Scaling

```bash
dokku ps:scale invoice-api web=2 worker=1    # Scale web and worker processes
dokku ps:report invoice-api                  # View process status
```

### Persistent Storage

```bash
# Dokku 0.38+: a named entry under /var/lib/dokku/data/storage, mounted into the app
dokku storage:create invoice-uploads --chown root     # root for typical Dockerfile images; default suits Herokuish
dokku storage:mount invoice-api invoice-uploads --container-dir /app/uploads
dokku ps:restart invoice-api                          # mounts apply on restart

# Older host-path form, still accepted with the default docker-local scheduler
dokku storage:mount invoice-api /var/lib/dokku/data/storage/invoice-api:/app/uploads
```

### Useful Commands

```bash
dokku apps:list                  # List all apps
dokku logs invoice-api -t        # Tail logs
dokku logs:failed invoice-api    # Output of the last failed deploy
dokku run invoice-api bash       # One-off container from the app image
dokku enter invoice-api web      # Shell in a running container
dokku ps:restart invoice-api     # Restart app
dokku ps:rebuild invoice-api     # Rebuild and redeploy from the stored source
```

Commands that do not need root also work remotely: `ssh -t dokku@dokku.northwind.dev logs invoice-api -t`.

### Dockerfile Deploy

With `EXPOSE`, Dokku publishes that same port number on the host (`:3000` here), not port 80. Map it explicitly:

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
dokku ports:set invoice-api http:80:3000    # replaces all mappings; if the app already has a certificate, pass https:443:3000 too
```

Variables from `config:set` are available at run time only for Dockerfile builds, not during `docker build`.

### Multi-Server Setup

The built-in k3s scheduler replaces the archived `dokku-scheduler-kubernetes` plugin. It needs an image registry configured and 2 GB RAM per node.

```bash
sudo dokku scheduler-k3s:initialize        # must run as root
dokku scheduler-k3s:cluster:add ssh://root@worker-1.northwind.dev
dokku scheduler:set invoice-api selected k3s
```

## Examples

### Example 1: Deploy a Node.js API with Postgres and HTTPS

**User request:** "Put our invoice API on the new Hetzner box with Dokku, with a database and a certificate."

```bash
# On the server
dokku apps:create invoice-api
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git --name postgres
dokku postgres:create invoice-db
dokku postgres:link invoice-db invoice-api
dokku config:set --no-restart invoice-api NODE_ENV=production SESSION_SECRET="$SESSION_SECRET"
dokku domains:set invoice-api invoices.northwind.dev

# On the developer machine
git remote add dokku dokku@dokku.northwind.dev:invoice-api
git push dokku main

# Back on the server, once the app answers over HTTP
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
dokku letsencrypt:set invoice-api email ops@northwind.dev
dokku letsencrypt:enable invoice-api
```

The push ends with:

```
=====> Application deployed:
       http://invoices.northwind.dev
```

After `letsencrypt:enable` the same host answers on `https://invoices.northwind.dev`, and `dokku config:show invoice-api` lists `DATABASE_URL` next to the variables set by hand.

### Example 2: A Dockerfile app is reachable only on port 3000

**User request:** "The deploy succeeded but the site only loads at invoices.northwind.dev:3000."

```bash
dokku ports:list invoice-api
# -----> Port mappings for invoice-api
# -----> scheme             host port                 container port
# http                      3000                      3000

dokku ports:set invoice-api http:80:3000
dokku ports:list invoice-api
# http                      80                        3000
```

nginx is reconfigured immediately and the site loads on port 80. The mapping is kept across later pushes. When a certificate is added afterwards, Dokku adds `https:443:3000` itself; on an app that already has one, set both `http:80:3000` and `https:443:3000`.

## Guidelines

- **No built-in backup command.** `dokku backup` was removed long ago. Back up by archiving `/home/dokku`, `/var/lib/dokku/config`, `/var/lib/dokku/data`, `/var/lib/dokku/services` and `/var/lib/dokku/plugins` while no deploy is running, and export databases with the datastore plugin (`postgres:export`, or `postgres:backup` to S3).
- **Old commands and variables.** `ps:set-restart-policy` is now `ps:set <app> restart-policy`; `DOKKU_LETSENCRYPT_EMAIL` is now `letsencrypt:set ... email`; `DOKKU_SKIP_DEPLOY`, `DOKKU_CHECKS_*` and similar `DOKKU_*` config variables became plugin properties in 0.38 and no longer have any effect through `config:set`.
- **Plugin installs need root** (`sudo dokku plugin:install ...`) and run third-party code as root; install only the official `dokku/*` plugins or ones you have read.
- **`config:set` restarts the app** unless `--no-restart` is given, and values are visible to anyone with `dokku` access through `config:show`.
- **Memory.** Builds on servers with less than 1 GB RAM fail unpredictably; add swap or build elsewhere and deploy an image with `dokku git:from-image`.
- **Deploy branch.** Each app deploys one branch: `master` by default, or whichever branch was pushed first. Change it with `dokku git:set invoice-api deploy-branch main`.
- **Datastores share the host.** The official plugins run each service as a container on the Dokku server, so a lost disk takes app and database together. Schedule dumps to another machine.
- **Destructive commands** (`apps:destroy`, `postgres:destroy`, `storage:destroy`) ask for the name as confirmation; never pass `--force` in scripts you have not reviewed.
- **When not to use it.** Dokku is one server by default. For multi-region or autoscaled workloads use a managed platform or Kubernetes; the k3s scheduler helps with a few nodes but adds a registry and cluster to operate.
