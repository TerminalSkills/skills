---
title: Build a Config Drift Detector
slug: build-config-drift-detector
description: Build a configuration drift detector that compares infrastructure state across environments, detects unauthorized changes, generates remediation plans, and maintains environment parity.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - configuration
  - drift
  - infrastructure
  - compliance
  - devops
---

# Build a Config Drift Detector

## The Problem

Ivan leads ops at a 25-person company with dev, staging, and production environments. Someone changed a database config in production directly (bypassing CI/CD) — it works but staging doesn't have the change. A firewall rule was added to production 3 months ago; nobody remembers why and it's not in any config file. Environment variables differ between staging and prod — 12 of 80 vars are different, causing intermittent bugs. They need drift detection: snapshot configs per environment, compare snapshots, detect unauthorized changes, alert on drift, and generate remediation plans.

## Step 1: Build the Drift Detector

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface ConfigSnapshot {
  id: string;
  environment: string;
  category: string;
  config: Record<string, any>;
  checksum: string;
  capturedAt: string;
  capturedBy: string;
}

interface DriftResult {
  environment1: string;
  environment2: string;
  drifts: Array<{
    key: string;
    category: string;
    value1: any;
    value2: any;
    severity: "critical" | "warning" | "info";
    recommendation: string;
  }>;
  totalKeys: number;
  matchingKeys: number;
  driftPercentage: number;
}

const SEVERITY_RULES: Array<{ pattern: RegExp; severity: "critical" | "warning" | "info" }> = [
  { pattern: /password|secret|key|token/i, severity: "critical" },
  { pattern: /database|redis|host|port/i, severity: "critical" },
  { pattern: /timeout|retry|limit|max/i, severity: "warning" },
  { pattern: /log|debug|verbose/i, severity: "info" },
];

// Capture config snapshot for an environment
export async function captureSnapshot(environment: string, configs: Record<string, Record<string, any>>, capturedBy: string): Promise<ConfigSnapshot[]> {
  const snapshots: ConfigSnapshot[] = [];
  for (const [category, config] of Object.entries(configs)) {
    const id = `snap-${randomBytes(6).toString("hex")}`;
    const checksum = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);

    await pool.query(
      `INSERT INTO config_snapshots (id, environment, category, config, checksum, captured_by, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id, environment, category, JSON.stringify(config), checksum, capturedBy]
    );

    snapshots.push({ id, environment, category, config, checksum, capturedAt: new Date().toISOString(), capturedBy });
  }
  return snapshots;
}

// Compare two environments
export async function detectDrift(env1: string, env2: string, categories?: string[]): Promise<DriftResult> {
  const snap1 = await getLatestSnapshots(env1, categories);
  const snap2 = await getLatestSnapshots(env2, categories);

  const drifts: DriftResult["drifts"] = [];
  const allKeys = new Set<string>();
  let matching = 0;

  // Compare all categories
  const allCategories = new Set([...Object.keys(snap1), ...Object.keys(snap2)]);
  for (const category of allCategories) {
    const config1 = snap1[category] || {};
    const config2 = snap2[category] || {};
    const keys = new Set([...Object.keys(config1), ...Object.keys(config2)]);

    for (const key of keys) {
      allKeys.add(`${category}.${key}`);
      const val1 = config1[key];
      const val2 = config2[key];

      if (JSON.stringify(val1) === JSON.stringify(val2)) { matching++; continue; }

      const severity = getSeverity(key);
      const recommendation = generateRecommendation(key, val1, val2, env1, env2);

      drifts.push({ key, category, value1: val1, value2: val2, severity, recommendation });
    }
  }

  const result: DriftResult = {
    environment1: env1, environment2: env2, drifts,
    totalKeys: allKeys.size, matchingKeys: matching,
    driftPercentage: allKeys.size > 0 ? Math.round(((allKeys.size - matching) / allKeys.size) * 100) : 0,
  };

  // Alert on critical drifts
  const criticalDrifts = drifts.filter((d) => d.severity === "critical");
  if (criticalDrifts.length > 0) {
    await redis.rpush("notification:queue", JSON.stringify({
      type: "config_drift", environments: [env1, env2],
      critical: criticalDrifts.length, total: drifts.length,
    }));
  }

  // Store result
  await pool.query(
    `INSERT INTO drift_reports (env1, env2, total_keys, matching_keys, drift_count, critical_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [env1, env2, result.totalKeys, result.matchingKeys, drifts.length, criticalDrifts.length]
  );

  return result;
}

// Detect unauthorized changes (compare current to last known-good)
export async function detectUnauthorizedChanges(environment: string): Promise<Array<{ key: string; category: string; previousValue: any; currentValue: any; changedAt: string }>> {
  const changes: any[] = [];
  const categories = await getSnapshotCategories(environment);

  for (const category of categories) {
    const { rows } = await pool.query(
      `SELECT config, checksum, captured_at FROM config_snapshots
       WHERE environment = $1 AND category = $2
       ORDER BY captured_at DESC LIMIT 2`,
      [environment, category]
    );

    if (rows.length < 2) continue;
    const current = JSON.parse(rows[0].config);
    const previous = JSON.parse(rows[1].config);

    for (const key of Object.keys(current)) {
      if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
        changes.push({ key, category, previousValue: previous[key], currentValue: current[key], changedAt: rows[0].captured_at });
      }
    }
  }

  return changes;
}

function getSeverity(key: string): "critical" | "warning" | "info" {
  for (const rule of SEVERITY_RULES) {
    if (rule.pattern.test(key)) return rule.severity;
  }
  return "info";
}

function generateRecommendation(key: string, val1: any, val2: any, env1: string, env2: string): string {
  if (val1 === undefined) return `Add '${key}' to ${env1} (exists in ${env2})`;
  if (val2 === undefined) return `Add '${key}' to ${env2} (exists in ${env1})`;
  return `Sync '${key}' — ${env1} has '${JSON.stringify(val1).slice(0, 50)}', ${env2} has '${JSON.stringify(val2).slice(0, 50)}'`;
}

async function getLatestSnapshots(environment: string, categories?: string[]): Promise<Record<string, Record<string, any>>> {
  let sql = `SELECT DISTINCT ON (category) category, config FROM config_snapshots WHERE environment = $1`;
  const params: any[] = [environment];
  if (categories?.length) { sql += ` AND category = ANY($2)`; params.push(categories); }
  sql += " ORDER BY category, captured_at DESC";
  const { rows } = await pool.query(sql, params);
  return Object.fromEntries(rows.map((r: any) => [r.category, JSON.parse(r.config)]));
}

async function getSnapshotCategories(environment: string): Promise<string[]> {
  const { rows } = await pool.query("SELECT DISTINCT category FROM config_snapshots WHERE environment = $1", [environment]);
  return rows.map((r: any) => r.category);
}
```

## Results

- **12 env var differences found** — drift report shows exactly which vars differ between staging and prod; 8 were bugs, 4 intentional; all documented
- **Unauthorized changes detected** — production DB config changed outside CI/CD → drift alert fires → ops investigates → hotfix properly tracked
- **Environment parity** — weekly drift scan ensures dev/staging/prod match; drift percentage: 15% → 2%; "works in staging but not prod" bugs eliminated
- **Severity-based alerting** — password/secret drifts = critical alert; log level drifts = info; team focuses on what matters
- **Remediation plans** — each drift includes specific fix: "Add REDIS_URL to staging" or "Sync DB_TIMEOUT — prod has 30s, staging has 5s"
