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

Tom manages 30 microservices spread across a Kubernetes cluster. When something breaks, developers SSH into individual pods and grep through container logs to find the error. A single user request touches five or six services, and correlating logs across them means opening multiple terminal windows and manually matching timestamps. Last week a checkout failure took three hours to debug because the root cause was a malformed message in the notification service — the last place anyone looked.

Tom needs every log in one place, searchable by service name, request ID, timestamp, or error message. He needs dashboards that show error trends and the ability to trace a single request across all services through correlated log entries.

## The Solution

Deploy Fluentd as a DaemonSet on every Kubernetes node to collect container logs, Logstash to parse and enrich them, Elasticsearch for storage and search, and Kibana for visualization and exploration.

```bash
# Install the skills
npx terminal-skills install elasticsearch-search logstash kibana fluentd
```

## Step-by-Step Walkthrough

### 1. Deploy Elasticsearch for Log Storage

Tom starts with an Elasticsearch cluster sized for his log volume — roughly 50 GB per day across all services.

```yaml
# elasticsearch-statefulset.yml — Elasticsearch cluster for log storage
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: elasticsearch
  namespace: logging
spec:
  serviceName: elasticsearch
  replicas: 3
  selector:
    matchLabels:
      app: elasticsearch
  template:
    metadata:
      labels:
        app: elasticsearch
    spec:
      containers:
        - name: elasticsearch
          image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
          env:
            - name: cluster.name
              value: logs-cluster
            - name: discovery.seed_hosts
              value: "elasticsearch-0,elasticsearch-1,elasticsearch-2"
            - name: cluster.initial_master_nodes
              value: "elasticsearch-0,elasticsearch-1,elasticsearch-2"
            - name: xpack.security.enabled
              value: "true"
            - name: ELASTIC_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: elasticsearch-credentials
                  key: password
            - name: ES_JAVA_OPTS
              value: "-Xms2g -Xmx2g"
          ports:
            - containerPort: 9200
            - containerPort: 9300
          volumeMounts:
            - name: data
              mountPath: /usr/share/elasticsearch/data
          resources:
            requests:
              memory: 4Gi
              cpu: "1"
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 100Gi
```

He also sets up an index lifecycle management policy so logs older than 14 days move to cheaper storage and get deleted after 30 days.

```bash
# Create ILM policy for log retention
curl -X PUT "http://elasticsearch:9200/_ilm/policy/logs-policy" \
  -H "Content-Type: application/json" \
  -u elastic:${ES_PASSWORD} \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" }
          }
        },
        "warm": {
          "min_age": "7d",
          "actions": {
            "shrink": { "number_of_shards": 1 },
            "forcemerge": { "max_num_segments": 1 }
          }
        },
        "delete": {
          "min_age": "30d",
          "actions": { "delete": {} }
        }
      }
    }
  }'
```

### 2. Deploy Fluentd as a Log Collector

Fluentd runs as a DaemonSet on every node, tailing container log files and forwarding them to Logstash for processing.

```yaml
# fluentd-configmap.yml — Fluentd configuration for Kubernetes log collection
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
        retry_max_interval 30
      </buffer>
    </match>
```

Fluentd enriches every log entry with Kubernetes metadata — pod name, namespace, container name, and labels — before forwarding. This means Tom never has to guess which pod generated a log line.

### 3. Configure Logstash for Log Parsing

Logstash receives the forwarded logs from Fluentd and applies parsing rules based on the service type. Some services emit structured JSON, others emit unstructured text that needs Grok patterns.

```ruby
# logstash/pipeline/main.conf — Parse and enrich logs before indexing
input {
  tcp {
    port => 24224
    codec => json
  }
}

filter {
  # Extract service name from Kubernetes labels
  if [kubernetes][labels][app] {
    mutate {
      add_field => { "service" => "%{[kubernetes][labels][app]}" }
    }
  }

  # Parse JSON log bodies
  if [log] =~ /^\{/ {
    json {
      source => "log"
      target => "app"
    }
    if [app][level] {
      mutate { add_field => { "level" => "%{[app][level]}" } }
    }
    if [app][request_id] {
      mutate { add_field => { "request_id" => "%{[app][request_id]}" } }
    }
  } else {
    # Parse unstructured Java/Spring logs
    grok {
      match => {
        "log" => "^%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} \[%{DATA:thread}\] %{DATA:logger} - %{GREEDYDATA:message}"
      }
      tag_on_failure => ["_unstructured"]
    }
  }

  # Normalize log levels
  if [level] {
    mutate { lowercase => ["level"] }
  }

  # Add request_id for cross-service correlation
  if [request_id] {
    mutate {
      add_field => { "[@metadata][has_request_id]" => "true" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    user => "elastic"
    password => "${ES_PASSWORD}"
    index => "logs-%{[service]}-%{+YYYY.MM.dd}"
    manage_template => true
  }
}
```

The key insight is the `request_id` field. Tom's services already pass a correlation ID through HTTP headers. Logstash extracts it, so in Kibana he can filter by `request_id: "abc-123"` and see every log line from every service that handled that request.

### 4. Set Up Kibana Dashboards

Tom creates data views and dashboards in Kibana for his team to use daily.

```bash
# Create data views for each service pattern
curl -X POST "http://kibana:5601/api/data_views/data_view" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -u elastic:${ES_PASSWORD} \
  -d '{
    "data_view": {
      "title": "logs-*",
      "name": "All Service Logs",
      "timeFieldName": "@timestamp"
    }
  }'
```

He builds a main operations dashboard with these panels:

- **Error count by service** — bar chart showing which services have the most errors in the last hour
- **Log volume over time** — line chart split by service to spot unusual spikes
- **Top error messages** — table showing the most frequent error messages for quick pattern recognition
- **Request latency from logs** — for services that log request duration, a P95 line chart

The team bookmarks common KQL queries for daily use:

```text
# Find all errors for a specific request
request_id: "req-abc-123" and level: "error"

# Checkout flow errors in the last hour
service: ("api-gateway" or "order-service" or "payment-service") and level: "error"

# Database timeout errors
message: *timeout* and service: "order-service"
```

### 5. Set Up Log-Based Alerts

Tom configures Kibana alerting rules to catch error spikes before they become incidents.

```bash
# Create an alert rule for error rate spikes
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
      "esQuery": "{\"query\":{\"bool\":{\"must\":[{\"match\":{\"level\":\"error\"}}]}}}",
      "index": ["logs-*"],
      "timeField": "@timestamp",
      "size": 100
    },
    "actions": [
      {
        "group": "query matched",
        "id": "slack-connector-id",
        "params": {
          "message": "Error spike detected: more than 100 errors in 5 minutes across services. Check Kibana for details."
        }
      }
    ]
  }'
```

## The Result

The next time a checkout issue occurs, Tom's team opens Kibana, searches for the customer's request ID, and instantly sees the full journey: the API gateway received the request, the order service processed it, but the payment service logged a connection timeout to the external provider. What used to take three hours of log grepping now takes two minutes. Error spike alerts catch issues proactively, and the operations dashboard gives the team a real-time pulse on system health during peak traffic.
