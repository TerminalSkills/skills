---
name: fluentd
description: >-
  Configure Fluentd for unified log collection, routing, filtering, and
  forwarding across distributed systems. Use when a user needs to aggregate
  logs from multiple sources, transform log data with filters, route logs
  to different destinations, or set up Fluentd as a Kubernetes log collector.
license: Apache-2.0
compatibility: "Fluentd 1.16+, Fluent Bit 2.0+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["fluentd", "logging", "log-collection", "log-routing", "kubernetes", "observability"]
---

# Fluentd

## Overview

Set up Fluentd as a unified logging layer to collect, filter, transform, and forward logs from applications, containers, and infrastructure to various backends.

## Instructions

### Task A: Basic Fluentd Configuration

```xml
<!-- fluent.conf — Collect application logs and forward to Elasticsearch -->
<source>
  @type tail
  path /var/log/app/*.log
  pos_file /var/log/fluentd/app.log.pos
  tag app.logs
  <parse>
    @type json
    time_key timestamp
    time_format %Y-%m-%dT%H:%M:%S.%NZ
  </parse>
</source>

<source>
  @type tail
  path /var/log/nginx/access.log
  pos_file /var/log/fluentd/nginx.log.pos
  tag nginx.access
  <parse>
    @type regexp
    expression /^(?<remote>[^ ]*) - (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+) (?<path>\S+) (?<protocol>\S+)" (?<status>\d+) (?<size>\d+)/
    time_format %d/%b/%Y:%H:%M:%S %z
  </parse>
</source>

<filter app.logs>
  @type record_transformer
  <record>
    hostname "#{Socket.gethostname}"
    environment production
  </record>
</filter>

<filter app.logs>
  @type grep
  <exclude>
    key level
    pattern /^debug$/
  </exclude>
</filter>

<match app.logs nginx.access>
  @type elasticsearch
  host elasticsearch
  port 9200
  index_name fluentd-${tag}-%Y.%m.%d
  <buffer tag, time>
    @type file
    path /var/log/fluentd/buffer/es
    timekey 1h
    flush_interval 30s
    chunk_limit_size 8MB
    total_limit_size 2GB
    overflow_action block
  </buffer>
</match>
```

### Task B: Multi-Output Routing

```xml
<!-- fluent.conf — Route logs to different destinations based on tag -->
<match error.**>
  @type copy
  <store>
    @type elasticsearch
    host elasticsearch
    port 9200
    index_name errors-%Y.%m.%d
  </store>
  <store>
    @type slack
    webhook_url https://hooks.slack.com/services/T00/B00/XXXX
    channel ops-errors
    message "Error from %s: %s"
    message_keys tag,message
  </store>
</match>

<match audit.**>
  @type s3
  aws_key_id "#{ENV['AWS_ACCESS_KEY_ID']}"
  aws_sec_key "#{ENV['AWS_SECRET_ACCESS_KEY']}"
  s3_bucket audit-logs-production
  s3_region us-east-1
  path logs/%Y/%m/%d/
  <buffer time>
    @type file
    path /var/log/fluentd/buffer/s3
    timekey 3600
    chunk_limit_size 256MB
  </buffer>
</match>
```

### Task C: Kubernetes DaemonSet Deployment

```yaml
# fluentd-daemonset.yml — Fluentd DaemonSet for Kubernetes log collection
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: logging
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      serviceAccountName: fluentd
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          effect: NoSchedule
      containers:
        - name: fluentd
          image: fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1
          env:
            - name: FLUENT_ELASTICSEARCH_HOST
              value: "elasticsearch.logging.svc.cluster.local"
            - name: FLUENT_ELASTICSEARCH_PORT
              value: "9200"
          resources:
            limits:
              memory: 512Mi
            requests:
              cpu: 100m
              memory: 256Mi
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: containers
              mountPath: /var/lib/docker/containers
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: containers
          hostPath:
            path: /var/lib/docker/containers
```

### Task D: Log Parsing and Transformation

```xml
<!-- fluent.conf — Parse multiline Java stack traces -->
<source>
  @type tail
  path /var/log/app/java-app.log
  tag java.app
  <parse>
    @type multiline
    format_firstline /^\d{4}-\d{2}-\d{2}/
    format1 /^(?<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.\d{3}) (?<level>\w+) \[(?<thread>[^\]]+)\] (?<class>[^ ]+) - (?<message>.*)/
  </parse>
</source>

<filter java.app>
  @type record_transformer
  enable_ruby true
  <record>
    severity ${record["level"] == "ERROR" ? "error" : record["level"] == "WARN" ? "warning" : "info"}
  </record>
</filter>
```

## Best Practices

- Use file-based buffers in production to prevent log loss during restarts
- Set `overflow_action block` to apply backpressure instead of dropping logs
- Exclude debug-level logs early in the pipeline to reduce downstream volume
- Use `@type copy` for critical logs that need multiple destinations
- In Kubernetes, use Fluent Bit as a lightweight forwarder and Fluentd as an aggregator
