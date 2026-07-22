---
title: Deploy a Full-Stack App Globally with Fly.io
slug: deploy-fullstack-app-globally-with-fly-io
description: Deploy a Next.js application with PostgreSQL to multiple Fly.io regions, using LiteFS for edge-local reads and auto-scaling machines that stop when idle — achieving sub-30ms response times worldwide on a $15/month budget.
skills:
  - fly-io
  - neon
  - docker-helper
category: devops
tags:
  - deployment
  - multi-region
  - edge
  - performance
  - devops
---

# Deploy a Full-Stack App Globally with Fly.io

Jonas built a habit tracking app as a side project. It's a simple Next.js app with PostgreSQL — 2,000 daily active users spread across the US, Europe, and Southeast Asia. It runs on a single Railway instance in `us-east-1`. Users in Singapore complain about 800ms page loads. He doesn't want to manage Kubernetes or pay Vercel Enterprise prices for multi-region deployment. He wants the app to run close to users with minimal operational complexity.

## Step 1 — Configure the Fly.io App

Fly.io runs Docker containers as Firecracker microVMs. The `fly.toml` configuration defines machine sizing, health checks, auto-scaling, and multi-region deployment.

```toml
# fly.toml — Application configuration.
# Fly deploys this app as microVMs in the specified regions.
# Machines auto-stop when idle and auto-start on incoming requests.

app = "habit-tracker"
primary_region = "iad"    # US East — primary for database writes

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  # Database URL injected via `fly secrets`

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "suspend"   # Suspend (not stop) for faster wake-up
  auto_start_machines = true       # Wake on incoming request
  min_machines_running = 1         # Keep at least 1 machine hot per region
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200               # Start new machine when hitting 200 concurrent requests

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"

# Deploy to 3 regions: US, Europe, Asia
# Fly's Anycast routing sends users to the nearest region automatically
[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["app"]
```

```dockerfile
# Dockerfile — Multi-stage build for Next.js on Fly.io.
# The standalone output mode produces a minimal server (~15MB)
# instead of shipping the entire node_modules (~500MB).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js standalone mode: produces a self-contained server
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy only what's needed to run the app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

The `auto_stop_machines = "suspend"` setting is key for cost control. Fly suspends idle machines to memory instead of stopping them completely. Resume time is ~300ms (vs ~2s for a full start), and suspended machines cost nothing for compute — only memory.

## Step 2 — Set Up Multi-Region PostgreSQL

For a side project with 2,000 users, a managed PostgreSQL with read replicas is overkill. Instead, Jonas uses Neon with connection pooling — the serverless driver handles cold starts, and Fly's private networking keeps latency low.

```typescript
// src/lib/db.ts — Database client with region-aware routing.
// Reads go to the nearest Neon endpoint (via connection pooling).
// Writes go to the primary region using Fly-Replay header.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Neon pooled connection for read queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,                 // Low pool size — Fly machines are small
  idleTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

// Graceful shutdown
process.on("SIGTERM", () => pool.end());
```

```typescript
// src/middleware.ts — Route write requests to the primary region.
// Fly's Anycast routes users to the nearest region.
// For GET requests (reads), the nearest region handles them.
// For POST/PUT/DELETE (writes), we replay to the primary region
// where the database primary lives.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const method = request.method;
  const region = process.env.FLY_REGION || "iad";
  const primaryRegion = process.env.PRIMARY_REGION || "iad";

  // If this is a write request and we're not in the primary region,
  // tell Fly Proxy to replay it to the primary region
  if (method !== "GET" && method !== "HEAD" && region !== primaryRegion) {
    return new NextResponse(null, {
      status: 409,
      headers: {
        "fly-replay": `region=${primaryRegion}`,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",   // Only apply to API routes
};
```

The `fly-replay` header tells Fly's proxy layer to transparently replay the request to a machine in the specified region. The client never sees the 409 — Fly handles the replay internally. From the user's perspective, the write request just takes an extra ~80ms of cross-region latency.

## Step 3 — Deploy to Multiple Regions

```bash
# Initial deployment
fly deploy

# Scale to 3 regions: US East, Frankfurt, Tokyo
fly scale count 1 --region iad    # US East (primary — database writes)
fly scale count 1 --region fra    # Frankfurt (Europe)
fly scale count 1 --region nrt    # Tokyo (Asia)

# Set secrets (encrypted, injected as env vars)
fly secrets set DATABASE_URL="postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/habits?sslmode=require"
fly secrets set PRIMARY_REGION="iad"
fly secrets set NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# Verify deployment
fly status
```

```typescript
// src/app/api/health/route.ts — Health check endpoint.
// Returns the current region for debugging multi-region routing.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    region: process.env.FLY_REGION || "unknown",
    machine: process.env.FLY_MACHINE_ID || "unknown",
    timestamp: new Date().toISOString(),
  });
}
```

## Step 4 — Add Caching for Read-Heavy Pages

The dashboard page loads habits and streaks — data that changes at most once per day (when the user checks off a habit). Caching this response at the edge eliminates database queries for 95% of page loads.

```typescript
// src/app/dashboard/page.tsx — Server component with cache control.
// Next.js revalidates this page at most once per 60 seconds.
// Combined with Fly's edge proximity, users see cached data in <20ms.

import { db } from "@/lib/db";
import { habits, entries } from "@/lib/schema";
import { eq, and, gte } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Revalidate at most every 60 seconds per user
export const revalidate = 60;

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];

  const [userHabits, recentEntries] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, session.user.id)),

    db.select()
      .from(entries)
      .where(
        and(
          eq(entries.userId, session.user.id),
          gte(entries.date, thirtyDaysAgo)
        )
      ),
  ]);

  // Calculate streaks
  const habitsWithStreaks = userHabits.map((habit) => {
    const habitEntries = recentEntries
      .filter((e) => e.habitId === habit.id)
      .map((e) => e.date)
      .sort()
      .reverse();

    let streak = 0;
    let checkDate = today;
    for (const entryDate of habitEntries) {
      if (entryDate === checkDate) {
        streak++;
        // Move to previous day
        const d = new Date(checkDate);
        d.setDate(d.getDate() - 1);
        checkDate = d.toISOString().split("T")[0];
      } else {
        break;
      }
    }

    return {
      ...habit,
      streak,
      completedToday: habitEntries[0] === today,
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Today's Habits</h1>
      <div className="space-y-3">
        {habitsWithStreaks.map((habit) => (
          <HabitCard key={habit.id} habit={habit} />
        ))}
      </div>
    </div>
  );
}
```

## Results

Jonas deployed the multi-region setup in one evening. The changes after switching from Railway:

- **Singapore P95 latency: 820ms → 28ms** — machines running in `nrt` (Tokyo) serve Southeast Asian users. The nearest region is ~50ms round-trip instead of ~300ms to `us-east-1`.
- **Frankfurt P95 latency: 340ms → 22ms** — European users hit the `fra` region directly.
- **US East latency unchanged at 25ms** — the primary region stays in `iad`, same as before.
- **Monthly cost: $28 (Railway) → $14 (Fly.io)** — three machines at `shared-cpu-1x` with 512MB RAM, suspended when idle. The machines run ~8 hours per day (active usage window), costing nothing during overnight idle.
- **Cold start: ~400ms** for suspended machines (memory snapshot resume). The `min_machines_running = 1` setting keeps one machine hot per region for the first request.
- **Deploy time: 45 seconds** — Fly builds the Docker image remotely and rolls out machines with zero downtime. No CI/CD pipeline needed for a side project.
- **Zero operational overhead** — no Kubernetes, no load balancer configuration, no health check routing. Fly's Anycast IP handles global routing, and `fly-replay` handles write routing to the primary region.
