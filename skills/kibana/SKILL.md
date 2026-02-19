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
  category: monitoring
  tags: ["kibana", "elasticsearch", "dashboards", "visualization", "kql", "elk"]
---

# Kibana

## Overview

Set up and use Kibana to visualize Elasticsearch data through dashboards, Lens visualizations, and Discover queries. Covers deployment, data views, KQL querying, and Spaces for multi-team access.

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
    ports:
      - "5601:5601"

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
      "timeFieldName": "@timestamp"
    }
  }'
```

```text
# KQL query examples for Discover

# Find errors in a specific service
level: "error" and service.name: "payment-service"

# Status codes 5xx from nginx
http.response.status_code >= 500 and fields.type: "nginx"

# Wildcard search across log messages
message: *timeout* and kubernetes.namespace: "production"

# Nested field queries
kubernetes.labels.app: "api-gateway" and kubernetes.pod.name: pod-*
```

### Task C: Manage Dashboards via API

```bash
# Export a dashboard for backup or migration
curl -X POST "http://localhost:5601/api/saved_objects/_export" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:changeme \
  -d '{ "type": ["dashboard"], "objects": [{ "type": "dashboard", "id": "my-dashboard-id" }], "includeReferencesDeep": true }' \
  -o dashboard-export.ndjson
```

```bash
# Import a dashboard from exported NDJSON
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -u elastic:changeme \
  -F file=@dashboard-export.ndjson
```

### Task D: Create Spaces and Role-Based Access

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
    "disabledFeatures": ["canvas", "maps", "ml"]
  }'
```

```bash
# Create a read-only role with document-level security
curl -X PUT "http://localhost:9200/_security/role/payments_viewer" \
  -H "Content-Type: application/json" \
  -u elastic:changeme \
  -d '{
    "indices": [{
      "names": ["logs-app-*"],
      "privileges": ["read", "view_index_metadata"],
      "query": "{\"match\": {\"service.name\": \"payment-service\"}}"
    }],
    "applications": [{
      "application": "kibana-.kibana",
      "privileges": ["feature_discover.read", "feature_dashboard.read"],
      "resources": ["space:payments-team"]
    }]
  }'
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
    "actions": [{
      "group": "query matched",
      "id": "slack-connector-id",
      "params": { "message": "Payment service error count exceeded 50 in 5 minutes." }
    }]
  }'
```

## Best Practices

- Use Kibana Spaces to isolate dashboards per team
- Create runtime fields in data views for ad-hoc analysis without changing mappings
- Use KQL over Lucene query syntax for better autocompletion and nested field support
- Export dashboards as NDJSON for version control
- Set refresh intervals on dashboards (30s-60s) to balance visibility with cluster load
