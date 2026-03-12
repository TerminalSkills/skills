---
title: Migrate a Monolith to Microservices Without Downtime
slug: migrate-monolith-to-microservices-without-downtime
description: A 15-person fintech team strangling a Django monolith into microservices over 6 months — using feature flags for gradual traffic shifting, event-driven communication via RabbitMQ, a shared Postgres with per-service schemas, and OpenTelemetry tracing to catch regressions — without a single minute of planned downtime.
skills: [amqplib, opentelemetry-js, prisma, docker-helper, load-balancer]
category: Backend Development
tags: [microservices, migration, monolith, strangler-fig, zero-downtime, event-driven]
---

# Migrate a Monolith to Microservices Without Downtime

Priya is the tech lead at a 15-person fintech startup. Their Django monolith handles payments, user management, notifications, and reporting — all in one codebase. Deployments take 45 minutes, a bug in notifications brought down payments last month, and the team can't scale the payment processing independently. The CEO wants microservices, but they can't afford downtime — they process $2M/day.

## The Strangler Fig Strategy

Instead of rewriting everything (the classic mistake), Priya uses the strangler fig pattern: extract one capability at a time, run old and new in parallel, shift traffic gradually, and remove the old code only when the new service is proven.

## Step 1: Map the Monolith Boundaries

Before writing any code, the team maps every database table to a business domain and every API endpoint to its owning domain. They discover 4 clear boundaries:

```
payments/     → 23 tables, 15 API endpoints, 3 background jobs
users/        → 8 tables, 12 API endpoints, 1 background job
notifications/ → 4 tables, 3 API endpoints, 5 background jobs
reporting/    → 2 tables, 4 API endpoints, 2 background jobs
```

The dependencies are messy: payments imports user models directly, notifications queries payment tables, reporting reads everything. These coupling points become the integration contracts.

## Step 2: Extract Notifications First (Lowest Risk)

Notifications is the easiest to extract: it has the fewest dependencies, and if it fails, nobody loses money. The team creates a new Node.js service:

```typescript
// notifications-service/src/consumer.ts — Listen for events from the monolith
import amqp from "amqplib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function startConsumer() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange("domain-events", "topic", { durable: true });
  await channel.assertQueue("notifications.events", {
    durable: true,
    arguments: { "x-dead-letter-exchange": "dlx" },
  });

  // Subscribe to events from ALL other services
  await channel.bindQueue("notifications.events", "domain-events", "payment.completed");
  await channel.bindQueue("notifications.events", "domain-events", "payment.failed");
  await channel.bindQueue("notifications.events", "domain-events", "user.signup");
  await channel.bindQueue("notifications.events", "domain-events", "user.password-reset");

  await channel.prefetch(20);
  channel.consume("notifications.events", async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      const routingKey = msg.fields.routingKey;

      // Route to handler based on event type
      switch (routingKey) {
        case "payment.completed":
          await sendPaymentReceipt(event);
          break;
        case "payment.failed":
          await sendPaymentFailedAlert(event);
          break;
        case "user.signup":
          await sendWelcomeEmail(event);
          break;
        case "user.password-reset":
          await sendPasswordResetLink(event);
          break;
      }

      // Record delivery for audit
      await prisma.notificationLog.create({
        data: {
          eventType: routingKey,
          recipientId: event.userId,
          channel: event.preferredChannel || "email",
          status: "delivered",
          sentAt: new Date(),
        },
      });

      channel.ack(msg);
    } catch (error) {
      console.error("Notification failed:", error);
      channel.nack(msg, false, false);     // To dead letter queue for retry
    }
  });
}
```

The key insight: the monolith doesn't call the notification service directly. Instead, the team adds event publishing to the monolith's existing code paths:

```python
# In the Django monolith — add event publishing alongside existing notification calls
# payments/views.py
def complete_payment(request, payment_id):
    payment = Payment.objects.get(id=payment_id)
    payment.status = "completed"
    payment.save()

    # OLD: direct notification call (keep during migration)
    if not feature_flags.is_enabled("notifications-v2", request.user.id):
        send_payment_email(payment)        # Old path

    # NEW: publish event (new service picks it up)
    publish_event("payment.completed", {
        "paymentId": str(payment.id),
        "userId": str(payment.user_id),
        "amount": float(payment.amount),
        "currency": payment.currency,
    })
```

The feature flag controls which path handles the notification. They start at 1% of users, monitor for 2 weeks, then gradually increase to 100%.

## Step 3: Distributed Tracing Across Both Systems

With traffic flowing through both monolith and microservice, the team needs visibility into what's happening. They add OpenTelemetry tracing to both:

```typescript
// notifications-service/src/tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AmqplibInstrumentation } from "@opentelemetry/instrumentation-amqplib";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const sdk = new NodeSDK({
  serviceName: "notifications-service",
  traceExporter: new OTLPTraceExporter({ url: "http://jaeger:4318/v1/traces" }),
  instrumentations: [
    new AmqplibInstrumentation(),          // Trace RabbitMQ consume/publish
    new PrismaInstrumentation(),           // Trace DB queries
  ],
});
sdk.start();
```

The monolith propagates trace context through RabbitMQ message headers, so a single trace shows: Django endpoint → RabbitMQ publish → notification service consume → email send → database write. When email delivery time spikes from 200ms to 3 seconds, they trace it to a DNS resolution issue in the new service — caught within hours, not days.

## Step 4: Extract Payments (High Risk, High Reward)

After notifications runs smoothly for a month, they tackle payments. This is harder: payments has direct database reads from 8 other modules. The approach:

```typescript
// payments-service/src/routes.ts — New payment service with its own schema
// Step 1: Dual-write period — monolith writes to both old and new DB
// Step 2: Read from new, fallback to old
// Step 3: Remove old writes

app.post("/api/payments/charge", async (req, res) => {
  const { userId, amount, currency, paymentMethodId } = req.body;

  // Idempotency key prevents double-charging during migration
  const idempotencyKey = req.headers["idempotency-key"];
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return res.json(existing);

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: { userId, amount, currency, paymentMethodId, idempotencyKey, status: "pending" },
    });

    const charge = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      payment_method: paymentMethodId,
      confirm: true,
      metadata: { paymentId: p.id, userId },
    });

    return tx.payment.update({
      where: { id: p.id },
      data: { status: charge.status === "succeeded" ? "completed" : "failed", stripeChargeId: charge.id },
    });
  });

  // Publish event — notifications service will handle the email
  await publishEvent("payment.completed", {
    paymentId: payment.id,
    userId,
    amount,
    currency,
  });

  return res.json(payment);
});
```

The load balancer handles the gradual traffic shift:

```nginx
# nginx.conf — Gradual traffic shifting
upstream payments_legacy {
    server monolith:8000;
}

upstream payments_new {
    server payments-service:3001;
}

# Split map based on percentage (updated via config reload)
split_clients "${remote_addr}" $payments_backend {
    20%   payments_new;
    *     payments_legacy;
}

server {
    location /api/payments/ {
        proxy_pass http://$payments_backend;
        proxy_set_header X-Migration-Backend $payments_backend;
    }
}
```

## Step 5: Data Migration and Validation

The most dangerous part: moving payment data to the new service's database. They run a continuous sync job that copies data and validates:

```typescript
// migration/validate-payments.ts
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("migration-validator");

async function validatePaymentSync() {
  return tracer.startActiveSpan("validate-payment-sync", async (span) => {
    // Sample 1000 random payments from both databases
    const legacyPayments = await legacyDb.query(
      "SELECT * FROM payments ORDER BY RANDOM() LIMIT 1000"
    );

    let mismatches = 0;
    for (const legacy of legacyPayments) {
      const migrated = await newDb.payment.findUnique({
        where: { legacyId: legacy.id },
      });

      if (!migrated) { mismatches++; continue; }
      if (Math.abs(legacy.amount - migrated.amount) > 0.01) mismatches++;
      if (legacy.status !== migrated.status) mismatches++;
    }

    span.setAttribute("mismatches", mismatches);
    span.setAttribute("sample_size", 1000);
    span.setAttribute("mismatch_rate", mismatches / 1000);

    if (mismatches > 5) {
      // Alert — pause migration
      await publishEvent("migration.alert", {
        service: "payments",
        mismatches,
        message: "Data sync mismatch rate > 0.5%, pausing traffic shift",
      });
    }

    return { mismatches, sampleSize: 1000 };
  });
}
```

## Results

After 6 months, the migration is complete for payments and notifications. Users and reporting follow the same pattern.

- **Zero downtime**: Not a single minute of planned downtime during the entire migration
- **Deployment speed**: Payment changes deploy in 3 minutes (was 45 minutes for monolith)
- **Incident isolation**: A notification template bug no longer affects payment processing
- **Scaling**: Payment service auto-scales during peak hours; 3x throughput headroom
- **Team velocity**: Two teams work independently on payments and notifications; no merge conflicts
- **Data integrity**: Continuous validation caught 3 sync issues before they affected users
- **Observability**: End-to-end traces across monolith + microservices; MTTR dropped from 2 hours to 15 minutes
- **Rollback**: Feature flags enabled instant rollback 4 times during migration; each time users were unaffected
- **Cost**: Migration took 6 months of 2 engineers part-time; the alternative (big bang rewrite) was estimated at 12 months with 4 engineers and "some downtime"
