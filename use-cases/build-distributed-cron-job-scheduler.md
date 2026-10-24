---
title: Build a Distributed Cron Job Scheduler
slug: build-distributed-cron-job-scheduler
description: Build a distributed job scheduler that runs each cron job once per tick across multiple server instances, with retry logic, dead letter queues, and observability.
skills:
  - typescript
  - redis
  - postgresql
  - bull-mq
  - hono
  - zod
category: devops
tags:
  - cron
  - distributed-systems
  - job-scheduling
  - reliability
  - background-jobs
---

# Build a Distributed Cron Job Scheduler

## The Problem

Farid runs backend at a 35-person e-commerce platform. They have 45 scheduled jobs: inventory syncs, report generation, email campaigns, price updates, analytics aggregation. These run via `node-cron` on a single server. When that server went down during Black Friday, no jobs ran for six hours: inventory went out of sync, three email campaigns missed their send window, and daily reports were not generated. Moving to several servers caused the opposite problem: every job ran once per instance, sending duplicate emails and creating duplicate reports.

They need each schedule tick to fire once across the fleet, with retries, a dead-letter record and failover when an instance dies.

## The Solution

Do not run a cron library in every instance and fight over a lock. BullMQ's **job schedulers** keep the schedule in Redis: one scheduler per job id, holding one pending run, that any worker in the fleet can pick up. If an instance dies, the others keep processing. Postgres stores the execution history, Hono serves a small management API, and Zod validates the job definitions. Checked against `bullmq` 6.4, `ioredis` 6, `pg` 8, `hono` 4 and `zod` 4.

One guarantee needs stating precisely: BullMQ creates each scheduled run once, but delivers it **at least once**. If a worker crashes mid-job, the job is picked up again after the lock expires, so every handler must be idempotent (use a unique key or an "already done for this period" check before sending an email or writing a report).

```bash
mkdir scheduler && cd scheduler && npm init -y && npm pkg set type=module
npm i bullmq ioredis pg hono @hono/node-server zod
npm i -D typescript tsx @types/node @types/pg
```

`ioredis` is no longer installed with BullMQ 6, and `"type": "module"` is needed for the top-level `await` in `main.ts`. Run Redis with `maxmemory-policy noeviction` and AOF persistence (eviction silently corrupts queues), and bind it to a private address.

## Step-by-Step Walkthrough

### 1. Postgres schema for execution history

```sql
CREATE TABLE IF NOT EXISTS job_executions (
  id           BIGSERIAL PRIMARY KEY,
  job_id       TEXT NOT NULL,
  bull_job_id  TEXT NOT NULL,
  attempt      INT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('running','completed','failed','dead-letter')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INT,
  result       JSONB,
  error        TEXT,
  executed_by  TEXT NOT NULL,
  UNIQUE (bull_job_id, attempt)
);
CREATE INDEX IF NOT EXISTS job_executions_job_started ON job_executions (job_id, started_at DESC);
```

### 2. Declarative job definitions

Definitions are validated with Zod. Handlers receive an `AbortSignal` that fires at the job's timeout, so a handler can stop its own work instead of being abandoned in the background.

```typescript
// src/jobs.ts
import { z } from "zod";

export const JobDefinition = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  schedule: z.string(),                       // cron expression, e.g. "0 */6 * * *"
  timezone: z.string().default("UTC"),        // IANA name
  timeoutSec: z.number().int().positive().default(300),
  retries: z.number().int().min(0).max(10).default(3),
  retryDelaySec: z.number().int().positive().default(60),
  enabled: z.boolean().default(true),
  maxAgeMin: z.number().int().positive().optional(), // alert if no success for this long
});
export type JobDefinition = z.infer<typeof JobDefinition>;

// A handler gets an AbortSignal that fires at the timeout. It MUST be idempotent:
// BullMQ can run a job again after a worker crash (at-least-once delivery).
export type Handler = (signal: AbortSignal) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  "inventory-sync": async () => ({ synced: 1204 }),
  "daily-report": async () => ({ rows: 88 }),
};

export const definitions = ([
  { id: "inventory-sync", schedule: "*/15 * * * *", maxAgeMin: 45 },
  { id: "daily-report", schedule: "0 6 * * *", timezone: "Europe/Berlin", timeoutSec: 900, maxAgeMin: 1500 },
] satisfies z.input<typeof JobDefinition>[]).map((d) => JobDefinition.parse(d));
```

### 3. Register the schedules and run the worker

`registerSchedules` is safe to call from every instance on every deploy: the scheduler id is the key, so Redis still holds one scheduler per job. The worker records each attempt in Postgres, rethrows so BullMQ retries, and the `failed` handler marks a job dead-lettered once its attempts are used up. The delay between attempts is fixed here; use `{ type: "exponential", delay }` if the upstream needs room to recover.

```typescript
// src/db.ts
import pg from "pg";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

```typescript
// src/scheduler.ts
import { Queue, Worker, UnrecoverableError, type Job } from "bullmq";
import IORedis from "ioredis";
import { pool } from "./db";
import { definitions, handlers, type JobDefinition } from "./jobs";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: null });
export const queue = new Queue("scheduled-jobs", { connection });
export const deadLetters = new Queue("dead-letters", { connection });
const INSTANCE = `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
const byId = new Map(definitions.map((d) => [d.id, d]));

const jobOpts = (d: JobDefinition) => ({
  attempts: d.retries + 1,
  backoff: { type: "fixed", delay: d.retryDelaySec * 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
});

// Safe to run on every instance at every deploy: the scheduler id is the key,
// so Redis keeps ONE scheduler (and one pending run) per job, however many instances call this.
export async function registerSchedules() {
  for (const d of definitions) {
    if (!d.enabled) { await queue.removeJobScheduler(d.id); continue; }
    await queue.upsertJobScheduler(d.id, { pattern: d.schedule, tz: d.timezone },
      { name: d.id, data: { jobId: d.id }, opts: jobOpts(d) });
  }
}

export async function triggerNow(id: string) {
  const d = byId.get(id);
  if (!d) throw new Error(`unknown job ${id}`);
  return queue.add(d.id, { jobId: d.id, manual: true }, jobOpts(d));
}

export function startWorker() {
  const worker = new Worker("scheduled-jobs", async (job: Job) => {
    const d = byId.get(job.data.jobId);
    const handler = d && handlers[d.id];
    if (!d || !handler) throw new UnrecoverableError(`no definition or handler for ${job.data.jobId}`);

    const attempt = job.attemptsMade + 1;
    const started = Date.now();
    await pool.query(
      `INSERT INTO job_executions (job_id, bull_job_id, attempt, status, executed_by)
       VALUES ($1,$2,$3,'running',$4) ON CONFLICT (bull_job_id, attempt) DO NOTHING`,
      [d.id, job.id, attempt, INSTANCE]);
    try {
      const result = await handler(AbortSignal.timeout(d.timeoutSec * 1000));
      await pool.query(
        `UPDATE job_executions SET status='completed', finished_at=now(), duration_ms=$3, result=$4
         WHERE bull_job_id=$1 AND attempt=$2`,
        [job.id, attempt, Date.now() - started, JSON.stringify(result ?? null)]);
      return result;
    } catch (err) {
      await pool.query(
        `UPDATE job_executions SET status='failed', finished_at=now(), duration_ms=$3, error=$4
         WHERE bull_job_id=$1 AND attempt=$2`,
        [job.id, attempt, Date.now() - started, (err as Error).message]);
      throw err; // BullMQ schedules the retry
    }
  }, { connection, concurrency: 5 });

  // Dead letter: the retries are exhausted (or the job was unrecoverable)
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1) || err.name === "UnrecoverableError";
    if (!exhausted) return;
    await pool.query(
      `UPDATE job_executions SET status='dead-letter' WHERE bull_job_id=$1 AND attempt=$2`,
      [job.id, job.attemptsMade]);
    await deadLetters.add("dead", { jobId: job.data.jobId, error: err.message, at: new Date().toISOString() });
    console.error(`ALERT: ${job.data.jobId} failed after ${job.attemptsMade} attempts: ${err.message}`); // swap for Slack/PagerDuty
  });
  return worker;
}
```

### 4. Management API and entrypoint

The API lists jobs with their last run, shows history, triggers a job on demand through the same queue (so the same retry rules apply), and reports jobs whose last success is older than `maxAgeMin`. It binds to 127.0.0.1; put authentication in front of it before exposing it, since `trigger` runs production jobs.

```typescript
// src/api.ts
import { Hono } from "hono";
import { pool } from "./db";
import { definitions } from "./jobs";
import { triggerNow } from "./scheduler";

export const api = new Hono();

api.get("/jobs", async (c) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (job_id) job_id, status, started_at, duration_ms, error
     FROM job_executions ORDER BY job_id, started_at DESC`);
  const last = new Map(rows.map((r) => [r.job_id, r]));
  return c.json(definitions.map((d) => ({ ...d, last: last.get(d.id) ?? null })));
});

api.get("/jobs/:id/history", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const { rows } = await pool.query(
    `SELECT attempt, status, started_at, finished_at, duration_ms, error, executed_by
     FROM job_executions WHERE job_id=$1 ORDER BY started_at DESC LIMIT $2`, [c.req.param("id"), limit]);
  return c.json(rows);
});

api.post("/jobs/:id/trigger", async (c) => {
  const id = c.req.param("id");
  if (!definitions.some((d) => d.id === id)) return c.json({ error: "unknown job" }, 404);
  return c.json({ queued: (await triggerNow(id)).id }); // a Redis outage is a 500, not "unknown job"
});

// Jobs whose last success is older than maxAgeMin: wire this to your alerting
api.get("/stale", async (c) => {
  const stale = [];
  for (const d of definitions.filter((x) => x.enabled && x.maxAgeMin)) {
    const { rows } = await pool.query(
      `SELECT 1 FROM job_executions WHERE job_id=$1 AND status='completed'
       AND finished_at > now() - make_interval(mins => $2)`, [d.id, d.maxAgeMin]);
    if (rows.length === 0) stale.push(d.id);
  }
  return c.json({ stale });
});
```

```typescript
// src/main.ts
import { serve } from "@hono/node-server";
import { api } from "./api";
import { registerSchedules, startWorker } from "./scheduler";

await registerSchedules();
const worker = startWorker();
const server = serve({ fetch: api.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3000) });

process.on("SIGTERM", async () => { await worker.close(); server.close(); process.exit(0); });
```

Run `psql "$DATABASE_URL" -f schema.sql`, then start two copies with `PORT=3001 npx tsx src/main.ts` and `PORT=3002 npx tsx src/main.ts`, both with `DATABASE_URL` and `REDIS_URL` set.

### 5. Prove the guarantee

With every job set to `* * * * *` and two instances running, each minute produced exactly one `job_executions` row per job, and a failing handler produced attempt 1 `failed` on one instance and attempt 2 `dead-letter` on the other. Repeat that check for your own handlers before trusting the fleet:

```console
$ psql "$DATABASE_URL" -c "select job_id, attempt, status, executed_by from job_executions order by id"
     job_id     | attempt |   status    |  executed_by
----------------+---------+-------------+---------------
 inventory-sync |       1 | completed   | local-2542206
 daily-report   |       1 | failed      | local-2542196
 daily-report   |       2 | dead-letter | local-2542206
```

## Real-World Example

Farid moves the 45 jobs into `definitions`, deploys three instances and watches the first Monday. Each job shows one row per tick in `job_executions`. During a rolling deploy the instance running `inventory-sync` is stopped mid-job; BullMQ re-delivers it to another instance after the lock expires, and the idempotent handler finishes it without a duplicate. The `daily-report` job fails when the reporting database is down: it retries three times, lands in the dead-letter queue and raises an alert, and `/stale` lists it until a run succeeds.

Two things Farid adds afterwards: a Slack or PagerDuty call in the `failed` handler where the `console.error` is, and a periodic `GET /stale` check from the monitoring system, because a scheduler that is down entirely cannot alert about itself.

## Related Skills

- [bull-mq](../skills/bull-mq/) — Queues, workers, retries and job schedulers
- [redis](../skills/redis/) — Persistence and eviction settings that keep the queue safe
- [postgresql](../skills/postgresql/) — Execution history and the queries behind the API
- [hono](../skills/hono/) — The management API
- [zod](../skills/zod/) — Validating job definitions
- [typescript](../skills/typescript/) — Types for definitions and handlers
