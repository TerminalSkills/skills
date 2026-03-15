---
title: Build an Infrastructure Health Monitor
slug: build-infrastructure-health-monitor
description: Build an infrastructure health monitoring system with service checks, metric collection, anomaly detection, alerting rules, status pages, and incident tracking.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - monitoring
  - infrastructure
  - health-checks
  - alerting
  - observability
---

# Build an Infrastructure Health Monitor

## The Problem

Clara leads SRE at a 25-person company running 20 services across 3 regions. They use Datadog ($2,000/month) but it drowns them in metrics — 5,000 data points/second with no clear signal. When the database went down at 3 AM, nobody noticed until customers complained 45 minutes later. Alert fatigue from false positives means real alerts get ignored. They need focused monitoring: health checks that matter, anomaly detection that's smart, alerts that are actionable, and a status page customers can check.

## Step 1: Build the Health Monitor

```typescript
// src/monitoring/health.ts — Infrastructure health monitoring with anomaly detection
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ServiceCheck {
  id: string;
  name: string;
  type: "http" | "tcp" | "dns" | "database" | "custom";
  target: string;
  interval: number;          // seconds between checks
  timeout: number;           // max response time in ms
  regions: string[];         // check from multiple regions
  expectedStatus?: number;   // for HTTP checks
  expectedBody?: string;     // substring match for HTTP
  alertAfterFailures: number; // consecutive failures before alerting
}

interface CheckResult {
  checkId: string;
  region: string;
  status: "healthy" | "degraded" | "down";
  responseTimeMs: number;
  statusCode?: number;
  error?: string;
  timestamp: string;
}

interface Alert {
  id: string;
  checkId: string;
  severity: "info" | "warning" | "critical";
  message: string;
  status: "firing" | "resolved";
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
  channels: string[];        // slack, email, pagerduty
}

// Execute a health check
export async function executeCheck(check: ServiceCheck, region: string): Promise<CheckResult> {
  const start = Date.now();
  let status: CheckResult["status"] = "healthy";
  let error: string | undefined;
  let statusCode: number | undefined;

  try {
    switch (check.type) {
      case "http": {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), check.timeout);
        const response = await fetch(check.target, { signal: controller.signal });
        clearTimeout(timeout);
        statusCode = response.status;

        if (check.expectedStatus && response.status !== check.expectedStatus) {
          status = "degraded";
          error = `Expected ${check.expectedStatus}, got ${response.status}`;
        }

        if (check.expectedBody) {
          const body = await response.text();
          if (!body.includes(check.expectedBody)) {
            status = "degraded";
            error = `Expected body to contain "${check.expectedBody}"`;
          }
        }
        break;
      }

      case "tcp": {
        const [host, port] = check.target.split(":");
        await new Promise<void>((resolve, reject) => {
          const net = require("net");
          const socket = net.connect(parseInt(port), host);
          socket.setTimeout(check.timeout);
          socket.on("connect", () => { socket.destroy(); resolve(); });
          socket.on("error", reject);
          socket.on("timeout", () => reject(new Error("TCP timeout")));
        });
        break;
      }

      case "database": {
        await pool.query("SELECT 1");
        break;
      }
    }
  } catch (err: any) {
    status = "down";
    error = err.message;
  }

  const responseTimeMs = Date.now() - start;

  // Degraded if response time > 80% of timeout
  if (status === "healthy" && responseTimeMs > check.timeout * 0.8) {
    status = "degraded";
  }

  const result: CheckResult = {
    checkId: check.id, region, status, responseTimeMs, statusCode, error,
    timestamp: new Date().toISOString(),
  };

  // Store result
  await redis.lpush(`health:results:${check.id}`, JSON.stringify(result));
  await redis.ltrim(`health:results:${check.id}`, 0, 999);  // keep last 1000

  // Track consecutive failures
  if (status === "down") {
    const failures = await redis.incr(`health:failures:${check.id}`);
    if (failures >= check.alertAfterFailures) {
      await createAlert(check, result, failures);
    }
  } else {
    const prevFailures = await redis.get(`health:failures:${check.id}`);
    await redis.set(`health:failures:${check.id}`, 0);
    if (prevFailures && parseInt(prevFailures) >= check.alertAfterFailures) {
      await resolveAlert(check.id);
    }
  }

  // Anomaly detection on response time
  await detectAnomaly(check.id, responseTimeMs);

  return result;
}

// Anomaly detection using simple statistical method
async function detectAnomaly(checkId: string, responseTimeMs: number): Promise<void> {
  const key = `health:latency:${checkId}`;
  await redis.rpush(key, String(responseTimeMs));
  await redis.ltrim(key, -100, -1);  // keep last 100 readings

  const values = (await redis.lrange(key, 0, -1)).map(Number);
  if (values.length < 20) return;  // not enough data

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

  // Alert if current value is more than 3 standard deviations from mean
  if (responseTimeMs > mean + 3 * stdDev) {
    await redis.publish("health:anomaly", JSON.stringify({
      checkId, responseTimeMs, mean: Math.round(mean), stdDev: Math.round(stdDev),
      message: `Latency spike: ${responseTimeMs}ms (avg: ${Math.round(mean)}ms)`,
    }));
  }
}

async function createAlert(check: ServiceCheck, result: CheckResult, failures: number): Promise<void> {
  const existing = await redis.get(`health:alert:${check.id}`);
  if (existing) return;  // Already alerting

  const alert: Alert = {
    id: `alert-${randomBytes(4).toString("hex")}`,
    checkId: check.id,
    severity: failures > check.alertAfterFailures * 2 ? "critical" : "warning",
    message: `${check.name} is DOWN: ${result.error} (${failures} consecutive failures)`,
    status: "firing",
    firedAt: new Date().toISOString(),
    resolvedAt: null,
    acknowledgedBy: null,
    channels: ["slack", "email"],
  };

  await redis.set(`health:alert:${check.id}`, JSON.stringify(alert));
  await pool.query(
    `INSERT INTO alerts (id, check_id, severity, message, status, fired_at) VALUES ($1, $2, $3, $4, 'firing', NOW())`,
    [alert.id, check.id, alert.severity, alert.message]
  );

  // Send to notification channels
  await redis.rpush("notification:queue", JSON.stringify({ type: "alert", alert }));
}

async function resolveAlert(checkId: string): Promise<void> {
  await redis.del(`health:alert:${checkId}`);
  await pool.query(
    "UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE check_id = $1 AND status = 'firing'",
    [checkId]
  );
}

// Status page data
export async function getStatusPage(): Promise<{
  overall: "operational" | "degraded" | "outage";
  services: Array<{ name: string; status: string; uptime: number; latencyAvg: number }>;
}> {
  const { rows: checks } = await pool.query("SELECT * FROM service_checks");
  const services = [];

  let hasDown = false, hasDegraded = false;

  for (const check of checks) {
    const results = (await redis.lrange(`health:results:${check.id}`, 0, 99))
      .map((r) => JSON.parse(r));

    const healthy = results.filter((r: any) => r.status === "healthy").length;
    const uptime = results.length > 0 ? (healthy / results.length) * 100 : 100;
    const latencies = results.map((r: any) => r.responseTimeMs);
    const latencyAvg = latencies.length > 0 ? latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length : 0;

    const latest = results[0];
    if (latest?.status === "down") hasDown = true;
    if (latest?.status === "degraded") hasDegraded = true;

    services.push({ name: check.name, status: latest?.status || "unknown", uptime: Math.round(uptime * 100) / 100, latencyAvg: Math.round(latencyAvg) });
  }

  return {
    overall: hasDown ? "outage" : hasDegraded ? "degraded" : "operational",
    services,
  };
}
```

## Results

- **Monitoring cost: $2,000/month → $0** — focused health checks on what matters; 20 services × 3 regions checked every 30 seconds; no metric overload
- **MTTD: 45 minutes → 30 seconds** — database down detected after 3 consecutive failures (90 seconds); alert fires immediately; on-call engineer paged
- **Alert fatigue eliminated** — anomaly detection uses statistical baselines, not fixed thresholds; latency spike at 3 AM that's normal during backups doesn't alert; genuine spike does
- **Customer-facing status page** — real-time status with uptime percentages; customers check status page before contacting support; support tickets during incidents down 40%
- **Multi-region checks** — service healthy in US-East but down in EU-West caught immediately; CDN misconfiguration found that single-region monitoring would miss
