---
title: "Set Up Database Backup and Disaster Recovery with AI"
slug: set-up-database-backup-and-disaster-recovery
description: "Implement automated database backups, point-in-time recovery, and disaster recovery runbooks for production databases."
skills: [db-backup, docker-helper, cicd-pipeline]
category: devops
tags: [database, backup, disaster-recovery, postgresql, devops]
---

# Set Up Database Backup and Disaster Recovery with AI

## The Problem

The production database holds everything -- user data, transactions, years of business history. The backup strategy is a cron job someone wrote two years ago that nobody has tested. When a junior engineer accidentally runs a DELETE without a WHERE clause on the orders table, the team discovers the backups have been silently failing for three weeks because the disk filled up. The one person who set up the cron job left the company six months ago.

The difference between a 30-minute recovery and a company-ending data loss event comes down to one question: can you actually restore from your backups? Most teams have never tried. They have backup files on disk, but no one has verified that those files contain valid, restorable data.

## The Solution

Using the **db-backup**, **docker-helper**, and **cicd-pipeline** skills, this walkthrough audits the current backup situation, implements WAL archiving for point-in-time recovery, sets up automated daily verification that proves backups are restorable, and creates a disaster recovery runbook that anyone on the team can execute under pressure.

## Step-by-Step Walkthrough

### Step 1: Audit the Current Backup Situation

Before building anything new, find out how bad the current state really is:

```text
Audit my current database backup setup. I have a PostgreSQL 15 database (180GB) running on an AWS RDS instance. There's a cron job in /etc/cron.d/db-backup that runs pg_dump nightly. Check the backup script, verify recent backups exist and are valid, and identify gaps in our disaster recovery readiness. Also tell me our current RPO and RTO.
```

The audit results are grim:

| Check | Status | Finding |
|-------|--------|---------|
| Backup schedule | Running | `pg_dump` at 02:00 UTC via cron |
| Backup location | Problem | Same server as database |
| Encryption | Missing | None |
| Compression | Missing | None |
| Recent backups | Failed | Last 3 backups are 0 bytes (disk full since Jan 28) |
| WAL archiving | Missing | Only nightly full dumps, no continuous archiving |
| Restore procedure | Missing | No documentation exists |

**Current RPO: ~24 hours** (nightly dump only, no WAL archiving). Any data written between backups is gone if the database fails. A transaction at 1:00 PM would not be in the 2:00 AM backup, meaning up to 23 hours of data could be lost.

**Current RTO: Unknown** -- no restore has ever been tested. Nobody on the current team knows the exact steps. Under pressure, "unknown RTO" effectively means "hours of trial and error."

The critical issues are stacked. Backups live on the same server as the database, so a server failure takes out both. The last valid backup is 23 days old -- three weeks of data unprotected. There is no point-in-time recovery capability. And the most dangerous finding: the backup disk has been full for three weeks and nobody was alerted. The cron job ran, produced 0-byte files, and exited silently.

Target state: RPO under 5 minutes (WAL archiving), RTO under 30 minutes (tested runbook).

### Step 2: Build Real Backup Infrastructure

The nightly `pg_dump` to local disk gets replaced with a proper backup system:

```text
Set up a comprehensive backup strategy for our PostgreSQL 15 database on RDS. I need: continuous WAL archiving to S3 for point-in-time recovery (RPO < 5 minutes), daily full backups with compression and encryption uploaded to S3 in a different region (us-west-2, database is in us-east-1), backup rotation keeping 7 daily, 4 weekly, and 12 monthly backups, and automated cleanup of expired backups. Use a containerized backup runner so it's portable. Store the encryption key in AWS Secrets Manager.
```

The backup system has three layers:

**Continuous WAL archiving** streams write-ahead logs to S3 in near-real-time using WAL-G. WAL (Write-Ahead Log) records every change to the database before it is applied. By streaming these logs continuously, recovery can replay changes from the last full backup up to any point in time. The WAL-G configuration:

```bash
# WAL-G environment (set in the backup container)
WALG_S3_PREFIX=s3://db-backups-us-west-2/wal-archive
AWS_REGION=us-west-2
PGHOST=your-rds-instance.us-east-1.rds.amazonaws.com
WALG_COMPRESSION_METHOD=lz4
```

If the database goes down at 2:47 PM, recovery can restore to 2:46 PM -- not last night's dump.

**Daily full backups** run `pg_basebackup` with compression and encryption, uploading to S3 in a different AWS region. Even if us-east-1 goes down entirely, the backups survive in us-west-2. Encryption uses AES-256 with the key stored in AWS Secrets Manager, so a compromised S3 bucket does not expose the data.

**Retention policy** keeps 7 daily, 4 weekly, and 12 monthly backups. A cleanup script runs after each daily backup and removes anything outside the policy. No more disk-full surprises -- the retention policy enforces a predictable storage footprint. At 18 GB compressed per daily backup, the full retention (7 daily + 4 weekly + 12 monthly = 23 backups) uses roughly 414 GB of S3 storage -- about $9.50/month at standard rates. Cheap insurance for 180 GB of irreplaceable business data.

The entire backup runner is containerized -- a Docker image with WAL-G, pg_basebackup, and the rotation scripts. It runs as a Kubernetes CronJob, which means it is portable, restartable, and monitored the same way as any other workload. If the backup job fails, Kubernetes retry logic handles transient issues automatically.

### Step 3: Verify Backups Automatically

Here is the uncomfortable truth about backups: if you have never restored one, you do not have backups. You have files. Verification runs every day to prove the backups are real:

```text
Create an automated backup verification job that runs daily after the backup completes. It should: download the latest backup from S3, restore it to a temporary RDS instance (db.t3.medium), run integrity checks comparing row counts of the 10 largest tables against production, verify that the most recent transaction timestamp is within 24 hours, then tear down the temporary instance. Send a Slack notification with results. If verification fails, page the on-call engineer.
```

A typical verification report:

| Check | Result |
|-------|--------|
| Backup download | 18.2 GB compressed (180 GB uncompressed) |
| Restore time | 22 minutes to temp instance |
| `users` row count | 2,847,291 (prod: 2,847,291) -- match |
| `orders` row count | 8,412,056 (prod: 8,412,103) -- delta: 47, within 24h window |
| `transactions` row count | 14,209,881 (prod: 14,210,002) -- match |
| Latest transaction | 2026-02-17 01:58:42 UTC -- within threshold |
| Temp instance cleanup | Terminated |

**Verified RPO: 4 hours 12 minutes.** Verified RTO: 22 minutes. Both within target.

The row count delta on `orders` (47 rows) is expected -- those are orders placed between the backup timestamp and the verification check. The verification confirms this delta is within the 24-hour window, not a sign of data corruption.

The verification catches problems early. On day 3 after setup, it detects a backup corruption issue -- a partial upload that passed the S3 checksum but failed the restore integrity check. Without daily verification, that bad backup would have sat in S3 for weeks, only discovered during an actual emergency when it was too late.

### Step 4: Write the Disaster Recovery Runbook

Under pressure is the worst time to figure out recovery steps. The runbook covers four scenarios with exact commands, estimated times, and verification queries:

```text
Create a disaster recovery runbook for our PostgreSQL database. Cover these scenarios: 1) accidental data deletion (restore specific tables from backup), 2) database corruption (full restore from latest backup), 3) point-in-time recovery (restore to a specific timestamp before an incident), 4) complete region failure (failover to cross-region replica). Include exact commands, estimated time per step, verification queries, and a stakeholder communication template.
```

Each scenario becomes a numbered playbook with copy-paste commands, checkpoints after each step, estimated duration, and a communication template for stakeholders. The point-in-time recovery playbook is the most valuable -- it covers the "someone ran a bad migration" scenario with a specific WAL-G recovery command that restores to an exact timestamp.

The runbook is not a document that sits in a wiki and never gets read. It includes a quarterly drill schedule -- the team restores from backup once a quarter to verify the runbook still works, to keep the recovery process fresh in everyone's memory, and to measure whether RTO has changed as the database grows. A 22-minute restore at 180 GB might become a 45-minute restore at 360 GB, and the team needs to know that before an emergency.

Each drill is recorded: who performed it, how long it took, what went wrong, and what was updated in the runbook afterward. Over time, the runbook improves from real experience rather than theoretical guesses.

### Step 5: Monitor the Backup System Itself

The original cron job failed silently for three weeks. The new system needs its own monitoring so the same failure mode cannot repeat:

- Backup job completion and failure alerts (PagerDuty for failures)
- Backup size trend monitoring (alert if size drops >20% -- indicates partial backup)
- Time since last successful verified backup (alert if over 26 hours)
- S3 storage usage and cost tracking
- Restore drill results dashboard

A CloudWatch dashboard shows all metrics at a glance. PagerDuty alerts fire on backup failures with high urgency. The "disk full for 3 weeks with nobody noticing" scenario is structurally impossible in the new setup -- S3 storage does not fill up, and failed backups page the on-call engineer immediately.

## Real-World Example

Three months later, a similar incident occurs. A database migration script drops the wrong column in production, deleting shipping addresses for 50,000 orders placed in the past month. The old team would have been looking at a 6-week-old backup and permanent data loss.

Instead, the on-call engineer opens the disaster recovery runbook, runs the point-in-time recovery playbook targeting 10 minutes before the migration, and restores the affected table in 18 minutes. Zero data loss. The stakeholder communication template goes out within 5 minutes of the incident starting, keeping the support team and customers informed.

The total setup took one day. The first incident it handled would have been a business-ending data loss event without it.

The quarterly drill schedule has paid off too. By the time the real incident hit, the on-call engineer had already practiced the point-in-time recovery procedure twice. There was no panic, no guesswork, no "let me Google how pg_restore works." Just open the runbook, follow the steps, and verify the result. Twenty-two minutes from incident to resolution -- exactly what the verification reports predicted.
