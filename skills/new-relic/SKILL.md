---
name: new-relic
description: >-
  Set up and manage New Relic for full-stack observability including APM,
  browser monitoring, infrastructure monitoring, and alerting. Use when a user
  needs to instrument applications, write NRQL queries, create dashboards,
  configure alert policies, or integrate New Relic with their deployment pipeline.
license: Apache-2.0
compatibility: "New Relic One platform, Agent versions 8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["new-relic", "observability", "apm", "nrql", "browser-monitoring", "alerts"]
---

# New Relic

## Overview

Configure New Relic for application performance monitoring, infrastructure observability, browser real-user monitoring, and intelligent alerting. Covers agent installation, NRQL querying, dashboard creation, and alert policy configuration.

## Instructions

### Task A: Install APM Agent

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
    exclude: ['request.headers.cookie', 'request.headers.authorization']
  },
  transaction_tracer: { enabled: true, record_sql: 'obfuscated' },
  error_collector: { enabled: true, ignore_status_codes: [404, 401] },
}
```

```javascript
// app.js — Load New Relic before anything else
require('newrelic')
const express = require('express')
const app = express()

app.get('/api/orders', async (req, res) => {
  const orders = await db.query('SELECT * FROM orders LIMIT 100')
  res.json(orders)
})
```

### Task B: Infrastructure Agent Setup

```yaml
# /etc/newrelic-infra.yml — Infrastructure agent config
license_key: "<YOUR_LICENSE_KEY>"
display_name: "web-server-01"
custom_attributes:
  environment: production
  team: platform
  region: us-east-1
enable_process_metrics: true
metrics_system_sample_rate: 15
```

### Task C: NRQL Queries

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
-- Infrastructure: hosts with high CPU
SELECT average(cpuPercent), max(memoryUsedPercent)
FROM SystemSample
FACET hostname
WHERE environment = 'production'
SINCE 30 minutes ago
```

### Task D: Create Alert Policies via NerdGraph

```bash
# Create a NRQL alert condition — High error rate
curl -X POST 'https://api.newrelic.com/graphql' \
  -H "Content-Type: application/json" \
  -H "Api-Key: ${NEW_RELIC_API_KEY}" \
  -d '{
    "query": "mutation { alertsNrqlConditionStaticCreate(accountId: 1234567, policyId: 987654, condition: { name: \"High Error Rate\", enabled: true, nrql: { query: \"SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = '\''payment-service'\''\" }, signal: { aggregationWindow: 300, aggregationMethod: EVENT_FLOW, aggregationDelay: 120 }, terms: [{ threshold: 5, thresholdOccurrences: ALL, thresholdDuration: 300, operator: ABOVE, priority: CRITICAL }, { threshold: 2, thresholdOccurrences: ALL, thresholdDuration: 300, operator: ABOVE, priority: WARNING }], violationTimeLimitSeconds: 86400 }) { id name } }"
  }'
```

### Task E: Browser Monitoring

```html
<!-- index.html — Add New Relic browser agent snippet -->
<head>
  <script type="text/javascript">
    ;window.NREUM||(NREUM={});NREUM.init={distributed_tracing:{enabled:true},
    privacy:{cookies_enabled:true},ajax:{deny_list:["bam.nr-data.net"]}};
    // Paste the full browser agent JS snippet from New Relic UI
  </script>
</head>
```

## Best Practices

- Use distributed tracing across all services for end-to-end request visibility
- Set meaningful Apdex thresholds per service based on actual SLA requirements
- Use `FACET` in NRQL to break down metrics by deployment version, endpoint, or region
- Configure alert notification channels (Slack, PagerDuty) before creating policies
- Exclude sensitive headers and parameters from agent collection
