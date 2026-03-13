---
title: Build a GraphQL API with Schema Stitching
slug: build-graphql-api-with-schema-stitching
description: >-
  Build a GraphQL API that unifies multiple data sources — combine REST APIs,
  databases, and third-party services into a single schema with resolvers,
  DataLoader for N+1 prevention, subscriptions, and caching.
skills:
  - graphql
  - redis
  - drizzle-orm
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

## Step 1: Schema Definition

```typescript
// src/schema/typeDefs.ts
export const typeDefs = /* GraphQL */ `
  type Query {
    user(id: ID!): User
    users(filter: UserFilter, pagination: PaginationInput): UserConnection!
    project(id: ID!): Project
    projects(userId: ID!): [Project!]!
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!
  }

  type Subscription {
    projectUpdated(projectId: ID!): Project!
  }

  type User {
    id: ID!
    email: String!
    name: String!
    avatar: String
    plan: Plan!
    projects: [Project!]!
    billing: BillingInfo
    analytics: UserAnalytics
  }

  type Project {
    id: ID!
    name: String!
    description: String
    owner: User!
    tasks: [Task!]!
    taskCount: Int!
    createdAt: DateTime!
  }

  type Task {
    id: ID!
    title: String!
    status: TaskStatus!
    assignee: User
    project: Project!
  }

  # Data from Stripe REST API
  type BillingInfo {
    plan: String!
    status: String!
    currentPeriodEnd: DateTime
    monthlySpend: Float!
  }

  # Data from analytics service
  type UserAnalytics {
    lastActiveAt: DateTime
    sessionsThisWeek: Int!
    topFeatures: [String!]!
  }

  type UserConnection {
    nodes: [User!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  input UserFilter {
    search: String
    plan: Plan
    role: String
  }

  input PaginationInput {
    page: Int = 1
    limit: Int = 20
  }

  input CreateProjectInput {
    name: String!
    description: String
  }

  input UpdateProjectInput {
    name: String
    description: String
  }

  enum Plan { FREE PRO ENTERPRISE }
  enum TaskStatus { TODO IN_PROGRESS DONE }

  scalar DateTime
`;
```

## Step 2: Resolvers with DataLoader

```typescript
// src/schema/resolvers.ts
import DataLoader from "dataloader";
import { db } from "../db";
import { users, projects, tasks } from "../db/schema";
import { eq, sql, ilike } from "drizzle-orm";

// DataLoader prevents N+1 queries by batching
function createLoaders() {
  return {
    userById: new DataLoader<string, User>(async (ids) => {
      const result = await db.query.users.findMany({
        where: sql`${users.id} IN ${ids}`,
      });
      const map = new Map(result.map((u) => [u.id, u]));
      return ids.map((id) => map.get(id) || new Error(`User ${id} not found`));
    }),

    projectsByUserId: new DataLoader<string, Project[]>(async (userIds) => {
      const result = await db.query.projects.findMany({
        where: sql`${projects.ownerId} IN ${userIds}`,
      });
      const grouped = new Map<string, Project[]>();
      for (const p of result) {
        if (!grouped.has(p.ownerId)) grouped.set(p.ownerId, []);
        grouped.get(p.ownerId)!.push(p);
      }
      return userIds.map((id) => grouped.get(id) || []);
    }),

    tasksByProjectId: new DataLoader<string, Task[]>(async (projectIds) => {
      const result = await db.query.tasks.findMany({
        where: sql`${tasks.projectId} IN ${projectIds}`,
      });
      const grouped = new Map<string, Task[]>();
      for (const t of result) {
        if (!grouped.has(t.projectId)) grouped.set(t.projectId, []);
        grouped.get(t.projectId)!.push(t);
      }
      return projectIds.map((id) => grouped.get(id) || []);
    }),
  };
}

export const resolvers = {
  Query: {
    user: async (_: any, { id }: { id: string }, ctx: Context) => {
      return ctx.loaders.userById.load(id);
    },

    users: async (_: any, { filter, pagination }: any) => {
      const { page = 1, limit = 20 } = pagination || {};
      const offset = (page - 1) * limit;

      const where = filter?.search ? ilike(users.name, `%${filter.search}%`) : undefined;

      const [data, [{ count }]] = await Promise.all([
        db.query.users.findMany({ where, limit, offset }),
        db.select({ count: sql`count(*)` }).from(users).where(where),
      ]);

      return {
        nodes: data,
        totalCount: Number(count),
        pageInfo: {
          hasNextPage: offset + limit < Number(count),
          hasPreviousPage: page > 1,
        },
      };
    },
  },

  // Field resolvers — called per-user, batched by DataLoader
  User: {
    projects: (user: User, _: any, ctx: Context) => {
      return ctx.loaders.projectsByUserId.load(user.id);
    },

    billing: async (user: User) => {
      // Fetch from Stripe REST API
      if (!user.stripeCustomerId) return null;
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 1,
      });
      const sub = subscriptions.data[0];
      if (!sub) return null;
      return {
        plan: sub.items.data[0].price.lookup_key,
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        monthlySpend: sub.items.data[0].price.unit_amount! / 100,
      };
    },

    analytics: async (user: User) => {
      // Fetch from analytics service
      const res = await fetch(`${ANALYTICS_URL}/users/${user.id}/summary`);
      return res.json();
    },
  },

  Project: {
    owner: (project: Project, _: any, ctx: Context) => {
      return ctx.loaders.userById.load(project.ownerId);
    },
    tasks: (project: Project, _: any, ctx: Context) => {
      return ctx.loaders.tasksByProjectId.load(project.id);
    },
    taskCount: async (project: Project) => {
      const [{ count }] = await db.select({ count: sql`count(*)` })
        .from(tasks)
        .where(eq(tasks.projectId, project.id));
      return Number(count);
    },
  },
};
```

## Step 3: Server Setup with Context

```typescript
// src/server.ts
import { createYoga } from "graphql-yoga";
import { createSchema } from "graphql-yoga";
import { createServer } from "http";
import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./schema/resolvers";

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  context: async ({ request }) => {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const user = token ? await verifyToken(token) : null;

    return {
      user,
      loaders: createLoaders(),
    };
  },
});

const server = createServer(yoga);
server.listen(4000, () => console.log("GraphQL server at http://localhost:4000/graphql"));
```

## Step 4: Frontend Query

```typescript
// The frontend gets exactly what it needs in one request
const USER_DASHBOARD = gql`
  query UserDashboard($userId: ID!) {
    user(id: $userId) {
      name
      email
      plan
      billing {
        status
        currentPeriodEnd
        monthlySpend
      }
      analytics {
        sessionsThisWeek
        topFeatures
      }
      projects {
        id
        name
        taskCount
        tasks(limit: 5) {
          title
          status
        }
      }
    }
  }
`;
// One request fetches user + billing (Stripe) + analytics + projects + tasks
// DataLoader batches: 1 users query, 1 projects query, 1 tasks query
// Instead of: 1 user + N projects + N*M tasks = potentially hundreds of queries
```

## Summary

Ada's frontend makes one GraphQL request that fetches data from the database (users, projects, tasks), Stripe (billing info), and the analytics service — all resolved in parallel on the server. DataLoader batches prevent N+1 queries: requesting 20 users' projects results in 2 SQL queries (one for users, one for all their projects) instead of 21. The schema is the API documentation — frontend developers explore it in GraphQL Playground. New fields are added without breaking existing queries. The typed schema catches errors at build time, not at runtime.
