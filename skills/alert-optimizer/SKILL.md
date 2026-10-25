---
name: alert-optimizer
description: >-
  Restructure and optimize alert rules for monitoring platforms (Sentry, PagerDuty, Datadog, OpsGenie).
  Use when someone asks to "reduce alert noise", "fix alert fatigue", "create alert rules",
  "set up escalation policies", "tune alerting thresholds", or "create on-call runbooks".
  Generates platform-specific alert configurations and tiered escalation policies.
license: Apache-2.0
compatibility: "Generates configurations for Sentry, PagerDuty, Datadog, Jira Service Management (for OpsGenie migrations), or generic webhook-based systems"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "alerting, on-call, pagerduty, incident-response, observability"
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
- If the team uses Opsgenie: Atlassian ended sales on June 4, 2025 and ends support on April 5, 2027. Plan the move to Jira Service Management now; do not build new Opsgenie-only rules.

### 2. Define Severity Tiers

Create a three-tier model (unless the user specifies otherwise):

| Tier | Criteria | Response Time | Channel |
|------|----------|---------------|---------|
| P1 - Critical | Revenue impact, data loss, security breach, >50% users affected | Immediate page | PagerDuty/SMS |
| P2 - Warning | Degraded experience, >5% users affected, error rate spike | 1 hour | Slack channel |
| P3 - Info | Known issues, cosmetic errors, self-healing transients | Weekly review | Log only |

Severity routing in one line per tier, to paste into the team runbook:

```text
P1  page on-call (PagerDuty, SMS)       ack in 5 min   escalate to team lead at 10 min
P2  post to #team-alerts (Slack)        ack in 1 hour  review at the next standup
P3  log only; weekly digest email       review weekly  no paging
```

### 3. Generate Alert Rules

For each error group, produce a platform-specific alert configuration:
- **Sentry**: an issue alert with one trigger (When), optional filters (If), actions (Then) and a throttle. Sentry sets these in the UI (Alerts → Create Alert). Throttle options run from 5 minutes to 30 days. Write the spec as a table first; if it must be automated, check the field names against the current Sentry API reference before using them.
- **Datadog**: Monitor definition with query, thresholds, and notification targets
- **PagerDuty**: Event Orchestration rules for severity mapping and routing (Global and Service orchestration). The older Global Event Rules are no longer part of Event Orchestration. Services that still use Service Event Rules can switch to Service Orchestrations, which PagerDuty describes as the more robust option.
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

**Output** (set in Sentry under Alerts → Create Alert, project `payments-api`):
```
Alert P1: Payment processing failure
  When:      A new issue is created, or an event is captured
  If:        all of
               - Tagged event: error_type equals PaymentProcessingError
  Then:      Notify PagerDuty service engineering-oncall
             Notify Slack channel #incidents
  Throttle:  5 minutes

Alert P3: Redis connection timeout (log only)
  When:      An event is captured
  If:        all of
               - Tagged event: error_type equals TimeoutError
               - Frequency: more than 100 events in 1 hour
  Then:      no notification (the issue stays in the Sentry issue list)
  Throttle:  24 hours
```
The P1 throttle of 5 minutes matches the cap in the Guidelines. The P3 alert fires only when the error is frequent, and it notifies no one.

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
- Cancel the blocking query first, using the pid from step 1: `SELECT pg_cancel_backend(48213);`. Terminate the session only if cancel does not work: `SELECT pg_terminate_backend(48213);`. Terminating drops the connection's open transaction.
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
- Check each platform's current docs before shipping a config: alert UIs, API field names and vendor product names change (Opsgenie and PagerDuty rules both changed recently)
