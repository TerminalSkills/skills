---
title: Migrate a Heroku App to Self-Hosted with Coolify
slug: migrate-heroku-app-to-self-hosted
description: "Move a Node.js SaaS app from Heroku to a Hetzner VPS with Coolify, cutting hosting costs from $250/mo to $20/mo while keeping git-push deploys, SSL, and zero-downtime updates."
skills: [coolify]
category: devops
tags: [coolify, heroku, migration, self-hosting, deployment, vps]
---

# Migrate a Heroku App to Self-Hosted with Coolify

## The Problem

A two-person SaaS startup runs a Node.js API with a PostgreSQL database and Redis cache on Heroku. The monthly bill has crept up to $250: $25 for two Eco dynos, $50 for Heroku Postgres Mini (4GB), $30 for Heroku Data for Redis Premium 0, $15 for the SSL endpoint, and $130 in add-ons (logging, monitoring, scheduled tasks). The app serves 800 daily active users and handles 2,000 requests per hour — well within the capacity of a $20 VPS.

Heroku's convenience was worth the premium in the early days when speed-to-market mattered more than cost. But now the product is stable, the deploy cadence is weekly, and $3,000/year for infrastructure that could run on a single server is hard to justify. The founders want the git-push deploy experience they're used to, automatic SSL, and a management UI — they don't want to SSH into a server and manage systemd services.

Coolify provides exactly this: an open-source, self-hosted PaaS that replicates the Heroku workflow on any VPS. Git push to deploy, automatic Let's Encrypt SSL, database management, environment variables, and a web dashboard — all running on a $20/mo Hetzner server with 4 vCPU, 8GB RAM, and 80GB SSD.

## The Solution

Use the **coolify** skill to set up a production-ready deployment on a Hetzner VPS. The migration covers the application, PostgreSQL database, Redis cache, environment variables, custom domain, and SSL — plus monitoring and backups that Heroku charged extra for.

## Step-by-Step Walkthrough

### Step 1: Provision the Server

```text
I need a VPS for a self-hosted PaaS. The app is a Node.js API (Express, ~200MB memory), 
PostgreSQL 15 (4GB database), and Redis. Currently 800 DAU, 2K req/hour. 
Set up a Hetzner Cloud server with Coolify installed.
```

A Hetzner CX31 (4 vCPU, 8GB RAM, 80GB SSD) at €7.50/mo handles this workload with room to grow. Coolify installs with a single command:

```bash
# On the fresh server (Ubuntu 22.04)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This installs Docker, Coolify, and all dependencies. The dashboard is available at `http://SERVER_IP:8000` within 2-3 minutes. Set the admin password on first visit.

### Step 2: Connect the Git Repository

In the Coolify dashboard:

1. **Add a GitHub App** — connect your GitHub account under Settings → Sources
2. **Create a new project** → Add resource → Application
3. Select the repository and branch (`main`)
4. Coolify auto-detects the Nixpacks/Dockerfile build configuration

For a standard Node.js app, Coolify uses Nixpacks (the same buildpack technology as Railway). No Dockerfile needed — it detects `package.json` and builds automatically.

If the app has a `Dockerfile`, Coolify uses that instead:

```dockerfile
# Dockerfile — multi-stage build for production
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Step 3: Set Up PostgreSQL and Redis

In Coolify, databases are first-class resources — not add-ons with extra fees:

1. **Create PostgreSQL** — Add resource → Database → PostgreSQL 15
   - Coolify provisions a Docker container with persistent storage
   - Connection string auto-generated: `postgresql://user:pass@internal-hostname:5432/db`

2. **Create Redis** — Add resource → Database → Redis 7
   - Connection string: `redis://:password@internal-hostname:6379`

Both run on the same server with Docker volumes for persistence. Coolify handles container networking automatically — the app connects via internal Docker DNS, not localhost.

### Step 4: Migrate the Database

Export from Heroku and import to Coolify's PostgreSQL:

```bash
# Export from Heroku
heroku pg:backups:capture --app your-heroku-app
heroku pg:backups:download --app your-heroku-app
# This creates a latest.dump file (custom format)

# Copy to the new server
scp latest.dump root@your-server:/tmp/

# Import into Coolify's PostgreSQL container
# Find the container name in Coolify dashboard → Database → PostgreSQL
docker exec -i coolify-postgresql pg_restore \
  --verbose --clean --no-acl --no-owner \
  -U postgres -d your_database < /tmp/latest.dump
```

For Redis, if the data is ephemeral (cache, sessions), skip the migration — the app rebuilds caches on first request. If Redis holds persistent data (queues, feature flags), export and import:

```bash
# On Heroku
heroku redis:cli --app your-heroku-app --confirm your-heroku-app
# Inside redis-cli:
BGSAVE

# The RDB file approach is simpler for small datasets:
# Export keys with redis-cli --rdb dump.rdb, import into new instance
```

### Step 5: Configure Environment Variables

Transfer all Heroku config vars to Coolify:

```bash
# Export Heroku env vars
heroku config --app your-heroku-app --shell > heroku-env.txt
```

In the Coolify dashboard, go to your application → Environment Variables. Paste each variable. Update the database and Redis URLs to point to the Coolify-managed instances:

```
DATABASE_URL=postgresql://postgres:generated-password@coolify-postgresql:5432/your_database
REDIS_URL=redis://:generated-password@coolify-redis:6379
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret
STRIPE_SECRET_KEY=sk_live_...
```

Coolify injects these into the container at runtime, exactly like Heroku's config vars.

### Step 6: Configure Domain and SSL

In Coolify, go to your application → Settings → Domain:

1. Set the domain: `api.yourapp.com`
2. Enable "Generate SSL" — Coolify provisions a Let's Encrypt certificate automatically
3. Update DNS: point `api.yourapp.com` to the server's IP (A record)

Coolify handles certificate renewal automatically. No cert management, no SSL add-on fees.

### Step 7: Set Up Backups

Coolify has built-in database backup scheduling — another feature that costs extra on Heroku:

1. Go to PostgreSQL → Backups
2. Set schedule: daily at 3:00 AM
3. Configure S3-compatible storage (Hetzner Object Storage at €5/mo for 1TB, or Backblaze B2 free tier)

```bash
# Manual backup test
docker exec coolify-postgresql pg_dump -U postgres your_database | gzip > backup-$(date +%F).sql.gz
```

### Step 8: Deploy and Cut Over

1. **Push to trigger deploy**: `git push origin main` — Coolify builds and deploys automatically
2. **Test the new endpoint**: `curl https://api.yourapp.com/health`
3. **Run smoke tests** against the new URL
4. **Update DNS TTL** to 60 seconds (if not already low)
5. **Switch DNS** from Heroku to the new server
6. **Monitor** for 24 hours before decommissioning Heroku

The zero-downtime deploy strategy: keep both running in parallel. Route a percentage of traffic to the new server using DNS weights or a simple load balancer. Once confidence is high, switch fully.

### Step 9: Set Up Monitoring

Coolify provides container-level metrics in the dashboard. For application-level monitoring, add a lightweight stack:

```text
Set up basic uptime monitoring and log aggregation for the migrated app. 
I want to know if the API goes down and be able to search recent logs.
```

Coolify shows container logs in the dashboard out of the box. For uptime alerts, a simple cron health check works:

```bash
# /etc/cron.d/healthcheck — runs every 5 minutes
*/5 * * * * root curl -sf https://api.yourapp.com/health > /dev/null || \
  curl -X POST "https://hooks.slack.com/services/..." \
  -d '{"text":"⚠️ API health check failed!"}'
```

For production-grade monitoring, deploy Uptime Kuma as another Coolify resource — it's a self-hosted status page with alerts.

## Real-World Example

Two founders migrate their SaaS API on a Saturday morning. The Heroku export takes 10 minutes (3.2GB database dump). Coolify setup takes 20 minutes: install, connect GitHub, create PostgreSQL and Redis, configure environment variables. The database import runs for 8 minutes. Total migration time from start to DNS cutover: 2 hours.

The first month's bill: €7.50 for the Hetzner VPS + €5 for backup storage = €12.50 total. Down from $250/mo on Heroku. That's $2,850 saved in the first year — roughly the cost of a two-person team's annual tool budget.

Deploy speed improves too. Heroku builds took 3-4 minutes because of slug compilation. Coolify's Docker build with layer caching takes 45 seconds for subsequent deploys. The git-push workflow stays identical: push to `main`, Coolify picks it up, builds, and deploys with zero downtime.

## Related Skills

- [coolify](../skills/coolify/) -- Deep dive into Coolify configuration, multi-server setups, and CI/CD
- [docker-helper](../skills/docker-helper/) -- Docker fundamentals for debugging container issues
