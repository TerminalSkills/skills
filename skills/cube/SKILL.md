---
name: cube
description: >-
  Cube is an open-source semantic layer that sits between a data warehouse and analytics applications and serves governed metrics over REST, GraphQL and SQL APIs. Use when a user asks to define cubes, measures and dimensions, add pre-aggregations, build a metrics API or embedded analytics, set up multi-tenant row-level security, or query Cube from React or the REST API.
license: Apache-2.0
compatibility: Docker (cubejs/cube image) or Node.js; a SQL data source such as Postgres, BigQuery or Snowflake
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/cube-js/cube
  category: data-ai
  tags:
  - semantic-layer
  - analytics
  - api
  - sql
  - metrics
---

# Cube — Semantic Layer for Analytics


## Overview
Cube (Cube Core is the self-hosted open-source part; Cube Cloud is the hosted platform) is a semantic layer: you define metrics once as code (cubes, measures, dimensions, joins, pre-aggregations), and Cube serves them to apps over a REST (JSON) API, GraphQL API and a Postgres-compatible SQL API, with caching and access control. Current release is 1.7.x (October 2026). Docs: https://docs.cube.dev.


## Instructions

### Data Modeling

Data model files live in `model/cubes/` and `model/views/` (inside the project folder mounted at `/cube/conf`). YAML is the format the docs recommend; JavaScript works too and is used below. Reference members of the same cube as `CUBE.measure` in `pre_aggregations`.

```javascript
// model/cubes/Orders.js — Orders cube with measures and dimensions
cube(`Orders`, {
  sql_table: `public.orders`,

  // Pre-aggregation: materialized rollup kept in Cube Store
  pre_aggregations: {
    daily_revenue: {
      measures: [CUBE.revenue, CUBE.count],
      dimensions: [CUBE.status],
      time_dimension: CUBE.created_at,
      granularity: `day`,
      refresh_key: { every: `1 hour` },
    },
  },

  joins: {
    Users: { relationship: `many_to_one`, sql: `${CUBE}.user_id = ${Users}.id` },
  },

  measures: {
    count: { type: `count` },
    revenue: { type: `sum`, sql: `amount`, format: `currency` },
    revenue_per_user: { type: `number`, sql: `${revenue} / NULLIF(${Users.count}, 0)`, format: `currency` },
    // Rolling window: trailing 7-day sum (used with a time dimension)
    revenue_7d: { type: `sum`, sql: `amount`, rolling_window: { trailing: `7 day` } },
  },

  dimensions: {
    id: { type: `number`, sql: `id`, primary_key: true },
    status: { type: `string`, sql: `status` },
    tenant_id: { type: `string`, sql: `tenant_id` },
    created_at: { type: `time`, sql: `created_at` },
  },

  // Segments are named, reusable filters (queried as "Orders.completed")
  segments: {
    completed: { sql: `${CUBE}.status = 'completed'` },
  },
});
```

```javascript
// model/cubes/Users.js — Users cube (condensed)
cube(`Users`, {
  sql_table: `public.users`,
  measures: {
    count: { type: `count` },
    active_count: { type: `count`, filters: [{ sql: `${CUBE}.last_login_at > NOW() - INTERVAL '30 days'` }] },
  },
  dimensions: {
    id: { type: `number`, sql: `id`, primary_key: true },
    plan: { type: `string`, sql: `plan` },
    country: { type: `string`, sql: `country` },
    created_at: { type: `time`, sql: `created_at` },
  },
});
```

### REST API

Cube Core serves the REST API under `/cubejs-api` (configurable with `base_path`). Send a JWT signed with `CUBEJS_API_SECRET` in the `Authorization` header (the token carries the security context). Endpoints: `/cubejs-api/v1/load` (query), `/v1/meta` (model metadata), `/v1/sql` (generated SQL).

```typescript
// src/analytics/cube-client.ts — Query the Cube REST API
const CUBE_API_URL = process.env.CUBE_API_URL!;
const CUBE_API_TOKEN = process.env.CUBE_API_TOKEN!;

type CubeQuery = Record<string, unknown>; // measures, dimensions, timeDimensions, filters, order, limit

async function cubeQuery(query: CubeQuery) {
  const response = await fetch(`${CUBE_API_URL}/cubejs-api/v1/load`, {   // CUBE_API_URL=http://localhost:4000
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: CUBE_API_TOKEN,   // JWT; "Bearer <jwt>" is also accepted
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  // Long queries answer {"error": "Continue wait"}: repeat the request until data arrives
  if (result.error === "Continue wait") return cubeQuery(query);
  if (result.error) throw new Error(result.error);
  return result.data;
}

// Example: Get monthly revenue by order status
const monthlyRevenue = await cubeQuery({
  measures: ["Orders.revenue", "Orders.count"],
  dimensions: ["Orders.status"],
  timeDimensions: [{
    dimension: "Orders.created_at",
    granularity: "month",
    dateRange: "Last 6 months",
  }],
  order: { "Orders.revenue": "desc" },
  limit: 100,
});

// Example: active users by plan
const activeByPlan = await cubeQuery({
  measures: ["Users.active_count"],
  dimensions: ["Users.plan"],
  filters: [{ member: "Users.plan", operator: "equals", values: ["pro", "enterprise"] }],
});
```

### JavaScript SDK (React)

Build analytics UIs with `@cubejs-client/core` and `@cubejs-client/react` (both 1.7.x). Wrap the app in `CubeProvider`:

```tsx
// src/main.tsx
import cube from "@cubejs-client/core";
import { CubeProvider } from "@cubejs-client/react";
const cubeApi = cube(process.env.CUBE_TOKEN!, { apiUrl: "http://localhost:4000/cubejs-api/v1" });
// <CubeProvider cubeApi={cubeApi}><App /></CubeProvider>
```

```tsx
// src/components/RevenueChart.tsx — React component using Cube
import { useCubeQuery } from "@cubejs-client/react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function RevenueChart({ dateRange = "Last 6 months" }) {
  const { resultSet, isLoading, error } = useCubeQuery({
    measures: ["Orders.revenue"],
    timeDimensions: [{
      dimension: "Orders.created_at",
      granularity: "month",
      dateRange,
    }],
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const data = resultSet?.chartPivot() ?? [];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="x" />
        <YAxis />
        <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
        <Line type="monotone" dataKey="Orders.revenue" stroke="#6366f1" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Access Control

Verified JWT claims become the `securityContext`. For multi-tenancy, scope queries and compiled models per tenant in `cube.js` (or `cube.py`):

```javascript
// cube.js — security context configuration
module.exports = {
  // One compiled data model + cache per tenant
  contextToAppId: ({ securityContext }) => `CUBE_APP_${securityContext.tenant_id}`,

  // Called on every request: add a row-level filter
  queryRewrite: (query, { securityContext }) => {
    if (!securityContext.tenant_id) {
      throw new Error("tenant_id is required in the security context");
    }
    query.filters = query.filters || [];
    query.filters.push({
      member: "Orders.tenant_id",
      operator: "equals",
      values: [securityContext.tenant_id],
    });
    return query;
  },
};
```

Cube also supports declarative `access_policy` blocks on cubes and views (group-scoped `member_level` and `row_level` rules, plus masking); when policies exist for some groups, every other group is denied:

```yaml
# model/cubes/orders.yml (excerpt)
    access_policy:
      - group: finance
        member_level:
          includes: "*"
      - group: support
        member_level:
          includes: [count, status]
        row_level:
          filters:
            - member: status
              operator: equals
              values: [completed]
```

If you use `securityContext` in `contextToAppId`, also set `scheduledRefreshContexts` so pre-aggregations refresh for each tenant.

## Installation

The documented way to start is Docker Compose in an empty project folder:

```yaml
# docker-compose.yml
services:
  cube:
    image: cubejs/cube:latest        # pin e.g. cubejs/cube:v1.7.50 in production
    ports:
      - 4000:4000                    # REST/GraphQL APIs and Playground
      - 15432:15432                  # Postgres-compatible SQL API
    environment:
      - CUBEJS_DEV_MODE=true         # local only, see warning below
    volumes:
      - .:/cube/conf
```

```bash
docker compose up -d
# Open http://localhost:4000, pick your database in the wizard (it writes .env), then "Generate Data Model" (YAML or JavaScript)
```

Database settings go in `.env`: `CUBEJS_DB_TYPE=postgres`, `CUBEJS_DB_HOST`, `CUBEJS_DB_NAME`, `CUBEJS_DB_USER`, `CUBEJS_DB_PASS`, and `CUBEJS_API_SECRET` (random string used to sign and verify API JWTs). The `npx cubejs-cli create` scaffold still exists but the docs no longer lead with it. For production, run an API instance, a refresh worker and Cube Store (router plus workers) as in https://docs.cube.dev/cube-core/deployment.

**`CUBEJS_DEV_MODE=true` turns off authentication** on the REST and GraphQL APIs and exposes Playground with ready-made tokens. Use it only on your own machine; set `CUBEJS_DEV_MODE=false` anywhere else.

## Examples


### Example 1: Add a metrics API on top of an orders table

**User request:**

```
We have orders and users tables in Postgres. Give our frontend an API for monthly revenue by order status, with a daily rollup so it's fast.
```

The agent creates `model/cubes/Orders.js` and `Users.js` as above (primary keys, a `many_to_one` join, `revenue` and `count` measures, a `daily_revenue` pre-aggregation), starts Cube with `docker compose up -d`, and checks the model in Playground. It then verifies the endpoint with a signed token:

```bash
curl -G http://localhost:4000/cubejs-api/v1/load \
  -H "Authorization: $CUBE_API_TOKEN" \
  --data-urlencode 'query={"measures":["Orders.revenue"],"dimensions":["Orders.status"],"timeDimensions":[{"dimension":"Orders.created_at","granularity":"month","dateRange":"last 6 months"}]}'
```

The response is `{"data":[{"Orders.status":"completed","Orders.created_at.month":"2026-04-01T00:00:00.000","Orders.revenue":"18420.50"}, ...]}`. Measure values come back as strings.

### Example 2: Make the API multi-tenant

**User request:**

```
Each customer must only ever see their own orders in the dashboard. Tokens already carry a tenant_id claim.
```

The agent writes `queryRewrite` and `contextToAppId` in `cube.js` as shown in Access Control, signs two test JWTs with different `tenant_id` values using `CUBEJS_API_SECRET`, and confirms the same query returns different rows for each. It also sets `CUBEJS_DEV_MODE=false` so the check is not bypassed.

## Guidelines

1. **Semantic layer = single source of truth** — Define metrics once in Cube; all apps query the same definitions
2. **Pre-aggregations for performance** — Materialize common queries; Cube auto-selects the best pre-aggregation
3. **Use the Playground for exploration** — Build queries visually in Cube Playground before coding them into your app
4. **Security context for multi-tenancy** — Use `queryRewrite` (or `access_policy`) to filter queries by tenant/group; never trust filters sent by the client
5. **Measures over raw SQL** — Define `revenue_per_user` as a Cube measure, not as raw SQL in your app
6. **Time dimensions for trends** — Use `timeDimensions` with `granularity` for consistent time-series queries
7. **Mind refresh keys** — pre-aggregations refresh hourly by default; set `refresh_key` to match how often the source data changes, and run a separate refresh worker in production
8. **Version your models** — Cube models are code; store in Git, review changes, deploy via CI/CD
