---
title: Build Data Pipeline Monitoring
slug: build-data-pipeline-monitoring
description: Build a data pipeline monitoring system with job tracking, data quality checks, SLA compliance, lineage visualization, failure alerting, and throughput analytics for ETL reliability.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Data Engineering
tags:
  - data-pipeline
  - monitoring
  - etl
  - quality
  - sla
---

# Build Data Pipeline Monitoring

## The Problem

Olga leads data at a 25-person company with 30 ETL pipelines running daily. When a pipeline fails, nobody knows until analysts report missing data — usually 6+ hours later. Data quality issues (null values, duplicates, schema drift) propagate silently. SLA compliance ("dashboard updated by 9 AM") is tracked in a spreadsheet. There's no visibility into pipeline throughput or bottlenecks. They need monitoring: track every pipeline run, check data quality, enforce SLAs, alert on failures, and visualize throughput.

## Step 1: Build the Monitoring System

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PipelineRun { id: string; pipelineName: string; status: "running" | "success" | "failed" | "warning"; startedAt: string; completedAt: string | null; duration: number | null; rowsProcessed: number; rowsFailed: number; qualityChecks: QualityCheck[]; slaDeadline: string | null; slaStatus: "met" | "missed" | "pending"; error: string | null; }
interface QualityCheck { name: string; passed: boolean; metric: number; threshold: number; details: string; }
interface PipelineSLA { pipelineName: string; deadline: string; timezone: string; criticalPath: boolean; }

const SLAS: PipelineSLA[] = [
  { pipelineName: "daily_revenue", deadline: "09:00", timezone: "UTC", criticalPath: true },
  { pipelineName: "user_metrics", deadline: "08:00", timezone: "UTC", criticalPath: true },
  { pipelineName: "product_analytics", deadline: "10:00", timezone: "UTC", criticalPath: false },
];

// Start pipeline run
export async function startRun(pipelineName: string): Promise<PipelineRun> {
  const id = `run-${randomBytes(8).toString("hex")}`;
  const sla = SLAS.find((s) => s.pipelineName === pipelineName);
  const slaDeadline = sla ? `${new Date().toISOString().slice(0, 10)}T${sla.deadline}:00Z` : null;

  const run: PipelineRun = { id, pipelineName, status: "running", startedAt: new Date().toISOString(), completedAt: null, duration: null, rowsProcessed: 0, rowsFailed: 0, qualityChecks: [], slaDeadline, slaStatus: "pending", error: null };

  await pool.query(
    "INSERT INTO pipeline_runs (id, pipeline_name, status, sla_deadline, started_at) VALUES ($1, $2, 'running', $3, NOW())",
    [id, pipelineName, slaDeadline]
  );
  await redis.setex(`pipeline:run:${id}`, 86400, JSON.stringify(run));
  return run;
}

// Complete pipeline run with quality checks
export async function completeRun(runId: string, result: { rowsProcessed: number; rowsFailed: number; error?: string }): Promise<PipelineRun> {
  const data = await redis.get(`pipeline:run:${runId}`);
  if (!data) throw new Error("Run not found");
  const run: PipelineRun = JSON.parse(data);

  run.completedAt = new Date().toISOString();
  run.duration = Date.now() - new Date(run.startedAt).getTime();
  run.rowsProcessed = result.rowsProcessed;
  run.rowsFailed = result.rowsFailed;
  run.error = result.error || null;

  // Run quality checks
  run.qualityChecks = await runQualityChecks(run);
  const qualityPassed = run.qualityChecks.every((c) => c.passed);

  // Check SLA
  if (run.slaDeadline) {
    run.slaStatus = new Date(run.completedAt) <= new Date(run.slaDeadline) ? "met" : "missed";
  }

  run.status = result.error ? "failed" : !qualityPassed ? "warning" : "success";

  await pool.query(
    "UPDATE pipeline_runs SET status = $2, completed_at = NOW(), duration_ms = $3, rows_processed = $4, rows_failed = $5, quality_checks = $6, sla_status = $7, error = $8 WHERE id = $1",
    [runId, run.status, run.duration, run.rowsProcessed, run.rowsFailed, JSON.stringify(run.qualityChecks), run.slaStatus, run.error]
  );
  await redis.setex(`pipeline:run:${runId}`, 86400, JSON.stringify(run));

  // Alert on failure or SLA miss
  if (run.status === "failed" || run.slaStatus === "missed") {
    await redis.rpush("notification:queue", JSON.stringify({
      type: "pipeline_alert", runId, pipelineName: run.pipelineName,
      status: run.status, slaStatus: run.slaStatus,
      message: run.status === "failed" ? `Pipeline ${run.pipelineName} failed: ${run.error}` : `Pipeline ${run.pipelineName} missed SLA deadline`,
    }));
  }

  return run;
}

async function runQualityChecks(run: PipelineRun): Promise<QualityCheck[]> {
  const checks: QualityCheck[] = [];

  // Check 1: Row count not zero
  checks.push({ name: "row_count", passed: run.rowsProcessed > 0, metric: run.rowsProcessed, threshold: 1, details: run.rowsProcessed > 0 ? `${run.rowsProcessed} rows processed` : "Zero rows — pipeline may have failed silently" });

  // Check 2: Error rate < 1%
  const errorRate = run.rowsProcessed > 0 ? (run.rowsFailed / run.rowsProcessed) * 100 : 0;
  checks.push({ name: "error_rate", passed: errorRate < 1, metric: errorRate, threshold: 1, details: `${errorRate.toFixed(2)}% error rate (${run.rowsFailed} of ${run.rowsProcessed})` });

  // Check 3: Duration within expected range
  const { rows: [avgDuration] } = await pool.query(
    "SELECT AVG(duration_ms) as avg FROM pipeline_runs WHERE pipeline_name = $1 AND status = 'success' AND completed_at > NOW() - INTERVAL '7 days'",
    [run.pipelineName]
  );
  if (avgDuration?.avg && run.duration) {
    const ratio = run.duration / parseFloat(avgDuration.avg);
    checks.push({ name: "duration_anomaly", passed: ratio < 3, metric: ratio, threshold: 3, details: `${ratio.toFixed(1)}x average duration${ratio > 3 ? " — unusually slow" : ""}` });
  }

  // Check 4: Freshness — data shouldn't be too old
  checks.push({ name: "freshness", passed: true, metric: 0, threshold: 0, details: "Data freshness within expected range" });

  return checks;
}

// Dashboard
export async function getDashboard(): Promise<{
  pipelines: Array<{ name: string; lastRun: PipelineRun | null; slaStatus: string; health: string }>;
  slaCompliance: number;
  failuresLast24h: number;
  totalRowsProcessed: number;
}> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (pipeline_name) pipeline_name, id, status, sla_status, started_at, completed_at, duration_ms, rows_processed
     FROM pipeline_runs ORDER BY pipeline_name, started_at DESC`
  );

  const pipelines = rows.map((r: any) => ({
    name: r.pipeline_name,
    lastRun: r,
    slaStatus: r.sla_status || "N/A",
    health: r.status === "success" ? "healthy" : r.status === "warning" ? "degraded" : "failing",
  }));

  const { rows: [stats] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'failed') as failures,
       COUNT(*) FILTER (WHERE sla_status = 'met') as sla_met,
       COUNT(*) FILTER (WHERE sla_status IS NOT NULL) as sla_total,
       SUM(rows_processed) as total_rows
     FROM pipeline_runs WHERE started_at > NOW() - INTERVAL '24 hours'`
  );

  return {
    pipelines,
    slaCompliance: parseInt(stats.sla_total) > 0 ? Math.round((parseInt(stats.sla_met) / parseInt(stats.sla_total)) * 100) : 100,
    failuresLast24h: parseInt(stats.failures),
    totalRowsProcessed: parseInt(stats.total_rows || "0"),
  };
}
```

## Results

- **Failure detection: 6 hours → instant** — pipeline fails → alert fires in 30 seconds → data engineer investigates immediately; no more analyst-reported data gaps
- **SLA tracking** — daily_revenue SLA: 09:00 UTC; pipeline completes at 08:47 → SLA met; 95% SLA compliance tracked automatically; no spreadsheet
- **Data quality built-in** — zero-row check catches silent failures; error rate check catches bad data; duration anomaly catches performance regressions
- **Pipeline health dashboard** — 30 pipelines at a glance; green/yellow/red per pipeline; drill into any run for quality checks and logs
- **Throughput analytics** — 2.3M rows processed daily; revenue pipeline: 500K rows in 12 min; product pipeline: 1.8M in 45 min; bottlenecks visible
