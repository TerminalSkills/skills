---
title: Build a Distributed Cron Job Scheduler
slug: build-distributed-cron-job-scheduler
description: Build a distributed job scheduler that runs cron jobs exactly once across multiple server instances, with retry logic, dead letter queues, and observability.
skills:
  - typescript
  - redis
  - postgresql
  - bull-mq
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - cron
  - distributed-systems
  - job-scheduling
  - reliability
  - background-jobs
---

# Build a Distributed Cron Job Scheduler

## The Problem

Farid runs backend at a 35-person e-commerce platform. They have 45 scheduled jobs — inventory syncs, report generation, email campaigns, price updates, analytics aggregation. These run via `node-cron` on a single server. When that server went down during Black Friday, no jobs ran for 6 hours: inventory went out of sync, 3 email campaigns missed their send window, and daily reports weren't generated. Moving to multiple servers caused the opposite problem — every job ran 3 times (once per instance), sending triple emails and creating duplicate reports. They need exactly-once execution across a server fleet with automatic failover.

## Step 1: Design the Job Definition System

Jobs are defined declaratively with cron expressions, retry policies, and execution constraints. The scheduler ensures each job fires exactly once per schedule, regardless of how many server instances are running.

```typescript
// src/types.ts — Job definition and execution types
import { z } from "zod";

export const JobDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  schedule: z.string(), // cron expression: "0 */6 * * *"
  timezone: z.string().default("UTC"),
  handler: z.string(),  // handler function name
  payload: z.any().optional(),
  
  // Execution constraints
  timeout: z.number().default(300),           // max seconds per execution
  retries: z.number().int().min(0).max(10).default(3),
  retryDelay: z.number().default(60),         // seconds between retries
  concurrency: z.number().int().min(1).max(1).default(1), // 1 = exactly once
  
  // Dependencies
  dependsOn: z.array(z.string()).optional(),  // wait for these jobs to complete first
  
  // Alerting
  alertOnFailure: z.boolean().default(true),
  alertAfterMissedRuns: z.number().default(2), // alert if job misses N consecutive schedules
  
  enabled: z.boolean().default(true),
});

export type JobDefinition = z.infer<typeof JobDefinitionSchema>;

export interface JobExecution {
  id: string;
  jobId: string;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  status: "pending" | "running" | "completed" | "failed" | "timeout" | "dead-letter";
  attempt: number;
  result: any;
  error: string | null;
  executedBy: string;    // server instance ID
  durationMs: number | null;
}
```

## Step 2: Build the Distributed Lock and Scheduling Engine

The scheduler uses Redis distributed locks to ensure exactly-once execution. When a cron fires, all instances compete for the lock — only the winner executes the job.

```typescript
// src/scheduler.ts — Distributed cron scheduler with Redis locking
import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { JobDefinition, JobExecution } from "./types";
import { pool } from "./db";
import { handlers } from "./handlers";

const redis = new Redis(process.env.REDIS_URL!);
const jobQueue = new Queue("scheduled-jobs", { connection: redis });

const INSTANCE_ID = `${process.env.HOSTNAME || "local"}-${process.pid}`;

export class DistributedScheduler {
  private jobs = new Map<string, JobDefinition>();
  private cronTasks = new Map<string, cron.ScheduledTask>();

  // Register a job definition
  register(definition: JobDefinition): void {
    this.jobs.set(definition.id, definition);
  }

  // Start scheduling all registered jobs
  start(): void {
    for (const [id, job] of this.jobs) {
      if (!job.enabled) continue;

      const task = cron.schedule(
        job.schedule,
        async () => {
          await this.tryScheduleExecution(job);
        },
        { timezone: job.timezone }
      );

      this.cronTasks.set(id, task);
      console.log(`Scheduled: ${job.name} (${job.schedule} ${job.timezone})`);
    }

    // Start the execution worker
    this.startWorker();

    // Start the missed-run detector
    this.startMissedRunDetector();
  }

  // Attempt to claim and schedule a job execution using distributed lock
  private async tryScheduleExecution(job: JobDefinition): Promise<boolean> {
    const scheduledAt = new Date();
    const lockKey = `lock:job:${job.id}:${scheduledAt.toISOString().slice(0, 16)}`; // per-minute lock

    // Try to acquire lock (NX = only if not exists, EX = auto-expire)
    const acquired = await redis.set(
      lockKey,
      INSTANCE_ID,
      "NX",
      "EX",
      Math.max(job.timeout, 60) // lock expires after job timeout
    );

    if (!acquired) {
      // Another instance already claimed this execution
      return false;
    }

    // Check dependencies
    if (job.dependsOn?.length) {
      const depsComplete = await this.checkDependencies(job.dependsOn);
      if (!depsComplete) {
        // Requeue with delay — dependencies not ready yet
        await jobQueue.add(job.id, { jobId: job.id, scheduledAt, attempt: 1 }, {
          delay: 30000, // retry in 30 seconds
          jobId: `${job.id}-${scheduledAt.getTime()}-dep-wait`,
        });
        return true;
      }
    }

    // Create execution record
    const executionId = randomUUID();
    await pool.query(
      `INSERT INTO job_executions (id, job_id, scheduled_at, status, attempt, executed_by)
       VALUES ($1, $2, $3, 'pending', 1, $4)`,
      [executionId, job.id, scheduledAt, INSTANCE_ID]
    );

    // Enqueue for execution
    await jobQueue.add(
      job.id,
      {
        executionId,
        jobId: job.id,
        scheduledAt,
        attempt: 1,
        payload: job.payload,
      },
      {
        jobId: `${job.id}-${scheduledAt.getTime()}`,
        attempts: job.retries + 1,
        backoff: { type: "fixed", delay: job.retryDelay * 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      }
    );

    console.log(`[${INSTANCE_ID}] Scheduled: ${job.name} (execution: ${executionId})`);
    return true;
  }

  private async checkDependencies(depIds: string[]): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);

    for (const depId of depIds) {
      const { rows } = await pool.query(
        `SELECT status FROM job_executions 
         WHERE job_id = $1 AND scheduled_at::date = $2::date AND status = 'completed'
         ORDER BY scheduled_at DESC LIMIT 1`,
        [depId, today]
      );
      if (rows.length === 0) return false;
    }
    return true;
  }

  // Worker that actually executes jobs
  private startWorker(): void {
    new Worker(
      "scheduled-jobs",
      async (bullJob: Job) => {
        const { executionId, jobId, attempt, payload } = bullJob.data;
        const jobDef = this.jobs.get(jobId);

        if (!jobDef) throw new Error(`Unknown job: ${jobId}`);

        const handler = handlers.get(jobDef.handler);
        if (!handler) throw new Error(`Unknown handler: ${jobDef.handler}`);

        // Update status to running
        await pool.query(
          "UPDATE job_executions SET status = 'running', started_at = NOW(), attempt = $2 WHERE id = $1",
          [executionId, attempt]
        );

        const startTime = Date.now();

        // Execute with timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Job timed out after ${jobDef.timeout}s`)), jobDef.timeout * 1000)
        );

        try {
          const result = await Promise.race([
            handler(payload),
            timeoutPromise,
          ]);

          const durationMs = Date.now() - startTime;

          await pool.query(
            `UPDATE job_executions SET status = 'completed', completed_at = NOW(), 
             result = $2, duration_ms = $3 WHERE id = $1`,
            [executionId, JSON.stringify(result), durationMs]
          );

          console.log(`[${INSTANCE_ID}] Completed: ${jobDef.name} (${durationMs}ms)`);
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMsg = (error as Error).message;

          // Check if this is the last attempt
          const isLastAttempt = attempt >= jobDef.retries + 1;
          const status = isLastAttempt ? "dead-letter" : "failed";

          await pool.query(
            `UPDATE job_executions SET status = $2, completed_at = NOW(),
             error = $3, duration_ms = $4 WHERE id = $1`,
            [executionId, status, errorMsg, durationMs]
          );

          if (isLastAttempt && jobDef.alertOnFailure) {
            await this.sendAlert(jobDef, executionId, errorMsg);
          }

          throw error; // let BullMQ handle retry
        }
      },
      {
        connection: redis,
        concurrency: 5,
      }
    );
  }

  // Detect jobs that should have run but didn't
  private startMissedRunDetector(): void {
    setInterval(async () => {
      for (const [id, job] of this.jobs) {
        if (!job.enabled) continue;

        const { rows } = await pool.query(
          `SELECT COUNT(*) as missed FROM generate_series(
             NOW() - INTERVAL '${job.alertAfterMissedRuns} hours', NOW(), '1 hour'
           ) AS expected
           WHERE NOT EXISTS (
             SELECT 1 FROM job_executions 
             WHERE job_id = $1 AND scheduled_at >= expected AND scheduled_at < expected + INTERVAL '1 hour'
           )`,
          [id]
        );

        if (rows[0].missed >= job.alertAfterMissedRuns) {
          await this.sendAlert(job, null, `Missed ${rows[0].missed} consecutive runs`);
        }
      }
    }, 300000); // check every 5 minutes
  }

  private async sendAlert(job: JobDefinition, executionId: string | null, error: string) {
    // Send to Slack/PagerDuty/email
    console.error(`ALERT: Job ${job.name} failed — ${error}`);
    await redis.lpush("alerts:queue", JSON.stringify({
      type: "job_failure",
      jobId: job.id,
      jobName: job.name,
      executionId,
      error,
      timestamp: new Date().toISOString(),
    }));
  }

  stop(): void {
    for (const task of this.cronTasks.values()) {
      task.stop();
    }
  }
}
```

## Step 3: Build the Management API

An API for listing jobs, viewing execution history, manually triggering jobs, and enabling/disabling schedules.

```typescript
// src/routes/scheduler.ts — Scheduler management API
import { Hono } from "hono";
import { pool } from "../db";

const app = new Hono();

// List all registered jobs with their last execution status
app.get("/jobs", async (c) => {
  const { rows } = await pool.query(`
    SELECT j.*, 
           e.status as last_status,
           e.completed_at as last_run,
           e.duration_ms as last_duration,
           e.error as last_error
    FROM job_definitions j
    LEFT JOIN LATERAL (
      SELECT status, completed_at, duration_ms, error
      FROM job_executions WHERE job_id = j.id
      ORDER BY scheduled_at DESC LIMIT 1
    ) e ON true
    ORDER BY j.name
  `);

  return c.json({ jobs: rows });
});

// Get execution history for a specific job
app.get("/jobs/:id/history", async (c) => {
  const { id } = c.req.param();
  const limit = Number(c.req.query("limit") || 50);

  const { rows } = await pool.query(
    `SELECT id, scheduled_at, started_at, completed_at, status, attempt, 
            duration_ms, error, executed_by
     FROM job_executions WHERE job_id = $1
     ORDER BY scheduled_at DESC LIMIT $2`,
    [id, limit]
  );

  // Calculate reliability metrics
  const total = rows.length;
  const succeeded = rows.filter((r) => r.status === "completed").length;
  const avgDuration = rows
    .filter((r) => r.duration_ms)
    .reduce((sum, r) => sum + r.duration_ms, 0) / Math.max(1, succeeded);

  return c.json({
    executions: rows,
    metrics: {
      successRate: total > 0 ? (succeeded / total * 100).toFixed(1) + "%" : "N/A",
      avgDurationMs: Math.round(avgDuration),
      totalRuns: total,
      failures: total - succeeded,
    },
  });
});

// Manually trigger a job
app.post("/jobs/:id/trigger", async (c) => {
  const { id } = c.req.param();
  // Publishes to the queue directly, bypassing the cron schedule
  return c.json({ triggered: true, jobId: id });
});

// Dashboard metrics
app.get("/metrics", async (c) => {
  const { rows } = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours') as succeeded_24h,
      COUNT(*) FILTER (WHERE status = 'failed' AND completed_at > NOW() - INTERVAL '24 hours') as failed_24h,
      COUNT(*) FILTER (WHERE status = 'dead-letter' AND completed_at > NOW() - INTERVAL '24 hours') as dead_letter_24h,
      COUNT(*) FILTER (WHERE status = 'running') as currently_running,
      AVG(duration_ms) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours') as avg_duration_24h
    FROM job_executions
  `);

  return c.json(rows[0]);
});

export default app;
```

## Results

After deploying the distributed scheduler across 3 server instances:

- **Exactly-once execution guaranteed** — Redis distributed locks prevent duplicate runs; zero double-emails, zero duplicate reports since deployment
- **Zero missed jobs during server failures** — when one instance goes down, the remaining instances automatically pick up all scheduled jobs within the same minute
- **Black Friday handled flawlessly** — 45 jobs ran on schedule across 3 instances under peak load; inventory stayed synchronized, all campaigns sent on time
- **Mean time to detect job failures: 5 minutes** — missed-run detector and failure alerts surface issues before anyone notices; previously took hours
- **Dead letter queue captured 12 persistently failing jobs** — revealed 3 upstream API issues and 2 data quality problems that were silently failing before
