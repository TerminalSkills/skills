---
name: kibana
description: >-
  Configure and use Kibana for Elasticsearch data visualization, dashboard
  creation, and log exploration. Use when a user needs to build dashboards
  with Lens, write KQL queries, set up data views, create visualizations,
  or configure Kibana spaces and role-based access.
license: Apache-2.0
compatibility: "Kibana 8.10+, Elasticsearch 8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["kibana", "elasticsearch", "dashboards", "visualization", "kql", "elk"]
---

# Kibana

## Overview

Set up and use Kibana to visualize Elasticsearch data through dashboards, Lens visualizations, and Discover queries. Covers deployment, data views, KQL querying, dashboard creation, and Kibana Spaces for multi-team access.

## Instructions

### Task A: Deploy Kibana

```yaml
# docker-compose.yml — Kibana with Elasticsearch
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=changeme
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:8.12.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_USERNAME=kibana_system
      - ELASTICSEARCH_PASSWORD=changeme
      - SERVER_NAME=kibana
      - XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=min-32-char-encryption-key-here!!
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

volumes:
  es_data:
```

### Task B: Create Data Views and KQL Queries

```bash
# Create a data view via API
curl -X POST "http://localhost:5601/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:changeme \
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
  -u elastic:changeme \
  -d '{
    "type": ["dashboard"],
    "objects": [{ "type": "dashboard", "id": "my-dashboard-id" }],
    "includeReferencesDeep": true
  }' -o dashboard-export.ndjson
```

```bash
# Import a dashboard from exported NDJSON
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -u elastic:changeme \
  -F file=@dashboard-export.ndjson
```

```bash
# Create a Kibana Space for a team
curl -X POST "http://localhost:5601/api/spaces/space" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:changeme \
  -d '{
    "id": "payments-team",
    "name": "Payments Team",
    "description": "Dashboards and views for the payments team",
    "disabledFeatures": ["canvas", "maps", "ml"],
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
# Create a Kibana alerting rule — Log threshold
curl -X POST "http://localhost:5601/api/alerting/rule" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:changeme \
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
      "size": 100
    },
    "actions": [
      {
        "group": "query matched",
        "id": "slack-connector-id",
        "params": {
          "message": "🚨 Payment service error count exceeded 50 in 5 minutes. Check Kibana for details."
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
  -u elastic:changeme \
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
        "privileges": ["feature_discover.read", "feature_dashboard.read"],
        "resources": ["space:payments-team"]
      }
    ]
  }'
```

## Best Practices

- Use Kibana Spaces to isolate dashboards and data views per team
- Create runtime fields in data views instead of modifying Elasticsearch mappings for ad-hoc analysis
- Use KQL over Lucene query syntax — it handles nested fields and autocompletion better
- Export dashboards as NDJSON for version control and environment promotion
- Set refresh intervals on dashboards (30s-60s) to balance real-time visibility with cluster load
- Use document-level security in roles to restrict which logs each team can see
