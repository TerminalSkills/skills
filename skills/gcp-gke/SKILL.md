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
  version: 1.1.0
  category: devops
  tags: "gcp, gke, kubernetes, autopilot, workload-identity"
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
| Best for | Most workloads, including GPU and Spot via ComputeClasses | Custom kernels or drivers, privileged DaemonSets, node-level tuning |
| Workload Identity Federation | Always on | Enable with `--workload-pool` |

Use Standard only when you genuinely need node-level access (custom kernel, GPU driver pinning, privileged DaemonSets). Autopilot does run GPUs (L4, T4, A100, H100 and others) and Spot Pods. Autopilot sets default resource requests for pods that omit them and bills for what the pod requests.

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
  --master-authorized-networks=10.0.0.0/8,198.51.100.0/24 \
  --network=prod-vpc --subnetwork=prod-subnet \
  --cluster-secondary-range-name=pods \
  --services-secondary-range-name=services
```

`create-auto` has no `--workload-pool` or `--enable-shielded-nodes` flags: Autopilot always has Workload Identity Federation for GKE on, and its nodes are Shielded. The secondary ranges must already exist on the subnet.

### Workload Identity Federation (Pods → Google Cloud APIs without keys)

The recommended way is to grant IAM roles directly to the Kubernetes ServiceAccount's principal. No Google service account and no annotation are needed.

```bash
PROJECT_ID=shop-prod-481516
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --role="roles/cloudsql.client" \
  --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$PROJECT_ID.svc.id.goog/subject/ns/default/sa/orders-api"
```

A few Google Cloud products do not accept federated principals yet. For those, bind a Google service account instead: grant `roles/iam.workloadIdentityUser` on it to `serviceAccount:$PROJECT_ID.svc.id.goog[default/orders-api]` and add the annotation `iam.gke.io/gcp-service-account: orders-api@$PROJECT_ID.iam.gserviceaccount.com` to the Kubernetes ServiceAccount.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders-api
  namespace: default
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
      serviceAccountName: orders-api  # IAM roles granted to this ServiceAccount's principal apply
      containers:
        - name: api
          image: us-central1-docker.pkg.dev/shop-prod-481516/services/orders-api:v1.4.2
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

GKE Gateway is always enabled on Autopilot. On Standard, enable it with `--gateway-api=standard` when creating or updating the cluster. `api-cert` is a Kubernetes TLS Secret in the same namespace.


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
  hostnames: ["api.shopwave.dev"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: "/orders" } }]
      backendRefs:
        - name: orders-api
          port: 80
```

### GPU Inference Workload

On **Autopilot**, request the GPU in the pod; GKE creates the node and installs the driver. Add `gke-spot` for Spot capacity.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: vllm-qwen }
spec:
  replicas: 1
  selector: { matchLabels: { app: vllm } }
  template:
    metadata: { labels: { app: vllm } }
    spec:
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-l4
        cloud.google.com/gke-accelerator-count: "1"
        cloud.google.com/gke-spot: "true"
      terminationGracePeriodSeconds: 15   # Spot Pods get at most 15 s on preemption
      containers:
        - name: vllm
          image: vllm/vllm-openai:v0.32.0
          args: ["--model", "Qwen/Qwen2.5-7B-Instruct", "--port", "8000"]
          ports: [{ containerPort: 8000 }]
          resources:
            requests: { cpu: "4", memory: "24Gi", ephemeral-storage: "30Gi" }
            limits: { nvidia.com/gpu: 1 }
```

Gated models (Llama, Gemma) also need a Hugging Face token: create a Secret and pass it as the `HF_TOKEN` environment variable. Pin the image tag; `latest` changes under you.

On **Standard**, create a GPU node pool yourself:

```bash
gcloud container node-pools create inference-l4 \
  --cluster=ml-cluster --region=us-central1 \
  --machine-type=g2-standard-8 \
  --accelerator=type=nvidia-l4,count=1,gpu-driver-version=latest \
  --num-nodes=0 --enable-autoscaling --min-nodes=0 --max-nodes=10 \
  --spot --node-taints=workload=inference:NoSchedule
```

Then use the same Deployment with `cloud.google.com/gke-accelerator: nvidia-l4` as the node selector, plus a toleration for `workload=inference:NoSchedule` and `nvidia.com/gpu: 1` in limits. Check that your project has L4 GPU quota in the region first.

### Cost Optimization

```bash
# Spot VMs for fault-tolerant batch
gcloud container node-pools create batch-spot \
  --cluster=prod-cluster --region=us-central1 \
  --machine-type=e2-standard-4 \
  --spot --num-nodes=0 --enable-autoscaling --max-nodes=20

```

A ComputeClass lists hardware in priority order and replaces hand-made node pools. Pods opt in with `nodeSelector: { cloud.google.com/compute-class: spot-burst }`.


```yaml
apiVersion: cloud.google.com/v1
kind: ComputeClass
metadata: { name: spot-burst }
spec:
  priorities:
    - machineFamily: n4
      spot: true
    - machineFamily: n2  # on-demand fallback
  whenUnsatisfiable: ScaleUpAnyway
  nodePoolAutoCreation: { enabled: true }   # needed on Standard; Autopilot manages nodes itself
```

### Observability — Managed Prometheus

Managed collection is on by default in Autopilot clusters (GKE 1.25+) and in new Standard clusters on GKE 1.27+; on older Standard clusters, enable it with `--enable-managed-prometheus`.


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

User wants a hardened GKE cluster for a new service. Create an Autopilot cluster on the regular release channel with private nodes, master authorized networks, Workload Identity enabled, and Shielded Nodes. Grant the app's Kubernetes ServiceAccount principal the minimum IAM roles directly, deploy via a Deployment + HPA + PDB, and front it with the Gateway API for managed TLS.

### Example 2 — Run a vLLM Llama 3 inference service on Spot L4s

User needs cheap LLM inference. On Autopilot, deploy vLLM with the L4 + `gke-spot` node selectors shown above (use a Standard cluster with an L4 Spot node pool only if you need to pin drivers), add a PodMonitoring for token-throughput metrics, and handle Spot preemption by keeping `replicas` above one and the model cache on a persistent volume.

## Guidelines

- **Default to Autopilot** — most workloads should never see a node pool config
- Use the **regular release channel** in production; rapid for staging; stable only for highly conservative orgs
- Always **enable private nodes + master authorized networks**; never expose the API server publicly
- **Use Workload Identity Federation** — never put service account JSON keys in Secrets
- Set resource `requests` explicitly: Autopilot bills on them and fills in defaults when they are missing
- Add a **PodDisruptionBudget** to every Deployment that serves traffic
- Use **Spot VMs / Compute Classes** for fault-tolerant batch and inference workloads; Spot capacity can be reclaimed at any time, so design for restarts
- Use **Gateway API** for new ingress; Google documents it as the recommended option over `Ingress`
- Enable **Managed Prometheus** instead of self-hosting Prometheus
- For multi-tenant clusters, isolate teams by namespace + RBAC + ResourceQuota
