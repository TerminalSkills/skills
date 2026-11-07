---
title: "Design and Optimize a GraphQL Schema with AI"
slug: design-optimize-graphql-schema
description: "Build a clean GraphQL schema from your data model, detect N+1 queries, and optimize resolver performance before problems hit production."
skills: [graphql, sql-optimizer]
category: development
tags: [graphql, api-design, schema, performance, n-plus-one]
---

# Design and Optimize a GraphQL Schema with AI

## The Problem

Your team is building a GraphQL API for a multi-tenant project management app. The initial schema grew organically -- now you have 47 types, queries that trigger 200+ SQL statements per request, and clients complaining about 3-second response times. Some queries return 5MB of nested data because there's no pagination. The mobile app only needs 10 fields but gets 85. Nobody wants to refactor because the schema is the contract with three frontend teams.

The real danger is deeper than slow responses. Without depth limiting, a single malicious query like `{ projects { tasks { comments { author { projects { tasks ... }}}}}}` could take down the whole API. And every N+1 pattern you don't catch in development becomes a scaling wall you hit in production -- what works fine with 100 projects becomes a 168-query monster when a customer creates their 1,000th.

## The Solution

Using the **graphql** skill for schema structure and the **sql-optimizer** skill for the underlying queries, the agent audits your existing schema, identifies N+1 patterns, adds proper pagination and complexity limits, and generates optimized resolvers with DataLoader batching.

## Step-by-Step Walkthrough

### Step 1: Audit the Existing Schema

```text
Here's our GraphQL schema (schema.graphql, 820 lines). Analyze it for: naming inconsistencies, missing pagination on list fields, overly nested types that cause deep query chains, nullable fields that should be non-null, and any anti-patterns.
```

In this team's schema the audit surfaces issues in four categories:

**Naming inconsistencies** -- three different conventions coexist in one schema:
- `getUser` vs `projectsList` vs `fetch_tasks` -- three verbing styles for the same operation
- 3 types use plural names (`Tasks`, `Projects`) instead of singular
- Recommendation: standardize on camelCase nouns (`user`, `projects`, `tasks`)

**Pagination missing on list fields** -- the biggest performance risk hiding in plain sight:
- `projects: [Project!]!` returns an unbounded list (currently 12,000 rows)
- `tasks(projectId: ID!): [Task!]!` has no limit; some projects have 3,000+ tasks
- `comments(taskId: ID!): [Comment!]!` -- same problem
- Every one of these is a payload bomb waiting to go off. One customer with a busy project triggers a 5MB response that the mobile app tries to parse on a cellular connection.
- Recommendation: Relay-style cursor pagination on every list field

**Circular reference with unlimited depth:**
- Query path `projects -> tasks -> comments -> author -> projects` creates a cycle
- No depth limiting configured -- a crafted query could recurse indefinitely
- This isn't theoretical: it's a denial-of-service vector that any authenticated user could exploit, intentionally or not

**Schema looser than the database:**
- `User.email` is nullable in GraphQL but `NOT NULL` in PostgreSQL
- Several fields where the schema allows null but the database never produces it
- Tightening these catches bugs at the type level instead of at runtime. A frontend developer checking for null on a field that can never be null is writing dead code -- but they don't know that because the schema lies to them.

### Step 2: Fix the Schema Structure

```text
Redesign the schema following your recommendations. Keep backward compatibility where possible — add @deprecated directives for fields we'll remove later. Add Relay-style pagination, input types for mutations, and a query complexity limit of 1000 points. Cap `first` at 100 on the server.
```

The redesigned schema (checked here by running it on Apollo Server 5 with graphql 16) introduces cursor-based pagination on all list fields, replaces inline arguments with proper input types for mutations, and adds `@deprecated` directives so existing clients keep working during the transition:

```graphql
type Query {
  # New paginated field
  projectsConnection(first: Int!, after: String): ProjectConnection!

  # Old field still works but warns clients to migrate
  projects: [Project!]! @deprecated(reason: "Use projectsConnection with pagination")
}

type ProjectConnection {
  edges: [ProjectEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
```

The old unpaginated field stays exposed while clients migrate, so it is still a payload risk, and complexity analysis cannot price a list that has no `first` argument. Log its usage, cap its result size, and remove it once the clients have moved.

The impact is immediate for this team: the dashboard payload that was 3.1MB drops to 180KB because clients now request the first 20 items with a cursor instead of dumping the entire collection. The mobile team's 5MB problem disappears. And because the old field is deprecated rather than removed, all three frontend teams can migrate at their own pace -- no coordinated big-bang release required.

### Step 3: Detect and Fix N+1 Queries

This is where the real performance wins hide. N+1 queries are invisible in development (20 projects load fast) and devastating in production (2,000 projects trigger 6,000 SQL statements).

```text
Here are our resolver files (resolvers/ directory). Find every N+1 query pattern and generate DataLoader implementations to batch them. Show me the before/after SQL query counts for a typical "list projects with tasks and assignees" request.
```

The classic query `{ projectsConnection(first: 20) { edges { node { tasks { assignee { name } } } } } }` tells the whole story:

**Before (current resolvers, this team's measurements):**

| Step | SQL Queries | Why |
|---|---|---|
| Load projects | 1 | `SELECT * FROM projects LIMIT 20` |
| Load tasks per project | 20 | One `SELECT * FROM tasks WHERE project_id = ?` per project |
| Load assignee per task | 147 | One `SELECT * FROM users WHERE id = ?` per task |
| **Total** | **168 queries, ~2.8 seconds** | |

**After (with DataLoader batching):**

| Step | SQL Queries | Why |
|---|---|---|
| Load projects | 1 | `SELECT * FROM projects LIMIT 20` |
| Batch load tasks | 1 | `SELECT * FROM tasks WHERE project_id IN (?, ?, ...)` |
| Batch load assignees | 1 | `SELECT * FROM users WHERE id IN (?, ?, ...)` |
| **Total** | **3 queries, ~45ms** | |

That is a 56x reduction in query count and a 62x speedup -- from one query pattern. Two DataLoaders cover the task and assignee steps (the project query stays a single `SELECT`):

```typescript
// dataloaders.ts — created per request to avoid cross-request caching
import DataLoader from 'dataloader';

export function createLoaders(db: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> }) {
  return {
    tasksByProject: new DataLoader<string, any[]>(async (projectIds) => {
      const { rows } = await db.query(
        'SELECT * FROM tasks WHERE project_id = ANY($1)', [projectIds]
      );
      // Return one result per input ID, in the same order as the input
      return projectIds.map((id) => rows.filter((t) => t.project_id === id));
    }),
    userById: new DataLoader<string, any>(async (userIds) => {
      const { rows } = await db.query(
        'SELECT * FROM users WHERE id = ANY($1)', [userIds]
      );
      const byId = new Map(rows.map((u) => [u.id, u]));
      return userIds.map((id) => byId.get(id) ?? new Error(`user ${id} not found`));
    }),
  };
}
```

Put `createLoaders(db)` in the Apollo `context` function so every request gets fresh loaders, and add the tenant filter to each batched query: a loader that batches by ID alone can return another tenant's rows. With a node-postgres style client the `ANY($1)` form takes the ID array as one parameter. In a test with an in-memory database that counts queries, the `projectsConnection(first: 20)` query above issued exactly 3 queries.

Batching helps only if the batched query is fast. Use the **sql-optimizer** skill on the loader queries: ask it to run `EXPLAIN (ANALYZE, BUFFERS)` on `SELECT * FROM tasks WHERE project_id = ANY(...)` and confirm `tasks(project_id)` has an index, or the one batched query becomes one slow sequential scan. Replace `SELECT *` with the columns the resolvers return.

The loaders are created per request, not globally, to prevent cross-request cache pollution in a multi-tenant system.

In this team's resolver directory the agent found eight N+1 patterns and gave each a loader, reducing the worst-case query count from 200+ to 11 for the most complex page load.

### Step 4: Add Query Complexity and Depth Limits

```text
Configure query complexity analysis. Assign costs: scalar fields = 0, object fields = 1, list fields with pagination = cost x first argument. Set max depth to 7 and max complexity to 1000. Generate the middleware code.
```

Depth is a validation rule from `graphql-depth-limit` (its last release was in 2022, but it works with graphql 16). Complexity comes from `graphql-query-complexity` through an Apollo Server plugin that rejects the operation after it is parsed and before any resolver runs:

```bash
npm install @apollo/server graphql@16 dataloader graphql-depth-limit graphql-query-complexity
npm install -D typescript @types/graphql-depth-limit   # type declarations for TypeScript projects
```

```typescript
// limits.ts — depth rule and complexity plugin (tested on Apollo Server 5, graphql 16)
import { GraphQLError, getNamedType, isLeafType } from 'graphql';
import { getComplexity } from 'graphql-query-complexity';
import depthLimit from 'graphql-depth-limit';

const MAX_COMPLEXITY = 1000;

// scalars cost 0, object fields cost 1, paginated lists cost first x the cost of their children
const estimator = ({ field, args, childComplexity }: any) => {
  if (isLeafType(getNamedType(field.type))) return 0;
  const first = typeof args.first === 'number' ? Math.min(args.first, 100) : 1;
  return 1 + first * childComplexity;
};

export const complexityPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document, schema }: any) {
        const complexity = getComplexity({
          schema, query: document, variables: request.variables,
          operationName: request.operationName, estimators: [estimator],
        });
        if (complexity > MAX_COMPLEXITY) {
          throw new GraphQLError(
            `Query complexity ${complexity} exceeds maximum of ${MAX_COMPLEXITY}`,
            { extensions: { code: 'QUERY_TOO_COMPLEX', complexity, maxComplexity: MAX_COMPLEXITY } }
          );
        }
      },
    };
  },
};

export const validationRules = [depthLimit(7)];
// new ApolloServer({ typeDefs, resolvers, validationRules, plugins: [complexityPlugin] })
```

A list field without a `first` argument counts as a single item, so every list in the schema needs pagination for the estimate to be honest. The recursive attack query hits the depth limit and fails validation (`exceeds maximum operation depth of 7`, code `GRAPHQL_VALIDATION_FAILED`) before a single database query fires. A query over the complexity budget is rejected with this response, which names the numbers so the client developer knows how far over they are:

```json
{
  "errors": [{
    "message": "Query complexity 1247 exceeds maximum of 1000",
    "extensions": { "code": "QUERY_TOO_COMPLEX", "complexity": 1247, "maxComplexity": 1000 }
  }]
}
```

Scores depend on your schema: in the test schema, `projectsConnection(first: 100)` with tasks and assignees scored 401. Run representative client queries through `getComplexity` and set the maximum above the heaviest legitimate one.

## Real-World Example

The numbers below are this invented team's own, not benchmarks.

Tomas is a backend lead at a 15-person B2B startup. Three frontend teams -- web, iOS, Android -- consume their GraphQL API. The mobile team reported that the dashboard query takes 4.2 seconds and transfers 3.1MB. "It's unusable on cellular," the iOS lead wrote in Slack. The web team hadn't noticed because desktop browsers on fast connections masked the problem.

The 820-line schema audit came back with a concrete list of fixes. The redesigned schema with cursor pagination cut the dashboard payload from 3.1MB to 180KB -- a 94% reduction. N+1 detection found 8 resolver patterns collectively responsible for 200+ queries per request. DataLoaders collapsed those down to 11 queries. The dashboard response dropped from 4.2 seconds to 290ms.

The depth and complexity limits were the quiet win. Two weeks after deployment, the monitoring dashboard showed 14 rejected queries that would have previously hit the database unchecked. One of them -- a deeply nested query from an integration partner's buggy client -- would have generated over 10,000 SQL statements per execution. It had been running every 30 seconds for a week, silently consuming 40% of the database's query budget. Nobody had noticed because the N+1 queries spread the load across many small requests rather than one visible spike.

## Related Skills

- `graphql` — schema design rules, Relay-style pagination, DataLoader pattern and depth limiting
- `sql-optimizer` — EXPLAIN analysis of the batched loader queries and index recommendations
