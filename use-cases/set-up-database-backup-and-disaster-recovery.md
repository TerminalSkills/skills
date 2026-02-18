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

Your production database holds everything — user data, transactions, years of business history. But your backup strategy is a cron job someone wrote two years ago that nobody has tested. When a junior engineer accidentally runs a DELETE without a WHERE clause on the orders table, you discover the backups have been silently failing for three weeks because the disk filled up. Even when backups exist, nobody knows the exact steps to restore, and the one person who set it up left the company. The difference between a 30-minute recovery and a company-ending data loss event comes down to whether you invested a day in proper backup infrastructure.

## The Solution

Use the **db-backup** skill to implement automated backup schedules with verification, the **docker-helper** skill to containerize backup and restore tooling, and the **cicd-pipeline** skill to integrate backup verification into your CI workflow.

```bash
npx terminal-skills install db-backup docker-helper cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Assess your current backup situation

Start by understanding what you have and what you need:

```text
Audit my current database backup setup. I have a PostgreSQL 15 database (180GB) running on an AWS RDS instance. There's a cron job in /etc/cron.d/db-backup that runs pg_dump nightly. Check the backup script, verify recent backups exist and are valid, and identify gaps in our disaster recovery readiness. Also tell me our current RPO and RTO.
```

The agent examines the setup and reports:

```text
Backup Audit Results:

Current setup:
  ✗ pg_dump runs at 02:00 UTC via cron
  ✗ Dumps stored locally at /backups/ (same server as database)
  ✗ No encryption, no compression
  ✗ No backup verification — last 3 backups are 0 bytes (disk full since Jan 28)
  ✗ No WAL archiving — only nightly full dumps
  ✗ No documented restore procedure

Current RPO: ~24 hours (nightly dump only, no WAL archiving)
Current RTO: Unknown — no restore has ever been tested

Critical issues:
  1. Backups on same server as database — useless if server fails
  2. Last valid backup is 23 days old
  3. No point-in-time recovery capability
  4. No one can restore without researching the process

Recommended target: RPO < 5 minutes (WAL archiving), RTO < 30 minutes (tested runbook)
```

### 2. Implement a proper backup strategy

Now build the real backup infrastructure:

```text
Set up a comprehensive backup strategy for our PostgreSQL 15 database on RDS. I need: continuous WAL archiving to S3 for point-in-time recovery (RPO < 5 minutes), daily full backups with compression and encryption uploaded to S3 in a different region (us-west-2, database is in us-east-1), backup rotation keeping 7 daily, 4 weekly, and 12 monthly backups, and automated cleanup of expired backups. Use a containerized backup runner so it's portable. Store the encryption key in AWS Secrets Manager.
```

The agent generates a complete backup system: a Docker container with pg_basebackup and WAL-G configured for S3 streaming, a rotation policy script, and AWS infrastructure setup with cross-region replication.

### 3. Add automated backup verification

Backups you have not restored are just hopes:

```text
Create an automated backup verification job that runs daily after the backup completes. It should: download the latest backup from S3, restore it to a temporary RDS instance (db.t3.medium), run integrity checks comparing row counts of the 10 largest tables against production, verify that the most recent transaction timestamp is within 24 hours, then tear down the temporary instance. Send a Slack notification with results. If verification fails, page the on-call engineer.
```

The agent produces a verification script:

```text
Backup Verification Report — Feb 17, 2026

  ✓ Backup downloaded: 18.2 GB compressed (180 GB uncompressed)
  ✓ Restore completed in 22 minutes to temp instance
  ✓ Table row counts match production (10/10 tables verified)
    users:         2,847,291 (prod: 2,847,291) ✓
    orders:        8,412,056 (prod: 8,412,103) ✓ (delta: 47, within 24h window)
    transactions: 14,209,881 (prod: 14,210,002) ✓
    ...
  ✓ Latest transaction: 2026-02-17 01:58:42 UTC (within 24h threshold)
  ✓ Temporary instance terminated

Status: ALL CHECKS PASSED
Verified RPO: 4 hours 12 minutes (time since last full backup)
Verified RTO: 22 minutes (restore time)
```

### 4. Create a disaster recovery runbook

Document exact recovery steps so anyone on the team can execute under pressure:

```text
Create a disaster recovery runbook for our PostgreSQL database. Cover these scenarios: 1) accidental data deletion (restore specific tables from backup), 2) database corruption (full restore from latest backup), 3) point-in-time recovery (restore to a specific timestamp before an incident), 4) complete region failure (failover to cross-region replica). Include exact commands, estimated time per step, verification queries, and a stakeholder communication template.
```

The agent produces a detailed runbook with four scenario playbooks, each with numbered steps, commands to copy-paste, checkpoints, and estimated durations.

### 5. Integrate backup monitoring into your infrastructure

```text
Set up monitoring and alerting for the backup system. Track: backup job completion/failure, backup size trend (alert if size drops more than 20% — indicates partial backup), time since last successful verified backup (alert if over 26 hours), S3 storage usage and costs, and restore drill results. Create a CloudWatch dashboard with these metrics and PagerDuty alerts for failures.
```

## Real-World Example

A backend lead at a growing e-commerce company gets a panicked message from support: a database migration script dropped the wrong column in production, deleting shipping addresses for 50,000 orders placed in the last month. The team's "backup" is a weekly pg_dump that nobody has tested.

1. They ask the agent to audit their backup setup — it reveals the weekly dump has been silently failing, and the last valid backup is 6 weeks old
2. The agent sets up WAL-G continuous archiving to S3 with cross-region replication, achieving a 5-minute RPO
3. Automated daily verification catches a backup corruption issue on day 3, before it would have gone unnoticed for weeks
4. A disaster recovery runbook with four scenario playbooks means any team member can execute a restore — they practice with a drill and achieve a 25-minute RTO
5. Three months later, when a similar migration issue occurs, they restore the affected table from a point-in-time backup in 18 minutes with zero data loss

The total setup took one day. It prevented what could have been a business-ending data loss.
