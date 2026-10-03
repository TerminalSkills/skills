---
name: cors
description: >-
  Configure CORS for web APIs. Use when a user asks to fix CORS errors, allow
  cross-origin requests, configure CORS headers, handle preflight requests,
  or secure API access from different domains.
license: Apache-2.0
compatibility: 'Express, Fastify, Next.js, any HTTP server'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - cors
    - security
    - headers
    - api
    - browser
---

# CORS (Cross-Origin Resource Sharing)

## Overview

CORS controls which websites can call your API from a browser. Without proper CORS headers, browsers block cross-origin requests. Misconfigured CORS is either too restrictive (breaks your frontend) or too permissive (security risk). This skill covers correct configuration for common setups.

## Instructions

### Step 1: Express

```typescript
// server.ts — CORS configuration for Express
import cors from 'cors'
import express from 'express'

const app = express()

// Production: whitelist specific origins
const allowedOrigins = [
  'https://myapp.com',
  'https://admin.myapp.com',
  process.env.NODE_ENV === 'development' && 'http://localhost:3000',
].filter(Boolean) as string[]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
  credentials: true,                    // allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,                         // cache preflight for 24h
}))
```

### Step 2: Next.js API Routes

```typescript
// next.config.ts — CORS via Next.js headers
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://myapp.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ]
  },
}
```

### Step 3: Manual Headers (Any Framework)

```typescript
// middleware.ts — Manual CORS for any HTTP server
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin
  const allowed = ['https://myapp.com', 'https://admin.myapp.com']

  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }

  // Handle preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(204).end()
  }

  next()
}
```

## Examples

### Example 1: "Our React app on app.billing-portal.io gets blocked calling our Express API"

Add the Express middleware from Step 1 with `app.billing-portal.io` in `allowedOrigins`, keep `credentials: true` since the app sends an auth cookie, and confirm the browser's preflight `OPTIONS` request now returns `204` with the right `Access-Control-Allow-*` headers (check the Network tab, not just the follow-up GET/POST).

### Example 2: "A Next.js API route works in Postman but not from the browser"

Postman does not send an `Origin` header, so it skips CORS entirely — that it works there proves nothing about the browser case. Use the `next.config.ts` `headers()` block from Step 2 if one static origin is always correct; `headers()` values are fixed per build, like `vercel.json`, so if the allowed origin needs to vary per request (a whitelist, a wildcard subdomain), set the headers in middleware instead, mirroring Step 3.

## Guidelines

- NEVER use `Access-Control-Allow-Origin: *` with `credentials: true` — browsers reject this combination outright.
- `*` origin is only safe for truly public APIs with no authentication and no cookies.
- Always set `Access-Control-Max-Age` to cache preflight responses (reduces repeat `OPTIONS` requests).
- CORS is enforced by the browser, not the server — server-to-server calls, curl and Postman ignore it, so testing from those tools cannot confirm a browser-facing fix.
- If using cookies across domains, also set `SameSite=None; Secure` on the cookie, and `credentials: true`/`Access-Control-Allow-Credentials: true` on both sides.
- `next.config.js`/`next.config.ts` `headers()` values are static at build time; use middleware when the allowed origin must be computed per request.
