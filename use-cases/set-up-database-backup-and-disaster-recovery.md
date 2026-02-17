---
title: "Set Up Database Backup and Disaster Recovery with AI"
slug: set-up-database-backup-and-disaster-recovery
description: "Implement automated database backups with tested recovery procedures, retention policies, and point-in-time restore capabilities."
skills: [db-backup, security-audit]
category: devops
tags: [database, backup, disaster-recovery, postgresql, automation]
---

# Set Up Database Backup and Disaster Recovery with AI

## The Problem

Your PostgreSQL database holds 3 years of customer data, financial transactions, and application state. Your current "backup strategy" is whatever your cloud provider does by default — daily snapshots you've never tested restoring. You don't know your Recovery Point Objective (how much data you can afford to lose) or your Recovery Time Objective (how long the application can be down). When a developer accidentally runs a migration that drops a column in production, you discover your backups are stored in the same region as your database, the restore process isn't documented, and nobody has ever tested whether the backups actually work.

## The Solution

Use the **db-backup** skill to implement automated backups with verified restore procedures, and the **security-audit** skill to validate backup security and access controls. Install both:

```bash
npx terminal-skills install db-backup security-audit
```

## Step-by-Step Walkthrough

### 1. Assess current state and define recovery objectives

```
Review my database infrastructure: PostgreSQL 15 on a managed cloud instance, approximately 80 GB of data, ~500 transactions per minute during peak hours. Help me define appropriate RPO and RTO targets based on our use case (a B2B SaaS platform handling customer project data and billing). Also audit what backup mechanisms are currently active from the cloud provider.
```

The agent evaluates the setup and recommends:

```
Recovery Objectives:
- RPO (Recovery Point Objective): 1 hour — maximum acceptable data loss
- RTO (Recovery Time Objective): 30 minutes — maximum acceptable downtime

Current State:
- Cloud provider: daily automated snapshots at 03:00 UTC (RPO = 24 hours!)
- No WAL archiving configured
- No cross-region backup copies
- Restore process: undocumented, never tested

Gap: Current 24-hour RPO is 24x worse than the recommended 1-hour target.
```

### 2. Implement automated backup pipeline

```
Set up a backup pipeline for our PostgreSQL database with three tiers: continuous WAL archiving to S3 for point-in-time recovery (meets 1-hour RPO), daily logical backups using pg_dump with custom format for selective restores, and weekly full base backups using pg_basebackup. Store all backups in a different region with encryption at rest. Include a retention policy: WAL segments for 7 days, daily dumps for 30 days, weekly base backups for 90 days.
```

The agent generates backup scripts, cron configurations, and S3 lifecycle policies. Each backup is encrypted with AES-256 using a key stored in the cloud provider's key management service.

### 3. Create restore procedures and runbooks

```
Write detailed restore runbooks for three scenarios: (1) point-in-time recovery to undo an accidental data deletion from 2 hours ago, (2) full database restore from the latest daily backup after a catastrophic failure, and (3) selective table restore from a logical backup when only one table is corrupted. Each runbook should have exact commands, estimated completion time, verification steps, and a rollback plan if the restore itself fails.
```

The agent produces three runbooks with step-by-step commands, including connection strings with placeholder credentials, expected output at each step, and post-restore verification queries that check row counts and data integrity.

### 4. Automate backup verification

```
Create an automated backup verification job that runs daily: restore the latest backup to an isolated test database instance, run data integrity checks (row counts for critical tables, checksum of recent transactions, schema comparison against production), and send an alert if verification fails. The test instance should automatically terminate after verification to control costs.
```

### 5. Security audit for backup infrastructure

```
Run a security audit on the backup system. Check: Are backups encrypted at rest and in transit? Who has access to the backup S3 bucket (IAM policy review)? Are backup credentials rotated? Is the KMS key access logged? Can a compromised application server access or delete backups? Implement fixes for any issues found.
```

The agent identifies that the application's IAM role has `s3:DeleteObject` permission on the backup bucket and recommends a separate backup IAM role with Object Lock enabled to prevent ransomware-style deletion.

## Real-World Example

A CTO at a 30-person B2B SaaS company wakes up to a Slack alert: a developer ran an unreviewed migration in production that truncated the `invoices` table — 18 months of billing data, gone. Their cloud provider's daily snapshot is from 22 hours ago, meaning they'd lose a full day of data across all tables, not just invoices.

1. They ask the agent to assess their backup gap — the 24-hour RPO is immediately flagged as dangerous for financial data
2. The agent sets up continuous WAL archiving, achieving a 5-minute actual RPO
3. Three runbooks are generated: the point-in-time recovery runbook lets them restore just the `invoices` table to 10 minutes before the bad migration
4. Automated daily verification catches a corrupted backup file 3 weeks later — the backup cron had silently started failing due to a disk space issue
5. The security audit adds Object Lock to prevent backup deletion and separates backup credentials from application credentials

The invoice table is restored in 22 minutes with zero data loss. The CTO mandates monthly restore drills, which the verification automation handles without manual effort.

## Related Skills

- [security-audit](../skills/security-audit/) — Validates backup encryption and access controls
- [docker-helper](../skills/docker-helper/) — Containerizes backup scripts for consistent execution
