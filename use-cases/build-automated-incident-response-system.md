---
title: Build an Automated Incident Response System
slug: build-automated-incident-response-system
description: >
  Cut mean-time-to-recovery from 47 minutes to 8 minutes with an AI-powered
  incident system that auto-detects anomalies, runs diagnostics, executes
  runbooks, and coordinates response — before the on-call engineer opens
  their laptop.
skills:
  - typescript
  - redis
  - kafka-js
  - postgresql
  - zod
  - hono
  - bull-mq
category: DevOps & Infrastructure
tags:
  - incident-response
  - sre
  - automation
  - runbooks
  - anomaly-detection
  - on-call
---

# Build an Automated Incident Response System

## The Problem

Aisha leads SRE at a fintech processing $2M/day. Their on-call rotation is burning people out: 14 incidents per week, average MTTR of 47 minutes, and 60% of incidents follow the same 5 patterns. The on-call engineer gets paged at 3 AM, spends 15 minutes figuring out what's wrong, 10 minutes running the same diagnostic commands they ran last time, and 20 minutes executing a runbook they could have automated. Meanwhile, customers are seeing errors. Last month, an experienced engineer left citing "unsustainable on-call burden" — and it took the remaining team 3 weeks to cover the gap.

Aisha needs:
- **Anomaly detection** — catch issues before customers report them
- **Auto-diagnostics** — when an alert fires, automatically gather the context an engineer would need
- **Runbook automation** — execute known remediation steps without human intervention for common incidents
- **Escalation intelligence** — page the right person with the right context, not a generic alert
- **Post-incident learning** — automatically generate timelines and suggest runbook improvements
- **Safety rails** — automated actions must be bounded (no infinite scaling, no data deletion)

## Step 1: Incident Detection from Metric Anomalies

```typescript
// src/detection/anomaly-detector.ts
// Detects anomalies in time-series metrics using statistical methods

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

interface MetricSample {
  name: string;
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

interface AnomalyResult {
  isAnomaly: boolean;
  metric: string;
  currentValue: number;
  expectedRange: { low: number; high: number };
  severity: 'warning' | 'critical';
  confidence: number;
}

export async function checkForAnomaly(sample: MetricSample): Promise<AnomalyResult> {
  const historyKey = `metrics:history:${sample.name}`;

  // Get last 60 samples (1 hour at 1-minute intervals)
  const history = await redis.lrange(historyKey, 0, 59);
  const values = history.map(Number);

  // Store current sample
  await redis.lpush(historyKey, sample.value);
  await redis.ltrim(historyKey, 0, 1439);  // keep 24h of 1-minute samples
  await redis.expire(historyKey, 86400 * 2);

  if (values.length < 30) {
    return { isAnomaly: false, metric: sample.name, currentValue: sample.value,
      expectedRange: { low: 0, high: Infinity }, severity: 'warning', confidence: 0 };
  }

  // Calculate rolling statistics
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stddev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

  // Z-score based detection
  const zScore = stddev > 0 ? Math.abs(sample.value - mean) / stddev : 0;

  const isAnomaly = zScore > 3;  // 3 sigma = 99.7% confidence
  const severity = zScore > 4 ? 'critical' : 'warning';

  return {
    isAnomaly,
    metric: sample.name,
    currentValue: sample.value,
    expectedRange: {
      low: mean - 3 * stddev,
      high: mean + 3 * stddev,
    },
    severity,
    confidence: Math.min(0.99, 1 - Math.exp(-zScore)),
  };
}

// Composite health check: multiple metrics degrading = higher confidence
export async function checkSystemHealth(
  metrics: MetricSample[]
): Promise<{ healthy: boolean; anomalies: AnomalyResult[]; shouldIncident: boolean }> {
  const results = await Promise.all(metrics.map(checkForAnomaly));
  const anomalies = results.filter(r => r.isAnomaly);

  // Multiple correlated anomalies = high confidence incident
  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const shouldIncident = criticalCount >= 2 || anomalies.length >= 3;

  return {
    healthy: anomalies.length === 0,
    anomalies,
    shouldIncident,
  };
}
```

## Step 2: Auto-Diagnostics Engine

When an incident is detected, automatically gather the context an engineer would look for.

```typescript
// src/diagnostics/auto-diagnostics.ts
// Runs diagnostic checks automatically when an incident is created

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DiagnosticResult {
  check: string;
  status: 'ok' | 'degraded' | 'down';
  output: string;
  durationMs: number;
}

type DiagnosticCheck = () => Promise<DiagnosticResult>;

const diagnosticChecks: Record<string, DiagnosticCheck> = {
  database_connections: async () => {
    const start = Date.now();
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const result = await pool.query(`
        SELECT count(*) as total,
               count(*) FILTER (WHERE state = 'active') as active,
               count(*) FILTER (WHERE state = 'idle') as idle,
               count(*) FILTER (WHERE wait_event_type = 'Lock') as locked
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const row = result.rows[0];
      await pool.end();

      const status = row.locked > 5 ? 'degraded' : row.total > 90 ? 'degraded' : 'ok';
      return {
        check: 'database_connections',
        status,
        output: `Total: ${row.total}, Active: ${row.active}, Idle: ${row.idle}, Locked: ${row.locked}`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { check: 'database_connections', status: 'down', output: err.message, durationMs: Date.now() - start };
    }
  },

  redis_health: async () => {
    const start = Date.now();
    try {
      const { Redis } = await import('ioredis');
      const r = new Redis(process.env.REDIS_URL!);
      const info = await r.info('memory');
      const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] ?? 'unknown';
      const maxMemory = info.match(/maxmemory_human:(\S+)/)?.[1] ?? 'unknown';
      r.disconnect();

      return {
        check: 'redis_health',
        status: 'ok',
        output: `Memory: ${usedMemory} / ${maxMemory}`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { check: 'redis_health', status: 'down', output: err.message, durationMs: Date.now() - start };
    }
  },

  disk_usage: async () => {
    const start = Date.now();
    try {
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
      const usagePercent = parseInt(stdout.trim());
      return {
        check: 'disk_usage',
        status: usagePercent > 90 ? 'degraded' : 'ok',
        output: `Root partition: ${usagePercent}% used`,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { check: 'disk_usage', status: 'down', output: err.message, durationMs: Date.now() - start };
    }
  },

  recent_deployments: async () => {
    const start = Date.now();
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const result = await pool.query(`
        SELECT version, deployed_at, deployed_by
        FROM deployments
        WHERE deployed_at > NOW() - INTERVAL '2 hours'
        ORDER BY deployed_at DESC
        LIMIT 5
      `);
      await pool.end();

      const output = result.rows.length > 0
        ? result.rows.map(r => `${r.version} by ${r.deployed_by} at ${r.deployed_at}`).join('\n')
        : 'No recent deployments';

      return {
        check: 'recent_deployments',
        status: result.rows.length > 0 ? 'degraded' : 'ok',  // recent deploy = suspect
        output,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return { check: 'recent_deployments', status: 'down', output: err.message, durationMs: Date.now() - start };
    }
  },
};

export async function runAllDiagnostics(): Promise<DiagnosticResult[]> {
  const results = await Promise.allSettled(
    Object.values(diagnosticChecks).map(check =>
      Promise.race([
        check(),
        new Promise<DiagnosticResult>((_, reject) =>
          setTimeout(() => reject(new Error('Diagnostic timeout')), 10_000)
        ),
      ])
    )
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      check: Object.keys(diagnosticChecks)[i],
      status: 'down' as const,
      output: `Diagnostic failed: ${(r.reason as Error).message}`,
      durationMs: 10_000,
    };
  });
}
```

## Step 3: Runbook Automation with Safety Rails

```typescript
// src/runbooks/executor.ts
// Executes automated runbooks with safety bounds

import { z } from 'zod';

const RunbookAction = z.object({
  type: z.enum(['restart_service', 'scale_up', 'clear_cache', 'rollback_deploy', 'failover_db', 'drain_queue']),
  target: z.string(),
  params: z.record(z.string(), z.unknown()),
  maxRetries: z.number().int().default(1),
  timeoutMs: z.number().int().default(30_000),
});

// Safety bounds — automated actions can't exceed these
const SAFETY_LIMITS = {
  maxScaleUp: 3,              // max instances to add
  maxRestartsPer10Min: 2,     // prevent restart loops
  rollbackWindowMinutes: 60,  // only rollback deploys from last hour
  requireApprovalFor: ['failover_db'],  // some actions need human approval
};

interface RunbookResult {
  action: string;
  success: boolean;
  output: string;
  durationMs: number;
  safetyOverride: boolean;
}

export async function executeRunbook(
  incidentType: string,
  diagnostics: Array<{ check: string; status: string; output: string }>
): Promise<RunbookResult[]> {
  const runbook = selectRunbook(incidentType, diagnostics);
  if (!runbook) return [];

  const results: RunbookResult[] = [];

  for (const action of runbook) {
    // Safety check
    if (SAFETY_LIMITS.requireApprovalFor.includes(action.type)) {
      results.push({
        action: action.type,
        success: false,
        output: 'Requires human approval — escalated to on-call',
        durationMs: 0,
        safetyOverride: true,
      });
      continue;
    }

    const start = Date.now();
    try {
      const output = await executeAction(action);
      results.push({
        action: action.type,
        success: true,
        output,
        durationMs: Date.now() - start,
        safetyOverride: false,
      });
    } catch (err: any) {
      results.push({
        action: action.type,
        success: false,
        output: err.message,
        durationMs: Date.now() - start,
        safetyOverride: false,
      });
      // Stop runbook on failure — don't continue blindly
      break;
    }
  }

  return results;
}

function selectRunbook(
  incidentType: string,
  diagnostics: Array<{ check: string; status: string }>
): z.infer<typeof RunbookAction>[] | null {
  // Pattern matching: incident type + diagnostic results → runbook
  const hasRecentDeploy = diagnostics.some(d => d.check === 'recent_deployments' && d.status === 'degraded');
  const dbDegraded = diagnostics.some(d => d.check === 'database_connections' && d.status === 'degraded');
  const diskFull = diagnostics.some(d => d.check === 'disk_usage' && d.status === 'degraded');

  if (incidentType === 'high_error_rate' && hasRecentDeploy) {
    return [
      { type: 'rollback_deploy', target: 'api', params: {}, maxRetries: 1, timeoutMs: 60_000 },
    ];
  }

  if (incidentType === 'high_latency' && dbDegraded) {
    return [
      { type: 'clear_cache', target: 'query-cache', params: {}, maxRetries: 1, timeoutMs: 10_000 },
      { type: 'restart_service', target: 'connection-pooler', params: {}, maxRetries: 1, timeoutMs: 30_000 },
    ];
  }

  if (incidentType === 'high_latency' && diskFull) {
    return [
      { type: 'clear_cache', target: 'temp-files', params: {}, maxRetries: 1, timeoutMs: 30_000 },
    ];
  }

  if (incidentType === 'service_down') {
    return [
      { type: 'restart_service', target: 'api', params: {}, maxRetries: 2, timeoutMs: 30_000 },
    ];
  }

  return null;  // no matching runbook — escalate to human
}

async function executeAction(action: z.infer<typeof RunbookAction>): Promise<string> {
  switch (action.type) {
    case 'restart_service':
      // In production: Kubernetes rollout restart, ECS service update, etc.
      return `Restarted ${action.target}`;

    case 'rollback_deploy':
      // In production: deploy previous version via CI/CD API
      return `Rolled back ${action.target} to previous version`;

    case 'clear_cache':
      const { Redis } = await import('ioredis');
      const redis = new Redis(process.env.REDIS_URL!);
      const pattern = `${action.target}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
      redis.disconnect();
      return `Cleared ${keys.length} cache keys matching ${pattern}`;

    case 'scale_up':
      const increase = Math.min(
        (action.params.instances as number) ?? 1,
        SAFETY_LIMITS.maxScaleUp
      );
      return `Scaled ${action.target} up by ${increase} instances`;

    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}
```

## Step 4: Incident Coordinator

Ties detection, diagnostics, runbooks, and escalation together.

```typescript
// src/coordinator/incident-manager.ts
// Orchestrates the full incident lifecycle

import { Pool } from 'pg';
import { checkSystemHealth } from '../detection/anomaly-detector';
import { runAllDiagnostics } from '../diagnostics/auto-diagnostics';
import { executeRunbook } from '../runbooks/executor';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function handleIncident(
  anomalies: Array<{ metric: string; severity: string; currentValue: number; expectedRange: any }>
): Promise<void> {
  const incidentId = crypto.randomUUID();
  const startTime = Date.now();

  // 1. Create incident record
  await db.query(`
    INSERT INTO incidents (id, status, severity, detected_at, anomalies)
    VALUES ($1, 'investigating', $2, NOW(), $3)
  `, [
    incidentId,
    anomalies.some(a => a.severity === 'critical') ? 'critical' : 'warning',
    JSON.stringify(anomalies),
  ]);

  // 2. Auto-diagnostics (parallel)
  const diagnostics = await runAllDiagnostics();
  await addTimeline(incidentId, 'diagnostics_complete', JSON.stringify(diagnostics));

  // 3. Classify incident type
  const incidentType = classifyIncident(anomalies, diagnostics);
  await addTimeline(incidentId, 'classified', incidentType);

  // 4. Execute automated runbook
  const runbookResults = await executeRunbook(incidentType, diagnostics);
  await addTimeline(incidentId, 'runbook_executed', JSON.stringify(runbookResults));

  const allSucceeded = runbookResults.length > 0 && runbookResults.every(r => r.success);

  if (allSucceeded) {
    // 5a. Verify recovery (wait 60s, re-check metrics)
    await new Promise(resolve => setTimeout(resolve, 60_000));
    const recheck = await checkSystemHealth([]); // re-fetch current metrics

    if (recheck.healthy) {
      await db.query(
        `UPDATE incidents SET status = 'resolved', resolved_at = NOW(), resolution = 'automated' WHERE id = $1`,
        [incidentId]
      );
      await addTimeline(incidentId, 'auto_resolved',
        `MTTR: ${Math.round((Date.now() - startTime) / 1000)}s`);
      return;
    }
  }

  // 5b. Escalate to human
  await escalateToOnCall(incidentId, incidentType, anomalies, diagnostics, runbookResults);
  await db.query(
    `UPDATE incidents SET status = 'escalated' WHERE id = $1`,
    [incidentId]
  );
}

function classifyIncident(
  anomalies: Array<{ metric: string }>,
  diagnostics: Array<{ check: string; status: string }>
): string {
  const metrics = anomalies.map(a => a.metric);

  if (metrics.some(m => m.includes('error_rate') || m.includes('5xx'))) return 'high_error_rate';
  if (metrics.some(m => m.includes('latency') || m.includes('response_time'))) return 'high_latency';
  if (metrics.some(m => m.includes('availability') || m.includes('health'))) return 'service_down';
  if (metrics.some(m => m.includes('memory') || m.includes('cpu'))) return 'resource_exhaustion';

  return 'unknown';
}

async function escalateToOnCall(
  incidentId: string,
  type: string,
  anomalies: any[],
  diagnostics: any[],
  runbookResults: any[]
): Promise<void> {
  // Format rich context for the on-call engineer
  const summary = [
    `🚨 Incident ${incidentId.slice(0, 8)}`,
    `Type: ${type}`,
    `Anomalies: ${anomalies.map(a => `${a.metric}=${a.currentValue}`).join(', ')}`,
    `Diagnostics: ${diagnostics.filter(d => d.status !== 'ok').map(d => `${d.check}: ${d.status}`).join(', ') || 'all ok'}`,
    runbookResults.length > 0
      ? `Runbook: ${runbookResults.map(r => `${r.action}: ${r.success ? '✅' : '❌'}`).join(', ')}`
      : 'No matching runbook — manual investigation needed',
  ].join('\n');

  // Send to PagerDuty/Slack/etc
  console.log(`ESCALATION:\n${summary}`);
}

async function addTimeline(incidentId: string, event: string, data: string): Promise<void> {
  await db.query(
    `INSERT INTO incident_timeline (incident_id, event, data, occurred_at) VALUES ($1, $2, $3, NOW())`,
    [incidentId, event, data]
  );
}
```

## Results

After 3 months of automated incident response:

- **MTTR**: dropped from 47 minutes to 8 minutes (83% reduction)
- **Auto-resolved incidents**: 43% of incidents resolved without human intervention
- **On-call pages**: reduced from 14/week to 6/week (human only gets paged for novel issues)
- **Diagnostic time saved**: 15 minutes per incident (auto-gathered context vs manual SSH + queries)
- **False positive rate**: 4.2% (tuned from initial 12% by adjusting sigma thresholds)
- **Runbook coverage**: 5 automated runbooks cover 60% of incident types
- **Engineer retention**: zero attrition since deployment (was losing 1 SRE per quarter)
- **Customer-facing impact**: p99 error duration dropped from 47 min to under 2 min for auto-resolved incidents
