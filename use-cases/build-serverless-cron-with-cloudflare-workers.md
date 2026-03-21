---
title: "Build Serverless Cron Jobs with Cloudflare Workers"
description: "Replace unreliable server-based cron jobs with edge-native scheduled Workers — persistent state, job logs, error alerts, and job chaining via Queues."
skills: [cloudflare-workers, hono]
difficulty: intermediate
time_estimate: "4 hours"
tags: [cloudflare, workers, cron, scheduled, kv, d1, queues, sentry, serverless]
---

# Build Serverless Cron Jobs with Cloudflare Workers

## The Problem

Your server cron jobs fail silently. The VM restarts at 3 AM, the cron process dies, nobody notices until Monday. You need jobs that run on schedule, persist state between runs, log every execution, and alert you on failure — without managing any servers.

**Goal:** Edge-native scheduled jobs with state persistence, structured logging, and automatic retries.

---

## Who This Is For

**Developer replacing unreliable server crons** with Cloudflare Workers Cron Triggers. You want jobs that are observable, retryable, and don't require a running process somewhere.

---

## Architecture

```
worker/
├── src/
│   ├── index.ts          # Worker entry (scheduled + fetch handlers)
│   ├── jobs/
│   │   ├── daily-report.ts
│   │   ├── sync-users.ts
│   │   └── cleanup-expired.ts
│   ├── lib/
│   │   ├── db.ts         # D1 helpers
│   │   ├── kv.ts         # KV state helpers
│   │   └── notify.ts     # Sentry / alerts
│   └── types.ts
├── migrations/
│   └── 0001_job_logs.sql
└── wrangler.toml
```

---

## Step 1: Configure wrangler.toml

```toml
# wrangler.toml
name = "my-cron-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Cron Triggers — runs at 9 AM UTC every day
[triggers]
crons = ["0 9 * * *", "*/15 * * * *"]

# KV for state persistence
[[kv_namespaces]]
binding = "STATE"
id = "your-kv-namespace-id"

# D1 for job logs
[[d1_databases]]
binding = "DB"
database_name = "cron-logs"
database_id = "your-d1-database-id"

# Queue for job chaining
[[queues.producers]]
binding = "JOB_QUEUE"
queue = "job-chain"

[[queues.consumers]]
queue = "job-chain"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "job-chain-dlq"

[vars]
SENTRY_DSN = "https://your-sentry-dsn@sentry.io/project"
ENVIRONMENT = "production"
```

---

## Step 2: D1 Schema for Job Logs

```sql
-- migrations/0001_job_logs.sql
CREATE TABLE IF NOT EXISTS job_runs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_name    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed')),
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  error       TEXT,
  metadata    TEXT  -- JSON
);

CREATE INDEX idx_job_runs_name ON job_runs(job_name);
CREATE INDEX idx_job_runs_started ON job_runs(started_at DESC);
```

```bash
wrangler d1 execute cron-logs --file migrations/0001_job_logs.sql
```

---

## Step 3: Worker Entry Point

```typescript
// src/index.ts
import { handleScheduled } from "./jobs";
import { handleQueue } from "./queue-consumer";

export interface Env {
  STATE: KVNamespace;
  DB: D1Database;
  JOB_QUEUE: Queue;
  SENTRY_DSN: string;
  ENVIRONMENT: string;
}

export default {
  // Handles Cron Triggers
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(event.cron, env));
  },

  // Handles Queue messages (job chaining)
  async queue(
    batch: MessageBatch<JobMessage>,
    env: Env
  ): Promise<void> {
    await handleQueue(batch, env);
  },

  // Optional: manual trigger via HTTP for testing
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger" && request.method === "POST") {
      const { job } = await request.json<{ job: string }>();
      await handleScheduled(job, env);
      return Response.json({ ok: true });
    }
    return new Response("Cron Worker", { status: 200 });
  },
};
```

---

## Step 4: Job Runner with Logging

```typescript
// src/jobs/index.ts
import { dailyReport } from "./daily-report";
import { syncUsers } from "./sync-users";
import { cleanupExpired } from "./cleanup-expired";
import { logJobRun } from "../lib/db";
import { captureError } from "../lib/notify";
import type { Env } from "../index";

const JOB_REGISTRY: Record<string, (env: Env) => Promise<void>> = {
  "0 9 * * *": dailyReport,
  "*/15 * * * *": syncUsers,
  "daily-report": dailyReport,
  "sync-users": syncUsers,
  "cleanup-expired": cleanupExpired,
};

export async function handleScheduled(cron: string, env: Env): Promise<void> {
  const job = JOB_REGISTRY[cron];
  if (!job) {
    console.warn(`No job registered for cron: ${cron}`);
    return;
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  await logJobRun(env.DB, {
    id: runId,
    job_name: cron,
    status: "running",
    started_at: startedAt,
  });

  try {
    await job(env);

    const duration = Date.now() - startedAt;
    await logJobRun(env.DB, {
      id: runId,
      job_name: cron,
      status: "success",
      started_at: startedAt,
      finished_at: Date.now(),
      duration_ms: duration,
    });

    console.log(`✅ Job ${cron} completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startedAt;
    const errorMsg = error instanceof Error ? error.message : String(error);

    await logJobRun(env.DB, {
      id: runId,
      job_name: cron,
      status: "failed",
      started_at: startedAt,
      finished_at: Date.now(),
      duration_ms: duration,
      error: errorMsg,
    });

    await captureError(error, env, { jobName: cron, runId });
    console.error(`❌ Job ${cron} failed:`, error);
    throw error; // re-throw so Cloudflare retries
  }
}
```

---

## Step 5: KV State Persistence

```typescript
// src/lib/kv.ts
import type { Env } from "../index";

export async function getLastRun(
  env: Env,
  jobName: string
): Promise<Date | null> {
  const val = await env.STATE.get(`last_run:${jobName}`);
  return val ? new Date(val) : null;
}

export async function setLastRun(env: Env, jobName: string): Promise<void> {
  await env.STATE.put(`last_run:${jobName}`, new Date().toISOString(), {
    expirationTtl: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function getState<T>(
  env: Env,
  key: string
): Promise<T | null> {
  const val = await env.STATE.get(key, { type: "json" });
  return val as T | null;
}

export async function setState<T>(
  env: Env,
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  await env.STATE.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds,
  });
}
```

---

## Step 6: Example Job — Daily Report

```typescript
// src/jobs/daily-report.ts
import { getLastRun, setLastRun } from "../lib/kv";
import type { Env } from "../index";

export async function dailyReport(env: Env): Promise<void> {
  const lastRun = await getLastRun(env, "daily-report");
  const since = lastRun ?? new Date(Date.now() - 86400000);

  console.log(`Generating report for events since ${since.toISOString()}`);

  // Query your data source
  const result = await env.DB.prepare(`
    SELECT job_name, COUNT(*) as runs,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
           AVG(duration_ms) as avg_duration
    FROM job_runs
    WHERE started_at > ?
    GROUP BY job_name
  `).bind(since.getTime()).all();

  // Send report via webhook / email
  await fetch("https://hooks.slack.com/your-webhook", {
    method: "POST",
    body: JSON.stringify({
      text: `📊 Daily Job Report\n${JSON.stringify(result.results, null, 2)}`,
    }),
  });

  await setLastRun(env, "daily-report");
}
```

---

## Step 7: Job Chaining via Queues

```typescript
// src/queue-consumer.ts
import type { Env } from "./index";

export type JobMessage = {
  jobName: string;
  payload: Record<string, unknown>;
  attempt: number;
};

export async function handleQueue(
  batch: MessageBatch<JobMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const { jobName, payload, attempt } = message.body;

    try {
      console.log(`Processing queued job: ${jobName} (attempt ${attempt})`);
      // dispatch to job registry...
      message.ack();
    } catch (error) {
      console.error(`Queue job failed: ${jobName}`, error);
      message.retry({ delaySeconds: Math.pow(2, attempt) * 30 }); // exponential backoff
    }
  }
}

// Trigger next job in chain
export async function chainJob(
  env: Env,
  jobName: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await env.JOB_QUEUE.send({ jobName, payload, attempt: 1 });
}
```

---

## Deploy

```bash
wrangler deploy
wrangler cron trigger  # test manually in dashboard
```

---

## Result

- ✅ Jobs run on schedule at the edge — no server to maintain
- ✅ Every run logged to D1 with duration and status
- ✅ KV state persists across invocations
- ✅ Sentry alerts on failure
- ✅ Queue-based chaining with automatic retries and backoff
- ✅ Manual HTTP trigger for local testing

**Payoff:** Your cron jobs now run more reliably than any server you've ever maintained, and you can query their history with SQL.
