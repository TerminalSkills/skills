---
name: log-analyzer
description: >-
  Analyze application logs, server logs, and error traces to identify root causes,
  patterns, and anomalies. Use when debugging production incidents, investigating
  error spikes, parsing crash reports, or correlating events across multiple log
  sources. Trigger words: logs, errors, stack trace, crash, exception, debug,
  incident, 500 errors, timeout, latency spike.
license: Apache-2.0
compatibility: "Works with any text-based log format (JSON, plaintext, syslog, structured)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["logs", "debugging", "incident-response", "observability"]
---

# Log Analyzer

## Overview

Parse, filter, and analyze application and infrastructure logs to quickly identify root causes of production issues. Handles JSON structured logs, plaintext server logs, syslog format, and multi-line stack traces.

## Instructions

### 1. Identify log format

Detect whether logs are JSON (one object per line), plaintext with timestamps, syslog, or mixed format. Look for common patterns:
- JSON: `{"timestamp":"...","level":"ERROR","message":"..."}`
- Syslog: `Feb 17 14:23:01 hostname service[pid]: message`
- Plaintext: `2026-02-17 14:23:01.234 ERROR [thread] class - message`

### 2. Filter and extract relevant entries

When investigating an incident:
- Filter by time window (e.g., last 30 minutes before the alert)
- Filter by severity (ERROR, FATAL, WARN)
- Extract unique error messages and group by frequency
- Identify the first occurrence of each error type

### 3. Correlate events

Look for causal chains:
- What was the FIRST error in the time window?
- Are there upstream errors that preceded downstream failures?
- Do errors correlate with deployment events, config changes, or traffic spikes?
- Track request IDs or correlation IDs across services

### 4. Summarize findings

Present results as:
```
## Incident Timeline
- HH:MM:SS — First error: [description]
- HH:MM:SS — Error cascade begins: [description]
- HH:MM:SS — Service degradation detected

## Root Cause
[Clear explanation of what went wrong]

## Error Distribution
| Error Type | Count | First Seen | Last Seen |
|-----------|-------|------------|-----------|
| ConnectionTimeout | 1,247 | 14:02:03 | 14:31:45 |
| NullPointerException | 89 | 14:02:15 | 14:28:00 |

## Recommended Actions
1. [Immediate fix]
2. [Follow-up investigation]
```

### 5. Handle large log files

For files too large to read at once:
- Start with the last 500 lines to see recent state
- Search for ERROR/FATAL/EXCEPTION keywords
- Use grep patterns to narrow scope before deep reading
- Sample periodically to detect patterns over time

## Examples

### Example 1: API Error Spike

**Input:** "Analyze these application logs — we're seeing 500 errors spike in the last hour"

**Log content:**
```
2026-02-17 13:58:22.001 INFO  [http-8080-12] c.a.OrderService - Processing order #98712
2026-02-17 13:58:22.450 ERROR [http-8080-12] c.a.OrderService - Failed to process order #98712: Connection refused to payment-service:8443
2026-02-17 13:58:22.451 ERROR [http-8080-12] c.a.ApiController - 500 Internal Server Error: PaymentServiceUnavailable
2026-02-17 13:58:23.100 WARN  [health-check] c.a.HealthMonitor - payment-service health check failed (attempt 3/3)
2026-02-17 13:58:23.101 ERROR [health-check] c.a.HealthMonitor - Circuit breaker OPEN for payment-service
```

**Output:**
```
## Incident Timeline
- 13:58:22 — First connection refused to payment-service:8443
- 13:58:23 — Health check confirms payment-service is down
- 13:58:23 — Circuit breaker tripped

## Root Cause
payment-service became unreachable at port 8443, causing all order processing
to fail with ConnectionRefused errors. The circuit breaker opened after 3
consecutive health check failures.

## Recommended Actions
1. Check payment-service pod status and recent deployments
2. Verify network policies haven't changed for port 8443
3. Review payment-service logs for OOM kills or crash loops
```

### Example 2: Memory Leak Detection

**Input:** "Our service keeps restarting every 6 hours, here are the logs around the last crash"

**Log content:**
```
2026-02-17 08:00:01.000 INFO  Heap usage: 512MB / 2048MB (25%)
2026-02-17 10:00:01.000 INFO  Heap usage: 1024MB / 2048MB (50%)
2026-02-17 12:00:01.000 INFO  Heap usage: 1720MB / 2048MB (84%)
2026-02-17 13:45:30.000 WARN  GC overhead limit exceeded, heap: 1980MB / 2048MB
2026-02-17 13:47:12.000 ERROR java.lang.OutOfMemoryError: Java heap space
2026-02-17 13:47:12.001 ERROR   at com.app.cache.SessionCache.put(SessionCache.java:142)
```

**Output:**
```
## Root Cause
Memory leak in SessionCache — heap grows linearly from 25% to 97% over ~6 hours
before OOM kill. The SessionCache.put() method at line 142 is the allocation hotspot.

## Error Distribution
| Metric | Value |
|--------|-------|
| Growth rate | ~250MB/hour |
| Time to OOM | ~6 hours |
| Leak source | SessionCache.put (line 142) |

## Recommended Actions
1. Review SessionCache eviction policy — entries may not be expiring
2. Add max-size bound to the cache (e.g., Caffeine with maximumSize)
3. Enable heap dump on OOM: -XX:+HeapDumpOnOutOfMemoryError
```

## Guidelines

- Always establish a timeline first — chronological order reveals causality
- Look for the FIRST error, not the most frequent — cascading failures amplify
- Correlation IDs and request IDs are your best friend for distributed systems
- Don't ignore WARN-level messages — they often precede errors
- When logs are from multiple services, group by service first, then correlate
- Be specific about line numbers, timestamps, and error counts
- Suggest concrete next steps, not generic "investigate further"
