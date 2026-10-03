---
name: gcp-auth
description: |
  Configure authentication and authorization for Google Cloud — Application
  Default Credentials (ADC), service account impersonation, Workload Identity
  Federation for GKE and external clouds, and OIDC ID tokens for service-to-
  service auth. Use when setting up local dev access, deploying to Cloud Run /
  Cloud Functions / GKE, or calling private Google Cloud APIs.
license: Apache-2.0
compatibility: 'gcloud-cli, google-cloud-sdk client libraries'
metadata:
  author: google-cloud
  version: "1.2.0"
  category: devops
  tags:
    - gcp
    - iam
    - authentication
    - service-accounts
    - workload-identity
---

# GCP Authentication & Authorization

## Overview

Authentication answers "who are you?" — authorization (IAM) answers "what can you do?" Google Cloud uses three concepts together: **Principals** (user accounts, service accounts, federated identities), short-lived **tokens** issued by metadata servers or the Service Account Credentials API, and **IAM Allow Policies** that bind principals to predefined or custom roles on resources.

The right pattern depends on where the code runs and who is calling.

## Instructions

### Decision Matrix

| Scenario | Use |
|---|---|
| Local development, calling Google APIs | `gcloud auth application-default login` (ADC) |
| Local dev, but you need to act as a service account | Service account impersonation (NOT keys) |
| Code on Compute Engine / Cloud Run / Cloud Functions | Attached service account + metadata server |
| Code on GKE | Workload Identity Federation for GKE (direct `principal://` binding) |
| Code on AWS / Azure / on-prem | Workload Identity Federation (with external IdP) |
| Calling a private Cloud Run / Cloud Functions service | OIDC ID token in `Authorization: Bearer` |
| Public / quota-limited APIs (Maps, Vertex AI Express) | API key with restrictions |

If a downloadable service account key (JSON) appears in the answer for any of these, the answer is wrong.

### Local Development with Application Default Credentials

```bash
# One-time setup: log in as your human account
gcloud auth login

# Create local ADC (this is what client libraries use)
gcloud auth application-default login

# Set the project for downstream commands
gcloud config set project my-project
gcloud auth application-default set-quota-project my-project
```

```python
# No credentials in code — ADC is picked up automatically
from google.cloud import storage

client = storage.Client()  # uses ~/.config/gcloud/application_default_credentials.json
for blob in client.list_blobs("my-bucket"):
    print(blob.name)
```

ADC search order:
1. `GOOGLE_APPLICATION_CREDENTIALS` env var (path to a credential config or key JSON file)
2. The file from `gcloud auth application-default login` (cloud-platform scope unless you pass `--scopes`)
3. Attached service account on the runtime (GCE, Cloud Run, GKE, etc.)

### Service Account Impersonation (Local Dev, Production-Like)

Never download service account keys for local testing. Impersonate instead.

```bash
# Grant your user the Token Creator role on the target service account
gcloud iam service-accounts add-iam-policy-binding \
  prod-deploy@my-project.iam.gserviceaccount.com \
  --member="user:dana.okafor@northwind-labs.com" \
  --role="roles/iam.serviceAccountTokenCreator"

# Use impersonation for one command
gcloud storage buckets list \
  --impersonate-service-account=prod-deploy@my-project.iam.gserviceaccount.com

# Or set ADC to use impersonation persistently
gcloud auth application-default login \
  --impersonate-service-account=prod-deploy@my-project.iam.gserviceaccount.com
```

### Production: Attached Service Accounts

```bash
# Cloud Run
gcloud run deploy api \
  --image=us-central1-docker.pkg.dev/my-project/repo/api:v1 \
  --region=us-central1 \
  --service-account=api-runtime@my-project.iam.gserviceaccount.com

# Compute Engine
gcloud compute instances create web-1 \
  --zone=us-central1-a \
  --service-account=web-runtime@my-project.iam.gserviceaccount.com \
  --scopes=cloud-platform

# Cloud Run functions (formerly Cloud Functions 2nd gen)
gcloud functions deploy process-events \
  --gen2 --region=us-central1 \
  --runtime=python313 \
  --trigger-topic=events \
  --service-account=events-runtime@my-project.iam.gserviceaccount.com
```

The runtime fetches a short-lived OAuth token from the local metadata server — application code calls `google.auth.default()` and just works.

### Workload Identity Federation for GKE

Autopilot clusters have it enabled already. On Standard clusters enable it on the cluster and on node pools:

```bash
gcloud container clusters update prod-cluster \
  --region=us-central1 \
  --workload-pool=my-project.svc.id.goog

gcloud container node-pools update default-pool \
  --cluster=prod-cluster --region=us-central1 \
  --workload-metadata=GKE_METADATA
```

Current best practice is to grant roles directly to the Kubernetes ServiceAccount principal, with no Google service account in between:

```bash
gcloud projects add-iam-policy-binding my-project \
  --role="roles/storage.objectViewer" \
  --member="principal://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/my-project.svc.id.goog/subject/ns/default/sa/orders-api"
```

If a Google API does not yet support principal identifiers, fall back to the older annotation method: bind a Google service account and annotate the Kubernetes ServiceAccount.

```bash
gcloud iam service-accounts add-iam-policy-binding \
  orders-api@my-project.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:my-project.svc.id.goog[default/orders-api]"
```

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders-api
  namespace: default
  annotations:
    iam.gke.io/gcp-service-account: orders-api@my-project.iam.gserviceaccount.com
```

### Workload Identity Federation for AWS / Azure / On-Prem

```bash
# Create a workload identity pool
gcloud iam workload-identity-pools create aws-pool \
  --location=global --display-name="AWS Pool"

# Add an AWS provider
gcloud iam workload-identity-pools providers create-aws aws \
  --location=global \
  --workload-identity-pool=aws-pool \
  --account-id=123456789012

# Bind an AWS IAM role to a GSA
gcloud iam service-accounts add-iam-policy-binding \
  cross-cloud-reader@my-project.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/aws-pool/attribute.aws_role/arn:aws:sts::123456789012:assumed-role/AppRole"

# Generate the credential config file the AWS workload points ADC at
gcloud iam workload-identity-pools create-cred-config \
  projects/123456789012/locations/global/workloadIdentityPools/aws-pool/providers/aws \
  --service-account=cross-cloud-reader@my-project.iam.gserviceaccount.com \
  --aws --output-file=gcp-credential-config.json
# Then set GOOGLE_APPLICATION_CREDENTIALS=gcp-credential-config.json on the AWS workload
```

The file holds no secret (it only describes how to exchange AWS credentials), unlike a service account key. The same pool pattern works for Azure (`providers create-oidc`) and GitHub Actions or other OIDC issuers.

### OIDC ID Tokens for Service-to-Service Calls

```python
# Service A (Cloud Run) calling Service B (private Cloud Run)
import google.auth.transport.requests
import google.oauth2.id_token
import requests

audience = "https://orders-api-xyz-uc.a.run.app"
auth_req = google.auth.transport.requests.Request()
id_token = google.oauth2.id_token.fetch_id_token(auth_req, audience)

response = requests.get(
    f"{audience}/orders/123",
    headers={"Authorization": f"Bearer {id_token}"},
)
print(response.json())
```

```bash
# Grant Cloud Run invoker on Service B to Service A's service account
gcloud run services add-iam-policy-binding orders-api \
  --region=us-central1 \
  --member="serviceAccount:caller-runtime@my-project.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### API Keys (Limited Use Cases)

```bash
# Create an API key restricted to a specific API and HTTP referrer
gcloud services api-keys create \
  --display-name="maps-frontend" \
  --api-target=service=maps-backend.googleapis.com \
  --allowed-referrers="https://app.northwind-labs.com/*"
```

Store the key in Secret Manager, never commit to git, and always restrict it.
## Examples

### Example 1 — Get a developer set up to call BigQuery

User clones the repo and needs to run integration tests locally. Walk them through `gcloud auth application-default login`, `gcloud config set project my-project`, and `gcloud auth application-default set-quota-project my-project`. Confirm the Python BigQuery client picks up ADC with no code changes. If they need to act as a service account, set up impersonation rather than handing them a JSON key.

### Example 2 — Migrate a GKE workload off a JSON key Secret

User's deployment mounts a service account JSON key as a Kubernetes Secret. Confirm Workload Identity Federation is on (Autopilot has it; Standard needs `--workload-pool`), then grant the needed roles directly to the `principal://.../subject/ns/default/sa/orders-api` identity of the Kubernetes ServiceAccount, redeploy without the Secret mount, and delete the Secret and the underlying key. Only if the Google API does not accept principal identifiers, fall back to a Google service account with `roles/iam.workloadIdentityUser` and the `iam.gke.io/gcp-service-account` annotation.

## Guidelines

- **Never download service account keys** — use impersonation, attached SAs, or Workload Identity Federation
- **Never use the Compute Engine default service account** (or the default Cloud Run runtime identity, which is that account) in production — create a dedicated, least-privilege SA per workload
- For local dev, **ADC + impersonation** is the only acceptable pattern
- Use **Workload Identity Federation for GKE** — JSON keys mounted as Secrets are a security anti-pattern
- For service-to-service calls, use **OIDC ID tokens**, not API keys or shared secrets
- **Restrict API keys** by API, IP, and HTTP referrer; store them in Secret Manager
- Compute Engine VMs and GKE node pools have **OAuth access scopes** that override IAM — check these first if attached SA calls fail unexpectedly
- Prefer **predefined roles** over custom roles; use custom only when predefined are too broad
- Audit service account usage via Cloud Audit Logs and the Recommender's "unused service accounts" insight
