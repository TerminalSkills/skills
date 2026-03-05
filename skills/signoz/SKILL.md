---
name: signoz
description: Expert guidance for SigNoz, the open-source observability platform that provides traces, metrics, and logs in a single UI. Built natively on OpenTelemetry, SigNoz is a self-hosted alternative to Datadog and New Relic. Helps developers set up distributed tracing, application performance monitoring, log management, and custom dashboards.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - observability
  - apm
  - traces
  - metrics
  - logs
---

# SigNoz — Open-Source Observability Platform


## Overview


SigNoz, the open-source observability platform that provides traces, metrics, and logs in a single UI. Built natively on OpenTelemetry, SigNoz is a self-hosted alternative to Datadog and New Relic. Helps developers set up distributed tracing, application performance monitoring, log management, and custom dashboards.


## Instructions

### Deployment

```bash
# Docker Compose (quickstart)
git clone -b main https://github.com/SigNoz/signoz.git
cd signoz/deploy
docker compose -f docker/clickhouse-setup/docker-compose.yaml up -d

# SigNoz UI at http://localhost:3301
# OTel Collector at localhost:4317 (gRPC) / localhost:4318 (HTTP)
```

### Instrument a Node.js Application

```typescript
// tracing.ts — OpenTelemetry auto-instrumentation for SigNoz
// Import this file BEFORE any other imports in your app entry point.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "api-gateway",
    [ATTR_SERVICE_VERSION]: "1.4.2",
    "deployment.environment": process.env.NODE_ENV ?? "development",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/metrics",
    }),
    exportIntervalMillis: 30000,       // Export metrics every 30s
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Auto-instruments: HTTP, Express, pg, mysql, redis, MongoDB, gRPC
      "@opentelemetry/instrumentation-fs": { enabled: false },  // Too noisy
    }),
  ],
});

sdk.start();

// Graceful shutdown
process.on("SIGTERM", () => sdk.shutdown());
```

### Custom Spans and Attributes

```typescript
// src/services/order-service.ts — Add business context to traces
import { trace, SpanStatusCode, context } from "@opentelemetry/api";

const tracer = trace.getTracer("order-service");

async function processOrder(orderId: string, userId: string) {
  // Create a span for the entire order processing
  return tracer.startActiveSpan("process-order", async (span) => {
    // Add business attributes — visible in SigNoz trace details
    span.setAttribute("order.id", orderId);
    span.setAttribute("user.id", userId);

    try {
      // Child span for payment
      const paymentResult = await tracer.startActiveSpan("charge-payment", async (paymentSpan) => {
        paymentSpan.setAttribute("payment.method", "stripe");
        const result = await stripe.charges.create({ amount: order.total, currency: "usd" });
        paymentSpan.setAttribute("payment.charge_id", result.id);
        paymentSpan.end();
        return result;
      });

      // Child span for inventory
      await tracer.startActiveSpan("update-inventory", async (inventorySpan) => {
        inventorySpan.setAttribute("items.count", order.items.length);
        await inventoryService.reserve(order.items);
        inventorySpan.end();
      });

      // Child span for notification
      await tracer.startActiveSpan("send-confirmation", async (notifSpan) => {
        await emailService.sendOrderConfirmation(userId, orderId);
        notifSpan.end();
      });

      span.setAttribute("order.status", "completed");
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Custom Metrics

```typescript
// src/metrics/business-metrics.ts — Track business KPIs in SigNoz
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("business-metrics");

// Counter — total orders processed
const ordersProcessed = meter.createCounter("orders.processed", {
  description: "Total number of orders processed",
  unit: "orders",
});

// Histogram — order value distribution
const orderValue = meter.createHistogram("orders.value", {
  description: "Order value in cents",
  unit: "cents",
});

// Up/down counter — active users
const activeUsers = meter.createUpDownCounter("users.active", {
  description: "Currently active users",
});

// Usage
function onOrderCompleted(order: Order) {
  ordersProcessed.add(1, {
    "order.plan": order.plan,
    "order.region": order.region,
  });
  orderValue.record(order.totalCents, {
    "order.plan": order.plan,
  });
}
```

### Structured Logging

```typescript
// src/lib/logger.ts — Logs that correlate with traces in SigNoz
import pino from "pino";
import { context, trace } from "@opentelemetry/api";

const logger = pino({
  mixin() {
    // Inject trace context into every log line
    // SigNoz correlates logs with traces using these fields
    const span = trace.getSpan(context.active());
    if (span) {
      const spanContext = span.spanContext();
      return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: `0${spanContext.traceFlags.toString(16)}`,
      };
    }
    return {};
  },
  transport: {
    target: "pino-opentelemetry-transport",
    options: {
      resourceAttributes: { "service.name": "api-gateway" },
      logRecordProcessorOptions: [{
        exporterOptions: {
          protocol: "http",
          httpExporterPath: "/v1/logs",
          hostname: "localhost",
          port: 4318,
        },
      }],
    },
  },
});

export default logger;
```

### Alerts

```yaml
# SigNoz supports alerting on any metric or trace-based condition.
# Configure via the SigNoz UI under Settings → Alerts

# Example alert rules:
# 1. P99 latency > 2s on /api/checkout endpoint
# 2. Error rate > 5% on any service in the last 5 minutes
# 3. Orders processed = 0 for 10 minutes (business metric)
# 4. CPU usage > 80% for 5 minutes

# Notification channels: Slack, PagerDuty, webhook, email, MS Teams, Opsgenie
```

## Installation

```bash
# Self-hosted (Docker Compose)
git clone https://github.com/SigNoz/signoz.git
cd signoz/deploy && docker compose up -d

# Helm (Kubernetes)
helm repo add signoz https://charts.signoz.io
helm install signoz signoz/signoz -n observability --create-namespace

# SigNoz Cloud (managed)
# https://signoz.io/teams/

# Client instrumentation
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
npm install @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```


## Examples


### Example 1: Setting up Signoz for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Signoz for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Docker Compose (quickstart)`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting instrument a node.js application issues

**User request:**

```
Signoz is showing errors in our instrument a node.js application. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Signoz issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **OpenTelemetry native** — SigNoz uses OTel as the standard; instrument with OTel SDKs and switch between SigNoz/Datadog/Jaeger without code changes
2. **Auto-instrumentation first** — Start with auto-instrumentation packages; add custom spans only for business-critical paths
3. **Correlate logs, traces, metrics** — Inject trace_id into logs; SigNoz links them together in the UI for root cause analysis
4. **Business metrics** — Track revenue, orders, signups as OTel metrics; monitor them alongside infrastructure metrics
5. **Tail-based sampling** — For high-traffic services, configure tail-based sampling in the OTel Collector to keep errors and slow traces
6. **ClickHouse storage** — SigNoz uses ClickHouse for storage; tune retention policies based on your data volume
7. **Dashboard per service** — Create a SigNoz dashboard for each service with RED metrics (Rate, Errors, Duration)
8. **Self-host for cost** — SigNoz on your infrastructure costs 5-10x less than Datadog/New Relic for the same data volume
