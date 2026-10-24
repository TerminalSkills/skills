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
  version: 1.1.0
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
    orderBy: { id: 'asc' },                    // cursor paging needs a stable order
    ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),  // skip the cursor row itself
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
import type { Request, Response, NextFunction } from 'express'

// Deprecation (RFC 9745): "@" + Unix seconds of the date it was deprecated
// Sunset (RFC 8594): HTTP-date after which the endpoint may stop working
export function deprecationMiddleware(version: string, deprecatedAtUnix: number, sunsetDate: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Deprecation', `@${deprecatedAtUnix}`)
    res.set('Sunset', sunsetDate)
    res.set('Link', [
      `<https://api.shopline.dev/docs/migrate-v1-to-v2>; rel="deprecation"; type="text/html"`,
      `</v2${req.path}>; rel="successor-version"`,
    ].join(', '))
    console.log(`[DEPRECATION] ${req.method} /v${version}${req.path} from ${req.ip}`)
    next()
  }
}

// v1 deprecated 2026-09-01 00:00 UTC, sunset 2027-03-01
app.use('/v1', deprecationMiddleware('1', 1788220800, 'Mon, 01 Mar 2027 00:00:00 GMT'), v1Router)
```

### Step 4: API Changelog

```markdown
# API Changelog

## v2.0.0 (2026-09-01)
### Breaking Changes
- `GET /projects` now returns paginated response `{ data: [], pagination: {} }`
- Removed `GET /projects/all` (use pagination instead)

### Migration Guide
- Update response parsing to read `response.data` instead of `response` directly
- Implement cursor-based pagination for large datasets
- v1 sunset date: March 1, 2027

## v1.3.0 (2026-08-15)
### Added
- `taskCount` field in project responses
- `GET /projects/{id}/activity` endpoint
```

### Step 5: GraphQL

GraphQL APIs usually evolve one schema without version numbers: add fields and types freely, mark old ones with the `@deprecated(reason: "...")` directive (valid on fields and enum values, and on arguments and input fields), watch field-level usage in your server's metrics, and remove a field only when it is no longer queried.

```graphql
type Project {
  id: ID!
  name: String!
  status: String @deprecated(reason: "Use state, which has a fixed set of values.")
  state: ProjectState!
}
```

## Examples

### Example 1: Add pagination without breaking existing clients

**User request:** "Our GET /projects returns a bare array and we need pagination. Mobile apps still use it."

The agent keeps `/v1/projects` untouched, adds `/v2/projects` with the `{ data, pagination }` envelope from Step 1, and mounts the deprecation middleware on `/v1`. A request such as `curl -i https://api.shopline.dev/v1/projects` then returns the old body plus `Deprecation: @1788220800`, `Sunset: Mon, 01 Mar 2027 00:00:00 GMT` and a `Link` header pointing to the v2 path.

### Example 2: Rename a GraphQL field

**User request:** "Rename Project.status to Project.state in our GraphQL schema."

The agent adds `state`, marks `status` with `@deprecated(reason: "Use state")`, keeps both resolvers returning the same value, and checks field usage in the server's metrics. It removes `status` only after no client queries it.

## Guidelines

- URL path versioning (`/v1/`, `/v2/`) is simplest and most widely adopted.
- Only create new major versions for breaking changes — everything else is additive.
- Keep old versions running for 6-12 months minimum after deprecation.
- Monitor old version usage — don't sunset until traffic is near zero.
- Document every breaking change with a migration guide.
- Consider API gateways (Kong, AWS API Gateway) for routing versions independently.
- Set `Deprecation` as `@` followed by Unix seconds, such as `@1788220800` (RFC 9745); the old `Deprecation: true` form came from a draft and is not the standard.
- Header-based versioning (`Accept: application/vnd.shopline.v2+json` or a custom `API-Version` header) keeps URLs stable but is harder to test in a browser and to cache; set `Vary` on the header you use.
