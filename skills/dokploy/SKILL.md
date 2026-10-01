---
name: dokploy
description: >-
  Dokploy is an open-source, self-hosted platform (an alternative to Heroku,
  Vercel and Netlify) that deploys applications, Docker Compose stacks and
  databases on your own server with Docker Swarm and Traefik, a web dashboard,
  automatic Let's Encrypt certificates and an HTTP API. Use when a user asks
  to "install Dokploy on a VPS", "deploy an app with Dokploy", "deploy a
  docker-compose project to Dokploy", "add a domain with HTTPS", "trigger a
  Dokploy deployment from CI", "create a Postgres database in Dokploy" or
  "set up zero-downtime deploys".
license: Apache-2.0
compatibility: "Linux server (Ubuntu, Debian, Fedora or CentOS) with root access, at least 2 GB RAM and 30 GB disk, ports 80, 443 and 3000 free. The CLI needs Node.js 18+. Checked against Dokploy v0.30.8."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/Dokploy/dokploy
  tags:
  - self-hosted
  - paas
  - deployment
  - docker
  - vps
---

# Dokploy — Self-Hosted PaaS

## Overview

Dokploy runs as a Docker Swarm service on your server, with Traefik in front as the reverse proxy and Postgres for its own state. Everything is organised as project → environment → service, where a service is an **application** (one container built from a Git repository or pulled as an image), a **compose** project, or a **database**. Configuration lives in the dashboard, the HTTP API and the CLI. There is no `dokploy.yml` file in the repository: build and runtime settings are stored by Dokploy, not read from your code.

## Instructions

### 1. Install

The documented installer is a shell script from dokploy.com that is meant to be piped straight into a root shell. Do not run it that way. Every release publishes the same script as an asset with a SHA-256 digest on its GitHub release page, so download it, compare, read it, then run it:

```bash
# Docker first, from your distribution or Docker's package repository; without it the script fetches a second installer
docker --version

curl -sSfL -o install.sh https://github.com/Dokploy/dokploy/releases/download/v0.30.8/install.sh
echo "534679c2f2730d369302df4e938d4dfaec177731b6d91cb87d8ecc7ca7cbc9bd  install.sh" | sha256sum -c -
less install.sh
sudo sh install.sh
```

Take the digest from the release page of the version you install (shown next to the asset). What the script does: checks that ports 80, 443 and 3000 are free, runs `docker swarm leave --force` and `docker swarm init`, creates the `dokploy-network` overlay network and `/etc/dokploy`, then starts `dokploy-postgres`, the `dokploy` service and a `dokploy-traefik` container. **On a machine that already belongs to a swarm this destroys that swarm**; follow the manual installation page instead.

Variables the script reads (pass them inline, `sudo` drops exported ones): `ADVERTISE_ADDR=10.0.0.5` to pick the swarm address, `DOCKER_SWARM_INIT_ARGS="--default-addr-pool 172.20.0.0/16 --default-addr-pool-mask-length 24"` to avoid a clash with a cloud VPC range, `ENDPOINT_MODE=dnsrr` for kernels without IPVS (Proxmox LXC is detected automatically).

```bash
sudo ADVERTISE_ADDR=10.0.0.5 sh install.sh
```

Then open `http://203.0.113.10:3000` (your server's address, plain HTTP) and create the admin account. Assign the panel its own domain with HTTPS in the dashboard's server settings, confirm that the domain works, and only then close the raw port (otherwise you lock yourself out):

```bash
docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy
```

Update: download and verify the newer release's `install.sh` and run `sudo sh install.sh update`. It pulls the `dokploy/dokploy` image with the tag the script was released with (here `v0.30.8`) and updates the `dokploy` service.

### 2. Deploy an application

In a project, create an Application and set:

- **Source** — GitHub (auto-deploys on push once the GitHub app is connected), GitLab, Bitbucket, Gitea, any Git URL with an SSH key, a Docker image, or a dropped archive.
- **Build type** — Nixpacks (default), Railpack (its successor), Dockerfile, Heroku or Paketo buildpacks, or Static (served by Nginx from a publish directory). Nixpacks and Railpack are tuned with environment variables such as `NIXPACKS_BUILD_CMD`, `NIXPACKS_START_CMD`, `RAILPACK_BUILD_CMD`, `RAILPACK_START_CMD`.
- **Environment** — plain `KEY=value` lines. `${{project.DATABASE_URL}}` and `${{environment.API_KEY}}` reference shared variables defined on the project or environment; `${{OTHER_VAR}}` references a variable of the same service.
- **Domains** — host, container port, HTTPS on/off and certificate (`letsencrypt`, `none` or `custom`). A generated `traefik.me` domain works for HTTP only. For Let's Encrypt, point the DNS A record at the server first. Domain changes on applications apply immediately.
- **Advanced** — replicas, CPU and memory limits, volumes and file mounts, published ports, Swarm settings.

Building on a small server can exhaust its memory and freeze every app on it. For production, build the image in CI, push it to a registry, set the source to Docker, and trigger the deployment through the registry webhook or the API (section 5).

### 3. Deploy a Docker Compose project

Create a Compose service (type Docker Compose, or Stack for `docker stack deploy` where `build:` is not available), point it at the repository and the compose path, and adapt the file:

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: ./api
    expose:
      - "3000"
    env_file:
      - .env                      # Dokploy writes the Environment tab into .env next to this file
    depends_on:
      - db

  worker:
    build:
      context: ./worker
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=orders
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:8-alpine
    volumes:
      - ../files/redis:/data       # bind mounts must live under ../files to survive deployments

volumes:
  pgdata:
```

Rules that differ from running Compose by hand:

- Variables from the Environment tab are not injected automatically: use `env_file: .env` or `${VAR}` references.
- Add domains in the service's **Domains** tab (choose the compose service and its port). Dokploy adds the Traefik labels and attaches that service to `dokploy-network` at deploy time; **Preview Compose** shows the result. Domain changes need a redeploy.
- With **Isolated Deployments** enabled, every service of the project joins one private network and nothing else is needed. Without it only the service with the domain is moved to `dokploy-network`, so add that network to the services it talks to as well.
- Do not publish host ports (`"3000:3000"`) for services behind Traefik and do not set `container_name`; it breaks logs and metrics.
- Absolute host paths in `volumes` are cleaned up on deploy. Use named volumes (they can be backed up by Volume Backups) or `../files/...`.
- If you write Traefik labels yourself, add the service to the external `dokploy-network` and give every router and service a unique name; under Stack mode the labels go in `deploy.labels`.

### 4. Databases and backups

Dokploy creates Postgres, MySQL, MariaDB, MongoDB and Redis instances from the dashboard: choose name, database, user, password and image tag, then Deploy. Other services reach the database on the internal network by the host name shown in its connection settings; set an External Port only when something outside the server must connect.

Backups: add an S3-compatible destination under Settings → S3 Destinations (AWS S3, Cloudflare R2, Backblaze B2, Google Cloud Storage), then in the database's Backups tab pick the destination, database name, a cron schedule such as `0 2 * * *` and a prefix, and press **Test** once to confirm a file lands in the bucket.

### 5. Automate with the API and CLI

Generate a token in Settings → Profile → API/CLI (give it an expiry). The API lives at `/api` on the panel, authenticates with the `x-api-key` header, and is browsable at `/swagger`.

```bash
export DOKPLOY_URL=https://panel.northwind.dev
# DOKPLOY_API_KEY comes from the CI secret store

# List projects with their environments and services, to find applicationId / composeId
curl -sS "$DOKPLOY_URL/api/project.all" -H "x-api-key: $DOKPLOY_API_KEY" -H "accept: application/json"

# Deploy an application, or a compose project
curl -sS -X POST "$DOKPLOY_URL/api/application.deploy" \
  -H "x-api-key: $DOKPLOY_API_KEY" -H "Content-Type: application/json" \
  -d '{"applicationId": "hV3xQ9pLm2Zr8tKfYc1Bd"}'
curl -sS -X POST "$DOKPLOY_URL/api/compose.deploy" \
  -H "x-api-key: $DOKPLOY_API_KEY" -H "Content-Type: application/json" \
  -d '{"composeId": "Tq7nWs4GdE0uJx5AoPi2M"}'

# Replace an application's environment (all five fields are required)
curl -sS -X POST "$DOKPLOY_URL/api/application.saveEnvironment" \
  -H "x-api-key: $DOKPLOY_API_KEY" -H "Content-Type: application/json" \
  -d '{"applicationId": "hV3xQ9pLm2Zr8tKfYc1Bd", "env": "NODE_ENV=production\nLOG_LEVEL=info", "buildArgs": null, "buildSecrets": null, "createEnvFile": true}'
```

Endpoints are named `router.procedure`: reads are GET with query parameters (`application.one?applicationId=...`, `deployment.all?applicationId=...`), writes are POST with a JSON body (`application.redeploy`, `application.stop`, `application.start`, `domain.create`, `postgres.create`). The CLI wraps the same procedures:

```bash
npm install -g @dokploy/cli
dokploy auth -u https://panel.northwind.dev -t "$DOKPLOY_API_KEY"   # or just set DOKPLOY_URL and DOKPLOY_API_KEY
dokploy project all --json
dokploy application deploy --applicationId hV3xQ9pLm2Zr8tKfYc1Bd
dokploy application save-environment --help
```

### 6. Zero downtime, rollbacks, notifications

By default a deploy stops the old container before the new one is ready, which shows as a Bad Gateway. In the application's Advanced → Cluster Settings → Swarm Settings, set **Health Check** (times are nanoseconds; the image must contain `curl`):

```json
{
  "Test": ["CMD", "curl", "-f", "http://localhost:3000/health"],
  "Interval": 30000000000,
  "Timeout": 10000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

and **Update Config**, so a release that never becomes healthy is rolled back:

```json
{ "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "start-first" }
```

Notifications are configured under Settings → Notifications for Slack, Discord, Telegram, Mattermost, Microsoft Teams, Lark, email, Resend, Gotify, Ntfy, Pushover or a generic webhook, on these events: app deploy, app build error, database backup, volume backup, Docker cleanup, Dokploy restart. Each service has CPU, memory, disk and network graphs and a log viewer in the dashboard.

## Examples

### Example 1: Install Dokploy on a fresh VPS and deploy a Node.js API

**User request:**

```
I have a new Ubuntu 24.04 server at 203.0.113.10 with Docker installed. Put Dokploy on it and deploy github.com/northwind-dev/orders-api at api.northwind.dev.
```

The agent runs the verified install from section 1 as root. The script ends with:

```
Congratulations, Dokploy is installed!
Wait 15 seconds for the server to start
Please go to http://203.0.113.10:3000
```

It then walks the user through the dashboard: create the admin account, connect GitHub in the Git section, create project `northwind`, add an Application with source `northwind-dev/orders-api`, branch `main`, build type Dockerfile, add `DATABASE_URL` in Environment, and add the domain `api.northwind.dev` on container port 3000 with HTTPS and Let's Encrypt after the A record points at `203.0.113.10`. Pressing Deploy builds the image and starts the service; `curl -I https://api.northwind.dev/health` answers `HTTP/2 200` once the certificate is issued. Finally the agent adds the health check from section 6 and closes port 3000.

### Example 2: Deploy from GitHub Actions after the image is pushed

**User request:**

```
Our CI already pushes ghcr.io/northwind-dev/orders-api:latest. Make Dokploy redeploy when the push finishes.
```

The agent sets the application's source to Docker with that image, stores a Dokploy token as the repository secret `DOKPLOY_API_KEY`, and appends a step to the workflow:

```yaml
      - name: Trigger Dokploy deployment
        env:
          DOKPLOY_API_KEY: ${{ secrets.DOKPLOY_API_KEY }}
        run: |
          curl -sS --fail -X POST "https://panel.northwind.dev/api/application.deploy" \
            -H "x-api-key: $DOKPLOY_API_KEY" -H "Content-Type: application/json" \
            -d '{"applicationId": "hV3xQ9pLm2Zr8tKfYc1Bd"}'
```

`--fail` makes the job red when the panel rejects the token. A new entry appears in the application's Deployments tab within seconds and the server only pulls the image, without building anything.

## Guidelines

1. **Never pipe the installer into a shell** — download the release asset, check its SHA-256, read it, then run it; it runs as root and reinitialises Docker Swarm.
2. **Keep port 3000 off the internet** — serve the panel on a domain with HTTPS (or behind a VPN) and remove the published port; enable two-factor authentication for the admin.
3. **UFW does not filter Docker-published ports** — Docker writes its own iptables rules; allow only 22, 80 and 443 and use the provider's firewall or `ufw-docker`.
4. **Dokploy holds the Docker socket** — whoever controls the panel or an API token controls the host; give tokens an expiry and one token per integration.
5. **Build in CI, not on the server** — builds compete with running apps for memory.
6. **Secrets go in the Environment tab or a secrets provider** — never in the compose file or the repository; reference shared values with `${{project.NAME}}`.
7. **Test restores** — a scheduled backup is unproven until one has been restored from the bucket.
8. **Match branch and tag** — a webhook for another branch or image tag is ignored ("Branch Not Match").
9. **When not to use it** — on a host that already runs another orchestrator or needs ports 80/443 for something else; Dokploy expects to own Swarm and the reverse proxy.
