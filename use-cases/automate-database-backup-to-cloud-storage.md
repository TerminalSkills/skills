---
title: "Automate Database Backups to Cloud Storage"
slug: automate-database-backup-to-cloud-storage
description: "Set up automated, encrypted database backups with retention policies and S3-compatible storage to guarantee recovery from any data loss scenario."
skills:
  - db-backup
  - s3-storagecategory: devops
tags:
  - database
  - backups
  - s3
  - disaster-recovery
---

# Automate Database Backups to Cloud Storage

## The Problem

A SaaS company runs PostgreSQL and MongoDB databases serving 12,000 active users. Backups are a daily pg_dump triggered by a cron job that writes to the same server's /backups directory. If the server's disk fails, both the database and its backups are lost. Nobody has tested a restore in over a year. There is no backup for MongoDB at all -- the team assumed the managed provider handles it, but the retention policy only covers 24 hours.

## The Solution

Using the **db-backup** skill to configure automated, tested backup routines for both PostgreSQL and MongoDB, and the **s3-storage** skill to set up encrypted off-site storage with lifecycle policies that manage retention and cost automatically.

## Step-by-Step Walkthrough

### 1. Set up S3 storage with lifecycle policies

Create a bucket structure with encryption, versioning, and automatic tiering.

> Create an S3-compatible bucket for database backups. Enable server-side encryption with AES-256, bucket versioning, and set up lifecycle rules: keep daily backups for 30 days, move weekly backups to Glacier after 30 days and keep for 1 year, move monthly backups to Glacier Deep Archive and keep for 7 years. Block all public access and create an IAM policy scoped to this bucket only.

The lifecycle rules handle cost optimization automatically. A 2 GB daily backup costs $0.046/month in S3 Standard, drops to $0.008/month in Glacier after 30 days, and $0.002/month in Deep Archive. Over a year, this saves 85% compared to keeping everything in Standard.

### 2. Configure automated PostgreSQL backups

Set up pg_dump with compression, encryption, and upload to S3.

> Configure automated PostgreSQL backups for our production database (450 GB). Run a full pg_dump every night at 2 AM UTC, compress with gzip, encrypt with GPG using our backup key, and upload to the S3 bucket. Also set up WAL archiving for point-in-time recovery. Verify each backup by checking the file size against a minimum threshold and comparing row counts.

The backup script streams directly to S3 without writing to local disk:

```bash
#!/bin/bash
# backup-postgres.sh — runs nightly via cron at 02:00 UTC
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BUCKET="s3://acme-db-backups/postgres"
MIN_SIZE_MB=50000  # 50 GB minimum expected for 450 GB database

pg_dump --format=custom --compress=6 --jobs=4 \
  --dbname="$DATABASE_URL" \
  | gpg --encrypt --recipient backup@acme.com \
  | aws s3 cp - "${BUCKET}/full_${TIMESTAMP}.dump.gpg"

# Verify upload size
SIZE=$(aws s3 ls "${BUCKET}/full_${TIMESTAMP}.dump.gpg" | awk '{print $3}')
SIZE_MB=$((SIZE / 1048576))

if [ "$SIZE_MB" -lt "$MIN_SIZE_MB" ]; then
  echo "ALERT: Backup is ${SIZE_MB}MB, expected at least ${MIN_SIZE_MB}MB"
  curl -X POST "$SLACK_WEBHOOK" -d '{"text":"Backup size anomaly detected"}'
  exit 1
fi

echo "Backup complete: ${SIZE_MB}MB uploaded to ${BUCKET}/full_${TIMESTAMP}.dump.gpg"
```

The WAL archiving runs continuously alongside the nightly dumps, enabling recovery to any point in time, not just the nightly snapshot.

### 3. Add MongoDB backup automation

Set up mongodump with oplog replay capability.

> Add automated MongoDB backups for our analytics database (120 GB, replica set). Use mongodump with oplog capture for consistent point-in-time snapshots. Run every 6 hours, compress, encrypt, and upload to the same S3 bucket under a mongodb/ prefix. Include the oplog for replay capability during restores.

MongoDB backups run four times daily because the analytics database changes rapidly. The oplog capture ensures the backup is consistent even while writes are happening, and enables replaying operations up to any specific timestamp during recovery.

### 4. Automate restore testing

Verify backups actually work by restoring to a test database weekly.

> Create a weekly automated restore test. Every Sunday at 6 AM, download the latest PostgreSQL backup from S3, decrypt it, restore it to a test database instance, run 5 validation queries (total row counts for users, orders, payments, products, sessions), compare against production counts, and send a Slack report with pass/fail status. If the restore fails or counts differ by more than 1%, alert the on-call engineer.

Untested backups are not backups. The weekly restore test catches a corruption issue in the third week -- a pg_dump flag change had produced valid-looking files that failed during restore. Without the automated test, this would have been discovered only during an actual emergency.

## Real-World Example

Nadia's team discovers their backup strategy has two critical gaps: backups stored on the same disk as the database, and no MongoDB backups at all. She sets up encrypted off-site backups to S3 with lifecycle policies that keep costs under $15/month for 450 GB of PostgreSQL and 120 GB of MongoDB data. The automated restore test catches a silent backup corruption three weeks in. When a developer accidentally deletes a production table six months later, the team restores from the nightly backup and replays WAL logs to recover everything up to 30 seconds before the deletion. Total downtime: 22 minutes.

## Tips

- Store backups in a different cloud region than your database. A regional outage that takes down both your database and its backups defeats the purpose.
- Test restores every week, not every quarter. Automated restore tests cost pennies in compute and catch corruption that sits silently for months.
- Use `--format=custom` with pg_dump for parallel restore capability. A 450 GB database restores in 45 minutes with 4 parallel jobs versus 3 hours with a single-threaded SQL dump.
- Set a minimum file size threshold on every backup. A 0-byte or suspiciously small backup is worse than no backup because it creates a false sense of security.
