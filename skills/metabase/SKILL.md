---
name: metabase
description: |
  Metabase is an open-source business intelligence tool for creating dashboards and visualizations.
  Learn Docker deployment, database connections, creating questions and dashboards,
  embedding analytics, and API usage.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - metabase
    - business-intelligence
    - dashboards
    - docker
    - analytics
---

# Metabase

Metabase lets anyone in your organization ask questions about data and visualize the answers as charts and dashboards — no SQL required (but SQL is supported too).

## Installation

```yaml
# docker-compose.yml: Metabase with PostgreSQL backend
services:
  metabase:
    image: metabase/metabase:v0.50.0
    ports:
      - "3000:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: metabase
      MB_DB_HOST: postgres
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: metabase
      POSTGRES_PASSWORD: metabase
      POSTGRES_DB: metabase
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  pg-data:
```

```bash
# Start Metabase
docker compose up -d
# Access at http://localhost:3000
# Complete setup wizard: create admin account, connect your data source
```

## Connect a Database

```bash
# connect-db.sh: Add a database connection via API
curl -X POST http://localhost:3000/api/database \
  -H "Content-Type: application/json" \
  -H "X-Metabase-Session: $SESSION_TOKEN" \
  -d '{
    "engine": "postgres",
    "name": "Production DB",
    "details": {
      "host": "prod-db.example.com",
      "port": 5432,
      "dbname": "myapp",
      "user": "readonly",
      "password": "secret",
      "ssl": true
    }
  }'
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
  [[AND o.category = {{category}}]]  -- Optional filter
GROUP BY 1
ORDER BY 1
```

## Dashboard API

```javascript
// create-dashboard.js: Create and populate a dashboard via API
const BASE = 'http://localhost:3000/api';
const headers = {
  'Content-Type': 'application/json',
  'X-Metabase-Session': process.env.MB_SESSION,
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

// Add a saved question card to the dashboard
await fetch(`${BASE}/dashboard/${dashboard.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    dashcards: [
      {
        card_id: 1, // ID of saved question
        row: 0,
        col: 0,
        size_x: 12,
        size_y: 6,
      },
      {
        card_id: 2,
        row: 6,
        col: 0,
        size_x: 6,
        size_y: 4,
      },
    ],
  }),
});

console.log(`Dashboard created: http://localhost:3000/dashboard/${dashboard.id}`);
```

## Embedding

```javascript
// embed.js: Generate signed embedding URL for iframe integration
const jwt = require('jsonwebtoken');

const METABASE_SECRET = process.env.MB_EMBEDDING_SECRET;

// Generate token for a specific dashboard
function getEmbedUrl(dashboardId, params = {}) {
  const payload = {
    resource: { dashboard: dashboardId },
    params,
    exp: Math.round(Date.now() / 1000) + (10 * 60), // 10 min
  };

  const token = jwt.sign(payload, METABASE_SECRET);
  return `http://localhost:3000/embed/dashboard/${token}#bordered=true&titled=true`;
}

// Usage: embed in your app's iframe
const url = getEmbedUrl(1, { category: 'electronics' });
console.log(url);
```

## API Authentication

```bash
# auth.sh: Get a session token for API access
SESSION=$(curl -s -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@example.com", "password": "admin123"}' \
  | jq -r '.id')

# Use the session token
curl -H "X-Metabase-Session: $SESSION" http://localhost:3000/api/card

# List all dashboards
curl -H "X-Metabase-Session: $SESSION" http://localhost:3000/api/dashboard

# Export question results as CSV
curl -H "X-Metabase-Session: $SESSION" \
  "http://localhost:3000/api/card/1/query/csv" > report.csv
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
