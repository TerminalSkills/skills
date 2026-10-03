---
name: gatus
description: >-
  Gatus is a self-hosted health check and status page tool written in Go,
  configured from a single YAML file. Use when a user asks to monitor HTTP,
  TCP, DNS, ICMP or TLS endpoints, define pass/fail conditions on status code,
  response time or JSON body, send Slack, PagerDuty or email alerts, publish a
  status page, or run an uptime monitor with no database.
license: Apache-2.0
compatibility: 'Docker, Kubernetes (Helm) or a Go binary; checked against Gatus v5.37'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/TwiN/gatus
  tags:
  - uptime
  - health-check
  - status-page
  - self-hosted
  - lightweight
---

# Gatus — Lightweight Health Check Dashboard

## Overview

Gatus polls endpoints on an interval, evaluates a list of conditions against each response, shows the results on a built-in status page and fires alerts when an endpoint fails several checks in a row. Everything lives in one YAML file (default path `/config/config.yaml`, override with `GATUS_CONFIG_PATH`, which may also be a directory of `*.yaml` files that are merged). Results are kept in memory by default; `sqlite` or `postgres` storage keeps history across restarts.

## Instructions

### Step 1: Write the configuration

```yaml
# config.yaml
storage:
  type: sqlite                 # memory (default), sqlite or postgres
  path: /data/gatus.db         # file for sqlite, connection URL for postgres
web:
  port: 8080
metrics: true                  # Prometheus metrics at /metrics

alerting:
  slack:
    webhook-url: "${SLACK_WEBHOOK_URL}"      # $VAR and ${VAR} are expanded; write $$ for a literal $
    default-alert:
      failure-threshold: 3     # consecutive failures before alerting (default 3)
      success-threshold: 2     # consecutive successes before resolving (default 2)
      send-on-resolved: true
  pagerduty:
    integration-key: "${PAGERDUTY_KEY}"      # Events API v2 key
    default-alert:
      failure-threshold: 5
      send-on-resolved: true
  email:
    from: "gatus@acme-status.io"
    host: "smtp.acme-status.io"
    port: 587
    username: "${SMTP_USER}"
    password: "${SMTP_PASS}"
    to: "oncall@acme-status.io"              # required

endpoints:
  - name: API Gateway
    group: backend
    url: "https://api.acme-status.io/health"
    interval: 30s                            # default 60s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 2000"             # milliseconds
      - "[BODY].status == healthy"           # JSONPath into the body
    alerts:
      - type: slack                          # type is required even with default-alert
      - type: pagerduty

  - name: Website
    group: frontend
    url: "https://acme-status.io"
    interval: 60s
    conditions:
      - "[STATUS] == 200"
      - "[BODY] == pat(*Welcome*)"           # substring match uses pat(); there is no "contains"
      - "[CERTIFICATE_EXPIRATION] > 720h"    # fail when the TLS cert expires within 30 days

  - name: PostgreSQL
    group: infrastructure
    url: "tcp://db.acme-status.io:5432"
    interval: 30s
    conditions:
      - "[CONNECTED] == true"

  - name: DNS Resolution
    group: infrastructure
    url: "8.8.8.8"                           # DNS server address, no scheme
    dns:
      query-name: "acme-status.io"
      query-type: "A"
    conditions:
      - "[DNS_RCODE] == NOERROR"

  - name: GraphQL API
    group: backend
    url: "https://api.acme-status.io/graphql"
    method: POST
    graphql: true                            # wraps the body as {"query": "..."}
    body: |
      { __typename }
    conditions:
      - "[STATUS] == 200"
      - "[BODY].data.__typename == Query"
```

Other URL forms: `icmp://host` (ping), `starttls://smtp.acme-status.io:587`, and an `ssh:` block for SSH checks. Per-endpoint `client` settings include `insecure`, `timeout` (default 10s) and `ignore-redirect`.

### Step 2: Know the condition syntax

Placeholders: `[STATUS]`, `[BODY]`, `[RESPONSE_TIME]`, `[CONNECTED]`, `[CERTIFICATE_EXPIRATION]`, `[DNS_RCODE]`, `[IP]`. Each condition must read `<value> <comparator> <value>` (`==`, `!=`, `<`, `<=`, `>`, `>=`); anything else, such as `[BODY] contains x`, stops startup with `invalid condition format`. Functions: `len([BODY].items) > 0`, `has([BODY].errors) == false`, `pat(...)` and `any(...)` (with `==` and `!=` only), e.g. `[STATUS] == any(200, 429)`. Prefer `[STATUS] < 300` over `pat(2*)`, which costs more.

### Step 3: Run it

```bash
docker run -d --name gatus -p 8080:8080 \
  -e SLACK_WEBHOOK_URL -e PAGERDUTY_KEY -e SMTP_USER -e SMTP_PASS \
  --mount type=bind,source="$(pwd)/config.yaml",target=/config/config.yaml,readonly \
  -v gatus-data:/data \
  ghcr.io/twin/gatus:stable
```

`twinproduction/gatus:stable` on Docker Hub is the same image. Docker Compose:

```yaml
services:
  gatus:
    image: ghcr.io/twin/gatus:stable
    ports: ["8080:8080"]
    volumes:
      - ./config.yaml:/config/config.yaml:ro
      - gatus-data:/data
    environment:
      - SLACK_WEBHOOK_URL
      - PAGERDUTY_KEY
      - SMTP_USER
      - SMTP_PASS
    restart: unless-stopped
volumes:
  gatus-data:
```

Other install routes: Helm (`helm repo add twin https://twin.github.io/helm-charts && helm install gatus twin/gatus`) or `go install github.com/TwiN/gatus/v5@latest` for a binary.

Verify: open `http://localhost:8080`, or `curl http://localhost:8080/health` (returns `{"status":"UP"}`) and `curl http://localhost:8080/api/v1/endpoints/statuses` for every endpoint's latest results. Set `GATUS_LOG_LEVEL=DEBUG` when troubleshooting.

## Examples

### Example 1: Monitor a Node.js API and React frontend

User request: "I have a Node.js API and a React frontend in Docker. Set up Gatus to watch both and tell Slack when either is down."

Create `config.yaml` with two endpoints in groups `backend` and `frontend` (as above), the `slack` provider with `default-alert`, and run the Compose service. Expected result: the status page at `http://localhost:8080` shows two groups; after three failed checks in a row (about 90 seconds at `interval: 30s`) Slack receives an alert, and a resolved message after two successes.

### Example 2: Gatus will not start after editing conditions

User request: "Gatus exits right away with 'error parsing config'. Here is the log."

```
panic: error parsing config: invalid endpoint _website: invalid condition format: does not match '<VALUE> <COMPARATOR> <VALUE>': invalid condition: [BODY] contains Welcome
```

Fix: replace the condition with `[BODY] == pat(*Welcome*)`, then `docker restart gatus` and check `docker logs gatus` for `Monitored group=...; success=true` lines.

## Guidelines

- Check status AND response time AND content: a 200 with the wrong body is still an outage.
- Keep secrets in environment variables; escape a literal `$` in values as `$$`.
- Use `storage.type: sqlite` (and a mounted volume) for history across restarts; with the default `memory`, uptime resets whenever the container restarts.
- Failure threshold 2 to 3 avoids alerts from single network blips; each endpoint still needs `alerts: - type: ...`.
- Alerting providers go well beyond Slack, PagerDuty and email (Discord, Teams Workflow, Telegram, Ntfy, Twilio and others); each has its own keys, so check the README section for the provider.
- Gatus protects its own page only when `security` (basic auth or OIDC) is configured; do not expose it publicly if URLs or errors reveal internals, and use `ui.hide-url` for URLs that contain tokens.
- Gatus checks from where it runs: a monitor on the same host or network as your service cannot see an outage of that host or network.
