---
title: Automate Business Workflows with n8n
slug: automate-business-workflows-with-n8n
description: >-
  Build automated business workflows using self-hosted n8n: lead capture from
  website to CRM, order processing with Stripe webhooks, customer onboarding
  sequences, and internal reporting — all without monthly SaaS fees.
skills:
  - n8n
  - docker-compose
  - postgresql
category: automation
tags:
  - automation
  - workflow
  - n8n
  - integration
  - no-code
---

# Automate Business Workflows with n8n

Rosa runs a 15-person digital agency. Every day, the team manually copies data between tools: leads from the website go into a spreadsheet, then someone copies them to HubSpot. New client invoices get created in Stripe, then someone manually updates the project tracker. Weekly reports require pulling data from four different tools and formatting it in Google Docs. Rosa estimates the team spends 20 hours per week on manual data shuffling. She decides to automate it all with n8n.

## Step 1: Self-Hosted n8n

Rosa chooses n8n over Zapier for two reasons: no per-task pricing (Zapier would cost $300+/month for their volume) and data stays on their server. She deploys n8n on the same VPS that hosts their website.

```yaml
# docker-compose.yml — n8n with persistent storage
services:
  n8n:
    image: n8nio/n8n
    restart: always
    ports: ["5678:5678"]
    environment:
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: "${N8N_USER}"
      N8N_BASIC_AUTH_PASSWORD: "${N8N_PASSWORD}"
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: "${DB_PASSWORD}"
      WEBHOOK_URL: https://n8n.rosaagency.com/
      N8N_ENCRYPTION_KEY: "${ENCRYPTION_KEY}"
      GENERIC_TIMEZONE: Europe/Berlin
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on: [postgres]

  postgres:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: "${DB_PASSWORD}"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  n8n_data:
  pgdata:
```

## Step 2: Lead Capture Pipeline

When someone fills out the contact form on the agency's website, n8n receives the webhook and runs a multi-step automation.

The workflow in n8n's visual editor looks like this:

```text
Webhook (POST /webhook/lead)
  ↓
Set Node: Enrich lead data (add timestamp, source, assign to sales rep)
  ↓
IF Node: Is it a qualified lead? (budget > $5000 AND has timeline)
  ├── YES → HubSpot: Create Contact with "Qualified" status
  │         → Slack: Notify #sales channel with lead details
  │         → Gmail: Send personalized follow-up email
  └── NO  → Google Sheets: Add to "Nurture" spreadsheet
            → Mailchimp: Add to nurture email sequence
```

The webhook handler on the website side is simple:

```typescript
// app/api/contact/route.ts — Send form data to n8n
export async function POST(req: Request) {
  const data = await req.json()

  // Send to n8n webhook
  await fetch('https://n8n.rosaagency.com/webhook/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      company: data.company,
      budget: data.budget,
      timeline: data.timeline,
      message: data.message,
      source: 'website',
      submitted_at: new Date().toISOString(),
    }),
  })

  return Response.json({ success: true })
}
```

## Step 3: Invoice and Payment Tracking

When Stripe processes a payment, n8n automatically updates the project tracker and notifies the team.

```text
Stripe Trigger: Payment succeeded
  ↓
Code Node: Extract customer info and amount
  ↓
Notion: Update project status to "Paid" and log payment
  ↓
Google Sheets: Add to revenue tracker (date, client, amount, project)
  ↓
IF Node: Is this a new client? (first payment)
  ├── YES → Slack: "🎉 New client! {company} - ${amount}"
  │         → Trigger "Client Onboarding" workflow
  └── NO  → Slack: "💰 Payment received: {company} - ${amount}"
```

The Code node inside n8n transforms Stripe's raw webhook data into a clean format:

```javascript
// n8n Code node — Transform Stripe event data
const event = $input.first().json

const payment = {
  clientEmail: event.data.object.customer_email,
  clientName: event.data.object.customer_name,
  amount: (event.data.object.amount / 100).toFixed(2),
  currency: event.data.object.currency.toUpperCase(),
  invoiceId: event.data.object.invoice,
  date: new Date(event.data.object.created * 1000).toISOString(),
  isFirstPayment: event.data.object.metadata?.first_payment === 'true',
}

return [{ json: payment }]
```

## Step 4: Weekly Reporting

Every Monday at 9 AM, n8n pulls data from multiple sources and generates a summary for the team.

```text
Cron Trigger: Monday 9:00 AM
  ↓
HTTP Request: Get this week's revenue from Stripe API
  ↓
HTTP Request: Get active projects from Notion API
  ↓
HTTP Request: Get new leads from HubSpot API
  ↓
Code Node: Compile weekly summary
  ↓
Slack: Post formatted report to #general
  ↓
Google Docs: Create weekly report document
```

```javascript
// n8n Code node — Compile weekly summary
const revenue = $('Stripe Revenue').first().json
const projects = $('Active Projects').first().json
const leads = $('New Leads').first().json

const summary = {
  week: new Date().toISOString().slice(0, 10),
  revenue: {
    total: revenue.total,
    transactions: revenue.count,
    vs_last_week: `${revenue.growth > 0 ? '+' : ''}${revenue.growth}%`,
  },
  projects: {
    active: projects.active_count,
    completed_this_week: projects.completed,
    overdue: projects.overdue,
  },
  leads: {
    new: leads.count,
    qualified: leads.qualified,
    conversion_rate: `${((leads.qualified / leads.count) * 100).toFixed(1)}%`,
  },
  slackMessage: `📊 *Weekly Report — ${new Date().toLocaleDateString()}*\n\n` +
    `💰 Revenue: $${revenue.total} (${revenue.growth > 0 ? '+' : ''}${revenue.growth}% vs last week)\n` +
    `📁 Active Projects: ${projects.active_count} (${projects.completed} completed, ${projects.overdue} overdue)\n` +
    `🎯 New Leads: ${leads.count} (${leads.qualified} qualified, ${((leads.qualified / leads.count) * 100).toFixed(1)}% conversion)`,
}

return [{ json: summary }]
```

## Results

After setting up four core workflows (lead capture, payment tracking, client onboarding, weekly reports), Rosa's team saves 18 hours per week — 90% of the manual data shuffling is gone. Leads get into HubSpot within seconds instead of next-day. Payment confirmations update project trackers instantly. The Monday report generates itself. Total cost: $0/month (self-hosted n8n on the existing $20/month VPS). The same automation on Zapier would cost $300+/month for the task volume they process. Six months later, the team has 23 active workflows handling everything from time tracking reminders to client offboarding checklists.
