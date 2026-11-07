---
title: "Set Up Log Aggregation and Analysis with AI"
slug: set-up-log-aggregation-analysis
description: "Centralize scattered application logs and use AI to extract patterns, detect errors, and build searchable dashboards."
skills: [coding-agent, docker-helper, data-analysis]
category: devops
tags: [logging, observability, log-analysis, elk-stack, debugging]
---

# Set Up Log Aggregation and Analysis with AI

## The Problem

Your logs are everywhere: stdout on one service, JSON files on another, syslog on your proxy, and CloudWatch for your Lambda functions. When something breaks, you SSH into three different servers, grep through gigabytes of unstructured text, and try to correlate timestamps by hand.

Worse, there is no way to search logs historically. Once they rotate off disk, that context is gone. Last month's intermittent timeout issue? Nobody can prove what caused it because the logs from that period are gone. Every incident investigation starts from scratch.

## The Solution

Use **docker-helper** to deploy a centralized logging stack, **coding-agent** to hand the log-format changes in each service to a background agent, and **data-analysis** to pull error lines out of the store and group them into patterns with pandas.

## Step-by-Step Walkthrough

### Step 1: Map Your Current Logging Landscape

```text
We have 4 services: an Express API on EC2, a Python worker on EC2, a Next.js
frontend on Vercel, and a Postgres database on RDS. Logs are all over the place.
Help me set up centralized logging with search and alerting. We want to self-host
on our existing EC2 infrastructure.
```

Before choosing tooling, find out how much log volume you have (for example, the size of one day of rotated files per service). Volume decides the architecture: a few GB per day does not need a search cluster.

### Step 2: Choose the Architecture

The usual first suggestion is Elasticsearch, Logstash and Kibana (ELK). It indexes the full text of every line, which gives fast free-text search but costs memory, disk and tuning time. Grafana Loki takes a different approach: it indexes only labels (service, environment, level) and stores the line content as compressed chunks that are scanned at query time. For a small team with moderate volume, that is much lighter to run. Free-text search over a wide time range is slower than in Elasticsearch, which is the trade-off.

The architecture:

- **Grafana Alloy** on each EC2 instance, tailing log files and pushing them to Loki. Alloy replaces Promtail, which reached end of life on 2 March 2026.
- **Loki** (3.x) for storage and querying.
- **Grafana** for search, dashboards and alerting.
- **Vercel**: a Log Drain to an HTTPS endpoint you run. The drain sends batches signed with an `x-vercel-signature` header, so the endpoint must verify the signature against the drain secret before forwarding the lines to Loki's push API.

### Step 3: Deploy the Stack

Ask the agent (with docker-helper) for a Compose file. Every port is published on `127.0.0.1` only; put a reverse proxy with TLS and auth in front of Grafana, and let the other EC2 hosts reach Loki over a private network or VPN, never the open internet. Loki has no authentication of its own.

```yaml
# compose.yaml
services:
  loki:
    image: grafana/loki:3.7.9
    command: -config.file=/etc/loki/config.yml
    ports: ["127.0.0.1:3100:3100"]
    volumes:
      - ./loki-config.yml:/etc/loki/config.yml:ro
      - loki-data:/loki

  grafana:
    image: grafana/grafana:13.3.0
    ports: ["127.0.0.1:3000:3000"]
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:?set it in .env}

volumes:
  loki-data:
  grafana-data:
```

The Loki config for a single node with filesystem storage and 90-day retention. Structured metadata (used below for `requestId`) needs the `tsdb` store with schema `v13`:

```yaml
# loki-config.yml
auth_enabled: false
server:
  http_listen_port: 3100
common:
  path_prefix: /loki
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
schema_config:
  configs:
    - from: "2024-04-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
limits_config:
  retention_period: 2160h   # 90 days
compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

On each application host, Alloy reads the JSON log files, promotes `level` to a label and keeps `requestId` as structured metadata (high-cardinality values must not become labels). Run it with `grafana/alloy:v1.21.3` and replace `LOKI_HOST` with the private address of the Loki server:

```text
// config.alloy
local.file_match "app" {
  path_targets = [{"__path__" = "/var/log/app/*.log", "service" = "api", "env" = "prod"}]
}

loki.source.file "app" {
  targets    = local.file_match.app.targets
  forward_to = [loki.process.json.receiver]
}

loki.process "json" {
  stage.json {
    expressions = { level = "level", requestId = "requestId" }
  }
  stage.labels {
    values = { level = "" }
  }
  stage.structured_metadata {
    values = { requestId = "" }
  }
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://LOKI_HOST:3100/loki/api/v1/push"
  }
}
```

In Grafana, add Loki as a data source (provisioning file or the UI). To check the pipeline, append a JSON line to a watched file and query it back: `{service="api", level="error"}` in Grafana Explore, or `curl -G http://127.0.0.1:3100/loki/api/v1/query_range --data-urlencode 'query={service="api",level="error"}'`.

### Step 4: Standardize the Log Format

Scattered formats are the root cause of the "grep through three servers" problem. If one service logs `ERROR: connection timeout` as plain text and another logs JSON, the same problem needs two different queries. This is a good job to delegate to a background coding agent per service, with a narrow prompt (see the `coding-agent` skill):

```bash
claude -p "In api/src/logger.js add a winston JSON logger with a service field and a per-request child logger carrying requestId. Replace console.log calls in api/src/. Do not touch other files." \
  --permission-mode acceptEdits --allowedTools "Read" "Edit" "Bash(npx tsc --noEmit)" \
  --max-budget-usd 2 --output-format text > /tmp/api-logging.txt 2>&1 &
```

Review the diff before merging. The result for the **Express API** is a winston logger with JSON output:

```javascript
// api/src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'api' },
  transports: [new winston.transports.Console()],
});

// per request: const log = logger.child({ requestId });
module.exports = logger;
```

For the **Python worker**, structlog with a JSON renderer; `contextvars` carries `requestId` into every line of a job:

```python
# worker/logging_config.py
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger().bind(service="worker")

# at the start of each job: structlog.contextvars.bind_contextvars(requestId=payload["requestId"])
```

Note that winston writes the text under `message` and structlog under `event`. Pick one name (rename in either logger) so queries work across both services. The API passes its request ID in the task payload and the worker binds it, so searching one `requestId` shows the whole request across both services.

### Step 5: Find Error Patterns with Data Analysis

Grafana answers "what happened to this request". For "what are our most common errors this week" pull the lines out of Loki's HTTP API and group them with pandas (the `data-analysis` skill's approach: load, inspect, aggregate, chart):

```python
import os
import sys

import pandas as pd
import requests

LOKI = os.environ.get("LOKI_URL", "http://127.0.0.1:3100")
resp = requests.get(
    f"{LOKI}/loki/api/v1/query_range",
    params={"query": '{env="prod", level="error"}', "since": "24h", "limit": 5000, "direction": "backward"},
    timeout=30,
)
resp.raise_for_status()

rows = [
    {"service": s["stream"].get("service"), "ts": pd.to_datetime(int(ns), unit="ns"), "line": line}
    for s in resp.json()["data"]["result"]
    for ns, line in s["values"]
]
df = pd.DataFrame(rows)
if df.empty:
    sys.exit("no error lines in the last 24h")

# strip digits so "timeout after 5003ms" and "timeout after 4991ms" are one pattern
df["fingerprint"] = df["line"].str.replace(r"\d+", "N", regex=True).str.slice(0, 120)
top = df.groupby(["service", "fingerprint"]).agg(count=("ts", "size"), first=("ts", "min"), last=("ts", "max"))
print(top.sort_values("count", ascending=False).head(10).to_string())
print(df.set_index("ts").resample("1h").size().to_string())
```

The table shows the top error patterns with first and last seen times; the hourly counts show when they started. Loki caps one query at 5000 lines by default (`limit`), so for a bigger window query in slices.

### Step 6: Build Dashboards and Alerts

Three Grafana dashboards cover most day-to-day debugging:

1. **Service Overview**: error rate, log volume and top error messages per service, built from LogQL such as `sum by (service) (count_over_time({env="prod", level="error"}[5m]))`. A drop in log volume often means a service crashed.
2. **Request Tracing**: filter by `requestId` (`{env="prod"} | requestId="$requestId"`) to see one request across services in order.
3. **Error Deep Dive**: the top-patterns view from Step 5, as a table panel.

Grafana-managed alert rules for three situations:

- **Error rate above a threshold** for any service over 5 minutes, notifying Slack. Catches active incidents.
- **No logs from a service** for 10 minutes, paging on-call. Silence is often more urgent than errors, because a crashed service produces none.
- **A new error pattern** not seen in the past 7 days. Loki cannot compute this on its own; run the Step 5 script on a schedule, compare against the previous week's fingerprints and post new ones to Slack.

## Real-World Example

Suki is a backend developer at a 10-person SaaS startup. Last week, customers reported intermittent 500 errors. She spent two hours SSH-ing between servers before finding the cause: the Python worker was timing out on a downstream API call, but the Express API was retrying silently, creating a cascade. The correlation between the two services was invisible without centralized logs.

She sets up centralized logging on a Friday afternoon. Loki and Grafana go up via Docker Compose, Alloy gets installed on both EC2 instances, and a Vercel Log Drain handles the frontend. Both services are standardized to emit JSON logs with a shared `requestId` field.

The next time an error occurs, Suki searches by `requestId` in Grafana and sees the full chain (Express request, worker timeout, retry, second timeout, final 500 to the user) in a single view instead of hours of SSH and grep. The nightly pattern report flags a new database connection exhaustion pattern on Wednesday before any customer reports it, and the team fixes the pool configuration before it becomes an incident. Logs no longer vanish when files rotate: they stay searchable for 90 days.
