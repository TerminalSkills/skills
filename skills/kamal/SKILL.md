---
name: kamal
description: >-
  Deploy web applications to any server with Kamal — zero-downtime Docker
  deployments without Kubernetes. Use when someone asks to "deploy to a VPS",
  "deploy without Kubernetes", "Kamal deploy", "simple Docker deployment",
  "deploy Rails/Node/Python to a server", "zero-downtime deployment to bare
  metal", or "replace Heroku with a VPS". Covers Docker-based deployment, zero
  downtime with kamal-proxy, multi-server, secrets, and accessory services.
license: Apache-2.0
compatibility: "Requires: Ruby (or the Docker image) on the machine you deploy from, SSH access to the servers, Docker on the build machine. Kamal installs Docker on the servers if missing."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "deployment, docker, vps, kamal, zero-downtime"
  repository: https://github.com/basecamp/kamal
---

# Kamal

## Overview

Kamal (formerly MRSK) deploys containerized web apps to any server — VPS, bare metal, cloud VM — with zero downtime and no Kubernetes. Created by 37signals (Basecamp/HEY), it builds your image, pushes it to a registry, and over SSH starts the new container behind **kamal-proxy**, which switches traffic once the container passes its health check. kamal-proxy also terminates HTTPS with automatic Let's Encrypt certificates. Current release: 2.12 (June 2026).

**Kamal 2 replaced Traefik with kamal-proxy.** Older tutorials (and Kamal 1 configs) use a `traefik:` block, `traefik.http.routers…` labels, a top-level `healthcheck:` and a `.env` file for secrets; none of that applies to Kamal 2, which reads secrets from `.kamal/secrets` (the `env.clear`/`env.secret` keys remain). Migrate a 1.x project with `kamal upgrade`.

## When to Use

- Deploying to VPS/bare metal servers (Hetzner, DigitalOcean, Linode)
- Zero-downtime deployments without Kubernetes
- Migrating off Heroku/Railway to self-hosted
- SSL, rolling deploys and health checks with minimal config
- Multiple servers with different roles (web, worker)

## Instructions

### Setup

```bash
gem install kamal          # or: bundle add kamal --group development
kamal version

# Create config/deploy.yml and .kamal/secrets in your project
kamal init
```

Without Ruby, run the official image through a shell alias (see the installation page on kamal-deploy.org); note that the usual alias mounts the Docker socket, which gives the container root on your machine, so prefer the gem.

Your app needs a `Dockerfile`, and it should answer `GET /up` with HTTP 200 (the proxy's default health check path).

### Configuration

```yaml
# config/deploy.yml
service: orders-api
image: acme-dev/orders-api

servers:
  web:
    hosts:
      - 167.235.1.100
  worker:
    hosts:
      - 167.235.1.102
    cmd: node worker.js      # worker role runs no proxy

proxy:
  ssl: true                  # Let's Encrypt via kamal-proxy; needs one web server
  host: orders.acme-dev.io   # must resolve to the server, ports 80 and 443 open
  app_port: 3000             # default is 80
  healthcheck:
    path: /up                # default; interval and timeout are also configurable

registry:
  server: ghcr.io
  username: acme-dev
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64                # build for the servers' architecture

env:
  clear:
    NODE_ENV: production
    PORT: 3000
  secret:
    - DATABASE_URL
    - SECRET_KEY

accessories:
  db:
    image: postgres:16
    host: 167.235.1.100
    port: "127.0.0.1:5432:5432"   # bind to localhost; a bare 5432:5432 is public
    env:
      clear:
        POSTGRES_USER: orders
        POSTGRES_DB: orders
      secret:
        - POSTGRES_PASSWORD
    directories:
      - data:/var/lib/postgresql/data
```

Notes: `proxy.ssl: true` works only when deploying to a single server with `host` set. With several web servers, put a load balancer in front, or supply your own certificate with `ssl: {certificate_pem: CERT_SECRET, private_key_pem: KEY_SECRET}` (names of secrets). When `ssl` is on, kamal-proxy stops forwarding `X-Forwarded-*` headers unless you set `forward_headers: true`. Other useful keys: `response_timeout` (default 30 s), `ssl_redirect`, `path_prefix`, `buffering`. Run `kamal docs proxy` for the full list. Configuration for a staging copy goes in `config/deploy.staging.yml` and is selected with `-d staging`.

### Deploy

```bash
kamal setup                  # first time: installs Docker, boots kamal-proxy and accessories, deploys
kamal deploy                 # build, push, start new container, switch traffic
kamal redeploy               # deploy without bootstrapping servers or touching the proxy
kamal deploy --version=3f9c2ab   # deploy a specific git version

kamal rollback 3f9c2ab       # VERSION is required; list versions with `kamal app containers`
kamal details                # containers on all servers
kamal app version            # version currently running
kamal audit                  # audit log of past actions

kamal app logs -f            # follow logs
kamal app exec "node scripts/migrate.js"   # run in a fresh container
kamal app exec --reuse "node scripts/migrate.js"   # run in the running container
kamal app exec -i sh         # interactive shell over SSH

kamal accessory reboot db    # manage accessories
kamal lock release           # clear a stale deploy lock
```

### Secrets

`.kamal/secrets` is read by Kamal on your machine; it is safe to commit **only if it contains no raw values** — reference environment variables, commands or a password manager. Secrets named under `env.secret`, `registry.password` and accessory `env.secret` are looked up there. With destinations, shared secrets go in `.kamal/secrets-common` and per-destination ones in `.kamal/secrets.<destination>`.

```bash
# .kamal/secrets
KAMAL_REGISTRY_PASSWORD=$KAMAL_REGISTRY_PASSWORD        # from your shell
SECRET_KEY=$(cat config/master.key)                     # from a file or command

# From 1Password (adapters also exist for Bitwarden, LastPass, AWS, Doppler and others)
SECRETS=$(kamal secrets fetch --adapter 1password --account acme-team --from Production/orders-api DATABASE_URL POSTGRES_PASSWORD)
DATABASE_URL=$(kamal secrets extract DATABASE_URL $SECRETS)
POSTGRES_PASSWORD=$(kamal secrets extract POSTGRES_PASSWORD $SECRETS)
```

## Examples

### Example 1: Deploy a Next.js app to Hetzner

**User prompt:** "Deploy my Next.js app to a Hetzner VPS with SSL and zero downtime. Domain is shop.acme-dev.io."

Add a `Dockerfile` that runs `node server.js` on port 3000 and an `/up` route that returns 200. Set `proxy: {ssl: true, host: shop.acme-dev.io, app_port: 3000}`, the server IP under `servers.web.hosts`, and the registry block. Point the domain's A record at the server, put `KAMAL_REGISTRY_PASSWORD=$KAMAL_REGISTRY_PASSWORD` in `.kamal/secrets`, export the token, then run `kamal setup`. The output ends with the new container passing its health check and `Finished all in ...`; https://shop.acme-dev.io serves the app with a Let's Encrypt certificate. Later deploys use `kamal deploy`.

### Example 2: Web servers plus a background worker

**User prompt:** "I have a web app and a job worker. Run web on two servers and the worker on a third."

Define `servers.web.hosts` with two IPs and `servers.worker` with one IP and `cmd: node worker.js`. Because there are two web servers, leave `proxy.ssl` off and terminate TLS at a load balancer (or provide a custom certificate). `kamal deploy` boots new containers on all hosts in parallel by default (set `boot.limit` and `boot.wait` to roll through them in groups); the worker role runs without a proxy and has no health check. `kamal app logs -r worker` shows only worker logs.

## Guidelines

- **`kamal setup` once, `kamal deploy` afterwards.** `setup` also boots accessories.
- **The health check gates traffic.** kamal-proxy polls `/up` by default and switches only when it returns 200; a failing check aborts the deploy and the old container keeps serving. Change it under `proxy.healthcheck`.
- **Rollback needs a version**: `kamal rollback <version>` restarts a retained older container (the last 5 are kept; see `retain_containers`).
- **Secrets never go in `deploy.yml` or as raw values in `.kamal/secrets`.** `kamal config` prints resolved secrets, so do not paste its output into tickets.
- **Accessories are not zero-downtime or backed up.** Publish ports on 127.0.0.1 or the private network only, and run your own backups. For production data, a managed database is often safer.
- **A concurrent deploy fails on the deploy lock**; use `--lock-wait` in CI or `kamal lock release` if a run was killed.
- **Hooks** in `.kamal/hooks/` (for example `pre-deploy`) run on your machine around deploys.
- **Multi-architecture:** if you build on an Apple Silicon laptop for amd64 servers, set `builder.arch` (and a `builder.remote` if emulation is slow).
