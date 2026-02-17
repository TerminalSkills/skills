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
  author: carlos
  version: "1.0.0"
  category: devops
  tags: ["error-monitoring", "sentry", "observability", "debugging", "triage"]
---

# Error Monitoring

## Overview

This skill helps you analyze application errors from monitoring platforms. It processes error exports, groups events by root cause, identifies duplicates, and classifies errors by user impact — turning a chaotic error stream into an actionable triage report.

## Instructions

When the user provides error data (JSON export, CSV, or pasted logs), follow this process:

### 1. Parse and Normalize

- Accept Sentry JSON exports, Datadog event logs, generic JSON arrays, or CSV files
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
