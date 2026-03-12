---
name: graphql-yoga
category: Backend Development
tags: [graphql, server, api, typescript, envelop, schema, node]
version: 1.0.0
author: terminal-skills
---

# GraphQL Yoga — Modern GraphQL Server

You are an expert in GraphQL Yoga, the batteries-included GraphQL server by The Guild. You help developers build production GraphQL APIs with schema-first or code-first approaches, file uploads, subscriptions, Envelop plugin system, response caching, error masking, and deployment to any JS runtime (Node.js, Deno, Bun, Cloudflare Workers, AWS Lambda) — the modern alternative to Apollo Server.

## Core Capabilities

### Server Setup

```typescript
import { createSchema, createYoga } from "graphql-yoga";
import { createServer } from "http";

const yoga = createYoga({
  schema: createSchema({
    typeDefs: `
      type Query {
        users(limit: Int, offset: Int): [User!]!
        user(id: ID!): User
      }
      type Mutation {
        createUser(input: CreateUserInput!): User!
        updateUser(id: ID!, input: UpdateUserInput!): User!
      }
      type Subscription {
        newUser: User!
      }
      type User {
        id: ID!
        name: String!
        email: String!
        posts: [Post!]!
        createdAt: String!
      }
      type Post {
        id: ID!
        title: String!
        author: User!
      }
      input CreateUserInput { name: String!, email: String! }
      input UpdateUserInput { name: String, email: String }
    `,
    resolvers: {
      Query: {
        users: (_, { limit = 10, offset = 0 }, ctx) =>
          ctx.db.users.findAll({ limit, offset }),
        user: (_, { id }, ctx) => ctx.db.users.findById(id),
      },
      Mutation: {
        createUser: async (_, { input }, ctx) => {
          const user = await ctx.db.users.create(input);
          ctx.pubsub.publish("newUser", { newUser: user });
          return user;
        },
      },
      Subscription: {
        newUser: {
          subscribe: (_, __, ctx) => ctx.pubsub.subscribe("newUser"),
        },
      },
      User: {
        posts: (user, _, ctx) => ctx.db.posts.findByAuthor(user.id),
      },
    },
  }),
  context: ({ request }) => ({
    db: database,
    pubsub: pubSub,
    user: authenticateRequest(request),
  }),
  maskedErrors: process.env.NODE_ENV === "production",
  cors: { origin: ["https://app.example.com"], credentials: true },
  graphiql: process.env.NODE_ENV !== "production",
});

const server = createServer(yoga);
server.listen(4000, () => console.log("GraphQL on http://localhost:4000/graphql"));
```

### Envelop Plugins

```typescript
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { useRateLimiter } from "@graphql-yoga/plugin-rate-limiter";
import { useDepthLimit } from "envelop-depth-limit";

const yoga = createYoga({
  schema,
  plugins: [
    useResponseCache({
      session: (req) => req.headers.get("authorization"),
      ttl: 60_000,                        // 60s cache
      invalidateViaMutation: true,
    }),
    useRateLimiter({
      identifyFn: (ctx) => ctx.user?.id || ctx.request.headers.get("x-forwarded-for"),
      max: 100,
      window: "1m",
    }),
    useDepthLimit({ maxDepth: 10 }),
  ],
});
```

## Installation

```bash
npm install graphql-yoga graphql
```

## Best Practices

1. **Envelop plugins** — Use the plugin system for auth, caching, rate limiting, logging; composable and reusable
2. **Response caching** — Enable response cache for public queries; cache by session for authenticated queries
3. **Depth limiting** — Set max query depth (10-15) to prevent abuse from deeply nested queries
4. **Error masking** — Enable in production; prevents leaking internal error details to clients
5. **Subscriptions** — Built-in SSE and WebSocket support; use PubSub for real-time updates
6. **File uploads** — Native multipart support; no extra libraries needed for file upload mutations
7. **Any runtime** — Deploy to Node.js, Deno, Bun, CF Workers, Lambda with the same code; runtime-agnostic
8. **DataLoader for N+1** — Use DataLoader in resolvers to batch database queries; prevents N+1 query problem
