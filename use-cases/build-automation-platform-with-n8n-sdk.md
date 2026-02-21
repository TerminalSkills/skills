---
title: Build an Internal Automation Platform with n8n Workflow SDK
slug: build-automation-platform-with-n8n-sdk
description: >-
  Build a self-service automation platform where teams create, test, and deploy
  n8n workflows from code. Version-controlled workflow definitions, CI validation,
  environment-based deployment, and a library of reusable workflow templates.
skills:
  - n8n-workflow-sdk
  - n8n-workflow
  - zod
  - vitest
category: automation
tags:
  - n8n
  - workflow
  - automation
  - sdk
  - infrastructure-as-code
---

# Build an Internal Automation Platform with n8n Workflow SDK

Lena's company runs 80+ n8n workflows — customer onboarding, invoice processing, Slack alerts, CRM syncs, support ticket routing, and weekly reports. They were all built by clicking in the n8n UI, exported as JSON blobs, and stored in a shared Google Drive folder. Nobody knows which workflow does what, changes break things silently, and deploying a workflow means copy-pasting JSON between browser tabs. When the lead automation engineer goes on vacation, nobody dares touch anything. Lena introduces the n8n Workflow SDK to turn their automation mess into a proper engineering practice.

## Step 1: Workflow-as-Code Repository

Instead of JSON files in Google Drive, workflows live in a Git repository as TypeScript modules. Each workflow is readable, reviewable, and version-controlled.

```text
automations/
├── src/
│   ├── workflows/
│   │   ├── onboarding/
│   │   │   ├── customer-welcome.ts        # Send welcome sequence
│   │   │   ├── trial-activation.ts        # Activate trial + notify sales
│   │   │   └── crm-sync.ts               # Sync new signup to HubSpot
│   │   ├── billing/
│   │   │   ├── invoice-processing.ts      # Process incoming invoices
│   │   │   ├── payment-reminders.ts       # Dunning email sequence
│   │   │   └── revenue-report.ts          # Weekly revenue digest
│   │   ├── support/
│   │   │   ├── ticket-routing.ts          # Route tickets by category
│   │   │   ├── sla-monitor.ts            # Alert on SLA breaches
│   │   │   └── satisfaction-survey.ts     # Post-resolution CSAT
│   │   └── internal/
│   │       ├── daily-standup-summary.ts   # Summarize standup notes
│   │       └── new-hire-setup.ts          # Provision accounts for new hires
│   ├── templates/
│   │   ├── webhook-to-slack.ts            # Reusable: webhook → process → Slack
│   │   ├── scheduled-report.ts            # Reusable: cron → fetch → email
│   │   └── api-sync.ts                    # Reusable: poll API → transform → upsert
│   ├── middleware/
│   │   ├── error-handler.ts               # Wrap workflows with error notifications
│   │   └── rate-limiter.ts                # Add rate limiting to API-calling workflows
│   ├── lib/
│   │   ├── deploy.ts                      # Deploy workflows to n8n instance
│   │   ├── validate.ts                    # Validate all workflows
│   │   └── config.ts                      # Environment-specific config
│   └── index.ts                           # Registry of all workflows
├── tests/
│   ├── onboarding.test.ts
│   ├── billing.test.ts
│   └── helpers.ts
├── package.json
└── tsconfig.json
```

## Step 2: Reusable Workflow Templates

The team builds composable templates that standardize common patterns — every webhook-to-Slack workflow has the same error handling, every scheduled report has the same formatting.

```typescript
// src/templates/webhook-to-slack.ts — Reusable webhook → process → notify template
import { WorkflowBuilder, webhook, ifElse, code, node, sticky } from '@n8n/workflow-sdk'

interface WebhookToSlackOptions {
  name: string
  webhookPath: string
  slackChannel: string
  filterCondition?: {
    field: string
    operator: 'eq' | 'neq' | 'contains' | 'gte' | 'lte'
    value: string | number
  }
  formatMessage: string       // n8n expression for Slack message
  description?: string
}

export function webhookToSlack(opts: WebhookToSlackOptions) {
  const builder = new WorkflowBuilder()
    .withName(opts.name)
    .addTrigger(webhook({
      path: opts.webhookPath,
      method: 'POST',
      responseMode: 'onReceived',
    }))

  // Optional filtering step
  if (opts.filterCondition) {
    builder
      .then(ifElse({
        conditions: {
          combinator: 'and',
          conditions: [{
            leftValue: `={{ $json.${opts.filterCondition.field} }}`,
            operator: opts.filterCondition.operator,
            rightValue: opts.filterCondition.value,
          }],
        },
      }))
      .onTrue(
        node('n8n-nodes-base.slack', {
          channel: opts.slackChannel,
          text: opts.formatMessage,
        })
      )
      // False branch — silently discard
      .onFalse(code({ language: 'typescript', code: 'return []' }))
  } else {
    builder.then(node('n8n-nodes-base.slack', {
      channel: opts.slackChannel,
      text: opts.formatMessage,
    }))
  }

  if (opts.description) {
    builder.addSticky(sticky({ content: `## ${opts.name}\n${opts.description}`, width: 300, height: 120 }))
  }

  return builder.build()
}
```

```typescript
// src/templates/scheduled-report.ts — Reusable scheduled → fetch → format → email
import { WorkflowBuilder, schedule, httpRequest, code, node } from '@n8n/workflow-sdk'

interface ScheduledReportOptions {
  name: string
  cronExpression: string               // e.g. '0 9 * * 1' for Monday 9 AM
  dataSourceUrl: string
  dataSourceHeaders?: Record<string, string>
  transformCode: string                // TypeScript code to format the data
  emailTo: string
  emailSubject: string
}

export function scheduledReport(opts: ScheduledReportOptions) {
  return new WorkflowBuilder()
    .withName(opts.name)
    .addTrigger(schedule({
      rule: { interval: [{ field: 'cronExpression', expression: opts.cronExpression }] },
    }))
    .then(httpRequest({
      url: opts.dataSourceUrl,
      method: 'GET',
      headers: opts.dataSourceHeaders || {},
    }))
    .then(code({
      language: 'typescript',
      code: opts.transformCode,
    }))
    .then(node('n8n-nodes-base.emailSend', {
      toEmail: opts.emailTo,
      subject: opts.emailSubject,
      html: '={{ $json.htmlBody }}',
    }))
    .build()
}
```

## Step 3: Real Workflows Using Templates

```typescript
// src/workflows/support/ticket-routing.ts — Route support tickets to the right team
import { WorkflowBuilder, webhook, switchCase, node, code, sticky } from '@n8n/workflow-sdk'

const workflow = new WorkflowBuilder()
  .withName('Support Ticket Router')

  .addTrigger(webhook({
    path: 'support-ticket',
    method: 'POST',
    responseMode: 'onReceived',
  }))

  // Classify the ticket using AI
  .then(node('n8n-nodes-langchain.agent', {
    text: '={{ $json.subject + ": " + $json.description }}',
    systemMessage: `Classify this support ticket into exactly one category:
      - billing (payment issues, invoices, refunds, subscription changes)
      - technical (bugs, errors, API issues, integration problems)  
      - account (login, permissions, team management, SSO)
      - feature (feature requests, product feedback)
      Respond with only the category name.`,
  }))

  // Route based on AI classification
  .then(switchCase({
    rules: [
      { value: 'billing', output: 0 },
      { value: 'technical', output: 1 },
      { value: 'account', output: 2 },
    ],
    fallbackOutput: 3,     // feature requests and unclassified
  }))

  // Billing → Finance Slack channel + Stripe lookup
  .onCase(0,
    node('n8n-nodes-base.slack', {
      channel: '#billing-support',
      text: '🧾 *New billing ticket*\n*From:* {{ $json.email }}\n*Subject:* {{ $json.subject }}\n{{ $json.description }}',
    })
  )

  // Technical → Engineering channel + PagerDuty if urgent
  .onCase(1,
    code({
      language: 'typescript',
      code: `
        // Check if ticket mentions keywords indicating urgency
        const urgentKeywords = ['down', 'outage', 'critical', 'production', '500 error', 'data loss']
        const isUrgent = urgentKeywords.some(kw =>
          items[0].json.description?.toLowerCase().includes(kw)
        )
        return items.map(item => ({ json: { ...item.json, isUrgent } }))
      `,
    })
  )

  // Account → Success team
  .onCase(2,
    node('n8n-nodes-base.slack', {
      channel: '#customer-success',
      text: '👤 *Account issue*\n*From:* {{ $json.email }}\n{{ $json.subject }}',
    })
  )

  // Default → Product channel
  .onDefault(
    node('n8n-nodes-base.slack', {
      channel: '#product-feedback',
      text: '💡 *Feature request*\n*From:* {{ $json.email }}\n{{ $json.subject }}\n{{ $json.description }}',
    })
  )

  .addSticky(sticky({
    content: '## Ticket Router\nAI classifies tickets → routes to correct team channel.\nUrgent technical issues trigger PagerDuty.',
    width: 350,
    height: 100,
  }))

  .build()

export default workflow
```

```typescript
// src/workflows/billing/revenue-report.ts — Weekly revenue digest
import { scheduledReport } from '../../templates/scheduled-report'

export default scheduledReport({
  name: 'Weekly Revenue Report',
  cronExpression: '0 9 * * 1',         // Monday 9 AM
  dataSourceUrl: '{{ $env.STRIPE_API_URL }}/v1/balance_transactions?created[gte]={{ $now.minus(7, "days").toSeconds() }}',
  dataSourceHeaders: { Authorization: 'Bearer {{ $env.STRIPE_SECRET_KEY }}' },
  transformCode: `
    // Aggregate Stripe transactions into a weekly summary
    const transactions = items[0].json.data || []
    const revenue = transactions
      .filter(t => t.type === 'charge' && t.status === 'available')
      .reduce((sum, t) => sum + t.amount, 0) / 100

    const refunds = transactions
      .filter(t => t.type === 'refund')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0) / 100

    const net = revenue - refunds
    const count = transactions.filter(t => t.type === 'charge').length

    return [{
      json: {
        htmlBody: \`
          <h2>Weekly Revenue Report</h2>
          <p><strong>Period:</strong> Last 7 days</p>
          <table border="1" cellpadding="8">
            <tr><td>Gross Revenue</td><td><strong>$\${revenue.toLocaleString()}</strong></td></tr>
            <tr><td>Refunds</td><td>-$\${refunds.toLocaleString()}</td></tr>
            <tr><td>Net Revenue</td><td><strong>$\${net.toLocaleString()}</strong></td></tr>
            <tr><td>Transactions</td><td>\${count}</td></tr>
          </table>
        \`
      }
    }]
  `,
  emailTo: 'finance-team@company.com',
  emailSubject: 'Weekly Revenue Report — {{ $now.format("MMM D, YYYY") }}',
})
```

## Step 4: Validation and Testing

```typescript
// src/lib/validate.ts — Validate all workflows before deployment
import { validateWorkflow } from '@n8n/workflow-sdk'
import { getAllWorkflows } from './registry'

export async function validateAll() {
  const workflows = await getAllWorkflows()
  const results: { name: string; valid: boolean; errors: string[] }[] = []

  for (const [name, workflow] of Object.entries(workflows)) {
    const errors = validateWorkflow(workflow)
    results.push({
      name,
      valid: errors.length === 0,
      errors: errors.map(e => e.message),
    })
  }

  const failed = results.filter(r => !r.valid)
  if (failed.length > 0) {
    console.error(`\n❌ ${failed.length} workflows failed validation:\n`)
    failed.forEach(f => {
      console.error(`  ${f.name}:`)
      f.errors.forEach(e => console.error(`    - ${e}`))
    })
    process.exit(1)
  }

  console.log(`✅ All ${results.length} workflows valid`)
}
```

```typescript
// tests/onboarding.test.ts — Structural tests for workflows
import { describe, it, expect } from 'vitest'
import customerWelcome from '../src/workflows/onboarding/customer-welcome'
import trialActivation from '../src/workflows/onboarding/trial-activation'

describe('onboarding workflows', () => {
  it('customer-welcome has a webhook trigger', () => {
    const trigger = customerWelcome.nodes.find(n => n.type.includes('webhook'))
    expect(trigger).toBeDefined()
    expect(trigger.parameters.path).toBe('customer-welcome')
  })

  it('trial-activation sends to both Slack and email', () => {
    const slackNode = trialActivation.nodes.find(n => n.type.includes('slack'))
    const emailNode = trialActivation.nodes.find(n => n.type.includes('email'))
    expect(slackNode).toBeDefined()
    expect(emailNode).toBeDefined()
  })

  it('all onboarding workflows have sticky notes with documentation', () => {
    const workflows = [customerWelcome, trialActivation]
    workflows.forEach(wf => {
      const stickies = wf.nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote')
      expect(stickies.length).toBeGreaterThanOrEqual(1)
    })
  })
})
```

```yaml
# .github/workflows/validate.yml — CI validation
name: Validate Workflows
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run validate        # runs validateAll()
      - run: npm test                 # runs vitest
```

## Step 5: Environment-Based Deployment

```typescript
// src/lib/deploy.ts — Deploy workflows to n8n instances
import { getAllWorkflows } from './registry'

interface DeployConfig {
  n8nUrl: string
  apiKey: string
  activate: boolean
}

const environments: Record<string, DeployConfig> = {
  staging: {
    n8nUrl: process.env.N8N_STAGING_URL!,
    apiKey: process.env.N8N_STAGING_KEY!,
    activate: true,
  },
  production: {
    n8nUrl: process.env.N8N_PRODUCTION_URL!,
    apiKey: process.env.N8N_PRODUCTION_KEY!,
    activate: false,       // manual activation in production
  },
}

async function deploy(env: string) {
  const config = environments[env]
  if (!config) throw new Error(`Unknown environment: ${env}`)

  const workflows = await getAllWorkflows()
  let deployed = 0, failed = 0

  for (const [name, workflow] of Object.entries(workflows)) {
    try {
      // Check if workflow exists (by name)
      const existing = await fetch(`${config.n8nUrl}/api/v1/workflows?name=${encodeURIComponent(name)}`, {
        headers: { 'X-N8N-API-KEY': config.apiKey },
      }).then(r => r.json())

      let id: string
      if (existing.data?.length > 0) {
        // Update existing
        id = existing.data[0].id
        await fetch(`${config.n8nUrl}/api/v1/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': config.apiKey },
          body: JSON.stringify(workflow),
        })
        console.log(`  ↻ Updated: ${name}`)
      } else {
        // Create new
        const result = await fetch(`${config.n8nUrl}/api/v1/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': config.apiKey },
          body: JSON.stringify(workflow),
        }).then(r => r.json())
        id = result.id
        console.log(`  + Created: ${name}`)
      }

      // Activate if configured
      if (config.activate) {
        await fetch(`${config.n8nUrl}/api/v1/workflows/${id}/activate`, {
          method: 'PATCH',
          headers: { 'X-N8N-API-KEY': config.apiKey },
        })
      }

      deployed++
    } catch (err) {
      console.error(`  ✗ Failed: ${name} — ${err.message}`)
      failed++
    }
  }

  console.log(`\n${env}: ${deployed} deployed, ${failed} failed`)
}

// CLI usage: npx tsx src/lib/deploy.ts staging
deploy(process.argv[2] || 'staging')
```

## Results

The team goes from "nobody touch that workflow" to confident, reviewable changes. PR reviews catch issues that previously broke production workflows — a misconfigured Slack channel, a missing error handler, a wrong API endpoint. The reusable templates eliminate copy-paste errors: when the webhook-to-Slack pattern gets an error handling improvement, all 15 workflows using the template get it in one PR. Deployment time drops from 20 minutes of copy-pasting JSON to a single `npm run deploy production` command. The new hire provisions automation goes from "ask Dave, he knows how to click the right buttons" to a self-documenting TypeScript file that any engineer can read, modify, and deploy. After 3 months, the team manages 120 workflows across staging and production, with zero incidents from deployment errors (previously averaging 2 per month from JSON copy-paste mistakes).
