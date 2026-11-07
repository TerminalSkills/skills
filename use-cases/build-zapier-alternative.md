---
title: "Build a Self-Hosted Zapier Alternative"
description: "Replace per-task Zapier bills with a self-hosted automation platform: run n8n for the visual editor and 1500+ integrations, and add a small Inngest and Prisma service for the workflows that need your own code."
skills: [n8n, inngest, prisma]
difficulty: intermediate
time_estimate: "12 hours"
tags: [automation, workflows, integrations, webhooks, self-hosted]
---

# Build a Self-Hosted Zapier Alternative

## The Problem

Your team pays for Zapier by the task. Zapier's Professional plan starts from $19.99/month and the price rises with the monthly task allowance you pick (zapier.com/pricing, checked 5 November 2026). Half of your 50 workflows are simple HTTP requests and data transforms. You want full control, custom integrations and no per-task pricing.

## The Solution

Two layers, and you usually need only the first:

1. **n8n (self-hosted)** replaces Zapier itself: a visual editor, 1500+ integration nodes, webhook and schedule triggers, retries and an execution history. Workflows that need nothing but integrations stay here.
2. **A small Inngest + Prisma service** handles the workflows that are really your own code: durable multi-day waits, custom step types, per-customer workflow definitions stored in your database.

n8n is under the Sustainable Use License (fair-code, not open source): free to run for your own business, but you may not resell it as a hosted service.

## Step 1: Run n8n

Use the `n8n` skill for the production setup (Docker Compose with PostgreSQL, a pinned image, `N8N_ENCRYPTION_KEY`, a reverse proxy with TLS). To try it locally first, pin the current stable release and bind it to localhost only:

```console
$ docker run -d --name n8n -p 127.0.0.1:5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n:2.46.6
```

Open http://127.0.0.1:5678 and create the owner account. Rebuild each Zap as a workflow: a Webhook or Schedule Trigger node, then Slack, Gmail, Stripe, GitHub, Notion or HTTP Request nodes, with credentials stored once under Credentials. Click Publish to turn the triggers on. The webhook production URL is `/webhook/<path>` (the `/webhook-test/` URL only works while you listen in the editor); give public webhooks header or basic auth. Read the release notes before moving to a newer major version.

Everything below is optional: it is the part you build when a workflow must live in your own application.

## Architecture of the Custom Layer

```text
Webhook (HMAC-signed)
    ↓
Inngest (durable execution, retries, sleeps)
    ↓
Step runner (http | transform | filter | delay)
    ↓
Prisma + PostgreSQL (workflow definitions + execution log)
```
Pin `inngest@4.26.2`, `undici@7` (SDK v4: the trigger goes inside the first argument of `createFunction`), `prisma@7` and `@prisma/client@7` (npm `latest` for Prisma currently points at an 8.0 release candidate), and `next@16`. In development run the Inngest Dev Server with `INNGEST_DEV=1`; in production set `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`.

## Step 2: Data Models

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Workflow {
  id         String              @id @default(cuid())
  name       String
  enabled    Boolean             @default(true)
  secret     String              // HMAC key for the webhook URL
  trigger    Json
  steps      Json                // array of step definitions
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  executions WorkflowExecution[]
}

model WorkflowExecution {
  id          String    @id @default(cuid())
  workflowId  String
  workflow    Workflow  @relation(fields: [workflowId], references: [id])
  status      String    @default("running") // running | success | filtered | failed
  triggerData Json
  stepResults Json      @default("{}")
  error       String?
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?

  @@index([workflowId, startedAt])
}
```

Create the client in `src/lib/prisma.ts` with the `@prisma/adapter-pg@7` driver adapter (`new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`, imported from the generated client path) as the `prisma` skill shows. Set up `prisma.config.ts` (`defineConfig` with `datasource: { url: process.env.DATABASE_URL }`) as the `prisma` skill shows, then run `npx prisma migrate dev` against your own PostgreSQL.

## Step 3: Signed Webhook Trigger

Anyone who finds the URL could otherwise start your workflows, so every call carries an `x-signature` header: the hex HMAC-SHA256 of the raw body, keyed with the workflow's `secret`. The check uses a constant-time comparison. The route creates the execution row first and sends its id as the Inngest event id, so a duplicate send does not run twice.

```typescript
// src/app/api/webhooks/[workflowId]/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { inngest } from '@/inngest/client'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params
  const raw = await req.text()                       // sign the exact bytes received

  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, enabled: true } })
  if (!workflow) return new Response('Not found', { status: 404 })

  const expected = createHmac('sha256', workflow.secret).update(raw).digest()
  const given = Buffer.from(req.headers.get('x-signature') ?? '', 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let triggerData: unknown
  try { triggerData = JSON.parse(raw) } catch { return new Response('Invalid JSON', { status: 400 }) }

  const execution = await prisma.workflowExecution.create({
    data: { workflowId, triggerData: triggerData as object },
  })
  // `id` makes Inngest drop a duplicate send for the same execution
  await inngest.send({ id: execution.id, name: 'workflow/execute', data: { executionId: execution.id } })
  return Response.json({ queued: true, executionId: execution.id }, { status: 202 })
}
```

## Step 4: Step Runner

HTTP steps take their URL from workflow data, so they go through `safeFetch`: it refuses private, link-local and other internal addresses (server-side request forgery), does not follow redirects, and checks the address the socket actually connects to, so a DNS answer that changes between check and connect (DNS rebinding) cannot get through. It uses `undici`'s `fetch` because Node's built-in one cannot take a custom connector.

```typescript
// src/lib/safe-fetch.ts
import { lookup } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch } from 'undici'

const blocked = new BlockList()
const v4 = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const
const v6 = [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const
for (const [net, bits] of v4) blocked.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of v6) blocked.addSubnet(net, bits, 'ipv6')
const isBlocked = (address: string) => blocked.check(address, address.includes(':') ? 'ipv6' : 'ipv4')

// The check runs on the address the socket actually connects to, so a DNS answer that changes
// between "check" and "connect" (DNS rebinding) cannot slip through.
const safeAgent = new Agent({
  connect: {
    lookup(host, opts, cb) {
      lookup(host, { ...opts, all: true }, (err, addrs) => {
        if (err) return cb(err, [])
        const bad = addrs.find((a) => isBlocked(a.address))
        if (bad) return cb(new Error(`Blocked address ${bad.address}`), [])
        if (opts.all) cb(null, addrs)
        else cb(null, addrs[0].address, addrs[0].family)
      })
    },
  },
})

export async function safeFetch(raw: string, init: RequestInit = {}) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed')
  const literal = url.hostname.replace(/^\[|\]$/g, '')   // IP literals skip DNS, so check them here
  if (isIP(literal) && isBlocked(literal)) throw new Error(`Blocked address ${literal}`)
  return fetch(url, { ...(init as object), redirect: 'error', signal: AbortSignal.timeout(15_000), dispatcher: safeAgent })
}
```

A non-2xx answer throws, which lets Inngest retry the step.
```typescript
// src/lib/step-runner.ts
import { safeFetch } from './safe-fetch'

export type Context = { trigger: unknown; steps: Record<string, unknown> }
export type StepDef = { id: string; type: 'http' | 'transform' | 'filter' | 'delay'; config: any }
export class Filtered extends Error {}

function get(path: string, ctx: Context): unknown {
  return path.trim().split('.').reduce<any>((obj, key) => obj?.[key], ctx)
}

export function render(template: string, ctx: Context): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, path) => String(get(path, ctx) ?? ''))
}
const ops = {
  eq: (l: any, r: any) => l === r,
  neq: (l: any, r: any) => l !== r,
  contains: (l: any, r: any) => String(l ?? '').includes(String(r)),
  gte: (l: any, r: any) => Number(l) >= Number(r),
  lte: (l: any, r: any) => Number(l) <= Number(r),
}
const passes = (c: { path: string; op: keyof typeof ops; value: any }, ctx: Context) => ops[c.op](get(c.path, ctx), c.value)

export async function runStep(def: StepDef, ctx: Context): Promise<unknown> {
  switch (def.type) {
    case 'http': {
      const { url, method = 'GET', headers = {}, body } = def.config
      const target = new URL(render(url, ctx))
      const res = await safeFetch(target.href, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? render(JSON.stringify(body), ctx) : undefined,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${target.host}`)  // lets Inngest retry
      const text = await res.text()
      try { return { status: res.status, body: JSON.parse(text) } } catch { return { status: res.status, body: text } }
    }
    case 'transform':
      return Object.fromEntries(Object.entries(def.config.mapping).map(([k, t]) => [k, render(t as string, ctx)]))
    case 'filter':
      if (!passes(def.config, ctx)) throw new Filtered('filtered')
      return { passed: true }
    default:
      throw new Error(`Unknown step type: ${def.type}`)
  }
}
```

## Step 5: Inngest Executor

Each step is an Inngest `step.run`, so a retry resumes after the last finished step instead of repeating side effects such as a payment call. Database writes are also wrapped in steps. A filter that blocks marks the execution `filtered` and stops cleanly. `onFailure` runs after the retries are used up and receives the original event under `event.data.event`.

```typescript
// src/inngest/functions.ts
import { inngest } from './client'
import { prisma } from '@/lib/prisma'
import { runStep, Filtered, type Context, type StepDef } from '@/lib/step-runner'

export const executeWorkflow = inngest.createFunction(
  {
    id: 'workflow-execute',
    retries: 3,
    triggers: { event: 'workflow/execute' },
    onFailure: async ({ event, error }) => {
      await prisma.workflowExecution.update({
        where: { id: event.data.event.data.executionId },
        data: { status: 'failed', error: error.message, finishedAt: new Date() },
      })
    },
  },
  async ({ event, step }) => {
    const execution = await step.run('load-execution', () =>
      prisma.workflowExecution.findUniqueOrThrow({ where: { id: event.data.executionId }, include: { workflow: true } }),
    )
    const ctx: Context = { trigger: execution.triggerData, steps: {} }

    for (const def of execution.workflow.steps as StepDef[]) {
      if (def.type === 'delay') {
        await step.sleep(`delay-${def.id}`, def.config.duration)   // e.g. "30 minutes"
        continue
      }
      try {
        ctx.steps[def.id] = await step.run(`step-${def.id}`, () => runStep(def, ctx))
      } catch (err) {
        if (err instanceof Filtered || (err as Error).message === 'filtered') {
          await step.run('mark-filtered', () =>
            prisma.workflowExecution.update({ where: { id: execution.id }, data: { status: 'filtered', finishedAt: new Date() } }),
          )
          return { filtered: def.id }
        }
        throw err
      }
    }

    await step.run('mark-success', () =>
      prisma.workflowExecution.update({
        where: { id: execution.id },
        data: { status: 'success', stepResults: ctx.steps as object, finishedAt: new Date() },
      }),
    )
    return ctx.steps
  },
)
```

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { executeWorkflow } from '@/inngest/functions'

export const { GET, POST, PUT } = serve({ client: inngest, functions: [executeWorkflow] })
```

Schedules stay in n8n's Schedule Trigger. Workflow rows are plain JSON. A webhook workflow that forwards large orders to another service:

```json
{ "steps": [
  { "id": "big", "type": "filter", "config": { "path": "trigger.total", "op": "gte", "value": 100 } },
  { "id": "fwd", "type": "http", "config": { "url": "https://httpbin.org/post", "method": "POST",
    "body": { "text": "Order {{trigger.order_id}}: {{trigger.total}} EUR" } } }
] }
```

Integrations in the custom layer are `http` steps aimed at the vendor's REST API; for anything bigger, use an n8n node instead of re-implementing it.

## Cost

Self-hosting swaps the per-task bill for a server you maintain: backups, upgrades and monitoring are your job. If you use Inngest Cloud, its usage is a second bill, and a self-hosted Inngest server is another option; both are described on inngest.com/pricing. Next steps: a workflow editor page that writes the JSON rows (a React Flow canvas is a common choice), team permissions, secret rotation and versioned workflow definitions.
