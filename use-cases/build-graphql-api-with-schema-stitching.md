---
title: Build a GraphQL API with Schema Stitching
slug: build-graphql-api-with-schema-stitching
description: >-
  Build a GraphQL API that unifies multiple data sources — combine REST APIs,
  databases, and third-party services into a single schema with resolvers,
  DataLoader for N+1 prevention, subscriptions, and caching.
skills:
  - graphql
  - graphql-yoga
  - redis
  - drizzle-orm
  - stripe-billing
category: development
tags:
  - graphql
  - api
  - schema-stitching
  - typescript
  - backend
---

# Build a GraphQL API with Schema Stitching

Ada's frontend needs data from 5 sources: the user database, a REST billing API, a CMS, an analytics service, and a third-party enrichment API. Each request requires 3-5 fetch calls with manual data stitching. GraphQL gives her one endpoint where the frontend declares exactly what it needs, and the server resolves data from all sources in parallel — with automatic batching to prevent N+1 queries.

Here the sources are stitched by hand into one schema: Postgres through Drizzle ORM, Stripe for billing, and an internal analytics REST service (cached in Redis). The server is GraphQL Yoga. Install with `npm i graphql graphql-yoga dataloader drizzle-orm pg stripe ioredis`.

## Step 1: Schema Definition

```typescript
// src/schema/typeDefs.ts
export const typeDefs = /* GraphQL */ `
  type Query {
    user(id: ID!): User
    project(id: ID!): Project
  }
  type Mutation {
    createProject(input: CreateProjectInput!): Project!
  }
  type Subscription {
    projectCreated: Project!
  }
  type User {
    id: ID!
    email: String!
    name: String!
    plan: Plan!
    projects: [Project!]!
    billing: BillingInfo     # Stripe REST API, only visible to the user themselves
    analytics: UserAnalytics # internal analytics service
  }
  type Project {
    id: ID!
    name: String!
    description: String
    owner: User!
    tasks(limit: Int = 20): [Task!]!
    taskCount: Int!
    createdAt: DateTime!
  }
  type Task {
    id: ID!
    title: String!
    status: TaskStatus!
  }
  type BillingInfo {
    plan: String!
    status: String!
    currentPeriodEnd: DateTime
    monthlySpend: Float!
  }
  type UserAnalytics {
    lastActiveAt: DateTime
    sessionsThisWeek: Int!
    topFeatures: [String!]!
  }
  input CreateProjectInput { name: String!, description: String }
  enum Plan { FREE PRO ENTERPRISE }
  enum TaskStatus { TODO IN_PROGRESS DONE }
  scalar DateTime
`;
```

## Step 2: Drizzle Tables

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["FREE", "PRO", "ENTERPRISE"] }).notNull().default("FREE"),
  stripeCustomerId: text("stripe_customer_id"),
});
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["TODO", "IN_PROGRESS", "DONE"] }).notNull().default("TODO"),
});

export const db = drizzle(process.env.DATABASE_URL!);
```

## Step 3: Resolvers with DataLoader

```typescript
// src/schema/resolvers.ts
import DataLoader from "dataloader";
import { GraphQLError, GraphQLScalarType } from "graphql";
import { createPubSub } from "graphql-yoga";
import { Redis } from "ioredis";
import Stripe from "stripe";
import { and, eq, inArray, count } from "drizzle-orm";
import { db, users, projects, tasks } from "../db/schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);
// topic id = owner id, so a subscriber only receives their own projects
const pubsub = createPubSub<{ projectCreated: [ownerId: string, project: typeof projects.$inferSelect] }>();

type User = typeof users.$inferSelect;
type Project = typeof projects.$inferSelect;
export type Context = { user: { id: string } | null; loaders: ReturnType<typeof createLoaders> };

// Group rows by a key, in the order DataLoader asked for the keys
function groupBy<T>(keys: readonly string[], rows: T[], key: (r: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return keys.map((k) => map.get(k) ?? []);
}

// One set of loaders PER REQUEST: DataLoader caches by key, so sharing one across users leaks data
export function createLoaders() {
  return {
    userById: new DataLoader<string, User>(async (ids) => {
      const rows = await db.select().from(users).where(inArray(users.id, [...ids]));
      const byId = new Map(rows.map((u) => [u.id, u]));
      return ids.map((id) => byId.get(id) ?? new Error(`User ${id} not found`));
    }),
    projectsByUserId: new DataLoader<string, Project[]>(async (ids) =>
      groupBy(ids, await db.select().from(projects).where(inArray(projects.ownerId, [...ids])), (p) => p.ownerId)),
    tasksByProjectId: new DataLoader<string, (typeof tasks.$inferSelect)[]>(async (ids) =>
      groupBy(ids, await db.select().from(tasks).where(inArray(tasks.projectId, [...ids])), (t) => t.projectId)),
    taskCountByProjectId: new DataLoader<string, number>(async (ids) => {
      const rows = await db.select({ projectId: tasks.projectId, n: count() })
        .from(tasks).where(inArray(tasks.projectId, [...ids])).groupBy(tasks.projectId);
      const byId = new Map(rows.map((r) => [r.projectId, r.n]));
      return ids.map((id) => byId.get(id) ?? 0);
    }),
    // Stripe has no batch lookup by customer, so this only de-duplicates repeated lookups in one request
    subscriptionByCustomer: new DataLoader<string, Stripe.Subscription | null>(async (customers) =>
      Promise.all(customers.map(async (customer) =>
        (await stripe.subscriptions.list({ customer, limit: 1 })).data[0] ?? null))),
  };
}

function requireUser(ctx: Context) {
  if (!ctx.user) throw new GraphQLError("Not authenticated", { extensions: { code: "UNAUTHENTICATED" } });
  return ctx.user;
}

export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: "DateTime",
    serialize: (v) => new Date(v as string | number | Date).toISOString(),
  }),
  Query: {
    // Users see only themselves and their own projects (email and billing are private)
    user: (_: unknown, { id }: { id: string }, ctx: Context) =>
      requireUser(ctx).id === id ? ctx.loaders.userById.load(id) : null,
    project: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      const me = requireUser(ctx).id;
      return (await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, me))))[0] ?? null;
    },
  },
  Mutation: {
    createProject: async (_: unknown, { input }: { input: { name: string; description?: string } }, ctx: Context) => {
      const [project] = await db.insert(projects).values({ ...input, ownerId: requireUser(ctx).id }).returning();
      pubsub.publish("projectCreated", project.ownerId, project);
      return project;
    },
  },
  Subscription: {
    projectCreated: {
      subscribe: (_: unknown, __: unknown, ctx: Context) => pubsub.subscribe("projectCreated", requireUser(ctx).id),
      resolve: (p: Project) => p,
    },
  },

  // Field resolvers run once per parent row; DataLoader batches the database work
  User: {
    projects: (user: User, _: unknown, ctx: Context) => ctx.loaders.projectsByUserId.load(user.id),
    billing: async (user: User, _: unknown, ctx: Context) => {
      if (requireUser(ctx).id !== user.id || !user.stripeCustomerId) return null; // billing is private
      const sub = await ctx.loaders.subscriptionByCustomer.load(user.stripeCustomerId);
      const item = sub?.items.data[0];
      if (!sub || !item) return null;
      const unit = ((item.price.unit_amount ?? 0) * (item.quantity ?? 1)) / 100; // flat pricing only; tiered prices have no unit_amount
      return {
        plan: item.price.lookup_key ?? item.price.id,
        status: sub.status,
        currentPeriodEnd: new Date(item.current_period_end * 1000), // moved from the subscription to its items in API 2025-03-31
        monthlySpend: item.price.recurring?.interval === "year" ? unit / 12 : unit,
      };
    },
    analytics: async (user: User) => {
      const key = `analytics:${user.id}`;
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
      const res = await fetch(`${process.env.ANALYTICS_URL}/users/${encodeURIComponent(user.id)}/summary`, {
        signal: AbortSignal.timeout(2000), // a slow analytics service must not stall the whole query
      });
      if (!res.ok) return null;
      const summary = await res.json();
      await redis.set(key, JSON.stringify(summary), "EX", 60);
      return summary;
    },
  },
  Project: {
    owner: (p: Project, _: unknown, ctx: Context) => ctx.loaders.userById.load(p.ownerId),
    tasks: async (p: Project, { limit }: { limit: number }, ctx: Context) =>
      (await ctx.loaders.tasksByProjectId.load(p.id)).slice(0, Math.max(0, Math.min(limit, 100))),
    taskCount: (p: Project, _: unknown, ctx: Context) => ctx.loaders.taskCountByProjectId.load(p.id),
  },
};
```

## Step 4: Server Setup with Context

```typescript
// src/server.ts
import { createServer } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import { typeDefs } from "./schema/typeDefs";
import { resolvers, createLoaders, type Context } from "./schema/resolvers";
import { verifyToken } from "./auth"; // your JWT check; returns { id } or null

const yoga = createYoga<{}, Context>({
  schema: createSchema({ typeDefs, resolvers }),
  context: async ({ request }) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    return { user: token ? await verifyToken(token) : null, loaders: createLoaders() };
  },
});

// Bind to loopback in development; put a reverse proxy in front for anything public
createServer(yoga).listen(4000, "127.0.0.1", () =>
  console.log("GraphQL at http://127.0.0.1:4000/graphql (GraphiQL in the browser)"));
```

Subscriptions use Server-Sent Events (Yoga's default), so no WebSocket setup is needed. The in-memory `createPubSub` only reaches clients of the same process; with several instances use a Redis-backed event target.

## Step 5: Frontend Query

```typescript
// The frontend gets exactly what it needs in one request
const USER_DASHBOARD = /* GraphQL */ `
  query UserDashboard($userId: ID!) {
    user(id: $userId) {
      name
      email
      plan
      billing { status currentPeriodEnd monthlySpend }
      analytics { sessionsThisWeek topFeatures }
      projects {
        id
        name
        taskCount
        tasks(limit: 5) { title status }
      }
    }
  }
`;
// One request: user + billing (Stripe) + analytics + projects + tasks, batched by DataLoader.
```

## Summary

Ada's frontend makes one GraphQL request that fetches data from the database (users, projects, tasks), Stripe (billing), and the analytics service, resolved in parallel on the server. DataLoader batches the nested lookups: resolving 20 users with their projects costs 2 SQL queries instead of 21. Redis keeps the analytics call to one per user per minute. The schema documents the API, and Yoga's GraphiQL page lets frontend developers explore it. New fields can be added without breaking existing queries.

## Related Skills

- **graphql**: schema design, resolver and DataLoader patterns used throughout
- **graphql-yoga**: the `createSchema` / `createYoga` server, context and SSE subscriptions
- **drizzle-orm**: typed tables and `inArray` queries behind the loaders
- **redis**: 60-second cache for the analytics REST call
- **stripe-billing**: the subscription lookup behind the `billing` field
