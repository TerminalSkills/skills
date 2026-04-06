---
name: retool-sdk
description: >-
  Build internal tools and admin panels with Retool — drag-and-drop UI connected
  to any data source. Use when: building admin dashboards without writing custom
  UI code, creating internal CRUD tools, connecting databases and APIs to a UI
  quickly, or automating internal workflows.
license: Apache-2.0
compatibility: "Retool cloud (retool.com) or self-hosted. No SDK install required for cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: internal-tools
  tags: ["retool", "internal-tools", "admin-panel", "dashboard", "low-code"]
  use-cases:
    - "Build a customer support admin panel connected to Postgres in 30 minutes"
    - "Create an order management dashboard with approval workflows for ops teams"
    - "Build a user lookup and edit tool backed by a REST API"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Retool

## Overview

Retool is a low-code platform for building internal tools. You drag and drop UI components, connect them to any data source (SQL databases, REST APIs, GraphQL, Firestore, etc.), and wire everything together with JavaScript. The result is a production-quality admin panel — no custom frontend code required.

Key features:
- **Components**: Table, Form, Button, Chart, Modal, Text Input, Select, Date Picker, and 60+ more
- **Query editor**: SQL, REST API, GraphQL, Firebase, Mongo, and 50+ integrations
- **JavaScript transformers**: transform query results or compute values
- **Retool Workflows**: visual automation builder for backend jobs
- **Retool DB**: built-in Postgres database for quick prototyping
- **Self-hosted**: deploy on your own infrastructure for data privacy

## Getting Started

### 1. Access Retool

- **Cloud**: sign up at https://retool.com (free tier available)
- **Self-hosted**: deploy with Docker (see self-hosting section below)

### 2. Connect a resource (data source)

Go to **Resources → Create a resource** and choose your data source:
- PostgreSQL / MySQL / Snowflake / BigQuery / Redshift
- REST API
- GraphQL
- MongoDB
- Firestore / Supabase / Airtable
- Stripe, Salesforce, Slack (pre-built connectors)

## Instructions

### Step 1: Build a data table with search and filter

1. Drag a **Table** component onto the canvas.
2. Create a new **Query** (bottom panel) → select your database resource.
3. Write a SQL query:

```sql
-- Query: get_customers
SELECT
  id,
  name,
  email,
  plan,
  created_at,
  mrr
FROM customers
WHERE
  ({{ search_input.value === '' ? 'TRUE' : "name ILIKE '%' || {{search_input.value}} || '%'" }})
  AND ({{ plan_filter.value ? "plan = {{plan_filter.value}}" : 'TRUE' }})
ORDER BY created_at DESC
LIMIT 100
```

4. Set **Table → Data** to `{{ get_customers.data }}`
5. Add a **Text Input** named `search_input` with placeholder "Search by name..."
6. Add a **Select** named `plan_filter` with options `["", "free", "pro", "enterprise"]`
7. Set both components to trigger `get_customers` on change.

### Step 2: Edit rows with a Form + Modal

Allow editing a selected table row via a modal form:

1. Drag a **Modal** component; name it `edit_modal`.
2. Inside the modal, add a **Form** with fields matching editable columns:
   - **Text Input** `edit_name` — default value: `{{ customers_table.selectedRow.data.name }}`
   - **Select** `edit_plan` — default value: `{{ customers_table.selectedRow.data.plan }}`
3. Add a **Button** on the main canvas labeled "Edit" → on click: `edit_modal.open()`
4. Inside the modal, add a **Button** "Save" that runs an **update** query:

```sql
-- Query: update_customer
UPDATE customers
SET
  name = {{ edit_name.value }},
  plan = {{ edit_plan.value }},
  updated_at = NOW()
WHERE id = {{ customers_table.selectedRow.data.id }}
```

5. Chain after success: run `get_customers` to refresh the table, then `edit_modal.close()`.

### Step 3: Charts and KPI metrics

Display key metrics at the top of a dashboard:

1. Drag **Statistic** (or **Text**) components for KPI cards.
2. Create a query for aggregated metrics:

```sql
-- Query: dashboard_metrics
SELECT
  COUNT(*)                                              AS total_customers,
  SUM(mrr)                                             AS total_mrr,
  SUM(CASE WHEN created_at > NOW() - INTERVAL '30d' THEN 1 ELSE 0 END) AS new_this_month,
  AVG(mrr) FILTER (WHERE mrr > 0)                      AS avg_mrr
FROM customers
```

3. Set each Statistic's value:
   - `{{ dashboard_metrics.data.total_customers[0] }}`
   - `{{ '$' + dashboard_metrics.data.total_mrr[0].toLocaleString() }}`

4. Add a **Chart** component for trend data:

```sql
-- Query: mrr_over_time
SELECT
  date_trunc('month', created_at) AS month,
  SUM(mrr) AS mrr
FROM customers
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1
```

- Chart type: Line
- x: `{{ mrr_over_time.data.month }}`
- y: `{{ mrr_over_time.data.mrr }}`

### Step 4: REST API integration

Connect to a REST API resource and use it in queries:

1. Create a REST API resource with your base URL and auth headers:
   - Base URL: `https://api.yourservice.com`
   - Headers: `Authorization: Bearer {{ retoolContext.configVars.API_TOKEN }}`

2. Create a query:
   - Method: GET
   - URL path: `/v1/users/{{ user_id_input.value }}`

3. Use the result:

```javascript
// Transformer: format_user_data
const user = data
return {
  displayName: `${user.first_name} ${user.last_name}`,
  joinedDate: new Date(user.created_at).toLocaleDateString(),
  status: user.is_active ? '✅ Active' : '⛔ Suspended'
}
```

4. Reference in a component: `{{ format_user_data.value.displayName }}`

### Step 5: JavaScript transformers

Transformers let you manipulate query data with JavaScript:

```javascript
// Transformer: enrich_orders
const orders = get_orders.data

return orders.map(order => ({
  ...order,
  // Computed fields
  total_formatted: `$${(order.total_cents / 100).toFixed(2)}`,
  days_since_order: Math.floor(
    (Date.now() - new Date(order.created_at)) / (1000 * 60 * 60 * 24)
  ),
  status_badge: {
    pending: '🟡',
    shipped: '🔵',
    delivered: '🟢',
    cancelled: '🔴',
  }[order.status] || '⚪',
})).filter(o => o.total_cents > 0)
```

Reference as: `{{ enrich_orders.value }}`

### Step 6: Retool Workflows (automation)

Workflows automate multi-step backend jobs, triggered by schedule, webhook, or button:

1. Go to **Workflows** → **Create workflow**
2. Add a **Schedule** trigger (e.g., every day at 9am UTC)
3. Add workflow blocks:
   - **Query block**: `SELECT * FROM customers WHERE trial_ends_at < NOW() + INTERVAL '3d'`
   - **Loop block**: iterate over results
   - **Query block** inside loop: call Stripe API to check subscription status
   - **Condition block**: if no active subscription
   - **Query block**: send email via SendGrid REST API
   - **Query block**: update `notified_at` in database
4. Add **error handling** on each block

### Step 7: Self-hosted deployment

Deploy Retool on your own infrastructure with Docker Compose:

```bash
# Download the official docker-compose setup
git clone https://github.com/tryretool/retool-onpremise
cd retool-onpremise

# Configure environment
cp .env.template .env
# Edit .env: set ENCRYPTION_KEY, JWT_SECRET, LICENSE_KEY, POSTGRES credentials

# Start
docker-compose up -d

# Access at http://localhost:3000
```

Key environment variables:

```bash
# .env
ENCRYPTION_KEY=your_random_32_char_key
JWT_SECRET=your_jwt_secret
LICENSE_KEY=your_retool_license_key

# Built-in Postgres (or point to external)
POSTGRES_DB=hammerhead_production
POSTGRES_USER=retool
POSTGRES_PASSWORD=strong_password

# Disable telemetry
TELEMETRY_ENABLED=false
```

Update self-hosted:

```bash
docker-compose pull
docker-compose up -d
```

## Component Quick Reference

| Component | Use for |
|-----------|---------|
| **Table** | Display and select rows from query results |
| **Form** | Collect input and submit mutations |
| **Button** | Trigger queries, open modals, run JS |
| **Text Input** | Single-line user input |
| **Select** | Dropdown with static or dynamic options |
| **Date Picker** | Date/time range selection |
| **Chart** | Line, bar, pie charts from query data |
| **Modal** | Overlay for edit forms or confirmations |
| **Statistic** | KPI number with label |
| **JSON Explorer** | Display raw JSON for debugging |
| **Custom Component** | Embed any React component via iframe |

## Guidelines

- Keep queries small and focused — one query per data concern. Don't write 200-line SQL queries in Retool.
- Use **Transformers** for data manipulation instead of complex SQL — it keeps queries simple and logic readable.
- Store secrets (API keys, passwords) in **Retool Secrets** or environment variables, never hardcoded in queries.
- Set queries to **manual trigger** for mutations (INSERT/UPDATE/DELETE) to prevent accidental execution.
- Use **Success/Failure event handlers** on mutation queries to refresh dependent queries and show notifications.
- For self-hosted deployments, use an external Postgres (not the built-in one) for production reliability.
- Name components clearly (`customers_table`, `edit_modal`, `search_input`) — Retool expressions get messy fast otherwise.
- Use Retool's **version history** (Apps → History) before making breaking changes to a production tool.
