---
name: gcp-cloud-storage
description: |
  Manage Google Cloud Storage for scalable object storage. Create and configure
  buckets, upload and organize objects, generate signed URLs for secure temporary
  access, set lifecycle rules for cost optimization, and configure access control.
license: Apache-2.0
compatibility:
  - gcloud-cli
  - gsutil
  - python
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - cloud-storage
    - object-storage
    - buckets
---

# GCP Cloud Storage

Google Cloud Storage is a unified object storage service with global edge caching. It offers multiple storage classes (Standard, Nearline, Coldline, Archive) for cost optimization, strong consistency, and integration with all GCP services.

## Core Concepts

- **Bucket** — globally unique container, scoped to a project and location
- **Object** — a file with metadata, identified by name (path) within a bucket
- **Storage Class** — Standard, Nearline (30d), Coldline (90d), Archive (365d)
- **Signed URL** — time-limited URL for authenticated access without credentials
- **Lifecycle Rule** — automatic actions based on age, class, or conditions
- **IAM / ACL** — access control at bucket and object level

## Bucket Operations

```bash
# Create a bucket with location and default storage class
gcloud storage buckets create gs://my-app-assets-prod \
  --location=us-central1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access
```

```bash
# List buckets
gcloud storage ls
```

```bash
# Set bucket to public read (for static hosting)
gcloud storage buckets add-iam-policy-binding gs://my-app-assets-prod \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

```bash
# Enable versioning
gcloud storage buckets update gs://my-app-assets-prod --versioning
```

## Object Operations

```bash
# Upload a file
gcloud storage cp ./build/app.zip gs://my-app-assets-prod/releases/v1.2.0/app.zip
```

```bash
# Sync a directory
gcloud storage rsync ./dist gs://my-app-assets-prod/static/ \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=86400"
```

```bash
# Copy between buckets
gcloud storage cp gs://source-bucket/data.csv gs://dest-bucket/data.csv
```

```bash
# List objects with prefix
gcloud storage ls gs://my-app-assets-prod/releases/ --recursive
```

```bash
# Remove objects
gcloud storage rm gs://my-app-assets-prod/old-file.txt
```

## Signed URLs

```python
# Generate signed URL for download (1 hour)
from google.cloud import storage
from datetime import timedelta

client = storage.Client()
bucket = client.bucket('my-app-assets-prod')
blob = bucket.blob('reports/q4.pdf')

url = blob.generate_signed_url(
    version='v4',
    expiration=timedelta(hours=1),
    method='GET'
)
print(f"Download URL: {url}")
```

```python
# Generate signed URL for upload
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
# Generate signed URL with gsutil
gcloud storage sign-url gs://my-app-assets-prod/reports/q4.pdf \
  --duration=1h \
  --private-key-file=service-account.json
```

## Lifecycle Rules

```json
// lifecycle-config.json — transition and expire objects automatically
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
gcloud storage buckets update gs://my-app-assets-prod \
  --lifecycle-file=lifecycle-config.json
```

## Static Website Hosting

```bash
# Configure bucket for static website
gcloud storage buckets update gs://my-app-website \
  --web-main-page-suffix=index.html \
  --web-not-found-page=404.html
```

```bash
# Upload website files with appropriate content types
gcloud storage cp -r ./build/* gs://my-app-website/ \
  --cache-control="public, max-age=3600"
```

## Event Notifications

```bash
# Notify Pub/Sub when objects are created
gcloud storage buckets notifications create gs://my-app-assets-prod \
  --topic=storage-events \
  --event-types=OBJECT_FINALIZE \
  --object-prefix=uploads/
```

## CORS Configuration

```json
// cors-config.json — allow browser uploads
[
  {
    "origin": ["https://myapp.com"],
    "method": ["GET", "PUT", "POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

```bash
# Apply CORS
gcloud storage buckets update gs://my-app-assets-prod --cors-file=cors-config.json
```

## Access Control

```bash
# Grant a service account read access
gcloud storage buckets add-iam-policy-binding gs://my-app-assets-prod \
  --member=serviceAccount:app@my-project.iam.gserviceaccount.com \
  --role=roles/storage.objectViewer
```

```bash
# Remove public access
gcloud storage buckets remove-iam-policy-binding gs://my-app-assets-prod \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

## Best Practices

- Enable uniform bucket-level access (disable ACLs) for simpler permissions
- Use lifecycle rules to automatically transition cold data to cheaper classes
- Generate signed URLs for temporary access instead of making objects public
- Enable versioning on buckets with critical data
- Use `gcloud storage rsync` for efficient directory synchronization
- Set appropriate Cache-Control headers for CDN and browser caching
- Use Pub/Sub notifications for event-driven processing of uploads
- Enable Object Versioning + lifecycle rules to limit stored versions
