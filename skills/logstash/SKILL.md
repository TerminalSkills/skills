---
name: logstash
description: >-
  Configure Logstash for log ingestion, parsing, transformation, and output
  to Elasticsearch and other destinations. Use when a user needs to build
  log processing pipelines, write Grok patterns, parse unstructured logs,
  enrich events, or set up multi-pipeline Logstash deployments.
license: Apache-2.0
compatibility: "Logstash 8.10+, Elasticsearch 8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["logstash", "logging", "grok", "elk", "log-processing", "pipelines"]
---

# Logstash

## Overview

Build Logstash pipelines to ingest, parse, transform, and route log data. Covers Grok pattern writing, multi-pipeline configuration, and performance tuning.

## Instructions

### Task A: Basic Pipeline Configuration

```ruby
# /etc/logstash/conf.d/main.conf — Basic log processing pipeline
input {
  beats {
    port => 5044
  }
  tcp {
    port => 5000
    codec => json_lines
  }
}

filter {
  if [fields][type] == "nginx" {
    grok {
      match => {
        "message" => '%{IPORHOST:client_ip} - %{DATA:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int} "%{DATA:referrer}" "%{DATA:user_agent}"'
      }
    }
    date {
      match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
      target => "@timestamp"
    }
    geoip {
      source => "client_ip"
      target => "geo"
    }
    mutate {
      remove_field => ["message", "timestamp"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{[fields][type]}-%{+YYYY.MM.dd}"
  }
}
```

### Task B: Advanced Grok Patterns

```ruby
# /etc/logstash/conf.d/app-logs.conf — Parse application log formats
filter {
  if [fields][type] == "app" {
    if [message] =~ /^\{/ {
      json {
        source => "message"
        target => "app"
      }
    } else {
      grok {
        match => {
          "message" => "^%{TIMESTAMP_ISO8601:timestamp} \[%{LOGLEVEL:level}\] \[%{DATA:request_id}\] %{DATA:class} - %{GREEDYDATA:log_message}"
        }
      }
    }

    # Extract duration from log messages like "processed in 245ms"
    grok {
      match => { "log_message" => "processed in %{NUMBER:duration_ms:float}ms" }
      tag_on_failure => []
    }

    date {
      match => ["timestamp", "yyyy-MM-dd HH:mm:ss.SSS", "ISO8601"]
      target => "@timestamp"
    }
  }
}
```

```ruby
# /etc/logstash/patterns/custom — Custom Grok pattern definitions
JAVA_STACKTRACE (?:(?:\s+at\s+[\w.$]+\([^)]*\)\n?)+)
SPRING_LOG %{TIMESTAMP_ISO8601:timestamp}\s+%{LOGLEVEL:level}\s+%{INT:pid}\s+---\s+\[%{DATA:thread}\]\s+%{DATA:logger}\s+:\s+%{GREEDYDATA:message}
```

### Task C: Multi-Pipeline Configuration

```yaml
# /etc/logstash/pipelines.yml — Run multiple independent pipelines
- pipeline.id: nginx-pipeline
  path.config: "/etc/logstash/conf.d/nginx.conf"
  pipeline.workers: 2
  pipeline.batch.size: 250

- pipeline.id: app-pipeline
  path.config: "/etc/logstash/conf.d/app-logs.conf"
  pipeline.workers: 4
  pipeline.batch.size: 500

- pipeline.id: audit-pipeline
  path.config: "/etc/logstash/conf.d/audit.conf"
  pipeline.workers: 1
  queue.type: persisted
  queue.max_bytes: 4gb
```

```ruby
# /etc/logstash/conf.d/audit.conf — Audit log pipeline from Kafka
input {
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["audit-events"]
    group_id => "logstash-audit"
    codec => json
  }
}

filter {
  fingerprint {
    source => ["user_id", "action", "@timestamp"]
    target => "event_fingerprint"
    method => "SHA256"
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "audit-%{+YYYY.MM}"
    document_id => "%{event_fingerprint}"
    action => "create"
  }
}
```

### Task D: Docker Deployment

```yaml
# docker-compose.yml — Logstash with custom config
services:
  logstash:
    image: docker.elastic.co/logstash/logstash:8.12.0
    environment:
      - LS_JAVA_OPTS=-Xms1g -Xmx1g
    volumes:
      - ./logstash/conf.d:/etc/logstash/conf.d
      - ./logstash/patterns:/etc/logstash/patterns
      - ./logstash/pipelines.yml:/usr/share/logstash/config/pipelines.yml
    ports:
      - "5044:5044"
      - "5000:5000"
      - "9600:9600"
```

### Task E: Performance Monitoring

```bash
# Check Logstash pipeline stats
curl -s "http://localhost:9600/_node/stats/pipelines" | \
  jq '.pipelines | to_entries[] | {pipeline: .key, events_in: .value.events.in, events_out: .value.events.out}'
```

## Best Practices

- Use persisted queues for pipelines processing critical data
- Test Grok patterns with `grokdebugger` in Kibana before deploying
- Use `tag_on_failure => []` for optional Grok matches
- Separate pipelines by data source to isolate failures
- Use `[@metadata]` fields for routing — they are not sent to outputs
