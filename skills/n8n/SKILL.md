---
name: n8n
description: >-
  Build workflow automations with n8n. Use when a user asks to automate
  business workflows, connect APIs visually, build integrations between apps,
  self-host a Zapier alternative, or create data pipelines with a visual editor.
license: Apache-2.0
compatibility: 'Docker, Node.js (self-hosted or cloud)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: automation
  tags:
    - n8n
    - workflow
    - automation
    - integration
    - low-code
---

# n8n

## Overview

n8n is an open-source workflow automation tool — self-hostable Zapier alternative. Visual editor with 400+ integrations, code nodes (JavaScript/Python), webhooks, cron triggers, and branching logic. Free when self-hosted.

## Instructions

### Step 1: Self-Host with Docker

```yaml
# docker-compose.yml — n8n with PostgreSQL persistence
services:
  n8n:
    image: n8nio/n8n
    ports: ["5678:5678"]
    environment:
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: changeme
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: n8n
      WEBHOOK_URL: https://n8n.example.com/
    volumes: [n8n_data:/home/node/.n8n]
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: n8n
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  n8n_data:
  pgdata:
```

### Step 2: Webhook Trigger

```typescript
// n8n receives webhooks and processes them through visual workflows
// Example: Webhook → Slack notification → Google Sheet log

// Trigger URL: https://n8n.example.com/webhook/order-received
// POST body: { "order_id": "123", "customer": "john@example.com", "total": 99.99 }
```

### Step 3: Code Node (JavaScript)

```javascript
// Inside n8n Code node — transform data between steps
const items = $input.all()
return items.map(item => ({
  json: {
    fullName: `${item.json.firstName} ${item.json.lastName}`,
    email: item.json.email.toLowerCase(),
    isVIP: item.json.totalOrders > 10,
  }
}))
```

### Step 4: API Workflow

Build workflows visually that:
1. **Webhook** receives order data
2. **IF node** checks if order > $100
3. **Slack** sends notification to #sales
4. **Google Sheets** logs the order
5. **SendGrid** sends confirmation email
6. **HTTP Request** updates CRM

## Guidelines

- Self-hosted n8n is free and unlimited. Cloud starts at $20/month.
- 400+ built-in integrations (Slack, Gmail, Airtable, Stripe, Shopify, GitHub, etc.).
- Use Code nodes for complex logic — full JavaScript/Python support.
- Workflows can be triggered by webhooks, cron schedules, or other workflows.
