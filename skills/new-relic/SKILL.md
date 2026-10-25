---
name: new-relic
description: >-
  Set up and manage New Relic for full-stack observability including APM,
  browser monitoring, infrastructure monitoring, and alerting. Use when a user
  needs to instrument applications, write NRQL queries, create dashboards,
  configure alert policies, or integrate New Relic with their deployment pipeline.
license: Apache-2.0
compatibility: "New Relic account; Node.js agent 14.x needs Node.js 22+; Linux infrastructure agent via apt/yum"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "new-relic, observability, apm, nrql, alerts"
---

# New Relic

## Overview

Configure New Relic for application performance monitoring, infrastructure observability, browser real-user monitoring, and intelligent alerting. Covers agent installation, NRQL querying, dashboard creation, and alert policy configuration.

## Instructions

### Install the APM agent (Node.js)

```bash
# Install New Relic Node.js agent
npm install newrelic
```

Agent 14.x requires Node.js 22 or newer (`engines.node` in the npm package); 12.x is the line for older Node. The license key is the ingest license key of the account, not a `NRAK-` user API key.

```javascript
// newrelic.js — New Relic agent configuration (must be first require)
'use strict'
exports.config = {
  app_name: ['payment-service'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },
  logging: { level: 'info' },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
    ]
  },
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f',
    record_sql: 'obfuscated',
  },
  error_collector: {
    enabled: true,
    ignore_status_codes: [404, 401],
  },
}
```

```javascript
// app.js — load New Relic before anything else
require('newrelic')
const express = require('express')
const app = express()

app.get('/api/orders', async (req, res) => {
  res.json([{ id: 'ord_1042', total: 59.9 }])
})

app.listen(3000)
```

For an ES-module app, rename `newrelic.js` to `newrelic.cjs` and start with `node --import newrelic/esm-loader.mjs -r newrelic app.js`.

### Install the infrastructure agent (Ubuntu)

Per the official apt instructions (use your release codename in place of `noble`):

```bash
echo "license_key: ${NEW_RELIC_LICENSE_KEY}" | sudo tee -a /etc/newrelic-infra.yml
curl -fsSL https://download.newrelic.com/infrastructure_agent/gpg/newrelic-infra.gpg | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/newrelic-infra.gpg
echo "deb https://download.newrelic.com/infrastructure_agent/linux/apt noble main" | sudo tee -a /etc/apt/sources.list.d/newrelic-infra.list
sudo apt-get update && sudo apt-get install newrelic-infra -y
```

Then add the options you need to `/etc/newrelic-infra.yml` and restart with `sudo systemctl restart newrelic-infra`:

```yaml
# /etc/newrelic-infra.yml — Infrastructure agent config
# license_key is already set by the echo step above
display_name: "web-server-01"
custom_attributes:
  environment: production
  team: platform
  region: us-east-1
enable_process_metrics: true
metrics_system_sample_rate: 15
metrics_network_sample_rate: 15
```

### Browser monitoring

Create a Browser application in the New Relic UI (Add data > Browser monitoring), choose the copy/paste method and paste the generated `<script>` into `<head>` of every page, as high as possible. The snippet carries your application ID and keys; do not hand-write it. The same screen offers the npm `@newrelic/browser-agent` package for bundled apps.

## Examples

### NRQL queries

```sql
-- Find slowest transactions in the last hour
SELECT average(duration), max(duration), count(*)
FROM Transaction
WHERE appName = 'payment-service'
FACET name
SINCE 1 hour ago
ORDER BY average(duration) DESC
LIMIT 20
```

```sql
-- Error rate by deployment version
SELECT percentage(count(*), WHERE error IS true) AS 'Error Rate'
FROM Transaction
WHERE appName = 'payment-service'
FACET tags.version
SINCE 1 day ago
TIMESERIES 15 minutes
```

```sql
-- Apdex score trend over time
SELECT apdex(duration, 0.5) AS 'Apdex'
FROM Transaction
WHERE appName = 'payment-service'
SINCE 7 days ago
TIMESERIES 1 hour
```

```sql
-- Infrastructure: hosts with high CPU
SELECT average(cpuPercent), max(memoryUsedPercent)
FROM SystemSample
WHERE environment = 'production'
FACET hostname
SINCE 30 minutes ago
```

The three calls below use a user API key (`NRAK-...`) in `NEW_RELIC_USER_API_KEY` and a real account ID in place of `1234567`; EU accounts post to `https://api.eu.newrelic.com/graphql`. Each returns the created `id` or `guid`.

### Alert policy and condition via NerdGraph

```bash
# Create an alert policy via NerdGraph API
curl -sS -X POST 'https://api.newrelic.com/graphql' \
  -H "Content-Type: application/json" \
  -H "Api-Key: ${NEW_RELIC_USER_API_KEY}" \
  -d '{
    "query": "mutation { alertsPolicyCreate(accountId: 1234567, policy: { name: \"Payment Service - Production\", incidentPreference: PER_CONDITION_AND_TARGET }) { id name } }"
  }'
```

```bash
# Create a NRQL alert condition — High error rate
curl -sS -X POST 'https://api.newrelic.com/graphql' \
  -H "Content-Type: application/json" \
  -H "Api-Key: ${NEW_RELIC_USER_API_KEY}" \
  -d '{
    "query": "mutation { alertsNrqlConditionStaticCreate(accountId: 1234567, policyId: 987654, condition: { name: \"High Error Rate\", enabled: true, nrql: { query: \"SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = '\''payment-service'\''\" }, signal: { aggregationWindow: 300, aggregationMethod: EVENT_FLOW, aggregationDelay: 120 }, terms: [{ threshold: 5, thresholdOccurrences: ALL, thresholdDuration: 300, operator: ABOVE, priority: CRITICAL }, { threshold: 2, thresholdOccurrences: ALL, thresholdDuration: 300, operator: ABOVE, priority: WARNING }], valueFunction: SINGLE_VALUE, violationTimeLimitSeconds: 86400 }) { id name } }"
  }'
```

### Dashboard via NerdGraph

```bash
# Create a dashboard with multiple widgets
curl -sS -X POST 'https://api.newrelic.com/graphql' \
  -H "Content-Type: application/json" \
  -H "Api-Key: ${NEW_RELIC_USER_API_KEY}" \
  -d '{
    "query": "mutation { dashboardCreate(accountId: 1234567, dashboard: { name: \"Payment Service Overview\", permissions: PUBLIC_READ_WRITE, pages: [{ name: \"Overview\", widgets: [{ title: \"Throughput\", configuration: { line: { nrqlQueries: [{ accountIds: [1234567], query: \"SELECT rate(count(*), 1 minute) FROM Transaction WHERE appName = '\''payment-service'\'' TIMESERIES\" }] } } }, { title: \"Error Rate\", configuration: { billboard: { nrqlQueries: [{ accountIds: [1234567], query: \"SELECT percentage(count(*), WHERE error IS true) AS '\''Error Rate'\'' FROM Transaction WHERE appName = '\''payment-service'\'' SINCE 1 hour ago\" }], thresholds: [{ alertSeverity: CRITICAL, value: 5 }, { alertSeverity: WARNING, value: 2 }] } } }] }] }) { entityResult { guid } } }"
  }'
```

### Example: "alert me when payment-service errors exceed 5%"

Run the policy mutation, copy the returned `id` into `policyId` of the condition mutation, then confirm it in the UI under Alerts > Alert conditions. The condition above opens a CRITICAL incident above 5% and a WARNING above 2% for 5 minutes.

## Guidelines

- Use distributed tracing across all services for end-to-end request visibility
- Set meaningful Apdex thresholds per service based on actual SLA requirements
- Use `FACET` in NRQL to break down metrics by deployment version, endpoint, or region
- Configure alert notification channels (Slack, PagerDuty) before creating policies
- Use workloads to group related entities and get unified health status
- Exclude sensitive headers and parameters from agent collection; header names in `attributes.exclude` are camelCase (`request.headers.proxyAuthorization`)
- Keep the license key and user API key in environment variables, never in a committed `newrelic.js`
