---
name: db-backup
description: >-
  Implements database backup strategies, restore procedures, and disaster
  recovery plans. Use when you need to set up automated backups, configure
  WAL archiving, create restore runbooks, define retention policies, test
  backup integrity, or plan for point-in-time recovery. Trigger words:
  database backup, disaster recovery, pg_dump, pg_basebackup, WAL archiving,
  point-in-time recovery, RPO, RTO, backup verification, restore runbook.
license: Apache-2.0
compatibility: "PostgreSQL 13+, MySQL 8+, or MongoDB 6+. S3-compatible storage for remote backups."
metadata:
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["database", "backup", "disaster-recovery"]
---

# Database Backup

## Overview

This skill enables AI agents to design, implement, and verify database backup and disaster recovery systems. It covers backup strategy selection, automated backup pipelines, restore runbook generation, backup verification, and retention policy management for PostgreSQL, MySQL, and MongoDB.

## Instructions

### 1. Define Recovery Objectives First

Before writing any backup scripts, establish:

- **RPO (Recovery Point Objective)**: Maximum acceptable data loss measured in time. Financial data: < 1 hour. User content: < 4 hours. Analytics: < 24 hours.
- **RTO (Recovery Time Objective)**: Maximum acceptable downtime. Critical SaaS: < 30 minutes. Internal tools: < 4 hours.

These drive every subsequent decision.

### 2. Three-Tier Backup Strategy

Implement all three tiers for production databases:

**Tier 1 — Continuous (WAL/Binlog archiving)**:
- PostgreSQL: `archive_mode = on`, ship WAL to S3 via `pgBackRest` or `wal-g`
- MySQL: Enable binary logging, ship to S3
- Enables point-in-time recovery (PITR)
- Typical RPO: 5 minutes

**Tier 2 — Daily logical backups**:
- `pg_dump --format=custom` (PostgreSQL) or `mysqldump --single-transaction` (MySQL)
- Allows selective table/schema restore
- Store compressed and encrypted

**Tier 3 — Weekly physical backups**:
- `pg_basebackup` (PostgreSQL) or XtraBackup (MySQL)
- Fastest full restore path
- Required base for PITR with WAL replay

### 3. Storage and Encryption

- Store backups in a **different region** from the primary database
- Encrypt at rest with AES-256 via cloud KMS
- Encrypt in transit (TLS for all transfers)
- Enable **S3 Object Lock** (WORM) to prevent deletion — even by admins
- Use a dedicated IAM role for backups, separate from the application role

### 4. Retention Policy

| Tier | Retention | Storage Class |
|------|-----------|--------------|
| WAL segments | 7 days | S3 Standard |
| Daily logical | 30 days | S3 Standard-IA after 7 days |
| Weekly physical | 90 days | S3 Glacier after 30 days |
| Monthly snapshot | 1 year | S3 Glacier Deep Archive |

Implement via S3 lifecycle policies, not manual cleanup scripts.

### 5. Restore Runbooks

Generate three standard runbooks:

**Runbook 1 — Point-in-Time Recovery**:
```
Scenario: Accidental data deletion (e.g., dropped table)
Steps:
1. Identify the target timestamp (before the incident)
2. Restore latest base backup to isolated instance
3. Replay WAL up to target timestamp
4. Verify data integrity on restored instance
5. Export affected tables and import into production
Estimated time: 15-45 minutes depending on database size
```

**Runbook 2 — Full Disaster Recovery**:
```
Scenario: Complete database loss (region outage, corruption)
Steps:
1. Provision new database instance in backup region
2. Restore latest weekly physical backup
3. Replay WAL/binlog from last physical backup to latest available
4. Update application connection strings
5. Verify full application functionality
Estimated time: 30-120 minutes depending on database size
```

**Runbook 3 — Selective Table Restore**:
```
Scenario: Single table corrupted or accidentally modified
Steps:
1. Restore daily logical backup to temporary database
2. Export target table(s) from temporary database
3. Import into production with appropriate conflict handling
4. Verify row counts and data integrity
Estimated time: 10-30 minutes
```

### 6. Backup Verification (Critical)

**Unverified backups are not backups.** Automate daily verification:

1. Restore latest backup to an ephemeral test instance
2. Run integrity checks:
   - Row counts for top 10 tables (compare against production)
   - Schema comparison (diff against production)
   - Checksum of recent high-value records
   - Application health check against restored database
3. Alert on any discrepancy
4. Terminate test instance after verification
5. Log verification results with timestamps

### 7. Common Pitfalls

- **pg_dump without --format=custom**: Plain SQL dumps are slower to restore and can't do selective table restore
- **Backups in same region**: A region outage takes out both your database and your backups
- **No Object Lock**: Ransomware or compromised credentials can delete your backups
- **Untested restores**: 37% of backup restores fail when first attempted (Databarracks survey). Test monthly at minimum
- **Missing WAL segments**: Gaps in WAL archiving break PITR chains. Monitor archive_command failures

## Examples

### Example 1: PostgreSQL backup with pgBackRest

**Prompt**: "Set up automated backups for my PostgreSQL 15 database on an EC2 instance. 80 GB of data, RPO target 1 hour."

**Output**: The agent configures pgBackRest with S3 repository in a secondary region, sets up WAL archiving (achieving 5-minute RPO), daily differential backups, weekly full backups, and a cron-based verification job that restores to an RDS instance and runs integrity checks.

### Example 2: Restore runbook for accidental deletion

**Prompt**: "Someone deleted all rows from the users table 3 hours ago. Help me restore it."

**Output**: The agent walks through point-in-time recovery: identifies the latest base backup before the incident, restores to a temporary instance, replays WAL to 5 minutes before the deletion timestamp, exports the users table, and provides the import command with `ON CONFLICT` handling to merge with any new users created since the incident.

## Guidelines

- Run restore drills monthly — automate them, don't rely on humans remembering
- Monitor backup job success/failure with alerts, not just logs
- Document backup credentials location and rotation schedule
- Keep backup tools (pgBackRest, wal-g) version-pinned and updated separately from the database
- Calculate and track actual RPO (time between last successful backup and now) as a metric
