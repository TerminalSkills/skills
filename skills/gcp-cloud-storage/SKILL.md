---
name: gcp-cloud-storage
description: |
  Manage Google Cloud Storage for scalable object storage. Create and configure
  buckets, upload and organize objects, generate signed URLs for secure temporary
  access, set lifecycle rules for cost optimization, and configure access control.
license: Apache-2.0
compatibility: 'gcloud CLI (gcloud storage), google-cloud-storage 3.x for Python 3.10+, a Google Cloud project with billing'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/googleapis/python-storage
  tags:
    - gcp
    - cloud-storage
    - object-storage
    - buckets
---

# GCP Cloud Storage

## Overview

Google Cloud Storage is a unified object storage service with global edge caching. It offers multiple storage classes (Standard, Nearline, Coldline, Archive) for cost optimization, strong consistency, and integration with all GCP services.

## Instructions

### Core concepts

- **Bucket** — globally unique container, scoped to a project and location
- **Object** — a file with metadata, identified by name (path) within a bucket
- **Storage Class** — Standard, Nearline (30d), Coldline (90d), Archive (365d)
- **Signed URL** — time-limited URL for authenticated access without credentials
- **Lifecycle Rule** — automatic actions based on age, class, or conditions
- **IAM / ACL** — access control at bucket and object level; with uniform bucket-level access only IAM applies
- **Soft delete** — enabled by default on buckets with a 7-day retention: deleted objects can be restored during that window (and are billed meanwhile)

### Bucket Operations

```bash
# Create a bucket with location and default storage class
gcloud storage buckets create gs://northwind-assets-prod \
  --location=us-central1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access
```

```bash
# List buckets
gcloud storage ls
```

```bash
# Make every object publicly readable (static hosting only; skip for private data)
# First check the bucket's public access prevention setting; it blocks allUsers bindings
gcloud storage buckets add-iam-policy-binding gs://northwind-assets-prod \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

```bash
# Enable versioning
gcloud storage buckets update gs://northwind-assets-prod --versioning
```

### Object Operations

```bash
# Upload a file
gcloud storage cp ./build/app.zip gs://northwind-assets-prod/releases/v1.2.0/app.zip
```

```bash
# Sync a directory (-r is required to include subdirectories)
gcloud storage rsync -r ./dist gs://northwind-assets-prod/static/ \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=86400"
```

```bash
# Copy between buckets
gcloud storage cp gs://northwind-staging/data.csv gs://northwind-archive/data.csv
```

```bash
# List objects with prefix
gcloud storage ls gs://northwind-assets-prod/releases/ --recursive
```

```python
# Python client: upload and download
from google.cloud import storage

client = storage.Client()  # uses Application Default Credentials
blob = client.bucket("northwind-assets-prod").blob("reports/q4.pdf")
blob.upload_from_filename("q4.pdf", content_type="application/pdf")
blob.download_to_filename("q4-copy.pdf")
```

```bash
# Remove objects
gcloud storage rm gs://northwind-assets-prod/old-file.txt
```

### Signed URLs

A V4 signed URL needs a credential that can sign. A service-account key file works (`Client.from_service_account_json`). Keys are a liability; on Cloud Run, GCE or with user credentials, impersonate a service account that has `roles/iam.serviceAccountTokenCreator` on itself instead, and pass its email and a fresh access token:

```python
# Keyless signing through the IAM signBlob API (not run here: needs a real project)
from datetime import timedelta

import google.auth
from google.auth.transport.requests import Request
from google.cloud import storage

blob = storage.Client().bucket("northwind-assets-prod").blob("reports/q4.pdf")
creds, _ = google.auth.default()
creds.refresh(Request())
url = blob.generate_signed_url(
    version="v4", expiration=timedelta(hours=1), method="GET",
    service_account_email="signer@northwind-prod.iam.gserviceaccount.com",
    access_token=creds.token,
)
```

```python
# Signed URL for download with a key-based credential (1 hour)
from google.cloud import storage
from datetime import timedelta

client = storage.Client()
bucket = client.bucket('northwind-assets-prod')
blob = bucket.blob('reports/q4.pdf')

url = blob.generate_signed_url(
    version='v4',
    expiration=timedelta(hours=1),
    method='GET'
)
print(f"Download URL: {url}")
```

```python
# Signed URL for upload (the client must send the same Content-Type)
url = blob.generate_signed_url(
    version='v4',
    expiration=timedelta(minutes=15),
    method='PUT',
    content_type='application/octet-stream'
)
print(f"Upload URL: {url}")
# Client uploads with: curl -X PUT -H "Content-Type: application/octet-stream" --data-binary @file "$url"
```

```bash
# Signed URL from the CLI, impersonating a service account (no key file)
gcloud storage sign-url gs://northwind-assets-prod/reports/q4.pdf \
  --duration=1h \
  --impersonate-service-account=signer@northwind-prod.iam.gserviceaccount.com
```

### Lifecycle Rules

`lifecycle-config.json` moves log objects to colder classes and expires them:

```json
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
      "condition": {"age": 30, "matchesPrefix": ["logs/"]}
    },
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 90, "matchesPrefix": ["logs/"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365, "matchesPrefix": ["logs/"]}
    },
    {
      "action": {"type": "AbortIncompleteMultipartUpload"},
      "condition": {"age": 7}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"numNewerVersions": 3, "isLive": false}
    }
  ]
}
```

```bash
# Apply lifecycle rules
gcloud storage buckets update gs://northwind-assets-prod \
  --lifecycle-file=lifecycle-config.json
```

### Static Website Hosting

Cloud Storage serves a website over HTTP on a custom domain only; for HTTPS in front of a bucket use an external Application Load Balancer with a backend bucket. The objects must also be publicly readable (see Bucket Operations).

```bash
# Configure bucket for static website
gcloud storage buckets update gs://northwind-site \
  --web-main-page-suffix=index.html \
  --web-error-page=404.html
```

```bash
# Upload website files with appropriate content types
gcloud storage cp -r ./build/* gs://northwind-site/ \
  --cache-control="public, max-age=3600"
```

### Event Notifications

```bash
# Notify Pub/Sub when objects are created
gcloud storage buckets notifications create gs://northwind-assets-prod \
  --topic=upload-events \
  --event-types=OBJECT_FINALIZE \
  --object-prefix=uploads/
```

### CORS Configuration

`cors-config.json` allows browser uploads from one origin:

```json
[
  {
    "origin": ["https://app.northwind.dev"],
    "method": ["GET", "PUT", "POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

```bash
# Apply CORS
gcloud storage buckets update gs://northwind-assets-prod --cors-file=cors-config.json
```

### Access Control

```bash
# Grant a service account read access
gcloud storage buckets add-iam-policy-binding gs://northwind-assets-prod \
  --member=serviceAccount:app@northwind-prod.iam.gserviceaccount.com \
  --role=roles/storage.objectViewer
```

```bash
# Remove public access
gcloud storage buckets remove-iam-policy-binding gs://northwind-assets-prod \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

## Examples

**"Give a customer a link to download their invoice for an hour."** Generate a V4 signed URL for `invoices/2026-10.pdf` with `timedelta(hours=1)` as shown. The URL works until it expires without the customer having a Google account; after that Cloud Storage answers 403. It was generated and parsed in a test with a throwaway key (the URL carries `X-Goog-Algorithm=GOOG4-RSA-SHA256`).

**"Keep logs 30 days hot, then cheaper, and delete after a year."** Save the lifecycle JSON as `lifecycle-config.json`, apply it with `gcloud storage buckets update ... --lifecycle-file=lifecycle-config.json`, and re-read it with `gcloud storage buckets describe gs://northwind-assets-prod`. Rules run asynchronously, so changes take about a day to show effect.

## Guidelines

- Enable uniform bucket-level access (disable ACLs) for simpler permissions
- Use lifecycle rules to automatically transition cold data to cheaper classes
- Generate signed URLs for temporary access instead of making objects public
- Enable versioning on buckets with critical data
- Use `gcloud storage rsync` for efficient directory synchronization
- Set appropriate Cache-Control headers for CDN and browser caching
- Use Pub/Sub notifications for event-driven processing of uploads
- Pair versioning with a `numNewerVersions` lifecycle rule so old versions do not pile up
- Nearline, Coldline and Archive have minimum storage durations (30, 90, 365 days): deleting earlier is still billed for the full period
- Prefer keyless signing and Workload Identity over downloaded service-account keys
