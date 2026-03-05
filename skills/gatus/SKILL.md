---
name: gatus
category: Observability & Monitoring
tags: [uptime, health-check, status-page, self-hosted, lightweight, go]
version: 1.0.0
author: terminal-skills
---

# Gatus — Lightweight Health Check Dashboard

You are an expert in Gatus, the lightweight, self-hosted health check and status page tool written in Go. You help developers set up endpoint monitoring with conditions, alerting, and a beautiful status page — all configured via a single YAML file with no database required.

## Core Capabilities

### Configuration

```yaml
# config.yaml — Complete Gatus configuration
# Single YAML file defines all endpoints, conditions, and alerts.

# Storage (optional — for persistence across restarts)
storage:
  type: sqlite
  path: /data/gatus.db

# Web UI settings
web:
  port: 8080

# Alert providers
alerting:
  slack:
    webhook-url: "${SLACK_WEBHOOK_URL}"
    default-alert:
      enabled: true
      failure-threshold: 3             # Alert after 3 consecutive failures
      success-threshold: 2             # Recover after 2 consecutive successes
      send-on-resolved: true
  
  pagerduty:
    integration-key: "${PAGERDUTY_KEY}"
    default-alert:
      enabled: true
      failure-threshold: 5
      send-on-resolved: true

  email:
    from: "gatus@example.com"
    host: "smtp.example.com"
    port: 587
    username: "${SMTP_USER}"
    password: "${SMTP_PASS}"
    default-alert:
      enabled: false                    # Only enable on critical endpoints

# Endpoints to monitor
endpoints:
  # --- API Health ---
  - name: API Gateway
    group: backend
    url: "https://api.example.com/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 2000"       # Under 2 seconds
      - "[BODY].status == healthy"     # JSON body check
    alerts:
      - type: slack
      - type: pagerduty

  - name: Auth Service
    group: backend
    url: "https://api.example.com/auth/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 1000"

  # --- Frontend ---
  - name: Website
    group: frontend
    url: "https://example.com"
    interval: 60s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 3000"
      - "[BODY] contains Welcome"      # Verify page renders
    alerts:
      - type: slack

  # --- Database ---
  - name: PostgreSQL
    group: infrastructure
    url: "tcp://db.example.com:5432"
    interval: 30s
    conditions:
      - "[CONNECTED] == true"
    alerts:
      - type: slack
      - type: pagerduty

  # --- Redis ---
  - name: Redis
    group: infrastructure
    url: "tcp://redis.example.com:6379"
    interval: 15s
    conditions:
      - "[CONNECTED] == true"

  # --- DNS ---
  - name: DNS Resolution
    group: infrastructure
    url: "dns://8.8.8.8"
    dns:
      query-name: "example.com"
      query-type: "A"
    conditions:
      - "[DNS_RCODE] == NOERROR"
      - "[RESPONSE_TIME] < 500"

  # --- SSL Certificate ---
  - name: SSL Certificate
    group: security
    url: "https://example.com"
    interval: 1h
    conditions:
      - "[CERTIFICATE_EXPIRATION] > 720h"    # Alert if < 30 days

  # --- External Dependencies ---
  - name: Stripe API
    group: external
    url: "https://api.stripe.com/v1"
    interval: 5m
    conditions:
      - "[STATUS] == 401"               # Unauthenticated is expected (API is up)
      - "[RESPONSE_TIME] < 3000"

  # --- GraphQL ---
  - name: GraphQL API
    group: backend
    url: "https://api.example.com/graphql"
    method: POST
    headers:
      Content-Type: application/json
    body: '{"query": "{ __typename }"}'
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[BODY].data.__typename == Query"
```

### Deployment

```yaml
# docker-compose.yml — Self-hosted Gatus
version: "3.8"
services:
  gatus:
    image: twinproduction/gatus:latest
    ports:
      - "8080:8080"
    volumes:
      - ./config.yaml:/config/config.yaml
      - gatus-data:/data
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
      - PAGERDUTY_KEY=${PAGERDUTY_KEY}
    restart: unless-stopped

volumes:
  gatus-data:
```

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gatus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: gatus
  template:
    metadata:
      labels:
        app: gatus
    spec:
      containers:
        - name: gatus
          image: twinproduction/gatus:latest
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: config
              mountPath: /config
          envFrom:
            - secretRef:
                name: gatus-secrets
      volumes:
        - name: config
          configMap:
            name: gatus-config
```

## Installation

```bash
# Docker
docker run -p 8080:8080 -v $(pwd)/config.yaml:/config/config.yaml twinproduction/gatus

# Binary
go install github.com/TwiN/gatus/v5@latest

# Helm
helm repo add gatus https://twin.github.io/helm-charts
helm install gatus gatus/gatus
```

## Best Practices

1. **Single YAML** — Keep all monitoring in one config file; version control it alongside your infrastructure
2. **Group endpoints** — Use groups (backend, frontend, infrastructure) for organized status page display
3. **Multiple conditions** — Check status code AND response time AND body content; a 200 with wrong content is still broken
4. **Failure thresholds** — Set failure-threshold to 2-3 to avoid false alarms from transient network blips
5. **Check dependencies** — Monitor external services (Stripe, AWS) separately; know when the issue is upstream vs yours
6. **SSL monitoring** — Check certificate expiration weekly; alert at 30 days to give time for renewal
7. **Lightweight deployment** — Gatus uses ~15MB RAM; run it on any machine, even a Raspberry Pi
8. **SQLite for history** — Enable SQLite storage for uptime history across restarts; no external database needed
