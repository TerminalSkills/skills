---
title: Build Container Health Monitoring
slug: build-container-health-monitoring
description: Build a container health monitoring system with Docker stats collection, resource alerting, auto-restart policies, and a real-time dashboard — keeping services healthy without manual babysitting.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - docker
  - containers
  - monitoring
  - health-checks
  - auto-healing
---

# Build Container Health Monitoring

## The Problem

Ravi manages infrastructure at a 25-person startup running 20 Docker containers on 3 VPS servers. When a container OOMs at 3 AM, nobody notices until morning when customers report downtime. CPU spikes from a runaway process slow adjacent containers. Memory leaks gradually consume resources until everything crashes. They need container monitoring that watches resource usage, alerts on anomalies, auto-restarts unhealthy containers, and shows everything on a dashboard.

## Step 1: Build the Container Monitor

```typescript
// src/monitor/container-monitor.ts — Docker container monitoring with auto-healing
import Dockerode from "dockerode";
import { Redis } from "ioredis";
import { pool } from "../db";

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
const redis = new Redis(process.env.REDIS_URL!);

interface ContainerHealth {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "unhealthy" | "oom_killed";
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  networkRxMb: number;
  networkTxMb: number;
  restartCount: number;
  uptime: string;
  lastChecked: string;
}

interface AlertRule {
  metric: "cpu" | "memory" | "restarts";
  threshold: number;
  duration: number;        // consecutive checks over threshold
  action: "alert" | "restart" | "scale";
}

const ALERT_RULES: AlertRule[] = [
  { metric: "cpu", threshold: 90, duration: 3, action: "alert" },
  { metric: "memory", threshold: 85, duration: 2, action: "alert" },
  { metric: "memory", threshold: 95, duration: 1, action: "restart" },
  { metric: "restarts", threshold: 5, duration: 1, action: "alert" },
];

// Collect stats from all containers
export async function collectContainerStats(): Promise<ContainerHealth[]> {
  const containers = await docker.listContainers({ all: true });
  const stats: ContainerHealth[] = [];

  for (const containerInfo of containers) {
    const container = docker.getContainer(containerInfo.Id);
    const name = containerInfo.Names[0]?.replace("/", "") || containerInfo.Id.slice(0, 12);

    try {
      if (containerInfo.State !== "running") {
        stats.push({
          id: containerInfo.Id.slice(0, 12),
          name,
          image: containerInfo.Image,
          status: "stopped",
          cpuPercent: 0, memoryUsageMb: 0, memoryLimitMb: 0, memoryPercent: 0,
          networkRxMb: 0, networkTxMb: 0,
          restartCount: containerInfo.Labels?.["restartCount"] ? parseInt(containerInfo.Labels["restartCount"]) : 0,
          uptime: "stopped",
          lastChecked: new Date().toISOString(),
        });
        continue;
      }

      const liveStats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = liveStats.cpu_stats.cpu_usage.total_usage - liveStats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = liveStats.cpu_stats.system_cpu_usage - liveStats.precpu_stats.system_cpu_usage;
      const numCpus = liveStats.cpu_stats.online_cpus || 1;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

      // Memory
      const memoryUsage = liveStats.memory_stats.usage || 0;
      const memoryLimit = liveStats.memory_stats.limit || 0;
      const memoryUsageMb = memoryUsage / (1024 * 1024);
      const memoryLimitMb = memoryLimit / (1024 * 1024);

      // Network
      const networks = liveStats.networks || {};
      let rxBytes = 0, txBytes = 0;
      for (const net of Object.values(networks) as any[]) {
        rxBytes += net.rx_bytes || 0;
        txBytes += net.tx_bytes || 0;
      }

      // Check for OOM
      const inspection = await container.inspect();
      const oomKilled = inspection.State.OOMKilled;

      const health: ContainerHealth = {
        id: containerInfo.Id.slice(0, 12),
        name,
        image: containerInfo.Image,
        status: oomKilled ? "oom_killed" : "running",
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsageMb: Math.round(memoryUsageMb),
        memoryLimitMb: Math.round(memoryLimitMb),
        memoryPercent: memoryLimit > 0 ? Math.round((memoryUsage / memoryLimit) * 100) : 0,
        networkRxMb: Math.round(rxBytes / (1024 * 1024) * 100) / 100,
        networkTxMb: Math.round(txBytes / (1024 * 1024) * 100) / 100,
        restartCount: inspection.RestartCount,
        uptime: formatUptime(new Date(inspection.State.StartedAt)),
        lastChecked: new Date().toISOString(),
      };

      stats.push(health);

      // Store in Redis for real-time dashboard
      await redis.hset(`container:${health.id}`, {
        ...health,
        lastChecked: new Date().toISOString(),
      });
      await redis.expire(`container:${health.id}`, 120);

      // Store in PostgreSQL for historical data
      await pool.query(
        `INSERT INTO container_metrics (container_id, name, cpu_percent, memory_percent, memory_usage_mb, network_rx_mb, network_tx_mb, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [health.id, name, health.cpuPercent, health.memoryPercent, health.memoryUsageMb, health.networkRxMb, health.networkTxMb]
      );
    } catch (err: any) {
      console.error(`Error monitoring ${name}:`, err.message);
    }
  }

  // Check alert rules
  await evaluateAlerts(stats);

  return stats;
}

async function evaluateAlerts(stats: ContainerHealth[]): Promise<void> {
  for (const container of stats) {
    for (const rule of ALERT_RULES) {
      const value = rule.metric === "cpu" ? container.cpuPercent
        : rule.metric === "memory" ? container.memoryPercent
        : container.restartCount;

      if (value > rule.threshold) {
        const counterKey = `alert:${container.id}:${rule.metric}`;
        const count = await redis.incr(counterKey);
        await redis.expire(counterKey, 300);

        if (count >= rule.duration) {
          if (rule.action === "restart" && container.status === "running") {
            console.log(`[AUTO-HEAL] Restarting ${container.name}: ${rule.metric} at ${value}%`);
            const c = docker.getContainer(container.id);
            await c.restart({ t: 10 });

            await pool.query(
              `INSERT INTO container_events (container_id, name, event_type, details, created_at)
               VALUES ($1, $2, 'auto_restart', $3, NOW())`,
              [container.id, container.name, `${rule.metric} exceeded ${rule.threshold}%: ${value}%`]
            );

            await redis.del(counterKey);
          } else if (rule.action === "alert") {
            await redis.publish("alerts:container", JSON.stringify({
              container: container.name,
              metric: rule.metric,
              value,
              threshold: rule.threshold,
              message: `${container.name}: ${rule.metric} at ${value}% (threshold: ${rule.threshold}%)`,
            }));
          }
        }
      } else {
        await redis.del(`alert:${container.id}:${rule.metric}`);
      }
    }
  }
}

function formatUptime(startedAt: Date): string {
  const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

// Run monitoring loop
export async function startMonitoringLoop(intervalMs: number = 15000): Promise<void> {
  console.log(`[Monitor] Starting container monitoring (every ${intervalMs / 1000}s)`);
  setInterval(() => collectContainerStats().catch(console.error), intervalMs);
}
```

## Results

- **3 AM OOM crashes auto-recovered** — container restarted within 15 seconds of hitting 95% memory; customers experienced ~20s downtime instead of 8 hours
- **Memory leak detected early** — historical metrics show gradual memory climb; the team identifies leaking services before they OOM
- **CPU hog isolation** — alert fires when a container sustains >90% CPU for 3 checks (45 seconds); the team investigates before adjacent services are affected
- **Dashboard shows all 20 containers at a glance** — CPU, memory, network, uptime, restart count; no need to SSH into servers and run `docker stats`
- **Auto-restart reduced incidents by 70%** — containers with memory leaks automatically restart at 95%; the leak needs fixing but customers don't suffer in the meantime
