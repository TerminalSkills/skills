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
  version: 1.1.0
  category: devops
  repository: https://github.com/GoogleCloudPlatform/alloydb-auth-proxy
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
- **Continuous backup** — point-in-time recovery within the recovery window (14 days by default; `--continuous-backup-recovery-window-days` changes it)
- **AlloyDB AI** — `vector` and `alloydb_scann` extensions, `google_ml_integration` for embeddings and model endpoints, hybrid search

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
# Create a cluster (storage + config; no compute yet).
# --password sets the initial `postgres` user; keep it in Secret Manager, not in shell history.
gcloud alloydb clusters create prod-cluster \
  --region=us-central1 \
  --network=default \
  --password="$ALLOYDB_POSTGRES_PASSWORD" \
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
  --database-flags="alloydb.iam_authentication=on"
```

For production, prefer **IAM database authentication** over password auth — it removes static credentials entirely and integrates with service accounts. The flag is `alloydb.iam_authentication` (`cloudsql.iam_authentication` is Cloud SQL's); group login also needs `alloydb.iam_group_authentication=on`. Then add the account to the cluster (`gcloud alloydb users create app-sa@my-project.iam --cluster=prod-cluster --region=us-central1 --type=IAM_BASED`) and `GRANT` it database privileges. The `vector` extension needs no flag: just `CREATE EXTENSION`.

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
# Run the Auth Proxy locally (handles IAM + TLS). Download the binary from the URL on the
# AlloyDB docs page "Connect using the Auth Proxy" (v1.17.2 at time of writing), e.g.
#   wget https://storage.googleapis.com/alloydb-auth-proxy/v1.17.2/alloydb-auth-proxy.linux.amd64 -O alloydb-auth-proxy && chmod +x alloydb-auth-proxy
# Google publishes no checksum for it; use only that HTTPS URL and pin the version.
# --auto-iam-authn logs in with your IAM identity; add --public-ip only for instances with a public address.
./alloydb-auth-proxy --auto-iam-authn --port 5432 \
  projects/my-project/locations/us-central1/clusters/prod-cluster/instances/prod-primary
```

```python
# pip install "google-cloud-alloydb-connector[pg8000]" sqlalchemy
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
-- Enable extensions (once per database; alloydb_scann installs vector too)
CREATE EXTENSION IF NOT EXISTS alloydb_scann CASCADE;
CREATE EXTENSION IF NOT EXISTS google_ml_integration;
GRANT EXECUTE ON FUNCTION embedding TO "app-sa@my-project.iam";

-- Schema with embeddings (text-embedding-005 returns 768 dimensions)
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  embedding vector(768)
);

-- Backfill with a Vertex AI model; embedding() works without registering an endpoint
UPDATE products
SET embedding = embedding('text-embedding-005', description)::vector
WHERE embedding IS NULL;

-- ScaNN index: default is auto-tuned (needs 10,000+ rows, or add WITH (mode='AUTO') to defer the build)
CREATE INDEX products_embedding_idx ON products USING scann (embedding cosine);
-- Manual tuning: WITH (mode = 'MANUAL', num_leaves = 1000, quantizer = 'SQ8')

-- Hybrid search: semantic ranking plus a lexical filter
SELECT id, name,
       1 - (embedding <=> embedding('text-embedding-005', 'wireless headphones with noise cancellation')::vector) AS similarity
FROM products
WHERE description ILIKE '%bluetooth%'
ORDER BY embedding <=> embedding('text-embedding-005', 'wireless headphones with noise cancellation')::vector
LIMIT 10;
```

`textembedding-gecko@003` (used by older copies of this skill) is not in the current model lists; use `text-embedding-005` (768 dims) or `gemini-embedding-001` (3072 dims by default, so size the column to match). The cluster's AlloyDB service agent needs access to Vertex AI (see "Integrate your database with Vertex AI" in the docs), and the model must be available in the cluster's region. To pass task types or use OpenAI-style endpoints, register a model with `CALL google_ml.create_model(...)` and call `google_ml.embedding(model_id => ..., content => ...)`.

### Cross-Region DR with Secondary Cluster

```bash
# Create a read-only secondary cluster in another region
# (then add its instance with `gcloud alloydb instances create-secondary dr-primary --cluster=dr-cluster --region=us-east1`)
gcloud alloydb clusters create-secondary dr-cluster \
  --region=us-east1 \
  --primary-cluster=projects/my-project/locations/us-central1/clusters/prod-cluster
```

```bash
# Failover (promote the secondary cluster to a standalone read/write cluster)
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

  deletion_protection = true   # the provider's default; set false only to tear down a dev cluster

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
    "alloydb.iam_authentication" = "on"
  }

  # In Terraform, add depends_on = [google_service_networking_connection.private_vpc] so the
  # private service access exists before the cluster is created.
}
```
## Examples

### Example 1 — Set up a production cluster with read replicas

User asks for a production-ready AlloyDB deployment. Create the cluster with regional availability, configure automated backups with 14-day retention, provision a primary instance with IAM auth enabled, then add a 3-node read pool sized for the analytics workload. Hand the user the Auth Proxy command (`--auto-iam-authn`) and a Terraform module they can commit. Expected result: `gcloud alloydb instances list --cluster=prod-cluster --region=us-central1` shows `prod-primary` and `reports-pool` as READY.

### Example 2 — Add semantic search to an existing PostgreSQL app

User has a products table on AlloyDB and wants vector search. Enable `alloydb_scann` (which pulls in `vector`) and `google_ml_integration`, add an `embedding vector(768)` column, backfill embeddings using `embedding('text-embedding-005', description)::vector`, create a ScaNN index with `USING scann (embedding cosine)`, and rewrite the search endpoint to combine cosine distance with existing `WHERE` filters for hybrid retrieval.

## Guidelines

- Use **IAM database authentication** in production — service accounts authenticate to the database without storing passwords
- Set `availability-type=REGIONAL` for HA; `ZONAL` only for dev/test
- Keep the Auth Proxy in your container or sidecar — never expose AlloyDB to the public internet
- Read pools are the right scaling lever before considering bigger primary CPUs
- For vector workloads, prefer ScaNN with its default auto-tuning; for manual tuning, `num_leaves` around sqrt(rows) is the documented starting point for a two-level index. Increase `scann.num_leaves_to_search` at query time for recall
- Use secondary clusters for DR; promotion is a manual step, and plan how applications are repointed to the promoted cluster
- Continuous backup gives PITR within the recovery window — separate from automated backups (which are snapshot-based)
- Monitor slow queries via Query Insights (built into the AlloyDB console)
