---
title: Build an Automated Data Quality Monitoring System
slug: build-automated-data-quality-monitoring-system
description: >
  Detect data quality issues before they reach dashboards and ML models —
  catching schema drift, anomalous distributions, freshness failures,
  and referential integrity breaks automatically.
skills:
  - typescript
  - postgresql
  - redis
  - kafka-js
  - zod
  - hono
  - bull-mq
category: Data Engineering
tags:
  - data-quality
  - data-observability
  - monitoring
  - anomaly-detection
  - schema-drift
  - freshness
---

# Build an Automated Data Quality Monitoring System

## The Problem

Jin leads data engineering at a fintech with 200+ tables and 50 downstream dashboards. Last month, a schema change in the payments table silently broke 8 dashboards — nobody noticed for 5 days until the CFO pointed out revenue numbers were wrong in the board deck. The week before, a vendor API started returning null for a required field, corrupting 340K rows before anyone caught it. Jin's team spends 30% of their time firefighting data quality issues instead of building features.

Jin needs:
- **Schema drift detection** — alert when columns are added, removed, or change type
- **Volume anomaly detection** — flag when daily row counts deviate from expected patterns
- **Freshness monitoring** — alert when tables stop updating on schedule
- **Distribution monitoring** — detect when numeric distributions or categorical frequencies shift
- **Null rate tracking** — catch unexpected nulls in required fields
- **Referential integrity checks** — detect orphaned foreign keys

## Step 1: Data Quality Check Definitions

```typescript
// src/checks/definitions.ts
import { z } from 'zod';

export const CheckType = z.enum([
  'schema_drift', 'volume_anomaly', 'freshness',
  'null_rate', 'distribution_shift', 'referential_integrity',
  'custom_sql', 'uniqueness',
]);

export const DataQualityCheck = z.object({
  id: z.string(),
  table: z.string(),
  schema: z.string().default('public'),
  checkType: CheckType,
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  config: z.record(z.string(), z.unknown()),
  schedule: z.enum(['hourly', 'daily', 'on_change']),
  owner: z.string().email(),
  enabled: z.boolean().default(true),
});

export type DataQualityCheck = z.infer<typeof DataQualityCheck>;
```

## Step 2: Check Executors

```typescript
// src/checks/executors.ts
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.WAREHOUSE_URL });

interface CheckResult {
  checkId: string;
  passed: boolean;
  severity: string;
  message: string;
  metadata: Record<string, unknown>;
  checkedAt: string;
}

export async function checkFreshness(
  table: string, timestampColumn: string, maxStaleHours: number
): Promise<CheckResult> {
  const { rows } = await db.query(
    `SELECT EXTRACT(EPOCH FROM NOW() - MAX(${timestampColumn})) / 3600 as hours_stale FROM ${table}`
  );
  const stale = parseFloat(rows[0]?.hours_stale ?? '999');
  return {
    checkId: `freshness:${table}`,
    passed: stale <= maxStaleHours,
    severity: stale > maxStaleHours * 2 ? 'critical' : 'high',
    message: `${table} is ${stale.toFixed(1)}h stale (max: ${maxStaleHours}h)`,
    metadata: { hoursStale: stale, threshold: maxStaleHours },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkNullRate(
  table: string, column: string, maxNullPercent: number
): Promise<CheckResult> {
  const { rows } = await db.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE ${column} IS NULL) as nulls
    FROM ${table}
  `);
  const total = parseInt(rows[0].total);
  const nulls = parseInt(rows[0].nulls);
  const nullPercent = total > 0 ? (nulls / total) * 100 : 0;
  return {
    checkId: `null_rate:${table}.${column}`,
    passed: nullPercent <= maxNullPercent,
    severity: nullPercent > 50 ? 'critical' : 'high',
    message: `${column}: ${nullPercent.toFixed(1)}% null (max: ${maxNullPercent}%)`,
    metadata: { nullPercent, nullCount: nulls, totalRows: total },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkVolumeAnomaly(
  table: string, timestampColumn: string
): Promise<CheckResult> {
  const { rows } = await db.query(`
    WITH daily AS (
      SELECT DATE(${timestampColumn}) as day, COUNT(*) as cnt
      FROM ${table}
      WHERE ${timestampColumn} > NOW() - INTERVAL '30 days'
      GROUP BY DATE(${timestampColumn})
    ),
    stats AS (
      SELECT AVG(cnt) as avg_cnt, STDDEV(cnt) as std_cnt FROM daily
    )
    SELECT d.day, d.cnt, s.avg_cnt, s.std_cnt,
           ABS(d.cnt - s.avg_cnt) / NULLIF(s.std_cnt, 0) as z_score
    FROM daily d, stats s
    WHERE d.day = CURRENT_DATE - 1
  `);

  if (!rows.length) {
    return { checkId: `volume:${table}`, passed: false, severity: 'high',
      message: 'No data for yesterday', metadata: {}, checkedAt: new Date().toISOString() };
  }

  const { cnt, avg_cnt, z_score } = rows[0];
  const isAnomaly = z_score > 3;
  return {
    checkId: `volume:${table}`,
    passed: !isAnomaly,
    severity: z_score > 4 ? 'critical' : 'high',
    message: `Yesterday: ${cnt} rows (avg: ${Math.round(avg_cnt)}, z-score: ${z_score?.toFixed(1) ?? 'N/A'})`,
    metadata: { count: parseInt(cnt), average: parseFloat(avg_cnt), zScore: parseFloat(z_score ?? '0') },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkSchemaDrift(
  table: string, expectedColumns: Array<{ name: string; type: string }>
): Promise<CheckResult> {
  const { rows } = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = $1 ORDER BY ordinal_position
  `, [table]);

  const actual = rows.map((r: any) => ({ name: r.column_name, type: r.data_type }));
  const added = actual.filter(a => !expectedColumns.find(e => e.name === a.name));
  const removed = expectedColumns.filter(e => !actual.find(a => a.name === e.name));
  const typeChanged = actual.filter(a => {
    const expected = expectedColumns.find(e => e.name === a.name);
    return expected && expected.type !== a.type;
  });

  const drifted = added.length > 0 || removed.length > 0 || typeChanged.length > 0;
  return {
    checkId: `schema:${table}`,
    passed: !drifted,
    severity: removed.length > 0 ? 'critical' : 'medium',
    message: drifted
      ? `Schema changed: +${added.length} added, -${removed.length} removed, ~${typeChanged.length} type changes`
      : 'Schema matches expected',
    metadata: { added, removed, typeChanged },
    checkedAt: new Date().toISOString(),
  };
}

export async function checkReferentialIntegrity(
  table: string, column: string, refTable: string, refColumn: string
): Promise<CheckResult> {
  const { rows } = await db.query(`
    SELECT COUNT(*) as orphans FROM ${table} t
    LEFT JOIN ${refTable} r ON t.${column} = r.${refColumn}
    WHERE r.${refColumn} IS NULL AND t.${column} IS NOT NULL
  `);
  const orphans = parseInt(rows[0].orphans);
  return {
    checkId: `ref:${table}.${column}->${refTable}.${refColumn}`,
    passed: orphans === 0,
    severity: orphans > 1000 ? 'critical' : 'high',
    message: orphans === 0 ? 'No orphaned records' : `${orphans} orphaned records`,
    metadata: { orphanCount: orphans },
    checkedAt: new Date().toISOString(),
  };
}
```

## Step 3: Scheduler and Alert Pipeline

```typescript
// src/pipeline/scheduler.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import * as checks from '../checks/executors';

const connection = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const checkQueue = new Queue('dq-checks', { connection });

const worker = new Worker('dq-checks', async (job) => {
  const { check } = job.data;
  let result;

  switch (check.checkType) {
    case 'freshness':
      result = await checks.checkFreshness(check.table, check.config.timestampColumn, check.config.maxStaleHours);
      break;
    case 'null_rate':
      result = await checks.checkNullRate(check.table, check.config.column, check.config.maxNullPercent);
      break;
    case 'volume_anomaly':
      result = await checks.checkVolumeAnomaly(check.table, check.config.timestampColumn);
      break;
    case 'schema_drift':
      result = await checks.checkSchemaDrift(check.table, check.config.expectedColumns);
      break;
    case 'referential_integrity':
      result = await checks.checkReferentialIntegrity(
        check.table, check.config.column, check.config.refTable, check.config.refColumn
      );
      break;
    default:
      return;
  }

  // Store result
  await db.query(`
    INSERT INTO dq_results (check_id, passed, severity, message, metadata, checked_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [result.checkId, result.passed, result.severity, result.message, JSON.stringify(result.metadata)]);

  // Alert on failure
  if (!result.passed) {
    await sendAlert(check.owner, result);
  }

  return result;
}, { connection, concurrency: 10 });

async function sendAlert(owner: string, result: any): Promise<void> {
  console.log(`🚨 DQ Alert [${result.severity}] ${result.checkId}: ${result.message}`);
}
```

## Results

- **Data quality incidents reaching production**: dropped from 8/month to 1/month
- **Mean time to detect**: 45 minutes (was 5 days for the schema drift incident)
- **340K corrupted rows**: would have been caught in the first hourly null rate check
- **Board deck accuracy**: 100% since deployment — freshness alerts prevent stale data in dashboards
- **Data team firefighting**: dropped from 30% of time to 5%
- **200+ checks running**: across 45 tables, hourly and daily schedules
- **False positive rate**: 3.2% (tuned z-score thresholds after first month)
