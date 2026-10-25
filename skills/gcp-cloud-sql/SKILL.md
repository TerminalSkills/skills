---
name: gcp-cloud-sql
description: |
  Provision and manage Cloud SQL instances on Google Cloud for MySQL,
  PostgreSQL, and SQL Server. Configure high availability, read replicas,
  automated backups, IAM database authentication, the Cloud SQL Auth Proxy,
  and Terraform deployments. Use for managed relational databases on GCP.
license: Apache-2.0
compatibility: 'gcloud-cli, terraform, cloud-sql-proxy, psql, mysql-client'
metadata:
  author: google-cloud
  version: 1.1.0
  category: devops
  tags: "gcp, cloud-sql, postgres, mysql, database"
---

# GCP Cloud SQL

## Overview

Cloud SQL is Google Cloud's managed relational database service for MySQL, PostgreSQL, and SQL Server. It handles patches, upgrades, replication, automated backups, point-in-time recovery, and HA failover so applications focus on schema and queries instead of database administration.

## Instructions

### Core Concepts

- **Instance** — a managed VM running MySQL/Postgres/SQL Server with attached storage
- **High Availability (HA)** — synchronous replica in another zone with automatic failover
- **Read replica** — async read-only copy for scaling reads or cross-region DR
- **Cloud SQL Auth Proxy** — local sidecar that handles IAM auth, TLS, and connection routing
- **Private IP** — instance reachable only via VPC peering, never the public internet
- **Point-in-time recovery (PITR)** — restore to any second within the retention window using binary logs

### Prerequisites

```bash
gcloud services enable sqladmin.googleapis.com servicenetworking.googleapis.com

# One-time: reserve a private range for VPC peering (for private IP instances)
gcloud compute addresses create google-managed-services-default \
  --global --purpose=VPC_PEERING --prefix-length=16 \
  --network=default

gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-default --network=default
```

### Creating a PostgreSQL Instance with HA

Editions matter: PostgreSQL 16 and later default to **Enterprise Plus**, which takes `--tier=db-perf-optimized-N-4`-style tiers and rejects `db-custom-*`. This guide pins `--edition=ENTERPRISE` so the `db-custom-<vCPUs>-<MB>` tiers work; for Enterprise Plus pass `--edition=ENTERPRISE_PLUS --tier=db-perf-optimized-N-4` instead (not available in every region).

```bash
gcloud sql instances create orders-db \
  --database-version=POSTGRES_17 \
  --edition=ENTERPRISE \
  --tier=db-custom-2-7680 \
  --region=us-central1 \
  --availability-type=REGIONAL \
  --network=default \
  --no-assign-ip \
  --backup-start-time=02:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=14 \
  --database-flags=cloudsql.iam_authentication=on,log_min_duration_statement=500
```

```bash
# Set the postgres password (or skip and use IAM auth exclusively)
gcloud sql users set-password postgres \
  --instance=orders-db \
  --password="$(openssl rand -base64 24)"

# Create application database and user
gcloud sql databases create orders --instance=orders-db
gcloud sql users create app_user --instance=orders-db --password="$(openssl rand -base64 24)"
```

### Creating a MySQL Instance

```bash
gcloud sql instances create analytics-db \
  --database-version=MYSQL_8_4 \
  --edition=ENTERPRISE \
  --tier=db-n1-standard-2 \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=100 \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --enable-bin-log
```

### Read Replicas

```bash
# Read replica in the same region (scale reads)
gcloud sql instances create orders-db-replica \
  --master-instance-name=orders-db \
  --region=us-central1 \
  --tier=db-custom-2-7680
```

```bash
# Cross-region replica (DR + low-latency reads in another region)
gcloud sql instances create orders-db-eu \
  --master-instance-name=orders-db \
  --region=europe-west1 \
  --tier=db-custom-2-7680
```

```bash
# Promote a replica to a standalone primary (DR failover)
gcloud sql instances promote-replica orders-db-eu
```

### Connecting via Cloud SQL Auth Proxy

```bash
# Get the connection name
gcloud sql instances describe orders-db --format="value(connectionName)"
# Returns: shop-prod-4821:us-central1:orders-db

# Install the proxy v2 (current release 2.26): brew install cloud-sql-proxy, or use the
# container image gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.26.2. If you download a
# binary instead, verify its checksum against the release page before running it.
# Run the proxy locally (use --private-ip for private-IP-only instances, from inside the VPC)
cloud-sql-proxy --port 5432 shop-prod-4821:us-central1:orders-db

# In another terminal:
psql "host=127.0.0.1 port=5432 user=app_user dbname=orders"
```

```yaml
# Cloud Run sidecar pattern (Cloud Run handles the proxy automatically with --add-cloudsql-instances)
# For GKE, deploy the proxy as a sidecar in the same pod:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      serviceAccountName: api-sa  # bound to the GSA app-sa, with roles/cloudsql.client and roles/cloudsql.instanceUser
      containers:
        - name: api
          image: gcr.io/shop-prod-4821/api:latest
          env:
            - name: DATABASE_URL
              value: "postgresql://app-sa%40shop-prod-4821.iam@127.0.0.1:5432/orders"
        - name: cloud-sql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.26.2
          args:
            - "--auto-iam-authn"
            - "--private-ip"
            - "shop-prod-4821:us-central1:orders-db"
          securityContext:
            runAsNonRoot: true
```

### IAM Database Authentication

```bash
# Add a service account as a Postgres database user
gcloud sql users create app-sa@shop-prod-4821.iam \
  --instance=orders-db \
  --type=cloud_iam_service_account
```

```sql
-- Grant database privileges (run as postgres superuser)
GRANT CONNECT ON DATABASE orders TO "app-sa@shop-prod-4821.iam";
GRANT USAGE ON SCHEMA public TO "app-sa@shop-prod-4821.iam";
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO "app-sa@shop-prod-4821.iam";
```

The application uses no static password — the proxy fetches a short-lived OAuth token from the metadata server and passes it as the database password.

### Backups and Point-in-Time Recovery

```bash
# Manual on-demand backup before risky migration
gcloud sql backups create --instance=orders-db --description="pre-v2-migration"
```

```bash
# Restore the database to a specific point in time (requires PITR enabled)
gcloud sql instances clone orders-db orders-db-recovery \
  --point-in-time='2026-04-15T14:30:00Z'
```

### Terraform

```hcl
resource "google_sql_database_instance" "orders" {
  name             = "orders-db"
  database_version = "POSTGRES_17"
  region           = "us-central1"
  deletion_protection = true

  settings {
    edition           = "ENTERPRISE"
    tier              = "db-custom-2-7680"
    availability_type = "REGIONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = data.google_compute_network.default.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      backup_retention_settings {
        retained_backups = 14
      }
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

resource "google_sql_user" "app_sa" {
  name     = "app-sa@${var.project_id}.iam"
  instance = google_sql_database_instance.orders.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
```

## Examples

### Example 1 — Migrate a self-hosted Postgres to Cloud SQL

User wants to move a 200 GB Postgres database to Cloud SQL with minimal downtime. Create a target instance with `--availability-type=REGIONAL` and PITR enabled, use Database Migration Service to perform a continuous logical replication from the source, run validation queries, then promote the destination during a short cutover window. Hand the user the new connection string via the Auth Proxy and a Terraform module for the instance.

### Example 2 — Add cross-region read replica for EU users

User reports high read latency from European users. Create a read replica in `europe-west1` with the same tier as primary, point the EU app instances at the replica's connection name through their Auth Proxy sidecars, and verify replication lag stays under 5 seconds via `gcloud sql operations` and Cloud Monitoring metrics.

## Guidelines

- Use **private IP only** in production — never expose Cloud SQL on a public IP
- Set the edition explicitly (`--edition`); a new PostgreSQL 16+ instance silently defaults to Enterprise Plus pricing and tiers
- Always set `availability-type=REGIONAL` for production workloads
- Enable PITR (`--enable-point-in-time-recovery`) — it's cheap insurance against accidental writes
- Prefer **IAM database authentication** over passwords — works for service accounts and human users
- Run the Cloud SQL Auth Proxy as a sidecar (Cloud Run, GKE) rather than embedding TLS logic in the app
- Pin database flags via Terraform so they survive instance recreation
- For schema migrations, take an on-demand backup first
- Monitor `cloudsql.googleapis.com/database/cpu/utilization` and connection count — alert at 80%
- Read replicas are async — never write to them and assume eventual consistency for reads from them
