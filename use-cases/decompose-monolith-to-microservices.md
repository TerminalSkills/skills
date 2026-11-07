---
title: "Decompose a Monolith into Microservices with AI-Guided Domain Analysis"
slug: decompose-monolith-to-microservices
description: "Analyze a monolithic codebase to identify service boundaries, extract bounded contexts, and generate a phased migration plan with dependency tracking."
skills: [code-reviewer, data-analysis, coding-agent, docker-helper]
category: development
tags: [microservices, monolith, architecture, domain-driven-design, migration]
---

# Decompose a Monolith into Microservices with AI-Guided Domain Analysis

## The Problem

A 4-year-old Rails monolith has grown to 380K lines of code. Deployments take 45 minutes, a bug in the billing module blocks the entire release train, and scaling the search feature means scaling the whole application: every model, every controller, every database table. The team of 18 developers steps on each other's toes in every sprint — merging to main is a daily adventure in conflict resolution, and a CSS change in the checkout flow once broke the admin dashboard because they share a layout partial.

Leadership approved a microservices migration, but nobody knows where to draw the service boundaries without breaking everything. The last attempt, six months ago, stalled at week 3 because the team couldn't agree on how to split the shared `User` model that's referenced from 47 different files. The architect drew service boundaries on a whiteboard based on organizational structure (billing team gets a billing service, etc.), but the boundaries didn't match the actual code dependencies. The first extraction attempt created a distributed monolith — all the downsides of microservices (network calls, deployment complexity, distributed debugging) with none of the benefits (independent scaling, isolated failures, team autonomy).

## The Solution

Use **coding-agent** to run the analysis and scaffolding as scoped background tasks, **data-analysis** (pandas) to turn the code's real references into a coupling table, **code-reviewer** to review each extraction diff for leaked internals and broken contracts, and **docker-helper** to containerize each new service. Boundaries come from measured code dependencies rather than whiteboard diagrams.

## Step-by-Step Walkthrough

The decomposition follows a disciplined sequence: understand the current state, draw boundaries from data, plan the extraction order, scaffold the first service, and verify with shadow traffic before cutting over. Every step before the cutover is reversible.

### Step 1: Map the Monolith's Module Structure

Before drawing any boundaries, measure what you have. Ask a coding agent for the inventory, and keep the result as data you can query (the `data-analysis` skill's load, inspect, aggregate routine) rather than as prose:

```text
Inventory this Rails app: list every class in app/models, app/controllers and app/services and propose a domain cluster for each (user/auth, billing, catalog, search, notifications, shared). Write the result to clusters.csv with two columns, path and cluster, no header. Do not change any code.
```

Review `clusters.csv` by hand, then count real references with a small script. It scans `app/**/*.rb` for constants named after your models, maps each file and model to a cluster, and reports models used by three or more clusters plus clusters that depend on each other in both directions:

```python
# scripts/coupling.py   usage: python coupling.py <rails_root> clusters.csv
import re
import sys
from pathlib import Path

import pandas as pd

root = Path(sys.argv[1]).resolve()
clusters = pd.read_csv(sys.argv[2], header=None, names=["file", "cluster"]).set_index("file")["cluster"]

files = list((root / "app").rglob("*.rb"))
models = {p.stem.title().replace("_", ""): p.relative_to(root).as_posix() for p in (root / "app/models").rglob("*.rb")}
pattern = re.compile(r"\b(" + "|".join(map(re.escape, models)) + r")\b")

edges = []
for f in files:
    rel = f.relative_to(root).as_posix()
    for name in set(pattern.findall(f.read_text())):
        if models[name] != rel:
            edges.append({"file": rel, "model": name})
df = pd.DataFrame(edges)
df["from_cluster"] = df["file"].map(clusters)
df["to_cluster"] = df["model"].map(lambda m: clusters.get(models[m]))
df = df.dropna(subset=["from_cluster", "to_cluster"])
cross = df[df["from_cluster"] != df["to_cluster"]]

print("models referenced from 3+ clusters:")
hot = cross.groupby("model")["from_cluster"].nunique()
print(hot[hot >= 3].sort_values(ascending=False).to_string())

pairs = cross.groupby(["from_cluster", "to_cluster"]).size().rename("refs").reset_index()
print("\ncross-cluster references:")
print(pairs.sort_values("refs", ascending=False).to_string(index=False))

rev = pairs.rename(columns={"from_cluster": "to_cluster", "to_cluster": "from_cluster"})
both = pairs.merge(rev, on=["from_cluster", "to_cluster"], suffixes=("", "_back"))
print("\nmutual dependencies (break these before extracting):")
print(both[both["from_cluster"] < both["to_cluster"]].to_string(index=False))
```

This is a text scan: it sees `User.find(id)` but not `belongs_to :user`, `send(:const_get, ...)` or SQL joins, so treat the numbers as a lower bound and have the agent grep `db/schema.rb` and `joins(` calls for the rest. A typical monolith shows a handful of models, usually `User` and the main product model, referenced from almost every cluster. Those shared models are why extraction attempts fail: you cannot cleanly extract a service when half the codebase reaches into its internals.

### Step 2: Draw Service Boundaries Using Actual Dependencies

```text
Using the cross-cluster reference table, propose service boundaries following DDD principles. For each proposed service: the models it owns, the calls it would need to make to other services, the shared tables that would need splitting, and the extraction difficulty (easy/medium/hard). List every mutual dependency that has to be broken first.
```

Expect the usual three kinds of cycle, and break them with events before extracting anything, because if Billing depends on User and User depends on Billing, neither can go first:

- **Billing <-> User:** Billing joins on the users table directly. Replace the join with an API call or a local copy of the few user fields billing needs, kept current by user-change events.
- **Catalog <-> Search:** search indexes are rebuilt inside ActiveRecord callbacks. Publish a catalog event after the transaction commits (use a transactional outbox so a rolled-back write never emits an event) and let search consume it.
- **Notifications <- everything:** other clusters call notification models directly. Make notifications an event consumer: the order service publishes "order placed" and notifications decides what to send.

Order the extractions by difficulty: low-coupling, asynchronous parts first (search, notifications), then billing and auth, and the heavily entangled catalog and the gateway last. Use the agent's estimates as a starting point and re-estimate after the first service ships.

### Step 3: Plan the Strangler Fig Migration

```text
Create a phased migration plan using the strangler fig pattern, starting with the easiest service (Search). For each phase: what gets extracted, the API contract, what data is replicated or split, the rollback strategy. Write the OpenAPI 3.1 spec for the Search service to search-service/openapi.yaml.
```

The strangler fig pattern means new services grow around the monolith, taking over requests one route at a time until little of the monolith is left. A gateway or reverse proxy in front routes `/search` to the monolith or the new service. A feature flag or weighted routing shifts traffic gradually (1%, 10%, 50%, 100%) and flips back in seconds if the new service misbehaves. Each phase needs an API contract, data migration scripts, and a rollback runbook anyone on the team can run.

### Step 4: Scaffold the First Service

```text
Scaffold the Search service from the migration plan: a standalone Node.js (TypeScript) service with the Elasticsearch integration extracted from the monolith, a REST API matching search-service/openapi.yaml, health endpoints, structured logging, a multi-stage Dockerfile, and an event consumer for catalog updates. Keep the same search behavior: lift and shift, not a rewrite. Run tsc --noEmit and the service's tests.
```

Run this as a scoped background task per the `coding-agent` skill (narrow prompt, `--allowedTools`, a budget cap) and review the diff with **code-reviewer** before merging. docker-helper provides the packaging: a multi-stage Dockerfile (build stage compiles TypeScript, runtime stage keeps only production dependencies and runs as the non-root `node` user) and a compose file for local development. Every port is published on loopback only:

```yaml
# compose.yaml (local development only)
services:
  elasticsearch:
    image: elasticsearch:9.5.5
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"   # local only; never on a shared network
      ES_JAVA_OPTS: -Xms512m -Xmx512m
    ports: ["127.0.0.1:9200:9200"]
  rabbitmq:
    image: rabbitmq:4-management
    environment:   # the built-in guest user only works from localhost, not from the search container
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:?set it in .env}
    ports: ["127.0.0.1:5672:5672", "127.0.0.1:15672:15672"]
  search:
    build: ./search-service
    environment:
      ELASTICSEARCH_URL: http://elasticsearch:9200
      AMQP_URL: amqp://app:${RABBITMQ_PASSWORD}@rabbitmq:5672
    ports: ["127.0.0.1:4001:4001"]
    depends_on: [elasticsearch, rabbitmq]
```

Keep this step deliberately boring: identical behavior in a separate process, no new ranking, no pagination fixes. Mixing "extract" with "improve" is how migrations stall: if results differ you cannot tell whether the architecture or the behavior changed.

### Step 5: Verify with Shadow Traffic Comparison

```text
Write a comparison tool that replays a sample of production search queries (read-only, GET requests only) against both the monolith and the new Search service, compares the result IDs and order, and reports mismatches. Export latency, error rate and mismatch count as Prometheus metrics.
```

Run the replay against a staging copy or with production reads only: the comparator must never send writes or carry user credentials into logs. Expect some mismatches from timing: the event consumer updates the index a moment after the monolith's synchronous callback did, so compare after a short settle delay or exclude items changed inside the comparison window. Alert when the mismatch rate passes a threshold you choose, and set a quality gate before cutover, such as a week of parity above your target. Without shadow traffic the only way to learn whether the new service behaves identically is to cut over and find out.

## Real-World Example

A CTO at a 40-person e-commerce company inherits a large Rails monolith. Deploys have slowed to once a week because every change risks breaking unrelated features, and scaling for the holiday peak means scaling billing, catalog and search together.

The coupling script on the team's own `clusters.csv` surfaces what the architecture diagrams hid: billing queried the users table directly in several places, and notifications had no boundary at all. For the first time the team agrees on service boundaries from the code instead of the org chart.

Search goes first because it is the easiest extraction and the biggest scaling bottleneck. The strangler routing keeps the monolith answering until shadow comparison is clean; if the new service misbehaves, one flag sends traffic back. Over the following months the billing and notification services follow the same loop, and each team deploys its service without waiting for the others. Search now scales on its own Elasticsearch capacity while the catalog stays at baseline, so peak-season capacity is added where the load is rather than everywhere.
