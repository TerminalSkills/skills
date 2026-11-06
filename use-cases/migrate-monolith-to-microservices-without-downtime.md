---
title: Migrate a Monolith to Microservices Without Downtime
slug: migrate-monolith-to-microservices-without-downtime
description: A 15-person fintech team strangling a Django monolith into microservices over 6 months — using feature flags for gradual traffic shifting, event-driven communication via RabbitMQ, a shared Postgres with per-service schemas, and OpenTelemetry tracing to catch regressions — without a single minute of planned downtime.
skills: [amqplib, otel-js, prisma, docker-helper, load-balancer]
category: development
tags: [microservices, migration, monolith, strangler-fig, zero-downtime, event-driven]
---

# Migrate a Monolith to Microservices Without Downtime

Priya is the tech lead at a 15-person fintech startup. Their Django monolith handles payments, user management, notifications, and reporting — all in one codebase. Deployments take 45 minutes, a bug in notifications brought down payments last month, and the team can't scale the payment processing independently. The CEO wants microservices, but they can't afford downtime — they process $2M/day.

## The Strangler Fig Strategy

Instead of rewriting everything (the classic mistake), Priya uses the strangler fig pattern: extract one capability at a time, run old and new in parallel, shift traffic gradually, and remove the old code only when the new service is proven.

## Step 1: Map the Monolith Boundaries

Before writing any code, the team maps every database table to a business domain and every API endpoint to its owning domain. They discover 4 clear boundaries: payments (23 tables, 15 endpoints), users (8, 12), notifications (4, 3), reporting (2, 4). The dependencies are messy: payments imports user models directly, notifications queries payment tables, reporting reads everything. These coupling points become the integration contracts.

## Step 1b: Run the Whole Stack Locally

The team first reproduces the target topology with Docker Compose. Ports bind to `127.0.0.1` and secrets come from `.env`:

```yaml
services:
  rabbitmq:
    image: rabbitmq:4-management-alpine
    ports: ["127.0.0.1:5672:5672", "127.0.0.1:15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:?set it in .env}
    healthcheck: { test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"], interval: 10s, timeout: 5s, retries: 6 }
  postgres:
    image: postgres:18-alpine
    ports: ["127.0.0.1:5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql"]
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
      POSTGRES_DB: payments
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U app -d payments"], interval: 5s, timeout: 5s, retries: 5 }
  jaeger:
    image: jaegertracing/jaeger:2.23.0
    ports: ["127.0.0.1:16686:16686", "127.0.0.1:4318:4318"]
volumes:
  pgdata:
```

`docker compose config` validates the file and `docker compose up -d --wait` returns once the healthchecks pass. The notifications service gets its own image (env: `RABBITMQ_URL`, `DATABASE_URL`, `OTEL_SERVICE_NAME=notifications-service`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`; containers use service names, never `localhost`). It is a multi-stage build running as the non-root `node` user:

```dockerfile
# notifications-service/Dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app ./
USER node
CMD ["node", "--import", "./dist/tracing.js", "dist/consumer.js"]
```

`--import` loads the tracing setup before the app imports `amqplib` and the Prisma client, so the instrumentations can patch them.

## Step 2: Extract Notifications First (Lowest Risk)

Notifications is the easiest to extract: it has the fewest dependencies, and if it fails, nobody loses money. The team creates a new Node.js service:

```typescript
// notifications-service/src/consumer.ts — Listen for events from the monolith
import amqp from "amqplib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// Prisma 7: the client needs a driver adapter and the generated `prisma-client` output
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const handlers: Record<string, (e: any) => Promise<void>> = {
  "payment.completed": sendPaymentReceipt,
  "payment.failed": sendPaymentFailedAlert,
  "user.signup": sendWelcomeEmail,
  "user.password-reset": sendPasswordResetLink,
};

async function startConsumer() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);
  connection.on("error", (err) => console.error("rabbitmq connection error", err.message));
  const channel = await connection.createChannel();
  await channel.assertExchange("dlx", "fanout", { durable: true });
  await channel.assertQueue("notifications.failed", { durable: true });
  await channel.bindQueue("notifications.failed", "dlx", "");

  await channel.assertExchange("domain-events", "topic", { durable: true });
  await channel.assertQueue("notifications.events", {
    durable: true, arguments: { "x-dead-letter-exchange": "dlx" },
  });

  for (const key of Object.keys(handlers)) {
    await channel.bindQueue("notifications.events", "domain-events", key);
  }
  await channel.prefetch(20);
  channel.consume("notifications.events", async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      const routingKey = msg.fields.routingKey;
      const eventId = msg.properties.messageId;

      // RabbitMQ delivers at least once: skip an event already handled
      // (eventId is unique in the notification_log table)
      if (!(await prisma.notificationLog.findUnique({ where: { eventId } }))) {
        await handlers[routingKey](event);   // sendPaymentReceipt, sendWelcomeEmail, ...
        await prisma.notificationLog.create({   // audit record
          data: { eventId, eventType: routingKey, recipientId: event.userId, status: "delivered" },
        });
      }
      channel.ack(msg);
    } catch (error) {
      console.error("Notification failed:", error);
      channel.nack(msg, false, false);     // Dead-letter to notifications.failed for inspection and replay
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

    # The flag picks one path, so nobody gets two emails
    if feature_flags.is_enabled("notifications-v2", request.user.id):
        # NEW: publish after the DB commit, so the event never describes a rolled-back payment
        transaction.on_commit(lambda: publish_event("payment.completed", {
            "paymentId": str(payment.id),
            "userId": str(payment.user_id),
            "amountCents": payment.amount_cents,
            "currency": payment.currency,
        }, message_id=f"payment.completed:{payment.id}"))    # becomes the consumer's eventId
    else:
        send_payment_email(payment)        # OLD: direct call, kept until the flag reaches 100%
```

The feature flag controls which path handles the notification. They start at 1% of users, monitor for 2 weeks, then gradually increase to 100%. `transaction.on_commit` still leaves a gap (the process can die between commit and publish), so the team later moves to a transactional outbox table that a relay drains into RabbitMQ with publisher confirms (`createConfirmChannel` in amqplib).

## Step 3: Distributed Tracing Across Both Systems

With traffic flowing through both monolith and microservice, the team needs visibility into what's happening. They add OpenTelemetry tracing to both:

```typescript
// notifications-service/src/tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AmqplibInstrumentation } from "@opentelemetry/instrumentation-amqplib";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const sdk = new NodeSDK({
  // Service name from OTEL_SERVICE_NAME, endpoint from OTEL_EXPORTER_OTLP_ENDPOINT (path /v1/traces is appended)
  traceExporter: new OTLPTraceExporter(),
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
// schema: Payment.idempotencyKey is @unique, amountCents is Int

app.post("/api/payments/charge", async (req, res) => {
  const { userId, amountCents, currency, paymentMethodId } = req.body;
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key header required" });

  // The unique index decides the race: two concurrent retries cannot both insert
  let payment;
  try {
    payment = await prisma.payment.create({
      data: { userId, amountCents, currency, paymentMethodId, idempotencyKey, status: "pending" } });
  } catch (e: any) {
    if (e.code !== "P2002") throw e;                    // unique constraint violation
    return res.json(await prisma.payment.findUniqueOrThrow({ where: { idempotencyKey } }));
  }

  // No database transaction around the network call. Stripe deduplicates on the same key,
  // so a crash and retry cannot charge twice.
  const intent = await stripe.paymentIntents.create(
    { amount: amountCents, currency, payment_method: paymentMethodId, confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { paymentId: payment.id, userId } },
    { idempotencyKey },
  );

  const status = intent.status === "succeeded" ? "completed"
    : intent.status === "requires_action" ? "pending" : "failed";
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status, stripeChargeId: intent.latest_charge as string | null },
  });

  if (status === "completed") {
    await publishEvent("payment.completed", { paymentId: updated.id, userId, amountCents, currency });
  }
  return res.json(updated);
});
```

The load balancer handles the gradual traffic shift:

```nginx
# nginx.conf (http context)
upstream payments_legacy { server monolith:8000; }
upstream payments_new    { server payments-service:3001; }

# Percentage hashed per client IP. Edit, `nginx -t`, then `nginx -s reload`.
split_clients "${remote_addr}" $payments_backend {
    20%   payments_new;
    *     payments_legacy;
}

server {
    location /api/payments/ {
        proxy_pass http://$payments_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Migration-Backend $payments_backend;
    }
}
```

## Step 5: Data Migration and Validation

The most dangerous part: moving payment data to the new service's database. They run a continuous sync job that copies data and validates:

```typescript
// migration/validate-payments.ts — runs on a schedule during the dual-write period
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("migration-validator");

async function validatePaymentSync() {
  return tracer.startActiveSpan("validate-payment-sync", async (span) => {
    const { rows } = await legacyDb.query(
      "SELECT id, amount_cents, status FROM payments ORDER BY random() LIMIT 1000"
    );
    let mismatches = 0;
    for (const legacy of rows) {
      const migrated = await newDb.payment.findUnique({ where: { legacyId: legacy.id } });
      if (!migrated || migrated.amountCents !== legacy.amount_cents || migrated.status !== legacy.status) {
        mismatches++;
      }
    }
    span.setAttributes({ sample_size: rows.length, mismatches });
    span.end();
    if (mismatches > 5) {   // more than 0.5% of the sample: pause the traffic shift
      await publishEvent("migration.alert", { service: "payments", mismatches });
    }
    return mismatches;
  });
}
```

## Results

After 6 months, payments and notifications are extracted; users and reporting follow the same pattern. These are the example team's own numbers:

- **Zero planned downtime**; payment changes ship in 3 minutes (was 45), and a notification template bug no longer touches payments
- **Data integrity**: continuous validation caught 3 sync issues before users saw them
- **Observability**: end-to-end traces across monolith and services; MTTR from 2 hours to 15 minutes
- **Cost**: 2 engineers part-time for 6 months, against an estimated 12 months with 4 engineers for a big-bang rewrite

## Related Skills

- [docker-helper](/skills/docker-helper): the Compose stack and the multi-stage notifications image
- [amqplib](/skills/amqplib): RabbitMQ topology, dead-lettering and publisher confirms
- [prisma](/skills/prisma): per-service schema and the Prisma 7 driver adapter
- [otel-js](/skills/otel-js): OpenTelemetry setup for the Node services
- [load-balancer](/skills/load-balancer): nginx percentage traffic shifting
