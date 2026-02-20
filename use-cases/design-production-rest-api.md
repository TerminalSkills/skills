---
title: Design a Production-Ready REST API
slug: design-production-rest-api
description: >-
  Design and implement a REST API with OpenAPI spec, proper versioning,
  webhook security, CORS configuration, rate limiting, and comprehensive
  error handling. From spec to production.
skills:
  - openapi-spec
  - api-versioning
  - webhook-security
  - cors
  - api-rate-limiting
category: api
tags:
  - api-design
  - rest
  - production
  - security
  - best-practices
---

# Design a Production-Ready REST API

Tomás is building the API for a B2B SaaS product — a project management tool that other companies will integrate with. The API needs to be rock-solid: versioned so existing integrations don't break, rate-limited so no single client overwhelms the system, secured with proper CORS and webhook verification, and documented well enough that third-party developers can integrate without asking for help.

## Step 1: API Specification First

Before writing any code, Tomás defines the API contract in OpenAPI. This becomes the single source of truth — documentation, client SDKs, and mock servers all generate from it.

```yaml
# openapi.yaml — The API contract
openapi: 3.1.0
info:
  title: TaskFlow API
  version: 2.0.0
  description: Project management API for TaskFlow integrations
  contact:
    email: api@taskflow.dev
  license:
    name: Apache 2.0

servers:
  - url: https://api.taskflow.dev/v2
    description: Production

security:
  - apiKey: []

paths:
  /projects:
    get:
      operationId: listProjects
      summary: List projects accessible to the authenticated user
      parameters:
        - $ref: '#/components/parameters/PageCursor'
        - $ref: '#/components/parameters/PageLimit'
        - name: status
          in: query
          schema:
            type: string
            enum: [active, archived]
      responses:
        '200':
          description: Paginated project list
          headers:
            X-RateLimit-Limit:
              schema: { type: integer }
            X-RateLimit-Remaining:
              schema: { type: integer }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectList'
        '429':
          $ref: '#/components/responses/RateLimitExceeded'

  /webhooks:
    post:
      operationId: createWebhook
      summary: Register a webhook endpoint
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [url, events]
              properties:
                url:
                  type: string
                  format: uri
                events:
                  type: array
                  items:
                    type: string
                    enum: [project.created, task.completed, comment.added]
                secret:
                  type: string
                  description: HMAC secret for verifying webhook payloads
      responses:
        '201':
          description: Webhook registered

components:
  parameters:
    PageCursor:
      name: cursor
      in: query
      schema: { type: string }
    PageLimit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }

  schemas:
    ProjectList:
      type: object
      properties:
        data:
          type: array
          items:
            $ref: '#/components/schemas/Project'
        pagination:
          $ref: '#/components/schemas/Pagination'

    Project:
      type: object
      required: [id, name, status, createdAt]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        description: { type: string, nullable: true }
        status: { type: string, enum: [active, archived] }
        taskCount: { type: integer }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    Pagination:
      type: object
      properties:
        nextCursor: { type: string, nullable: true }
        hasMore: { type: boolean }

  responses:
    RateLimitExceeded:
      description: Rate limit exceeded
      headers:
        Retry-After:
          schema: { type: integer }
      content:
        application/json:
          schema:
            type: object
            properties:
              error: { type: string, example: "Rate limit exceeded" }
              retryAfter: { type: integer }

  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key
```

Tomás runs `npx @redocly/cli lint openapi.yaml` to validate the spec, then `npx @redocly/cli preview-docs openapi.yaml` to preview the documentation. The spec is committed to the repo and updated alongside code changes.

## Step 2: Versioned Route Structure

The API is versioned via URL path. V1 continues to work for existing clients while V2 introduces pagination and new response formats.

```typescript
// server.ts — Versioned API structure
import express from 'express'
import { corsMiddleware } from './middleware/cors'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { authMiddleware } from './middleware/auth'
import { deprecationMiddleware } from './middleware/deprecation'
import v1Router from './routes/v1'
import v2Router from './routes/v2'

const app = express()

// Global middleware
app.use(express.json({ limit: '1mb' }))
app.use(corsMiddleware)

// V1 — deprecated, sunset June 2026
app.use('/v1', deprecationMiddleware('2026-06-01'), authMiddleware, rateLimitMiddleware, v1Router)

// V2 — current
app.use('/v2', authMiddleware, rateLimitMiddleware, v2Router)

// Webhook receiver (no auth — verified by signature)
app.use('/webhooks', webhookRouter)
```

```typescript
// middleware/deprecation.ts — Warn V1 clients
export function deprecationMiddleware(sunsetDate: string) {
  return (req, res, next) => {
    res.set('Deprecation', 'true')
    res.set('Sunset', new Date(sunsetDate).toUTCString())
    res.set('Link', `</v2${req.path}>; rel="successor-version"`)

    // Log V1 usage for tracking migration progress
    console.log(`[V1-DEPRECATION] ${req.method} ${req.path} apiKey=${req.apiKeyId}`)
    next()
  }
}
```

## Step 3: Rate Limiting by Plan

```typescript
// middleware/rateLimit.ts — Per-plan rate limiting
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

const PLAN_LIMITS = {
  free:       { rpm: 60,   daily: 1000 },
  startup:    { rpm: 300,  daily: 10000 },
  business:   { rpm: 1000, daily: 50000 },
  enterprise: { rpm: 5000, daily: 500000 },
}

export async function rateLimitMiddleware(req, res, next) {
  const plan = req.apiKey?.plan || 'free'
  const limits = PLAN_LIMITS[plan]
  const keyId = req.apiKey?.id || req.ip

  // Check per-minute limit
  const minuteKey = `rl:${keyId}:${Math.floor(Date.now() / 60000)}`
  const minuteCount = await redis.incr(minuteKey)
  if (minuteCount === 1) await redis.expire(minuteKey, 120)

  // Check daily limit
  const dayKey = `rl:daily:${keyId}:${new Date().toISOString().slice(0, 10)}`
  const dailyCount = await redis.incr(dayKey)
  if (dailyCount === 1) await redis.expire(dayKey, 90000)

  res.set('X-RateLimit-Limit', String(limits.rpm))
  res.set('X-RateLimit-Remaining', String(Math.max(0, limits.rpm - minuteCount)))
  res.set('X-RateLimit-Reset', String(Math.ceil(Date.now() / 60000) * 60))
  res.set('X-Daily-Limit', String(limits.daily))
  res.set('X-Daily-Remaining', String(Math.max(0, limits.daily - dailyCount)))

  if (minuteCount > limits.rpm) {
    res.set('Retry-After', '60')
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: limits.rpm,
      retryAfter: 60,
      upgradeUrl: plan !== 'enterprise' ? 'https://taskflow.dev/pricing' : undefined,
    })
  }

  if (dailyCount > limits.daily) {
    return res.status(429).json({
      error: 'Daily quota exceeded',
      dailyLimit: limits.daily,
      resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    })
  }

  next()
}
```

## Step 4: Webhook Delivery

When a project is created or a task is completed, TaskFlow sends webhook events to registered endpoints — signed with HMAC for security.

```typescript
// services/webhookDelivery.ts — Reliable webhook delivery
import crypto from 'crypto'

interface WebhookEndpoint {
  url: string
  secret: string
  events: string[]
}

export async function deliverWebhook(
  endpoint: WebhookEndpoint,
  event: string,
  payload: object
) {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  })

  // Sign the payload
  const signature = crypto
    .createHmac('sha256', endpoint.secret)
    .update(body)
    .digest('hex')

  // Attempt delivery with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TaskFlow-Signature': `sha256=${signature}`,
          'X-TaskFlow-Event': event,
          'X-TaskFlow-Delivery': crypto.randomUUID(),
        },
        body,
        signal: AbortSignal.timeout(10000),    // 10s timeout
      })

      if (res.ok) {
        console.log(`Webhook delivered: ${event} → ${endpoint.url}`)
        return
      }

      if (res.status < 500) return    // client error, don't retry
    } catch (err) {
      console.error(`Webhook attempt ${attempt + 1} failed: ${err.message}`)
    }

    // Exponential backoff: 1s, 4s, 16s
    await new Promise(r => setTimeout(r, Math.pow(4, attempt) * 1000))
  }

  // After 3 failures, disable the endpoint
  console.error(`Webhook endpoint disabled after 3 failures: ${endpoint.url}`)
  await db.webhook.update({
    where: { url: endpoint.url },
    data: { active: false, disabledReason: 'consecutive_failures' },
  })
}
```

## Step 5: Error Handling

```typescript
// middleware/errorHandler.ts — Consistent error responses
export function errorHandler(err, req, res, next) {
  // Known application errors
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(422).json({
      error: 'Validation failed',
      details: err.details,
      requestId: req.id,
    })
  }

  if (err.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: err.message || 'Resource not found',
      requestId: req.id,
    })
  }

  if (err.code === 'FORBIDDEN') {
    return res.status(403).json({
      error: 'Insufficient permissions',
      required: err.requiredPermission,
      requestId: req.id,
    })
  }

  // Unknown errors — don't leak internals
  console.error(`[ERROR] ${req.method} ${req.path}`, err)
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
  })
}
```

## Results

The API launches with documentation auto-generated from the OpenAPI spec, hosted at docs.taskflow.dev. Third-party developers integrate using generated TypeScript SDKs — zero support tickets about response formats or authentication. Rate limiting catches a misbehaving integration early (infinite retry loop) before it impacts other clients. The deprecation headers on V1 give existing users 6 months to migrate, with clear logs showing who still needs to move. Within the first month, 12 companies integrate via the API, and the webhook system delivers 50,000 events with a 99.7% success rate.
