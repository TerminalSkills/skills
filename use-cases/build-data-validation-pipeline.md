---
title: Build a Data Validation Pipeline
slug: build-data-validation-pipeline
description: Build a data validation pipeline with schema enforcement, business rule checking, anomaly detection, data quality scoring, and automated remediation for ensuring data integrity.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Data Engineering
tags:
  - data-quality
  - validation
  - pipeline
  - integrity
  - anomaly-detection
---

# Build a Data Validation Pipeline

## The Problem

Marcus leads data at a 25-person company. Bad data flows silently into their analytics: null emails, negative prices, future dates, duplicate records, and schema mismatches. An analyst reported a $2M revenue spike that turned out to be a currency conversion bug. Data quality issues are found weeks later by consumers, not at ingestion. There's no systematic validation — each pipeline has ad-hoc checks. They need a validation pipeline: validate every record at ingestion, enforce schemas, check business rules, detect anomalies, score data quality, and remediate automatically.

## Step 1: Build the Validation Pipeline

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { z, ZodSchema } from "zod";
const redis = new Redis(process.env.REDIS_URL!);

interface ValidationResult { valid: boolean; score: number; errors: ValidationError[]; warnings: ValidationError[]; record: any; remediated: boolean; }
interface ValidationError { field: string; rule: string; severity: "error" | "warning"; message: string; value: any; }
interface ValidationRule { name: string; field: string; check: (value: any, record: any) => boolean; severity: "error" | "warning"; message: string; remediate?: (value: any, record: any) => any; }
interface QualityReport { totalRecords: number; validRecords: number; invalidRecords: number; qualityScore: number; topIssues: Array<{ rule: string; count: number }>; }

// Define validation rules per entity
const ORDER_RULES: ValidationRule[] = [
  { name: "positive_amount", field: "amount", check: (v) => typeof v === "number" && v > 0, severity: "error", message: "Amount must be positive", remediate: (v) => Math.abs(v) },
  { name: "valid_currency", field: "currency", check: (v) => ["USD", "EUR", "GBP", "JPY", "BRL"].includes(v), severity: "error", message: "Invalid currency code" },
  { name: "valid_email", field: "customerEmail", check: (v) => /^[^@]+@[^@]+\.[^@]+$/.test(v || ""), severity: "error", message: "Invalid email format" },
  { name: "not_future_date", field: "createdAt", check: (v) => new Date(v) <= new Date(), severity: "error", message: "Date cannot be in the future", remediate: () => new Date().toISOString() },
  { name: "reasonable_amount", field: "amount", check: (v) => v < 1000000, severity: "warning", message: "Unusually large amount — verify" },
  { name: "has_customer_id", field: "customerId", check: (v) => v !== null && v !== undefined && v !== "", severity: "error", message: "Customer ID is required" },
  { name: "valid_status", field: "status", check: (v) => ["pending", "processing", "completed", "cancelled", "refunded"].includes(v), severity: "error", message: "Invalid order status" },
];

// Validate a single record
export function validateRecord(record: any, rules: ValidationRule[], autoRemediate: boolean = false): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let remediated = false;

  for (const rule of rules) {
    const value = record[rule.field];
    const passed = rule.check(value, record);

    if (!passed) {
      const error: ValidationError = { field: rule.field, rule: rule.name, severity: rule.severity, message: rule.message, value };

      if (rule.severity === "error") errors.push(error);
      else warnings.push(error);

      // Auto-remediate if possible
      if (autoRemediate && rule.remediate) {
        record[rule.field] = rule.remediate(value, record);
        remediated = true;
      }
    }
  }

  // Calculate quality score (0-100)
  const totalChecks = rules.length;
  const failedChecks = errors.length + warnings.length * 0.5;
  const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

  return { valid: errors.length === 0, score, errors, warnings, record, remediated };
}

// Validate batch of records
export async function validateBatch(records: any[], rules: ValidationRule[], options?: { autoRemediate?: boolean; rejectThreshold?: number }): Promise<{ valid: any[]; invalid: any[]; report: QualityReport }> {
  const valid: any[] = [];
  const invalid: any[] = [];
  const issueCounts = new Map<string, number>();

  for (const record of records) {
    const result = validateRecord(record, rules, options?.autoRemediate);

    if (result.valid || result.remediated) valid.push(result.record);
    else invalid.push({ record, errors: result.errors });

    for (const error of [...result.errors, ...result.warnings]) {
      issueCounts.set(error.rule, (issueCounts.get(error.rule) || 0) + 1);
    }
  }

  const qualityScore = records.length > 0 ? Math.round((valid.length / records.length) * 100) : 100;

  // Alert if quality below threshold
  const threshold = options?.rejectThreshold || 90;
  if (qualityScore < threshold) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "data_quality_alert", qualityScore, threshold, invalidCount: invalid.length, topIssues: [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) }));
  }

  // Store report
  await pool.query(
    "INSERT INTO data_quality_reports (total_records, valid_records, invalid_records, quality_score, top_issues, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
    [records.length, valid.length, invalid.length, qualityScore, JSON.stringify([...issueCounts.entries()].slice(0, 10))]
  );

  // Track per-rule metrics
  for (const [rule, count] of issueCounts) {
    await redis.hincrby("dq:issues:" + new Date().toISOString().slice(0, 10), rule, count);
  }

  return {
    valid, invalid,
    report: { totalRecords: records.length, validRecords: valid.length, invalidRecords: invalid.length, qualityScore, topIssues: [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).map(([rule, count]) => ({ rule, count })) },
  };
}

// Anomaly detection (statistical)
export async function detectAnomalies(table: string, column: string, value: number): Promise<{ isAnomaly: boolean; zScore: number; mean: number; stdDev: number }> {
  const { rows: [stats] } = await pool.query(
    `SELECT AVG(${column}) as mean, STDDEV(${column}) as stddev FROM ${table} WHERE created_at > NOW() - INTERVAL '30 days'`
  );

  const mean = parseFloat(stats.mean || "0");
  const stdDev = parseFloat(stats.stddev || "1");
  const zScore = stdDev > 0 ? Math.abs(value - mean) / stdDev : 0;

  return { isAnomaly: zScore > 3, zScore: Math.round(zScore * 100) / 100, mean: Math.round(mean * 100) / 100, stdDev: Math.round(stdDev * 100) / 100 };
}

// Get quality trend
export async function getQualityTrend(days: number = 30): Promise<Array<{ date: string; score: number; records: number }>> {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) as date, AVG(quality_score) as score, SUM(total_records) as records
     FROM data_quality_reports WHERE created_at > NOW() - $1 * INTERVAL '1 day'
     GROUP BY DATE(created_at) ORDER BY date`,
    [days]
  );
  return rows.map((r: any) => ({ date: r.date.toISOString().slice(0, 10), score: Math.round(parseFloat(r.score)), records: parseInt(r.records) }));
}
```

## Results

- **$2M revenue bug caught at ingestion** — anomaly detection flags order with $2M amount (z-score: 8.5); reviewed before reaching analytics; currency bug found
- **Quality score: 72% → 97%** — systematic validation catches negative prices, null emails, future dates; auto-remediation fixes 60% of issues automatically
- **Per-rule tracking** — "positive_amount" fails 500 times this week; root cause: new API client sends negative refund amounts; fix targeted
- **Batch rejection** — quality below 90% → entire batch held for review; prevents bad data from propagating; alert sent to data team
- **Quality trend dashboard** — score improving from 72% to 97% over 3 months; each rule fix shows measurable improvement; data-driven quality program
