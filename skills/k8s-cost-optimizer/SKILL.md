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
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["kubernetes", "cost-optimization", "resource-management", "finops"]
---

# Kubernetes Cost Optimizer

## Overview

This skill audits Kubernetes clusters for resource inefficiency by comparing requested CPU/memory against actual usage from metrics-server. It identifies zombie deployments, overprovisioned workloads, and generates kustomize-compatible patches for right-sizing with safety buffers.

## Instructions

### Step 1: Verify Cluster Access and Metrics Availability

Run `kubectl cluster-info` and `kubectl top nodes` to confirm connectivity and that metrics-server is running. If metrics-server is unavailable, inform the user and suggest installing it first.

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

# Get actual usage
kubectl top pods --all-namespaces --no-headers
```

### Step 3: Calculate Efficiency Ratios

For each deployment, compute:
- **Efficiency** = actual_usage / requested × 100
- **Waste** = 100 - efficiency
- **Monthly cost estimate** = (requested_cpu × node_cost_per_cpu) + (requested_mem × node_cost_per_gi)

Use these reference prices if the user doesn't specify:
- On-demand: ~$0.0425/vCPU-hour, ~$0.0057/GiB-hour (AWS us-east-1 m5 family)
- Convert to monthly: multiply hourly by 730

### Step 4: Identify Zombie Workloads

Flag deployments where:
- CPU usage is < 1m (1 millicore) for 7+ days
- Pod restart count is 0 and replicas are running
- Namespace matches staging/dev/preview patterns

### Step 5: Generate Right-Sizing Recommendations

For each overprovisioned workload:
1. Take the p99 usage over available history (ideally 14 days)
2. Add a configurable headroom buffer (default: 30%)
3. Set requests = p99 + buffer, limits = requests × 1.5
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
- **Consider HPA** — if a deployment has a HorizontalPodAutoscaler, note that right-sizing requests affects scaling thresholds
- **Staging vs production** — be more aggressive with staging recommendations, more conservative with production
- **Cost estimates are approximate** — note the instance type assumptions and suggest the user verify with their actual pricing
