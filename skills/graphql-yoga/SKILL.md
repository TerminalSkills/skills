---
name: graphql-yoga
description: >-
  GraphQL Yoga is a fully featured GraphQL server from The Guild that runs on
  any JavaScript runtime (Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda).
  Use this skill when asked to build a GraphQL API with graphql-yoga, add
  subscriptions, file uploads, response caching, depth limits, rate limiting or
  error masking, or move from Apollo Server to Yoga and Envelop plugins.
license: Apache-2.0
compatibility: "Node.js 22.15+ (or Bun, Deno, Workers); graphql-yoga v6 with graphql 16 or 17"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  repository: https://github.com/graphql-hive/graphql-yoga
  tags: "graphql, server, api, typescript, envelop"
---

# GraphQL Yoga

## Overview

GraphQL Yoga (v6, `graphql-yoga@6.0.1`; requires Node >=22.15 and graphql ^16 or ^17) is a spec-compliant GraphQL server built on the WHATWG Fetch API, so the same `yoga` object works as a Node `http` handler, a Fetch handler (`yoga.fetch`) in Workers, Bun and Deno, or behind Express, Fastify and Next.js. It is extended with Envelop plugins. It ships with request-scoped logging, GraphQL over SSE subscriptions, multipart file uploads, CORS, GraphiQL and error masking; you add caching, rate limiting and depth limits as plugins. Schemas can be written with `createSchema` (SDL plus resolvers) or with code-first builders such as Pothos.

## Instructions

1. Install: `npm install graphql-yoga graphql` (Node 22.15 or newer; graphql 15 is no longer supported).
2. Build the schema with `createSchema({ typeDefs, resolvers })`, pass it to `createYoga`, and hand the result to `createServer` from `node:http`. The endpoint defaults to `/graphql`; change it with `graphqlEndpoint`.
3. Per-request state (database handle, current user) goes in the `context` option, which receives `{ request }` (a Fetch `Request`) plus runtime-specific fields such as `req`/`res` on Node.
4. Subscriptions: use `createPubSub()` exported by `graphql-yoga`; `pubSub.publish(topic, payload)` and `pubSub.subscribe(topic)` (an async iterable). Clients connect over SSE by default; no WebSocket server is needed. For several instances, back the pub/sub with Redis using `@graphql-yoga/redis-event-target`.
5. File uploads: declare `scalar File` in the schema and accept `File!` arguments. The value is a standard `File`/`Blob` (`.text()`, `.arrayBuffer()`, `.stream()`). Multipart parsing is on by default; `multipart: false` turns it off.
6. Errors: Yoga masks unexpected errors by default. Throw `GraphQLError` (from `graphql`) with `extensions.code` for errors clients should see. `maskedErrors: false` disables masking (development only). With `NODE_ENV=development` the original error appears in `extensions.originalError`.
7. Logging (new in v6): every request gets a logger on `context.log` (and `serverContext.log` in plugin hooks) tagged with a `requestId`, and Yoga logs one "Request processed" line per request at `info`. The id comes from the host (e.g. Fastify), else the `x-request-id` request header, else a generated one, and is returned in the `x-request-id` response header. Set `requestId: { trustHeader: false }` when clients reach the server directly, `requestId: false` to turn it off, and `logging: false | LogLevel | new Logger({ level: 'debug' })` (`Logger` is re-exported from `graphql-yoga`, backed by `@graphql-hive/logger`) to control output. The old `createLogger` and `yoga.logger` are gone: use `new Logger(...)` and `yoga.log`.
8. Request bodies are capped at 25,000,000 bytes by default (`maxRequestBodySize`; larger bodies get 413; `false` disables it). Because of the cap `yoga.fetch()` may return a Promise: always `await` it.
9. GraphiQL is enabled only in development by default; set `graphiql: false` or a function to control it.
10. Plugins go in `plugins: []`. Packages verified to exist:
   - `@graphql-yoga/plugin-response-cache` (4.x, peer `graphql-yoga ^6.0.1`) exports `useResponseCache({ session, ttl, invalidateViaMutation })`; `ttl` is milliseconds, `session` returns a string per user or `null` for a global cache.
   - `@envelop/rate-limiter` (11.x, peer `@envelop/core ^6`) exports `useRateLimiter({ identifyFn })`; limits are declared in the schema with the `@rateLimit(max: 10, window: "5s")` directive (you must define the directive in your SDL).
   - `@envelop/depth-limit` (8.x) exports `useDepthLimit({ maxDepth })`. `@escape.tech/graphql-armor-max-depth` is an alternative.

## Examples

### Example 1: Users API with SSE subscription and masked errors

Request: "Build a GraphQL API on port 4000 where clients can list users and get notified when one is created."

```typescript
// server.ts
import { createServer } from "node:http";
import { GraphQLError } from "graphql";
import { createPubSub, createSchema, createYoga } from "graphql-yoga";

const pubSub = createPubSub<{ userCreated: [user: { id: string; name: string }] }>();
const users = [{ id: "1", name: "Maria Lopez" }];

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type User { id: ID! name: String! }
      type Query { users: [User!]! user(id: ID!): User }
      type Mutation { createUser(name: String!): User! }
      type Subscription { userCreated: User! }
    `,
    resolvers: {
      Query: {
        users: () => users,
        user: (_, { id }) => {
          const found = users.find((u) => u.id === id);
          if (!found) throw new GraphQLError(`User ${id} not found`, { extensions: { code: "NOT_FOUND" } });
          return found;
        },
      },
      Mutation: {
        createUser: (_, { name }) => {
          const user = { id: String(users.length + 1), name };
          users.push(user);
          pubSub.publish("userCreated", user);
          return user;
        },
      },
      Subscription: {
        userCreated: { subscribe: () => pubSub.subscribe("userCreated"), resolve: (u) => u },
      },
    },
  }),
  cors: { origin: ["https://app.northwind.dev"], credentials: true },
});

createServer(yoga).listen(4000, () => console.log("http://localhost:4000/graphql"));
```

Run with `npx tsx server.ts`. Opening `http://localhost:4000/graphql` shows GraphiQL; `{ user(id: "9") { name } }` returns the `NOT_FOUND` error message, while a thrown plain `Error` comes back as "Unexpected error.".

### Example 2: Cache, depth limit and a test without a network

Request: "Cache public queries for a minute and reject queries nested deeper than 8 levels."

```bash
npm install @graphql-yoga/plugin-response-cache @envelop/depth-limit
```

```typescript
import { createSchema, createYoga } from "graphql-yoga";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { useDepthLimit } from "@envelop/depth-limit";

export const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  plugins: [
    useResponseCache({
      session: (request) => request.headers.get("authorization"),
      ttl: 60_000,
    }),
    useDepthLimit({ maxDepth: 8 }),
  ],
});

// yoga.fetch needs no running server, so it works in unit tests:
const res = await yoga.fetch("http://localhost/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "{ users { id } }" }),
});
console.log(await res.json()); // { data: { users: [...] } }
```

A query deeper than the limit is rejected before execution: with graphql-yoga 6.0.1 the response is HTTP 400 with `errors[0].extensions.code` of `GRAPHQL_VALIDATION_FAILED` (also `extensions.http.status: 400`) and a message such as "exceeds maximum operation depth of 8".

## Guidelines

- The old `useRateLimiter` import from `@graphql-yoga/plugin-rate-limiter` and the `envelop-depth-limit` package do not exist; use the `@envelop/*` packages above.
- Keep GraphiQL off in production and keep masking on; expose failures deliberately via `GraphQLError`.
- Use DataLoader (one instance per request, created in `context`) to avoid N+1 queries in nested resolvers.
- An in-memory response cache and in-memory PubSub work for a single process only; use a shared cache and the Redis event target when you run several replicas.
- Cache by `session` for authenticated data, otherwise one user's response can be served to another.
- Depth limiting alone does not stop expensive wide queries; add query complexity limits, persisted operations or timeouts for public APIs.
- Upgrading from v5 to v6 (breaking, per the package CHANGELOG): move to Node 22.15+ and graphql 16/17; `createGraphQLError` is removed (use `new GraphQLError(message, options)`; `withSchemaCoordinate` for coordinates); `mapMaybePromise`, `mergeSchemas`, `DisposableSymbols`, `mapAsyncIterator`, `isPromise`, `handleMaybePromise` are no longer re-exported (import from `@graphql-tools/schema`, `@whatwg-node/server`, `@whatwg-node/promise-helpers`); `@graphql-yoga/logger` is removed in favour of `@graphql-hive/logger`; `@envelop/response-cache`, `auth0`, `newrelic`, `statsd`, `graphql-jit` and similar plugins need `@graphql-hive/logger` installed as a peer; Next.js no longer needs `fetchAPI: { Response }`.
- Staying on v5 means Node 18/20 and graphql 15 still work, but then pin plugin majors that declare a `graphql-yoga ^5` peer.
