---
name: msw
description: >-
  Intercepts network requests to mock REST, GraphQL, SSE and WebSocket APIs with Mock Service Worker (MSW). Use when mocking APIs for unit tests, integration tests, Storybook or local development without changing application code or running a mock server. Trigger words: msw, mock service worker, api mocking, request handlers, setupServer, setupWorker.
license: Apache-2.0
compatibility: "Node.js 22.12+ (MSW 3, ESM-only); MSW 2.x for Node 18/20 or CommonJS"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags: ["msw", "testing", "api-mocking", "rest", "graphql"]
  repository: https://github.com/mswjs/msw
---

# MSW (Mock Service Worker)

## Overview

MSW intercepts requests at the network level: through a service worker in the browser and through request interception in Node.js. The same handlers serve tests, Storybook and local development, and they work with any client (fetch, axios, Apollo) without touching application code. Current release is 3.0 (September 2026). It is ESM-only, needs Node.js 22.12+ and TypeScript 5.9+, and changed several APIs from 2.x. Check `npm ls msw` first: the examples below are 3.x, and the 2.x differences are listed in Guidelines.

## Instructions

- Install with `npm install msw --save-dev`. Install `graphql` too if you mock GraphQL (it is now an optional peer dependency).
- Define REST handlers with `http.get()`, `http.post()` and so on, imported from `msw/http` (the `msw` root still re-exports `http`, `HttpResponse` and `delay`). Return `HttpResponse.json(body, { status })`. In Node.js use absolute URLs; relative ones only resolve in the browser.
- Define GraphQL handlers from a link: `const api = graphql.link('https://api.shopwave.dev/graphql')`, then `api.query('GetPosts', resolver)` and `api.mutation('CreatePost', resolver)`. `graphql` comes from `msw/graphql`; the 2.x form `graphql.query(...)` no longer exists.
- In Node.js tests, create `setupServer(...handlers)` from `msw/node`. Call `server.listen()` in `beforeAll`, `server.resetHandlers()` in `afterEach`, `server.close()` in `afterAll`. `listen({ onUnhandledFrame: 'error' })` fails tests on any request without a handler (default is `'warn'`; `'bypass'` is silent). This option was called `onUnhandledRequest` in 2.x.
- In the browser, create `setupWorker(...handlers)` from `msw/browser` and run `npx msw init ./public --save` once to copy `mockServiceWorker.js`. Start it with `await worker.start()` before rendering the app, only in development.
- With Vite, the `msw/vite` plugin serves the worker script itself: add `msw()` (`import { msw } from 'msw/vite'`) to `plugins`, then in `src/main.ts` call `const { network } = await import('virtual:msw'); network.configure({ handlers }); await network.enable()` inside `if (import.meta.env.DEV)`. It works for SSR too and is left out of production builds.
- GraphQL subscriptions are mocked with `api.subscription('OnCreateMessage', ({ subscription }) => subscription.publish({ data }))`; failed WebSocket connections emit `websocket:error`.
- Override per test with `server.use(...)`; `resetHandlers()` removes the overrides again.
- Simulate problems with `await delay(300)` (from `msw/utils/delay` or `msw`), `HttpResponse.error()` for a network failure, and non-2xx statuses for server errors.
- Observe traffic without changing it: `server.events.on('request:start', ({ request }) => console.log(request.method, request.url))`.

## Examples

### Example 1: Mock a REST API for Vitest component tests

**User request:** "Mock my users API in Vitest so the list page can be tested with happy and error paths"

```ts
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw/http'

export const handlers = [
  http.get('http://localhost:3000/api/users', () =>
    HttpResponse.json([{ id: 'u_101', name: 'Maya Chen' }, { id: 'u_102', name: 'Dmitri Volkov' }]),
  ),
  http.post('http://localhost:3000/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ id: 'u_103', ...body }, { status: 201 })
  }),
]
```

```ts
// src/mocks/node.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'
export const server = setupServer(...handlers)

// vitest.setup.ts (listed under setupFiles in vitest.config.ts)
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './src/mocks/node'
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

In the error-state test, add `server.use(http.get('http://localhost:3000/api/users', () => HttpResponse.json(null, { status: 500 })))` before rendering.

**Result:** `npx vitest run` passes; the happy-path test sees two users, the error test sees the 500, and an accidental call to an unmocked URL fails with `[MSW] Error: intercepted a request without a matching request handler`.

### Example 2: Mock a GraphQL API during local development

**User request:** "Run my Vite app against a fake GraphQL backend with a loading delay"

```ts
// src/mocks/handlers.ts
import { HttpResponse } from 'msw/http'
import { graphql } from 'msw/graphql'
import { delay } from 'msw/utils/delay'

const api = graphql.link('https://api.shopwave.dev/graphql')

export const handlers = [
  api.query('GetPosts', async () => {
    await delay(300)
    return HttpResponse.json({ data: { posts: [{ id: 1, title: 'Launch notes' }] } })
  }),
  api.mutation('CreatePost', ({ variables }) =>
    HttpResponse.json({ data: { createPost: { id: 2, title: variables.title } } }),
  ),
]
```

Add `msw()` from `msw/vite` to `vite.config.ts`, then enable the network in `src/main.ts` as described above and run `npm run dev`.

**Result:** The browser console prints `[MSW] Mocking enabled.`, and `GetPosts` and `CreatePost` calls appear in DevTools with a 300 ms delay on the query.

## Guidelines

- Migrating from 2.x: `msw/native` is gone; `worker.stop()` returns a Promise; `graphql.query` became `graphql.link(url).query`; `onUnhandledRequest` became `onUnhandledFrame`; the WebSocket `connection` event is `websocket:connection`; `LifeCycleEventsMap` is replaced by `HttpNetworkFrameEventMap` and `WebSocketNetworkFrameEventMap` from `msw/experimental`; `handleRequest` is replaced by `getResponse(handlers, request)`; `bypass`, `passthrough` and `delay` now live in `msw/utils/*`.
- A CommonJS project or Node 18/20 must stay on `msw@2`; do not mix imports between versions.
- Keep shared happy-path handlers in `src/mocks/handlers.ts`, error states in `server.use()` inside the test.
- Prefer asserting on what the UI shows rather than on the requests the mock received.
- Never enable the worker in production builds; do not commit a stale `mockServiceWorker.js` (re-run `npx msw init` after upgrading, or use the Vite plugin).
- Mock only what the test needs: every `server.listen()` call without `resetHandlers()` leaks overrides between tests.
