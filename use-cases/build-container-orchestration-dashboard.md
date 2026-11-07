---
title: Build a Container Orchestration Dashboard
slug: build-container-orchestration-dashboard
description: Build a real-time dashboard that visualizes Docker container health, resource usage, logs, and restarts across several hosts, giving teams infrastructure visibility without SSH.
skills:
  - typescript
  - nextjs
  - redis
  - docker-helper
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

Leo manages infrastructure at a 25-person startup running 40+ Docker containers across 3 servers. When something breaks at 2 AM, the on-call engineer SSHes into each server and runs `docker ps`, `docker logs` and `docker stats` to find which container is unhealthy. There is no central view of health, no sign of resource spikes, and restarts mean SSH access. The goal: one page that shows every container on every host, with logs and a restart button for the people allowed to use it. An agent on each Docker host reads container state and publishes it to Redis. A Hono API reads Redis and relays log and restart requests back to the right agent. A Next.js page renders it.

## Step 1: Run the Agent Next to a Socket Proxy

The Docker socket is root on the host, so the agent never mounts it. A `tecnativa/docker-socket-proxy` container mounts it (the `:ro` flag does not limit API calls; the proxy's rules do) and exposes only the `/containers` API, on a private network shared with nothing but the agent. Follow the `docker-helper` conventions: Compose v2 file without `version:`, secrets from `.env`, nothing published except what you need.

```yaml
# compose.yaml (one per Docker host)
services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1   # inspect, stats, logs
      POST: 1         # start/stop/restart; also allows create, so only the agent may reach it
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [agent-net]
    restart: unless-stopped

  agent:
    build: ./agent
    environment:
      DOCKER_HOST_NAME: docker-proxy
      HOST_ID: ${HOST_ID:?set HOST_ID in .env}
      REDIS_URL: ${REDIS_URL:?set REDIS_URL in .env}   # rediss://:password@redis.internal:6379
    depends_on: [docker-proxy]
    networks: [agent-net]
    restart: unless-stopped

networks:
  agent-net: {}   # no ports published; only the agent shares it
```

The agent image is a standard multi-stage Node build (the `docker-helper` Dockerfile pattern: `node:24-alpine`, `npm ci`, `npm prune --omit=dev`, `USER node`). Redis runs once, on a private network, with `--requirepass` (or TLS via `rediss://`). Every agent and the API authenticate to it; never expose port 6379 to the internet. Note that `inspect` output includes container environment variables, so the agent below copies only the fields the dashboard needs.

## Step 2: The Agent

It publishes metrics every 5 seconds and listens on one channel for commands for its host. Memory follows what `docker stats` reports: usage minus `inactive_file` on cgroup v2 hosts (`total_inactive_file` on v1). The old `stats.cache` field is cgroup v1 only and leaves v2 numbers wrong.

```typescript
// src/agent/collector.ts
import Docker from "dockerode";
import { Redis } from "ioredis";

const docker = new Docker({ host: process.env.DOCKER_HOST_NAME ?? "docker-proxy", port: 2375 });
const redis = new Redis(process.env.REDIS_URL!);
const sub = new Redis(process.env.REDIS_URL!);
const HOST_ID = process.env.HOST_ID!;
const MB = 1048576;

export async function collectMetrics() {
  const list = await docker.listContainers({ all: true });
  // `stats` with stream:false takes about a second per container: run them in parallel, not in turn.
  const rows = await Promise.all(list.map(async (info) => {
    try {
      const c = docker.getContainer(info.Id);
      const inspect = await c.inspect();
      let cpu = 0, mem = 0, limit = 0;
      if (info.State === "running") {
        const s: any = await c.stats({ stream: false });
        const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
        const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
        cpu = sysDelta > 0 ? (cpuDelta / sysDelta) * (s.cpu_stats.online_cpus || 1) * 100 : 0;
        const st = s.memory_stats.stats ?? {};
        mem = s.memory_stats.usage - (st.inactive_file ?? st.total_inactive_file ?? 0); limit = s.memory_stats.limit;
      }
      return {
        containerId: info.Id.slice(0, 12),
        name: info.Names[0]?.replace("/", "") ?? "unknown",
        image: info.Image, state: info.State, status: info.Status,
        health: inspect.State.Health?.Status ?? null,
        cpuPercent: Math.round(cpu * 100) / 100,
        memoryUsageMB: Math.round(mem / MB), memoryLimitMB: Math.round(limit / MB),
        restartCount: inspect.RestartCount,
        hostId: HOST_ID, collectedAt: Date.now(),
      };
    } catch { return null; /* container vanished */ }
  }));
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}

async function pushMetrics() {
  const p = redis.pipeline();
  for (const m of await collectMetrics()) p.setex(`container:${HOST_ID}:${m.containerId}`, 30, JSON.stringify(m)); // expires if the agent stops
  await p.exec();
}

// Strip Docker's 8-byte stream headers (non-TTY logs multiplex stdout and stderr).
function demux(buf: Buffer): string {
  let out = "", i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    out += buf.subarray(i + 8, i + 8 + size).toString("utf8");
    i += 8 + size;
  }
  return out;
}

sub.subscribe(`agent:${HOST_ID}`);
sub.on("message", async (_ch, raw) => {
  const cmd = JSON.parse(raw) as { requestId: string; type: "logs" | "action"; containerId: string; lines?: number; action?: string };
  if (!/^[0-9a-f]{12}$/.test(cmd.containerId)) return;
  const c = docker.getContainer(cmd.containerId);
  const reply = (body: unknown) => redis.publish(`reply:${cmd.requestId}`, JSON.stringify(body));
  try {
    if (cmd.type === "logs") {
      const tty = (await c.inspect()).Config.Tty;
      const buf = (await c.logs({ stdout: true, stderr: true, tail: Math.min(cmd.lines ?? 100, 500), timestamps: true })) as unknown as Buffer;
      await reply({ logs: tty ? buf.toString("utf8") : demux(buf) });
    } else if (cmd.type === "action" && ["start", "stop", "restart"].includes(cmd.action ?? "")) {
      await (c as any)[cmd.action!]();
      await reply({ success: true });
    }
  } catch (e) {
    await reply({ error: (e as Error).message });
  }
});

let busy = false; // never let a slow round overlap the next one
async function tick() {
  if (busy) return; busy = true;
  try { await pushMetrics(); } catch (e) { console.error(e); } finally { busy = false; }
}
setInterval(tick, 5000);
tick();
```

## Step 3: The Dashboard API

Browsers never talk to Redis or the agents. The API needs a bearer token on every route, compared in constant time, and takes a single request-scoped reply channel so two people asking for logs cannot receive each other's answers. `KEYS` is replaced with `SCAN`, which does not block Redis.

```typescript
// src/api/routes.ts
import { Hono } from "hono";
import { Redis } from "ioredis";
import { timingSafeEqual, randomUUID } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();
const TOKEN = Buffer.from(process.env.DASHBOARD_TOKEN!);

app.use("*", async (c, next) => {
  const given = Buffer.from((c.req.header("authorization") ?? "").replace(/^Bearer /, ""));
  if (given.length !== TOKEN.length || !timingSafeEqual(given, TOKEN)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

async function getAll(match: string) {
  const keys: string[] = [];
  for await (const batch of redis.scanStream({ match, count: 200 })) keys.push(...(batch as string[]));
  if (!keys.length) return [];
  return (await redis.mget(keys)).filter(Boolean).map((v) => JSON.parse(v!));
}

app.get("/containers", async (c) => {
  const containers = (await getAll("container:*:*")).sort((a, b) => a.name.localeCompare(b.name));
  return c.json({ containers });
});

// Send a command to the agent that owns the container and wait for its reply.
async function ask(hostId: string, cmd: object): Promise<any> {
  const requestId = randomUUID();
  const sub = new Redis(process.env.REDIS_URL!);
  try {
    const reply = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      sub.on("message", (_ch, msg) => { clearTimeout(t); resolve(JSON.parse(msg)); });
    });
    await sub.subscribe(`reply:${requestId}`);
    await redis.publish(`agent:${hostId}`, JSON.stringify({ ...cmd, requestId }));
    return await reply;
  } finally { sub.disconnect(); }
}

// Only containers an agent has reported recently can be targeted.
const known = async (host: string, id: string) =>
  /^[\w.-]{1,64}$/.test(host) && /^[0-9a-f]{12}$/.test(id) && (await redis.exists(`container:${host}:${id}`)) === 1;

app.get("/containers/:host/:id/logs", async (c) => {
  const { host, id } = c.req.param();
  if (!(await known(host, id))) return c.json({ error: "not found" }, 404);
  return c.json(await ask(host, { type: "logs", containerId: id, lines: Number(c.req.query("lines")) || 100 }).catch(() => ({ error: "timeout" })));
});

app.post("/containers/:host/:id/:action", async (c) => {
  const { host, id, action } = c.req.param();
  if (!["start", "stop", "restart"].includes(action)) return c.json({ error: "invalid action" }, 400);
  if (!(await known(host, id))) return c.json({ error: "not found" }, 404);
  console.log(JSON.stringify({ audit: "container-action", host, id, action, at: new Date().toISOString() }));
  return c.json(await ask(host, { type: "action", containerId: id, action }).catch(() => ({ error: "timeout" })));
});

export default app;
```

Serve it with `@hono/node-server` bound to `127.0.0.1`. The token stays on the server: Next.js route handlers check the user's session and call this API, so the browser never sees it.

## Step 4: The Dashboard UI

A client component in the Next.js App Router (`'use client'` is required for state and effects) polls the Next.js route handler every 5 seconds. Tailwind cannot see class names assembled at runtime such as `border-${color}-500`, so colors come from a lookup of complete class names.

```typescript
// app/containers/ContainerGrid.tsx
"use client";
import { useEffect, useState } from "react";

interface Container {
  containerId: string; name: string; image: string; state: string; health: string | null; cpuPercent: number;
  memoryUsageMB: number; memoryLimitMB: number; restartCount: number; hostId: string; status: string;
}

// Complete class names, so Tailwind's scanner can see them.
const BORDER: Record<string, string> = { running: "border-green-500", exited: "border-red-500", restarting: "border-yellow-500" };

export function ContainerGrid() {
  const [containers, setContainers] = useState<Container[]>([]);

  useEffect(() => {
    const load = () => fetch("/api/containers").then((r) => r.ok && r.json()).then((d) => d && setContainers(d.containers));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const act = (c: Container, action: string) =>
    fetch(`/api/containers/${c.hostId}/${c.containerId}/${action}`, { method: "POST" });

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {containers.map((c) => (
          <div key={`${c.hostId}-${c.containerId}`}
            className={`rounded-lg border-l-4 bg-white p-4 shadow-sm ${BORDER[c.state] ?? "border-gray-400"}`}>
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="font-mono text-xs text-gray-500">{c.image.split(":")[0]} on {c.hostId}</p>
              </div>
              <span className="text-xs">{c.health === "unhealthy" ? "unhealthy" : c.state}</span>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              CPU {c.cpuPercent.toFixed(1)}% · MEM {c.memoryUsageMB}/{c.memoryLimitMB} MB · {c.status}
              {c.restartCount > 0 ? ` · ${c.restartCount} restarts` : ""}
            </p>
            <div className="mt-3 flex gap-2 border-t pt-3">
              {c.state === "running"
                ? <><button className="rounded border px-3 py-1 text-xs" onClick={() => act(c, "restart")}>Restart</button>
                    <button className="rounded border px-3 py-1 text-xs text-red-600" onClick={() => act(c, "stop")}>Stop</button></>
                : <button className="rounded border px-3 py-1 text-xs" onClick={() => act(c, "start")}>Start</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

The `/api/containers` routes are thin Next.js route handlers (`app/api/containers/route.ts` and `app/api/containers/[host]/[id]/[action]/route.ts`). Each one checks the session, then forwards to the Hono API with `Authorization: Bearer ${process.env.DASHBOARD_TOKEN}` and returns the response. Only roles allowed to restart containers should reach the POST handler.

## Check It Works
Start with `docker compose up -d --wait`; `redis-cli --scan --pattern 'container:*'` should list your containers within 5 seconds. A `curl` to the API on `127.0.0.1` without the bearer header must return 401.

## Results
What Leo's team reported across 3 servers:

- Finding the unhealthy container went from about 15 minutes of SSH to a glance at one page.
- Restarts no longer need server access, and every action lands in the audit log.
- Memory figures showed a dozen containers using far less than they were given, which led to right-sizing.

## Related Skills
- `typescript`: shared types across agent, API and UI
- `nextjs`: the App Router page and the session-checking route handlers
- `redis`: metrics store, pub/sub command channel and request-scoped replies
- `docker-helper`: the Compose files for the agent, socket proxy and Redis
- `tailwindcss`: the card layout and static color maps
