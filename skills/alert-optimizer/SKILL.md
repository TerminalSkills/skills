---
name: alert-optimizer
description: >-
  Restructure and optimize alert rules for monitoring platforms (Sentry, PagerDuty, Datadog, OpsGenie).
  Use when someone asks to "reduce alert noise", "fix alert fatigue", "create alert rules",
  "set up escalation policies", "tune alerting thresholds", or "create on-call runbooks".
  Generates platform-specific alert configurations and tiered escalation policies.
license: Apache-2.0
compatibility: "Generates configurations for Sentry, PagerDuty, Datadog, OpsGenie, or generic webhook-based systems"
metadata:
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["alerting", "on-call", "pagerduty", "incident-response", "observability"]
---

# Alert Optimizer

## Overview

This skill takes error analysis data (ideally from the `error-monitoring` skill) and generates optimized alert rules, severity tiers, escalation policies, and on-call runbooks. It turns a noisy alerting setup into a structured incident response system.

## Instructions

### 1. Understand Current State

Ask for or infer:
- Current monitoring platform (Sentry, Datadog, PagerDuty, etc.)
- Current alert volume and on-call team size
- Notification channels available (Slack, PagerDuty, email, SMS)
- Any existing severity definitions

### 2. Define Severity Tiers

Create a three-tier model (unless the user specifies otherwise):

| Tier | Criteria | Response Time | Channel |
|------|----------|---------------|---------|
| P1 - Critical | Revenue impact, data loss, security breach, >50% users affected | Immediate page | PagerDuty/SMS |
| P2 - Warning | Degraded experience, >5% users affected, error rate spike | 1 hour | Slack channel |
| P3 - Info | Known issues, cosmetic errors, self-healing transients | Weekly review | Log only |

### 3. Generate Alert Rules

For each error group, produce a platform-specific alert configuration:
- **Sentry**: JSON alert rule with conditions, filters, and actions
- **Datadog**: Monitor definition with query, thresholds, and notification targets
- **PagerDuty**: Event rules with severity mapping and escalation policy
- **Generic**: Webhook payload template with routing logic

### 4. Create Escalation Policies

Define who gets notified and when:
- P1: On-call engineer immediately → team lead after 10 min → engineering manager after 30 min
- P2: Post to team Slack channel → on-call acknowledges within 1 hour
- P3: Aggregated weekly digest

### 5. Generate Runbooks

For each P1 alert, create a runbook with:
- **What**: One-sentence description of the alert
- **Why it matters**: Business impact
- **Diagnose**: First 3 steps to investigate
- **Fix**: Common resolutions
- **Escalate**: When and to whom

## Examples

### Example 1: Sentry Alert Rules

**Input**: Error audit showing PaymentProcessingError as P1, RedisTimeout as P3.

**Output**:
```json
{
  "rules": [
    {
      "name": "P1: Payment Processing Failure",
      "conditions": [
        {"id": "sentry.rules.conditions.event_frequency", "value": 1, "interval": "5m"}
      ],
      "filters": [
        {"id": "sentry.rules.filters.tagged_event", "key": "error_type", "value": "PaymentProcessingError"}
      ],
      "actions": [
        {"id": "sentry.integrations.pagerduty.notify_action", "service": "engineering-oncall"},
        {"id": "sentry.integrations.slack.notify_action", "channel": "#incidents", "tags": "environment,transaction"}
      ],
      "frequency": 5
    },
    {
      "name": "P3: Redis Connection Timeout (Log Only)",
      "conditions": [
        {"id": "sentry.rules.conditions.event_frequency", "value": 100, "interval": "1h"}
      ],
      "filters": [
        {"id": "sentry.rules.filters.tagged_event", "key": "error_type", "value": "TimeoutError"}
      ],
      "actions": [],
      "frequency": 1440
    }
  ]
}
```

### Example 2: On-Call Runbook Entry

**Input**: P1 alert for database deadlocks.

**Output**:
```markdown
## RUNBOOK: Database Deadlock Detected

**Alert**: DatabaseError: deadlock detected in order processing
**Severity**: P1 — Revenue impact, orders fail silently
**Response**: Immediate — acknowledge within 5 minutes

### Diagnose
1. Check current DB connections: `SELECT * FROM pg_stat_activity WHERE state = 'active' ORDER BY query_start;`
2. Identify locked queries: `SELECT * FROM pg_locks WHERE NOT granted;`
3. Check if deployment happened in last 30 min (new query pattern?)

### Common Fixes
- Kill the blocking query: `SELECT pg_terminate_backend(<pid>);`
- If recurring post-deploy: rollback last migration
- If load-related: enable connection pooling or add read replica

### Escalate
- If not resolved in 15 min → page team lead
- If data corruption suspected → page engineering manager + DB admin
```

## Guidelines

- Always deduplicate alert rules — one root cause should trigger one alert, not five
- Set reasonable frequency caps: P1 alerts should re-fire every 5 minutes max, P3 should be daily at most
- Include "auto-resolve" rules where appropriate (e.g., error rate drops below threshold)
- Runbooks should be copy-pasteable — include actual commands, not pseudocode
- When the user has fewer than 3 people on-call, simplify escalation to two tiers
- Test configurations by asking the user to dry-run before applying
