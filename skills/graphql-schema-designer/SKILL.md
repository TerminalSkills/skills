---
name: graphql-schema-designer
description: >-
  Design, audit, and optimize GraphQL schemas. Use when someone asks to "design a GraphQL schema",
  "audit GraphQL types", "fix N+1 queries in GraphQL", "add pagination to GraphQL", "optimize
  GraphQL resolvers", "add DataLoader", or "set query complexity limits". Handles schema-first
  design, naming conventions, pagination patterns, and resolver optimization.
license: Apache-2.0
compatibility: "Works with any GraphQL implementation (Apollo, Yoga, Mercurius, Strawberry, etc.)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["graphql", "api-design", "schema", "dataloader", "performance"]
---

# GraphQL Schema Designer

## Overview

This skill helps you design clean GraphQL schemas from scratch or audit existing ones. It covers type design, naming conventions, pagination, N+1 query detection, DataLoader generation, and query complexity analysis.

## Instructions

### Schema Design (from scratch)

When given a data model, database schema, or requirements:

1. **Map entities to types**: Each database table or domain object becomes a GraphQL type
2. **Choose IDs**: Use `ID!` for primary keys, use globally unique IDs (base64-encoded `TypeName:id`) for Relay compatibility
3. **Nullability**: Default to non-null (`String!`). Only make fields nullable if they can genuinely be absent
4. **Naming**: Types are PascalCase singular (`Project`, not `Projects`). Fields are camelCase. Queries are camelCase nouns (`projects`, `user`). Mutations are camelCase verbs (`createProject`, `updateTask`)
5. **List fields**: Always paginate with Relay connections (`ProjectConnection` with `edges` and `pageInfo`) for any list that could exceed 50 items
6. **Input types**: Every mutation takes a single input argument (`input: CreateProjectInput!`)
7. **Enums**: Use SCREAMING_SNAKE_CASE (`TASK_STATUS` values: `IN_PROGRESS`, `COMPLETED`)

### Schema Audit

When given an existing schema file:

1. **Naming consistency**: Flag mixed conventions
2. **Pagination**: Flag unbounded list fields (`[Type!]!` without pagination)
3. **Circular references**: Detect type cycles and recommend depth limits
4. **Nullability**: Compare with DB constraints if available
5. **Deprecated fields**: Check for fields that should be deprecated
6. **Input types**: Flag mutations that take multiple arguments instead of input types
7. **Over-fetching risks**: Identify types with >20 fields that should be split

### N+1 Detection and DataLoader Generation

When given resolver code:

1. Find resolver functions that execute a query per parent item
2. Generate DataLoader implementations that batch by foreign key
3. Show before/after SQL query counts for a sample query
4. Handle composite keys and polymorphic associations

### Query Complexity

When asked to add limits:

1. Assign costs: scalar = 0, object = 1, connection = cost × `first` arg
2. Set max depth (recommend 7-10)
3. Set max complexity (recommend 500-1500 depending on server capacity)
4. Generate middleware code for the user's GraphQL server

## Examples

### Example 1: Schema from Database Tables

**Input**: "I have these tables: users (id, name, email), projects (id, name, owner_id), tasks (id, title, status, project_id, assignee_id)"

**Output**:
```graphql
type Query {
  viewer: User!
  project(id: ID!): Project
  projects(first: Int = 20, after: String): ProjectConnection!
}

type Mutation {
  createProject(input: CreateProjectInput!): CreateProjectPayload!
  updateTask(input: UpdateTaskInput!): UpdateTaskPayload!
}

type User {
  id: ID!
  name: String!
  email: String!
  ownedProjects(first: Int = 20, after: String): ProjectConnection!
  assignedTasks(first: Int = 20, after: String): TaskConnection!
}

type Project {
  id: ID!
  name: String!
  owner: User!
  tasks(first: Int = 50, after: String, status: TaskStatus): TaskConnection!
}

type Task {
  id: ID!
  title: String!
  status: TaskStatus!
  project: Project!
  assignee: User
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  COMPLETED
}

type ProjectConnection {
  edges: [ProjectEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type ProjectEdge {
  node: Project!
  cursor: String!
}

# ... similar Connection types for Task
```

### Example 2: DataLoader for N+1

**Input**: Resolver that loads tasks per project individually.

**Output**:
```typescript
// Before — N+1 (1 query per project)
const resolvers = {
  Project: {
    tasks: (project) => db.query('SELECT * FROM tasks WHERE project_id = $1', [project.id])
  }
};

// After — Batched (1 query total)
import DataLoader from 'dataloader';

const tasksByProjectIdLoader = new DataLoader(async (projectIds: string[]) => {
  const tasks = await db.query(
    'SELECT * FROM tasks WHERE project_id = ANY($1) ORDER BY project_id',
    [projectIds]
  );
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = grouped.get(task.project_id) || [];
    list.push(task);
    grouped.set(task.project_id, list);
  }
  return projectIds.map(id => grouped.get(id) || []);
});

const resolvers = {
  Project: {
    tasks: (project) => tasksByProjectIdLoader.load(project.id)
  }
};
```

## Guidelines

- Always recommend Relay-style connections over simple arrays for production APIs
- When auditing, prioritize issues by impact: N+1 > missing pagination > naming > nullability
- For mutations, always return the affected object in the payload (not just a boolean)
- Suggest `@deprecated(reason: "Use fieldX instead")` rather than removing fields for backward compatibility
- When generating DataLoaders, remind users to create a new loader instance per request (not global)
- Don't over-engineer: a simple CRUD API with 5 types doesn't need Relay connections
