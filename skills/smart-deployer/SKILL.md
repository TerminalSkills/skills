---
name: smart-deployer
description: >-
  Deploy applications through conversational AI — git push to production with
  automated build, deploy, health check, and rollback. Use when someone asks to
  "deploy my app", "set up auto-deploy", "deploy to Vercel/Railway/Fly.io",
  "add deployment pipeline", "rollback deployment", "blue-green deploy", or
  "set up preview environments". Covers Vercel, Railway, Fly.io, Coolify,
  Docker-based deploys, health checks, rollback strategies, and preview
  environments.
license: Apache-2.0
compatibility: "Requires Git. Platform CLIs: vercel, railway, flyctl, or Docker."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["deployment", "ci-cd", "vercel", "railway", "fly-io", "docker", "rollback"]
---

# Smart Deployer

## Overview

Deploy applications through your AI agent — push code, build, deploy, verify health, and rollback if anything breaks. No YAML pipelines, no CI dashboards. Just tell your agent "deploy to production" and it handles the entire flow.

## When to Use

- Deploy a web app to Vercel, Railway, Fly.io, or self-hosted infrastructure
- Set up automated deployment pipeline triggered by git push
- Add health checks that verify deployment before switching traffic
- Implement rollback — automatic or manual — when deploys go wrong
- Create preview environments for pull requests
- Blue-green or canary deployment strategies

## Instructions

### Platform Selection Guide

Choose based on your stack:

| Platform | Best For | Pricing | Deploy Speed |
|----------|----------|---------|--------------|
| **Vercel** | Next.js, React, static sites | Free tier, $20/mo pro | ~30s |
| **Railway** | Full-stack, databases, workers | $5/mo + usage | ~60s |
| **Fly.io** | Docker, global edge, WebSocket apps | Free tier, pay per use | ~90s |
| **Coolify** | Self-hosted PaaS (your own server) | Free (self-hosted) | ~120s |
| **Docker + VPS** | Full control, any stack | VPS cost only | ~60-180s |

### Strategy 1: Vercel Deploy (Next.js / React)

```typescript
// deploy-vercel.ts — Automated Vercel deployment with rollback
/**
 * Deploys to Vercel via CLI, waits for build, checks health,
 * and rolls back automatically if the health check fails.
 * Supports preview deploys for PRs and production promotes.
 */
import { execSync } from "child_process";

interface DeployResult {
  url: string;
  deploymentId: string;
  status: "success" | "failed" | "rolled-back";
  buildTime: number;
}

interface DeployOptions {
  production: boolean;       // Deploy to production or preview
  healthCheckUrl?: string;   // URL path to check after deploy (e.g., "/api/health")
  healthCheckTimeout?: number; // Max seconds to wait for healthy response
  autoRollback?: boolean;    // Roll back on failed health check
}

export async function deploy(options: DeployOptions): Promise<DeployResult> {
  const startTime = Date.now();
  const { production, healthCheckUrl = "/api/health", healthCheckTimeout = 60, autoRollback = true } = options;

  console.log(`🚀 Deploying to Vercel (${production ? "production" : "preview"})...`);

  // Step 1: Deploy
  const flag = production ? "--prod" : "";
  const output = execSync(`vercel deploy ${flag} --yes 2>&1`, { encoding: "utf-8" });

  // Extract deployment URL from output
  const urlMatch = output.match(/https:\/\/[^\s]+\.vercel\.app/);
  if (!urlMatch) throw new Error(`Deploy failed: ${output}`);

  const deployUrl = urlMatch[0];
  const deploymentId = deployUrl.split("-").pop()?.replace(".vercel.app", "") || "";

  console.log(`✅ Deployed: ${deployUrl}`);

  // Step 2: Health check
  if (healthCheckUrl) {
    const healthUrl = `${deployUrl}${healthCheckUrl}`;
    console.log(`🏥 Health check: ${healthUrl}`);

    const healthy = await waitForHealthy(healthUrl, healthCheckTimeout);

    if (!healthy) {
      console.log("❌ Health check failed!");

      if (autoRollback && production) {
        console.log("⏪ Rolling back to previous deployment...");
        execSync(`vercel rollback --yes 2>&1`, { encoding: "utf-8" });
        return {
          url: deployUrl,
          deploymentId,
          status: "rolled-back",
          buildTime: (Date.now() - startTime) / 1000,
        };
      }

      return { url: deployUrl, deploymentId, status: "failed", buildTime: (Date.now() - startTime) / 1000 };
    }

    console.log("✅ Health check passed!");
  }

  return {
    url: deployUrl,
    deploymentId,
    status: "success",
    buildTime: (Date.now() - startTime) / 1000,
  };
}

async function waitForHealthy(url: string, timeoutSeconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 3000)); // Check every 3s
  }

  return false;
}
```

### Strategy 2: Railway Deploy (Full-Stack + Database)

```python
# deploy_railway.py — Railway deployment with database and health checks
"""
Deploy full-stack apps to Railway with linked databases,
environment variable management, and health verification.
Handles Postgres/Redis provisioning alongside the app deploy.
"""
import subprocess
import json
import time
import httpx
from typing import Optional

class RailwayDeployer:
    """Automated Railway deployment pipeline."""

    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id

    def deploy(self, service: str = "web", with_db: bool = False) -> dict:
        """Deploy service to Railway with optional database provisioning.

        Args:
            service: Service name within the Railway project
            with_db: Provision a Postgres database if not exists

        Returns:
            Dict with deployment URL, status, and timing info
        """
        start = time.time()

        # Provision database if requested
        if with_db:
            print("🗄️  Provisioning Postgres database...")
            self._run("railway add --plugin postgresql")
            print("✅ Database ready")

        # Deploy the application
        print(f"🚀 Deploying {service}...")
        result = self._run("railway up --detach")
        print(f"📦 Build started: {result}")

        # Wait for deployment to complete
        deploy_url = self._wait_for_deploy(timeout=300)  # 5 min timeout

        if not deploy_url:
            return {"status": "failed", "error": "Deployment timed out", "time": time.time() - start}

        # Health check
        healthy = self._health_check(deploy_url, timeout=60)

        return {
            "url": deploy_url,
            "status": "success" if healthy else "unhealthy",
            "time": round(time.time() - start, 1),
            "database": with_db,
        }

    def rollback(self) -> str:
        """Roll back to previous deployment.

        Returns:
            Status message
        """
        result = self._run("railway rollback")
        return f"⏪ Rolled back: {result}"

    def env_set(self, variables: dict[str, str]) -> None:
        """Set environment variables on Railway.

        Args:
            variables: Key-value pairs to set
        """
        for key, value in variables.items():
            self._run(f'railway variables set {key}="{value}"')
            print(f"  ✅ {key} set")

    def _wait_for_deploy(self, timeout: int = 300) -> Optional[str]:
        """Poll Railway until deployment is live."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                status = self._run("railway status --json")
                data = json.loads(status)
                if data.get("status") == "SUCCESS":
                    return data.get("url")
            except Exception:
                pass
            time.sleep(10)  # Poll every 10 seconds
        return None

    def _health_check(self, url: str, timeout: int = 60) -> bool:
        """Verify the deployed service responds correctly."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                resp = httpx.get(f"{url}/api/health", timeout=5)
                if resp.status_code == 200:
                    print(f"✅ Healthy: {url}")
                    return True
            except httpx.RequestError:
                pass
            time.sleep(3)
        print(f"❌ Health check failed: {url}")
        return False

    def _run(self, cmd: str) -> str:
        return subprocess.check_output(cmd, shell=True, text=True).strip()
```

### Strategy 3: Fly.io Deploy (Global Edge + Docker)

```bash
#!/bin/bash
# deploy-fly.sh — Fly.io deployment with canary strategy
# Deploys to a canary machine first, checks health, then
# promotes to all machines in the app's region group.

set -euo pipefail

APP_NAME="${1:?Usage: deploy-fly.sh <app-name>}"
HEALTH_URL="${2:-/api/health}"
CANARY_TIMEOUT=60  # Seconds to wait for canary health

echo "🚀 Deploying $APP_NAME to Fly.io (canary strategy)..."

# Step 1: Deploy canary (single machine)
echo "🐤 Deploying canary machine..."
fly deploy --app "$APP_NAME" \
  --strategy canary \
  --wait-timeout 120 \
  2>&1

# Step 2: Get canary URL
CANARY_URL="https://${APP_NAME}.fly.dev${HEALTH_URL}"
echo "🏥 Checking canary health: $CANARY_URL"

# Step 3: Health check loop
HEALTHY=false
DEADLINE=$((SECONDS + CANARY_TIMEOUT))

while [ $SECONDS -lt $DEADLINE ]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CANARY_URL" || true)
  if [ "$STATUS" = "200" ]; then
    HEALTHY=true
    break
  fi
  echo "  Waiting... (status: $STATUS)"
  sleep 3
done

if [ "$HEALTHY" = true ]; then
  echo "✅ Canary healthy! Promoting to all machines..."
  fly deploy --app "$APP_NAME" --strategy rolling 2>&1
  echo "🎉 Production deploy complete!"
else
  echo "❌ Canary unhealthy! Rolling back..."
  fly releases rollback --app "$APP_NAME" 2>&1
  echo "⏪ Rolled back to previous release."
  exit 1
fi

# Step 4: Verify production
PROD_URL="https://${APP_NAME}.fly.dev${HEALTH_URL}"
FINAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL")
echo "📊 Production status: $FINAL_STATUS"
```

### Strategy 4: Docker + VPS Deploy (Full Control)

```python
# deploy_docker.py — Zero-downtime Docker deployment on any VPS
"""
Blue-green deployment using Docker Compose on a VPS.
Spins up new containers, health checks, switches nginx upstream,
then stops old containers. Zero downtime, instant rollback.
"""
import subprocess
import time
import httpx
from typing import Literal

Color = Literal["blue", "green"]

class DockerDeployer:
    """Blue-green Docker deployment with zero downtime."""

    def __init__(self, host: str, app_name: str = "myapp"):
        self.host = host          # SSH host (e.g., "root@my-server.com")
        self.app_name = app_name

    def deploy(self) -> dict:
        """Execute blue-green deployment.

        Returns:
            Deployment result with URL, status, and timing
        """
        start = time.time()

        # Determine current and next color
        current = self._get_active_color()
        target: Color = "green" if current == "blue" else "blue"
        print(f"🔄 Switching {current} → {target}")

        # Step 1: Build and start new containers
        print(f"📦 Building {target} containers...")
        self._ssh(f"cd /opt/{self.app_name} && "
                  f"docker compose -f docker-compose.{target}.yml up -d --build")

        # Step 2: Health check new containers
        port = 3001 if target == "green" else 3000  # Each color on different port
        healthy = self._remote_health_check(port, timeout=60)

        if not healthy:
            print(f"❌ {target} unhealthy! Stopping new containers...")
            self._ssh(f"cd /opt/{self.app_name} && "
                      f"docker compose -f docker-compose.{target}.yml down")
            return {"status": "failed", "time": round(time.time() - start, 1)}

        # Step 3: Switch nginx upstream to new color
        print("🔀 Switching traffic...")
        self._ssh(f"sed -i 's/localhost:{3000 if target == 'green' else 3001}/"
                  f"localhost:{port}/' /etc/nginx/conf.d/{self.app_name}.conf && "
                  f"nginx -t && nginx -s reload")

        # Step 4: Stop old containers (after traffic switch)
        time.sleep(5)  # Grace period for in-flight requests
        self._ssh(f"cd /opt/{self.app_name} && "
                  f"docker compose -f docker-compose.{current}.yml down")

        print(f"✅ Deployed {target} in {round(time.time() - start, 1)}s")
        return {"status": "success", "color": target, "time": round(time.time() - start, 1)}

    def rollback(self) -> str:
        """Instant rollback — switch nginx back and restart old containers."""
        current = self._get_active_color()
        previous: Color = "green" if current == "blue" else "blue"

        self._ssh(f"cd /opt/{self.app_name} && "
                  f"docker compose -f docker-compose.{previous}.yml up -d")
        time.sleep(5)

        port = 3001 if previous == "green" else 3000
        self._ssh(f"sed -i 's/localhost:{3001 if previous == 'blue' else 3000}/"
                  f"localhost:{port}/' /etc/nginx/conf.d/{self.app_name}.conf && "
                  f"nginx -t && nginx -s reload")

        return f"⏪ Rolled back to {previous}"

    def _get_active_color(self) -> Color:
        """Check which color is currently receiving traffic."""
        config = self._ssh(f"cat /etc/nginx/conf.d/{self.app_name}.conf")
        return "green" if "3001" in config else "blue"

    def _remote_health_check(self, port: int, timeout: int = 60) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            result = self._ssh(f"curl -sf http://localhost:{port}/api/health || echo FAIL")
            if "FAIL" not in result:
                return True
            time.sleep(3)
        return False

    def _ssh(self, cmd: str) -> str:
        return subprocess.check_output(
            ["ssh", "-o", "StrictHostKeyChecking=no", self.host, cmd],
            text=True
        ).strip()
```

## Examples

### Example 1: Deploy a Next.js app to production

**User prompt:** "Deploy my Next.js app to Vercel with a health check. If the health check fails, roll back automatically."

The agent will:
- Run `vercel deploy --prod --yes`
- Extract the deployment URL
- Hit `/api/health` every 3 seconds for up to 60 seconds
- If healthy → report success with URL and build time
- If unhealthy → run `vercel rollback --yes` and report the rollback

### Example 2: Full-stack deploy with database

**User prompt:** "Deploy my app to Railway with a Postgres database. Set the DATABASE_URL and deploy."

The agent will:
- Run `railway add --plugin postgresql` to provision Postgres
- Set environment variables via `railway variables set`
- Deploy with `railway up --detach`
- Wait for build completion and verify health
- Return the live URL with database connection info

### Example 3: Zero-downtime Docker deploy on a VPS

**User prompt:** "I have a VPS at deploy@my-server.com. Set up blue-green deployment for my Docker app with zero downtime."

The agent will:
- Create two Docker Compose files (blue on port 3000, green on 3001)
- Generate nginx config with upstream switching
- Build and start new containers on the inactive color
- Health check the new containers before switching traffic
- Switch nginx upstream and gracefully stop old containers

## Guidelines

- **Always health check** — never switch traffic to an unverified deployment
- **Rollback must be instant** — keep previous deployment artifacts available
- **Preview environments for PRs** — use `vercel deploy` (without --prod) or Railway preview
- **Environment variables** — never hardcode secrets; use platform env var management
- **Build caching** — enable Docker layer caching and platform build caches to speed deploys
- **Deploy notifications** — post to Slack/Discord after successful deploys
- **Deployment logs** — save build output for debugging failed deploys
- **Database migrations** — run migrations BEFORE deploying new code, never after
- **Canary deploys** — for critical services, deploy to 1 instance first, verify, then promote
- **Cost awareness** — Railway and Fly.io charge per usage; set spending limits
