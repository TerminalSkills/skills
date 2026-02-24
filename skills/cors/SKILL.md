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
  version: 1.0.0
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

## Guidelines

- NEVER use `Access-Control-Allow-Origin: *` with `credentials: true` — browsers reject this.
- `*` origin is only safe for truly public APIs with no authentication.
- Always set `Access-Control-Max-Age` to cache preflight responses (reduces OPTIONS requests).
- CORS only applies to browser requests — server-to-server calls ignore CORS entirely.
- If using cookies across domains, also set `SameSite=None; Secure` on cookies.
