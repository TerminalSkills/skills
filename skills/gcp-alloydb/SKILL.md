---
name: gcp-alloydb
description: |
  Provision and manage AlloyDB for PostgreSQL clusters and instances on Google
  Cloud — a managed, PostgreSQL-compatible database with disaggregated
  compute/storage, columnar engine, and AlloyDB AI for vector search and
  natural-language queries. Use for HA clusters, read pools, IAM database auth,
  and Terraform-managed AlloyDB deployments.
license: Apache-2.0
compatibility: 'gcloud-cli, terraform, psql, AlloyDB Auth Proxy'
metadata:
  author: google-cloud
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - alloydb
    - postgres
    - database
    - vector-search
---

# GCP AlloyDB

## Overview

AlloyDB is Google Cloud's managed PostgreSQL-compatible database. It separates compute and storage so they scale independently, runs an analytics-grade columnar engine alongside the transactional rows, and ships with AlloyDB AI — vector search, hybrid search, and model-endpoint management for building RAG and semantic-search apps directly against the database.

## Instructions

### Core Concepts

- **Cluster** — the top-level resource that owns storage, backups, and configuration shared across instances
- **Primary instance** — the read/write instance; one per cluster
- **Read pool instance** — horizontally scalable read replicas backed by the same storage
- **Secondary cluster** — cross-region replica for DR
- **Continuous backup** — point-in-time recovery within the recovery window (default 14 days)
- **AlloyDB AI** — native `vector` extension, `google_ml_integration` for inference, hybrid search

### Prerequisites

```bash
# Enable APIs
gcloud services enable alloydb.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com

# Reserve a private IP range for VPC peering (one-time per VPC)
gcloud compute addresses create alloydb-peering \
  --global --purpose=VPC_PEERING --prefix-length=16 \
  --network=default

gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=alloydb-peering --network=default
```

### Creating a Cluster and Primary Instance

```bash
# Create a cluster (storage + config; no compute yet)
gcloud alloydb clusters create prod-cluster \
  --region=us-central1 \
  --network=default \
  --password="$(openssl rand -base64 24)" \
  --automated-backup-days-of-week=MONDAY,THURSDAY \
  --automated-backup-start-times=02:00 \
  --automated-backup-retention-count=14
```

```bash
# Create the primary instance (the actual compute)
gcloud alloydb instances create prod-primary \
  --cluster=prod-cluster \
  --region=us-central1 \
  --instance-type=PRIMARY \
  --cpu-count=4 \
  --availability-type=REGIONAL \
  --database-flags="cloudsql.iam_authentication=on,alloydb.enable_pgvector=on"
```

For production, prefer **IAM database authentication** over password auth — it removes static credentials entirely and integrates with service accounts.

### Read Pool for Scaling Reads

```bash
# Add a read pool (e.g., for analytics or reporting traffic)
gcloud alloydb instances create reports-pool \
  --cluster=prod-cluster \
  --region=us-central1 \
  --instance-type=READ_POOL \
  --read-pool-node-count=3 \
  --cpu-count=4
```

### Connecting from an Application

```bash
# Run the Auth Proxy locally (handles IAM + TLS)
./alloydb-auth-proxy \
  projects/my-project/locations/us-central1/clusters/prod-cluster/instances/prod-primary \
  --port 5432
```

```python
# Python connection using the AlloyDB connector + IAM auth
from google.cloud.alloydb.connector import Connector, IPTypes
import sqlalchemy

connector = Connector()

def getconn():
    return connector.connect(
        "projects/my-project/locations/us-central1/clusters/prod-cluster/instances/prod-primary",
        "pg8000",
        user="app-sa@my-project.iam",
        db="orders",
        enable_iam_auth=True,
        ip_type=IPTypes.PRIVATE,
    )

engine = sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn)

with engine.connect() as conn:
    result = conn.execute(sqlalchemy.text("SELECT current_database(), version()"))
    print(result.fetchone())
```

### AlloyDB AI — Vector Search

```sql
-- Enable extensions (once per database, run as superuser)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS google_ml_integration;

-- Schema with embeddings
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding vector(768)
);

-- Generate embeddings inline using a registered model endpoint
UPDATE products
SET embedding = embedding('textembedding-gecko@003', description)
WHERE embedding IS NULL;

-- ScaNN index for fast approximate nearest-neighbor search
CREATE INDEX ON products USING scann (embedding cosine)
WITH (num_leaves = 100);

-- Hybrid search: semantic + lexical
SELECT id, name, description,
       1 - (embedding <=> embedding('textembedding-gecko@003', 'wireless headphones with noise cancellation')) AS similarity
FROM products
WHERE description ILIKE '%bluetooth%'
ORDER BY embedding <=> embedding('textembedding-gecko@003', 'wireless headphones with noise cancellation')
LIMIT 10;
```

### Cross-Region DR with Secondary Cluster

```bash
# Promote a secondary cluster in a different region
gcloud alloydb clusters create-secondary dr-cluster \
  --region=us-east1 \
  --primary-cluster=projects/my-project/locations/us-central1/clusters/prod-cluster \
  --network=default
```

```bash
# Failover (promote secondary to standalone primary)
gcloud alloydb clusters promote dr-cluster --region=us-east1
```

### Terraform

```hcl
resource "google_alloydb_cluster" "prod" {
  cluster_id = "prod-cluster"
  location   = "us-central1"
  network_config {
    network = data.google_compute_network.default.id
  }

  initial_user {
    user     = "postgres"
    password = var.alloydb_password
  }

  automated_backup_policy {
    location      = "us-central1"
    backup_window = "1800s"
    enabled       = true
    weekly_schedule {
      days_of_week = ["MONDAY", "THURSDAY"]
      start_times { hours = 2 }
    }
    quantity_based_retention { count = 14 }
  }
}

resource "google_alloydb_instance" "primary" {
  cluster       = google_alloydb_cluster.prod.name
  instance_id   = "prod-primary"
  instance_type = "PRIMARY"

  machine_config { cpu_count = 4 }
  availability_type = "REGIONAL"

  database_flags = {
    "alloydb.enable_pgvector" = "on"
    "cloudsql.iam_authentication" = "on"
  }
}
```
## Examples

### Example 1 — Set up a production cluster with read replicas

User asks for a production-ready AlloyDB deployment. Create the cluster with regional availability, configure automated backups with 14-day retention, provision a primary instance with IAM auth enabled, then add a 3-node read pool sized for the analytics workload. Hand the user the Auth Proxy connection string and a Terraform module they can commit.

### Example 2 — Add semantic search to an existing PostgreSQL app

User has a products table on AlloyDB and wants vector search. Enable `vector` and `google_ml_integration` extensions, add an `embedding vector(768)` column, backfill embeddings using `embedding('textembedding-gecko@003', description)`, create a ScaNN index, and rewrite the search endpoint to combine cosine distance with existing `WHERE` filters for hybrid retrieval.

## Guidelines

- Use **IAM database authentication** in production — service accounts authenticate to the database without storing passwords
- Set `availability-type=REGIONAL` for HA; `ZONAL` only for dev/test
- Keep the Auth Proxy in your container or sidecar — never expose AlloyDB to the public internet
- Read pools are the right scaling lever before considering bigger primary CPUs
- For vector workloads, ScaNN indexes outperform `ivfflat` and `hnsw` at scale; tune `num_leaves` to ~sqrt(rows)
- Use secondary clusters for DR; failover is manual but typically completes in minutes
- Continuous backup gives PITR within the recovery window — separate from automated backups (which are snapshot-based)
- Monitor slow queries via Query Insights (built into the AlloyDB console)
