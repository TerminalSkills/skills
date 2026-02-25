---
title: Build a Real-Time Analytics Dashboard
slug: build-real-time-analytics-dashboard
description: >
  A SaaS startup tracks product usage events by ingesting them into ClickHouse, building Grafana
  dashboards that show daily active users, feature adoption, and retention cohorts, and adding Loki
  for log correlation when debugging issues behind the metrics.
skills:
  - clickhouse
  - grafana
  - loki
  - docker-compose
category: data-ai
tags:
  - analytics
  - dashboarding
  - observability
  - saas
  - real-time
---

# Build a Real-Time Analytics Dashboard

You run a SaaS product and you want to understand how people use it. Not next week from a batch report — now, in real time. How many users are active today? Which features are gaining traction? Where are users dropping off? And when something breaks, you want to jump straight from a metric dip to the logs that explain it.

This walkthrough builds that system from scratch. ClickHouse handles the event storage and aggregation, Grafana provides the dashboards, and Loki captures application logs so you can correlate metrics with what your code was actually doing. Everything runs in Docker Compose.

## The Architecture

The data flow is straightforward. Your application emits two types of signals: structured events (user actions like page views, clicks, signups) and unstructured logs (application output, errors, request traces). Events go to ClickHouse for analytical queries. Logs go to Loki via Promtail. Grafana sits on top of both, giving you a single interface to explore metrics and logs together.

```
┌──────────────┐     events     ┌──────────────┐
│  Application │───────────────▶│  ClickHouse  │
│              │                └──────┬───────┘
│              │     stdout            │ queries
│              │────────┐        ┌─────▼───────┐
└──────────────┘        │        │   Grafana    │
                   ┌────▼─────┐  │             │
                   │ Promtail │  └─────▲───────┘
                   └────┬─────┘        │ queries
                        │        ┌─────┴───────┐
                        └───────▶│    Loki      │
                                 └──────────────┘
```

## Step 1: Docker Compose Stack

Start by defining the full stack. This Compose file brings up ClickHouse, Loki, Promtail, and Grafana with all the wiring preconfigured.

```yaml
# docker-compose.yml — complete analytics stack
# ClickHouse for events, Loki for logs, Grafana for dashboards

version: "3.8"

services:
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - ./clickhouse/init.sql:/docker-entrypoint-initdb.d/init.sql

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki/loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./loki/promtail-config.yml:/etc/promtail/config.yml
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=grafana-clickhouse-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - clickhouse
      - loki

volumes:
  clickhouse-data:
  loki-data:
  grafana-data:
```

```bash
# CLI — bring up the entire stack
docker compose up -d
```

## Step 2: ClickHouse Schema for Events

Create the events table and a materialized view that pre-aggregates hourly stats. The materialized view means your dashboard queries hit a small rollup table instead of scanning raw events.

```sql
-- clickhouse/init.sql — schema initialization for the analytics database
-- This file runs automatically on first ClickHouse startup

CREATE TABLE IF NOT EXISTS events (
    event_id     UUID DEFAULT generateUUIDv4(),
    user_id      UInt64,
    event_name   LowCardinality(String),
    properties   String,
    created_at   DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (created_at, user_id);

-- Pre-aggregated hourly stats for fast dashboard queries
CREATE TABLE IF NOT EXISTS hourly_stats (
    hour         DateTime,
    event_name   LowCardinality(String),
    event_count  UInt64,
    unique_users UInt64
) ENGINE = SummingMergeTree()
ORDER BY (hour, event_name);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_stats
TO hourly_stats
AS SELECT
    toStartOfHour(created_at) AS hour,
    event_name,
    count() AS event_count,
    uniq(user_id) AS unique_users
FROM events
GROUP BY hour, event_name;
```

## Step 3: Ingesting Events from Your Application

Your application sends events to ClickHouse over HTTP. This works from any language — here is a Node.js example using the official client.

```javascript
// event-tracker.js — lightweight event ingestion service
// npm install @clickhouse/client express

import { createClient } from '@clickhouse/client';
import express from 'express';

const ch = createClient({
  url: 'http://localhost:8123',
  database: 'default',
});

const app = express();
app.use(express.json());

// Buffer events and flush in batches for efficiency
let buffer = [];
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_SIZE = 100;

async function flushEvents() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  await ch.insert({
    table: 'events',
    values: batch,
    format: 'JSONEachRow',
  });
  console.log(`Flushed ${batch.length} events to ClickHouse`);
}

setInterval(flushEvents, FLUSH_INTERVAL_MS);

app.post('/track', (req, res) => {
  const { user_id, event_name, properties = {} } = req.body;
  buffer.push({
    user_id,
    event_name,
    properties: JSON.stringify(properties),
  });
  if (buffer.length >= FLUSH_SIZE) flushEvents();
  res.status(202).json({ status: 'buffered' });
});

app.listen(4000, () => console.log('Event tracker on :4000'));
```

Your frontend or backend services call `POST /track` with event data. The tracker buffers events and flushes them to ClickHouse in batches, which is how ClickHouse performs best.

## Step 4: Loki Configuration for Log Collection

Configure Loki and Promtail to capture container logs from every service in the Compose stack.

```yaml
# loki/loki-config.yml — Loki server for the analytics stack
auth_enabled: false

server:
  http_listen_port: 3100

common:
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory
  replication_factor: 1
  path_prefix: /loki

schema_config:
  configs:
    - from: "2024-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 720h
```

```yaml
# loki/promtail-config.yml — Promtail agent scraping Docker container logs
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: container
        regex: '/(.+)'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: service
```

Now every container's stdout and stderr flows into Loki with `service` and `container` labels automatically attached.

## Step 5: Grafana Data Source Provisioning

Provision both ClickHouse and Loki as data sources so Grafana is ready to query on first boot.

```yaml
# grafana/provisioning/datasources/datasources.yml — auto-configure ClickHouse and Loki
apiVersion: 1

datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    access: proxy
    isDefault: true
    jsonData:
      host: clickhouse
      port: 9000
      defaultDatabase: default
      protocol: native

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
```

## Step 6: Building the Dashboard

Now the interesting part. Create a dashboard with panels showing DAU, feature adoption, retention, and a log viewer for correlation.

### Daily Active Users

```json
{
  "__comment": "grafana/provisioning/dashboards/json/analytics.json — product analytics dashboard",
  "uid": "product-analytics",
  "title": "Product Analytics",
  "timezone": "utc",
  "refresh": "1m",
  "time": { "from": "now-30d", "to": "now" },
  "templating": {
    "list": [
      {
        "name": "event_name",
        "type": "query",
        "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
        "query": "SELECT DISTINCT event_name FROM events ORDER BY event_name",
        "multi": true,
        "includeAll": true
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Daily Active Users",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT toDate(created_at) AS time, uniqExact(user_id) AS dau FROM events WHERE $__timeFilter(created_at) GROUP BY time ORDER BY time"
        }
      ],
      "fieldConfig": {
        "defaults": { "unit": "short", "custom": { "fillOpacity": 15 } }
      }
    },
    {
      "id": 2,
      "type": "barchart",
      "title": "Feature Adoption (This Week)",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT event_name AS feature, uniq(user_id) AS users, count() AS events FROM events WHERE created_at >= toStartOfWeek(now()) GROUP BY event_name ORDER BY users DESC LIMIT 15"
        }
      ]
    },
    {
      "id": 3,
      "type": "table",
      "title": "7-Day Retention by Signup Cohort",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT toDate(s.created_at) AS cohort_date, count(DISTINCT s.user_id) AS signups, count(DISTINCT r.user_id) AS retained_7d, round(count(DISTINCT r.user_id) / count(DISTINCT s.user_id) * 100, 1) AS retention_pct FROM events s LEFT JOIN events r ON s.user_id = r.user_id AND r.created_at BETWEEN s.created_at + INTERVAL 1 DAY AND s.created_at + INTERVAL 7 DAY AND r.event_name != 'signup' WHERE s.event_name = 'signup' AND $__timeFilter(s.created_at) GROUP BY cohort_date ORDER BY cohort_date"
        }
      ]
    },
    {
      "id": 4,
      "type": "stat",
      "title": "Active Users (24h)",
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 8 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT uniqExact(user_id) AS value FROM events WHERE created_at >= now() - INTERVAL 1 DAY"
        }
      ],
      "fieldConfig": {
        "defaults": { "thresholds": { "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 100 }, { "color": "red", "value": 50 }] } }
      }
    },
    {
      "id": 5,
      "type": "stat",
      "title": "Events Today",
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 8 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT count() AS value FROM events WHERE created_at >= today()"
        }
      ]
    },
    {
      "id": 6,
      "type": "logs",
      "title": "Application Logs",
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 16 },
      "datasource": { "type": "loki", "uid": "loki" },
      "targets": [
        {
          "expr": "{service=~\".*\"} |= \"$__searchExpression\"",
          "refId": "A"
        }
      ],
      "options": {
        "showTime": true,
        "showLabels": true,
        "wrapLogMessage": true,
        "sortOrder": "Descending",
        "enableLogDetails": true
      }
    }
  ],
  "schemaVersion": 39
}
```

Tell Grafana to load dashboards from the provisioning directory:

```yaml
# grafana/provisioning/dashboards/dashboards.yml — dashboard file provider
apiVersion: 1

providers:
  - name: default
    orgId: 1
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

## Step 7: Correlating Metrics with Logs

The real power of this setup emerges when a metric dips and you need to understand why. You see DAU dropping on the time-series panel. You adjust the time range to zoom into the dip. Then you scroll down to the log panel and filter for errors in that same window:

```logql
-- LogQL — find errors from the event tracker during a specific time window
{service="event-tracker"} | json | level="error"
```

If the event tracker was throwing connection errors to ClickHouse, you will see them right there. No context switching to a separate log viewer, no guessing at timestamps.

For deeper investigation, filter logs by a specific user or request:

```logql
-- LogQL — trace a specific user's activity through application logs
{service="api"} |= "user_id=1001"
```

## Step 8: Adding Alerts

Set up alerts so you know when something goes wrong before your users tell you.

```yaml
# grafana/provisioning/alerting/rules.yml — alerting rules for the analytics stack
apiVersion: 1

groups:
  - orgId: 1
    name: analytics-alerts
    folder: Analytics
    interval: 60s
    rules:
      - uid: dau-drop
        title: DAU Dropped Below Threshold
        condition: A
        data:
          - refId: A
            datasourceUid: clickhouse
            model:
              rawSql: "SELECT uniqExact(user_id) AS value FROM events WHERE created_at >= now() - INTERVAL 1 DAY"
              conditions:
                - evaluator:
                    type: lt
                    params: [50]
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Daily active users dropped below 50"

      - uid: high-error-logs
        title: High Error Log Rate
        condition: A
        data:
          - refId: A
            datasourceUid: loki
            model:
              expr: 'sum(rate({service="event-tracker"} |= "error" [5m]))'
              conditions:
                - evaluator:
                    type: gt
                    params: [5]
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Event tracker error rate exceeds 5/s"
```

With this setup, you have a complete analytics pipeline: events flow into ClickHouse in near real-time, Grafana dashboards show you DAU, feature adoption, and retention at a glance, Loki captures every log line for when you need to dig deeper, and alerts notify you when metrics cross thresholds. The entire stack runs in Docker Compose and can be version-controlled alongside your application code.
