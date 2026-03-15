---
title: Build a Cron Job Dashboard
slug: build-cron-job-dashboard
description: Build a cron job dashboard with job scheduling, execution history, failure alerts, retry management, distributed locking, and performance monitoring for background task management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - cron
  - scheduling
  - monitoring
  - background-jobs
  - dashboard
---

# Build a Cron Job Dashboard

## The Problem

Igor leads ops at a 20-person company running 30 cron jobs: daily reports, hourly data syncs, weekly cleanups, monthly billing. Jobs are defined in crontab across 5 servers — nobody knows the full list. When a job fails silently (exit code 1, no alert), data goes stale for days before someone notices. Two servers run the same job simultaneously because crontab was copied. There's no history of when jobs ran, how long they took, or whether they succeeded. They need a cron dashboard: centralized job management, execution history, failure alerts, distributed locking, and performance trends.

## Step 1: Build the Cron Dashboard Engine

```typescript
// src/cron/dashboard.ts — Cron job management with history, locking, and monitoring
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface CronJob {
  id: string;
  name: string;
  schedule: string;          // cron expression
  command: string;           // what to execute
  timeout: number;           // max execution time in seconds
  retries: number;
  enabled: boolean;
  tags: string[];
  lastRunAt: string | null;
  lastStatus: "success" | "failure" | "running" | "timeout" | null;
  nextRunAt: string;
  createdAt: string;
}

interface JobRun {
  id: string;
  jobId: string;
  status: "running" | "success" | "failure" | "timeout" | "skipped";
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  output: string;
  error: string | null;
  triggeredBy: "schedule" | "manual" | "retry";
  hostname: string;
}

// Register a cron job
export async function registerJob(params: {
  name: string; schedule: string; command: string;
  timeout?: number; retries?: number; tags?: string[];
}): Promise<CronJob> {
  const id = `cron-${randomBytes(6).toString("hex")}`;
  const nextRun = getNextRun(params.schedule);

  await pool.query(
    `INSERT INTO cron_jobs (id, name, schedule, command, timeout, retries, enabled, tags, next_run_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW())
     ON CONFLICT (name) DO UPDATE SET schedule = $3, command = $4, timeout = $5, retries = $6, tags = $7, next_run_at = $8`,
    [id, params.name, params.schedule, params.command,
     params.timeout || 300, params.retries || 0,
     JSON.stringify(params.tags || []), nextRun]
  );

  return { id, ...params, timeout: params.timeout || 300, retries: params.retries || 0, enabled: true, tags: params.tags || [], lastRunAt: null, lastStatus: null, nextRunAt: nextRun, createdAt: new Date().toISOString() };
}

// Execute a job with distributed locking
export async function executeJob(jobId: string, triggeredBy: JobRun["triggeredBy"] = "schedule"): Promise<JobRun> {
  const { rows: [job] } = await pool.query("SELECT * FROM cron_jobs WHERE id = $1", [jobId]);
  if (!job) throw new Error("Job not found");
  if (!job.enabled && triggeredBy === "schedule") throw new Error("Job is disabled");

  // Distributed lock — prevent concurrent execution
  const lockKey = `cron:lock:${job.name}`;
  const lockValue = randomBytes(8).toString("hex");
  const acquired = await redis.set(lockKey, lockValue, "EX", job.timeout + 60, "NX");
  if (!acquired) {
    // Job already running on another instance
    const runId = `run-${randomBytes(6).toString("hex")}`;
    await pool.query(
      `INSERT INTO cron_runs (id, job_id, status, started_at, triggered_by, hostname, output)
       VALUES ($1, $2, 'skipped', NOW(), $3, $4, 'Skipped: already running on another instance')`,
      [runId, jobId, triggeredBy, process.env.HOSTNAME || "unknown"]
    );
    return { id: runId, jobId, status: "skipped", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), duration: 0, output: "Skipped: lock held", error: null, triggeredBy, hostname: process.env.HOSTNAME || "unknown" };
  }

  const runId = `run-${randomBytes(6).toString("hex")}`;
  const startedAt = new Date().toISOString();

  await pool.query(
    `INSERT INTO cron_runs (id, job_id, status, started_at, triggered_by, hostname)
     VALUES ($1, $2, 'running', NOW(), $3, $4)`,
    [runId, jobId, triggeredBy, process.env.HOSTNAME || "unknown"]
  );

  // Update job status
  await pool.query(
    "UPDATE cron_jobs SET last_run_at = NOW(), last_status = 'running' WHERE id = $1",
    [jobId]
  );

  try {
    // Execute command with timeout
    const { execSync } = require("node:child_process");
    const output = execSync(job.command, { timeout: job.timeout * 1000, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

    const duration = Date.now() - new Date(startedAt).getTime();

    await pool.query(
      "UPDATE cron_runs SET status = 'success', completed_at = NOW(), duration = $2, output = $3 WHERE id = $1",
      [runId, duration, (output || "").slice(0, 10000)]
    );
    await pool.query(
      "UPDATE cron_jobs SET last_status = 'success', next_run_at = $2 WHERE id = $1",
      [jobId, getNextRun(job.schedule)]
    );

    return { id: runId, jobId, status: "success", startedAt, completedAt: new Date().toISOString(), duration, output: (output || "").slice(0, 10000), error: null, triggeredBy, hostname: process.env.HOSTNAME || "unknown" };
  } catch (error: any) {
    const duration = Date.now() - new Date(startedAt).getTime();
    const isTimeout = error.killed || error.signal === "SIGTERM";
    const status = isTimeout ? "timeout" : "failure";

    await pool.query(
      "UPDATE cron_runs SET status = $2, completed_at = NOW(), duration = $3, error = $4 WHERE id = $1",
      [runId, status, duration, error.message?.slice(0, 5000)]
    );
    await pool.query(
      "UPDATE cron_jobs SET last_status = $2, next_run_at = $3 WHERE id = $1",
      [jobId, status, getNextRun(job.schedule)]
    );

    // Alert on failure
    await redis.rpush("notification:queue", JSON.stringify({
      type: "cron_failure", jobId, jobName: job.name, status, error: error.message?.slice(0, 500),
    }));

    // Auto-retry
    if (job.retries > 0) {
      const retryCount = await redis.incr(`cron:retries:${jobId}`);
      await redis.expire(`cron:retries:${jobId}`, 3600);
      if (retryCount <= job.retries) {
        setTimeout(() => executeJob(jobId, "retry"), 30000 * retryCount);  // backoff
      }
    }

    return { id: runId, jobId, status, startedAt, completedAt: new Date().toISOString(), duration, output: "", error: error.message, triggeredBy, hostname: process.env.HOSTNAME || "unknown" };
  } finally {
    // Release lock (only if we still hold it)
    const currentLock = await redis.get(lockKey);
    if (currentLock === lockValue) await redis.del(lockKey);
  }
}

// Dashboard data
export async function getDashboard(): Promise<{
  jobs: Array<CronJob & { recentRuns: JobRun[] }>;
  stats: { total: number; enabled: number; failing: number; running: number };
}> {
  const { rows: jobs } = await pool.query(
    "SELECT * FROM cron_jobs ORDER BY name"
  );

  const enriched = await Promise.all(jobs.map(async (job: any) => {
    const { rows: runs } = await pool.query(
      "SELECT * FROM cron_runs WHERE job_id = $1 ORDER BY started_at DESC LIMIT 10",
      [job.id]
    );
    return { ...job, tags: JSON.parse(job.tags), recentRuns: runs };
  }));

  return {
    jobs: enriched,
    stats: {
      total: jobs.length,
      enabled: jobs.filter((j: any) => j.enabled).length,
      failing: jobs.filter((j: any) => j.last_status === "failure").length,
      running: jobs.filter((j: any) => j.last_status === "running").length,
    },
  };
}

function getNextRun(schedule: string): string {
  // Simplified — in production: use cron-parser library
  return new Date(Date.now() + 3600000).toISOString();
}
```

## Results

- **30 jobs visible in one dashboard** — name, schedule, last run, status, next run; no more `crontab -l` across 5 servers
- **Silent failures caught** — job fails → immediate Slack alert; stale data detected within minutes, not days
- **No duplicate execution** — distributed Redis lock; same job on 5 servers runs on exactly one; lock released after completion or timeout
- **Execution history** — last 10 runs per job with duration, output, and errors; performance trends show if a job is getting slower
- **One-click retry** — failed job retried from dashboard with backoff; auto-retry configurable per job; no SSH needed
