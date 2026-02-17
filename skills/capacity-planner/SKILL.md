---
name: capacity-planner
description: >-
  Translates performance test results into infrastructure scaling
  recommendations with cost estimates. Use when someone has load test data
  and needs to know what infrastructure changes are required to handle
  target traffic. Trigger words: capacity planning, scaling plan, infrastructure
  sizing, how many pods, RDS sizing, handle more traffic, scale for launch.
license: Apache-2.0
compatibility: "Works with any load test output; cost estimates default to AWS pricing"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["capacity-planning", "scaling", "infrastructure", "cost-estimation"]
---

# Capacity Planner

## Overview

This skill takes performance test results (breaking points, latency data, error patterns) and produces actionable infrastructure scaling recommendations. It identifies bottlenecks, recommends specific resource changes, estimates costs, and generates verification criteria.

## Instructions

### Step 1: Gather Current State

Ask or determine:
- Current infrastructure specs (pod count, instance types, DB size, cache config)
- Current sustainable RPS and latency at that level
- Breaking point from load tests (RPS or VU count where SLOs break)
- Target traffic (expressed as RPS, concurrent users, or multiplier like "3x")

### Step 2: Identify Bottleneck Layer

From load test error patterns, determine the primary bottleneck:

| Error Pattern | Likely Bottleneck |
|---|---|
| Timeouts increasing gradually | CPU saturation on application pods |
| Sudden spike in 5xx errors | Database connection pool exhaustion |
| Connection refused errors | Pod/instance limit reached |
| Slow first byte, fast transfer | Database query latency |
| Memory-related crashes | Application memory leak or undersized instances |
| Intermittent 503s | Load balancer target limits |

### Step 3: Calculate Required Resources

Use linear scaling as baseline, then apply correction factors:

```
Required pods = current_pods × (target_RPS / current_max_RPS) × 1.3 safety factor
Required DB connections = current_pool × (target_RPS / current_max_RPS) × 1.2
```

Adjust for:
- Database scaling is NOT linear (add read replicas for read-heavy, scale vertically for write-heavy)
- Cache hit rates improve with more traffic (warm cache)
- Connection overhead per pod

### Step 4: Estimate Costs

Use these AWS reference prices (us-east-1, on-demand):

| Resource | Spec | Monthly Cost |
|---|---|---|
| EKS pod (500m/1Gi) | ~0.25 vCPU equiv | ~$35/mo |
| RDS db.r5.large | 2 vCPU, 16 GiB | $274/mo |
| RDS db.r5.xlarge | 4 vCPU, 32 GiB | $548/mo |
| ElastiCache r6g.large | 2 vCPU, 13 GiB | $172/mo |
| RDS Read Replica | Same as primary instance | Same cost |
| ALB | Base + LCU | ~$25-50/mo |

Note: actual costs vary by region, reserved instances, and savings plans.

### Step 5: Produce Scaling Plan

Format as actionable items with:
1. What to change (specific resource, config parameter)
2. Current value → target value
3. Why (which bottleneck it addresses)
4. Cost impact
5. Implementation order (dependencies between changes)
6. Verification criteria (what to re-test after)

## Examples

### Example 1: Pre-Launch Scaling Plan

**User prompt:**
```
We break at 400 RPS with 3 pods and RDS db.r5.large. Need to handle 1200 RPS for launch.
```

**Agent output:**
```
Capacity Plan: 400 → 1,200 RPS
───────────────────────────────

Step  Change                           Cost Delta   Addresses
1     DB pool_size: 20 → 80            $0           Connection exhaustion (primary bottleneck)
2     RDS: db.r5.large → db.r5.2xlarge +$822/mo     Write throughput + connections
3     Add RDS read replica             +$1,096/mo   Read query offloading
4     API pods: 3 → 10 (HPA min=7)    +$245/mo     Request processing capacity
5     Redis: r6g.medium → r6g.xlarge   +$258/mo     Session/cache throughput

Total additional cost: $2,421/month
Implementation order: 1 → 2 → 3 → 4 → 5 (each step unblocks the next)

Verification: Re-run load test after each step. Expected milestones:
  After step 1-2: Breaking point moves to ~700 RPS
  After step 3: Breaking point moves to ~1,000 RPS
  After step 4-5: Target 1,200 RPS with p95 < 500ms
```

### Example 2: Cost-Optimized Scaling

**User prompt:**
```
We need to handle 2x traffic but leadership wants minimal cost increase.
```

**Agent output:**
```
Cost-Optimized Scaling Plan (2x traffic)
────────────────────────────────────────

FREE WINS (configuration only)
  1. Increase DB connection pool: 20 → 40          +0$/mo  Impact: +30% throughput
  2. Enable gzip compression on API responses       +0$/mo  Impact: -40% bandwidth
  3. Add Redis caching for GET /api/products (TTL 60s) +0$/mo  Impact: -50% DB reads

LOW COST
  4. Add 2 API pods (3 → 5)                        +$70/mo
  5. Enable RDS query cache                         +$0/mo

Expected result: 1.8-2.2x capacity at +$70/month
Tradeoff: Less headroom than full scaling. If traffic exceeds 2.2x, latency degrades.
```

## Guidelines

- **Bottleneck first** — always identify and fix the bottleneck before adding horizontal capacity; more pods don't help if the database is the limit
- **Implementation order matters** — scaling changes often have dependencies; present them in the right sequence
- **Include verification criteria** — every change should have a "how to confirm it worked" test
- **Cost transparency** — always show per-item cost changes and total monthly impact
- **Safety margins** — recommend 30% headroom over target for unexpected spikes
- **Distinguish read vs write scaling** — reads scale with replicas/cache; writes require vertical scaling or sharding
- **Consider the free wins first** — configuration changes (pool sizes, caching, compression) often provide significant gains at zero cost
