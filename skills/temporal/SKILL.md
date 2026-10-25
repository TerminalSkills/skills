---
name: temporal
description: >-
  Temporal is a durable execution platform: you write workflows as ordinary
  code and the server replays them after crashes, so long-running processes
  survive restarts. Use it when the user asks to orchestrate microservices,
  build sagas with compensation, run long-lived or scheduled workflows, add
  reliable retries to background jobs, or wait on signals and timers.
license: Apache-2.0
compatibility: "Temporal CLI 1.9+ (dev server), TypeScript SDK 1.24 (Node.js 20.3+); also Go, Python, Java, .NET SDKs"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/temporalio/temporal
  tags: "temporal, workflow, orchestration, saga, microservices"
---

# Temporal

## Overview

A Temporal application has three parts. The Temporal Service stores each workflow's event history. A Worker (your process) runs workflow code and activities, polling a task queue. A Client starts workflows and sends them signals and queries. Workflow code must be deterministic (it is replayed from history): do no I/O, randomness or `Date.now()` in it; put all side effects in activities. Activities are retried automatically but can run more than once, so make them idempotent. This skill uses the TypeScript SDK (`@temporalio/*` 1.24).

## Instructions

### Step 1: Run a local server and create the project

```bash
brew install temporal          # or download the CLI from the temporalio/cli GitHub releases and verify checksums.txt
temporal server start-dev --ip 127.0.0.1   # gRPC on 7233, Web UI on http://localhost:8233, in-memory unless --db-filename is given

mkdir orders && cd orders && npm init -y
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
npm install -D typescript tsx @types/node
```

`npx @temporalio/create@latest orders --sample hello-world` scaffolds a similar project. For production use Temporal Cloud or a self-hosted cluster; `start-dev` is for development only.

### Step 2: Workflow

The workflow reserves stock, charges the customer, waits for a signal from the warehouse (with a two-hour timeout) and compensates with a refund when the signal never arrives.

```typescript
// src/types.ts
export interface Item { sku: string; price: number; quantity: number }
export interface OrderResult { orderId: string; tracking: string; total: number }
```

```typescript
// src/workflows.ts
import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow'
import type * as activities from './activities'
import type { Item, OrderResult } from './types'

type Activities = typeof activities

const { reserveInventory, processPayment, refundPayment, shipOrder, sendConfirmation } =
  proxyActivities<Activities>({
    startToCloseTimeout: '30 seconds',
    retry: { maximumAttempts: 3 },
  })

export const warehouseConfirmed = defineSignal('warehouseConfirmed')

export async function orderWorkflow(orderId: string, items: Item[]): Promise<OrderResult> {
  let confirmed = false
  setHandler(warehouseConfirmed, () => { confirmed = true })

  const reservation = await reserveInventory(orderId, items)
  const payment = await processPayment(orderId, reservation.total)

  // Durable wait: up to 2 hours for the warehouse signal, no worker resources held
  if (!(await condition(() => confirmed, '2 hours'))) {
    await refundPayment(payment.chargeId)
    throw new Error(`warehouse did not confirm order ${orderId}`)
  }

  const tracking = await shipOrder(orderId)
  await sendConfirmation(orderId, tracking)
  return { orderId, tracking, total: reservation.total }
}
```

Import activities only as types (`import type`) in workflow files; importing the implementation breaks the workflow sandbox. `condition(fn, timeout)` returns `false` on timeout. Use `sleep('2 hours')` from `@temporalio/workflow` for a plain durable timer; never `setTimeout`.

### Step 3: Activities

```typescript
// src/activities.ts
import type { Item } from './types'

export async function reserveInventory(orderId: string, items: Item[]) {
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  return { reservationId: `res_${orderId}`, total }
}

export async function processPayment(orderId: string, amount: number) {
  // Pass orderId as the payment provider's idempotency key: activities can run more than once
  console.log(`charging ${amount} for ${orderId}`)
  return { chargeId: `ch_${orderId}` }
}

export async function refundPayment(chargeId: string) {
  console.log(`refunding ${chargeId}`)
}

export async function shipOrder(orderId: string) {
  return `TRK-${orderId}`
}

export async function sendConfirmation(orderId: string, tracking: string) {
  console.log(`order ${orderId} shipped, tracking ${tracking}`)
}
```

Real activities call your payment provider or database; pass a stable key such as the order id as the provider's idempotency key so a retry cannot charge twice. Throw `ApplicationFailure.nonRetryable(...)` (exported by `@temporalio/activity`) for errors that retrying cannot fix.

### Step 4: Worker and client

```typescript
// src/worker.ts
import { Worker } from '@temporalio/worker'
import * as activities from './activities'

async function main() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'),
    activities,
    taskQueue: 'orders',
  })
  await worker.run()
}
main().catch((err) => { console.error(err); process.exit(1) })
```

```typescript
// src/client.ts
import { Client } from '@temporalio/client'
import { orderWorkflow, warehouseConfirmed } from './workflows'

async function main() {
  const client = new Client() // localhost:7233, namespace "default"
  const handle = await client.workflow.start(orderWorkflow, {
    taskQueue: 'orders',
    workflowId: 'order-A-1001',
    args: ['A-1001', [{ sku: 'KB-75', price: 89.5, quantity: 2 }]],
  })
  console.log('started', handle.workflowId)
  await handle.signal(warehouseConfirmed)
  console.log('result', await handle.result())
}
main().catch((err) => { console.error(err); process.exit(1) })
```

Run the worker (`npx tsx src/worker.ts`) in one terminal and the client (`npx tsx src/client.ts`) in another. Nothing runs without a worker polling the same task queue. Inspect from the CLI:

```console
$ temporal workflow list
  Status     WorkflowId       Type         StartTime
  Completed  order-A-1001  orderWorkflow  7 seconds ago
$ temporal workflow show -w order-A-1001
```

## Examples

### Example 1: "Charge a card, ship, and refund if the warehouse never answers"

Request: "If the warehouse has not confirmed within two hours, refund and fail the order."
Steps: use the workflow above. Start it with the client; do not send the signal. After two hours the timer fires, `refundPayment` runs and the workflow fails (the timeout branch was not run here, only the signal path) with `warehouse did not confirm order A-1001`.

### Example 2: "Confirm the order from my API"

Request: "My webhook should tell a running order the warehouse is ready."
Steps: in the webhook handler get a handle with `client.workflow.getHandle('order-A-1001')` and call `await handle.signal(warehouseConfirmed)`. Result: the workflow continues to `shipOrder` and returns `{ orderId: 'A-1001', tracking: 'TRK-A-1001', total: 179 }`. This exact flow was run against `temporal server start-dev`.

## Guidelines

- Workflow ids are unique per namespace for running workflows: derive them from a business key (`order-A-1001`) so a duplicate request cannot start a second run.
- Activities are at-least-once, not exactly-once; workflow state is what is durable. Design activities to be idempotent.
- Keep workflow history bounded: for loops that run indefinitely use `continueAsNew`.
- When you change workflow code that has running executions, use the SDK's patching (`patched`) or worker versioning, or replays will fail with non-determinism errors.
- Set `startToCloseTimeout` on every activity; for long ones add heartbeats.
- Do not use Temporal for a simple cron job or a one-shot task a queue can handle; it pays off for multi-step, stateful or long-lived processes.
- `temporal server start-dev` has no authentication; bind it to 127.0.0.1 and never expose it.
