---
name: graphql-yoga
description: >-
  GraphQL Yoga is a fully featured GraphQL server from The Guild that runs on
  any JavaScript runtime (Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda).
  Use this skill when asked to build a GraphQL API with graphql-yoga, add
  subscriptions, file uploads, response caching, depth limits, rate limiting or
  error masking, or move from Apollo Server to Yoga and Envelop plugins.
license: Apache-2.0
compatibility: "Node.js 18+ (or Bun, Deno, Workers); graphql-yoga v5 with graphql 15, 16 or 17"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/graphql-hive/graphql-yoga
  tags: ["graphql", "server", "api", "typescript", "envelop"]
---

# GraphQL Yoga

## Overview

GraphQL Yoga (v5) is a spec-compliant GraphQL server built on the WHATWG Fetch API, so the same `yoga` object works as a Node `http` handler, a Fetch handler (`yoga.fetch`) in Workers, Bun and Deno, or behind Express, Fastify and Next.js. It is extended with Envelop plugins. It ships with GraphQL over SSE subscriptions, multipart file uploads, CORS, GraphiQL and error masking; you add caching, rate limiting and depth limits as plugins. Schemas can be written with `createSchema` (SDL plus resolvers) or with code-first builders such as Pothos.

## Instructions

1. Install: `npm install graphql-yoga graphql`.
2. Build the schema with `createSchema({ typeDefs, resolvers })`, pass it to `createYoga`, and hand the result to `createServer` from `node:http`. The endpoint defaults to `/graphql`; change it with `graphqlEndpoint`.
3. Per-request state (database handle, current user) goes in the `context` option, which receives `{ request }` (a Fetch `Request`) plus runtime-specific fields such as `req`/`res` on Node.
4. Subscriptions: use `createPubSub()` exported by `graphql-yoga`; `pubSub.publish(topic, payload)` and `pubSub.subscribe(topic)` (an async iterable). Clients connect over SSE by default; no WebSocket server is needed. For several instances, back the pub/sub with Redis using `@graphql-yoga/redis-event-target`.
5. File uploads: declare `scalar File` in the schema and accept `File!` arguments. The value is a standard `File`/`Blob` (`.text()`, `.arrayBuffer()`, `.stream()`). Multipart parsing is on by default; `multipart: false` turns it off.
6. Errors: Yoga masks unexpected errors by default. Throw `GraphQLError` (from `graphql`) with `extensions.code` for errors clients should see. `maskedErrors: false` disables masking (development only). With `NODE_ENV=development` the original error appears in `extensions.originalError`.
7. GraphiQL is enabled only in development by default; set `graphiql: false` or a function to control it.
8. Plugins go in `plugins: []`. Packages verified to exist:
   - `@graphql-yoga/plugin-response-cache` exports `useResponseCache({ session, ttl, invalidateViaMutation })`; `ttl` is milliseconds, `session` returns a string per user or `null` for a global cache.
   - `@envelop/rate-limiter` exports `useRateLimiter({ identifyFn })`; limits are declared in the schema with the `@rateLimit(max: 10, window: "5s")` directive (you must define the directive in your SDL).
   - `@envelop/depth-limit` exports `useDepthLimit({ maxDepth })`. `@escape.tech/graphql-armor-max-depth` is an alternative.

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

A query deeper than the limit returns HTTP 200 with `errors[0].extensions.code` of `GRAPHQL_VALIDATION_FAILED` and a message such as "exceeds maximum operation depth of 8".

## Guidelines

- The old `useRateLimiter` import from `@graphql-yoga/plugin-rate-limiter` and the `envelop-depth-limit` package do not exist; use the `@envelop/*` packages above.
- Keep GraphiQL off in production and keep masking on; expose failures deliberately via `GraphQLError`.
- Use DataLoader (one instance per request, created in `context`) to avoid N+1 queries in nested resolvers.
- An in-memory response cache and in-memory PubSub work for a single process only; use a shared cache and the Redis event target when you run several replicas.
- Cache by `session` for authenticated data, otherwise one user's response can be served to another.
- Depth limiting alone does not stop expensive wide queries; add query complexity limits, persisted operations or timeouts for public APIs.
- Check the migration guide on the-guild.dev before upgrading from v3/v4 to v5.
