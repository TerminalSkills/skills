---
name: pino
description: >-
  Log in Node.js with Pino. Use when a user asks to add structured logging,
  improve logging performance, configure log levels, format logs for
  production, or replace console.log with proper logging.
license: Apache-2.0
compatibility: 'Node.js 16+, Express, Fastify, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: observability
  tags:
    - pino
    - logging
    - nodejs
    - structured
    - observability
---

# Pino

## Overview

Pino is the fastest Node.js logger — 5x faster than Winston. It outputs structured JSON logs by default, making them parseable by log aggregators (Datadog, Loki, ELK). Async logging ensures logging never blocks the event loop.

## Instructions

### Step 1: Basic Setup

```typescript
// lib/logger.ts — Pino configuration
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }    // pretty-print in dev
    : undefined,                                                   // JSON in production
  formatters: {
    level: (label) => ({ level: label }),                         // "level": "info" not "level": 30
  },
  base: {
    service: 'api',
    version: process.env.npm_package_version,
  },
})

// Usage
logger.info('Server started')
logger.info({ port: 3000, env: 'production' }, 'Server listening')
logger.error({ err, userId: '123' }, 'Payment processing failed')
logger.warn({ latencyMs: 2500, endpoint: '/api/reports' }, 'Slow request detected')
```

### Step 2: Express Integration

```typescript
// server.ts — Request logging middleware
import express from 'express'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger'

const app = express()

app.use(pinoHttp({
  logger,
  autoLogging: true,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      userAgent: req.headers['user-agent'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}))
```

### Step 3: Child Loggers

```typescript
// Add context that persists across a request lifecycle
function createRequestLogger(req) {
  return logger.child({
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    userId: req.user?.id,
    ip: req.ip,
  })
}

// Every log from this logger includes requestId, userId, ip
const reqLogger = createRequestLogger(req)
reqLogger.info('Processing order')
reqLogger.info({ orderId: 'ord_123', amount: 99.99 }, 'Order created')
// Output: {"level":"info","requestId":"abc-123","userId":"user-456","orderId":"ord_123","amount":99.99,"msg":"Order created"}
```

## Guidelines

- Always use structured JSON logging in production — not string interpolation.
- Context first, message second: `logger.info({ orderId }, 'Order created')` not `logger.info('Order created for ' + orderId)`.
- Use child loggers to add request context (requestId, userId) that propagates to all logs.
- Pino's async mode (`pino({ transport })`) prevents logging from blocking the event loop.
- Use `pino-pretty` only in development — JSON logs are for machines, not humans.
