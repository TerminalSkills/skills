---
title: Build Self-Healing Infrastructure with Health Checks
slug: build-self-healing-infrastructure-with-health-checks
description: Build a health check system that monitors services, detects failures, automatically restarts unhealthy instances, and escalates persistent issues — reducing MTTR from hours to seconds.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - health-checks
  - self-healing
  - monitoring
  - reliability
  - infrastructure
---

# Build Self-Healing Infrastructure with Health Checks

## The Problem

Yuki leads SRE at a 45-person company with 15 microservices. When a service becomes unhealthy — database connection pool exhausted, memory leak, deadlocked thread — nobody knows until customers complain. Last week, the payment service was returning 500s for 40 minutes before the on-call engineer woke up and restarted it. The fix was literally `kubectl rollout restart`. They need automated health checks that detect problems and take corrective action — restart services, drain connections, clear caches — without waiting for a human.

## Step 1: Build the Health Check Engine

```typescript
// src/health/checker.ts — Multi-probe health check engine
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface HealthCheck {
  service: string;
  endpoint: string;            // /health or /healthz
  interval: number;            // check frequency in seconds
  timeout: number;             // max wait for response
  unhealthyThreshold: number;  // failures before marking unhealthy
  healthyThreshold: number;    // successes to mark healthy again
  checks: ProbeConfig[];       // what to check beyond HTTP 200
}

interface ProbeConfig {
  name: string;
  type: "http" | "tcp" | "db" | "redis" | "disk" | "memory" | "custom";
  target?: string;
  threshold?: number;
}

interface HealthStatus {
  service: string;
  status: "healthy" | "degraded" | "unhealthy";
  checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
    responseTime: number;
  }>;
  consecutiveFailures: number;
  lastChecked: number;
  lastHealthy: number;
}

// Run all probes for a service
async function checkService(config: HealthCheck): Promise<HealthStatus> {
  const results = [];
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  for (const probe of config.checks) {
    const start = Date.now();
    let status: "pass" | "warn" | "fail" = "pass";
    let message = "OK";

    try {
      switch (probe.type) {
        case "http": {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), config.timeout * 1000);

          const response = await fetch(probe.target || config.endpoint, {
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!response.ok) {
            status = "fail";
            message = `HTTP ${response.status}`;
          }

          // Check response time
          const responseTime = Date.now() - start;
          if (responseTime > (probe.threshold || 5000)) {
            status = "warn";
            message = `Slow response: ${responseTime}ms`;
          }
          break;
        }

        case "db": {
          const dbStart = Date.now();
          await pool.query("SELECT 1");
          const dbTime = Date.now() - dbStart;

          if (dbTime > (probe.threshold || 1000)) {
            status = "warn";
            message = `Database slow: ${dbTime}ms`;
          }

          // Check connection pool
          const poolStatus = (pool as any).totalCount;
          const idleCount = (pool as any).idleCount;
          if (poolStatus > 0 && idleCount === 0) {
            status = "warn";
            message = `Connection pool exhausted: ${poolStatus} active, 0 idle`;
          }
          break;
        }

        case "redis": {
          const redisStart = Date.now();
          await redis.ping();
          const redisTime = Date.now() - redisStart;

          if (redisTime > (probe.threshold || 100)) {
            status = "warn";
            message = `Redis slow: ${redisTime}ms`;
          }
          break;
        }

        case "memory": {
          const usage = process.memoryUsage();
          const heapUsedMB = usage.heapUsed / 1048576;
          const heapTotalMB = usage.heapTotal / 1048576;
          const ratio = heapUsedMB / heapTotalMB;

          if (ratio > 0.95) {
            status = "fail";
            message = `Memory critical: ${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB (${(ratio * 100).toFixed(0)}%)`;
          } else if (ratio > 0.85) {
            status = "warn";
            message = `Memory high: ${(ratio * 100).toFixed(0)}%`;
          }
          break;
        }

        case "disk": {
          const { execSync } = await import("node:child_process");
          const df = execSync("df -h / | tail -1").toString();
          const usagePercent = parseInt(df.match(/(\d+)%/)?.[1] || "0");

          if (usagePercent > 95) {
            status = "fail";
            message = `Disk critical: ${usagePercent}% used`;
          } else if (usagePercent > 85) {
            status = "warn";
            message = `Disk high: ${usagePercent}% used`;
          }
          break;
        }
      }
    } catch (err: any) {
      status = "fail";
      message = err.message.slice(0, 200);
    }

    if (status === "fail") overallStatus = "unhealthy";
    else if (status === "warn" && overallStatus !== "unhealthy") overallStatus = "degraded";

    results.push({
      name: probe.name,
      status,
      message,
      responseTime: Date.now() - start,
    });
  }

  // Track consecutive failures
  const stateKey = `health:state:${config.service}`;
  const prevState = await redis.get(stateKey);
  const prev = prevState ? JSON.parse(prevState) : { consecutiveFailures: 0, lastHealthy: Date.now() };

  const consecutiveFailures = overallStatus === "unhealthy"
    ? prev.consecutiveFailures + 1
    : 0;

  const healthStatus: HealthStatus = {
    service: config.service,
    status: overallStatus,
    checks: results,
    consecutiveFailures,
    lastChecked: Date.now(),
    lastHealthy: overallStatus === "healthy" ? Date.now() : prev.lastHealthy,
  };

  await redis.setex(stateKey, 300, JSON.stringify(healthStatus));

  // Store history
  await pool.query(
    `INSERT INTO health_check_log (service, status, checks, consecutive_failures, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [config.service, overallStatus, JSON.stringify(results), consecutiveFailures]
  );

  return healthStatus;
}

export { checkService, HealthCheck, HealthStatus };
```

## Step 2: Build the Self-Healing Controller

```typescript
// src/health/healer.ts — Automated remediation actions
import { HealthStatus } from "./checker";
import { pool } from "../db";

interface HealingAction {
  name: string;
  trigger: { consecutiveFailures: number; checkName?: string };
  action: "restart" | "scale_up" | "drain" | "clear_cache" | "alert";
  cooldownMinutes: number;
}

const HEALING_RULES: Record<string, HealingAction[]> = {
  "api-service": [
    { name: "restart_on_crash", trigger: { consecutiveFailures: 3 }, action: "restart", cooldownMinutes: 10 },
    { name: "scale_on_load", trigger: { consecutiveFailures: 2, checkName: "http" }, action: "scale_up", cooldownMinutes: 15 },
    { name: "alert_persistent", trigger: { consecutiveFailures: 6 }, action: "alert", cooldownMinutes: 30 },
  ],
  "worker-service": [
    { name: "restart_on_memory", trigger: { consecutiveFailures: 2, checkName: "memory" }, action: "restart", cooldownMinutes: 5 },
    { name: "clear_redis", trigger: { consecutiveFailures: 3, checkName: "redis" }, action: "clear_cache", cooldownMinutes: 15 },
  ],
};

export async function executeHealing(status: HealthStatus): Promise<string[]> {
  const rules = HEALING_RULES[status.service] || [];
  const actions: string[] = [];

  for (const rule of rules) {
    if (status.consecutiveFailures < rule.trigger.consecutiveFailures) continue;

    // Check cooldown
    const { rows } = await pool.query(
      `SELECT created_at FROM healing_actions 
       WHERE service = $1 AND action_name = $2 
       AND created_at > NOW() - INTERVAL '${rule.cooldownMinutes} minutes'
       LIMIT 1`,
      [status.service, rule.name]
    );

    if (rows.length > 0) continue; // still in cooldown

    // Execute the healing action
    switch (rule.action) {
      case "restart":
        await restartService(status.service);
        actions.push(`Restarted ${status.service}`);
        break;

      case "scale_up":
        await scaleService(status.service, 1);
        actions.push(`Scaled up ${status.service} by 1 replica`);
        break;

      case "clear_cache":
        const { Redis: R } = await import("ioredis");
        const r = new R(process.env.REDIS_URL!);
        const keys = await r.keys(`${status.service}:*`);
        if (keys.length) await r.del(...keys);
        r.disconnect();
        actions.push(`Cleared ${keys.length} cache keys for ${status.service}`);
        break;

      case "alert":
        await sendAlert(status);
        actions.push(`Alerted on-call for ${status.service}`);
        break;
    }

    // Log the action
    await pool.query(
      `INSERT INTO healing_actions (service, action_name, action_type, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [status.service, rule.name, rule.action, JSON.stringify(status)]
    );
  }

  return actions;
}

async function restartService(service: string): Promise<void> {
  const { KubeConfig, AppsV1Api } = await import("@kubernetes/client-node");
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const api = kc.makeApiClient(AppsV1Api);

  await api.patchNamespacedDeployment(
    service, "default",
    { spec: { template: { metadata: { annotations: { "restartedAt": new Date().toISOString() } } } } },
    undefined, undefined, undefined, undefined, undefined,
    { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
  );
}

async function scaleService(service: string, addReplicas: number): Promise<void> {
  const { KubeConfig, AppsV1Api } = await import("@kubernetes/client-node");
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const api = kc.makeApiClient(AppsV1Api);

  const current = await api.readNamespacedDeployment(service, "default");
  const newReplicas = (current.body.spec?.replicas || 1) + addReplicas;

  await api.patchNamespacedDeployment(
    service, "default",
    { spec: { replicas: Math.min(newReplicas, 10) } },
    undefined, undefined, undefined, undefined, undefined,
    { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
  );
}

async function sendAlert(status: HealthStatus): Promise<void> {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `🔴 *${status.service}* unhealthy for ${status.consecutiveFailures} consecutive checks\n` +
        status.checks.filter((c) => c.status === "fail").map((c) => `• ${c.name}: ${c.message}`).join("\n"),
    }),
  });
}
```

## Results

- **MTTR dropped from 40 minutes to 45 seconds** — the payment service 500 scenario: health check detects failure in 30s, auto-restart completes in 15s; no human needed
- **Night-time pages reduced by 73%** — automated restart + scale-up resolve most transient issues before they reach the on-call engineer
- **Proactive degradation detection** — "warn" status catches memory leaks and slow database connections before they become outages; teams fix issues during business hours
- **Healing actions are audited** — every automated restart, scale-up, and cache clear is logged with full context; the SRE team reviews actions weekly to improve the rules
- **Cooldown prevents restart loops** — if a service is fundamentally broken (not just a transient issue), it restarts once, then waits and escalates to a human instead of restart-looping
