---
title: Deploy a Full-Stack App Globally with Fly.io
slug: deploy-fullstack-app-globally-with-fly-io
description: Deploy a Next.js application with Neon PostgreSQL to multiple Fly.io regions, with TLS and static assets served near users, database-backed requests replayed to the primary region, and machines that suspend when idle.
skills:
  - fly-io
  - neon
  - docker-helper
  - vercel
category: devops
tags:
  - deployment
  - multi-region
  - edge
  - performance
  - devops
---

# Deploy a Full-Stack App Globally with Fly.io

Jonas built a habit tracking app as a side project. It's a Next.js app with PostgreSQL, with users spread across the US, Europe, and Southeast Asia. It runs on a single Railway instance in the US East. Users in Singapore complain about slow page loads. He doesn't want to manage Kubernetes or pay Vercel Enterprise prices for multi-region deployment. He wants the app to run close to users with minimal operational complexity.

One thing to settle first: a Postgres database lives in one region. Neon gives you one primary in the region you choose, so any request that queries it is only fast when it runs next to it. The plan is to terminate TLS and serve static assets in every region, and to send every request that touches the database to the primary region with `fly-replay`.

## Step 1 — Package the app (docker-helper)

Fly.io runs Docker images as Firecracker microVMs. Next.js needs `output: "standalone"` in `next.config.ts` so the build produces a self-contained `server.js`:

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

```dockerfile
# Dockerfile — multi-stage build; the runtime stage holds only the standalone output.
# Node 20 reached end of life in April 2026, so use a current LTS.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Fly Proxy reaches the app on its private network, so listen on all interfaces
ENV HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

```text
# .dockerignore
node_modules
.next
.git
.env*
```

The `HOSTNAME` variable is the documented way to choose the interface for the standalone server (`PORT` likewise). Without `.dockerignore`, `COPY . .` would also copy `.env` files into an image layer.

## Step 2 — Configure the Fly.io app (fly-io)

```bash
fly launch --no-deploy --name habit-tracker --region iad
```

`fly launch` detects the Dockerfile and writes a `fly.toml`; edit it to look like this:

```toml
# fly.toml
app = "habit-tracker"
primary_region = "iad"          # Ashburn; Fly sets PRIMARY_REGION in every machine from this

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"  # "off", "stop" or "suspend"
  auto_start_machines = true
  min_machines_running = 1        # applies to the primary region only

  [http_service.concurrency]
    type = "requests"
    soft_limit = 200
    hard_limit = 250

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/api/health"
    timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

`"suspend"` snapshots a machine's memory instead of shutting it down; resuming takes a few hundred milliseconds, against about 2 seconds or more for a cold start. A stopped or suspended machine is not billed for CPU or RAM, only for its root filesystem. Suspend has limits: 2 GB of memory or less, and a deploy invalidates the old snapshots, so the next request after a deploy is a cold start. `min_machines_running` keeps a machine awake only in the primary region; in `fra` and `sin` the first request after an idle period pays the resume time.

## Step 3 — Connect to Neon from the primary region (neon)

Create the Neon project in the AWS region closest to `iad` (US East), and use its pooled connection string (the host contains `-pooler`):

```typescript
// src/lib/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Neon pooled string, set as a Fly secret
  max: 5,                                     // small machines, and Neon pools server-side too
  idleTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

process.on("SIGTERM", () => void pool.end());
```

Next.js 16 renamed `middleware.ts` to `proxy.ts` (the old name still works but is deprecated). This one replays database-backed requests to the primary region:

```typescript
// src/proxy.ts — replay anything that needs the database to the primary region.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Fly's HTTP health check calls this path on each machine itself; it must answer 200 locally.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  const region = process.env.FLY_REGION;
  const primary = process.env.PRIMARY_REGION; // set by Fly from fly.toml

  if (region && primary && region !== primary) {
    return new NextResponse(null, {
      status: 409,
      headers: { "fly-replay": `region=${primary}` },
    });
  }
  return NextResponse.next();
}

export const config = {
  // Database-backed routes only; static assets and the marketing pages stay local.
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
```

Fly Proxy sees the `fly-replay` response header and re-runs the original request on a machine in `iad`; the browser never sees the 409. Requests larger than 1 MB cannot be replayed, so upload files directly to object storage instead of through these routes.

## Step 4 — Deploy to three regions

```bash
fly secrets set --stage DATABASE_URL="$NEON_POOLED_URL" AUTH_SECRET="$(openssl rand -base64 32)"
fly deploy

# One command per region so each gets exactly one machine
fly scale count 1 --region iad
fly scale count 1 --region fra
fly scale count 1 --region sin
fly status
```

`--stage` queues the secrets for the first deploy instead of triggering a separate one. `$NEON_POOLED_URL` comes from the Neon dashboard and stays in your shell, not in the repository. `AUTH_SECRET` is the variable Auth.js v5 reads.

```typescript
// src/app/api/health/route.ts — shows which region answered, to verify routing.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    region: process.env.FLY_REGION ?? "unknown",
    machine: process.env.FLY_MACHINE_ID ?? "unknown",
  });
}
```

The proxy above lets `/api/health` through unreplayed. The Fly health check expects a 2xx answer from each machine itself, so a replay (a 409 from a `fra` or `sin` machine) would mark that machine unhealthy and can stall the deploy.

To confirm the routing, call `/api/health` from different continents and compare the `region` field (each region answers for itself), or read `fly logs` while you click through the app.

## Step 5 — Keep the dashboard to one query round trip

The dashboard runs in `iad`, next to Neon, so the two queries are cheap there. Run them in parallel and compute streaks in code:

```typescript
// src/app/dashboard/page.tsx — server component, runs in the primary region.
import { redirect } from "next/navigation";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { habits, entries } from "@/lib/schema";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const day = (d: Date) => d.toISOString().split("T")[0];
  const today = day(new Date());
  const since = day(new Date(Date.now() - 30 * 86_400_000));

  const [userHabits, recent] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, session.user.id)),
    db.select().from(entries).where(
      and(eq(entries.userId, session.user.id), gte(entries.date, since)),
    ),
  ]);

  const withStreaks = userHabits.map((habit) => {
    const dates = new Set(recent.filter((e) => e.habitId === habit.id).map((e) => e.date));
    let streak = 0;
    for (let d = new Date(today); dates.has(day(d)); d.setDate(d.getDate() - 1)) streak++;
    return { ...habit, streak, completedToday: dates.has(today) };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Today&apos;s Habits</h1>
      {withStreaks.map((habit) => (
        <HabitCard key={habit.id} habit={habit} />
      ))}
    </div>
  );
}
```

This page reads the session cookie, so Next.js renders it per request; a `revalidate` export would not cache it. If you later need local reads in `fra` and `sin`, that is a database decision (a database with regional replicas), not a caching flag.

## What to expect

- **Static assets, the landing page and TLS handshakes** are served from the nearest region, which is where Singapore and Frankfurt users gain most.
- **Dashboard and API calls** pay one cross-region hop to `iad`. Measure it with the real app (`curl -w '%{time_total}'` from each region) before promising numbers; the saving is a fraction of the old round trip, not a drop to local latency.
- **Cost:** a `shared-cpu-1x` machine with 512 MB is listed at $3.69 per month if it ran all month, so three machines come to about $11 at that price (less while suspended; check the pricing page for your regions), plus root filesystem storage at $0.15 per GB-month.
- **Deploys:** Fly builds the image on a remote builder and rolls out machines one by one; the health check gates each step.

## Related Skills

- [fly-io](/skills/fly-io) — machines, regions, autostop, `fly-replay` and secrets
- [neon](/skills/neon) — the serverless Postgres primary and pooled connections
- [docker-helper](/skills/docker-helper) — the multi-stage Dockerfile and `.dockerignore`
- [vercel](/skills/vercel) — a managed alternative for the same deployment: preview URLs per commit, promote and rollback from the CLI, no containers to run
