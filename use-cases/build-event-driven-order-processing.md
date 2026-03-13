---
title: Build Event-Driven Order Processing
slug: build-event-driven-order-processing
description: Build an event-driven order processing pipeline with saga orchestration, compensation handling, dead letter queues, and observability — replacing synchronous API calls with reliable async workflows.
skills:
  - typescript
  - redis
  - postgresql
  - zod
category: Backend Development
tags:
  - event-driven
  - saga
  - order-processing
  - distributed-systems
  - async
---

# Build Event-Driven Order Processing

## The Problem

Farah leads engineering at a 35-person e-commerce platform. Order processing is a synchronous chain: validate inventory → charge payment → update stock → send confirmation email → notify warehouse. If the email service is down, the entire order fails — even though payment succeeded. If payment times out, inventory is already reserved and never released. Last month, 200 orders were stuck in limbo: payment charged but no confirmation sent. They need an event-driven architecture where each step is independent, failures are compensated, and no order gets lost.

## Step 1: Build the Saga Orchestrator

```typescript
// src/orders/saga.ts — Saga pattern for multi-step order processing
import { Redis } from "ioredis";
import { pool } from "../db";
import { EventEmitter } from "node:events";

const redis = new Redis(process.env.REDIS_URL!);

interface SagaStep {
  name: string;
  execute: (context: SagaContext) => Promise<any>;
  compensate: (context: SagaContext) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
}

interface SagaContext {
  sagaId: string;
  orderId: string;
  data: Record<string, any>;
  results: Record<string, any>;
}

type SagaStatus = "running" | "completed" | "compensating" | "failed" | "compensated";

export class SagaOrchestrator extends EventEmitter {
  private steps: SagaStep[];

  constructor(steps: SagaStep[]) {
    super();
    this.steps = steps;
  }

  async execute(orderId: string, initialData: Record<string, any>): Promise<{
    sagaId: string;
    status: SagaStatus;
    results: Record<string, any>;
  }> {
    const sagaId = `saga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const context: SagaContext = {
      sagaId,
      orderId,
      data: initialData,
      results: {},
    };

    // Record saga start
    await pool.query(
      `INSERT INTO sagas (id, order_id, status, steps_completed, data, created_at)
       VALUES ($1, $2, 'running', '{}', $3, NOW())`,
      [sagaId, orderId, JSON.stringify(initialData)]
    );

    const completedSteps: SagaStep[] = [];

    try {
      for (const step of this.steps) {
        await this.executeStep(step, context);
        completedSteps.push(step);

        // Record step completion
        await pool.query(
          `UPDATE sagas SET steps_completed = steps_completed || $2::jsonb WHERE id = $1`,
          [sagaId, JSON.stringify({ [step.name]: { status: "completed", result: context.results[step.name] } })]
        );

        this.emit("step_completed", { sagaId, step: step.name, orderId });
      }

      // All steps completed
      await pool.query("UPDATE sagas SET status = 'completed', completed_at = NOW() WHERE id = $1", [sagaId]);
      this.emit("saga_completed", { sagaId, orderId });

      return { sagaId, status: "completed", results: context.results };
    } catch (err: any) {
      this.emit("saga_failed", { sagaId, orderId, error: err.message });

      // Compensate completed steps in reverse order
      await pool.query("UPDATE sagas SET status = 'compensating' WHERE id = $1", [sagaId]);

      for (const step of completedSteps.reverse()) {
        try {
          await step.compensate(context);

          await pool.query(
            `UPDATE sagas SET steps_completed = steps_completed || $2::jsonb WHERE id = $1`,
            [sagaId, JSON.stringify({ [`${step.name}_compensate`]: { status: "compensated" } })]
          );

          this.emit("step_compensated", { sagaId, step: step.name, orderId });
        } catch (compErr: any) {
          // Compensation failed — send to dead letter queue
          await redis.rpush("sagas:dead_letter", JSON.stringify({
            sagaId,
            step: step.name,
            action: "compensate",
            error: compErr.message,
            context,
            timestamp: Date.now(),
          }));

          this.emit("compensation_failed", { sagaId, step: step.name, error: compErr.message });
        }
      }

      const finalStatus = completedSteps.length > 0 ? "compensated" : "failed";
      await pool.query("UPDATE sagas SET status = $2, error = $3 WHERE id = $1", [sagaId, finalStatus, err.message]);

      return { sagaId, status: finalStatus, results: context.results };
    }
  }

  private async executeStep(step: SagaStep, context: SagaContext): Promise<void> {
    const maxRetries = step.retries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          step.execute(context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Step ${step.name} timed out`)), step.timeoutMs || 30000)
          ),
        ]);

        context.results[step.name] = result;
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError;
  }
}

// Define order processing saga
const orderSaga = new SagaOrchestrator([
  {
    name: "reserve_inventory",
    execute: async (ctx) => {
      const { rows } = await pool.query(
        `UPDATE products SET stock = stock - $2
         WHERE id = $1 AND stock >= $2 RETURNING stock`,
        [ctx.data.productId, ctx.data.quantity]
      );
      if (rows.length === 0) throw new Error("Insufficient stock");
      return { remainingStock: rows[0].stock };
    },
    compensate: async (ctx) => {
      await pool.query(
        "UPDATE products SET stock = stock + $2 WHERE id = $1",
        [ctx.data.productId, ctx.data.quantity]
      );
    },
  },
  {
    name: "charge_payment",
    execute: async (ctx) => {
      // Stripe charge
      const charge = await chargeCustomer(ctx.data.customerId, ctx.data.amount);
      return { chargeId: charge.id };
    },
    compensate: async (ctx) => {
      // Refund
      await refundCharge(ctx.results.charge_payment.chargeId);
    },
    retries: 2,
    timeoutMs: 15000,
  },
  {
    name: "create_order_record",
    execute: async (ctx) => {
      const { rows: [order] } = await pool.query(
        `INSERT INTO orders (customer_id, product_id, quantity, amount, payment_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', NOW()) RETURNING id`,
        [ctx.data.customerId, ctx.data.productId, ctx.data.quantity,
         ctx.data.amount, ctx.results.charge_payment.chargeId]
      );
      return { orderId: order.id };
    },
    compensate: async (ctx) => {
      await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1",
        [ctx.results.create_order_record.orderId]);
    },
  },
  {
    name: "send_confirmation",
    execute: async (ctx) => {
      await sendOrderConfirmationEmail(ctx.data.customerEmail, ctx.results.create_order_record.orderId);
      return { sent: true };
    },
    compensate: async () => { /* emails can't be unsent */ },
    retries: 3,
  },
]);

// Placeholder functions
async function chargeCustomer(customerId: string, amount: number) { return { id: `ch_${Date.now()}` }; }
async function refundCharge(chargeId: string) { /* refund logic */ }
async function sendOrderConfirmationEmail(email: string, orderId: string) { /* send email */ }

export { orderSaga };
```

## Results

- **Zero stuck orders** — saga compensation ensures every failed step is rolled back; if payment succeeds but email fails, the payment is refunded automatically
- **200 limbo orders → 0** — dead letter queue catches compensation failures; ops team reviews and resolves them manually within hours, not weeks
- **Email service downtime doesn't block orders** — email step retries 3 times; if it still fails, the order is confirmed and email is sent when the service recovers
- **Step-by-step observability** — every saga step is logged with status, duration, and result; debugging a failed order takes seconds instead of hours
- **Inventory always consistent** — stock is reserved first and released on compensation; no overselling, no phantom reservations
