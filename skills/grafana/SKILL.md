---
name: grafana
description: >
  Grafana is an open-source visualization and dashboarding platform that connects to dozens of data
  sources including Prometheus, PostgreSQL, ClickHouse, and Elasticsearch. It lets you build interactive
  dashboards with panels, set up alerting rules, and manage everything as code through JSON dashboard
  definitions and provisioning configuration.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/grafana/grafana
  tags: "visualization, dashboarding, monitoring, alerting, observability"
---

# Grafana

## Overview

Grafana is an open-source platform for dashboards, alerting and exploring metrics, logs and traces. It queries data sources (Prometheus, PostgreSQL, ClickHouse, Loki, Elasticsearch and dozens more) at view time and renders the results as panels. Everything can be kept as code: data sources, dashboards, alert rules and contact points are provisioned from YAML and JSON files on startup. The current release line is 13.x; this skill uses the open-source `grafana/grafana` image.

## Instructions

### Run Grafana with Docker

```yaml
services:
  grafana:
    image: grafana/grafana:13.2.4   # pin a version; check hub.docker.com/r/grafana/grafana
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}   # set in .env, not in git
      GF_PLUGINS_PREINSTALL: grafana-clickhouse-datasource
      PG_PASSWORD: ${PG_PASSWORD}
      CH_PASSWORD: ${CH_PASSWORD}
      SLACK_WEBHOOK_URL: ${SLACK_WEBHOOK_URL}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning

volumes:
  grafana-data:
```

```bash
echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 18)" >> .env   # also set PG_PASSWORD, CH_PASSWORD, SLACK_WEBHOOK_URL
docker compose up -d
```

Open `http://localhost:3000`. `GF_PLUGINS_PREINSTALL` installs plugins at startup (comma-separated, `name@version` to pin). The old `grafana-cli` and `grafana-server` binaries were removed in Grafana 13; use `grafana cli plugins install <id>` and `grafana server`.

### Provision data sources

Files in `provisioning/datasources/` load at startup. Give each source a fixed `uid`: dashboards and alert rules refer to it, and an auto-generated uid breaks them when you rebuild.

```yaml
# provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: PostgreSQL
    uid: postgres
    type: postgres
    access: proxy
    url: postgres:5432
    user: grafana_reader
    secureJsonData:
      password: "${PG_PASSWORD}"
    jsonData:
      database: app_production
      sslmode: require
      maxOpenConns: 10
      postgresVersion: 1500

  - name: ClickHouse
    uid: clickhouse
    type: grafana-clickhouse-datasource
    jsonData:
      host: clickhouse
      port: 9000
      protocol: native
      defaultDatabase: default
      username: grafana_reader
    secureJsonData:
      password: "${CH_PASSWORD}"
```

`${VAR}` is expanded from Grafana's environment. Use read-only database users.

### Build panels

#### Time Series Panel with Prometheus

```
# Prometheus query — HTTP request rate per second by status code
sum by (status_code) (rate(http_requests_total[5m]))
```

#### Template Variables

A query variable gives users a dropdown:

```sql
-- ClickHouse query — variable definition for event names
-- Create as a "Query" type variable named "event_name"
SELECT DISTINCT event_name FROM events ORDER BY event_name
```

Reference it with `$event_name` and bound the time range with `$__timeFilter`:

```sql
SELECT toStartOfHour(created_at) AS time, count() AS events
FROM events
WHERE event_name = '$event_name' AND $__timeFilter(created_at)
GROUP BY time ORDER BY time
```

### Provision alert rules and contact points

Alert rules are a pipeline of refIds: a query (A), a reduce step (B) turns the series into a number, and a threshold (C) is the condition.

```yaml
apiVersion: 1

groups:
  - orgId: 1
    name: production-alerts
    folder: Production
    interval: 1m
    rules:
      - uid: high-error-rate
        title: High Error Rate
        condition: C
        for: 5m
        noDataState: NoData
        execErrState: Error
        data:
          - refId: A
            relativeTimeRange: { from: 600, to: 0 }
            datasourceUid: prometheus
            model:
              refId: A
              expr: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
              instant: false
              intervalMs: 1000
              maxDataPoints: 43200
          - refId: B
            datasourceUid: __expr__
            model:
              refId: B
              type: reduce
              expression: A
              reducer: last
          - refId: C
            datasourceUid: __expr__
            model:
              refId: C
              type: threshold
              expression: B
              conditions:
                - evaluator: { type: gt, params: [0.05] }
        labels:
          severity: critical
        annotations:
          summary: "Error rate is above 5%"
```

```yaml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: slack-engineering
    receivers:
      - uid: slack-eng
        type: slack
        settings:
          url: "${SLACK_WEBHOOK_URL}"
          recipient: "#engineering-alerts"
          title: '{{ template "default.title" . }}'
          text: '{{ template "default.message" . }}'
```

A contact point does nothing until a notification policy routes alerts to it. Provision one in `provisioning/alerting/policies.yml`:

```yaml
apiVersion: 1

policies:
  - orgId: 1
    receiver: slack-engineering
    group_by: [alertname]
```

Provisioned alert resources cannot be edited in the UI; change the file and restart, or reload through the Admin API.

### Dashboards as code

```yaml
apiVersion: 1

providers:
  - name: default
    orgId: 1
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /etc/grafana/provisioning/dashboards/json
      foldersFromFilesStructure: true
```

A minimal dashboard file (`provisioning/dashboards/json/overview.json`):

```json
{
  "uid": "app-overview",
  "title": "Application Overview",
  "timezone": "utc",
  "refresh": "30s",
  "time": { "from": "now-24h", "to": "now" },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Request Rate",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        { "refId": "A", "expr": "sum(rate(http_requests_total[5m]))", "legendFormat": "requests/s" }
      ],
      "fieldConfig": { "defaults": { "unit": "reqps", "custom": { "lineWidth": 2, "fillOpacity": 10 } } }
    }
  ],
  "templating": { "list": [] }
}
```

Export a dashboard built in the UI with a service account token (API keys no longer exist):

```bash
curl -s -H "Authorization: Bearer $GRAFANA_SA_TOKEN" \
  'http://localhost:3000/api/dashboards/uid/app-overview' | jq '.dashboard | del(.id)' > provisioning/dashboards/json/overview.json
```

Create the token under Administration, Users and access, Service accounts. Data source APIs that use numeric ids are disabled by default in Grafana 13; use uids.

## Examples

### Example 1: Stand up Grafana with Prometheus and an error-rate alert

Request: "Give me Grafana wired to our Prometheus that pages #engineering-alerts when 5xx errors pass 5%."

Put the compose file, `datasources.yml`, `rules.yml`, `contactpoints.yml` and `policies.yml` from above under `provisioning/`, then:

```bash
docker compose up -d && docker compose logs grafana | grep -i provisioning
```

Result: Grafana starts on 127.0.0.1:3000, the Prometheus data source is read-only in the UI, and the rule "High Error Rate" appears under Alerting, Alert rules, in folder Production.

### Example 2: Move a UI-built dashboard into git

Request: "I built the checkout dashboard in the UI, put it under version control."

```bash
curl -s -H "Authorization: Bearer $GRAFANA_SA_TOKEN" \
  'http://localhost:3000/api/dashboards/uid/checkout-kpis' | jq '.dashboard | del(.id)' > provisioning/dashboards/json/checkout-kpis.json
git add provisioning/dashboards/json/checkout-kpis.json && git commit -m "Add checkout dashboard"
```

Result: the JSON file is loaded by the file provider within `updateIntervalSeconds` and the dashboard keeps its uid, so existing links still work.

## Guidelines

- Pin the image tag; `latest` upgrades on pull, and Grafana 13 migrates dashboards and folders to unified storage on first start. Back up the database before a major upgrade.
- Never commit admin passwords, webhook URLs or database passwords; pass them as environment variables and reference `${VAR}` in provisioning files.
- Always set explicit `uid` values on data sources and alert rules; panels and rules refer to them.
- Provisioned dashboards cannot be saved from the UI unless `allowUiUpdates: true`; commit exported JSON.
- Bind to 127.0.0.1 or put Grafana behind a TLS reverse proxy.
- Image rendering needs the separate renderer service in Grafana 13 (the plugin is no longer supported).
