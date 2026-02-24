---
name: gcp-cloud-functions
description: |
  Build serverless functions on Google Cloud Functions. Deploy HTTP and event-driven
  functions triggered by Pub/Sub, Cloud Storage, and Firestore. Configure runtime
  settings, manage dependencies, and connect to other GCP services.
license: Apache-2.0
compatibility:
  - gcloud-cli
  - terraform
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - cloud-functions
    - serverless
    - event-driven
---

# GCP Cloud Functions

Google Cloud Functions is a serverless execution environment for building event-driven applications. Write single-purpose functions that respond to HTTP requests, Pub/Sub messages, Cloud Storage events, or Firestore changes — no infrastructure to manage.

## Core Concepts

- **HTTP Function** — triggered by HTTP requests, returns a response
- **Event Function** — triggered by cloud events (Pub/Sub, Storage, Firestore)
- **Gen 2** — latest version, built on Cloud Run, longer timeouts, concurrency
- **Trigger** — the event source that invokes the function
- **Runtime** — language environment (Node.js, Python, Go, Java, etc.)

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
  --runtime nodejs20 \
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
  --runtime python312 \
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
from google.cloud import storage, vision

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
  --runtime python312 \
  --region us-central1 \
  --source . \
  --entry-point process_upload \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
  --trigger-event-filters="bucket=my-uploads-bucket" \
  --memory 1Gi \
  --timeout 300
```

## Firestore Triggered Functions

```javascript
// index.js — react to Firestore document changes
const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');

functions.cloudEvent('onUserCreated', async (cloudEvent) => {
  const data = cloudEvent.data;
  const newValue = data.value.fields;

  const email = newValue.email.stringValue;
  const name = newValue.name.stringValue;

  console.log(`New user created: ${name} (${email})`);

  // Send welcome email, create default settings, etc.
  const db = new Firestore();
  await db.collection('user-settings').doc(data.value.name.split('/').pop()).set({
    theme: 'light',
    notifications: true,
    createdAt: Firestore.FieldValue.serverTimestamp()
  });
});
```

```bash
# Deploy Firestore triggered function
gcloud functions deploy on-user-created \
  --gen2 \
  --runtime nodejs20 \
  --region us-central1 \
  --source . \
  --entry-point onUserCreated \
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

## Best Practices

- Use Gen 2 for all new functions (better performance, concurrency support)
- Set memory and timeout based on actual needs — don't over-provision
- Use Secret Manager for credentials, not environment variables
- Implement idempotent handlers — events may be delivered more than once
- Use structured logging for better observability in Cloud Logging
- Set min-instances to avoid cold starts for latency-sensitive functions
- Use the functions framework for local development and testing
- Keep functions focused — one function, one purpose
