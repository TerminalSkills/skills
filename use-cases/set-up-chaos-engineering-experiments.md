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

Using the **coding-agent**, **docker-helper**, and **cicd-pipeline** skills, this walkthrough maps failure modes by business impact, generates Chaos Mesh experiments with safe blast radius limits, builds a local test environment with toxiproxy for safe iteration, and integrates chaos tests into a GitLab CI pipeline so resilience gets verified on every deploy.

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

Chaos Mesh (current release 2.8.7) is installed once per cluster with Helm. On clusters that use containerd, tell the chaos daemon where the socket is:

```console
$ helm repo add chaos-mesh https://charts.chaos-mesh.org
$ helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace --version 2.8.7 \
    --set chaosDaemon.runtime=containerd --set chaosDaemon.socketPath=/run/containerd/containerd.sock
```

Marta starts with the highest-impact scenario:

```text
Generate a Chaos Mesh experiment for scenario 1: inject a 30-second network delay between payment-service and PostgreSQL. The blast radius should be 1 pod only. Include a rollback mechanism and steady-state hypothesis.
```

The experiment definition targets a single payment-service pod in the `payments` namespace with a 30-second latency injection on its traffic towards PostgreSQL, running for 2 minutes total:

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
    namespaces: [payments]   # without this, only the experiment's own namespace is searched
    labelSelectors:
      app: payment-service
  direction: to              # traffic leaving payment-service towards the target
  delay:
    latency: "30s"
  duration: "120s"        # Auto-reverts after 2 minutes
  target:
    mode: all
    selector:
      namespaces: [payments]
      labelSelectors:
        app: postgresql
```

The `mode: one` setting is critical -- it ensures only a single pod gets the fault injection. If the payment service has 4 replicas, 3 continue operating normally. The `duration: 120s` means Chaos Mesh automatically removes the fault after 2 minutes even if someone forgets to stop the experiment.

### Step 4: Test Locally Before Touching Staging

Running chaos experiments directly against staging is risky when you don't know how the system will react. A local environment with controlled fault injection is safer for the first round:

```text
Create a docker-helper setup that mimics our payment-service -> PostgreSQL flow so we can run the chaos experiment locally before touching staging.
```

The docker-helper skill produces a Compose file with PostgreSQL and toxiproxy (ports bound to 127.0.0.1, password from the environment); the payment service is pointed at `127.0.0.1:15432` instead of PostgreSQL directly:

```yaml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:2.13.0
    ports:
      - "127.0.0.1:8474:8474"
      - "127.0.0.1:15432:15432"
    depends_on: [postgres]
```

Marta creates the proxy and injects the same latency fault locally with `toxiproxy-cli` (latency is in milliseconds):

```console
$ toxiproxy-cli create --listen 0.0.0.0:15432 --upstream postgres:5432 postgres_proxy
$ toxiproxy-cli toxic add -t latency -a latency=30000 postgres_proxy
Added downstream latency toxic 'latency_downstream' on proxy 'postgres_proxy'
$ toxiproxy-cli toxic remove -n latency_downstream postgres_proxy
```

This is where the team discovers the first real finding: the payment service has no connection retry logic. On the first timeout, it crashes. No circuit breaker, no graceful degradation -- just an unhandled exception that kills the process. In production, Kubernetes would restart the pod, but during the restart window all in-flight transactions would fail.

### Step 5: Fix and Re-Test, Then Integrate into CI

After adding retry logic and a circuit breaker to the payment service, the local chaos experiment passes cleanly -- the service degrades to slower responses but stays alive and processes transactions.

Now the experiments move into the CI pipeline:

```text
Add a chaos testing stage to our GitLab CI pipeline that runs the top 3 experiments against staging after every deployment, and fails the pipeline if the error rate exceeds 5%.
```

The cicd-pipeline skill produces a job that applies one experiment at a time, runs a steady-state check while the fault is active, and always removes the experiment afterwards:

```yaml
chaos-payment-db-latency:
  stage: chaos
  image: alpine/k8s:1.34.12       # a shell image that includes kubectl
  script:
    - kubectl apply -f chaos-experiments/payment-db-latency.yaml
    - sh scripts/check-steady-state.sh --max-error-rate 0.05 --duration 120   # PROM_URL is a CI variable
  after_script:
    - kubectl delete -f chaos-experiments/payment-db-latency.yaml --ignore-not-found
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

The steady-state check is a short script the coding agent writes into the repo as `scripts/check-steady-state.sh`. It polls the Prometheus HTTP API (`PROM_URL`, a CI variable) for the payment-service 5xx ratio every 10 seconds and exits 1 on the first reading above the limit, or when there is no traffic to measure. The metric and label names in the query (`http_requests_total`, `service`, `code`) are placeholders: use your own. It needs `curl`, `jq` and `awk`, which the `alpine/k8s` image provides.

```sh
#!/bin/sh
# Usage: check-steady-state.sh --max-error-rate 0.05 --duration 120
# Needs PROM_URL (Prometheus base URL). Exits 1 when the 5xx ratio exceeds the limit or there is no traffic to measure.
set -eu
MAX=0.05; DURATION=120
while [ $# -gt 0 ]; do
  case "$1" in
    --max-error-rate) MAX="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    *) echo "unknown flag $1" >&2; exit 2 ;;
  esac
done
QUERY='sum(rate(http_requests_total{service="payment-service",code=~"5.."}[1m])) / sum(rate(http_requests_total{service="payment-service"}[1m]))'
end=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$end" ]; do
  rate=$(curl -fsS --get "$PROM_URL/api/v1/query" --data-urlencode "query=$QUERY" \
    | jq -r '.data.result[0].value[1] // "NaN"')
  echo "error rate: $rate (limit $MAX)"
  if awk -v r="$rate" -v m="$MAX" 'BEGIN { exit !(r == "NaN" || r + 0 > m + 0) }'; then
    echo "steady-state violated" >&2; exit 1
  fi
  sleep "${INTERVAL:-10}"
done
echo "steady state held for ${DURATION}s"
```

`after_script` runs even when the check fails, and the experiment's `duration` removes the fault by itself if the runner dies. The CI service account needs RBAC permission for `networkchaos.chaos-mesh.org` in the `chaos-testing` namespace and nothing else.

Every staging deploy now runs a 2-minute resilience check. The pipeline injects each of the top 3 faults, runs the steady-state check, and fails the pipeline if any hypothesis is violated. The team catches resilience regressions the same way they catch test failures -- before the code reaches production.

## Real-World Example

Two weeks after setting up the chaos pipeline, a developer pushes a change that refactors the database connection pooling in the payment service. The code passes all unit and integration tests. But the chaos test at the CI stage catches something: under the simulated PostgreSQL latency, the new connection pool exhausts itself in 40 seconds instead of gracefully queuing requests. The circuit breaker never trips because the pool exhaustion happens at a layer below it.

The developer adds pool overflow handling, the chaos test passes, and the deploy goes through. Without the experiment, this would have been another 45-minute cascading outage -- discovered at 3 AM instead of during a CI run.

Over the first quarter the chaos stage catches three more resilience regressions before they reach production, and the Redis incident that started this project has not repeated.

## Related Skills

- [coding-agent](/skills/coding-agent) -- writes the experiment definitions and steady-state checks
- [docker-helper](/skills/docker-helper) -- builds the local toxiproxy environment
- [cicd-pipeline](/skills/cicd-pipeline) -- adds the chaos stage to the pipeline
