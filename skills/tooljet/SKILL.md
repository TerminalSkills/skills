---
name: tooljet
description: >-
  Build internal tools with ToolJet, the open-source low-code platform. Use when a user asks to create admin dashboards, connect data sources, build CRUD apps with drag-and-drop, or self-host ToolJet.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["internal-tools", "low-code", "open-source", "admin-panel", "self-hosted"]
---
# ToolJet — Open-Source Low-Code App Builder

## Overview

You are an expert in ToolJet, the open-source low-code platform for building internal tools with a visual app builder. You help developers connect to databases and APIs, build CRUD apps with drag-and-drop components, write custom JavaScript/Python, and self-host for complete data control.

## Instructions

### Setup

```bash
# Docker (recommended)
docker compose up -d
# UI at http://localhost:80

# Kubernetes
helm repo add tooljet https://tooljet.github.io/helm-charts
helm install tooljet tooljet/tooljet

# Cloud: https://tooljet.com (managed hosting)
```

### Data Sources

```javascript
// ToolJet connects to 50+ data sources:
// Databases: PostgreSQL, MySQL, MongoDB, Redis, BigQuery, Snowflake, DynamoDB
// APIs: REST, GraphQL, gRPC
// SaaS: Stripe, Airtable, Google Sheets, Notion, Slack, Twilio
// Storage: S3, MinIO, GCS

// PostgreSQL query with transformations
// Query: getOrders
SELECT o.*, u.email, u.name
FROM orders o JOIN users u ON o.user_id = u.id
WHERE o.status = {{components.statusFilter.value}}
ORDER BY o.created_at DESC

// JavaScript transformation (runs after query)
return data.map(row => ({
  ...row,
  amount_display: `$${(row.amount / 100).toFixed(2)}`,
  created_display: moment(row.created_at).fromNow(),
}));
```

### Events and Actions

```javascript
// Button onClick event — chain multiple actions
// Action 1: Run query
await queries.processRefund.run();

// Action 2: Show notification
actions.showAlert('success', `Refund of $${components.table1.selectedRow.amount} processed`);

// Action 3: Refresh data
await queries.getOrders.run();

// Action 4: Navigate
actions.navigateTo('/orders');

// Conditional logic in event handlers
if (components.table1.selectedRow.status === 'refunded') {
  actions.showAlert('warning', 'Already refunded');
  return;
}
```

### Multi-Page Apps

```markdown
## App Structure
- Pages: Dashboard, Orders, Users, Settings
- Shared components: Header, Sidebar (persist across pages)
- URL parameters: /orders/:id for detail pages
- Navigation: programmatic (actions.navigateTo) or link components
```

## Examples

**Example 1: User asks to set up tooljet**

User: "Help me set up tooljet for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure tooljet
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with tooljet**

User: "Create a dashboard using tooljet"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Self-host for compliance** — ToolJet is open-source (AGPL); self-host when data must stay on your infrastructure
2. **Query caching** — Enable query caching for frequently accessed data; reduces database load
3. **Environments** — Use ToolJet environments (dev/staging/prod) with different database connections
4. **Custom components** — Build React components for visualizations that don't exist in the component library
5. **Version control** — Export apps as JSON; store in Git for versioning and backup
6. **Granular permissions** — Use groups and app-level permissions to control access
7. **Marketplace plugins** — Browse ToolJet's plugin marketplace for pre-built data source connectors
8. **Audit logs** — Enable audit logging for compliance; track who accessed what data
