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

Using the **db-backup**, **docker-helper**, and **cicd-pipeline** skills, this walkthrough audits the current backup situation, turns on RDS point-in-time recovery with a cross-region copy, adds a containerized daily logical dump, sets up automated verification that proves backups are restorable, and creates a disaster recovery runbook that anyone on the team can execute under pressure.

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
| Recent backups | Failed | Last 3 backups are 0 bytes (disk full for three weeks) |
| Point-in-time recovery | Missing | Automated RDS backups are off (retention 0), so no transaction-log archive exists |
| Restore procedure | Missing | No documentation exists |

**Current RPO: ~24 hours** (nightly dump only, no point-in-time recovery). Any data written between backups is gone if the database fails. A transaction at 1:00 PM would not be in the 2:00 AM backup, meaning up to 23 hours of data could be lost.

**Current RTO: Unknown** -- no restore has ever been tested. Nobody on the current team knows the exact steps. Under pressure, "unknown RTO" effectively means "hours of trial and error."

The critical issues are stacked. Backups live on the same server as the database, so a server failure takes out both. The last valid backup is 23 days old -- three weeks of data unprotected. There is no point-in-time recovery capability. And the most dangerous finding: the backup disk has been full for three weeks and nobody was alerted. The cron job ran, produced 0-byte files, and exited silently.

Target state: RPO of about 5 minutes (RDS uploads transaction logs to S3 every five minutes), RTO under 30 minutes (tested runbook).

### Step 2: Build Real Backup Infrastructure

RDS does not give you the WAL stream: there is no `archive_command` and no superuser, so WAL-G and `pg_basebackup` cannot archive an RDS instance. The managed equivalent is RDS automated backups, which snapshot the instance daily and upload transaction logs to S3 every five minutes. Logical dumps are added on top for table-level restores.

```text
Set up backups for our PostgreSQL 15 database on RDS (us-east-1). I need point-in-time recovery with the longest retention RDS allows, a copy of the automated backups in us-west-2, a daily compressed pg_dump in a containerized runner uploaded to a us-west-2 bucket with KMS encryption, and 7 daily, 4 weekly and 12 monthly dumps kept. Run it from a GitLab CI schedule.
```

**Layer 1: automated backups with point-in-time recovery.** Retention can be 1 to 35 days. The restorable window ends at `LatestRestorableTime`, normally about five minutes behind now. Replication of the backups to a second region is a separate switch, run against the destination region:

```bash
aws rds modify-db-instance --db-instance-identifier prod-db \
  --backup-retention-period 35 --apply-immediately

aws rds start-db-instance-automated-backups-replication --region us-west-2 \
  --source-db-instance-arn arn:aws:rds:us-east-1:123456789012:db:prod-db \
  --backup-retention-period 35 --kms-key-id "$DR_KMS_KEY_ARN"
```

Use a KMS key in the destination region (`--kms-key-id`, required if the instance is encrypted). Replication is supported for single-AZ and Multi-AZ instances, not for Multi-AZ DB clusters. Snapshots and logs are copied as they are produced, and cross-region transfer and storage are billed.

**Layer 2: a daily logical dump** for restoring a single table without rolling the whole instance back. The runner image needs `pg_dump` and the AWS CLI; the Debian bookworm base of the official `postgres:15` image ships both (the AWS CLI as the `awscli` package, version 2.9):

```dockerfile
FROM postgres:15-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends awscli \
    && rm -rf /var/lib/apt/lists/*
COPY backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
```

```bash
#!/bin/bash
# backup.sh: PGHOST, PGUSER, PGPASSWORD (or IAM auth), PGDATABASE and BUCKET come from the CI environment
set -euo pipefail
day=$(date -u +%Y%m%d)
tier=daily
[ "$(date -u +%u)" = 7 ] && tier=weekly          # Sundays
[ "$(date -u +%d)" = 01 ] && tier=monthly        # first of the month
# -Fc output is already compressed; do not gzip it again.
# A stream over 50 GB needs --expected-size (bytes, an upper bound is fine) or the upload fails
pg_dump -Fc --no-owner --no-acl | \
  aws s3 cp - "s3://$BUCKET/$tier/$day.dump" --region us-west-2 --sse aws:kms \
    --expected-size 107374182400
aws s3api head-object --bucket "$BUCKET" --key "$tier/$day.dump" --region us-west-2 \
  --query ContentLength --output text | awk '$1 < 1000000 { exit 1 }'   # fail on tiny files
```

The size check is what would have caught the 0-byte dumps. Because `set -o pipefail` is on, a failed `pg_dump` also fails the job.

**Layer 3: retention without a cleanup script.** S3 lifecycle rules expire each tier by prefix, so nothing fills a disk:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --region us-west-2 \
  --lifecycle-configuration '{"Rules":[
    {"ID":"daily","Status":"Enabled","Filter":{"Prefix":"daily/"},"Expiration":{"Days":7}},
    {"ID":"weekly","Status":"Enabled","Filter":{"Prefix":"weekly/"},"Expiration":{"Days":28}},
    {"ID":"monthly","Status":"Enabled","Filter":{"Prefix":"monthly/"},"Expiration":{"Days":365}}]}'
```

The **cicd-pipeline** skill covers GitLab CI. The job runs from a pipeline schedule (Build > Pipeline schedules) and builds on the **docker-helper** image above:

```yaml
backup:
  stage: deploy
  image:
    name: $CI_REGISTRY_IMAGE/db-backup:latest
    entrypoint: [""]
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - /usr/local/bin/backup.sh
```

Set `PGPASSWORD` and the AWS credentials as masked CI/CD variables (or use an OIDC role); never bake them into the image. A failed scheduled pipeline notifies its owner, and Step 5 adds a second alarm for the case where the schedule stops running at all.

### Step 3: Verify Backups Automatically

If you have never restored a backup, you do not have backups. You have files. A daily job proves that the point-in-time path works by restoring to a temporary instance:

```bash
id=verify-$(date -u +%Y%m%d)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db --target-db-instance-identifier "$id" \
  --use-latest-restorable-time --db-instance-class db.t3.medium \
  --no-multi-az --no-publicly-accessible \
  --db-subnet-group-name private-subnets --vpc-security-group-ids "$VERIFY_SG"
aws rds wait db-instance-available --db-instance-identifier "$id"
# compare row counts of the largest tables and the newest timestamp against prod with psql, then:
aws rds delete-db-instance --db-instance-identifier "$id" \
  --skip-final-snapshot --delete-automated-backups
```

A restore to a point in time always creates a new instance and leaves the source untouched. The restored instance starts with the default security group, subnet group and parameter group, so the flags above set the network ones explicitly; apply the production parameter group afterwards if your checks depend on it.

A verification report from the example team:

| Check | Result |
|-------|--------|
| Restore time | 22 minutes to the temporary instance |
| `users` row count | 2,847,291 (prod: 2,847,291), match |
| `orders` row count | 8,412,056 (prod: 8,412,103), delta of 47 explained by orders placed since the restore point |
| Latest transaction | within threshold |
| Temporary instance | deleted |

The example team measured an RTO of 22 minutes and an RPO of about five minutes against a 5-minute and 30-minute target. On day 3 the check also caught a dump whose upload was cut short, which a size-only check would have missed; the row counts did not match.

### Step 4: Write the Disaster Recovery Runbook

Under pressure is the worst time to figure out recovery steps. The runbook covers four scenarios with exact commands, estimated times and verification queries:

```text
Create a disaster recovery runbook for our RDS PostgreSQL database. Cover these scenarios: 1) accidental data deletion (restore specific tables from the logical dump or from a point-in-time restore), 2) corruption (restore a new instance from the latest automated backup), 3) point-in-time recovery to a timestamp before an incident, 4) region failure (restore from the replicated backups in us-west-2). Include exact commands, estimated time per step, verification queries, and a stakeholder communication template.
```

The point-in-time playbook is the most valuable. It restores a new instance to just before the incident, copies the damaged table back with `pg_dump -t` and `pg_restore`, then retires the temporary instance:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db --target-db-instance-identifier prod-db-recovery \
  --restore-time 2026-02-17T13:50:00Z --db-instance-class db.r6g.xlarge
```

For a regional failure, the same command run in us-west-2 takes `--source-db-instance-automated-backups-arn` (from `aws rds describe-db-instance-automated-backups --region us-west-2`) instead of the source identifier. The runbook also fixes a quarterly drill schedule: restore once a quarter, record who did it, how long it took and what the runbook got wrong. A 22-minute restore at 180 GB may be a longer one at 360 GB, and the team needs to know that before an emergency.

### Step 5: Monitor the Backup System Itself

The original cron job failed silently for three weeks. The new system needs its own monitoring:

- Failed scheduled pipelines and a CloudWatch alarm on RDS backup events
- Alert if the newest object under `daily/` is older than 26 hours or shrinks by more than 20% (a partial dump)
- Alert if `LatestRestorableTime` falls more than 30 minutes behind now
- A record of every restore drill

## Real-World Example

Three months later, a migration script drops the wrong column in production, deleting shipping addresses for 50,000 orders from the past month. The old team would have been looking at a 6-week-old backup and permanent data loss.

Instead, the on-call engineer opens the runbook and restores a new instance to ten minutes before the migration. Eighteen minutes later the column is copied back into production, the temporary instance is deleted, and the stakeholder message went out within five minutes of the incident starting. The engineer had practiced the procedure twice in quarterly drills, so there was no guesswork. The whole setup took the team one day.

## Related Skills

- **db-backup**: backup strategy, dumps, rotation and the runbook structure
- **docker-helper**: the containerized backup runner image
- **cicd-pipeline**: the scheduled GitLab CI job that runs and monitors it
