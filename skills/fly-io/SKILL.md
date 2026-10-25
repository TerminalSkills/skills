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
  version: "1.1.0"
  category: devops
  tags: "fly-io, deployment, edge, multi-region, infrastructure"
  repository: "https://github.com/superfly/flyctl"
---

# Fly.io

## Overview

Fly.io runs applications as Firecracker microVMs (Fly Machines) in the regions you choose (17 at the time of the last check; see `fly platform regions`), with Fly Proxy routing traffic to the nearest healthy machine. It supports scale-to-zero machines, persistent volumes, Tigris object storage, and private WireGuard networking (6PN) between apps. LiteFS (multi-region SQLite replication) still exists but Fly states it offers no support for it, so treat it as a community tool. The CLI is `fly` (alias `flyctl`); checked against flyctl v0.4.120.

## Instructions

- When deploying applications, use `fly launch` to auto-detect the framework, generate a Dockerfile if needed and write `fly.toml`, then `fly deploy`. The default `--strategy` is `rolling`; the others are `canary`, `bluegreen` and `immediate`. `--wait-timeout` defaults to 5m and `--ha` (default true) creates a spare machine.
- When configuring scaling, set `auto_stop_machines` (`"off"` default, `"stop"` or `"suspend"`; old boolean `true` is legacy), `auto_start_machines` (boolean, default true) and `min_machines_running` (default 0, primary region only) under `[http_service]` to scale to zero when idle and wake on incoming requests. Size machines with `[[vm]]` (`size`, `memory`, `cpus`).
- When managing multi-region deployments, use `fly scale count <n> --region a,b` (n is the total across the listed regions, balanced between them; for a fixed count per region run one command per region), `fly-replay` header to route writes to the primary region, and LiteFS (unsupported by Fly, and it must not be combined with autostop/autostart) for SQLite read replicas; managed Postgres is the supported route for relational data.
- When handling persistent data, attach volumes for durable storage (machines are ephemeral), use LiteFS for multi-region SQLite, or Tigris for S3-compatible object storage.
- When connecting services, use `<app>.internal` (or `<region>.<app>.internal`) DNS for private communication over 6PN. Services must listen on an IPv6-capable address (`fly-local-6pn` or `::`). 6PN bypasses Fly Proxy, so autostart does not apply and stopped machines are not returned; use Flycast for proxied private access. Do not give internal apps a public `[http_service]`.
- When managing secrets, use `fly secrets set STRIPE_API_KEY=...` for encrypted secrets exposed as environment variables. By default this triggers a deploy; add `--stage` to queue it for the next `fly deploy`.
- When troubleshooting, use `fly logs` for real-time streaming, `fly ssh console` to access running machines, and `fly proxy 5433:5432 -a orders-db` to tunnel to internal services.

## Examples

### Example 1: Deploy a multi-region web application

**User request:** "Deploy my app globally with Fly.io in US, Europe, and Asia"

**Actions:**
1. Initialize with `fly launch` and configure Dockerfile
2. Add machines in three regions, one command per region so each gets its own count: `fly scale count 2 --region iad`, then `cdg`, then `nrt`
3. Use managed Postgres (or LiteFS if you accept it is unsupported) for data
4. Return a `fly-replay: region=iad` response header on writes so Fly Proxy re-runs them in the primary region

```bash
fly launch --name storefront-web --region iad
fly scale count 2 --region iad
fly scale count 2 --region cdg
fly scale count 2 --region nrt
fly scale show
```

**Output:** `fly scale show` lists machines in iad, cdg and nrt; reads are served locally and writes are replayed to iad.

### Example 2: Configure a cost-efficient staging environment

**User request:** "Set up a Fly.io staging environment that scales to zero when not in use"

**Actions:**
1. Create a staging app with `fly launch`
2. In `fly.toml` under `[http_service]` set `auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0`
3. Attach a volume for persistent database storage
4. Set health checks with appropriate timeouts for routing

```toml
[http_service]
  internal_port = 8080
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "data"
  destination = "/data"
```

**Output:** A staging environment that stops idle machines and wakes on the next request.

### Example 3: Canary deployment with auto-rollback

**User request:** "Deploy my app to Fly.io but test on one machine first. If the health check fails, roll back."

**Actions:**
1. Define a health check (`[[http_service.checks]]` with `path = "/api/health"`, `grace_period`, `interval`)
2. `fly deploy --strategy canary` boots one new machine, waits for its checks, then rolls the rest automatically; if checks fail the deploy aborts and the old machines keep serving
3. Fly has no `fly releases rollback` command. To go back to an earlier build, find its image with `fly releases --image` and run `fly deploy --image registry.fly.io/orders-api:deployment-01JABCDEF`
4. A rollback reuses current `fly.toml` and secrets and does not undo database migrations

```bash
# deploy-canary.sh: canary deploy; on failure, redeploy the last known-good image
set -euo pipefail
APP="${1:?usage: deploy-canary.sh orders-api registry.fly.io/orders-api:deployment-01JABCDEF}"
GOOD_IMAGE="${2:?find it with: fly releases --app $APP --image}"

if fly deploy --app "$APP" --strategy canary --wait-timeout 5m; then
  echo "canary passed its health checks, all machines updated"
else
  echo "deploy failed, redeploying $GOOD_IMAGE"
  fly deploy --app "$APP" --image "$GOOD_IMAGE" --strategy immediate
  exit 1
fi
```

## Guidelines

- Use `auto_stop_machines = "stop"` (or `"suspend"` for faster wake) for dev/staging to save costs. Autostart is on by default and only applies to requests through Fly Proxy.
- Use `.internal` DNS for service-to-service calls; never expose internal services publicly.
- Store persistent data on volumes, not the machine filesystem, since machines are ephemeral.
- LiteFS is unsupported by Fly (pre-1.0, "use with caution") and does not work with autostop/autostart; prefer Postgres for production.
- Volumes are tied to one machine and region; a machine cannot move to another region with its data, so snapshot and restore instead.
- Set health checks with realistic timeouts; Fly Proxy uses them for routing, not just monitoring.
- Use `fly-replay` header for write operations in multi-region setups to route to the primary region.
