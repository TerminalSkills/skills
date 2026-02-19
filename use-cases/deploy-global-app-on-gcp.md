---
title: Deploy a Globally Distributed App on GCP
slug: deploy-global-app-on-gcp
description: Deploy a globally distributed web application using Cloud Run for serverless containers, Firestore for real-time data, and Cloud Storage with CDN for static assets.
skills:
  - gcp-cloud-run
  - gcp-firestore
  - gcp-cloud-storage
category: cloud-services
tags:
  - gcp
  - global
  - cloud-run
  - firestore
  - serverless
---

# Deploy a Globally Distributed App on GCP

Priya is the lead engineer at a collaboration startup building a project management tool. Their users are spread across North America, Europe, and Asia. Pages need to load fast everywhere, data needs to sync in real-time between collaborators, and the team is small — they can't afford to manage infrastructure across three continents. She chooses GCP's serverless stack: Cloud Run for the API (multi-region), Firestore for real-time data, and Cloud Storage + Cloud CDN for static assets.

## The Architecture

```
Users worldwide
  ├── Cloud CDN → Cloud Storage (static assets: JS, CSS, images)
  └── Cloud Load Balancer
        ├── Cloud Run (us-central1) → Firestore (nam5)
        ├── Cloud Run (europe-west1) → Firestore (nam5, nearest replica)
        └── Cloud Run (asia-east1) → Firestore (nam5, nearest replica)
```

## Step 1: Set Up Cloud Storage for Static Assets

Priya starts with the frontend. The SPA is built with React and deployed to Cloud Storage behind Cloud CDN.

```bash
# Create a bucket for static assets
gcloud storage buckets create gs://projapp-static-prod \
  --location=us \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access
```

```bash
# Build the frontend and upload
npm run build

gcloud storage rsync ./build gs://projapp-static-prod/app/ \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=31536000, immutable"
```

```bash
# Upload index.html with short cache (for deployments)
gcloud storage cp ./build/index.html gs://projapp-static-prod/app/index.html \
  --cache-control="public, max-age=60"
```

```bash
# Make bucket publicly readable
gcloud storage buckets add-iam-policy-binding gs://projapp-static-prod \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

Now she sets up Cloud CDN via a load balancer backend bucket:

```bash
# Create a backend bucket with CDN enabled
gcloud compute backend-buckets create projapp-static-backend \
  --gcs-bucket-name=projapp-static-prod \
  --enable-cdn \
  --cache-mode=CACHE_ALL_STATIC
```

## Step 2: Set Up Firestore

Priya uses Firestore in Native mode for real-time sync between collaborators.

```bash
# Create Firestore database (multi-region for durability)
gcloud firestore databases create \
  --location=nam5 \
  --type=firestore-native
```

The data model uses collections for projects, tasks, and real-time presence:

```python
# seed_data.py — set up initial data structure
from google.cloud import firestore

db = firestore.Client()

# Create a project
project_ref = db.collection('projects').document('proj-001')
project_ref.set({
    'name': 'Website Redesign',
    'owner_id': 'user-priya',
    'members': ['user-priya', 'user-alex', 'user-chen'],
    'created_at': firestore.SERVER_TIMESTAMP
})

# Create tasks as a subcollection
tasks_ref = project_ref.collection('tasks')
tasks_ref.add({
    'title': 'Design new landing page',
    'assignee': 'user-alex',
    'status': 'in_progress',
    'priority': 'high',
    'created_at': firestore.SERVER_TIMESTAMP
})

# Real-time presence tracking
db.collection('presence').document('user-priya').set({
    'online': True,
    'last_seen': firestore.SERVER_TIMESTAMP,
    'active_project': 'proj-001'
})
```

```javascript
// firestore.rules — security rules for client access
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Projects: members can read, owner can write
    match /projects/{projectId} {
      allow read: if request.auth.uid in resource.data.members;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.owner_id;

      // Tasks: project members can CRUD
      match /tasks/{taskId} {
        allow read, write: if request.auth.uid in
          get(/databases/$(database)/documents/projects/$(projectId)).data.members;
      }
    }

    // Presence: users can only update their own
    match /presence/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
  }
}
```

```bash
# Deploy security rules
firebase deploy --only firestore:rules
```

## Step 3: Build and Deploy the API on Cloud Run

The API is a Node.js service that handles operations requiring server-side logic (invitations, notifications, integrations).

```javascript
// server.js — Express API for the project management app
const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const cors = require('cors');

const app = express();
const db = new Firestore();

app.use(cors());
app.use(express.json());

// Middleware: verify Firebase Auth token
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const { getAuth } = require('firebase-admin/auth');
    req.user = await getAuth().verifyIdToken(token);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Invite a member to a project
app.post('/api/projects/:projectId/invite', async (req, res) => {
  const { projectId } = req.params;
  const { email } = req.body;

  const project = await db.collection('projects').doc(projectId).get();
  if (!project.exists) return res.status(404).json({ error: 'Not found' });
  if (project.data().owner_id !== req.user.uid) {
    return res.status(403).json({ error: 'Only owner can invite' });
  }

  // Create invitation
  await db.collection('invitations').add({
    project_id: projectId,
    project_name: project.data().name,
    email,
    invited_by: req.user.uid,
    status: 'pending',
    created_at: Firestore.FieldValue.serverTimestamp()
  });

  // Send invitation email via a Pub/Sub topic
  const { PubSub } = require('@google-cloud/pubsub');
  const pubsub = new PubSub();
  await pubsub.topic('email-notifications').publishMessage({
    json: { template: 'project-invitation', to: email, data: { project_name: project.data().name } }
  });

  res.json({ status: 'invited' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
```

```dockerfile
# Dockerfile — multi-stage build for the API
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
# Build and push to Artifact Registry
gcloud builds submit --tag us-central1-docker.pkg.dev/projapp/api/projapp-api:v1.0.0
```

Now deploy to three regions:

```bash
# Deploy to US
gcloud run deploy projapp-api \
  --image us-central1-docker.pkg.dev/projapp/api/projapp-api:v1.0.0 \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 50 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_CONFIG=firebase-config:latest" \
  --no-allow-unauthenticated
```

```bash
# Deploy to Europe
gcloud run deploy projapp-api \
  --image us-central1-docker.pkg.dev/projapp/api/projapp-api:v1.0.0 \
  --region europe-west1 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 50 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_CONFIG=firebase-config:latest" \
  --no-allow-unauthenticated
```

```bash
# Deploy to Asia
gcloud run deploy projapp-api \
  --image us-central1-docker.pkg.dev/projapp/api/projapp-api:v1.0.0 \
  --region asia-east1 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 30 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_CONFIG=firebase-config:latest" \
  --no-allow-unauthenticated
```

## Step 4: Set Up Global Load Balancer

Route users to the nearest Cloud Run region automatically.

```bash
# Create serverless NEGs for each region
gcloud compute network-endpoint-groups create projapp-neg-us \
  --region=us-central1 --network-endpoint-type=serverless \
  --cloud-run-service=projapp-api

gcloud compute network-endpoint-groups create projapp-neg-eu \
  --region=europe-west1 --network-endpoint-type=serverless \
  --cloud-run-service=projapp-api

gcloud compute network-endpoint-groups create projapp-neg-asia \
  --region=asia-east1 --network-endpoint-type=serverless \
  --cloud-run-service=projapp-api
```

```bash
# Create backend service
gcloud compute backend-services create projapp-api-backend \
  --global --load-balancing-scheme=EXTERNAL_MANAGED

# Add NEGs to the backend
gcloud compute backend-services add-backend projapp-api-backend \
  --global --network-endpoint-group=projapp-neg-us --network-endpoint-group-region=us-central1
gcloud compute backend-services add-backend projapp-api-backend \
  --global --network-endpoint-group=projapp-neg-eu --network-endpoint-group-region=europe-west1
gcloud compute backend-services add-backend projapp-api-backend \
  --global --network-endpoint-group=projapp-neg-asia --network-endpoint-group-region=asia-east1
```

```bash
# Create URL map routing /api/* to Cloud Run, everything else to static bucket
gcloud compute url-maps create projapp-lb \
  --default-backend-bucket=projapp-static-backend

gcloud compute url-maps add-path-matcher projapp-lb \
  --path-matcher-name=api-matcher \
  --default-backend-bucket=projapp-static-backend \
  --backend-service-path-rules="/api/*=projapp-api-backend"
```

```bash
# Create HTTPS proxy with managed SSL
gcloud compute ssl-certificates create projapp-cert \
  --domains=app.projapp.com --global

gcloud compute target-https-proxies create projapp-https-proxy \
  --ssl-certificates=projapp-cert --url-map=projapp-lb

gcloud compute forwarding-rules create projapp-https-rule \
  --global --target-https-proxy=projapp-https-proxy --ports=443
```

## Step 5: Deploy Updates with Traffic Splitting

When Priya ships a new version, she uses Cloud Run traffic splitting for safe canary deploys.

```bash
# Deploy new version without traffic
gcloud run deploy projapp-api \
  --image us-central1-docker.pkg.dev/projapp/api/projapp-api:v1.1.0 \
  --region us-central1 \
  --no-traffic

# Send 5% of traffic to the new version
gcloud run services update-traffic projapp-api \
  --region us-central1 \
  --to-latest=5

# Monitor error rates... looks good. Promote to 100%.
gcloud run services update-traffic projapp-api \
  --region us-central1 \
  --to-latest
```

## What Priya Learned

With Firestore's real-time listeners, collaborators see each other's changes instantly — no polling, no WebSocket servers to manage. Cloud Run scales each region independently, so a traffic spike in Asia doesn't affect European users. Cloud CDN serves the static frontend from edge nodes worldwide, keeping the initial page load under 500ms everywhere.

The total cost at 10,000 daily active users: about $50/month. Firestore charges for reads/writes, Cloud Run charges for CPU-seconds, and Cloud Storage + CDN costs are minimal for static assets. The same architecture handles 100x the traffic without architecture changes — just higher bills.

The biggest win: the three-person team deploys multiple times per day with zero-downtime canary releases, and nobody carries a pager for infrastructure.
