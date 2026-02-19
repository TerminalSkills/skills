---
title: "Centralize Logs with the ELK Stack for a Distributed System"
slug: centralize-logs-with-elk-stack
description: "Build centralized logging with Elasticsearch, Logstash, and Kibana, using Fluentd as the collection layer, for a distributed microservices system."
skills: [elasticsearch-search, logstash, kibana, fluentd]
category: devops
tags: [logging, elk, elasticsearch, logstash, kibana, fluentd, centralized-logging]
---

# Centralize Logs with the ELK Stack for a Distributed System

## The Problem

Tom manages 30 microservices on Kubernetes. When something breaks, developers SSH into individual pods and grep through container logs. A single request touches five services, and correlating logs means opening multiple terminals and matching timestamps manually. Last week a checkout failure took three hours to debug because the root cause was in the notification service — the last place anyone looked.

## The Solution

Deploy Fluentd as a DaemonSet to collect container logs, Logstash to parse and enrich them, Elasticsearch for storage and search, and Kibana for visualization.

```bash
# Install the skills
npx terminal-skills install elasticsearch-search logstash kibana fluentd
```

## Step-by-Step Walkthrough

### 1. Deploy Elasticsearch for Log Storage

Tom sets up a 3-node Elasticsearch cluster with index lifecycle management to control storage costs.

```bash
# Create ILM policy for log retention
curl -X PUT "http://elasticsearch:9200/_ilm/policy/logs-policy" \
  -H "Content-Type: application/json" \
  -u elastic:${ES_PASSWORD} \
  -d '{
    "policy": {
      "phases": {
        "hot": { "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" } } },
        "warm": { "min_age": "7d", "actions": { "shrink": { "number_of_shards": 1 }, "forcemerge": { "max_num_segments": 1 } } },
        "delete": { "min_age": "30d", "actions": { "delete": {} } }
      }
    }
  }'
```

### 2. Deploy Fluentd as a Log Collector

Fluentd runs as a DaemonSet on every node, tailing container logs and forwarding to Logstash. It enriches every entry with Kubernetes metadata — pod name, namespace, labels.

```yaml
# fluentd-configmap.yml — Kubernetes-aware Fluentd configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: logging
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      <parse>
        @type cri
      </parse>
    </source>

    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>

    <filter kubernetes.**>
      @type grep
      <exclude>
        key $.kubernetes.namespace_name
        pattern /^(kube-system|logging)$/
      </exclude>
    </filter>

    <match kubernetes.**>
      @type forward
      <server>
        host logstash.logging.svc.cluster.local
        port 24224
      </server>
      <buffer>
        @type file
        path /var/log/fluentd/buffer
        flush_interval 10s
        chunk_limit_size 8MB
      </buffer>
    </match>
```

### 3. Configure Logstash for Log Parsing

Logstash receives forwarded logs and applies parsing rules. Some services emit JSON, others need Grok patterns.

```ruby
# logstash/pipeline/main.conf — Parse and enrich logs
input {
  tcp {
    port => 24224
    codec => json
  }
}

filter {
  if [kubernetes][labels][app] {
    mutate { add_field => { "service" => "%{[kubernetes][labels][app]}" } }
  }

  if [log] =~ /^\{/ {
    json { source => "log" target => "app" }
    if [app][level] { mutate { add_field => { "level" => "%{[app][level]}" } } }
    if [app][request_id] { mutate { add_field => { "request_id" => "%{[app][request_id]}" } } }
  } else {
    grok {
      match => {
        "log" => "^%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} \[%{DATA:thread}\] %{DATA:logger} - %{GREEDYDATA:message}"
      }
      tag_on_failure => ["_unstructured"]
    }
  }

  if [level] { mutate { lowercase => ["level"] } }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    user => "elastic"
    password => "${ES_PASSWORD}"
    index => "logs-%{[service]}-%{+YYYY.MM.dd}"
  }
}
```

The key is the `request_id` field. Tom's services pass a correlation ID through HTTP headers. In Kibana he can filter by `request_id: "abc-123"` and see every log from every service that handled that request.

### 4. Set Up Kibana Dashboards

```bash
# Create a data view for all service logs
curl -X POST "http://kibana:5601/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:${ES_PASSWORD} \
  -d '{ "data_view": { "title": "logs-*", "name": "All Service Logs", "timeFieldName": "@timestamp" } }'
```

Tom builds a dashboard with these panels:
- **Error count by service** — bar chart showing which services have the most errors
- **Log volume over time** — line chart split by service to spot spikes
- **Top error messages** — table of most frequent errors
- **Request correlation** — saved KQL queries for tracing requests across services

Common KQL queries the team uses daily:

```text
# All errors for a specific request
request_id: "req-abc-123" and level: "error"

# Checkout flow errors
service: ("api-gateway" or "order-service" or "payment-service") and level: "error"

# Database timeouts
message: *timeout* and service: "order-service"
```

### 5. Set Up Log-Based Alerts

```bash
# Alert rule for error rate spikes
curl -X POST "http://kibana:5601/api/alerting/rule" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:${ES_PASSWORD} \
  -d '{
    "name": "Error spike - any service",
    "rule_type_id": ".es-query",
    "consumer": "alerts",
    "schedule": { "interval": "1m" },
    "params": {
      "searchType": "esQuery",
      "timeWindowSize": 5,
      "timeWindowUnit": "m",
      "threshold": [100],
      "thresholdComparator": ">",
      "esQuery": "{\"query\":{\"match\":{\"level\":\"error\"}}}",
      "index": ["logs-*"],
      "timeField": "@timestamp",
      "size": 100
    },
    "actions": [{
      "group": "query matched",
      "id": "slack-connector-id",
      "params": { "message": "Error spike: 100+ errors in 5 minutes. Check Kibana." }
    }]
  }'
```

## The Result

The next checkout issue takes two minutes to diagnose instead of three hours. Tom's team searches for the request ID in Kibana and instantly sees: the API gateway received it, the order service processed it, but the payment service logged a connection timeout. Error alerts catch issues proactively, and the dashboard gives the team a real-time pulse during peak traffic.
