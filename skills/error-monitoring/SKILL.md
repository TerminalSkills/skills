---
name: error-monitoring
description: >-
  Analyze application error logs and monitoring platform exports (Sentry, Datadog, Rollbar)
  to identify error patterns, duplicates, and severity. Use when someone asks to "audit errors",
  "analyze exceptions", "find noisy alerts", "deduplicate error groups", or "triage production errors".
  Parses JSON/CSV error exports and produces categorized reports with root cause analysis.
license: Apache-2.0
compatibility: "Works with exported data from Sentry, Datadog, Rollbar, or any JSON/CSV error log"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "error-monitoring, sentry, observability, debugging, triage"
---

# Error Monitoring

## Overview

This skill helps you analyze application errors from monitoring platforms. It processes error exports, groups events by root cause, identifies duplicates, and classifies errors by user impact — turning a chaotic error stream into an actionable triage report.

## Instructions

When the user provides error data (JSON export, CSV, or pasted logs), follow this process:

### 1. Parse and Normalize

- Accept these inputs, whichever the user has:
  - **Sentry**: there is no native JSON issue export in the UI. Pull issues with the Organization Issues API, `GET https://sentry.io/api/0/organizations/{org}/issues/` (Bearer token with `event:read` scope; `query`, `statsPeriod`, `sort`, `project`, `limit` up to 100, `cursor` pagination; the next cursor is in the response headers). The project-level `/projects/{org}/{project}/issues/` endpoint is deprecated. Discover CSV downloads also work.
  - **Datadog**: Log Explorer CSV export (up to 100,000 individual logs per export; values are sanitized for spreadsheets) or the Logs API (at most 1,000 logs per request, so paginate).
  - **Rollbar**: occurrences via `GET /api/1/item/{item_id}/instances` with a read access token in the `X-Rollbar-Access-Token` header (`limit` up to 5000, `last_id` for the next page). Use the same item endpoints the Rollbar "download items" guide describes.
  - Generic JSON arrays or CSV files
- Never ask the user to paste API tokens into the chat; read them from an environment variable such as `SENTRY_AUTH_TOKEN` and never echo them into reports

Example request for the last 14 days of unresolved Sentry issues, saved to a file:

```bash
curl -s -D sentry-headers.txt \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/brightcart/issues/?statsPeriod=14d&sort=freq&limit=100&query=is:unresolved" \
  -o sentry-issues-page1.json
grep -i '^link:' sentry-headers.txt   # cursor for the next page
```

Rollbar occurrences for one item, using a read-scoped project token:

```bash
curl -s -H "X-Rollbar-Access-Token: $ROLLBAR_READ_TOKEN" \
  "https://api.rollbar.com/api/1/item/1184207311/instances?limit=500" \
  -o rollbar-item-1184207311.json
```
- Extract key fields: error message, stack trace (top frame), timestamp, occurrence count, status, affected users
- Normalize error messages by stripping variable parts (IDs, timestamps, file paths) to find true duplicates

### 2. Group by Root Cause

- Cluster errors that share the same stack trace origin (file + line + function)
- Merge errors with identical normalized messages even if stack traces differ slightly
- Flag groups that are likely the same root cause but reported under different names

### 3. Assess Impact

For each error group, determine:
- **Frequency**: events per day (average and trend — increasing, stable, decreasing)
- **User reach**: unique users affected (if available)
- **Severity signals**: look for keywords indicating data loss, payment failure, auth issues, or security concerns
- **Self-healing**: does the error auto-resolve? (check if occurrences are followed by long gaps)

### 4. Produce the Report

Output a structured report with:
- Total events analyzed, time range, unique error groups
- Top error groups ranked by volume, with: message, source location, event count, percentage of total, first/last seen, impact assessment
- Duplicate groups (errors that should be merged)
- Resolved-but-recurring groups (marked resolved but still firing)
- Recommended priority: P1 (immediate), P2 (soon), P3 (backlog)

## Examples

### Example 1: Sentry JSON Export Analysis

**Input**: User provides `errors-export.json` with 3,200 error events from the last 14 days.

**Output**:
```
Error Analysis — 14-Day Window
Total Events: 3,200 | Unique Groups: 47 | Time Range: Jan 3 – Jan 17

Top 5 Error Groups:

1. [P3] TypeError: Cannot read property 'name' of null
   Source: src/components/UserCard.tsx:89
   Events: 812 (25.4%) | Users: 34 | Trend: Stable
   Note: Occurs on profile preview for deleted accounts. No data loss.

2. [P1] DatabaseError: deadlock detected
   Source: src/services/order.ts:201
   Events: 156 (4.9%) | Users: 89 | Trend: Increasing (+40% week-over-week)
   Note: Causes failed order submissions. Revenue impact confirmed.

3. [P2] FetchError: network timeout at /api/inventory
   Source: src/lib/api-client.ts:45
   Events: 340 (10.6%) | Users: 201 | Trend: Decreasing
   Note: Correlates with deployment windows. Likely cold-start related.

Duplicates Found:
- Groups #12 and #31 share identical root cause (different error wrappers)
- Groups #8, #19, #22 all stem from expired JWT tokens

Resolved But Recurring:
- Group #5 (CORS error) was resolved on Jan 10 but has 45 new events since
```

### Example 2: CSV Log File

**Input**: User provides `app-errors.csv` with columns: timestamp, level, message, stack_trace, user_id.

**Output**: Same structured report format, noting that CSV data lacks occurrence counts so each row is treated as one event.

## Guidelines

- Always show percentages alongside raw counts — "812 events" is less useful than "812 events (25.4%)"
- When stack traces are missing, fall back to error message similarity for grouping
- Flag any error containing "payment", "auth", "password", "delete", or "drop" as potentially high-severity regardless of volume
- If the export is very large (>10,000 events), summarize the top 20 groups and offer to drill into specific ones
- Never assume an error is low-priority just because it's old — check if it's trending upward
- Recommend merging duplicate groups to reduce alert noise before any rule changes
