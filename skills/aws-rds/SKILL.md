---
name: aws-rds
description: >-
  Amazon RDS is AWS's managed relational database service: it provisions MySQL, PostgreSQL, MariaDB, Oracle, SQL Server and Aurora databases and handles backups, patching and failover. Use this skill with the AWS CLI to create a Multi-AZ instance, an Aurora Serverless v2 cluster, read replicas, snapshots and point-in-time restores, parameter groups, and Secrets Manager-managed passwords, or when the user asks how to set up, back up, scale or monitor a database on RDS.
license: Apache-2.0
compatibility: 'aws-cli v2, boto3, terraform'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "aws, rds, database, aurora, postgresql"
---

# AWS RDS

## Overview

Amazon Relational Database Service (RDS) runs MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, Db2 and Aurora (MySQL- and PostgreSQL-compatible) for you: provisioning, patching, backups and failover. This skill covers the AWS CLI flow. All flags below were checked against the AWS CLI RDS reference (botocore 1.43); the commands were not run against a live account (flag parsing only), so try them in a sandbox account first.

Core terms: a **DB instance** is one database server; **Multi-AZ** keeps a synchronous standby in another Availability Zone; a **read replica** is an asynchronous copy for read scaling or DR; a **DB subnet group** lists the subnets RDS may use; a **parameter group** holds engine settings; an **Aurora cluster** has one writer and up to 15 readers on shared storage.

## Instructions

1. Pick an engine version that RDS currently supports rather than copying one from a tutorial. List the default and available versions:
   ```bash
   aws rds describe-db-engine-versions --engine postgres --default-only \
     --query 'DBEngineVersions[].EngineVersion' --output text
   ```
   Check the RDS release calendar for end-of-standard-support dates; running past them triggers paid Extended Support (PostgreSQL 14 ends standard support on 2027-02-28, 15 on 2028-02-29, 16 on 2029-02-28, 17 on 2030-02-28).
2. Create a DB subnet group from private subnets in at least two AZs, then the instance or cluster with `--no-publicly-accessible`, `--storage-encrypted`, `--deletion-protection` and a backup retention of 7 days or more.
3. Let RDS own the master password with `--manage-master-user-password`; it stores and rotates the secret in Secrets Manager (`--master-user-secret-kms-key-id` picks the key). It cannot be combined with `--master-user-password`. Read the secret ARN from `MasterUserSecret.SecretArn` in `describe-db-instances`.
4. Restore operations always create a new instance; point the application at the new endpoint, never overwrite the old one.
5. Parameter changes: `ApplyMethod=immediate` works only for dynamic parameters; static ones need `pending-reboot` and a reboot.

## Examples

### Production PostgreSQL instance with Multi-AZ

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name orders-db-subnets \
  --db-subnet-group-description "Private subnets for the orders database" \
  --subnet-ids subnet-0a1b2c3d4e5f60001 subnet-0a1b2c3d4e5f60002

aws rds create-db-instance \
  --db-instance-identifier orders-db-prod \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --master-username orders_admin \
  --manage-master-user-password \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az --no-publicly-accessible \
  --db-subnet-group-name orders-db-subnets \
  --vpc-security-group-ids sg-0123456789abcdef0 \
  --backup-retention-period 14 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:05:00-sun:06:00" \
  --storage-encrypted --deletion-protection \
  --tags Key=Env,Value=prod
```

Omitting `--engine-version` uses the current default; pin it (from step 1) when you need reproducible builds. Wait for `available` with `aws rds wait db-instance-available --db-instance-identifier orders-db-prod`.

### Aurora PostgreSQL Serverless v2 cluster

```bash
aws rds create-db-cluster \
  --db-cluster-identifier orders-aurora-prod \
  --engine aurora-postgresql \
  --master-username orders_admin --manage-master-user-password \
  --db-subnet-group-name orders-db-subnets \
  --vpc-security-group-ids sg-0123456789abcdef0 \
  --backup-retention-period 14 --storage-encrypted --deletion-protection \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16

aws rds create-db-instance --db-instance-identifier orders-aurora-writer \
  --db-instance-class db.serverless --engine aurora-postgresql \
  --db-cluster-identifier orders-aurora-prod
```

Add a second `db.serverless` instance in the same cluster as a reader. For dev clusters set `MinCapacity=0,SecondsUntilAutoPause=900` (5 minutes to 1 day); the instance pauses with no connections and resumes on the next one, at the cost of a slow first connection. Auto-pause needs an Aurora engine version that supports a minimum of 0 ACUs.

### Replicas, snapshots and recovery

```bash
# Same-region read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier orders-db-read-1 \
  --source-db-instance-identifier orders-db-prod

# Cross-region replica for DR (run against the destination region; an encrypted source needs --source-region
# so the CLI builds the presigned URL, and a KMS key in the destination region)
aws rds create-db-instance-read-replica --region eu-west-1 --source-region us-east-1 \
  --db-instance-identifier orders-db-read-eu \
  --source-db-instance-identifier arn:aws:rds:us-east-1:111122223333:db:orders-db-prod \
  --kms-key-id alias/aws/rds \
  --db-subnet-group-name orders-db-subnets-eu   # a subnet group you created in eu-west-1; without one the replica is created outside any VPC

# Promote a replica to a standalone instance (irreversible)
aws rds promote-read-replica --db-instance-identifier orders-db-read-eu

# Manual snapshot, then restore it to a NEW instance
aws rds create-db-snapshot --db-instance-identifier orders-db-prod \
  --db-snapshot-identifier orders-db-pre-migration-20261024
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier orders-db-restored \
  --db-snapshot-identifier orders-db-pre-migration-20261024 \
  --db-subnet-group-name orders-db-subnets --vpc-security-group-ids sg-0123456789abcdef0

# Point-in-time recovery (or --use-latest-restorable-time)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier orders-db-prod \
  --target-db-instance-identifier orders-db-pitr \
  --restore-time "2026-10-24T10:30:00Z"
```

### Parameter group and monitoring

```bash
aws rds create-db-parameter-group --db-parameter-group-name orders-postgres \
  --db-parameter-group-family postgres17 --description "Orders database settings"
aws rds modify-db-parameter-group --db-parameter-group-name orders-postgres \
  --parameters "ParameterName=log_min_duration_statement,ParameterValue=1000,ApplyMethod=immediate" \
               "ParameterName=idle_in_transaction_session_timeout,ParameterValue=600000,ApplyMethod=immediate"
aws rds modify-db-instance --db-instance-identifier orders-db-prod \
  --db-parameter-group-name orders-postgres --apply-immediately

aws rds describe-db-instances --db-instance-identifier orders-db-prod \
  --query 'DBInstances[0].[Endpoint.Address,DBInstanceStatus,AllocatedStorage,MultiAZ]' --output table
```

Check the family name against your engine version (`postgres17`, `postgres16`, ...). Do not set `shared_buffers` by hand: its default formula is already tuned, and its unit is 8 KB pages, so byte-based values go badly wrong.

## Guidelines

- Passwords: do not generate them with `secretsmanager get-random-password` and pass them on the command line; RDS rejects `/`, `"` and `@` in master passwords and the value ends up in shell history. Use `--manage-master-user-password`.
- Monitoring: RDS Performance Insights has been folded into CloudWatch Database Insights, which is enabled in Standard mode by default (`--database-insights-mode standard|advanced` on create/modify). `--enable-performance-insights` and `--performance-insights-retention-period` still work. Advanced mode and Enhanced Monitoring (`--monitoring-interval`, needs an IAM role) cost extra.
- Keep databases in private subnets; allow only the application's security group on the DB port.
- Multi-AZ is for availability, not for read scaling; read replicas are asynchronous and can lag.
- Automated backups are deleted with the instance unless you take a final snapshot; `--deletion-protection` prevents accidents. Test a restore regularly.
- Cross-region replicas and snapshot copies of encrypted data need a KMS key in the destination region.
- Aurora Serverless v2 bills per ACU-hour while running; set `MaxCapacity` to cap spend.
