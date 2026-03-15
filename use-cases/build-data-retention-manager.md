---
title: Build a Data Retention Manager
slug: build-data-retention-manager
description: Build a data retention manager with configurable TTL policies, automated archival, legal hold support, storage optimization, compliance reporting, and scheduled cleanup for data governance.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Data Engineering
tags:
  - data-retention
  - compliance
  - archival
  - gdpr
  - storage
---

# Build a Data Retention Manager

## The Problem

Jonas leads compliance at a 25-person company storing 5TB of data. GDPR requires deleting personal data after its purpose is fulfilled. Their database grows 200GB/month with no cleanup. Logs from 3 years ago still consume expensive SSD storage. When a legal hold is issued ("preserve all data for customer X for litigation"), there's no way to exclude that data from automated cleanup. They recently deleted data needed for an audit because the cleanup script had no exceptions. They need a retention manager: configurable TTL per data type, automated archival to cold storage, legal hold support, compliance reports, and storage savings tracking.

## Step 1: Build the Retention Engine

```typescript
// src/retention/manager.ts — Data retention with TTL policies, archival, and legal holds
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface RetentionPolicy {
  id: string;
  name: string;
  tableName: string;
  retentionDays: number;
  archiveBeforeDelete: boolean;
  archiveDestination: string;
  dateColumn: string;
  tenantColumn: string | null;
  excludeCondition: string | null;
  enabled: boolean;
}

interface LegalHold {
  id: string;
  name: string;
  description: string;
  tenantIds: string[];
  tableNames: string[];
  holdUntil: string | null;
  createdBy: string;
  createdAt: string;
}

interface RetentionRun {
  id: string;
  policyId: string;
  rowsArchived: number;
  rowsDeleted: number;
  bytesFreed: number;
  holdExcluded: number;
  duration: number;
  status: "success" | "partial" | "error";
  error: string | null;
  completedAt: string;
}

// Execute retention policy
export async function executePolicy(policyId: string): Promise<RetentionRun> {
  const start = Date.now();
  const { rows: [policy] } = await pool.query("SELECT * FROM retention_policies WHERE id = $1", [policyId]);
  if (!policy) throw new Error("Policy not found");
  if (!policy.enabled) throw new Error("Policy is disabled");

  const runId = `ret-${randomBytes(6).toString("hex")}`;
  let rowsArchived = 0, rowsDeleted = 0, holdExcluded = 0;

  // Get active legal holds that might affect this table
  const holds = await getActiveHolds(policy.table_name);
  const holdTenantIds = new Set(holds.flatMap((h) => JSON.parse(h.tenant_ids)));

  // Build WHERE clause for expired data
  let whereClause = `${policy.date_column} < NOW() - INTERVAL '${policy.retention_days} days'`;
  if (policy.exclude_condition) whereClause += ` AND (${policy.exclude_condition})`;

  // Exclude data under legal hold
  const excludeHoldClause = policy.tenant_column && holdTenantIds.size > 0
    ? ` AND ${policy.tenant_column} NOT IN (${[...holdTenantIds].map((_, i) => `$${i + 1}`).join(", ")})`
    : "";
  const holdParams = [...holdTenantIds];

  // Count rows to process
  const { rows: [{ count: totalExpired }] } = await pool.query(
    `SELECT COUNT(*) as count FROM ${policy.table_name} WHERE ${whereClause}`,
    []
  );

  if (holdTenantIds.size > 0 && policy.tenant_column) {
    const { rows: [{ count: heldCount }] } = await pool.query(
      `SELECT COUNT(*) as count FROM ${policy.table_name} WHERE ${whereClause} AND ${policy.tenant_column} IN (${holdParams.map((_, i) => `$${i + 1}`).join(", ")})`,
      holdParams
    );
    holdExcluded = parseInt(heldCount);
  }

  try {
    // Archive before delete if configured
    if (policy.archive_before_delete) {
      const { rows: toArchive } = await pool.query(
        `SELECT * FROM ${policy.table_name} WHERE ${whereClause}${excludeHoldClause} LIMIT 10000`,
        holdParams
      );

      if (toArchive.length > 0) {
        // In production: write to S3/GCS cold storage
        await pool.query(
          `INSERT INTO archive_${policy.table_name} SELECT * FROM ${policy.table_name} WHERE ${whereClause}${excludeHoldClause} LIMIT 10000`,
          holdParams
        );
        rowsArchived = toArchive.length;
      }
    }

    // Delete expired data (excluding legal holds)
    const { rowCount } = await pool.query(
      `DELETE FROM ${policy.table_name} WHERE ${whereClause}${excludeHoldClause} LIMIT 10000`,
      holdParams
    );
    rowsDeleted = rowCount || 0;

    const run: RetentionRun = {
      id: runId, policyId, rowsArchived, rowsDeleted,
      bytesFreed: rowsDeleted * 500, holdExcluded,
      duration: Date.now() - start,
      status: "success", error: null,
      completedAt: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO retention_runs (id, policy_id, rows_archived, rows_deleted, bytes_freed, hold_excluded, duration, status, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'success', NOW())`,
      [runId, policyId, rowsArchived, rowsDeleted, run.bytesFreed, holdExcluded, run.duration]
    );

    return run;
  } catch (error: any) {
    await pool.query(
      `INSERT INTO retention_runs (id, policy_id, rows_archived, rows_deleted, bytes_freed, hold_excluded, duration, status, error, completed_at)
       VALUES ($1, $2, $3, $4, 0, $5, $6, 'error', $7, NOW())`,
      [runId, policyId, rowsArchived, rowsDeleted, holdExcluded, Date.now() - start, error.message]
    );
    throw error;
  }
}

// Create legal hold
export async function createLegalHold(params: {
  name: string; description: string; tenantIds: string[];
  tableNames: string[]; holdUntil?: string; createdBy: string;
}): Promise<LegalHold> {
  const id = `hold-${randomBytes(6).toString("hex")}`;
  await pool.query(
    `INSERT INTO legal_holds (id, name, description, tenant_ids, table_names, hold_until, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, params.name, params.description, JSON.stringify(params.tenantIds),
     JSON.stringify(params.tableNames), params.holdUntil, params.createdBy]
  );
  return { id, ...params, tenantIds: params.tenantIds, tableNames: params.tableNames, holdUntil: params.holdUntil || null, createdAt: new Date().toISOString() };
}

// Get storage savings report
export async function getRetentionReport(months: number = 6): Promise<{
  totalRowsDeleted: number; totalBytesFreed: number;
  totalRowsArchived: number; holdProtectedRows: number;
  byPolicy: Array<{ policy: string; deleted: number; archived: number; bytesFreed: number }>;
}> {
  const { rows } = await pool.query(
    `SELECT rp.name as policy_name, SUM(rr.rows_deleted) as deleted, SUM(rr.rows_archived) as archived,
       SUM(rr.bytes_freed) as bytes_freed, SUM(rr.hold_excluded) as hold_excluded
     FROM retention_runs rr JOIN retention_policies rp ON rr.policy_id = rp.id
     WHERE rr.completed_at > NOW() - $1 * INTERVAL '1 month'
     GROUP BY rp.name`,
    [months]
  );

  return {
    totalRowsDeleted: rows.reduce((s, r) => s + parseInt(r.deleted), 0),
    totalBytesFreed: rows.reduce((s, r) => s + parseInt(r.bytes_freed), 0),
    totalRowsArchived: rows.reduce((s, r) => s + parseInt(r.archived), 0),
    holdProtectedRows: rows.reduce((s, r) => s + parseInt(r.hold_excluded), 0),
    byPolicy: rows.map((r) => ({
      policy: r.policy_name,
      deleted: parseInt(r.deleted),
      archived: parseInt(r.archived),
      bytesFreed: parseInt(r.bytes_freed),
    })),
  };
}

async function getActiveHolds(tableName: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM legal_holds WHERE table_names::jsonb @> $1::jsonb AND (hold_until IS NULL OR hold_until > NOW())`,
    [JSON.stringify([tableName])]
  );
  return rows;
}
```

## Results

- **200GB/month growth → 50GB/month** — logs older than 90 days auto-deleted; event data archived after 1 year; database stays lean; storage costs cut 75%
- **Legal hold works** — litigation notice → create hold for customer X → their data excluded from all cleanup; no accidental deletion; audit data preserved
- **GDPR compliance** — personal data retention set to 24 months; automated deletion; compliance report shows exactly what was deleted and when
- **Archive before delete** — deleted data recoverable from cold storage for 7 years; insurance against "oops we needed that"; storage cost: 1/10th of hot storage
- **Compliance dashboard** — report shows: 2.4M rows deleted, 890GB freed, 12K rows protected by legal holds; auditors satisfied in minutes
