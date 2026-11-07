---
title: "Debug Production Incidents with AI Log Analysis"
slug: debug-production-incident
description: "Quickly identify root causes in production incidents by analyzing logs, correlating errors, and generating incident reports."
skills: [log-analyzer, data-analysis]
category: devops
tags: [debugging, incident-response, logs, production, observability]
---

# Debug Production Incidents with AI Log Analysis

## The Problem

Production incidents hit at the worst times. Engineers scramble through thousands of log lines across multiple services, grepping for patterns while Slack channels explode with "is the site down?" messages. Finding the root cause in a sea of cascading failures can take an hour even for experienced engineers, and that is before writing the incident report that leadership expects by morning.

The real danger is cascading failures. One service degrades, which causes errors in three others, which triggers retries that make everything worse. By the time you open the logs, you are looking at 15 different error types across 6 services, and the original cause is buried under symptoms. The instinct is to fix the most visible error first, but visible errors are usually symptoms, not causes.

## The Solution

The **log-analyzer** skill narrows large logs with command-line tools, orders errors in time, and groups them so the first failure stands out. The **data-analysis** skill (pandas) turns the same logs into counts per service and per minute, so you can see when the incident started and confirm when it ended. The walkthrough below follows a checkout outage on a Monday afternoon.

## Step-by-Step Walkthrough

### Step 1: Feed in the Logs

Start with the raw logs from the service that is screaming the loudest:

```text
Analyze the last 30 minutes of /var/log/app/checkout-service.log. We're getting reports of failed checkouts. Show the error types in the order they first appeared.
```

Do not pre-filter for the error you suspect. Chronological analysis reveals the pattern; grepping for your hypothesis only confirms it. For files too big to read at once, the agent narrows with `grep`, `jq`, `journalctl` or `kubectl logs --since=30m` first, and reads the last few hundred lines to see the current state.

### Step 2: Identify the Error Pattern

The agent groups errors by type and sorts the groups by first sighting, not by count:

```bash
grep ' ERROR ' checkout-service.log | sed -E 's/^[^ ]+ [^ ]+ //; s/#[0-9]+/#N/' | sort | uniq -c | sort -rn | head
```

With a log in `<timestamp> <LEVEL> <service> <message>` format, the same ordering takes a few lines of pandas (this ran against a synthetic log with pandas 3 in a scratch environment):

```python
import sys
import pandas as pd

pattern = r"^(?P<ts>\S+) (?P<level>[A-Z]+) (?P<service>\S+) (?P<message>.*)$"
lines = pd.read_csv(sys.argv[1], sep="\x00", header=None, names=["raw"], dtype="string")
df = lines["raw"].str.extract(pattern)
df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
df = df.dropna(subset=["ts"])          # drops stack-trace continuation lines

errors = df[df["level"].isin(["ERROR", "WARN"])]
by_type = (errors.groupby(["service", "message"])["ts"]
           .agg(count="size", first_seen="min", last_seen="max")
           .sort_values("first_seen"))
print(by_type)
```

On the incident the result looks like this:

| Error Type | Count | First Seen | Last Seen |
|-----------|-------|------------|-----------|
| Redis `OOM command not allowed` (write rejected) | 1,904 | 14:01:58 | 14:31:45 |
| CartService NullPointer | 412 | 14:02:08 | 14:31:40 |
| PaymentGateway 503 | 189 | 14:05:22 | 14:31:42 |

Three observations change the debugging approach:

1. **The Redis errors started first**, 10 seconds before the cart failures and 3 minutes before the payment failures. Order in time points at the cause.
2. **The Redis error count is the highest.** It is the epicenter, not a side effect.
3. **All errors share one time window.** This is one incident with three symptoms.

### Step 3: Correlate Across Services

The checkout service logs show Redis failing, so follow the chain to the upstream system. Ask the agent to inspect Redis itself rather than only its logs, because Redis does not log every rejected command; clients receive the error:

```text
Check the Redis server for the same window: /var/log/redis/redis-server.log, and run redis-cli INFO memory and CONFIG GET maxmemory-policy.
```

```console
$ redis-cli INFO memory | grep -E '^(used_memory_human|maxmemory_human|maxmemory_policy)'
used_memory_human:16.00G
maxmemory_human:16.00G
maxmemory_policy:noeviction
```

Redis hit its 16 GB limit at 14:01:58 with the `noeviction` policy. Per the [Redis eviction docs](https://redis.io/docs/latest/develop/reference/eviction/), with `noeviction` the server returns an error for commands that would store new data, while commands that only read existing data keep working. So the cart reads kept succeeding, but every write (new carts, session updates) was rejected with `OOM command not allowed when used memory > 'maxmemory'`.

The cascade unfolded in three stages:
1. At 14:01:58 writes to Redis start failing, and the checkout service logs the error from its Redis client.
2. Carts that could not be created or updated came back empty, and CartService, which did not handle a missing cart, threw NullPointerExceptions from 14:02:08.
3. From 14:05:22 orders were submitted with empty carts and the payment gateway answered 503.

Every other error, all 2,505 of them across three services, is a symptom of the first event. An engineer grepping for `PaymentGateway 503` would be looking at a consequence.

### Step 4: Build the Incident Timeline

```text
Build an incident timeline and recommend immediate fixes.
```

| Time | Event | Impact |
|------|-------|--------|
| 14:01:58 | Redis reached `maxmemory` (16 GB), `noeviction` rejects writes; first `OOM command not allowed` in the checkout service | Cart updates fail |
| 14:02:08 | Missing cart, NullPointerException in CartService | Cart page broken |
| 14:05:22 | Orders with empty carts, payment gateway 503 | Checkout broken |
| 14:12:00 | Alert fires on the error-rate threshold | Team notified |
| 14:15:00 | On-call engineer opens the investigation | Response begins |

Two things stand out. The alert fired 10 minutes after the first error because it watched the error *rate*; an alert on Redis memory use (for example `used_memory / maxmemory` above 80%) would have fired before any customer impact. And the NullPointerException is a code-level gap independent of Redis: a missing cart should produce a retry or a clear error, not an unhandled exception.

**Root cause:** the Redis instance reached its 16 GB `maxmemory` with `noeviction`, rejecting all writes and cascading into checkout and payment failures.

**Why it happened (in this example):** session keys were written without a TTL and a background cleanup job had been failing silently since a deployment two weeks earlier, so sessions accumulated until Redis was full.

**Immediate actions, in order:**
1. Check what is eating memory before deleting anything: `redis-cli --scan --pattern 'sess:*' | head -3 | xargs -n1 redis-cli TTL` (`-1` means the key never expires). Then remove only the abandoned sessions, with `UNLINK` (non-blocking, unlike `DEL` on large values): `redis-cli --scan --pattern 'sess:*' | xargs -r -n 500 redis-cli UNLINK` removes all of them, which logs every user out, so filter to the stale ones if you can. In a Redis Cluster, run this on every node.
2. Raise the limit for headroom: `redis-cli CONFIG SET maxmemory 24gb`, if the host has the RAM. This does not survive a restart until it is also in `redis.conf` or applied with `CONFIG REWRITE`.
3. Restart the checkout-service pods to clear connection pools that are still retrying.
4. Decide on the eviction policy deliberately. `allkeys-lru` suits a pure cache; for sessions or queues it silently drops live data. If Redis holds sessions, keep `noeviction`, give every key a TTL, and rely on the memory alert.

**Follow-up actions for the post-mortem:**
- Add the 80% memory alert.
- Handle a missing cart or a failed Redis call in CartService.
- Add a circuit breaker so a Redis failure returns "please try again in a moment" instead of a 503.
- Fix the broken cleanup job and set TTLs on session keys when they are written.

### Step 5: Analyze Error Rate Trends

```text
Parse the error counts per minute from the logs and show me the trend. I need to confirm the incident is actually over after applying the fix.
```

This is the data-analysis part. Continuing from the DataFrame above:

```python
per_minute = errors.set_index("ts").resample("1min").size()
print(per_minute.loc["2026-11-02 14:00":"2026-11-02 14:35"])
```

The series shows the jump at 14:02, the plateau while Redis was full, and the drop after the fix. It answers two questions: did the error rate return to the pre-incident baseline, and did retries create a second wave? If errors spike again right after the fix, every pooled connection is retrying at once; the cure for next time is exponential backoff with jitter. If the baseline was 2 errors per minute before and is 5 afterwards, the incident is not fully resolved.

## Real-World Example

Marta, a platform engineer at a 20-person fintech startup, is paged in the afternoon because checkout success dropped from 99% to 34%. She points the agent at the last 30 minutes of logs from three services.

The error list sorted by first sighting puts the Redis write rejections at 14:01:58, cart failures a few seconds later and payment failures 3 minutes after that. `INFO memory` confirms the instance is at its limit with `noeviction`. She clears the abandoned session keys, raises `maxmemory` to 24 GB, and restarts the checkout pods. The per-minute error count falls to its baseline within a couple of minutes, and the resample confirms there is no second wave.

The next day she generates the incident report from the timeline for the post-mortem. It lists the cascade, the 10-minute alert gap, and specific follow-ups: a memory alert at 80%, TTLs on session keys, null-safety in CartService, and a fix for the cleanup job.

## Related Skills

- [log-analyzer](/skills/log-analyzer) — narrows large logs and builds the timeline and root-cause summary.
- [data-analysis](/skills/data-analysis) — pandas counts per service and per minute to date the incident and confirm recovery.
