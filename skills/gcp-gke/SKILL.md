---
name: gcp-gke
description: |
  Provision and operate production-ready Google Kubernetes Engine (GKE)
  clusters using Autopilot as the golden path. Covers Autopilot vs Standard,
  private clusters, Workload Identity, autoscaling, GPU/TPU node pools for AI
  inference, cost optimization with Spot VMs, and observability via Managed
  Prometheus.
license: Apache-2.0
compatibility: 'gcloud-cli, kubectl, terraform'
metadata:
  author: google-cloud
  version: 1.0.0
  category: devops
  tags:
    - gcp
    - gke
    - kubernetes
    - autopilot
    - workload-identity
---

# GCP Google Kubernetes Engine (GKE)

## Overview

GKE is Google Cloud's managed Kubernetes platform. It runs the control plane for you, automates upgrades, and ships two operating modes: **Autopilot** (Google manages nodes; pay per pod) and **Standard** (you manage node pools; pay per node). Default to Autopilot — it eliminates node-level toil and is the recommended golden path for production.

## Instructions

### Autopilot vs Standard

| | Autopilot | Standard |
|---|---|---|
| Node management | Google | You |
| Billing model | Per-pod resources | Per-node VM |
| Node pool config | None | You configure |
| Best for | Most workloads | DaemonSets, GPUs with custom drivers, privileged pods |
| Workload Identity | Required | Recommended |

Use Standard only when you genuinely need node-level access (custom kernel, certain GPU configs, privileged DaemonSets). Otherwise, Autopilot.

### Quick Start (Autopilot)

```bash
gcloud services enable container.googleapis.com

gcloud container clusters create-auto prod-cluster \
  --region=us-central1 \
  --release-channel=regular \
  --enable-private-nodes \
  --network=default --subnetwork=default

gcloud container clusters get-credentials prod-cluster --region=us-central1

kubectl create deployment hello \
  --image=us-docker.pkg.dev/google-samples/containers/gke/hello-app:1.0
kubectl expose deployment hello --port=80 --target-port=8080 --type=LoadBalancer
```

### Production Cluster Defaults

```bash
gcloud container clusters create-auto prod-cluster \
  --region=us-central1 \
  --release-channel=regular \
  --enable-private-nodes \
  --enable-master-authorized-networks \
  --master-authorized-networks=10.0.0.0/8,YOUR_OFFICE_CIDR \
  --network=prod-vpc --subnetwork=prod-subnet \
  --cluster-secondary-range-name=pods \
  --services-secondary-range-name=services \
  --workload-pool=my-project.svc.id.goog \
  --enable-shielded-nodes
```

### Workload Identity (Pods → GCP APIs without keys)

```bash
# Create a Google Service Account for the workload
gcloud iam service-accounts create orders-api

gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:orders-api@my-project.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Bind the Kubernetes ServiceAccount to the GSA
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
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: orders-api }
  template:
    metadata:
      labels: { app: orders-api }
    spec:
      serviceAccountName: orders-api  # → maps to GSA via Workload Identity
      containers:
        - name: api
          image: us-central1-docker.pkg.dev/my-project/repo/orders-api:v1.4.2
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
```

### Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-api
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
    - type: Resource
      resource:
        name: memory
        target: { type: Utilization, averageUtilization: 80 }
```

```yaml
# PodDisruptionBudget — keep service available during voluntary disruptions
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api
spec:
  minAvailable: 2
  selector:
    matchLabels: { app: orders-api }
```

### Gateway API (Modern Ingress)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-gateway
spec:
  gatewayClassName: gke-l7-global-external-managed
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: api-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: orders-route
spec:
  parentRefs: [{ name: external-gateway }]
  hostnames: ["api.example.com"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: "/orders" } }]
      backendRefs:
        - name: orders-api
          port: 80
```

### GPU Inference Workload (Standard Mode)

```bash
# Create a node pool with L4 GPUs and Spot VMs for cheap inference
gcloud container node-pools create inference-l4 \
  --cluster=ml-cluster --region=us-central1 \
  --machine-type=g2-standard-8 \
  --accelerator=type=nvidia-l4,count=1,gpu-driver-version=LATEST \
  --num-nodes=0 --enable-autoscaling --min-nodes=0 --max-nodes=10 \
  --spot --node-taints=workload=inference:NoSchedule
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: vllm-llama }
spec:
  replicas: 1
  selector: { matchLabels: { app: vllm } }
  template:
    metadata: { labels: { app: vllm } }
    spec:
      tolerations:
        - key: workload
          operator: Equal
          value: inference
          effect: NoSchedule
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-l4
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args: ["--model", "meta-llama/Llama-3-8B-Instruct", "--port", "8000"]
          resources:
            limits:
              nvidia.com/gpu: 1
              memory: "24Gi"
              cpu: "4"
```

### Cost Optimization

```bash
# Spot VMs for fault-tolerant batch
gcloud container node-pools create batch-spot \
  --cluster=prod-cluster --region=us-central1 \
  --machine-type=e2-standard-4 \
  --spot --num-nodes=0 --enable-autoscaling --max-nodes=20

# Compute Class definition (newer alternative to node pools)
```

```yaml
apiVersion: cloud.google.com/v1
kind: ComputeClass
metadata: { name: spot-burst }
spec:
  priorities:
    - machineFamily: n4
      spot: true
    - machineFamily: n2
      spot: true
    - machineFamily: n2  # on-demand fallback
  nodePoolAutoCreation: { enabled: true }
```

### Observability — Managed Prometheus

```yaml
# Scrape app metrics with Google Cloud Managed Service for Prometheus
apiVersion: monitoring.googleapis.com/v1
kind: PodMonitoring
metadata: { name: orders-api }
spec:
  selector:
    matchLabels: { app: orders-api }
  endpoints:
    - port: metrics
      interval: 30s
```
## Examples

### Example 1 — Stand up a production Autopilot cluster

User wants a hardened GKE cluster for a new service. Create an Autopilot cluster on the regular release channel with private nodes, master authorized networks, Workload Identity enabled, and Shielded Nodes. Wire the app's Kubernetes ServiceAccount to a GSA with the minimum IAM roles, deploy via a Deployment + HPA + PDB, and front it with the Gateway API for managed TLS.

### Example 2 — Run a vLLM Llama 3 inference service on Spot L4s

User needs cheap LLM inference. Create a Standard cluster (Autopilot doesn't support custom GPU drivers consistently), add an L4 node pool with `--spot` and autoscaling 0→10, deploy vLLM with a node selector + toleration so only inference pods schedule there, and add Managed Prometheus scraping for token-throughput metrics.

## Guidelines

- **Default to Autopilot** — most workloads should never see a node pool config
- Use the **regular release channel** in production; rapid for staging; stable only for highly conservative orgs
- Always **enable private nodes + master authorized networks**; never expose the API server publicly
- **Workload Identity is mandatory** — never put service account JSON keys in Secrets
- Set resource `requests` AND `limits`; Autopilot rejects pods without them
- Add a **PodDisruptionBudget** to every Deployment that serves traffic
- Use **Spot VMs / Compute Classes** for batch and inference workloads to cut compute cost 60–90%
- Use **Gateway API** for new ingress; the legacy `Ingress` resource is feature-frozen
- Enable **Managed Prometheus** instead of self-hosting Prometheus
- For multi-tenant clusters, isolate teams by namespace + RBAC + ResourceQuota
