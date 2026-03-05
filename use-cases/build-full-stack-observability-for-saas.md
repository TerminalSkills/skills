---
title: Build Full-Stack Observability for a SaaS Application
slug: build-full-stack-observability-for-saas
description: Set up comprehensive observability for a production SaaS app using SigNoz for distributed tracing and APM, Vector for log collection and routing, Checkly for synthetic monitoring, and Gatus for internal health checks — all self-hosted and open-source.
skills: [signoz, vector, checkly, gatus]
category: Observability & Monitoring
tags: [observability, monitoring, tracing, logging, synthetic-monitoring, self-hosted]
---

# Build Full-Stack Observability for a SaaS Application

Nadia is VP of Engineering at a 30-person SaaS startup processing financial transactions. The product has grown to 12 microservices, and debugging production issues has become a nightmare. When a customer reports "my payment didn't go through," the team spends 45 minutes digging through CloudWatch logs, guessing which service is responsible. Last month, a silent database connection pool exhaustion caused a 2-hour outage that nobody noticed until customers started tweeting.

Nadia's budget is tight — Datadog quotes $25K/year for their volume. Instead, she builds a self-hosted observability stack: SigNoz for distributed tracing and APM, Vector for log collection and routing, Checkly for external synthetic monitoring, and Gatus for internal health checks. Total cost: the compute to run it.

## Step 1: Deploy the Observability Infrastructure

```yaml
# docker-compose.observability.yml — Self-hosted observability stack
# Runs on a single 8GB server. SigNoz handles traces + metrics + logs.
# Gatus monitors internal services. Vector collects and routes data.

version: "3.8"

services:
  # --- SigNoz (traces, metrics, logs dashboard) ---
  signoz-otel-collector:
    image: signoz/signoz-otel-collector:latest
    ports:
      - "4317:4317"                    # gRPC OTLP receiver
      - "4318:4318"                    # HTTP OTLP receiver
    environment:
      - SIGNOZ_COMPONENT=otel-collector
    volumes:
      - ./signoz/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    depends_on:
      - clickhouse

  signoz-query-service:
    image: signoz/query-service:latest
    environment:
      - ClickHouseUrl=tcp://clickhouse:9000
    depends_on:
      - clickhouse

  signoz-frontend:
    image: signoz/frontend:latest
    ports:
      - "3301:3301"                    # SigNoz UI
    depends_on:
      - signoz-query-service

  clickhouse:
    image: clickhouse/clickhouse-server:24.1
    volumes:
      - clickhouse-data:/var/lib/clickhouse

  # --- Gatus (internal health checks) ---
  gatus:
    image: twinproduction/gatus:latest
    ports:
      - "8080:8080"
    volumes:
      - ./gatus/config.yaml:/config/config.yaml
      - gatus-data:/data
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}

  # --- Vector (log collection and routing) ---
  vector:
    image: timberio/vector:latest-alpine
    ports:
      - "8686:8686"                    # HTTP source for app logs
    volumes:
      - ./vector/vector.toml:/etc/vector/vector.toml
      - /var/log:/var/log:ro           # Host logs
    depends_on:
      - signoz-otel-collector

volumes:
  clickhouse-data:
  gatus-data:
```

## Step 2: Instrument Applications with OpenTelemetry

Every microservice sends traces and metrics to SigNoz via OpenTelemetry. When a request touches the API gateway, payment service, and database, SigNoz stitches the entire journey into a single trace.

```typescript
// packages/tracing/src/index.ts — Shared tracing setup for all services
// Each microservice imports this as the first line of its entry point.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      "deployment.environment": process.env.NODE_ENV ?? "production",
      "service.version": process.env.APP_VERSION ?? "unknown",
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_COLLECTOR_URL ?? "grpc://signoz-otel-collector:4317",
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_COLLECTOR_URL ?? "grpc://signoz-otel-collector:4317",
      }),
      exportIntervalMillis: 30000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Auto-instruments HTTP, Express, pg, Redis, gRPC
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  process.on("SIGTERM", () => sdk.shutdown());
  return sdk;
}
```

```typescript
// services/payment-service/src/index.ts — Payment service entry point
// Tracing import MUST be first — before Express, pg, or any other imports.

import { initTracing } from "@myapp/tracing";
initTracing("payment-service");

import express from "express";
import { trace, SpanStatusCode, metrics } from "@opentelemetry/api";

const app = express();
const tracer = trace.getTracer("payment-service");
const meter = metrics.getMeter("payment-service");

// Business metrics visible in SigNoz dashboards
const paymentsProcessed = meter.createCounter("payments.processed.total");
const paymentAmount = meter.createHistogram("payments.amount.cents");
const paymentDuration = meter.createHistogram("payments.duration.ms");

app.post("/api/payments/charge", async (req, res) => {
  const start = Date.now();

  return tracer.startActiveSpan("charge-customer", async (span) => {
    const { customerId, amount, currency } = req.body;
    span.setAttribute("customer.id", customerId);
    span.setAttribute("payment.amount_cents", amount);
    span.setAttribute("payment.currency", currency);

    try {
      // Each of these creates a child span automatically
      // (thanks to auto-instrumentation of pg and HTTP)
      const customer = await db.query(
        "SELECT * FROM customers WHERE id = $1", [customerId]
      );

      const charge = await stripe.charges.create({
        amount,
        currency,
        customer: customer.rows[0].stripe_id,
      });

      await db.query(
        "INSERT INTO payments (customer_id, charge_id, amount) VALUES ($1, $2, $3)",
        [customerId, charge.id, amount]
      );

      // Record business metrics
      paymentsProcessed.add(1, { status: "success", currency });
      paymentAmount.record(amount, { currency });
      paymentDuration.record(Date.now() - start, { status: "success" });

      span.setAttribute("payment.charge_id", charge.id);
      span.setStatus({ code: SpanStatusCode.OK });
      res.json({ chargeId: charge.id, status: "succeeded" });
    } catch (error: any) {
      paymentsProcessed.add(1, { status: "failed", currency });
      paymentDuration.record(Date.now() - start, { status: "failed" });

      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      res.status(500).json({ error: error.message });
    } finally {
      span.end();
    }
  });
});
```

## Step 3: Collect and Route Logs with Vector

Vector replaces Fluentd/Logstash. It collects logs from all services, enriches them with trace context, filters out noise, and sends them to SigNoz for correlation with traces.

```toml
# vector/vector.toml — Collect logs from all services, route to SigNoz

# Receive logs from applications via HTTP
[sources.app_logs]
type = "http_server"
address = "0.0.0.0:8686"
encoding = "json"

# Collect Docker container logs
[sources.docker_logs]
type = "docker_logs"
include_containers = ["payment-service", "api-gateway", "user-service", "order-service"]

# Parse and enrich application logs
[transforms.parse_app_logs]
type = "remap"
inputs = ["app_logs", "docker_logs"]
source = '''
  # Parse JSON if message is a string
  if is_string(.message) {
    parsed, err = parse_json(.message)
    if err == null {
      . = merge(., parsed)
    }
  }

  # Ensure required fields
  .service = .service ?? .container_name ?? "unknown"
  .severity_text = .level ?? "info"
  .severity_number = if .level == "error" || .level == "fatal" { 17 }
    else if .level == "warn" { 13 }
    else if .level == "info" { 9 }
    else { 5 }

  # Keep trace correlation fields (SigNoz uses these to link logs to traces)
  .trace_id = .trace_id ?? ""
  .span_id = .span_id ?? ""

  # Redact sensitive data
  if exists(.email) {
    .email = "***@" + split(to_string(.email), "@")[1]
  }
  del(.password)
  del(.credit_card)
  del(.ssn)
'''

# Filter out noise — health checks, debug logs, K8s probes
[transforms.filter_noise]
type = "filter"
inputs = ["parse_app_logs"]
condition = '''
  .severity_text != "debug" &&
  !starts_with(to_string(.message), "GET /health") &&
  !starts_with(to_string(.message), "GET /ready")
'''

# Send to SigNoz (via OTLP)
[sinks.signoz]
type = "http"
inputs = ["filter_noise"]
uri = "http://signoz-otel-collector:4318/v1/logs"
method = "post"
encoding.codec = "json"
batch.max_bytes = 5242880
batch.timeout_secs = 5

# Archive all logs to S3 (cheap long-term storage)
[sinks.s3_archive]
type = "aws_s3"
inputs = ["filter_noise"]
bucket = "myapp-logs-archive"
key_prefix = "logs/{{ service }}/%Y/%m/%d/"
compression = "gzip"
encoding.codec = "json"
batch.max_bytes = 104857600
batch.timeout_secs = 300
```

## Step 4: Internal Health Checks with Gatus

Gatus runs inside the infrastructure, checking every service every 30 seconds. It catches issues that external monitoring can't see — database connections, Redis availability, inter-service communication.

```yaml
# gatus/config.yaml — Internal health monitoring

storage:
  type: sqlite
  path: /data/gatus.db

web:
  port: 8080

alerting:
  slack:
    webhook-url: "${SLACK_WEBHOOK_URL}"
    default-alert:
      enabled: true
      failure-threshold: 3
      success-threshold: 2
      send-on-resolved: true

endpoints:
  # Core services
  - name: API Gateway
    group: services
    url: "http://api-gateway:3000/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 500"
      - "[BODY].status == ok"
      - "[BODY].db == connected"
      - "[BODY].redis == connected"

  - name: Payment Service
    group: services
    url: "http://payment-service:3001/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 500"
      - "[BODY].stripe == reachable"

  - name: User Service
    group: services
    url: "http://user-service:3002/health"
    interval: 30s
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 300"

  # Infrastructure
  - name: PostgreSQL
    group: infrastructure
    url: "tcp://postgres:5432"
    interval: 15s
    conditions:
      - "[CONNECTED] == true"
    alerts:
      - type: slack
        failure-threshold: 2             # DB issues are urgent

  - name: Redis
    group: infrastructure
    url: "tcp://redis:6379"
    interval: 15s
    conditions:
      - "[CONNECTED] == true"

  - name: SigNoz Collector
    group: observability
    url: "http://signoz-otel-collector:4318/v1/traces"
    interval: 60s
    conditions:
      - "[STATUS] == 405"               # Method not allowed = service is up

  # SSL certificates
  - name: SSL — Main Domain
    group: security
    url: "https://example.com"
    interval: 6h
    conditions:
      - "[CERTIFICATE_EXPIRATION] > 720h"

  # External dependencies
  - name: Stripe
    group: external
    url: "https://api.stripe.com/v1"
    interval: 5m
    conditions:
      - "[STATUS] == 401"
      - "[RESPONSE_TIME] < 3000"
```

## Step 5: External Synthetic Monitoring with Checkly

Checkly monitors from the outside — testing real user flows from multiple global locations. This catches issues that internal monitoring misses: DNS problems, CDN failures, SSL issues, and regional outages.

```typescript
// __checks__/browser/payment-flow.check.ts — End-to-end payment monitoring
// Runs every 10 minutes from US, EU, and Asia.

import { test, expect } from "@playwright/test";

test("Complete payment flow", async ({ page }) => {
  // Step 1: Login
  await page.goto("https://app.example.com/login");
  await page.getByLabel("Email").fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel("Password").fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 10000 });

  // Step 2: Navigate to billing
  await page.getByRole("link", { name: "Billing" }).click();
  await expect(page.getByText("Current Plan")).toBeVisible();

  // Step 3: Verify payment form loads (don't actually charge)
  await page.getByRole("button", { name: "Update Payment Method" }).click();
  await expect(page.getByText("Card number")).toBeVisible();

  // Step 4: Check that Stripe Elements iframe loads
  const stripeFrame = page.frameLocator("iframe[name*='__privateStripeFrame']");
  await expect(stripeFrame.getByPlaceholder("Card number")).toBeVisible({ timeout: 15000 });
});
```

```typescript
// __checks__/api/payment-api.check.ts — API endpoint monitoring
import { ApiCheck, AssertionBuilder } from "checkly/constructs";

new ApiCheck("payment-health", {
  name: "Payment API — Health",
  request: {
    method: "GET",
    url: "https://api.example.com/api/payments/health",
    headers: [{ key: "Authorization", value: "Bearer {{MONITORING_TOKEN}}" }],
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.status").equals("ok"),
      AssertionBuilder.jsonBody("$.stripe").equals("reachable"),
      AssertionBuilder.responseTime().lessThan(2000),
    ],
  },
  degradedResponseTime: 800,
  maxResponseTime: 3000,
  frequency: 1,                        // Every minute
  locations: ["us-east-1", "eu-west-1", "ap-southeast-1"],
});
```

## Results

Within the first week, the observability stack catches three issues the team had no visibility into before.

The first catch is a slow database query. SigNoz's trace view shows that the `/api/orders` endpoint takes 4.2 seconds instead of the expected 200ms. Clicking into the trace reveals a child span: a PostgreSQL query scanning 2.3 million rows without an index. The team adds the index and response time drops to 45ms. Before SigNoz, they would have noticed this only when customers complained.

The second catch comes from Gatus. At 3 AM, Redis connection checks fail for 6 minutes. The Slack alert fires, and the on-call engineer sees that Redis ran out of memory because a background job was caching full API responses instead of IDs. They fix the caching strategy and add a `maxmemory` policy. Without Gatus, this would have caused cache misses and degraded performance until someone noticed hours later.

The third catch is from Checkly. The Playwright browser check fails from the `ap-southeast-1` location — the Stripe Elements iframe doesn't load. The EU and US checks pass fine. Investigation reveals the CDN configuration is blocking Stripe's JavaScript from the Asia region. A CDN rule fix resolves it. Internal monitoring had no way to catch this because all services were healthy — the issue was in the CDN's edge configuration.

Vector processes 2GB of logs daily, filtering out 60% as noise (health checks, debug logs) before they reach SigNoz. The S3 archive stores everything compressed at $0.50/month. Without Vector's filtering, SigNoz's ClickHouse storage would need 3x more disk.

Total monthly cost: $45 for a dedicated 8GB server running SigNoz, Gatus, and Vector, plus $29 for Checkly's starter plan (10 browser checks, unlimited API checks). Compared to Datadog's $25K/year quote, the team saves $23K annually while getting deeper visibility into their system.
