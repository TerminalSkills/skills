---
name: tinybird
description: >-
  Build real-time analytics APIs with Tinybird — ingest millions of events and
  query with SQL over HTTP. Use when someone asks to "build analytics API",
  "Tinybird", "real-time analytics", "event analytics", "ClickHouse as a
  service", "usage metering", or "product analytics backend". Covers data
  ingestion, SQL pipes, API endpoints, and real-time dashboards.
license: Apache-2.0
compatibility: "Tinybird account (Free plan works). Tinybird CLI installs with pip; Tinybird Local needs Docker. HTTP API from any language."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["analytics", "tinybird", "real-time", "clickhouse", "events"]
---

# Tinybird

## Overview

Tinybird is managed ClickHouse with an API layer: you send events over HTTP, write SQL in Pipes, and publish a Pipe as an authenticated HTTP Endpoint that returns JSON, CSV, NDJSON or Parquet. It suits product analytics, usage metering for billing, live dashboards and any aggregation over large append-only event tables.

The current product is Tinybird Forward. Projects are files in git (`.datasource`, `.pipe`, `.connection`), built in Tinybird Local or a Cloud Branch with `tb build` and shipped with `tb deploy`. The old Classic commands (`tb auth`, `tb push`, the `tinybird-cli` package) are not the workflow described here. TypeScript (`@tinybirdco/sdk`) and Python (`tinybird-sdk`) SDKs can define the same resources in code; this skill uses datafiles.

## Instructions

### Install and log in

```bash
pip install tinybird          # installs the Forward CLI as `tb` (5.x)
tb --version
mkdir product-analytics && cd product-analytics && git init
tb init --type cli --dev-mode local --folder tinybird --cicd skip
tb login                      # opens a browser; writes .tinyb (never commit it)
```

Tinybird also publishes an installer script at tinybird.co; read it before running it instead of piping it into a shell. If a Classic `tb` is already on the PATH (`which tb`), remove it or use a separate virtualenv, because both CLIs use the same command name.

`tb init` creates `tinybird.config.json`, `.env.local` and the folders `datasources/`, `pipes/`, `endpoints/`, `materializations/`, `copies/`, `sinks/`, `connections/`, `fixtures/`, `tests/`. Without `--cicd skip` it asks about CI/CD templates. `dev_mode` is `local`, `branch` or `manual`.

### Define a Data Source

```text
# tinybird/datasources/events.datasource
DESCRIPTION >
    Raw product events sent from the app

SCHEMA >
    `event_id` String `json:$.event_id`,
    `user_id` String `json:$.user_id`,
    `event_type` LowCardinality(String) `json:$.event_type`,
    `properties` String `json:$.properties`,
    `timestamp` DateTime `json:$.timestamp`

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(timestamp)"
ENGINE_SORTING_KEY "event_type, timestamp, user_id"
ENGINE_TTL "timestamp + toIntervalDay(400)"

TOKEN events_append APPEND
```

Rules that matter: the sorting key decides query speed (put the columns you filter on first); partition monthly or yearly only, because fine-grained partitions slow writes; `TOKEN <name> APPEND` creates a token that can only write to this table. Changing a deployed schema in an incompatible way needs a `FORWARD_QUERY`.

### Ingest events

`POST /v0/events?name=events` takes NDJSON (one JSON object per line). Batch several events per request: it is much faster than one request per event. Use the host of your workspace region (`api.tinybird.co` for the default region).

```typescript
// src/analytics/track.ts
const TINYBIRD_HOST = process.env.TINYBIRD_HOST ?? "https://api.tinybird.co";
const INGEST_TOKEN = process.env.TINYBIRD_INGEST_TOKEN!; // the events_append token

type AppEvent = { userId: string; eventType: string; properties?: Record<string, unknown> };

export async function trackEvents(events: AppEvent[]) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " "); // 2026-10-24 17:05:09
  const body = events
    .map((e) =>
      JSON.stringify({
        event_id: crypto.randomUUID(),
        user_id: e.userId,
        event_type: e.eventType,
        properties: JSON.stringify(e.properties ?? {}),
        timestamp: now,
      })
    )
    .join("\n");

  const res = await fetch(`${TINYBIRD_HOST}/v0/events?name=events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INGEST_TOKEN}` },
    body,
  });
  if (!res.ok) throw new Error(`Tinybird ingest failed: ${res.status} ${await res.text()}`);
  return res.json(); // { successful_rows: 2, quarantined_rows: 0 }
}

await trackEvents([
  { userId: "usr_8f3a21", eventType: "page_view", properties: { page: "/pricing" } },
  { userId: "usr_8f3a21", eventType: "button_click", properties: { button: "start-trial" } },
]);
```

Responses: `202` means accepted but not yet committed; add `&wait=true` for a `200` after the write is acknowledged (slower, use a timeout of 10 seconds or more). `400` and `403` must not be retried; `413` means the body is too big (10 MB on Free, 100 MB on paid plans); `429` means over the default 100 requests per second per Data Source, so back off with `Retry-After`. The API is not idempotent: a retried batch can insert duplicates. Check `quarantined_rows` in the answer: rows that do not match the schema land in the `events_quarantine` table instead of failing the request.

### Pipes that become Endpoints

A Pipe is an Endpoint only when it ends with `TYPE endpoint`. Start the SQL block with `%` so the parameters are parsed.

```text
# tinybird/endpoints/daily_active_users.pipe
TOKEN dashboard_read READ

DESCRIPTION >
    Daily active users for the last N days

NODE daily_counts
SQL >
    %
    SELECT toDate(timestamp) AS date, uniqExact(user_id) AS active_users
    FROM events
    WHERE timestamp >= now() - INTERVAL {{ Int32(days, 30) }} DAY
    GROUP BY date
    ORDER BY date DESC

TYPE endpoint
```

```text
# tinybird/endpoints/user_activity.pipe
TOKEN dashboard_read READ

NODE activity
SQL >
    %
    SELECT event_type, count() AS event_count, max(timestamp) AS last_seen
    FROM events
    WHERE user_id = {{ String(user_id, required=True) }}
      AND timestamp >= now() - INTERVAL {{ Int32(days, 7) }} DAY
    GROUP BY event_type
    ORDER BY event_count DESC

TYPE endpoint
```

Parameters are typed (`String`, `Int32`, `DateTime`, `Date`, `Boolean`, `Array`, `column()` for column names), so values are validated and rendered as safe SQL literals. Never build SQL by string concatenation. Optional filters use `{% if defined(country) %} ... {% end %}`. Query parameters cannot be used in Materialized Views.

### Build, test, deploy

```bash
tb local start --daemon            # Tinybird Local: needs Docker, serves http://localhost:7181
tb build                           # validate and create resources in Local (or a branch)
tb --local sql "SELECT count() FROM events"
tb --cloud deploy --check          # dry-run against Cloud
tb --cloud deploy                  # ship to production
tb endpoint ls                     # list endpoints, URLs, tokens
```

`tb dev` rebuilds on every file change. `tb deploy` is what changes production; `tb build` only touches the development environment.

### Query from your app

```typescript
// src/analytics/query.ts
const READ_TOKEN = process.env.TINYBIRD_READ_TOKEN!; // dashboard_read token

export async function getDailyActiveUsers(days = 30) {
  const res = await fetch(`${TINYBIRD_HOST}/v0/pipes/daily_active_users.json?days=${days}`, {
    headers: { Authorization: `Bearer ${READ_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Tinybird query failed: ${res.status}`);
  return (await res.json()).data as Array<{ date: string; active_users: number }>;
}

export async function getUserActivity(userId: string, days = 7) {
  const url = new URL(`${TINYBIRD_HOST}/v0/pipes/user_activity.json`);
  url.search = new URLSearchParams({ user_id: userId, days: String(days) }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${READ_TOKEN}` } });
  return (await res.json()).data;
}
```

Change the extension for another format: `.csv`, `.ndjson`, `.parquet`. The JSON answer carries `meta` (column names and types) and `data` (the rows).

For a browser calling Endpoints directly, do not ship the static token. Sign a short-lived JWT (HS256, with `workspace_id`, `name`, `exp` and `scopes`) in your backend and pin the tenant with `fixed_params`, for example `{"type": "PIPES:READ", "resource": "usage_by_customer", "fixed_params": {"customer_id": "cus_4821"}}`.

### Pre-aggregate with a Materialized View

Aggregations that run on every dashboard load should be computed at ingest time.

```text
# tinybird/datasources/daily_events.datasource
SCHEMA >
    `date` Date,
    `event_type` LowCardinality(String),
    `events` AggregateFunction(count)

ENGINE "AggregatingMergeTree"
ENGINE_SORTING_KEY "date, event_type"
```

```text
# tinybird/pipes/daily_events_mv.pipe
NODE rollup
SQL >
    SELECT toDate(timestamp) AS date, event_type, countState() AS events
    FROM events
    GROUP BY date, event_type

TYPE materialized
DATASOURCE daily_events
```

An Endpoint then reads `SELECT date, event_type, countMerge(events) AS events FROM daily_events GROUP BY date, event_type`.

## Examples

### Example 1: Product analytics for a SaaS app

**User prompt:** "Track page views and button clicks from our Next.js app and show daily active users on an admin dashboard."

The agent runs `tb init`, writes `events.datasource` with an `APPEND` token, adds `daily_active_users.pipe` as an Endpoint with a `READ` token, and `tb build` to check it locally. It adds `trackEvents()` to the server code (the ingest token stays in `TINYBIRD_INGEST_TOKEN`), runs `tb --cloud deploy`, and calls `GET /v0/pipes/daily_active_users.json?days=30` from the dashboard backend. The result is `{"data":[{"date":"2026-10-23","active_users":412}, ...]}`.

### Example 2: Usage metering for API billing

**User prompt:** "Count API calls per customer per month so we can bill by usage."

The agent creates an `api_calls` Data Source sorted by `customer_id, timestamp`, a Materialized View that rolls calls up by `customer_id` and month with `countState()`, and an Endpoint `usage_by_customer` with a `customer_id` parameter and `countMerge()`. The billing job reads the Endpoint with a JWT whose `fixed_params` pin one customer, so a customer id cannot be swapped by the caller.

## Guidelines

- **Free plan limits:** 10 GB storage, 0.25 vCPU, 1,000 requests per day per organization, and a hard 429 when the CPU burst is exceeded. It is not "unlimited queries"; check the plan page before promising a dashboard that polls often.
- **Tokens:** use one `APPEND` token for ingestion and one `READ` token per Endpoint group, declared with `TOKEN` in the datafiles. Do not use the workspace admin token in application code, and keep `.tinyb` and `.env.local` out of git.
- **Test locally first:** `tb build` against Tinybird Local or a branch, then `tb deploy --check`. A schema change that is incompatible with the live table fails the deployment unless the Data Source has a `FORWARD_QUERY`.
- **Sorting key and partition key:** choose them for your filters; they cannot be changed later without a migration (`FORWARD_QUERY`).
- **Joins:** ClickHouse joins are fine on small dimension tables; for large tables denormalize at ingest or pre-join in a Materialized View.
- **Duplicates:** the Events API is not idempotent; deduplicate with `ReplacingMergeTree` or at query time if retries matter.
- **Do not use it** as a transactional database: it is built for append-heavy analytics, not row updates.
