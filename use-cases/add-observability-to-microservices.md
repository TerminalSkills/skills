---
title: Add Observability to a Node.js Microservices Architecture
slug: add-observability-to-microservices
description: Instrument a multi-service Node.js backend with OpenTelemetry tracing, NATS event correlation, and Jaeger visualization to debug cross-service latency.
skills:
  - opentelemetry-js
  - nats-messaging
  - nitro
category: devops
tags:
  - observability
  - tracing
  - microservices
  - opentelemetry
  - nats
  - jaeger
---

## The Problem

Dani runs a SaaS platform split into four microservices: API gateway, user service, billing service, and notification service. When a customer reports "checkout took 12 seconds," Dani has no idea which service caused the delay. Logs exist in each service, but correlating a single request across four services means grepping timestamps and guessing. A billing webhook fires but the notification never arrives — and nobody knows if the message was lost, delayed, or if the notification service crashed silently.

The team needs to see the full lifecycle of a request: API gateway receives it, user service validates the session, billing service charges the card, NATS publishes an event, notification service sends the email. One trace, one view, every hop visible with timing.

## The Solution

Instrument all services with OpenTelemetry auto-instrumentation to capture HTTP and NATS spans. Propagate trace context through NATS message headers so async events stay connected to the original request. Export everything to Jaeger for visualization. Add custom spans around business logic to pinpoint where time is actually spent.

## Step-by-Step Walkthrough

### Step 1: Shared OpenTelemetry Configuration

Every service imports the same instrumentation setup. The only difference is the service name.

```typescript
// packages/shared/instrumentation.ts — Shared OTel setup for all services
/**
 * Import this file BEFORE any other module in each service.
 * It auto-instruments HTTP, fetch, and NATS calls.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export function initTelemetry(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_ENDPOINT || "http://jaeger:4318/v1/traces",
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  process.on("SIGTERM", () => sdk.shutdown());
  return sdk;
}
```

### Step 2: API Gateway with Nitro

The gateway handles incoming HTTP requests and routes them to internal services. OpenTelemetry auto-captures inbound HTTP spans.

```typescript
// services/gateway/instrumentation.ts
import { initTelemetry } from "../../packages/shared/instrumentation";
initTelemetry("api-gateway");
```

```typescript
// services/gateway/server/routes/checkout.post.ts — Checkout endpoint
/**
 * Receives checkout request, calls billing service, publishes NATS event.
 * OpenTelemetry automatically traces the outgoing HTTP call to billing.
 */
import { trace, context, propagation } from "@opentelemetry/api";
import { connect, StringCodec } from "nats";

const tracer = trace.getTracer("api-gateway");
const nc = await connect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
const sc = StringCodec();

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  return tracer.startActiveSpan("checkout.process", async (span) => {
    span.setAttribute("user.id", body.userId);
    span.setAttribute("order.total", body.total);

    // Call billing service (HTTP span auto-captured)
    const billingRes = await $fetch("http://billing:3002/charge", {
      method: "POST",
      body: { userId: body.userId, amount: body.total, currency: "usd" },
    });

    // Propagate trace context into NATS message headers
    const headers = {};
    propagation.inject(context.active(), headers);

    nc.publish("order.completed", sc.encode(JSON.stringify({
      orderId: billingRes.chargeId,
      userId: body.userId,
      amount: body.total,
      traceHeaders: headers,  // Pass OTel context
    })));

    span.setAttribute("order.id", billingRes.chargeId);
    span.end();
    return { orderId: billingRes.chargeId, status: "completed" };
  });
});
```

### Step 3: Billing Service with Custom Spans

```typescript
// services/billing/server/routes/charge.post.ts — Payment processing
/**
 * Charges the customer via Stripe. Custom spans show exactly
 * how much time is spent on Stripe API vs. database write.
 */
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("billing-service");

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  return tracer.startActiveSpan("billing.charge", async (span) => {
    span.setAttribute("billing.amount", body.amount);
    span.setAttribute("billing.currency", body.currency);

    // Stripe API call — timed separately
    const charge = await tracer.startActiveSpan("stripe.create_charge", async (stripeSpan) => {
      const result = await stripe.charges.create({
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        customer: body.userId,
      });
      stripeSpan.setAttribute("stripe.charge_id", result.id);
      stripeSpan.end();
      return result;
    });

    // Database write — timed separately
    await tracer.startActiveSpan("db.save_transaction", async (dbSpan) => {
      await db.insert(transactions).values({
        chargeId: charge.id,
        userId: body.userId,
        amount: body.amount,
      });
      dbSpan.end();
    });

    span.end();
    return { chargeId: charge.id, status: "charged" };
  });
});
```

### Step 4: Notification Service Consuming NATS Events

```typescript
// services/notifications/index.ts — Consumes NATS events with trace propagation
/**
 * Picks up the trace context from the NATS message headers,
 * so the notification span appears as a child of the original
 * checkout request in Jaeger.
 */
import { initTelemetry } from "../../packages/shared/instrumentation";
initTelemetry("notification-service");

import { trace, context, propagation, SpanStatusCode } from "@opentelemetry/api";
import { connect, StringCodec } from "nats";

const tracer = trace.getTracer("notification-service");
const nc = await connect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
const sc = StringCodec();

const sub = nc.subscribe("order.completed");

for await (const msg of sub) {
  const data = JSON.parse(sc.decode(msg.data));

  // Restore trace context from the message
  const parentCtx = propagation.extract(context.active(), data.traceHeaders || {});

  context.with(parentCtx, () => {
    tracer.startActiveSpan("notification.send_confirmation", async (span) => {
      span.setAttribute("order.id", data.orderId);
      span.setAttribute("user.id", data.userId);

      try {
        await sendEmail(data.userId, {
          subject: "Order Confirmed",
          body: `Your order ${data.orderId} for $${data.amount} is confirmed.`,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
      } finally {
        span.end();
      }
    });
  });
}
```

### Step 5: Docker Compose for Local Development

```yaml
# docker-compose.yml — Full stack with Jaeger + NATS
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI — open this to see traces
      - "4318:4318"    # OTLP HTTP receiver
    environment:
      COLLECTOR_OTLP_ENABLED: true

  nats:
    image: nats:latest
    command: -js  # Enable JetStream
    ports:
      - "4222:4222"

  gateway:
    build: { context: ., dockerfile: services/gateway/Dockerfile }
    ports: ["3000:3000"]
    environment:
      OTEL_ENDPOINT: http://jaeger:4318/v1/traces
      NATS_URL: nats://nats:4222

  billing:
    build: { context: ., dockerfile: services/billing/Dockerfile }
    environment:
      OTEL_ENDPOINT: http://jaeger:4318/v1/traces

  notifications:
    build: { context: ., dockerfile: services/notifications/Dockerfile }
    environment:
      OTEL_ENDPOINT: http://jaeger:4318/v1/traces
      NATS_URL: nats://nats:4222
```

## The Outcome

Dani opens Jaeger at `localhost:16686`, searches for traces on the `api-gateway` service, and clicks on a checkout request. The waterfall view shows the complete journey: gateway received the request (2ms), called billing service (340ms total — 290ms was Stripe API, 50ms database write), published NATS event (1ms), notification service picked it up (15ms) and sent the email (180ms). Total: 538ms.

The 12-second checkout? Jaeger shows it immediately — the Stripe API call took 11.4 seconds on that particular request due to a retry. Now Dani knows exactly where to add a timeout and fallback. No more log grepping, no more guessing which service is slow. One trace ID connects every hop, including async NATS events that cross service boundaries.
