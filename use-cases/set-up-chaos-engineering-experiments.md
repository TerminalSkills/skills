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

Marta's 30-person fintech team runs 12 microservices in Kubernetes. They have never tested what happens when the payment gateway times out, when a database replica goes down, or when network latency spikes between services. The assumption is that everything will hold -- until it doesn't.

Last month, a 90-second Redis outage cascaded into 45 minutes of downtime. No circuit breaker was configured. The payment service kept hammering Redis with retries, exhausting its connection pool, which caused it to reject new requests, which backed up the API gateway, which started returning 502s to every user. Ninety seconds of Redis being unavailable turned into 45 minutes of complete service failure.

The team knows they need chaos engineering. But nobody has time to learn Chaos Mesh or LitmusChaos from scratch, write experiment definitions, and figure out safe blast radius limits -- especially when getting it wrong could cause the exact kind of outage they are trying to prevent.

## The Solution

Using the **coding-agent**, **docker-helper**, and **cicd-pipeline** skills, this walkthrough maps failure modes by business impact, generates Chaos Mesh experiments with safe blast radius limits, builds a local test environment with toxiproxy for safe iteration, and integrates chaos tests into the CI pipeline so resilience gets verified on every deploy.

## Step-by-Step Walkthrough

### Step 1: Map Failure Modes by Business Impact

Before injecting any chaos, Marta needs a catalog of what could go wrong and how much it would hurt. She describes the architecture:

```text
We run 12 microservices on Kubernetes. Critical path: API gateway -> auth-service -> payment-service -> PostgreSQL. We also depend on Redis for session caching and RabbitMQ for async jobs. List the top 10 failure scenarios we should test, ranked by business impact.
```

The failure catalog comes back ranked by revenue and user impact:

| Rank | Failure Scenario | Impact |
|------|------------------|--------|
| 1 | payment-service to PostgreSQL connection timeout | Direct revenue loss |
| 2 | Redis cluster complete outage | Session loss for all users |
| 3 | auth-service latency spike >5s | Cascading timeout to all services |
| 4 | RabbitMQ partition between nodes | Job duplication risk |
| 5 | API gateway memory pressure | OOMKill, total outage |
| 6 | payment-service pod crash during transaction | Partial transaction risk |
| 7 | DNS resolution failure between services | Silent request failures |
| 8 | Network partition: payment-service to auth-service | Auth bypass or hard failure |
| 9 | Disk pressure on PostgreSQL primary | Write failures, replication lag |
| 10 | Certificate expiry on internal mTLS | Service-to-service comm breakdown |

This is where it gets interesting: scenario #1 is almost exactly what happened with Redis, just with PostgreSQL instead. If the same lack of circuit breakers exists on the database connection, the same cascade will happen again.

### Step 2: Define Steady-State Hypotheses

Before running any experiment, you need to know what "normal" looks like. Otherwise there is no way to tell if the system survived:

```text
For each of the top 3 experiments, define a steady-state hypothesis with specific metrics. What response times, error rates, and throughput numbers should hold true even under failure conditions?
```

**Scenario 1 -- Payment DB latency:**
- Payment API p99 latency stays under 2s (current baseline: 340ms)
- Error rate stays below 1% (current: 0.02%)
- No transactions are lost (consistency check via reconciliation query)

**Scenario 2 -- Redis outage:**
- Users with active sessions can still access the app (graceful degradation)
- Session recreation rate stays under 50/min
- No data corruption in session store after recovery

**Scenario 3 -- Auth service latency:**
- Circuit breaker trips within 10s of detecting >3s latency
- Downstream services return cached auth tokens for up to 60s
- No cascading timeouts beyond the auth boundary

These hypotheses define success. If the system holds these numbers under fault injection, the architecture is resilient. If it doesn't, the experiment just found a bug before production did.

### Step 3: Generate the First Experiment

Marta starts with the highest-impact scenario:

```text
Generate a Chaos Mesh experiment for scenario 1: inject a 30-second network delay between payment-service and PostgreSQL. The blast radius should be 1 pod only. Include a rollback mechanism and steady-state hypothesis.
```

The experiment definition targets a single payment-service pod with a 30-second latency injection to all PostgreSQL traffic, running for 2 minutes total:

```yaml
# chaos-experiments/payment-db-latency.yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: payment-db-latency
  namespace: chaos-testing
spec:
  action: delay
  mode: one              # Only 1 pod affected — safe blast radius
  selector:
    labelSelectors:
      app: payment-service
  delay:
    latency: "30s"
  duration: "120s"        # Auto-reverts after 2 minutes
  target:
    selector:
      labelSelectors:
        app: postgresql
    mode: all
```

The `mode: one` setting is critical -- it ensures only a single pod gets the fault injection. If the payment service has 4 replicas, 3 continue operating normally. The `duration: 120s` means Chaos Mesh automatically removes the fault after 2 minutes even if someone forgets to stop the experiment.

### Step 4: Test Locally Before Touching Staging

Running chaos experiments directly against staging is risky when you don't know how the system will react. A local environment with controlled fault injection is safer for the first round:

```text
Create a docker-helper setup that mimics our payment-service -> PostgreSQL flow so we can run the chaos experiment locally before touching staging.
```

The docker-helper file spins up the payment service, a PostgreSQL instance, and toxiproxy sitting between them. Toxiproxy lets Marta inject the same latency fault locally:

```bash
# Add 30-second latency to the PostgreSQL connection
toxiproxy-cli toxic add -t latency -a latency=30000 postgres_proxy
```

This is where the team discovers the first real finding: the payment service has no connection retry logic. On the first timeout, it crashes. No circuit breaker, no graceful degradation -- just an unhandled exception that kills the process. In production, Kubernetes would restart the pod, but during the restart window all in-flight transactions would fail.

### Step 5: Fix and Re-Test, Then Integrate into CI

After adding retry logic and a circuit breaker to the payment service, the local chaos experiment passes cleanly -- the service degrades to slower responses but stays alive and processes transactions.

Now the experiments move into the CI pipeline:

```text
Add a chaos testing stage to our GitHub Actions pipeline that runs the top 3 experiments against staging after every deployment, with automatic rollback if error rate exceeds 5%.
```

Every staging deploy now runs a 2-minute resilience check. The pipeline injects each of the top 3 faults, monitors the steady-state hypotheses, and fails the deploy if any hypothesis is violated. The team catches resilience regressions the same way they catch test failures -- before the code reaches production.

## Real-World Example

Two weeks after setting up the chaos pipeline, a developer pushes a change that refactors the database connection pooling in the payment service. The code passes all unit and integration tests. But the chaos test at the CI stage catches something: under the simulated PostgreSQL latency, the new connection pool exhausts itself in 40 seconds instead of gracefully queuing requests. The circuit breaker never trips because the pool exhaustion happens at a layer below it.

The developer adds pool overflow handling, the chaos test passes, and the deploy goes through. Without the experiment, this would have been another 45-minute cascading outage -- discovered at 3 AM instead of during a CI run.

Marta tracks the numbers over the first quarter: the chaos pipeline has caught 3 resilience regressions, all at the CI stage. Zero cascading outages in production. The 90-second-to-45-minute Redis incident that started this project has not repeated.
