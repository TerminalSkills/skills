---
title: Deploy a Full-Stack App with Docker Compose and Nginx
slug: deploy-fullstack-app-with-docker-helper
description: Containerize a Node.js API, PostgreSQL database and React frontend behind an Nginx reverse proxy with health checks, Let's Encrypt SSL, backups and CI deployments on a single small VPS.
skills:
  - docker-helper
  - nginx
  - postgresql
  - github-actions
category: devops
tags:
  - docker
  - deployment
  - self-hosting
  - vps
  - production
---

# Deploy a Full-Stack App with Docker Compose and Nginx

Rina built a project management SaaS and runs it on a $20/month VPS. She deploys by SSH-ing in, pulling code and restarting pm2. Each deploy means a minute of downtime, and twice a Node.js version mismatch between her laptop and the server caused cryptic errors. She wants reproducible deployments, SSL, automated backups and updates that need no manual steps on the server.

## Step 1: Define the service stack

Ask the **docker-helper** skill for a `compose.yaml` with an API, PostgreSQL, Redis and Nginx. Only Nginx publishes ports, and every dependency has a health check.

```yaml
# compose.yaml in /opt/app on the VPS
services:
  api:
    image: ${API_IMAGE:?set API_IMAGE, the deploy job exports it}
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD:?set it in .env}@db:5432/projectmgr
      REDIS_URL: redis://cache:6379
      JWT_SECRET: ${JWT_SECRET:?set it in .env}
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://127.0.0.1:3000/health"]
      interval: 15s
      start_period: 10s

  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: projectmgr
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set it in .env}
    volumes:
      - db-data:/var/lib/postgresql        # Postgres 18+ keeps data in a versioned subfolder
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d projectmgr"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  cache:
    image: redis:8-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
    restart: unless-stopped

  nginx:
    image: nginx:1.30-alpine
    # The image's default nginx.conf already includes /etc/nginx/conf.d/*.conf
    command: >-
      /bin/sh -c "while :; do sleep 6h; nginx -s reload; done & exec nginx -g 'daemon off;'"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./frontend/dist:/usr/share/nginx/html:ro   # built React app, copied by CI
      - certbot-conf:/etc/letsencrypt:ro
      - certbot-www:/var/www/certbot:ro
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - certbot-conf:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    entrypoint: /bin/sh -c 'trap exit TERM; while :; do certbot renew --quiet; sleep 12h & wait $${!}; done'
    restart: unless-stopped

volumes:
  db-data:
  certbot-conf:
  certbot-www:
```

Compose substitutes `${DB_PASSWORD}` and `${JWT_SECRET}` from a `.env` file in `/opt/app` (`chmod 600 .env`, never committed). The `:?` form makes `docker compose` refuse to start when one is missing. Check the result with `docker compose config`. The Nginx command reloads every 6 hours so renewed certificates are picked up.

## Step 2: Configure Nginx as a reverse proxy

The **nginx** skill writes the proxy configuration. Nginx serves the React build as static files and proxies `/api/` to the API. Issue the certificate first, so start with the HTTP-only file.

```nginx
# nginx/conf.d/00-http.conf
upstream api_backend {
    server api:3000;      # Docker DNS resolves the service name
}

server {
    listen 80;
    server_name app.rina.dev;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

Issue the certificate with the webroot method, which is also what `certbot renew` will reuse. Use your real domain and e-mail:

```console
$ docker compose up -d nginx api db cache
$ docker compose run --rm --entrypoint certbot certbot certonly --webroot \
    -w /var/www/certbot -d app.rina.dev --email you@example.com --agree-tos --no-eff-email
```

Then add the HTTPS server as a second file and reload:

```nginx
# nginx/conf.d/10-https.conf
server {
    listen 443 ssl;
    http2 on;                      # the "listen ... http2" parameter is deprecated since nginx 1.25.1
    server_name app.rina.dev;
    ssl_certificate     /etc/letsencrypt/live/app.rina.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.rina.dev/privkey.pem;

    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;        # SPA fallback
    }
}
```

```console
$ docker compose exec nginx sh -c 'nginx -t && nginx -s reload'
```

`ssl_stapling` is left out on purpose: Let's Encrypt stopped including OCSP URLs in its certificates in 2025, so there is nothing to staple.

## Step 3: Multi-stage Dockerfile for the API

```dockerfile
# Dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
# the official image ships a non-root "node" user
USER node
CMD ["node", "dist/server.js"]
```
Add a `.dockerignore` with `node_modules`, `.git` and `.env` so secrets never enter the build context.

## Step 4: Deploy from GitHub Actions

The **github-actions** skill builds the API image, pushes it to GitHub Container Registry and runs the update on the VPS over SSH. The frontend is built in CI and copied to the server, because Nginx serves it from a bind mount.

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read     # listing "permissions" drops the defaults, and checkout needs this
      packages: write
    env:
      IMAGE: ghcr.io/${{ github.repository }}/api
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6          # pnpm version comes from "packageManager" in package.json
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter frontend build

      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          push: true
          tags: ${{ env.IMAGE }}:${{ github.sha }}

      - name: Copy frontend build
        uses: appleboy/scp-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          source: frontend/dist/*
          target: /opt/app/frontend/dist
          strip_components: 2
          rm: true

      - name: Update the API
        uses: appleboy/ssh-action@v1
        env:
          API_IMAGE: ${{ env.IMAGE }}:${{ github.sha }}
          GHCR_USER: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: API_IMAGE,GHCR_USER,GHCR_TOKEN
          script: |
            set -e
            cd /opt/app
            echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
            docker compose pull api
            docker compose up -d --wait api
            docker compose exec -T nginx nginx -s reload
```

`docker compose up -d --wait api` recreates the container and waits for its health check. The API is unavailable for the few seconds the swap takes, so this is a short restart rather than zero downtime. True zero-downtime needs two API replicas behind Nginx or a rollout tool, which is more machinery than one VPS needs. For `docker compose` commands run by hand, keep the current `API_IMAGE` in `.env` too.

## Step 5: Back up PostgreSQL

The **postgresql** skill covers dumps and restores. This script writes a custom-format dump from the running container and uploads it to S3-compatible storage. Expiry is better handled by a lifecycle rule on the bucket than by a shell loop.

```bash
#!/usr/bin/env bash
# /opt/app/scripts/backup.sh, run daily from cron
set -euo pipefail
cd /opt/app
: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}"          # for example S3_BUCKET=s3://rina-backups/db

FILE="/opt/backups/projectmgr_$(date +%Y%m%d_%H%M%S).dump"
mkdir -p /opt/backups
docker compose exec -T db pg_dump -U app -d projectmgr --format=custom > "$FILE"
aws s3 cp "$FILE" "$S3_BUCKET/" --endpoint-url "$S3_ENDPOINT"
find /opt/backups -name '*.dump' -mtime +7 -delete
```

Custom-format dumps are already compressed. To restore into a fresh server after `docker compose up -d db`:

```console
$ docker compose exec -T db pg_restore -U app -d projectmgr --clean --if-exists < projectmgr_20261106_030000.dump
```

## Results

Rina migrated the stack in one weekend. After a month:

- A deploy runs unattended in about two minutes, and the API is down for a few seconds instead of a minute.
- The same image runs locally, in CI and in production, so the Node.js version mismatches stopped.
- She restored a backup onto a fresh VPS in about 12 minutes from the repository, the `.env` file and one dump.

## Related Skills

- [docker-helper](/skills/docker-helper) — writes and reviews the Dockerfile and the Compose file
- [nginx](/skills/nginx) — reverse proxy, SSL and static file configuration
- [postgresql](/skills/postgresql) — dumps, restores and database setup
- [github-actions](/skills/github-actions) — build, push and deploy workflow
