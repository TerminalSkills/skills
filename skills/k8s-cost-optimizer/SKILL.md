---
name: k8s-cost-optimizer
description: >-
  Analyzes Kubernetes cluster resource allocation versus actual usage to find
  waste and generate right-sizing recommendations. Use when someone asks about
  Kubernetes costs, overprovisioned pods, resource requests/limits tuning,
  cluster efficiency, or cloud bill reduction for K8s workloads. Trigger words:
  k8s costs, pod resources, right-size, overprovisioned, resource waste,
  cluster optimization, CPU/memory requests.
license: Apache-2.0
compatibility: "Requires kubectl access to target cluster and metrics-server installed"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["kubernetes", "cost-optimization", "resource-management", "finops"]
---

# Kubernetes Cost Optimizer

## Overview

This skill audits Kubernetes clusters for resource inefficiency by comparing requested CPU/memory against actual usage from metrics-server. It identifies zombie deployments, overprovisioned workloads, and generates kustomize-compatible patches for right-sizing with safety buffers.

## Instructions

### Step 1: Verify Cluster Access and Metrics Availability

Run `kubectl cluster-info` and `kubectl top nodes` to confirm connectivity and that metrics-server is running. If metrics-server is unavailable, inform the user and suggest installing it first (see the kubernetes-sigs/metrics-server install manifest or Helm chart). All steps here are read-only; only `get` and `top` are needed.

### Step 2: Collect Resource Data

For each namespace (or user-specified namespaces):

```bash
# Get resource requests/limits for all pods
kubectl get pods --all-namespaces -o json | jq '[.items[] | {
  namespace: .metadata.namespace,
  pod: .metadata.name,
  containers: [.spec.containers[] | {
    name: .name,
    cpu_request: .resources.requests.cpu,
    cpu_limit: .resources.limits.cpu,
    mem_request: .resources.requests.memory,
    mem_limit: .resources.limits.memory
  }]
}]'

# Get actual usage right now (a single point-in-time sample from metrics-server)
kubectl top pods --all-namespaces --containers --no-headers
```

`kubectl top` has no history, so it cannot give a p99. For a real baseline, query Prometheus over 7-14 days (`container_cpu_usage_seconds_total` rate and `container_memory_working_set_bytes` per container), or read recommendations from the Vertical Pod Autoscaler running with `updateMode: "Off"` (Goldilocks creates these VPAs per namespace and shows them in a dashboard). OpenCost gives allocation-based cost per namespace and workload.

### Step 3: Calculate Efficiency Ratios

For each deployment, compute:
- **Efficiency** = actual_usage / requested × 100
- **Waste** = 100 - efficiency
- **Monthly cost estimate** = (requested_cpu × node_cost_per_cpu) + (requested_mem × node_cost_per_gi)

Derive unit prices from the user's real node price. If none is given, assume a rough split: half of the node's hourly price to CPU, half to memory. Example: m5.large (2 vCPU, 8 GiB) at about $0.096/hour on-demand in AWS us-east-1 gives ~$0.024/vCPU-hour and ~$0.006/GiB-hour. Convert to monthly by multiplying hourly by 730, and say these are estimates.

### Step 4: Identify Zombie Workloads

Flag deployments where:
- CPU usage is < 1m (1 millicore) for 7+ days
- Pods are Running with no restarts but receive no traffic (check Service endpoints, ingress or request metrics)
- Namespace matches staging/dev/preview patterns

### Step 5: Generate Right-Sizing Recommendations

For each overprovisioned workload:
1. Take the p99 usage from Prometheus or the VPA recommendation (ideally 14 days, including peaks)
2. Add a configurable headroom buffer (default: 30%)
3. Set requests = p99 + buffer. Memory: set the limit equal to the request (memory is not compressible, exceeding it means OOMKill). CPU: prefer no limit, or a generous one, because tight CPU limits cause throttling
4. Output as kustomize patches or plain YAML diffs

### Step 6: Produce Summary Report

Format a table showing:
- Top waste offenders sorted by estimated monthly savings
- Total cluster waste percentage
- Projected annual savings
- Risk assessment (low/medium/high) for each recommendation

## Examples

### Example 1: Namespace Audit

**User prompt:**
```
Audit the api-services namespace for resource waste
```

**Agent output:**
```
Resource Audit: api-services namespace
───────────────────────────────────────

Deployment          Replicas  CPU Req→Used   Mem Req→Used    Efficiency  Est. Waste
user-auth           3         500m→120m      1Gi→340Mi       26%         $85/mo
order-processor     2         1000m→650m     2Gi→1.4Gi       68%         $31/mo
email-worker        2         250m→15m       512Mi→80Mi      8%          $42/mo

Recommendations:
1. email-worker: Reduce to 1 replica, set requests to cpu:50m/mem:150Mi → saves $42/mo
2. user-auth: Set requests to cpu:180m/mem:500Mi → saves $68/mo
3. order-processor: Requests are reasonable, minor trim to cpu:850m → saves $12/mo

Total potential savings: $122/month ($1,464/year)
```

### Example 2: Zombie Detection

**User prompt:**
```
Find unused deployments across all namespaces
```

**Agent output:**
```
Zombie Workloads Detected
─────────────────────────

Namespace: staging
  ✗ feature-auth-v2      2 replicas  CPU: 0m  Last deploy: 2025-09-14  → $28/mo wasted
  ✗ hotfix-payment-flow   1 replica   CPU: 0m  Last deploy: 2025-10-02  → $14/mo wasted
  ✗ demo-dashboard        3 replicas  CPU: 0m  Last deploy: 2025-07-28  → $42/mo wasted

Namespace: dev
  ✗ test-migration        1 replica   CPU: 0m  Last deploy: 2025-11-18  → $14/mo wasted

Suggested cleanup:
  kubectl delete deployment feature-auth-v2 hotfix-payment-flow demo-dashboard -n staging
  kubectl delete deployment test-migration -n dev

Total zombie cost: $98/month
```

## Guidelines

- **Never auto-apply changes** — always present recommendations for human review
- **Safety buffer is critical** — default 30% headroom prevents OOMKills after right-sizing
- **Prioritize by savings** — show the biggest wins first so users focus effort where it matters
- **Account for traffic patterns** — warn if usage data covers less than 7 days or misses peak periods
- **VPA and HPA conflict** — do not let VPA in auto mode and an HPA scale on the same CPU/memory metric
- **Consider HPA** — if a deployment has a HorizontalPodAutoscaler, note that right-sizing requests affects scaling thresholds
- **Staging vs production** — be more aggressive with staging recommendations, more conservative with production
- **Cost estimates are approximate** — note the instance type assumptions and suggest the user verify with their actual pricing
