---
name: gcloud
description: >-
  The Google Cloud CLI (gcloud) manages Google Cloud resources from the
  terminal. Use when the user asks to create a VM, upload to a bucket, deploy a
  Cloud Run function, grant an IAM role, create a GKE cluster or switch GCP
  projects, or needs gcloud commands for Compute Engine, Cloud Storage, IAM,
  Cloud SQL or Pub/Sub.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "gcp, google-cloud, cli, cloud, devops"
---

# Google Cloud CLI

## Overview

The `gcloud` CLI (Google Cloud SDK 590.x in October 2026) manages GCP resources, configurations and deployments. Most commands follow `gcloud <service> <resource> <verb>`, and `gcloud <command> --help` is always accurate for the installed version. Billable commands below create real resources: run them in a throwaway project and delete what you create.

## Instructions

### Install

Use a package manager, not a piped installer script:

```bash
sudo snap install google-cloud-cli --classic        # Ubuntu and other snap systems
brew install --cask gcloud-cli                       # macOS
```

Debian/Ubuntu can also use Google's apt repository (https://cloud.google.com/sdk/docs/install-sdk). For a tarball, verify it against the SHA256 listed at https://cloud.google.com/sdk/docs/downloads-versioned-archives before extracting:

```bash
curl -fLO https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz
sha256sum google-cloud-cli-linux-x86_64.tar.gz       # compare with the published value
tar -xzf google-cloud-cli-linux-x86_64.tar.gz && ./google-cloud-sdk/install.sh
```

### Authenticate and configure

```bash
gcloud auth login                              # user login for gcloud itself
gcloud auth application-default login          # separate credentials for client libraries (ADC)
gcloud config set project orders-prod-4821
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a

gcloud config configurations create staging    # named configs for several projects
gcloud config configurations activate staging
gcloud config list
```

On a machine without a browser use `gcloud auth login --no-browser`. On CI and servers, attach a service account to the workload or use Workload Identity Federation rather than downloading a key file.

### Compute Engine

```bash
gcloud compute instances create web-server \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --tags=http-server,https-server \
  --service-account=web-sa@orders-prod-4821.iam.gserviceaccount.com

gcloud compute instances list \
  --filter="status=RUNNING AND labels.env=production" \
  --format="table(name,zone,machineType.basename(),networkInterfaces[0].accessConfigs[0].natIP)"

gcloud compute ssh web-server --zone=us-central1-a
gcloud compute instances stop web-server --zone=us-central1-a
gcloud compute instances delete web-server --zone=us-central1-a

gcloud compute firewall-rules create allow-web \
  --network=default --allow=tcp:80,tcp:443 \
  --target-tags=http-server --source-ranges=0.0.0.0/0
```

### Cloud Storage

Use `gcloud storage` (it replaces `gsutil` for these tasks).

```bash
gcloud storage buckets create gs://orders-prod-4821-exports --location=us-central1
gcloud storage ls gs://orders-prod-4821-exports/
gcloud storage cp report.csv gs://orders-prod-4821-exports/2026/
gcloud storage rsync ./site gs://orders-prod-4821-exports/site --delete-unmatched-destination-objects
gcloud storage buckets update gs://orders-prod-4821-exports --lifecycle-file=lifecycle.json

# Signed URL: needs a key file (--private-key-file) or an impersonated service account
gcloud storage sign-url gs://orders-prod-4821-exports/report.csv --duration=1h \
  --impersonate-service-account=web-sa@orders-prod-4821.iam.gserviceaccount.com
```

### Cloud Run functions (formerly Cloud Functions)

Cloud Functions 2nd gen is now Cloud Run functions. Both `gcloud functions deploy` and `gcloud run deploy --function` work.

```bash
gcloud functions deploy resize-image \
  --gen2 \
  --runtime=python313 \
  --region=us-central1 \
  --source=. \
  --entry-point=handler \
  --trigger-http \
  --no-allow-unauthenticated \
  --memory=512MiB \
  --timeout=60s \
  --set-env-vars="BUCKET=orders-prod-4821-exports,ENV=production"

gcloud functions call resize-image --region=us-central1 --data='{"key":"banner.png"}'
gcloud functions logs read resize-image --region=us-central1 --limit=50
```

Pass `--allow-unauthenticated` only for a function that is meant to be public. Check `--runtime` against https://cloud.google.com/functions/docs/runtime-support.

### IAM

```bash
gcloud iam service-accounts create web-sa --display-name="Web app service account"

gcloud projects add-iam-policy-binding orders-prod-4821 \
  --member="serviceAccount:web-sa@orders-prod-4821.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects get-iam-policy orders-prod-4821 \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)"

# Short-lived token as a service account (needs roles/iam.serviceAccountTokenCreator)
gcloud auth print-access-token \
  --impersonate-service-account=web-sa@orders-prod-4821.iam.gserviceaccount.com
```

Prefer impersonation or an attached service account over `gcloud iam service-accounts keys create`: key files do not expire, and many organizations block their creation by policy.

### GKE

```bash
# Autopilot: Google manages the nodes (the recommended default)
gcloud container clusters create-auto orders-cluster --region=us-central1

# Standard cluster: --num-nodes, --min-nodes and --max-nodes apply PER ZONE
gcloud container clusters create orders-std --region=us-central1 \
  --num-nodes=1 --machine-type=e2-standard-4 \
  --enable-autoscaling --min-nodes=0 --max-nodes=4

gcloud container clusters get-credentials orders-cluster --region=us-central1
gcloud container node-pools update default-pool --cluster=orders-std --region=us-central1 \
  --enable-autoscaling --min-nodes=1 --max-nodes=6   # per zone; resize applies only to pools without autoscaling
```

`kubectl` needs the `gke-gcloud-auth-plugin` binary to use the credentials; install it with `gcloud components install gke-gcloud-auth-plugin` or your package manager.

### Cloud SQL and Pub/Sub

```bash
gcloud sql instances create orders-db --database-version=POSTGRES_17 \
  --edition=enterprise --cpu=2 --memory=8GB --region=us-central1
gcloud sql connect orders-db --user=postgres

gcloud pubsub topics create order-events
gcloud pubsub subscriptions create order-events-billing --topic=order-events
```

## Examples

### Example 1: "Which VMs are running in staging and what are their IPs?"

```bash
gcloud compute instances list --project=orders-staging-1190 \
  --filter="status=RUNNING" --format="value(name,networkInterfaces[0].networkIP)"
```

The result is one tab-separated line per VM, such as `web-server	10.128.0.7`, ready for a shell loop.

### Example 2: "Give the app read access to the exports bucket without a key file"

```bash
gcloud iam service-accounts create exports-reader --display-name="Exports reader"
gcloud storage buckets add-iam-policy-binding gs://orders-prod-4821-exports \
  --member="serviceAccount:exports-reader@orders-prod-4821.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
gcloud compute instances stop web-server --zone=us-central1-a    # the VM must be stopped to change its service account
gcloud compute instances set-service-account web-server --zone=us-central1-a \
  --service-account=exports-reader@orders-prod-4821.iam.gserviceaccount.com \
  --scopes=cloud-platform
gcloud compute instances start web-server --zone=us-central1-a
```

The binding is on the bucket, not the project, so the account can read only that data.

## Guidelines

- Always confirm the target with `gcloud config list` or an explicit `--project`; commands act on the active project.
- Use `--format=json`, `--format="value(...)"` and `--filter` for scripting rather than parsing table output.
- Add `--quiet` in scripts so prompts do not hang; `delete` commands then proceed without confirmation, so scope them carefully.
- Grant the narrowest role that works and prefer predefined roles over `roles/owner` or `roles/editor`.
- A regional GKE Standard cluster multiplies node counts by the number of zones (three by default); use `--node-locations` or a zonal cluster to control cost.
- Update through the same channel you installed from (snap, brew, apt, or `gcloud components update` for a tarball install).
