---
name: aws-rds
description: |
  Manage Amazon RDS for fully managed relational databases. Provision MySQL,
  PostgreSQL, and Aurora instances with automated backups and patching. Configure
  read replicas for scaling, snapshots for recovery, and Aurora Serverless for
  variable workloads.
license: Apache-2.0
compatibility:
  - aws-cli
  - boto3
  - terraform
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud-services
  tags:
    - aws
    - rds
    - database
    - aurora
    - postgresql
---

# AWS RDS

Amazon Relational Database Service (RDS) takes care of provisioning, patching, backups, and failover for relational databases. Supports MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, and Amazon Aurora.

## Core Concepts

- **DB Instance** — an isolated database environment in the cloud
- **Multi-AZ** — synchronous standby replica in another AZ for high availability
- **Read Replica** — asynchronous copy for read scaling
- **Parameter Group** — engine configuration settings
- **Subnet Group** — defines which subnets RDS can use
- **Aurora** — AWS-native engine, MySQL/PostgreSQL compatible, 5x faster

## Provisioning a Database

```bash
# Create a DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name app-db-subnets \
  --db-subnet-group-description "Private subnets for RDS" \
  --subnet-ids subnet-aaa subnet-bbb subnet-ccc
```

```bash
# Launch a PostgreSQL instance with Multi-AZ
aws rds create-db-instance \
  --db-instance-identifier app-db-prod \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 15.4 \
  --master-username appuser \
  --master-user-password "$(aws secretsmanager get-random-password --password-length 32 --query RandomPassword --output text)" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --multi-az \
  --db-subnet-group-name app-db-subnets \
  --vpc-security-group-ids sg-0123456789abcdef0 \
  --backup-retention-period 14 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:05:00-sun:06:00" \
  --storage-encrypted \
  --tags Key=Env,Value=prod
```

## Aurora Cluster

```bash
# Create an Aurora PostgreSQL cluster
aws rds create-db-cluster \
  --db-cluster-identifier app-aurora-prod \
  --engine aurora-postgresql \
  --engine-version 15.4 \
  --master-username appuser \
  --master-user-password "$DB_PASSWORD" \
  --db-subnet-group-name app-db-subnets \
  --vpc-security-group-ids sg-0123456789abcdef0 \
  --backup-retention-period 14 \
  --storage-encrypted \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=16
```

```bash
# Add writer and reader instances to the cluster
aws rds create-db-instance \
  --db-instance-identifier app-aurora-writer \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier app-aurora-prod

aws rds create-db-instance \
  --db-instance-identifier app-aurora-reader \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier app-aurora-prod
```

## Read Replicas

```bash
# Create a read replica in same region
aws rds create-db-instance-read-replica \
  --db-instance-identifier app-db-read-1 \
  --source-db-instance-identifier app-db-prod \
  --db-instance-class db.r6g.large
```

```bash
# Create cross-region read replica for DR
aws rds create-db-instance-read-replica \
  --db-instance-identifier app-db-read-eu \
  --source-db-instance-identifier arn:aws:rds:us-east-1:123456789:db:app-db-prod \
  --db-instance-class db.r6g.large \
  --region eu-west-1
```

```bash
# Promote replica to standalone (for migration or DR)
aws rds promote-read-replica --db-instance-identifier app-db-read-eu
```

## Snapshots and Recovery

```bash
# Create a manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier app-db-prod \
  --db-snapshot-identifier app-db-pre-migration-$(date +%Y%m%d)
```

```bash
# Restore from snapshot (creates a new instance)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier app-db-restored \
  --db-snapshot-identifier app-db-pre-migration-20240115 \
  --db-instance-class db.r6g.large \
  --db-subnet-group-name app-db-subnets \
  --vpc-security-group-ids sg-0123456789abcdef0
```

```bash
# Point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier app-db-prod \
  --target-db-instance-identifier app-db-pitr \
  --restore-time "2024-01-15T10:30:00Z" \
  --db-instance-class db.r6g.large
```

```bash
# List automated snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier app-db-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

## Parameter Groups

```bash
# Create custom parameter group
aws rds create-db-parameter-group \
  --db-parameter-group-name app-postgres15 \
  --db-parameter-group-family postgres15 \
  --description "Custom params for app"
```

```bash
# Tune parameters for performance
aws rds modify-db-parameter-group \
  --db-parameter-group-name app-postgres15 \
  --parameters \
    "ParameterName=shared_buffers,ParameterValue={DBInstanceClassMemory/4},ApplyMethod=pending-reboot" \
    "ParameterName=max_connections,ParameterValue=200,ApplyMethod=pending-reboot" \
    "ParameterName=log_min_duration_statement,ParameterValue=1000,ApplyMethod=immediate"
```

## Monitoring

```bash
# Enable Performance Insights
aws rds modify-db-instance \
  --db-instance-identifier app-db-prod \
  --enable-performance-insights \
  --performance-insights-retention-period 7
```

```bash
# Check instance status and endpoints
aws rds describe-db-instances \
  --db-instance-identifier app-db-prod \
  --query 'DBInstances[0].[Endpoint.Address,DBInstanceStatus,AllocatedStorage,MultiAZ]' \
  --output table
```

## Best Practices

- Always enable Multi-AZ for production databases
- Use Aurora Serverless v2 for unpredictable workloads
- Store credentials in AWS Secrets Manager with automatic rotation
- Set backup retention to at least 7 days; test restores periodically
- Use read replicas to offload reporting and analytics queries
- Enable Performance Insights and Enhanced Monitoring
- Use parameter groups to tune engine settings per workload
- Place RDS in private subnets; never expose to the public internet
