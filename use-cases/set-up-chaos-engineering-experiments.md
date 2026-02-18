---
title: "Set Up Chaos Engineering Experiments with AI"
slug: set-up-chaos-engineering-experiments
description: "Design and implement chaos engineering experiments to test system resilience before failures happen in production."
skills: [coding-agent, docker-helper, cicd-pipeline]
category: devops
tags: [chaos-engineering, resilience, reliability, testing, infrastructure]
---

# Set Up Chaos Engineering Experiments with AI

## The Problem

A 30-person fintech team runs 12 microservices in Kubernetes. They have never tested what happens when the payment gateway times out, when a database replica goes down, or when network latency spikes between services. Last month, a 90-second Redis outage cascaded into 45 minutes of downtime because no circuit breaker was configured. The team knows they need chaos engineering but nobody has time to learn Chaos Mesh or LitmusChaos from scratch, write experiment definitions, and figure out safe blast radius limits.

## The Solution

Use the **coding-agent** skill to generate chaos experiment configurations, the **docker-helper** skill to set up local chaos testing environments, and the **cicd-pipeline** skill to integrate chaos tests into the deployment pipeline.

## Step-by-Step Walkthrough

### 1. Map your failure modes

Start by telling the agent about your architecture:

```text
We run 12 microservices on Kubernetes. Critical path: API gateway → auth-service → payment-service → PostgreSQL. We also depend on Redis for session caching and RabbitMQ for async jobs. List the top 10 failure scenarios we should test, ranked by business impact.
```

### 2. The agent produces a failure catalog

```text
Failure Scenarios (ranked by impact):
1. payment-service → PostgreSQL connection timeout (revenue impact: direct)
2. Redis cluster complete outage (session loss for all users)
3. auth-service latency spike >5s (cascading timeout to all services)
4. RabbitMQ partition between nodes (job duplication risk)
5. API gateway memory pressure (OOMKill → total outage)
6. payment-service pod crash during transaction
7. DNS resolution failure between services
8. Network partition: payment-service ↔ auth-service
9. Disk pressure on PostgreSQL primary
10. Certificate expiry on internal mTLS
```

### 3. Generate experiment definitions

Pick the first experiment:

```text
Generate a Chaos Mesh experiment for scenario 1: inject a 30-second network delay between payment-service and PostgreSQL. The blast radius should be 1 pod only. Include a rollback mechanism and steady-state hypothesis.
```

### 4. The agent writes the experiment

The agent produces a complete YAML definition with annotations, steady-state probes, and automatic rollback:

```yaml
# chaos-experiments/payment-db-latency.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: payment-db-latency
  namespace: chaos-testing
spec:
  action: delay
  mode: one
  selector:
    labelSelectors:
      app: payment-service
  delay:
    latency: "30s"
  duration: "120s"
  target:
    selector:
      labelSelectors:
        app: postgresql
    mode: all
```

### 5. Define steady-state hypotheses

Before running any experiment, you need to know what "normal" looks like:

```text
For each of the top 3 experiments, define a steady-state hypothesis with specific metrics. What response times, error rates, and throughput numbers should hold true even under failure conditions?
```

```text
Steady-State Hypotheses:
1. Payment DB latency test:
   - Payment API p99 latency stays under 2s (current baseline: 340ms)
   - Error rate stays below 1% (current: 0.02%)
   - No transactions are lost (consistency check via reconciliation query)

2. Redis outage test:
   - Users with active sessions can still access the app (graceful degradation)
   - Session recreation rate stays under 50/min
   - No data corruption in session store after recovery

3. Auth service latency test:
   - Circuit breaker trips within 10s of detecting >3s latency
   - Downstream services return cached auth tokens for up to 60s
   - No cascading timeouts beyond the auth boundary
```

### 6. Set up a safe local test first

```text
Create a docker-compose setup that mimics our payment-service → PostgreSQL flow so we can run the chaos experiment locally before touching staging.
```

The agent generates a docker-compose file with the payment service, a PostgreSQL instance, and toxiproxy for fault injection.

### 7. Integrate into CI pipeline

```text
Add a chaos testing stage to our GitHub Actions pipeline that runs the top 3 experiments against staging after every deployment, with automatic rollback if error rate exceeds 5%.
```

## Real-World Example

Marta, an SRE at a 30-person fintech team, needs to prove the system can survive a database failover before the team migrates to a multi-region setup.

1. Marta asks the agent to catalog failure modes based on the architecture — it identifies 10 scenarios in priority order
2. She picks the top 3 and the agent generates Chaos Mesh YAML definitions with steady-state hypotheses and rollback rules
3. The agent creates a local docker-compose environment with toxiproxy so the team can validate experiments safely
4. Running locally, they discover the payment service has no connection retry logic — it crashes on the first timeout
5. After fixing the retry logic, Marta has the agent add chaos tests to the CI pipeline — now every staging deploy runs a 2-minute resilience check automatically
