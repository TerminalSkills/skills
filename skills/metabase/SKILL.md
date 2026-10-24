---
name: metabase
description: |
  Metabase is an open-source business intelligence tool for creating dashboards and visualizations.
  Learn Docker deployment, database connections, creating questions and dashboards,
  embedding analytics, and API usage.
license: Apache-2.0
compatibility: 'Docker or Java 21 on macos/linux; Metabase 0.64'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/metabase/metabase
  category: data-ai
  tags:
    - metabase
    - business-intelligence
    - dashboards
    - docker
    - analytics
---

# Metabase

## Overview

Metabase lets anyone in your organization ask questions about data and visualize the answers as charts and dashboards — no SQL required (but SQL is supported too). The open-source edition publishes Docker images as `metabase/metabase:v0.x.y` (latest 0.64.3 at the time of writing); the paid edition is `metabase/metabase-enterprise` with `v1.x.y` tags. The Metabase API is not versioned and may change between releases.

## Instructions


## Installation

```yaml
# docker-compose.yml: Metabase with PostgreSQL backend
services:
  metabase:
    image: metabase/metabase:v0.64.3
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: ${METABASE_DB_PASSWORD}
      MB_DB_HOST: postgres
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: metabase
      POSTGRES_PASSWORD: ${METABASE_DB_PASSWORD}
      POSTGRES_DB: metabase
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  pg-data:
```

```bash
# Start Metabase (export METABASE_DB_PASSWORD first; it is read from the shell or a .env file)
docker compose up -d
# First start runs database migrations and takes a minute or two; check readiness:
curl -s http://localhost:3000/api/health   # {"status":"ok"}
# Access at http://localhost:3000
# Complete setup wizard: create admin account, connect your data source
```

The bundled H2 application database is for trying Metabase out only; use Postgres (as above) for anything you keep.

## Connect a Database

Prefer an API key for scripts (Admin > Settings > Authentication > API Keys; the key inherits the permissions of the group you assign) and send it as `X-API-Key`. Use a read-only database user for the data source.

```bash
# connect-db.sh: Add a database connection via API
# Unquoted heredoc delimiter: the shell fills in ${ANALYTICS_RO_PASSWORD}
curl -X POST http://localhost:3000/api/database \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MB_API_KEY" \
  --data-binary @- <<EOF
{
  "engine": "postgres",
  "name": "Production DB",
  "details": {
    "host": "orders-db.internal.shopkeep.io",
    "port": 5432,
    "dbname": "myapp",
    "user": "readonly",
    "password": "${ANALYTICS_RO_PASSWORD}",
    "ssl": true
  }
}
EOF
```

## Create Questions

```text
Metabase supports three ways to ask questions:

1. Simple Question — Point-and-click interface
   - Pick a table → Add filters → Choose visualization
   - No code required, great for non-technical users

2. Custom Question — Visual query builder
   - Join tables, add calculated columns, group by, filter
   - More powerful than simple, still no SQL

3. Native Query (SQL) — Write raw SQL
   - Full SQL with variable support
   - Template tags for interactive filters: {{date_range}}
```

```sql
-- revenue-query.sql: Native query with template variables in Metabase
SELECT
  DATE_TRUNC('month', o.created_at) AS month,
  COUNT(*) AS total_orders,
  SUM(o.amount) AS revenue,
  COUNT(DISTINCT o.user_id) AS unique_customers
FROM orders o
WHERE o.created_at >= {{start_date}}
  AND o.created_at < {{end_date}}
  AND o.status = 'completed'
  [[AND o.category = {{category}}]]
GROUP BY 1
ORDER BY 1
```

## Dashboard API

```javascript
// create-dashboard.js: Create and populate a dashboard via API
const BASE = 'http://localhost:3000/api';
const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': process.env.MB_API_KEY,
};

// Create dashboard
const dashboard = await fetch(`${BASE}/dashboard`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'Revenue Overview',
    description: 'Monthly revenue and customer metrics',
    collection_id: null,
  }),
}).then(r => r.json());

// Add saved question cards. The grid is 24 columns wide. Every dashcard needs
// an `id`; use negative numbers for cards that are new on this dashboard.
// PUT replaces the dashboard's cards, so send existing dashcards too when updating.
await fetch(`${BASE}/dashboard/${dashboard.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    dashcards: [
      { id: -1, card_id: 1, row: 0, col: 0, size_x: 12, size_y: 6 },
      { id: -2, card_id: 2, row: 6, col: 0, size_x: 8, size_y: 4 },
    ],
  }),
});

console.log(`Dashboard created: http://localhost:3000/dashboard/${dashboard.id}`);
```

## Embedding

Static embedding (iframe URLs of the form `/embed/dashboard/<token>`) is deprecated; Metabase now calls signed-JWT embeds without logins "guest embeds" and renders them with web components. Turn it on under Embedding hub > Security (**Enable embedding**), then copy the embedding secret key from the same area. SSO-based embedding needs a Pro or Enterprise plan.

Server: sign a short-lived JWT (never in the browser, the secret stays on your server).

```javascript
// embed-token.js: sign a guest-embed token
const jwt = require('jsonwebtoken');

function dashboardToken(dashboardId) {
  const payload = {
    resource: { dashboard: dashboardId },   // or { question: 5 }
    params: {},                              // locked parameters, e.g. { store_id: [12] }
    exp: Math.round(Date.now() / 1000) + 10 * 60,
  };
  return jwt.sign(payload, process.env.MB_EMBEDDING_SECRET_KEY);
}
```

Page: load the embed script from your Metabase and render the component with a token your server produced on this page load.

```html
<script defer src="https://metrics.shopkeep.io/app/embed.js"></script>
<script>
  window.metabaseConfig = { isGuest: true, instanceUrl: "https://metrics.shopkeep.io" };
</script>
<metabase-dashboard token="TOKEN_FROM_YOUR_SERVER" with-title="true"></metabase-dashboard>
```

Parameters start out disabled; make a parameter Editable or Locked in the embed wizard (Share > Embed) before the token can set it.

## API Authentication

```bash
# auth.sh: API key (recommended)
curl -H "X-API-Key: $MB_API_KEY" http://localhost:3000/api/card

# List all dashboards
curl -H "X-API-Key: $MB_API_KEY" http://localhost:3000/api/dashboard

# Export question results as CSV (POST, not GET)
curl -X POST -H "X-API-Key: $MB_API_KEY" \
  "http://localhost:3000/api/card/1/query/csv" > report.csv

# Session token (login with email and password; fails if the account has two-factor auth enabled)
SESSION=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$MB_ADMIN_EMAIL\", \"password\": \"$MB_ADMIN_PASSWORD\"}" | jq -r '.id')
curl -H "X-Metabase-Session: $SESSION" http://localhost:3000/api/dashboard
```

## Alerts and Subscriptions

```text
Metabase supports automated reporting:

1. Dashboard Subscriptions — Email or Slack scheduled reports
   - Dashboard → Sharing → Add subscription
   - Set schedule (daily/weekly/monthly) and recipients

2. Question Alerts — Notify when conditions are met
   - Save a question → Bell icon → Create alert
   - "Alert me when results are above/below X"
   - "Alert me when results exist" (for monitoring queries)
```

## Examples

### Example 1: "Stand up Metabase on my laptop and connect our Postgres"

Export `METABASE_DB_PASSWORD`, run `docker compose up -d` with the compose file above, wait until `curl -s localhost:3000/api/health` returns `{"status":"ok"}`, finish the setup wizard, then add the database with a read-only user. The new database appears under Browse data and its tables sync within a few minutes.

### Example 2: "Download last month's revenue question as a CSV in a nightly job"

Create an API key in a group with access to the question, save it as `MB_API_KEY`, and run `curl -X POST -H "X-API-Key: $MB_API_KEY" http://localhost:3000/api/card/42/query/csv -o revenue.csv`. The file contains the question's rows with a header line.

## Guidelines

- Pin the image to a version tag; do not use `latest` in production, and back up the application database before upgrading (Metabase cannot downgrade its schema).
- Keep the H2 default only for trials. Put Metabase behind HTTPS and do not publish port 3000 on all interfaces.
- Connect data sources with read-only database users; use groups and collection permissions to control who sees what.
- API keys and the embedding secret key are credentials: keep them in environment variables or a secrets manager.
- The API is not versioned: after an upgrade, re-test scripts that call it.
