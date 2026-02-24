---
name: temporal
description: >-
  Build reliable distributed workflows with Temporal. Use when a user asks to
  orchestrate microservices, handle long-running workflows, implement saga
  patterns, build reliable background jobs, or create fault-tolerant
  distributed systems.
license: Apache-2.0
compatibility: 'TypeScript, Go, Python, Java, .NET'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - temporal
    - workflow
    - distributed
    - orchestration
    - microservices
---

# Temporal

## Overview

Temporal is a durable execution platform for building reliable distributed systems. Workflows survive crashes, retries are automatic, and long-running processes (days, months) just work. Used by Netflix, Snap, and Stripe for mission-critical workflows.

## Instructions

### Step 1: Setup

```bash
# Start Temporal server locally
brew install temporal
temporal server start-dev

# Initialize TypeScript project
npx @temporalio/create@latest my-workflows --sample hello-world
cd my-workflows
```

### Step 2: Define Workflow

```typescript
// src/workflows.ts — Order processing workflow
import { proxyActivities, sleep } from '@temporalio/workflow'
import type * as activities from './activities'

const { processPayment, reserveInventory, sendConfirmation, shipOrder } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
})

export async function orderWorkflow(orderId: string, items: Item[]): Promise<OrderResult> {
  // Step 1: Reserve inventory (retries automatically on failure)
  const reservation = await reserveInventory(orderId, items)

  // Step 2: Process payment
  const payment = await processPayment(orderId, reservation.total)

  // Step 3: Wait for warehouse confirmation (could take hours)
  await sleep('2 hours')

  // Step 4: Ship and notify
  const tracking = await shipOrder(orderId)
  await sendConfirmation(orderId, tracking)

  return { orderId, tracking, total: reservation.total }
}
// If the server crashes at step 3, Temporal resumes from exactly where it stopped.
// No data loss, no duplicate payments, no orphaned orders.
```

### Step 3: Define Activities

```typescript
// src/activities.ts — Business logic (can fail and retry)
export async function processPayment(orderId: string, amount: number) {
  const result = await stripe.charges.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    metadata: { orderId },
  })
  return { chargeId: result.id, status: result.status }
}

export async function reserveInventory(orderId: string, items: Item[]) {
  // Check stock, create reservation
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  return { reservationId: `res_${orderId}`, total }
}

export async function sendConfirmation(orderId: string, tracking: string) {
  await sendEmail({ to: orderEmail, subject: `Order ${orderId} shipped`, body: `Tracking: ${tracking}` })
}
```

### Step 4: Start Workflow

```typescript
// src/client.ts — Start a workflow from your API
import { Client } from '@temporalio/client'

const client = new Client()

// Start workflow (returns immediately, workflow runs in background)
const handle = await client.workflow.start(orderWorkflow, {
  taskQueue: 'orders',
  workflowId: `order-${orderId}`,
  args: [orderId, items],
})

// Check status
const result = await handle.result()    // waits for completion
const status = await handle.describe()  // current status
```

## Guidelines

- Temporal guarantees exactly-once execution of workflow steps — even through crashes and deployments.
- Use for anything that spans multiple services or takes more than a few seconds.
- Activities are the only way to interact with the outside world from workflows.
- Temporal Cloud (hosted) starts free for development. Self-hosted is free with Docker.
- Don't use Temporal for simple cron jobs — it's designed for complex, stateful workflows.
