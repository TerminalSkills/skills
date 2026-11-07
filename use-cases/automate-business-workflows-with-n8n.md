---
title: Automate Business Workflows with n8n
slug: automate-business-workflows-with-n8n
description: >-
  Build automated business workflows using self-hosted n8n: lead capture from
  website to CRM, order processing with Stripe webhooks, customer onboarding
  sequences, and internal reporting — without per-task SaaS fees.
skills:
  - n8n
  - docker-helper
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

Rosa runs a 15-person digital agency. Every day, the team manually copies data between tools: leads from the website go into a spreadsheet, then someone copies them to HubSpot. Paid Stripe invoices have to be mirrored by hand in the project tracker. Weekly reports require pulling data from several tools and formatting it in Google Docs. Rosa estimates the team spends 20 hours per week on manual data shuffling. She decides to automate it with n8n.

## Step 1: Self-Hosted n8n

Rosa chooses self-hosted n8n over Zapier for two reasons: no per-task pricing and data stays on their server. n8n is "fair-code" (Sustainable Use License): free to self-host for internal business use, which is her case. She deploys it on the same VPS that hosts their website, using the Docker practices from the `docker-helper` skill: a pinned image tag, a healthcheck-gated database, secrets in `.env`, and the port published to localhost only so the reverse proxy is the only way in.

```yaml
# compose.yaml — n8n + PostgreSQL; a reverse proxy on the host terminates TLS
services:
  postgres:
    image: postgres:18-alpine
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      retries: 10

  n8n:
    image: docker.n8n.io/n8nio/n8n:2.46.6   # pin a version; upgrade on purpose
    restart: always
    ports: ["127.0.0.1:5678:5678"]          # the proxy reaches it; the internet does not
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_WEBHOOK_URL: https://n8n.rosaagency.com/
      N8N_PROXY_HOPS: "1"
      GENERIC_TIMEZONE: Europe/Berlin
      TZ: Europe/Berlin
    volumes: [n8n_data:/home/node/.n8n]
    depends_on:
      postgres: {condition: service_healthy}

volumes:
  n8n_data:
  pgdata:
```

```console
$ printf 'POSTGRES_PASSWORD=%s\nN8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 24)" > .env
$ docker compose up -d --wait
$ curl -s http://127.0.0.1:5678/healthz
{"status":"ok"}
```

Open the editor through the proxy and create the owner account on the first visit. The old `N8N_BASIC_AUTH_*` variables no longer exist in n8n 2.x, so there is nothing to put in the compose file for login. `N8N_ENCRYPTION_KEY` encrypts stored credentials: set it once and back it up with the volumes, because a lost key makes saved credentials unreadable.

Because the n8n database holds every workflow, execution and credential, Rosa backs it up nightly with the `postgresql` skill's tooling:

```console
$ docker compose exec -T postgres pg_dump -U n8n n8n | gzip > n8n-$(date +%F).sql.gz
```

## Step 2: Lead Capture Pipeline

When someone fills out the contact form on the agency's website, n8n receives the webhook and runs a multi-step automation. The Webhook node uses the Header Auth option, so only the website can trigger it.

```text
Webhook (POST /webhook/lead, Header Auth)
  ↓
Edit Fields (Set) node: add source, assign to sales rep
  ↓
IF Node: qualified? (budget >= 5000 AND timeline is not empty)
  ├── YES → HubSpot: Create/Update Contact
  │         → Slack: Send message to #sales with the lead details
  │         → Gmail: Send follow-up email
  └── NO  → Google Sheets: Append row to the "Nurture" sheet
            → Mailchimp: Add member to the nurture audience
```

The form's budget arrives as a string, so in the IF node convert it to a number (`{{ Number($json.body.budget) }}`) before comparing. The website side forwards the form data and the shared secret:

```typescript
// app/api/contact/route.ts — send form data to n8n
export async function POST(req: Request) {
  const data = await req.json()

  const res = await fetch('https://n8n.rosaagency.com/webhook/lead', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lead-Token': process.env.N8N_LEAD_TOKEN!, // matches the Header Auth credential
    },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      company: data.company,
      budget: data.budget,
      timeline: data.timeline,
      message: data.message,
      submitted_at: new Date().toISOString(),
    }),
  })

  if (!res.ok) return Response.json({ success: false }, { status: 502 })
  return Response.json({ success: true })
}
```

In the n8n editor, create a Header Auth credential with name `X-Lead-Token` and the same random value, and select it in the Webhook node's Authentication field. Requests without it get a 403 and no workflow runs.

## Step 3: Invoice and Payment Tracking

When a Stripe invoice is paid, n8n updates the project tracker and notifies the team. The Stripe Trigger node creates and manages the Stripe webhook endpoint when the workflow is published. After that, paste the endpoint's signing secret into the Stripe credential's **Signature Secret** field: from n8n 2.26.2 the node then rejects unsigned, forged or older-than-five-minutes requests with a 401. Without it, anyone who learns the URL can send fake payments.

```text
Stripe Trigger: event invoice.paid
  ↓
Code Node: extract customer info and amount
  ↓
Notion: update the project page to "Paid"
  ↓
Google Sheets: look up the client email in the revenue tracker, then append the row
  ↓
IF Node: was the email absent from the tracker (first payment)?
  ├── YES → Slack: "New client: {company} - {amount}"
  │         → Execute Workflow: "Client Onboarding"
  └── NO  → Slack: "Payment received: {company} - {amount}"
```

The Code node turns the Stripe invoice object into a flat record (Stripe amounts are in the smallest currency unit, so cents are divided by 100):

```javascript
// n8n Code node — mode: Run Once for All Items
const invoice = $input.first().json.data.object

return [{
  json: {
    clientEmail: invoice.customer_email,
    clientName: invoice.customer_name,
    amount: (invoice.amount_paid / 100).toFixed(2),
    currency: invoice.currency.toUpperCase(),
    invoiceId: invoice.id,
    paidAt: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000).toISOString(),
  },
}]
```

Whether a client is new is decided by the tracker lookup, not by a flag in Stripe metadata that someone would have to remember to set.

## Step 4: Weekly Reporting

Every Monday at 9 AM, n8n pulls data from several sources and posts a summary for the team.

```text
Schedule Trigger: every week, Monday 09:00
  ↓
HTTP Request: GET https://api.stripe.com/v1/charges?limit=100&created[gte]={{ Math.floor(Date.now() / 1000) - 7 * 86400 }}
  ↓
Notion: Get many database pages (active projects)
  ↓
HubSpot: Search contacts (Return All; filter Create Date >= 7 days ago)
  ↓
Code Node: compile the summary
  ↓
Slack: post the report to #general
```

The HTTP Request node uses the built-in Stripe credential (Authentication: Predefined Credential Type) rather than a key typed into the node. One request returns at most 100 charges; if the agency has more per week, enable the node's Pagination option. Name the nodes `Stripe Charges`, `Active Projects` and `New Leads` so the Code node can reach them:

```javascript
// n8n Code node — mode: Run Once for All Items
const charges = $('Stripe Charges').first().json.data
  .filter(c => c.paid && !c.refunded && c.status === 'succeeded')
const totalCents = charges.reduce((sum, c) => sum + c.amount, 0)

const activeProjects = $('Active Projects').all().length
const newLeads = $('New Leads').all().length

const week = new Date().toISOString().slice(0, 10)
return [{
  json: {
    week,
    slackMessage:
      `*Weekly report, ${week}*\n` +
      `Revenue: ${(totalCents / 100).toFixed(2)} (${charges.length} payments)\n` +
      `Active projects: ${activeProjects}\n` +
      `New leads: ${newLeads}`,
  },
}]
```

If the Notion or HubSpot node returns no rows, `.all()` is empty and the count is 0, so the report still posts. To keep a history, add a Google Docs "Create document" or Google Sheets "Append row" node after the Code node.

## Results

Rosa's own numbers after setting up the lead, payment, onboarding and reporting workflows: the team estimates it saves about 18 of the 20 weekly hours of copy-paste work. Leads reach HubSpot within seconds instead of next day, paid invoices update the tracker immediately, and the Monday report posts itself. Running cost is the existing $20/month VPS, with no per-task fees. Every workflow can be exported (`docker compose exec n8n n8n export:workflow --all --output=/home/node/.n8n/workflows.json`) and the database is covered by the nightly dump.

## Related Skills

- [n8n](/skills/n8n) — webhook, Code node and publishing details for the workflows above
- [docker-helper](/skills/docker-helper) — the pinned, healthcheck-gated, localhost-bound compose file
- [postgresql](/skills/postgresql) — the database n8n stores workflows and credentials in
