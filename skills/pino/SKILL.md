---
name: pino
description: >-
  Pino is a fast Node.js logger that writes structured JSON, one object per
  line. Use when a user asks to add structured logging, replace console.log,
  configure log levels, redact secrets from logs, log HTTP requests in Express
  or Fastify, pretty-print logs in development, or ship logs to Datadog, Loki
  or Elasticsearch.
license: Apache-2.0
compatibility: 'Node.js 20+ (pino 10 is tested on 20 and newer), Express, Fastify, Next.js'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/pinojs/pino
  tags:
    - pino
    - logging
    - nodejs
    - structured
    - observability
---

# Pino

## Overview

Pino (current major version 10.x) is a low-overhead Node.js logger. Every call writes one line of JSON with a numeric `level`, a millisecond `time`, `pid`, `hostname` and your `msg`, which log aggregators (Datadog, Loki, Elasticsearch, CloudWatch) can parse without extra rules. Pino keeps work in the hot path small: formatting, pretty-printing and shipping are meant to happen outside the request path, in a worker-thread transport or in a separate process that reads stdout.

Companion packages: `pino-http` (request logging middleware, Express/Koa/Connect style), `pino-pretty` (human-readable output for development), `pino-std-serializers` (bundled; serializes `err`, `req`, `res`). Fastify has Pino built in: `Fastify({ logger: true })`.

## Instructions

### Step 1: Install

```bash
npm install pino pino-http
npm install -D pino-pretty
```

### Step 2: Create one shared logger

```typescript
// lib/logger.ts
import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",       // fatal, error, warn, info, debug, trace, silent
  base: { service: "billing-api", version: process.env.npm_package_version },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.apiKey"],
  // JSON on stdout in production; pretty text only in development
  transport: isDev ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});
```

Usage: put the data object first, the message second.

```typescript
logger.info({ port: 3000 }, "Server listening");
logger.warn({ latencyMs: 2500, endpoint: "/api/reports" }, "Slow request");
logger.error({ err, invoiceId: "inv_2041" }, "Payment capture failed");   // key must be "err"
```

An `Error` under the key `err` is serialized with `type`, `message` and `stack`. Logging it under another key (`error`, `e`) prints `{}` unless you add a serializer.

### Step 3: Request logging with pino-http

```typescript
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";

const app = express();
app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, err) =>
      err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  }),
);

app.get("/orders/:id", (req, res) => {
  req.log.info({ orderId: req.params.id }, "Loading order");   // child logger bound to this request
  res.json({ id: req.params.id });
});
```

Every request gets an `id` and a completion line with `responseTime`. `req.log` already carries the request id, so use it inside handlers instead of the global logger.

### Step 4: Child loggers for context

```typescript
const jobLog = logger.child({ jobId: "job_7781", queue: "invoices" });
jobLog.info("Started");                               // jobId and queue appear on every line
jobLog.info({ rows: 420 }, "Imported");
// {"level":30,"time":1790983327750,"service":"billing-api","jobId":"job_7781","queue":"invoices","rows":420,"msg":"Imported"}
```

### Step 5: Levels as text, destinations, transports

- Numeric levels (30, 50) are the default. To print `"level":"info"`, use `formatters: { level: (label) => ({ level: label }) }`. This option cannot be combined with `transport.targets` (multiple targets): Pino throws `option.transport.targets do not allow custom level formatters`. Use a single `target` or map levels in your aggregator.
- Send logs to several places with `pino.transport({ targets: [...] })`:

```typescript
const transport = pino.transport({
  targets: [
    { target: "pino/file", level: "error", options: { destination: "./logs/errors.log", mkdir: true } },
    { target: "pino-pretty", level: "info", options: { colorize: false } },
  ],
});
const logger = pino(transport);
```

- Transports run in a worker thread. For production, the simplest and most robust setup is plain JSON on stdout (`pino.destination` for a file), collected by the platform (Docker, Kubernetes, systemd) or piped to a separate process.
- Check cost before building expensive log data: `if (logger.isLevelEnabled("debug")) { ... }`.

## Examples

### Example 1: Replace console.log in an Express API

User request: "Replace console.log with proper structured logging and make it quiet in tests."

Create `lib/logger.ts` as in Step 2 with `level: process.env.LOG_LEVEL ?? "info"`, mount `pinoHttp({ logger })`, replace `console.log("Started", port)` with `logger.info({ port }, "Started")`, and run tests with `LOG_LEVEL=silent npm test`.

Result in production: `{"level":30,"time":1790983316458,"service":"billing-api","port":3000,"msg":"Started"}`; during tests nothing is printed.

### Example 2: Keep secrets out of logs

User request: "Our request logs contain the Authorization header. Stop that."

```typescript
const logger = pino({
  redact: { paths: ["req.headers.authorization", "req.headers.cookie", "*.password"], censor: "[Redacted]" },
});
```

With `pino-http`, the logged request now shows `"authorization":"[Redacted]"`. Use `remove: true` inside the `redact` object to drop the keys entirely.

## Guidelines

- Log JSON in production, pretty text only in development; never ship `pino-pretty` output to an aggregator.
- Data first, message second; do not concatenate values into the message string.
- Use the key `err` for errors, and redact tokens, cookies and passwords with `redact`.
- Create the logger once and import it; create child loggers per request or job.
- Do not set `formatters.level` together with multi-target transports, and do not format timestamps in-process (it costs throughput); let the aggregator do it.
- Buffered destinations (`pino.destination({ sync: false })`) can lose the last lines on a hard crash; keep the default synchronous stdout unless you have measured a need.
- Log at the right level: `info` for business events, `debug` for development detail, `error` when someone should look.
