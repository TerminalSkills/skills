---
title: "Build Internal Tools with Retool"
description: "Build a full suite of internal tools in a week — customer admin panel, data pipeline dashboard, and ops automation — connected to Postgres, Stripe, and your REST API simultaneously."
skills: [retool-sdk]
difficulty: intermediate
time_estimate: "10 hours"
tags: [internal-tools, retool, admin, ops, postgres, stripe, automation, dashboard]
---

# Build Internal Tools with Retool

## The Problem

Your ops team is copying data between browser tabs, running SQL manually, and asking engineers to build one-off scripts for basic admin tasks. Every "quick internal tool" turns into a 2-week engineering project.

## What You'll Build

- **Customer Admin Panel**: search users, view subscriptions, perform support actions
- **Data Pipeline Dashboard**: job status, error rates, last run times
- **Bulk Operations Tool**: trigger re-sends, apply discounts, export CSVs
- **Retool Workflows**: automated escalation and scheduled jobs
- All connected to Postgres + REST API + Stripe simultaneously

## Persona

**Sarah, Head of Operations** — spends 4 hours/day doing tasks that should take 20 minutes. Wants her team to build and own their own tools without waiting for engineering. Zero Retool experience today.

---

## Architecture

```
Retool Apps (hosted / self-hosted)
│
├── Resource: PostgreSQL (direct connection)
├── Resource: REST API (your backend)
├── Resource: Stripe (native integration)
│
├── App: Customer Admin Panel
├── App: Data Pipeline Dashboard
├── App: Bulk Operations
│
└── Retool Workflows
    ├── Escalation: flag high-value churning users
    └── Scheduled: daily data quality check
```

---

## Step 1: Connect Your Data Sources

In Retool Settings → Resources, add:

```yaml
# PostgreSQL
Name: prod-db
Host: your-db.rds.amazonaws.com
Database: myapp_production
User: retool_readonly   # use a limited-permission user!

# REST API
Name: backend-api
Base URL: https://api.yourapp.com
Auth: Bearer token (stored as secret)

# Stripe
Name: stripe
Type: Stripe (native)
Secret key: sk_live_xxx  # stored encrypted
```

**Security tip**: Create a `retool` Postgres role with only SELECT on customer tables, plus specific stored procedures for mutations. Never give Retool your admin credentials.

---

## Step 2: Customer Admin Panel

```sql
-- Query: search_users
SELECT
  u.id,
  u.email,
  u.name,
  u.created_at,
  s.plan,
  s.status AS subscription_status,
  s.current_period_end
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE
  u.email ILIKE {{'%' + textInput_search.value + '%'}}
  OR u.name ILIKE {{'%' + textInput_search.value + '%'}}
ORDER BY u.created_at DESC
LIMIT 50;
```

```javascript
// JS Query: cancel_subscription (calls your API)
// Triggered by "Cancel Subscription" button with confirmation modal

const response = await fetch(`${resources.backend_api.baseUrl}/admin/subscriptions/${table_users.selectedRow.data.id}/cancel`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${globals.admin_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ reason: textInput_cancelReason.value }),
});

if (!response.ok) throw new Error(await response.text());

// Refresh the table
query_search_users.trigger();
utils.showNotification({ title: "Subscription cancelled", notificationType: "success" });
```

**UI components to add:**
- `textInput` for search
- `table` bound to `search_users.data`
- `container` panel for selected user detail
- `button` "Cancel Subscription" (requires `confirm: true`)
- `button` "Send Password Reset" → calls API

---

## Step 3: Data Pipeline Dashboard

```sql
-- Query: pipeline_jobs
SELECT
  job_name,
  status,
  last_run_at,
  duration_ms,
  error_count,
  records_processed
FROM pipeline_jobs
ORDER BY last_run_at DESC;
```

```javascript
// Transform: color-code by status
return formatDataAsObject(data.pipeline_jobs.map(job => ({
  ...job,
  _rowColor: job.status === 'failed' ? '#fee2e2'
    : job.status === 'running' ? '#fef9c3'
    : '#f0fdf4',
  last_run_at: moment(job.last_run_at).fromNow(),
  duration: job.duration_ms > 1000
    ? `${(job.duration_ms / 1000).toFixed(1)}s`
    : `${job.duration_ms}ms`,
})));
```

**Add a stat row** above the table:
- Total jobs: `{{data.length}}`
- Failed: `{{data.filter(j => j.status === 'failed').length}}`
- Avg duration: `{{(data.reduce((s, j) => s + j.duration_ms, 0) / data.length / 1000).toFixed(2)}}s`

---

## Step 4: Bulk Operations

```javascript
// JS Query: apply_discount_bulk
// Input: table_selected_users.selectedRows, numberInput_discount.value

const userIds = table_selected_users.selectedRows.map(r => r.id);

const response = await retoolContext.resources["backend-api"].post("/admin/discounts/bulk", {
  user_ids: userIds,
  discount_percent: numberInput_discount.value,
  reason: textArea_reason.value,
});

utils.showNotification({
  title: `Discount applied to ${userIds.length} users`,
  notificationType: "success",
});
```

---

## Step 5: Retool Workflow — Daily Escalation

```javascript
// Trigger: scheduled, every day at 9am
// Step 1: DB query — find high-value users who churned this week
const churned = await db.query(`
  SELECT u.email, u.name, s.mrr
  FROM users u
  JOIN subscriptions s ON s.user_id = u.id
  WHERE s.status = 'canceled'
    AND s.canceled_at > NOW() - INTERVAL '7 days'
    AND s.mrr > 100
  ORDER BY s.mrr DESC
`);

// Step 2: Post to Slack
if (churned.rows.length > 0) {
  await slack.send({
    channel: "#churn-alerts",
    text: `⚠️ ${churned.rows.length} high-value churns this week`,
    blocks: churned.rows.slice(0, 5).map(r => ({
      type: "section",
      text: { type: "mrkdwn", text: `*${r.name}* (${r.email}) — $${r.mrr}/mo` }
    }))
  });
}
```

---

## What's Next

- Add audit logging: record every admin action with `performed_by` + timestamp
- Role-based access: Retool groups → viewer / operator / admin
- Build a Stripe dispute tool (fetch disputes, add evidence, respond)
- Export filtered data as CSV with Retool's built-in download button
