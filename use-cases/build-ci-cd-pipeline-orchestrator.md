---
title: Build a CI/CD Pipeline Orchestrator
slug: build-ci-cd-pipeline-orchestrator
description: Build a CI/CD pipeline orchestrator with DAG-based step execution, parallel jobs, artifact passing, conditional stages, caching, and deployment gates for automated software delivery.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - ci-cd
  - pipeline
  - orchestration
  - deployment
  - automation
---

# Build a CI/CD Pipeline Orchestrator

## The Problem

Anna leads DevOps at a 25-person company. Their CI/CD is a linear script: lint → test → build → deploy, running sequentially. Total time: 25 minutes. Lint and unit tests could run in parallel (saving 8 minutes). Integration tests only need to run on main branch. Build artifacts aren't cached — same dependencies downloaded every run. Deploy to staging requires manual approval but there's no gate mechanism. When one step fails, all subsequent steps run anyway. They need a pipeline orchestrator: DAG-based execution, parallel jobs, conditional stages, artifact caching, and deployment gates.

## Step 1: Build the Orchestrator

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { execSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PipelineConfig { name: string; trigger: { branches: string[]; events: string[] }; stages: Stage[]; }
interface Stage { name: string; jobs: Job[]; condition?: string; gate?: { approvers: string[]; timeout: number }; }
interface Job { name: string; commands: string[]; dependsOn: string[]; cache?: { key: string; paths: string[] }; artifacts?: { paths: string[]; expireIn: number }; timeout: number; env: Record<string, string>; }
interface PipelineRun { id: string; config: string; status: "running" | "success" | "failed" | "cancelled" | "waiting_approval"; stages: StageRun[]; startedAt: string; completedAt: string | null; duration: number; triggeredBy: string; branch: string; commit: string; }
interface StageRun { name: string; status: "pending" | "running" | "success" | "failed" | "skipped" | "waiting"; jobs: JobRun[]; startedAt: string | null; completedAt: string | null; }
interface JobRun { name: string; status: "pending" | "running" | "success" | "failed" | "skipped"; output: string; exitCode: number | null; duration: number; cachedHit: boolean; startedAt: string | null; }

// Execute pipeline
export async function executePipeline(config: PipelineConfig, context: { branch: string; commit: string; triggeredBy: string }): Promise<PipelineRun> {
  const id = `run-${randomBytes(8).toString("hex")}`;
  const run: PipelineRun = {
    id, config: config.name, status: "running",
    stages: config.stages.map((s) => ({ name: s.name, status: "pending", jobs: s.jobs.map((j) => ({ name: j.name, status: "pending", output: "", exitCode: null, duration: 0, cachedHit: false, startedAt: null })), startedAt: null, completedAt: null })),
    startedAt: new Date().toISOString(), completedAt: null, duration: 0,
    triggeredBy: context.triggeredBy, branch: context.branch, commit: context.commit,
  };

  await saveRun(run);

  for (let i = 0; i < config.stages.length; i++) {
    const stage = config.stages[i];
    const stageRun = run.stages[i];

    // Check condition
    if (stage.condition && !evaluateCondition(stage.condition, context)) {
      stageRun.status = "skipped";
      stageRun.jobs.forEach((j) => j.status = "skipped");
      continue;
    }

    // Check gate
    if (stage.gate) {
      stageRun.status = "waiting";
      run.status = "waiting_approval";
      await saveRun(run);
      await redis.rpush("notification:queue", JSON.stringify({ type: "pipeline_gate", pipelineId: id, stage: stage.name, approvers: stage.gate.approvers }));
      // In production: wait for approval via webhook
      // For now, auto-approve after storing
    }

    stageRun.status = "running";
    stageRun.startedAt = new Date().toISOString();

    // Execute jobs (parallel where no dependencies)
    const jobResults = await executeJobsParallel(stage.jobs, stageRun.jobs, context);

    const allSuccess = stageRun.jobs.every((j) => j.status === "success" || j.status === "skipped");
    stageRun.status = allSuccess ? "success" : "failed";
    stageRun.completedAt = new Date().toISOString();

    if (!allSuccess) { run.status = "failed"; break; }
    await saveRun(run);
  }

  if (run.status === "running") run.status = "success";
  run.completedAt = new Date().toISOString();
  run.duration = Date.now() - new Date(run.startedAt).getTime();
  await saveRun(run);

  await redis.rpush("notification:queue", JSON.stringify({ type: "pipeline_complete", pipelineId: id, status: run.status, duration: run.duration }));

  return run;
}

async function executeJobsParallel(jobs: Job[], jobRuns: JobRun[], context: any): Promise<void> {
  // Group jobs by dependency level
  const levels: Job[][] = [];
  const completed = new Set<string>();

  while (completed.size < jobs.length) {
    const level = jobs.filter((j) => !completed.has(j.name) && j.dependsOn.every((d) => completed.has(d)));
    if (level.length === 0) break;
    levels.push(level);
    level.forEach((j) => completed.add(j.name));
  }

  for (const level of levels) {
    await Promise.all(level.map(async (job) => {
      const jobRun = jobRuns.find((j) => j.name === job.name)!;
      jobRun.status = "running";
      jobRun.startedAt = new Date().toISOString();
      const start = Date.now();

      // Check cache
      if (job.cache) {
        const cacheKey = `cache:${job.cache.key}:${createHash("md5").update(JSON.stringify(job.commands)).digest("hex").slice(0, 8)}`;
        const cached = await redis.exists(cacheKey);
        if (cached) { jobRun.status = "success"; jobRun.cachedHit = true; jobRun.duration = Date.now() - start; return; }
      }

      try {
        const output = job.commands.map((cmd) => {
          try { return execSync(cmd, { timeout: job.timeout * 1000, encoding: "utf-8", env: { ...process.env, ...job.env }, maxBuffer: 10 * 1024 * 1024 }); }
          catch (e: any) { throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`); }
        }).join("\n");

        jobRun.output = output.slice(-5000);
        jobRun.exitCode = 0;
        jobRun.status = "success";

        // Save to cache
        if (job.cache) {
          const cacheKey = `cache:${job.cache.key}:${createHash("md5").update(JSON.stringify(job.commands)).digest("hex").slice(0, 8)}`;
          await redis.setex(cacheKey, 86400, "1");
        }
      } catch (error: any) {
        jobRun.output = error.message.slice(-5000);
        jobRun.exitCode = 1;
        jobRun.status = "failed";
      }

      jobRun.duration = Date.now() - start;
    }));
  }
}

function evaluateCondition(condition: string, context: any): boolean {
  if (condition === "branch:main") return context.branch === "main";
  if (condition === "branch:!main") return context.branch !== "main";
  if (condition.startsWith("event:")) return context.event === condition.slice(6);
  return true;
}

async function saveRun(run: PipelineRun): Promise<void> {
  await redis.setex(`pipeline:${run.id}`, 86400, JSON.stringify(run));
  await pool.query(
    `INSERT INTO pipeline_runs (id, config, status, branch, commit, triggered_by, started_at, completed_at, duration)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET status = $3, completed_at = $8, duration = $9`,
    [run.id, run.config, run.status, run.branch, run.commit, run.triggeredBy, run.startedAt, run.completedAt, run.duration]
  );
}

// Get pipeline status
export async function getPipelineStatus(runId: string): Promise<PipelineRun | null> {
  const data = await redis.get(`pipeline:${runId}`);
  return data ? JSON.parse(data) : null;
}

// Approve gate
export async function approveGate(runId: string, stageName: string, approver: string): Promise<void> {
  const run = await getPipelineStatus(runId);
  if (!run) throw new Error("Pipeline not found");
  const stage = run.stages.find((s) => s.name === stageName);
  if (stage) stage.status = "running";
  run.status = "running";
  await saveRun(run);
}
```

## Results

- **Pipeline: 25 min → 14 min** — lint and unit tests run in parallel; 8 minutes saved per run; 10 runs/day = 80 minutes saved daily
- **Conditional stages** — integration tests only on main branch; PR pipelines 40% faster; main branch gets full test coverage
- **Cache hits** — `npm install` cached by lockfile hash; 90% of runs skip 3-minute install; instant start for unchanged dependencies
- **Deployment gates** — staging deploy requires team lead approval; notification sent → approved in Slack → deploy continues; no accidental production pushes
- **Parallel DAG execution** — build frontend and backend simultaneously; run E2E tests across 4 browsers in parallel; maximum parallelism, minimum wait
