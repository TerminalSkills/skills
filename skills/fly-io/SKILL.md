---
name: fly-io
description: >-
  Assists with deploying applications globally on Fly.io edge infrastructure. Use when deploying
  Docker-based apps, configuring multi-region machines, setting up persistent storage, or managing
  global databases. Trigger words: fly.io, fly deploy, fly machines, fly launch, multi-region,
  edge deployment, flyctl.
license: Apache-2.0
compatibility: "Requires flyctl CLI and a Fly.io account"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["fly-io", "deployment", "edge", "multi-region", "infrastructure"]
---

# Fly.io

## Overview

Fly.io deploys applications to Firecracker microVMs across 30+ edge regions worldwide, providing sub-50ms latency to users. It supports scale-to-zero machines, persistent NVMe volumes, LiteFS for multi-region SQLite replication, and private WireGuard networking between services.

## Instructions

- When deploying applications, use `fly launch` to auto-detect the framework and generate a Dockerfile, then `fly deploy` for zero-downtime rolling updates with health checks.
- When configuring scaling, use `auto_stop_machines` and `auto_start_machines` in `fly.toml` to scale to zero when idle and wake on incoming requests, and set machine sizing appropriate to the workload.
- When managing multi-region deployments, use `fly scale count --region` to distribute machines, `fly-replay` header to route writes to the primary region, and LiteFS for SQLite read replicas.
- When handling persistent data, attach volumes for durable storage (machines are ephemeral), use LiteFS for multi-region SQLite, or Tigris for S3-compatible object storage.
- When connecting services, use `.internal` DNS for private service-to-service communication over the WireGuard mesh and never expose internal services to the public internet.
- When managing secrets, use `fly secrets set KEY=value` for encrypted secret storage accessible as environment variables.
- When troubleshooting, use `fly logs` for real-time streaming, `fly ssh console` to access running machines, and `fly proxy` to tunnel to internal services.

## Examples

### Example 1: Deploy a multi-region web application

**User request:** "Deploy my app globally with Fly.io in US, Europe, and Asia"

**Actions:**
1. Initialize with `fly launch` and configure Dockerfile
2. Deploy machines to three regions: `fly scale count 2 --region iad,cdg,nrt`
3. Set up LiteFS for SQLite replication across regions
4. Configure `fly-replay` header for write routing to the primary region

**Output:** A globally distributed app with read replicas in three regions and automatic write routing.

### Example 2: Configure a cost-efficient staging environment

**User request:** "Set up a Fly.io staging environment that scales to zero when not in use"

**Actions:**
1. Create a staging app with `fly launch`
2. Configure `auto_stop_machines = "stop"` and `auto_start_machines = true` in `fly.toml`
3. Attach a volume for persistent database storage
4. Set health checks with appropriate timeouts for routing

**Output:** A staging environment that stops idle machines and wakes in sub-second on the next request.

### Example 3: Canary deployment with auto-rollback

**User request:** "Deploy my app to Fly.io but test on one machine first. If the health check fails, roll back."

**Actions:**
1. Deploy with `--strategy canary` to spin up a single new machine
2. Health check the canary machine at the app's health endpoint
3. If healthy, promote with `fly deploy --strategy rolling` to replace all machines
4. If unhealthy, rollback with `fly releases rollback`

```bash
#!/bin/bash
# deploy-canary.sh — Fly.io canary deployment with auto-rollback
set -euo pipefail

APP="${1:?Usage: deploy-canary.sh <app-name>}"
HEALTH_PATH="${2:-/api/health}"

echo "🐤 Deploying canary..."
fly deploy --app "$APP" --strategy canary --wait-timeout 120

HEALTH_URL="https://${APP}.fly.dev${HEALTH_PATH}"
HEALTHY=false
DEADLINE=$((SECONDS + 60))

while [ $SECONDS -lt $DEADLINE ]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
  [ "$STATUS" = "200" ] && HEALTHY=true && break
  sleep 3
done

if [ "$HEALTHY" = true ]; then
  echo "✅ Canary healthy! Promoting..."
  fly deploy --app "$APP" --strategy rolling
  echo "🎉 Production deploy complete"
else
  echo "❌ Canary failed! Rolling back..."
  fly releases rollback --app "$APP"
  echo "⏪ Rolled back"
  exit 1
fi
```

## Guidelines

- Use `auto_stop_machines = "stop"` for dev/staging to save costs; machines stop after idle timeout.
- Keep `auto_start_machines = true` so machines wake on incoming requests with sub-second cold start.
- Use `.internal` DNS for service-to-service calls; never expose internal services publicly.
- Store persistent data on volumes, not the machine filesystem, since machines are ephemeral.
- Use LiteFS for SQLite apps needing multi-region reads; it is simpler than PostgreSQL replication.
- Set health checks with realistic timeouts; Fly Proxy uses them for routing, not just monitoring.
- Use `fly-replay` header for write operations in multi-region setups to route to the primary region.
