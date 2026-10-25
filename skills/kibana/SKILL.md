---
name: kibana
description: >-
  Configure and use Kibana for Elasticsearch data visualization, dashboard
  creation, and log exploration. Use when a user needs to build dashboards
  with Lens, write KQL queries, set up data views, create visualizations,
  or configure Kibana spaces and role-based access.
license: Apache-2.0
compatibility: "Kibana 8.19+ or 9.x, Elasticsearch of the same version (docker or self-managed)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/elastic/kibana"
  category: devops
  tags: "kibana, elasticsearch, dashboards, visualization, kql"
---

# Kibana

## Overview

Set up and use Kibana to visualize Elasticsearch data through dashboards, Lens visualizations, and Discover queries. Covers deployment, data views, KQL and ES|QL querying, dashboard export/import, alerting rules, and Kibana Spaces for multi-team access. Examples target Kibana 9.5 (current at the time of writing); the REST calls below also work on 8.19.

## Instructions

### Task A: Deploy Kibana

Kibana must run the same version as Elasticsearch. Kibana refuses to start as the `elastic` superuser, so give it the built-in `kibana_system` user and set that user's password once after Elasticsearch is up (the `ELASTIC_PASSWORD` variable only sets `elastic`). For a quick local setup, the compose file below turns off HTTP TLS; in production keep it on and point `ELASTICSEARCH_HOSTS` at `https://` with the CA configured (or use the enrollment-token flow from the official Docker guide).

```yaml
# docker-compose.yml — local Kibana with Elasticsearch (TLS off, development only)
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:9.5.5
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=true
      - xpack.security.http.ssl.enabled=false
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:9.5.5
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=${KIBANA_SYSTEM_PASSWORD}
      - SERVER_NAME=kibana
      - XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

volumes:
  es_data:
```

```bash
# Put the three secrets in .env first (KIBANA_ENCRYPTION_KEY must be 32+ characters), then:
docker compose up -d elasticsearch
curl -X POST "http://localhost:9200/_security/user/kibana_system/_password" \
  -u "elastic:$ELASTIC_PASSWORD" -H "Content-Type: application/json" \
  -d "{\"password\": \"$KIBANA_SYSTEM_PASSWORD\"}"
docker compose up -d kibana   # then open http://localhost:5601 and log in as elastic
```

`xpack.encryptedSavedObjects.encryptionKey` is required for alerting rules and connectors; also set `xpack.security.encryptionKey` and `xpack.reporting.encryptionKey` (32+ characters each) so sessions and reports survive restarts.

### Task B: Create Data Views and KQL Queries

```bash
# Create a data view via API
curl -X POST "http://localhost:5601/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -d '{
    "data_view": {
      "title": "logs-*",
      "name": "Application Logs",
      "timeFieldName": "@timestamp",
      "runtimeFieldMap": {
        "hour_of_day": {
          "type": "long",
          "script": { "source": "emit(doc[\"@timestamp\"].value.getHour())" }
        }
      }
    }
  }'
```

```text
# KQL query examples for Discover

# Find errors in a specific service
level: "error" and service.name: "payment-service"

# Status codes 5xx from nginx
http.response.status_code >= 500 and fields.type: "nginx"

# Requests slower than 2 seconds
response_time > 2000 and not request.path: "/health"

# Wildcard search across log messages
message: *timeout* and kubernetes.namespace: "production"

# Combine with date range (use time picker for this, but also works in KQL)
level: "error" and service.name: "order-service" and @timestamp >= "2026-02-19"

# Nested field queries
kubernetes.labels.app: "api-gateway" and kubernetes.pod.name: pod-*
```

### Task C: Create Dashboards via API

```bash
# Export a dashboard (for backup or migration)
curl -X POST "http://localhost:5601/api/saved_objects/_export" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -d '{
    "objects": [{ "type": "dashboard", "id": "my-dashboard-id" }],
    "includeReferencesDeep": true
  }' -o dashboard-export.ndjson
```

```bash
# Import a dashboard from exported NDJSON
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -F file=@dashboard-export.ndjson
```

```bash
# Create a Kibana Space for a team
curl -X POST "http://localhost:5601/api/spaces/space" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -d '{
    "id": "payments-team",
    "name": "Payments Team",
    "description": "Dashboards and views for the payments team",
    "disabledFeatures": ["canvas", "maps_v2", "ml"],
    "color": "#2196F3"
  }'
```

### Task D: Lens Visualization Patterns

Common Lens visualization configurations to create in the Kibana UI:

```text
# Request Rate Over Time (Line Chart)
- Data view: logs-*
- Metric: Count of records
- Break down by: Date histogram on @timestamp (auto interval)
- Split series: Top 5 values of service.name
- Use: Lens > Line chart

# Error Rate by Service (Bar Chart)
- Data view: logs-*
- Filter: level: "error"
- Metric: Count of records
- Break down by: Top 10 values of service.name
- Use: Lens > Vertical bar

# P95 Response Time (Metric)
- Data view: logs-*
- Metric: 95th percentile of response_time
- Filter: not request.path: "/health"
- Use: Lens > Metric

# Top Error Messages (Table)
- Data view: logs-*
- Filter: level: "error"
- Columns: Top 20 values of message.keyword, Count
- Use: Lens > Table

# Status Code Distribution (Donut)
- Data view: logs-*
- Metric: Count
- Slice by: Top 10 values of http.response.status_code
- Use: Lens > Donut
```

### Task E: Alerting Rules

```bash
# Create an Elasticsearch query rule (the "id" of each action is an existing connector id; list them with GET /api/actions/connectors)
curl -X POST "http://localhost:5601/api/alerting/rule" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -d '{
    "name": "High Error Rate - Payment Service",
    "rule_type_id": ".es-query",
    "consumer": "alerts",
    "schedule": { "interval": "1m" },
    "params": {
      "searchType": "esQuery",
      "timeWindowSize": 5,
      "timeWindowUnit": "m",
      "threshold": [50],
      "thresholdComparator": ">",
      "esQuery": "{\"query\":{\"bool\":{\"must\":[{\"match\":{\"level\":\"error\"}},{\"match\":{\"service.name\":\"payment-service\"}}]}}}",
      "index": ["logs-*"],
      "timeField": "@timestamp",
      "size": 100,
      "excludeHitsFromPreviousRun": true
    },
    "actions": [
      {
        "group": "query matched",
        "id": "slack-payments-alerts",
        "frequency": { "summary": false, "notify_when": "onActionGroupChange", "throttle": null },
        "params": {
          "message": "Payment service error count exceeded 50 in 5 minutes. Check Kibana for details."
        }
      }
    ]
  }'
```

### Task F: Role-Based Access

```bash
# Create a read-only role for a team
curl -X PUT "http://localhost:9200/_security/role/payments_viewer" \
  -H "Content-Type: application/json" \
  -u "elastic:$ELASTIC_PASSWORD" \
  -d '{
    "indices": [
      {
        "names": ["logs-app-*"],
        "privileges": ["read", "view_index_metadata"],
        "query": "{\"match\": {\"service.name\": \"payment-service\"}}"
      }
    ],
    "applications": [
      {
        "application": "kibana-.kibana",
        "privileges": ["feature_discover_v2.read", "feature_dashboard_v2.read", "feature_visualize_v2.read"],
        "resources": ["space:payments-team"]
      }
    ]
  }'
```

Kibana 8.x/9.x deprecated the V1 `feature_discover`, `feature_dashboard` and `feature_visualize` privileges; use the `_v2` names (the V2 privileges change how saved queries are managed). Role changes show up in Stack Management > Roles, which is the quickest way to confirm the privilege names on your version.

## Examples

### Example 1: "Show me payment errors from the last hour, then turn them into a chart"

In Discover, pick the `Application Logs` data view, set the time picker to Last 1 hour and enter `level: "error" and service.name: "payment-service"`. In 9.x you can also switch Discover to ES|QL mode:

```text
FROM logs-* | WHERE level == "error" AND service.name == "payment-service" | STATS errors = COUNT(*) BY BUCKET(@timestamp, 5 minutes)
```

Result: a table of five-minute buckets with an error count; use the chart toggle above the table or "Save to dashboard" to keep it.

### Example 2: "Move the payments dashboard from staging to production"

```bash
curl -X POST "http://staging-kibana:5601/api/saved_objects/_export" -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" -u "elastic:$ELASTIC_PASSWORD" \
  -d '{"objects":[{"type":"dashboard","id":"payments-overview"}],"includeReferencesDeep":true}' -o payments-overview.ndjson
curl -X POST "http://prod-kibana:5601/api/saved_objects/_import?overwrite=true" -H "kbn-xsrf: true" \
  -u "elastic:$PROD_ELASTIC_PASSWORD" -F file=@payments-overview.ndjson
```

Result: the import answers `{"success":true,"successCount":N,...}`; if it lists `missing_references`, create the data view with the same id on production first.

## Guidelines

- Use Kibana Spaces to isolate dashboards and data views per team
- Create runtime fields in data views instead of modifying Elasticsearch mappings for ad-hoc analysis
- Prefer KQL over Lucene syntax for Discover and dashboard filters; use ES|QL when you need aggregations and transformations in Discover
- Kibana 9.5 made the Dashboards and Visualizations APIs generally available with breaking request/response changes, and moved saved-object tag routes to `/api/tags` (the old `/api/saved_objects_tagging` routes are deprecated); the saved-objects export/import above still works, but check the 9.5 breaking-changes page before scripting against the new APIs
- Never use the `elastic` superuser for dashboards-as-code or alert connectors in production; create an API key or a dedicated role
- `kbn-xsrf` is required on every non-GET Kibana API call; a 400 "Request must contain a kbn-xsrf header" means it is missing
- Export dashboards as NDJSON for version control and environment promotion
- Set refresh intervals on dashboards (30s-60s) to balance real-time visibility with cluster load
- Use document-level security in roles to restrict which logs each team can see (document-level security needs a Platinum or Enterprise licence)
