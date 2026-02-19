---
name: grafana
description: >
  Grafana is an open-source visualization and dashboarding platform that connects to dozens of data
  sources including Prometheus, PostgreSQL, ClickHouse, and Elasticsearch. It lets you build interactive
  dashboards with panels, set up alerting rules, and manage everything as code through JSON dashboard
  definitions and provisioning configuration.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-infrastructure
  tags:
    - visualization
    - dashboarding
    - monitoring
    - alerting
    - observability
---

# Grafana

Grafana turns your data into dashboards. It connects to time-series databases, SQL databases, log stores, and cloud services, then lets you build panels that visualize metrics, logs, and traces in a single pane of glass. With alerting built in and dashboard-as-code workflows, it scales from a developer's local setup to a company-wide observability platform.

This skill covers Docker deployment, configuring data sources, building panels, setting up alerts, and managing dashboards as code with JSON.

## Docker Setup

The simplest way to run Grafana is the official Docker image. This starts Grafana with persistent storage so your dashboards survive restarts.

```yaml
# docker-compose.yml — Grafana with persistent storage and default admin credentials
version: "3.8"

services:
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning

volumes:
  grafana-data:
```

```bash
# CLI — start Grafana
docker compose up -d
```

Open `http://localhost:3000` and log in with admin/admin. Grafana will prompt you to change the password on first login.

## Data Sources

Data sources are connections to the backends that hold your data. Grafana queries them when rendering panels. You can add them through the UI or provision them with YAML files.

### Provisioning Data Sources

Place YAML files in `provisioning/datasources/` and Grafana loads them automatically on startup. This is the foundation of infrastructure-as-code for Grafana.

```yaml
# provisioning/datasources/datasources.yml — data source provisioning
# Configures Prometheus, PostgreSQL, and ClickHouse connections

apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: PostgreSQL
    type: postgres
    access: proxy
    url: postgres:5432
    database: app_production
    user: grafana_reader
    secureJsonData:
      password: "${PG_PASSWORD}"
    jsonData:
      sslmode: disable
      maxOpenConns: 10
      postgresVersion: 1500

  - name: ClickHouse
    type: grafana-clickhouse-datasource
    access: proxy
    jsonData:
      host: clickhouse
      port: 9000
      defaultDatabase: default
      protocol: native
    secureJsonData:
      password: ""
```

### Installing Data Source Plugins

Some data sources like ClickHouse require installing a plugin first:

```bash
# CLI — install the ClickHouse data source plugin
docker exec -it grafana grafana-cli plugins install grafana-clickhouse-datasource
docker compose restart grafana
```

## Building Panels

Panels are the building blocks of dashboards. Each panel runs a query against a data source and renders the result as a graph, table, stat, gauge, or other visualization.

### Time Series Panel with Prometheus

A common first panel is a time-series graph showing request rate:

```
# Prometheus query — HTTP request rate per second by status code
sum by (status_code) (rate(http_requests_total[5m]))
```

### Table Panel with ClickHouse

For tabular data, use a ClickHouse query that returns named columns:

```sql
-- ClickHouse query — top 10 features by usage this week
-- Used in a Grafana Table panel
SELECT
    event_name AS feature,
    count() AS total_events,
    uniq(user_id) AS unique_users
FROM events
WHERE created_at >= toStartOfWeek(now())
GROUP BY event_name
ORDER BY total_events DESC
LIMIT 10
```

### Stat Panel with PostgreSQL

Stat panels show a single number. They work well for KPIs:

```sql
-- PostgreSQL query — monthly recurring revenue
-- Used in a Grafana Stat panel with unit set to currency (USD)
SELECT sum(amount) AS mrr
FROM subscriptions
WHERE status = 'active'
  AND period_start <= now()
  AND period_end >= now()
```

### Template Variables

Variables make dashboards interactive. Define a variable from a query, and users can filter panels with a dropdown:

```sql
-- ClickHouse query — variable definition for event names
-- Create as a "Query" type variable named "event_name"
SELECT DISTINCT event_name FROM events ORDER BY event_name
```

Then reference it in panel queries with `$event_name`:

```sql
-- ClickHouse query — filtered event count using template variable
SELECT
    toStartOfHour(created_at) AS time,
    count() AS events
FROM events
WHERE event_name = '$event_name'
    AND $__timeFilter(created_at)
GROUP BY time
ORDER BY time
```

## Alerts

Grafana Alerting evaluates rules on a schedule and fires notifications through contact points like Slack, PagerDuty, or email.

### Provisioning Alert Rules

```yaml
# provisioning/alerting/rules.yml — alert rule provisioning
# Fires when error rate exceeds 5% for 5 minutes

apiVersion: 1

groups:
  - orgId: 1
    name: production-alerts
    folder: Production
    interval: 60s
    rules:
      - uid: high-error-rate
        title: High Error Rate
        condition: C
        data:
          - refId: A
            datasourceUid: prometheus
            model:
              expr: sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          - refId: B
            datasourceUid: prometheus
            model:
              expr: sum(rate(http_requests_total[5m]))
          - refId: C
            datasourceUid: __expr__
            model:
              type: math
              expression: $A / $B
              conditions:
                - evaluator:
                    type: gt
                    params: [0.05]
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate is above 5%"
```

### Contact Points

```yaml
# provisioning/alerting/contactpoints.yml — Slack notification channel
apiVersion: 1

contactPoints:
  - orgId: 1
    name: slack-engineering
    receivers:
      - uid: slack-eng
        type: slack
        settings:
          url: "${SLACK_WEBHOOK_URL}"
          channel: "#engineering-alerts"
          title: '{{ .CommonLabels.alertname }}'
          text: '{{ .CommonAnnotations.summary }}'
```

## Dashboard as Code

Grafana dashboards are JSON documents. You can export them from the UI, version control them, and provision them automatically. This is essential for reproducible infrastructure.

### Provisioning Dashboards

Tell Grafana where to find dashboard JSON files:

```yaml
# provisioning/dashboards/dashboards.yml — dashboard provisioning config
apiVersion: 1

providers:
  - name: default
    orgId: 1
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards/json
      foldersFromFilesStructure: true
```

### Dashboard JSON

A minimal dashboard with one panel:

```json
{
  "__comment": "provisioning/dashboards/json/overview.json — application overview dashboard",
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
        {
          "expr": "sum(rate(http_requests_total[5m]))",
          "legendFormat": "requests/s"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "reqps",
          "custom": { "lineWidth": 2, "fillOpacity": 10 }
        }
      }
    },
    {
      "id": 2,
      "type": "stat",
      "title": "Active Users (24h)",
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
      "datasource": { "type": "grafana-clickhouse-datasource", "uid": "clickhouse" },
      "targets": [
        {
          "rawSql": "SELECT uniq(user_id) AS value FROM events WHERE created_at >= now() - INTERVAL 1 DAY"
        }
      ]
    }
  ],
  "templating": {
    "list": []
  },
  "schemaVersion": 39
}
```

### Exporting Dashboards

To capture a dashboard you built in the UI as code, use the Grafana HTTP API:

```bash
# CLI — export a dashboard JSON by UID for version control
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  'http://localhost:3000/api/dashboards/uid/app-overview' \
  | jq '.dashboard' > dashboards/app-overview.json
```

This workflow lets you iterate in the UI, export to JSON, commit to git, and deploy via provisioning — giving you the best of both visual editing and infrastructure-as-code.
