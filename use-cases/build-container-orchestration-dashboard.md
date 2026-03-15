---
title: Build a Container Orchestration Dashboard
slug: build-container-orchestration-dashboard
description: Build a real-time dashboard that visualizes Docker container health, resource usage, logs, and deployments — giving teams instant infrastructure visibility without kubectl.
skills:
  - typescript
  - nextjs
  - redis
  - docker
  - tailwindcss
category: devops
tags:
  - docker
  - containers
  - dashboard
  - monitoring
  - devops
---

# Build a Container Orchestration Dashboard

## The Problem

Leo manages infrastructure at a 25-person startup running 40+ Docker containers across 3 servers. When something breaks at 2 AM, the on-call engineer SSHes into each server, runs `docker ps`, `docker logs`, and `docker stats` — a 15-minute process just to find which container is unhealthy. There's no centralized view of container health, no alerting on resource spikes, and deployments are manual SSH + docker-compose commands. A dashboard would give the team instant visibility and reduce incident response time from 15 minutes to 30 seconds.

## Step 1: Build the Container Metrics Collector

An agent runs on each Docker host, collecting container stats via the Docker API and pushing them to Redis for real-time aggregation.

```typescript
// src/agent/collector.ts — Docker metrics collector agent
import Docker from "dockerode";
import { Redis } from "ioredis";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const redis = new Redis(process.env.REDIS_URL!);
const HOST_ID = process.env.HOST_ID || "host-1";

interface ContainerMetrics {
  containerId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  health: string | null;
  cpuPercent: number;
  memoryUsageMB: number;
  memoryLimitMB: number;
  memoryPercent: number;
  networkRxMB: number;
  networkTxMB: number;
  blockReadMB: number;
  blockWriteMB: number;
  restartCount: number;
  uptime: string;
  ports: Array<{ host: number; container: number; protocol: string }>;
  labels: Record<string, string>;
  hostId: string;
  collectedAt: number;
}

export async function collectMetrics(): Promise<ContainerMetrics[]> {
  const containers = await docker.listContainers({ all: true });
  const metrics: ContainerMetrics[] = [];

  for (const containerInfo of containers) {
    try {
      const container = docker.getContainer(containerInfo.Id);
      const inspect = await container.inspect();

      let cpuPercent = 0;
      let memUsage = 0;
      let memLimit = 0;
      let netRx = 0;
      let netTx = 0;

      // Get live stats (one-shot, don't stream)
      if (containerInfo.State === "running") {
        const stats = await container.stats({ stream: false });

        // CPU calculation
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const numCpus = stats.cpu_stats.online_cpus || 1;
        cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

        // Memory
        memUsage = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
        memLimit = stats.memory_stats.limit;

        // Network
        if (stats.networks) {
          for (const net of Object.values(stats.networks) as any[]) {
            netRx += net.rx_bytes;
            netTx += net.tx_bytes;
          }
        }
      }

      const metric: ContainerMetrics = {
        containerId: containerInfo.Id.slice(0, 12),
        name: containerInfo.Names[0]?.replace("/", "") || "unknown",
        image: containerInfo.Image,
        status: containerInfo.Status,
        state: containerInfo.State,
        health: inspect.State.Health?.Status || null,
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsageMB: Math.round(memUsage / 1048576),
        memoryLimitMB: Math.round(memLimit / 1048576),
        memoryPercent: memLimit > 0 ? Math.round((memUsage / memLimit) * 10000) / 100 : 0,
        networkRxMB: Math.round(netRx / 1048576 * 100) / 100,
        networkTxMB: Math.round(netTx / 1048576 * 100) / 100,
        blockReadMB: 0,
        blockWriteMB: 0,
        restartCount: inspect.RestartCount,
        uptime: containerInfo.Status,
        ports: (containerInfo.Ports || []).map((p) => ({
          host: p.PublicPort,
          container: p.PrivatePort,
          protocol: p.Type,
        })),
        labels: containerInfo.Labels,
        hostId: HOST_ID,
        collectedAt: Date.now(),
      };

      metrics.push(metric);
    } catch {
      // Container may have stopped between list and inspect
    }
  }

  return metrics;
}

// Push metrics to Redis for the dashboard to consume
export async function pushMetrics(): Promise<void> {
  const metrics = await collectMetrics();

  const pipeline = redis.pipeline();

  for (const metric of metrics) {
    const key = `container:${HOST_ID}:${metric.containerId}`;
    pipeline.setex(key, 30, JSON.stringify(metric)); // expires if agent stops

    // Store in time series for historical charts
    pipeline.zadd(
      `metrics:${metric.containerId}:cpu`,
      metric.collectedAt,
      JSON.stringify({ t: metric.collectedAt, v: metric.cpuPercent })
    );
    pipeline.zadd(
      `metrics:${metric.containerId}:memory`,
      metric.collectedAt,
      JSON.stringify({ t: metric.collectedAt, v: metric.memoryPercent })
    );

    // Trim to last hour of data
    const oneHourAgo = Date.now() - 3600000;
    pipeline.zremrangebyscore(`metrics:${metric.containerId}:cpu`, 0, oneHourAgo);
    pipeline.zremrangebyscore(`metrics:${metric.containerId}:memory`, 0, oneHourAgo);
  }

  // Store host-level summary
  pipeline.setex(`host:${HOST_ID}`, 30, JSON.stringify({
    hostId: HOST_ID,
    containerCount: metrics.length,
    runningCount: metrics.filter((m) => m.state === "running").length,
    totalCpuPercent: metrics.reduce((s, m) => s + m.cpuPercent, 0),
    totalMemoryMB: metrics.reduce((s, m) => s + m.memoryUsageMB, 0),
    collectedAt: Date.now(),
  }));

  await pipeline.exec();

  // Publish for real-time WebSocket updates
  await redis.publish("container:updates", JSON.stringify({
    hostId: HOST_ID,
    containers: metrics,
    timestamp: Date.now(),
  }));
}

// Run collection every 5 seconds
setInterval(pushMetrics, 5000);
pushMetrics(); // initial collection
```

## Step 2: Build the Dashboard API

The API aggregates metrics from all hosts and serves them to the dashboard frontend.

```typescript
// src/api/routes.ts — Dashboard API endpoints
import { Hono } from "hono";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Get all containers across all hosts
app.get("/containers", async (c) => {
  const keys = await redis.keys("container:*:*");
  const pipeline = redis.pipeline();
  keys.forEach((key) => pipeline.get(key));
  const results = await pipeline.exec();

  const containers = results!
    .filter(([err, val]) => !err && val)
    .map(([, val]) => JSON.parse(val as string))
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json({ containers, total: containers.length });
});

// Get all hosts summary
app.get("/hosts", async (c) => {
  const keys = await redis.keys("host:*");
  const pipeline = redis.pipeline();
  keys.forEach((key) => pipeline.get(key));
  const results = await pipeline.exec();

  const hosts = results!
    .filter(([err, val]) => !err && val)
    .map(([, val]) => JSON.parse(val as string));

  return c.json({ hosts });
});

// Get container metrics history (last hour)
app.get("/containers/:id/metrics", async (c) => {
  const { id } = c.req.param();
  const metric = c.req.query("metric") || "cpu"; // cpu or memory

  const data = await redis.zrangebyscore(
    `metrics:${id}:${metric}`,
    Date.now() - 3600000,
    "+inf"
  );

  const points = data.map((d) => JSON.parse(d));
  return c.json({ metric, points });
});

// Get container logs (last 100 lines)
app.get("/containers/:id/logs", async (c) => {
  const { id } = c.req.param();
  const lines = Number(c.req.query("lines") || 100);

  // Find which host has this container
  const keys = await redis.keys(`container:*:${id}`);
  if (keys.length === 0) return c.json({ error: "Container not found" }, 404);

  const containerData = JSON.parse((await redis.get(keys[0]))!);

  // Logs are fetched on-demand via the agent
  await redis.publish("log:request", JSON.stringify({
    containerId: id,
    hostId: containerData.hostId,
    lines,
  }));

  // Wait for log response (agent publishes to log:response:{id})
  return new Promise((resolve) => {
    const sub = new Redis(process.env.REDIS_URL!);
    const timeout = setTimeout(() => {
      sub.disconnect();
      resolve(c.json({ error: "Log fetch timeout" }, 504));
    }, 5000);

    sub.subscribe(`log:response:${id}`);
    sub.on("message", (channel, message) => {
      clearTimeout(timeout);
      sub.disconnect();
      resolve(c.json(JSON.parse(message)));
    });
  });
});

// Container actions: restart, stop, start
app.post("/containers/:id/:action", async (c) => {
  const { id, action } = c.req.param();
  if (!["restart", "stop", "start"].includes(action)) {
    return c.json({ error: "Invalid action" }, 400);
  }

  const keys = await redis.keys(`container:*:${id}`);
  if (keys.length === 0) return c.json({ error: "Container not found" }, 404);

  const containerData = JSON.parse((await redis.get(keys[0]))!);

  await redis.publish("container:action", JSON.stringify({
    containerId: id,
    hostId: containerData.hostId,
    action,
    requestedBy: c.get("userId") || "dashboard",
  }));

  return c.json({ success: true, action, containerId: id });
});

export default app;
```

## Step 3: Build the Dashboard UI

The frontend displays a real-time grid of containers with health indicators, resource gauges, and one-click actions.

```typescript
// src/components/ContainerGrid.tsx — Real-time container dashboard
import { useState, useEffect } from "react";

interface Container {
  containerId: string;
  name: string;
  image: string;
  state: string;
  health: string | null;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsageMB: number;
  memoryLimitMB: number;
  restartCount: number;
  hostId: string;
  uptime: string;
}

export function ContainerGrid() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const fetchContainers = async () => {
      const res = await fetch("/api/containers");
      const data = await res.json();
      setContainers(data.containers);
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 5000);

    return () => clearInterval(interval);
  }, []);

  const filtered = filter === "all"
    ? containers
    : containers.filter((c) => c.state === filter);

  const running = containers.filter((c) => c.state === "running").length;
  const stopped = containers.filter((c) => c.state !== "running").length;
  const unhealthy = containers.filter((c) => c.health === "unhealthy").length;

  return (
    <div className="p-6">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={containers.length} color="blue" />
        <StatCard label="Running" value={running} color="green" />
        <StatCard label="Stopped" value={stopped} color="gray" />
        <StatCard label="Unhealthy" value={unhealthy} color="red" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {["all", "running", "exited", "restarting"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-sm ${filter === f ? "bg-blue-600 text-white" : "bg-gray-100"}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Container cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((container) => (
          <ContainerCard key={container.containerId} container={container} />
        ))}
      </div>
    </div>
  );
}

function ContainerCard({ container }: { container: Container }) {
  const stateColors: Record<string, string> = {
    running: "border-green-400 bg-green-50",
    exited: "border-red-400 bg-red-50",
    restarting: "border-yellow-400 bg-yellow-50",
  };

  const handleAction = async (action: string) => {
    await fetch(`/api/containers/${container.containerId}/${action}`, { method: "POST" });
  };

  return (
    <div className={`border-l-4 rounded-lg p-4 bg-white shadow-sm ${stateColors[container.state] || "border-gray-400"}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{container.name}</h3>
          <p className="text-xs text-gray-500 font-mono">{container.image.split(":")[0]}</p>
        </div>
        <div className="flex items-center gap-1">
          {container.health === "unhealthy" && <span className="text-red-500 text-xs">⚠️</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            container.state === "running" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>{container.state}</span>
        </div>
      </div>

      {/* Resource gauges */}
      <div className="space-y-2 mb-3">
        <ResourceBar label="CPU" value={container.cpuPercent} max={100} unit="%" warn={80} />
        <ResourceBar label="MEM" value={container.memoryPercent} max={100}
          unit={`${container.memoryUsageMB}/${container.memoryLimitMB}MB`} warn={85} />
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>{container.uptime}</span>
        <span>{container.hostId}</span>
        {container.restartCount > 0 && (
          <span className="text-yellow-600">🔄 {container.restartCount}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t">
        {container.state === "running" ? (
          <>
            <ActionButton label="Restart" onClick={() => handleAction("restart")} />
            <ActionButton label="Stop" onClick={() => handleAction("stop")} danger />
            <ActionButton label="Logs" onClick={() => {/* open logs modal */}} />
          </>
        ) : (
          <ActionButton label="Start" onClick={() => handleAction("start")} />
        )}
      </div>
    </div>
  );
}

function ResourceBar({ label, value, max, unit, warn }: any) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct > warn ? "bg-red-500" : pct > warn * 0.7 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span>{typeof unit === "string" && unit.includes("/") ? unit : `${value.toFixed(1)}${unit}`}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <div className={`bg-white rounded-lg p-4 border-l-4 border-${color}-500 shadow-sm`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

function ActionButton({ label, onClick, danger }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-xs rounded ${danger ? "text-red-600 hover:bg-red-50" : "text-gray-600 hover:bg-gray-100"} border`}>
      {label}
    </button>
  );
}
```

## Results

After deploying the container dashboard across 3 servers:

- **Incident identification time: from 15 minutes to 30 seconds** — one glance at the dashboard shows which container is unhealthy, high on CPU, or restarting; no more SSH-ing into servers
- **Container restarts handled in 2 clicks** — the dashboard's restart button replaces SSH + docker restart; junior engineers can respond to incidents without server access
- **Resource over-provisioning reduced by 35%** — historical CPU/memory charts revealed that 12 containers were allocated 2-4x more memory than they actually used; right-sizing saved $400/month
- **Zero missed unhealthy containers** — the health indicator and restart count badges make problems impossible to overlook; previously, an unhealthy container ran for 3 days before anyone noticed
- **Deployment visibility** — teams see container image versions at a glance; "is the new version deployed?" no longer requires SSH
