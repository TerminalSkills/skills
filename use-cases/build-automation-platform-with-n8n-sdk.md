---
title: Build an Internal Automation Platform with n8n Workflow SDK
slug: build-automation-platform-with-n8n-sdk
description: >-
  Build a self-service automation platform where teams create, test, and deploy
  n8n workflows from code. Version-controlled workflow definitions, CI validation,
  environment-based deployment, and a library of reusable workflow templates.
skills:
  - n8n-workflow-sdk
  - n8n
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

Lena's company runs 80+ n8n workflows — customer onboarding, invoice processing, Slack alerts, CRM syncs, support ticket routing, and weekly reports. They were all built by clicking in the n8n UI, exported as JSON blobs, and stored in a shared Google Drive folder. Nobody knows which workflow does what, changes break things silently, and deploying a workflow means copy-pasting JSON between browser tabs. When the lead automation engineer goes on vacation, nobody dares touch anything. Lena introduces `@n8n/workflow-sdk`, n8n's own TypeScript SDK, to turn their automation mess into a proper engineering practice. The package is pre-1.0 and changes often, so the team pins `0.39.5` exactly (the current `latest` tag on npm) and re-runs validation on every upgrade.

## Step 1: Workflow-as-Code Repository

Instead of JSON files in Google Drive, workflows live in a Git repository as TypeScript modules, so every change is reviewable. The SDK has no per-node helpers: every node is `node({ type, version, config })` (or `trigger(...)` for entry points), and `type` and `version` come from your n8n instance. Copy them from an exported workflow, or let `generateWorkflowCode` convert an existing export into SDK code.

```console
$ mkdir automations && cd automations && npm init -y
$ npm install --save-exact @n8n/workflow-sdk@0.39.5 zod
$ npm install --save-dev --save-exact typescript tsx vitest @types/node
```
The layout is small: `src/workflows/` (one module per workflow), `src/templates/` (reusable patterns), `src/lib/validate.ts` and `src/lib/deploy.ts`, `src/index.ts` (the registry), and `tests/`. Set `"type": "module"` in `package.json`.

## Step 2: A Reusable Template

A template is a plain function that returns a workflow. Every webhook-to-Slack workflow gets the same trigger, the same optional score filter and the same Slack node. `ifElse` gives `.onTrue()` / `.onFalse()` branches; the `conditions` object must contain `options`, `conditions` and `combinator`, otherwise validation fails.

```typescript
// src/templates/webhook-to-slack.ts
import { workflow, node, trigger, ifElse, expr, sticky } from '@n8n/workflow-sdk'

export interface WebhookToSlackOptions {
  id: string
  name: string
  webhookPath: string
  slackChannelId: string
  minScore?: number
  message: string
  description?: string
}

export function webhookToSlack(opts: WebhookToSlackOptions) {
  const intake = trigger({
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    config: {
      name: 'Webhook',
      parameters: { httpMethod: 'POST', path: opts.webhookPath, responseMode: 'onReceived' },
    },
  })
  const post = node({
    type: 'n8n-nodes-base.slack',
    version: 2.4,
    config: {
      name: 'Post to Slack',
      parameters: {
        resource: 'message',
        operation: 'post',
        select: 'channel',
        channelId: { __rl: true, mode: 'id', value: opts.slackChannelId },
        text: expr(opts.message),
      },
    },
  })
  const wf = workflow(opts.id, opts.name).add(intake)
  if (opts.minScore === undefined) return wf.to(post)

  const passes = ifElse({
    version: 2.2,
    config: {
      name: `Score >= ${opts.minScore}?`,
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [{ leftValue: expr('{{ $json.body.score }}'), operator: { type: 'number', operation: 'gte' }, rightValue: opts.minScore }],
          combinator: 'and',
        },
      },
    },
  })
  const discard = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Ignore' } })
  return wf.to(passes.onTrue!(post).onFalse!(discard))
}
```
(`onTrue!` and `onFalse!` are only there because the SDK's TypeScript types mark them optional on the node instance; they exist at runtime.)

## Step 3: Workflows Built From It

```typescript
// src/workflows/lead-alert.ts
import { webhookToSlack } from '../templates/webhook-to-slack'

export const leadAlert = webhookToSlack({
  id: 'lead-alert',
  name: 'Hot Lead Alert',
  webhookPath: 'new-lead',
  slackChannelId: 'C0123456789',
  minScore: 80,
  message: '{{ "New hot lead: " + $json.body.email + " (score " + $json.body.score + ")" }}',
})
```

A branching workflow without a template uses `switchCase`, whose cases are wired by index. Sending unmatched tickets to the extra output (`fallbackOutput: 'extra'`) is case 2 here.

```typescript
// src/workflows/support-router.ts
import { workflow, node, trigger, switchCase, expr } from '@n8n/workflow-sdk'

const intake = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'Ticket', parameters: { httpMethod: 'POST', path: 'support-ticket', responseMode: 'onReceived' } },
})
const route = switchCase({
  version: 3.2,
  config: {
    name: 'By category',
    parameters: {
      rules: {
        values: ['billing', 'technical'].map((c) => ({
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [{ leftValue: expr('{{ $json.body.category }}'), operator: { type: 'string', operation: 'equals' }, rightValue: c }],
            combinator: 'and',
          },
          renameOutput: true,
          outputKey: c,
        })),
      },
      options: { fallbackOutput: 'extra' },
    },
  },
})
const channel = (name: string, id: string) =>
  node({
    type: 'n8n-nodes-base.slack',
    version: 2.4,
    config: {
      name,
      parameters: {
        resource: 'message', operation: 'post', select: 'channel',
        channelId: { __rl: true, mode: 'id', value: id },
        text: expr('{{ $json.body.subject }} from {{ $json.body.email }}'),
      },
    },
  })

export const supportRouter = workflow('support-router', 'Support Ticket Router')
  .add(intake)
  .to(route.onCase!(0, channel('Billing', 'C0000000001')).onCase!(1, channel('Engineering', 'C0000000002')).onCase!(2, channel('Product', 'C0000000003')))
```

Register both so validation and deployment see them:

```typescript
// src/index.ts
import { leadAlert } from './workflows/lead-alert'
import { supportRouter } from './workflows/support-router'

export const registry = { 'lead-alert': leadAlert, 'support-router': supportRouter }
```

## Step 4: Validation and Tests

`validateWorkflow` takes the workflow JSON and returns `{ valid, errors, warnings }`; each error has a `code` and a `message`.

```typescript
// src/lib/validate.ts
import { validateWorkflow } from '@n8n/workflow-sdk'
import { registry } from '../index'

let failed = 0
for (const [key, wf] of Object.entries(registry)) {
  const result = validateWorkflow(wf.toJSON())
  if (!result.valid) {
    failed++
    console.error(`${key}:`)
    for (const e of result.errors) console.error(`  - ${e.code}: ${e.message}`)
  }
}
if (failed) process.exit(1)
console.log(`All ${Object.keys(registry).length} workflows valid`)
```

Tests inspect the generated JSON, so a reviewer sees that the webhook path and the Slack node did not change by accident:

```typescript
// tests/workflows.test.ts
import { describe, it, expect } from 'vitest'
import { leadAlert } from '../src/workflows/lead-alert'

describe('lead-alert', () => {
  const json = leadAlert.toJSON()
  it('starts from a webhook on /new-lead', () => {
    const hook = json.nodes.find((n) => n.type === 'n8n-nodes-base.webhook')
    expect(hook?.parameters?.path).toBe('new-lead')
  })
  it('posts to Slack and validates', () => {
    expect(json.nodes.some((n) => n.type === 'n8n-nodes-base.slack')).toBe(true)
    expect(leadAlert.validate().valid).toBe(true)
  })
})
```

```console
$ npx tsx src/lib/validate.ts
All 2 workflows valid
$ npx vitest run
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

```yaml
# .github/workflows/validate.yml
name: Validate Workflows
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx tsx src/lib/validate.ts
      - run: npx vitest run
```

## Step 5: Deploy Through the n8n Public API

Create an API key in n8n (Settings, n8n API) for each environment and keep it in CI secrets, never in the repository. The deploy script looks a workflow up by name (`GET /workflows?name=`), updates it with `PUT /workflows/{id}` or creates it with `POST /workflows`, and only publishes when asked. Send only `name`, `nodes`, `connections` and `settings`: the create endpoint rejects other fields. Publishing is `POST /workflows/{id}/publish`; the old `activate` endpoint is deprecated. `zod` checks the environment variables before anything is sent.

```typescript
// src/lib/deploy.ts (Node 20+, ES module)
import { z } from 'zod'
import { registry } from '../index'

const Env = z.object({
  N8N_URL: z.url(),
  N8N_API_KEY: z.string().min(1),
  PUBLISH: z.enum(['true', 'false']).default('false'),
})

const env = Env.parse(process.env)
const base = `${env.N8N_URL.replace(/\/$/, '')}/api/v1`
const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': env.N8N_API_KEY }

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`)
  return res.json() as Promise<any>
}

let failed = 0
for (const wf of Object.values(registry)) {
  const { name, nodes, connections, settings } = wf.toJSON()
  const body = JSON.stringify({ name, nodes, connections, settings })
  try {
    const found = await call(`/workflows?name=${encodeURIComponent(name)}&limit=50`)
    const existing = found.data?.find((w: { name: string }) => w.name === name)
    const saved = existing
      ? await call(`/workflows/${existing.id}`, { method: 'PUT', body })
      : await call('/workflows', { method: 'POST', body })
    if (env.PUBLISH === 'true') await call(`/workflows/${saved.id}/publish`, { method: 'POST', body: '{}' })
    console.log(`${existing ? 'updated' : 'created'}: ${name} (${saved.id})`)
  } catch (err) {
    failed++
    console.error(`failed: ${name}: ${(err as Error).message}`)
  }
}
if (failed) process.exit(1)
```

```console
$ N8N_URL=https://n8n-staging.acme.dev N8N_API_KEY=$N8N_STAGING_KEY PUBLISH=true npx tsx src/lib/deploy.ts
$ N8N_URL=https://n8n.acme.dev N8N_API_KEY=$N8N_PRODUCTION_KEY npx tsx src/lib/deploy.ts   # saved, not published
```
Credentials are never embedded in the workflow: use `newCredential('Slack account')` in a node's `credentials` and bind the real credential in n8n once. Webhook nodes should have an Authentication option (header or basic auth) set before they are published, because the production URL is public. If your n8n runs in Docker, pin the image (`docker.n8n.io/n8nio/n8n:2.46.6` is the current stable release; read the release notes before moving to a new major version) and keep `N8N_ENCRYPTION_KEY` backed up: the `n8n` skill covers the compose setup.

## Results

Workflow changes now arrive as pull requests: a wrong channel ID, a missing branch or an invalid condition fails `validate` before anyone clicks Publish. Fixing the template once updates every workflow built on it in one PR, and deployment is a single command per environment. The numbers below are the example team's own: after three months they manage 120 workflows across staging and production, and the deployment mistakes that used to come from copy-pasting JSON have stopped.

## Related Skills

`n8n-workflow-sdk` (the SDK API), `n8n` (running and pinning n8n), `zod` (environment checks), `vitest` (workflow tests).
