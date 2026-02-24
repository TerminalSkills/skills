---
name: api-versioning
description: >-
  Version REST and GraphQL APIs. Use when a user asks to version an API,
  handle breaking changes, implement API deprecation, manage multiple API
  versions, or design an API evolution strategy.
license: Apache-2.0
compatibility: 'Any language/framework'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - api
    - versioning
    - rest
    - deprecation
    - backwards-compatibility
---

# API Versioning

## Overview

APIs evolve, but breaking changes break clients. This skill covers versioning strategies (URL path, headers, query params), deprecation workflows, backwards-compatible changes, and migration patterns for REST and GraphQL APIs.

## Instructions

### Step 1: URL Path Versioning (Recommended)

```typescript
// routes/v1/projects.ts — Version 1 routes
import { Router } from 'express'

const v1Router = Router()

v1Router.get('/projects', async (req, res) => {
  const projects = await db.project.findMany()
  // V1 returns flat array
  res.json(projects)
})

// routes/v2/projects.ts — Version 2 with pagination
const v2Router = Router()

v2Router.get('/projects', async (req, res) => {
  const { cursor, limit = 20 } = req.query
  const projects = await db.project.findMany({
    take: Number(limit) + 1,
    cursor: cursor ? { id: String(cursor) } : undefined,
  })

  const hasMore = projects.length > Number(limit)
  if (hasMore) projects.pop()

  // V2 returns paginated envelope
  res.json({
    data: projects,
    pagination: {
      nextCursor: hasMore ? projects[projects.length - 1].id : null,
      hasMore,
    },
  })
})

// app.ts — Mount versions
app.use('/v1', v1Router)
app.use('/v2', v2Router)
```

### Step 2: Backwards-Compatible Changes

These changes are SAFE (no version bump needed):
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional query parameters
- Adding new enum values (if clients handle unknown values)

These changes REQUIRE a new version:
- Removing or renaming fields
- Changing field types
- Making optional fields required
- Changing response structure (array → object)
- Changing authentication scheme

```typescript
// Adding a field is backwards-compatible
// V1 response: { id, name, status }
// V1.1 response: { id, name, status, taskCount }  ← safe, old clients ignore new field

// Changing structure is BREAKING
// V1 response: [{ id, name }]
// V2 response: { data: [{ id, name }], pagination: {} }  ← new version required
```

### Step 3: Deprecation Headers

```typescript
// middleware/deprecation.ts — Warn clients about deprecated versions
export function deprecationMiddleware(version: string, sunsetDate: string) {
  return (req, res, next) => {
    res.set('Deprecation', 'true')
    res.set('Sunset', sunsetDate)                // RFC 8594
    res.set('Link', `</v2${req.path}>; rel="successor-version"`)
    console.log(`[DEPRECATION] ${req.method} /v${version}${req.path} from ${req.ip}`)
    next()
  }
}

// Usage
app.use('/v1', deprecationMiddleware('1', 'Sat, 01 Jun 2026 00:00:00 GMT'), v1Router)
```

### Step 4: API Changelog

```markdown
# API Changelog

## v2.0.0 (2025-03-01)
### Breaking Changes
- `GET /projects` now returns paginated response `{ data: [], pagination: {} }`
- Removed `GET /projects/all` (use pagination instead)

### Migration Guide
- Update response parsing to read `response.data` instead of `response` directly
- Implement cursor-based pagination for large datasets
- v1 sunset date: June 1, 2026

## v1.3.0 (2025-02-15)
### Added
- `taskCount` field in project responses
- `GET /projects/{id}/activity` endpoint
```

## Guidelines

- URL path versioning (`/v1/`, `/v2/`) is simplest and most widely adopted.
- Only create new major versions for breaking changes — everything else is additive.
- Keep old versions running for 6-12 months minimum after deprecation.
- Monitor old version usage — don't sunset until traffic is near zero.
- Document every breaking change with a migration guide.
- Consider API gateways (Kong, AWS API Gateway) for routing versions independently.
