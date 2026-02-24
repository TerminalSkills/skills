---
name: gcloud
description: >-
  Google Cloud CLI for managing GCP resources. Use when the user needs to work
  with Compute Engine, Cloud Storage, Cloud Functions, IAM, GKE, and other
  Google Cloud services from the terminal.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - google-cloud
    - cli
    - cloud
    - devops
---

# Google Cloud CLI

The `gcloud` CLI manages GCP resources, configurations, and deployments from the terminal.

## Setup

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Initialize and authenticate
gcloud init
gcloud auth login
gcloud auth application-default login

# Set project and region
gcloud config set project my-project-id
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a

# Named configurations for multiple projects
gcloud config configurations create production
gcloud config configurations activate production
```

## Compute Engine

```bash
# Create a VM instance
gcloud compute instances create web-server \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
  --subnet=my-subnet \
  --tags=http-server,https-server \
  --service-account=app-sa@my-project.iam.gserviceaccount.com

# List instances
gcloud compute instances list \
  --filter="status=RUNNING AND labels.env=production" \
  --format="table(name,zone,machineType.basename(),networkInterfaces[0].accessConfigs[0].natIP)"

# SSH into instance
gcloud compute ssh web-server --zone=us-central1-a

# Stop/start/delete
gcloud compute instances stop web-server --zone=us-central1-a
gcloud compute instances start web-server --zone=us-central1-a
gcloud compute instances delete web-server --zone=us-central1-a

# Firewall rules
gcloud compute firewall-rules create allow-http \
  --network=default --allow=tcp:80,tcp:443 \
  --target-tags=http-server --source-ranges=0.0.0.0/0
```

## Cloud Storage

```bash
# Bucket operations
gcloud storage buckets create gs://my-bucket --location=us-central1
gcloud storage ls gs://my-bucket/
gcloud storage cp file.txt gs://my-bucket/path/
gcloud storage rsync ./local-dir gs://my-bucket/remote/ --delete-unmatched-destination-objects

# Set lifecycle rules
gcloud storage buckets update gs://my-bucket \
  --lifecycle-file=lifecycle.json

# Signed URLs
gcloud storage sign-url gs://my-bucket/file.pdf --duration=1h
```

## Cloud Functions

```bash
# Deploy a Cloud Function (2nd gen)
gcloud functions deploy my-function \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=handler \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256MB \
  --timeout=60s \
  --set-env-vars="DB_HOST=10.0.0.5,ENV=production"

# Invoke and view logs
gcloud functions call my-function --data='{"key":"value"}'
gcloud functions logs read my-function --region=us-central1 --limit=50

# List functions
gcloud functions list --format="table(name,status,runtime)"
```

## IAM

```bash
# Service accounts
gcloud iam service-accounts create app-sa \
  --display-name="Application Service Account"

gcloud iam service-accounts keys create key.json \
  --iam-account=app-sa@my-project.iam.gserviceaccount.com

# Role bindings
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:app-sa@my-project.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

# View IAM policy
gcloud projects get-iam-policy my-project \
  --format="table(bindings.role,bindings.members)"

# Impersonate service account
gcloud auth print-access-token --impersonate-service-account=app-sa@my-project.iam.gserviceaccount.com
```

## GKE

```bash
# Create GKE cluster
gcloud container clusters create my-cluster \
  --num-nodes=3 \
  --machine-type=e2-standard-4 \
  --region=us-central1 \
  --enable-autoscaling --min-nodes=1 --max-nodes=10

# Get credentials for kubectl
gcloud container clusters get-credentials my-cluster --region=us-central1

# Resize node pool
gcloud container clusters resize my-cluster --num-nodes=5 --region=us-central1
```

## Useful Patterns

```bash
# Format output for scripting
gcloud compute instances list --format="value(name)" | while read name; do
  echo "Processing $name"
done

# Describe any resource as JSON
gcloud compute instances describe web-server --zone=us-central1-a --format=json

# Billing and cost
gcloud billing accounts list
gcloud billing projects describe my-project

# Cloud SQL
gcloud sql instances create my-db --database-version=POSTGRES_15 \
  --tier=db-custom-2-8192 --region=us-central1
gcloud sql connect my-db --user=postgres

# Pub/Sub
gcloud pubsub topics create my-topic
gcloud pubsub subscriptions create my-sub --topic=my-topic
```
