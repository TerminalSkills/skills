---
name: gcp-cloud-functions
description: |
  Build serverless functions on Google Cloud Functions. Deploy HTTP and event-driven
  functions triggered by Pub/Sub, Cloud Storage, and Firestore. Configure runtime
  settings, manage dependencies, and connect to other GCP services.
license: Apache-2.0
compatibility: 'gcloud-cli, terraform'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - cloud-functions
    - serverless
    - event-driven
---

# GCP Cloud Functions

## Overview

Google Cloud Functions, renamed **Cloud Run functions** in August 2024 (the `gcloud functions` commands and Functions Framework are unchanged), is a serverless execution environment for building event-driven applications. Write single-purpose functions that respond to HTTP requests, Pub/Sub messages, Cloud Storage events, or Firestore changes — no infrastructure to manage.

### Core Concepts

- **HTTP Function** — triggered by HTTP requests, returns a response
- **Event Function** — triggered by cloud events (Pub/Sub, Storage, Firestore)
- **Gen 2** — the current generation (shown as "Cloud Run functions" in the docs), built on Cloud Run, longer timeouts, concurrency; 1st gen is legacy
- **Trigger** — the event source that invokes the function
- **Runtime** — language environment (Node.js, Python, Go, Java, etc.)

## Instructions

## HTTP Functions

```javascript
// index.js — HTTP function that processes webhook payloads
const functions = require('@google-cloud/functions-framework');

functions.http('handleWebhook', (req, res) => {
  const { event, data } = req.body;

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  console.log(`Received event: ${event}`, data);

  switch (event) {
    case 'order.created':
      // Process new order
      res.json({ status: 'processed', orderId: data.id });
      break;
    default:
      res.json({ status: 'ignored', event });
  }
});
```

```bash
# Deploy an HTTP function (Gen 2)
gcloud functions deploy handle-webhook \
  --gen2 \
  --runtime nodejs22 \
  --region us-central1 \
  --source . \
  --entry-point handleWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --memory 256Mi \
  --timeout 60 \
  --set-env-vars "NODE_ENV=production"
```

## Pub/Sub Triggered Functions

```python
# main.py — process Pub/Sub messages
import base64
import json
import functions_framework

@functions_framework.cloud_event
def process_message(cloud_event):
    """Triggered by a Pub/Sub message."""
    data = base64.b64decode(cloud_event.data["message"]["data"]).decode()
    message = json.loads(data)

    print(f"Processing order: {message['order_id']}")

    # Process the order
    result = fulfill_order(message)
    print(f"Order {message['order_id']} fulfilled: {result}")
```

```bash
# Deploy Pub/Sub triggered function
gcloud functions deploy process-order \
  --gen2 \
  --runtime python313 \
  --region us-central1 \
  --source . \
  --entry-point process_message \
  --trigger-topic order-events \
  --memory 512Mi \
  --timeout 120 \
  --set-secrets "DATABASE_URL=db-url:latest"
```

## Cloud Storage Triggered Functions

```python
# main.py — process uploaded files
import functions_framework
from google.cloud import storage

@functions_framework.cloud_event
def process_upload(cloud_event):
    """Triggered when a file is uploaded to Cloud Storage."""
    data = cloud_event.data
    bucket_name = data["bucket"]
    file_name = data["name"]

    if not file_name.lower().endswith(('.jpg', '.png', '.jpeg')):
        print(f"Skipping non-image file: {file_name}")
        return

    print(f"Processing image: gs://{bucket_name}/{file_name}")

    # Generate thumbnail, run OCR, etc.
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    image_data = blob.download_as_bytes()

    # Process image...
    print(f"Processed {file_name} ({len(image_data)} bytes)")
```

```bash
# Deploy Storage triggered function
gcloud functions deploy process-upload \
  --gen2 \
  --runtime python313 \
  --region us-central1 \
  --source . \
  --entry-point process_upload \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
  --trigger-event-filters="bucket=my-uploads-bucket" \
  --memory 1Gi \
  --timeout 300
```

## Firestore Triggered Functions

Firestore events arrive as a protobuf payload (`cloud_event.data` is bytes), so decode them with `DocumentEventData` from the `google-events` package. `requirements.txt`: `functions-framework`, `google-events`, `google-cloud-firestore`.

```python
# main.py — react to Firestore document creation
import functions_framework
from google.cloud import firestore
from google.events.cloud import firestore as firestore_events

@functions_framework.cloud_event
def on_user_created(cloud_event):
    payload = firestore_events.DocumentEventData()
    payload._pb.ParseFromString(cloud_event.data)

    fields = payload.value.fields
    email = fields["email"].string_value
    name = fields["name"].string_value
    user_id = payload.value.name.split("/")[-1]
    print(f"New user created: {name} ({email})")

    # Send welcome email, create default settings, etc.
    db = firestore.Client()
    db.collection("user-settings").document(user_id).set({
        "theme": "light",
        "notifications": True,
        "created_at": firestore.SERVER_TIMESTAMP,
    })
```

```bash
# Deploy Firestore triggered function
gcloud functions deploy on-user-created \
  --gen2 \
  --runtime python313 \
  --region us-central1 \
  --source . \
  --entry-point on_user_created \
  --trigger-location us-central1 \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.created" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters-path-pattern="document=users/{userId}" \
  --memory 256Mi
```

## Managing Functions

```bash
# List deployed functions
gcloud functions list --gen2 --region us-central1
```

```bash
# View function details
gcloud functions describe process-order --gen2 --region us-central1
```

```bash
# View logs
gcloud functions logs read process-order --gen2 --region us-central1 --limit 50
```

```bash
# Delete a function
gcloud functions delete process-order --gen2 --region us-central1
```

## Local Development

```bash
# Run function locally
npx @google-cloud/functions-framework --target=handleWebhook --port=8080
```

```bash
# Test locally with curl
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"event":"order.created","data":{"id":"12345"}}'
```

## Examples

**Webhook receiver.** User: "Deploy my Stripe-style webhook handler so it is public." Run the `gcloud functions deploy handle-webhook --gen2 --runtime nodejs22 ... --trigger-http --allow-unauthenticated` command above; the output ends with a `url: https://handle-webhook-xxxxx-uc.a.run.app` that answers the curl test from Local Development with `{"status":"processed","orderId":"12345"}`.

**Process uploads.** User: "Run code whenever a photo lands in my uploads bucket." Deploy `process-upload` with the Storage finalize filter above; uploading `receipt.jpg` makes `gcloud functions logs read process-upload --gen2 --region us-central1` show `Processing image: gs://my-uploads-bucket/receipt.jpg`.

## Guidelines

- Pick a supported runtime (docs list nodejs22/nodejs24, python313/python314; nodejs20 and older are on the deprecation path, check https://cloud.google.com/functions/docs/runtime-support)
- Firestore event payloads arrive as protobuf, not JSON; decode them with `DocumentEventData` (`google-events` for Python, `protobufjs` plus the `data.proto` file for Node.js)
- `--trigger-location` for Firestore (and Storage, when the bucket is in another location) must match the database or bucket location; replace `us-central1` with yours
- Use Gen 2 for all new functions (better performance, concurrency support)
- Set memory and timeout based on actual needs — don't over-provision
- Use Secret Manager for credentials, not environment variables
- Implement idempotent handlers — events may be delivered more than once
- Use structured logging for better observability in Cloud Logging
- Set min-instances to avoid cold starts for latency-sensitive functions
- Use the functions framework for local development and testing
- Keep functions focused — one function, one purpose
