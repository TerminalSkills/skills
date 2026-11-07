---
title: "Set Up Automated API Mocking for Frontend Development with AI"
slug: set-up-automated-api-mocking
description: "Use AI to generate mock API servers from OpenAPI specs, seed them with realistic data, and keep mocks in sync with backend changes."
skills: [api-tester, coding-agent, test-generator]
category: development
tags: [api-mocking, frontend, openapi, development-workflow, testing]
---

# Set Up Automated API Mocking for Frontend Development with AI

## The Problem

Priya leads a frontend team of three at a 20-person SaaS startup. They depend on a backend API that is half-built. Endpoints change weekly, new fields appear without warning, and the backend team is in a different timezone, so by the time the frontend team starts work the backend team is wrapping up.

The result: two hours every morning spent figuring out which endpoints work, which are broken, and what the response shapes look like today. Developers hardcode fake data in components (`const user = { name: "Test User" }`), which renders fine in development and breaks the moment it meets real API data. Integration bugs pile up at the end of every sprint because the frontend was built against imaginary data, not the actual contract: 14 at merge time last sprint, 11 the sprint before.

## The Solution

Use **api-tester** to compare the OpenAPI spec with what the live backend returns. Have the **coding-agent** generate typed mock handlers from the spec with realistic seed data. Use **test-generator** to write tests that fail when the mocks and the spec disagree, and re-run them whenever the spec changes.

The stack: [MSW](https://mswjs.io) (Mock Service Worker) for the mocks, [openapi-typescript](https://openapi-ts.dev) to turn the spec into TypeScript types, and [openapi-msw](https://github.com/christoph-fricke/openapi-msw) to make MSW handlers type-checked against those types. Note that MSW 3 (current) requires Node.js 22 or newer and moved `http` and `HttpResponse` to `msw/http`.

## Step-by-Step Walkthrough

### Step 1: Validate the OpenAPI Spec Against Reality

The spec is supposed to be the single source of truth. In practice it drifts: fields get added without updating it, and endpoints that are not built yet still appear as available.

```text
Download the OpenAPI spec from https://api.internal.dev/docs/openapi.json. Flag any endpoint missing a response schema and any field without a type. Then call each GET endpoint once against the staging API with curl (--max-time 30, token from $API_TOKEN, never production) and compare the real response keys with the schema.
```

The agent reports the drift:

| Endpoint | Issue |
|---|---|
| `GET /api/projects` | Undocumented field: `archived_at` (string, nullable) |
| `GET /api/users/:id` | Undocumented field: `avatar_url` (string) |
| `GET /api/tasks` | Undocumented field: `priority` (integer) |
| `GET /api/reports/burndown` | Returns 501, not implemented yet |

Now the frontend team knows which fields exist in reality and which only on paper. Fix the spec first (or ask the backend team to), because everything below is generated from it.

### Step 2: Generate Types and Typed Mock Handlers

```bash
npm install --save-dev msw openapi-typescript openapi-msw typescript@5
npx openapi-typescript https://api.internal.dev/docs/openapi.json -o mocks/api.d.ts
```

`openapi-typescript` 7 requires TypeScript 5, so keep `typescript@5` in the project until its peer range allows 6 or 7. Then ask the **coding-agent**:

```text
Using mocks/api.d.ts, write MSW handlers in mocks/handlers/ for every endpoint in the spec with openapi-msw (createOpenApiHttp<paths>). Seed each collection with 20 realistic records (real-sounding project names, full-sentence task descriptions, UUIDs, ISO dates). Include edge cases: one user with a 47-character name, one project with zero tasks, nullable fields set to null. Support pagination and filtering query params. Stub the 501 endpoints with a 501 response.
```

The generated handler for one endpoint looks like this:

```typescript
// mocks/handlers/tasks.ts
import { createOpenApiHttp } from "openapi-msw";
import type { paths } from "../api.d.ts";
import { tasks } from "../seed/tasks.ts";

const http = createOpenApiHttp<paths>({ baseUrl: "https://api.internal.dev" });

export const taskHandlers = [
  http.get("/api/tasks", ({ response }) =>
    response(200).json({ items: tasks.slice(0, 20) }),
  ),
];
```

Because the response type comes from the spec, a handler that returns a wrong shape is a compile error, not a runtime surprise. Run `npx tsc --noEmit` after every change.

### Step 3: Wire the Mock Server into Development

Set up three entry points:

- **Browser dev server:** `import { setupWorker } from "msw/browser"`, and run `npx msw init public/` once to put `mockServiceWorker.js` in your static directory. Start the worker before rendering, only when `NEXT_PUBLIC_API_MOCKING=true` (or your framework's equivalent), so switching between mock and real API is a one-line env change.
- **Tests and server-side rendering:** `import { setupServer } from "msw/node"` and call `server.listen()`.
- **Storybook:** `msw-storybook-addon` registers the same handlers per story.

```text
Configure the app to start the MSW worker in development when NEXT_PUBLIC_API_MOCKING=true, add the node server for the test setup file, and register the handlers in Storybook with msw-storybook-addon.
```

A quick check from the node side proves the wiring (this run returned the seeded task):

```console
$ node --experimental-strip-types run.ts
200 {"items":[{"id":"t_1","title":"Write release notes","priority":2}]}
```

The mock server always works and always returns the right shapes. Developers flip the env var when they need to verify something against the real backend.

### Step 4: Generate Contract Tests

Mocks drift from reality the same way specs do, unless something enforces the contract. Two checks do the job:

1. **Type check (compile time).** When the spec changes, regenerate `mocks/api.d.ts` and run `tsc --noEmit`. If the backend renamed `priority` to `urgency`, the handler no longer compiles and the error names the field:

   ```console
   mocks/handlers.ts(8,77): error TS2353: Object literal may only specify known properties, and 'priority' does not exist in type '{ id: string; title: string; urgency: number; }'.
   ```

2. **Runtime tests.** Ask **test-generator** for Vitest tests that exercise the mock server through `fetch`:

   ```text
   Write Vitest tests in tests/contracts/ that start the msw/node server and, for every endpoint in the spec, check the status code, that the required fields exist with the right types, and that list endpoints honor page and limit. Use the spec as the source of truth, not the handler code.
   ```

Run both in CI on every PR, against the spec downloaded from the backend repo or the staging URL.

### Step 5: Auto-Update Mocks When the Spec Changes

A daily CI job regenerates the types from the latest spec and lets git and the compiler show what changed:

```bash
npx openapi-typescript "$OPENAPI_URL" -o mocks/api.d.ts
git diff --stat mocks/api.d.ts       # what changed in the contract
npx tsc --noEmit                      # which handlers no longer match
```

- **Added fields:** the job asks the coding-agent to add them to handlers and seed data, choosing values by field name and type (an `avatar_url` gets image URLs, not random strings), and opens a PR.
- **Removed or renamed fields, type changes:** the compiler fails and the job posts the error to the team's channel. A removed field may mean a component has to change, and that should not happen silently.

Commit the regenerated `api.d.ts` with each sync so the next diff shows only incremental changes.

## Real-World Example

Priya's team notices the difference in the first week. On Monday everyone starts building immediately against the mock server. A developer finishes the project list component on Tuesday, confident about the data shape because the handler is type-checked against the validated spec.

On Thursday the daily sync catches a change: the backend team formalized the `priority` field on tasks. The types regenerate, the compiler flags the task handler, and the agent opens a PR updating the handler and seed data. After a month, the team counts integration bugs at merge time again: the data-shape bugs are gone, and what is left is business logic that needs human judgment.

## Related Skills

- [api-tester](../skills/api-tester/) -- compares the spec with real responses from the staging API
- [coding-agent](../skills/coding-agent/) -- generates typed handlers and seed data from the spec
- [test-generator](../skills/test-generator/) -- writes the Vitest contract tests
