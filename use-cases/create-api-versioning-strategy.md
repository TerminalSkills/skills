---
title: "Create an API Versioning Strategy with AI"
slug: create-api-versioning-strategy
description: "Design and implement API versioning that lets you evolve your API without breaking existing client integrations."
skills: [coding-agent, api-tester, markdown-writer]
category: development
tags: [api-versioning, api-design, backward-compatibility, migration, rest-api]
---

# Create an API Versioning Strategy with AI

## The Problem

Your REST API has 30 active endpoints consumed by a mobile app, three partner integrations, and a public developer community. You need to redesign the user endpoint to support team-based accounts, but changing the response shape will break every existing client.

The last time you made a breaking change, you just updated the endpoint and emailed partners. Two integrations broke silently, one partner churned, and the mobile app crashed for users who had not updated. The team still argues about URL versioning versus header versioning, and nobody wants to maintain two complete copies of every controller.

The stakes are higher this time: 200 active API consumers, a mobile app that cannot force-update (half the users are on versions from six months ago), and partners whose integration code was written by contractors who are long gone.

## The Solution

Using the **coding-agent**, **api-tester**, and **markdown-writer** skills, the agent implements URL-path versioning with response transformers that keep business logic in one place, checks the contract of both versions with real HTTP requests, and writes migration documentation with code examples in three languages.

## Step-by-Step Walkthrough

### Step 1: Describe the API and the Breaking Change

Give the **coding-agent** the facts. It works best with a scoped task and the paths it may touch:

```text
Our Express REST API has 30 endpoints. Current base: /api/v1/
We need to introduce v2 of the user endpoints because we're adding
team-based accounts. The changes:
- GET /users/:id response adds a "teams" array and changes "plan" from
  string to object
- POST /users now requires an organizationId field
- GET /users/:id/settings is being split into /users/:id/preferences
  and /users/:id/notifications

Only touch src/routes, src/transformers and src/middleware. v1 behavior must
not change. We have ~200 active API consumers.
```

### Step 2: Design the Versioning Architecture

URL path versioning fits this team better than header versioning:

- The mobile app and CDN cache by URL, so two versions can never be mixed up in a cache.
- Partner integrations were written by developers who will not read a custom-header requirement.
- The version is visible in access logs, which is what you need later to see who is still on v1.

Routes define URL structure, controllers hold business logic (written once), and transformers shape the response per version:

```text
src/
  routes/
    v1/users.ts          # v1 URL patterns (unchanged)
    v2/users.ts          # v2 URL patterns (new)
  controllers/
    users.ts             # Shared business logic (version-agnostic)
  transformers/
    v1/user.ts           # Shapes response for v1 clients
    v2/user.ts           # Shapes response for v2 clients
  middleware/
    deprecate.ts         # Deprecation and Sunset headers for v1
```

A bug fixed in the user controller is fixed for both versions at once. Transformers only handle the difference between "plan as a string" (v1) and "plan as an object" (v2).

### Step 3: Implement the Versioning Layer

Response transformers do the shape-shifting:

```typescript
// transformers/v1/user.ts — keeps the old shape
export function transformUser(user: UserEntity) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.subscription.tier,  // Flat string: "pro"
  };
}

// transformers/v2/user.ts — new shape with teams
export function transformUser(user: UserEntity) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: {
      tier: user.subscription.tier,
      limits: user.subscription.limits,
      billing_cycle: user.subscription.billingCycle,
    },
    teams: user.teams.map(t => ({ id: t.id, name: t.name, role: t.role })),
  };
}
```

Every v1 response announces its retirement with the standard headers: `Deprecation` (RFC 9745, a Unix timestamp prefixed with `@` that says when the deprecation started), `Sunset` (RFC 8594, an HTTP date after which the endpoint may stop working), and `Link` relations pointing to the migration guide and the successor:

```typescript
// middleware/deprecate.ts
import type { Request, Response, NextFunction } from 'express';

const DEPRECATED_AT = Math.floor(Date.parse('2026-10-27T00:00:00Z') / 1000);
const SUNSET = new Date('2027-02-16T00:00:00Z').toUTCString(); // "Tue, 16 Feb 2027 00:00:00 GMT"

export function deprecateV1(req: Request, res: Response, next: NextFunction) {
  res.set('Deprecation', `@${DEPRECATED_AT}`);
  res.set('Sunset', SUNSET);
  res.append('Link', '</docs/api/migration-v1-to-v2>; rel="deprecation"; type="text/html"');
  res.append('Link', `</api/v2${req.path}>; rel="successor-version"`);
  next();
}
```

Routing is a few lines in `app.ts`. Pin the unversioned `/api` prefix to **v1**, not "latest": if it followed the newest version, the next breaking release would silently break every client that never added a version:

```typescript
const SUPPORTED = ['v1', 'v2'];

app.use('/api/v1', deprecateV1, v1Router);
app.use('/api/v2', v2Router);
app.use('/api', v1Router);                 // unversioned stays on v1 forever
app.use('/api/:version', (req, res, next) => {
  if (SUPPORTED.includes(req.params.version)) return next(); // known version, unknown path: plain 404
  res.status(400).json({ error: 'unsupported_version', supported: SUPPORTED }); // e.g. /api/v3
});
```

Splitting `/settings` into two resources has no single redirect target, so the v2 router answers the old path itself with a 404 that names both new URLs:

```typescript
// routes/v2/users.ts
v2Router.get('/users/:id/settings', (req, res) =>
  res.status(404).json({
    error: 'moved',
    use: [`/api/v2/users/${req.params.id}/preferences`, `/api/v2/users/${req.params.id}/notifications`],
  }));
```

Route order matters: Express matches in registration order, so the catch-all goes last.

### Step 4: Verify Both Versions With Real Requests

Unit tests on transformers are not enough; the headers and routing only exist on the wire. Ask the **api-tester** skill to run the contract against a locally started copy of the API (never production):

```text
Start the API on 127.0.0.1 and test it with curl:
- GET /api/v1/users/u_1: plan is a string, no "teams" key, and the response
  has Deprecation, Sunset and Link headers
- GET /api/v2/users/u_1: plan is an object with tier/limits/billing_cycle,
  "teams" is an array, no Sunset header
- POST /api/v1/users without organizationId: 201. POST /api/v2/users without it: 400
- GET /api/v2/users/u_1/settings: 404 with a body that names /preferences and /notifications
- GET /api/v3/users/u_1: 400 listing the supported versions
Report PASS/FAIL per check with status and latency.
```

A v1 check looks like this:

```console
$ curl -si http://127.0.0.1:$PORT/api/v1/users/u_1
HTTP/1.1 200 OK
Deprecation: @1793059200
Sunset: Tue, 16 Feb 2027 00:00:00 GMT
Link: </docs/api/migration-v1-to-v2>; rel="deprecation"; type="text/html"
Link: </api/v2/users/u_1>; rel="successor-version"
Content-Type: application/json; charset=utf-8

{"id":"u_1","plan":"pro"}
```

Keep these checks as a script in CI so a refactor cannot change v1 by accident.

### Step 5: Write Migration Documentation

Hand the **markdown-writer** skill the diff between the two transformers and ask for three documents:

- **Migration guide** (`docs/api/migration-v1-to-v2.md`): side-by-side response comparisons at field level, code in JavaScript, Python and cURL for every changed endpoint, and a checklist for migrating client code.
- **Changelog** (`docs/api/changelog-v2.md`): each breaking change with its rationale, non-breaking additions listed separately.
- **Sunset policy** (`docs/api/sunset-policy.md`): v1 is deprecated from 27 October 2026, sends `Deprecation` and `Sunset` headers immediately, and is removed on 16 February 2027. Include a support contact. Customer success shares this proactively instead of emailing after the fact.

The documentation is part of the strategy: a migration guide with working examples turns "help us migrate" tickets into "we migrated, just confirming" messages.

## Real-World Example

Kenji's team ships v2 alongside v1 on a Tuesday. Nothing breaks: v1 clients keep working exactly as before, now with sunset headers in every response. The migration guide goes to partners the same day.

Over the next months the v1 share in the access logs falls steadily, and in month three Kenji's team contacts the remaining v1 consumers directly with migration help. The partner who churned after the last breaking change finds the guide, follows the examples, and migrates in an afternoon. The mobile app ships a v2 update that coexists with the old one: old app versions hit v1, updated ones hit v2.

When v1 traffic is close to zero, the team deletes v1 routes, transformers and tests in one small change. The transformer pattern, the headers middleware and the migration guide template stay for the next breaking change.

## Related Skills

- [coding-agent](../skills/coding-agent/) -- delegates a scoped implementation task with explicit file boundaries
- [api-tester](../skills/api-tester/) -- checks both versions with real HTTP requests
- [markdown-writer](../skills/markdown-writer/) -- writes the migration guide, changelog and sunset policy
