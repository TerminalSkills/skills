---
name: gcp-cloud-run
description: |
  Deploy serverless containers on Google Cloud Run — services for HTTP traffic,
  jobs for batch and scheduled tasks, and worker pools for always-on pull-based
  background processing. Build and push container images, configure auto-scaling
  from zero, split traffic for canary deploys, and set up custom domains with
  managed TLS.
license: Apache-2.0
compatibility: 'gcloud-cli, terraform'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - cloud-run
    - serverless
    - containers
---

# GCP Cloud Run

## Overview

Google Cloud Run is a fully managed serverless platform for running containers. It automatically scales from zero to thousands of instances, charges only for actual usage, and supports any language or binary that can run in a container.

## Instructions

### Core Concepts

- **Service** — a long-running container that auto-scales based on HTTP traffic
- **Revision** — an immutable snapshot of a service's configuration and code
- **Traffic splitting** — route percentages of traffic to different revisions
- **Job** — run a container to completion (batch, cron, one-off tasks)
- **Worker pool** — always-on container for pull-based background work (Pub/Sub pull, Kafka consumer, RabbitMQ)
- **Concurrency** — max simultaneous requests per container instance

> **CRITICAL:** Code MUST listen on `0.0.0.0` (not `127.0.0.1`) and use the injected `$PORT` env var (defaults to `8080`), or the container will crash on boot.

### Deploying a Service

```bash
# Deploy from source code (Cloud Build + Cloud Run)
gcloud run deploy web-app \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 100 \
  --concurrency 80 \
  --set-env-vars "NODE_ENV=production,LOG_LEVEL=info"
```

```bash
# Deploy from a pre-built container image
gcloud run deploy web-app \
  --image us-central1-docker.pkg.dev/my-project/repo/web-app:v1.2.0 \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300 \
  --set-secrets "DATABASE_URL=db-url:latest,API_KEY=api-key:latest"
```

### Building and Pushing Images

```bash
# Build with Cloud Build and push to Artifact Registry
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/my-project/repo/web-app:v1.2.0
```

```dockerfile
# Dockerfile — optimized multi-stage build for Cloud Run
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

### Traffic Splitting

```bash
# Deploy a new revision without sending traffic
gcloud run deploy web-app \
  --image us-central1-docker.pkg.dev/my-project/repo/web-app:v1.3.0 \
  --region us-central1 \
  --no-traffic
```

```bash
# Split traffic: 90% to current, 10% to new revision (canary)
gcloud run services update-traffic web-app \
  --region us-central1 \
  --to-revisions web-app-00002=10,web-app-00001=90
```

```bash
# Promote canary to 100%
gcloud run services update-traffic web-app \
  --region us-central1 \
  --to-latest
```

```bash
# Rollback by routing all traffic to a previous revision
gcloud run services update-traffic web-app \
  --region us-central1 \
  --to-revisions web-app-00001=100
```

### Cloud Run Jobs

```bash
# Create a batch job
gcloud run jobs create data-export \
  --image us-central1-docker.pkg.dev/my-project/repo/data-export:latest \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --task-timeout 3600 \
  --max-retries 3 \
  --set-env-vars "EXPORT_FORMAT=csv"
```

```bash
# Execute the job
gcloud run jobs execute data-export --region us-central1
```

```bash
# Schedule a job with Cloud Scheduler
gcloud scheduler jobs create http data-export-daily \
  --location us-central1 \
  --schedule "0 2 * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/my-project/jobs/data-export:run" \
  --http-method POST \
  --oauth-service-account-email my-sa@my-project.iam.gserviceaccount.com
```

### Worker Pools (Pull-Based Workloads)

Worker pools handle long-running background work that pulls from a queue — Pub/Sub pull subscriptions, Kafka consumers, RabbitMQ. Unlike services, they have no HTTP endpoint and are not driven by request traffic.

```bash
# Deploy a Pub/Sub worker pool
gcloud run worker-pools deploy events-consumer \
  --image us-central1-docker.pkg.dev/my-project/repo/consumer:v1.0.0 \
  --region us-central1 \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 20 \
  --set-env-vars "SUBSCRIPTION=projects/my-project/subscriptions/events-pull"
```

```bash
# Deploy from source (uses Cloud Build + buildpacks)
gcloud run worker-pools deploy events-consumer \
  --source . --region us-central1
```

Use worker pools instead of:
- **Services** when there's no HTTP traffic to scale on (pull workloads need their own scaling signal)
- **Jobs** when the work is continuous, not a discrete task with an end

### Custom Domains

```bash
# Map a custom domain
gcloud run domain-mappings create \
  --service web-app \
  --domain app.example.com \
  --region us-central1
```

```bash
# Get DNS records to configure
gcloud run domain-mappings describe \
  --domain app.example.com \
  --region us-central1
```

### Service Configuration

```bash
# Update environment variables and secrets
gcloud run services update web-app \
  --region us-central1 \
  --update-env-vars "FEATURE_FLAG=true" \
  --set-secrets "DB_PASS=db-password:latest" \
  --min-instances 1 \
  --cpu-boost
```

```bash
# Set IAM policy (authenticated access only)
gcloud run services add-iam-policy-binding web-app \
  --region us-central1 \
  --member="serviceAccount:frontend@my-project.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### Monitoring

```bash
# View service details and URL
gcloud run services describe web-app --region us-central1 --format='value(status.url)'
```

```bash
# List revisions
gcloud run revisions list --service web-app --region us-central1
```

```bash
# Stream logs
gcloud run services logs tail web-app --region us-central1
```

## Examples

### Example 1 — Ship a new web service with safe canary rollout

User wants to deploy a new revision of a Node.js API. Build and push the image to Artifact Registry, deploy with `--no-traffic` so it doesn't take live requests, run smoke tests against the revision URL, then `update-traffic --to-revisions web-app-00002=10,web-app-00001=90` for a 10% canary. After 30 minutes of clean metrics, promote with `--to-latest`. If errors spike, rollback by routing 100% to the previous revision — no redeploy needed.

### Example 2 — Convert a self-hosted Kafka consumer to a worker pool

User runs a Kafka consumer on a Compute Engine VM. Containerize the consumer, deploy as a Cloud Run worker pool with `--min-instances=1 --max-instances=10`, attach a service account with the Kafka topic's read access, and remove the VM. Worker pools auto-scale on CPU/memory, restart on crash, and cost only for actual instance time — no provisioning headaches.

## Guidelines

- Set min-instances=1 for latency-sensitive services to avoid cold starts
- Use concurrency settings matching your app's thread model (default 80)
- Store secrets in Secret Manager, not environment variables
- Use multi-stage Docker builds for smaller images and faster deploys
- Enable CPU boost for faster cold start initialization
- Use traffic splitting for safe canary deployments
- Set appropriate request timeouts (default 300s, max 3600s)
- Use Cloud Run Jobs for batch work instead of long-running services
- Use Worker Pools for always-on pull-based work (Pub/Sub pull, Kafka, RabbitMQ) instead of dedicated VMs
