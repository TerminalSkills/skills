---
title: Build a GraphQL Playground
slug: build-graphql-playground
description: Build an interactive GraphQL playground with schema explorer, query autocompletion, variable editor, query history, response visualization, and team sharing for API exploration.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - graphql
  - playground
  - api
  - developer-experience
  - interactive
---

# Build a GraphQL Playground

## The Problem

Kofi leads DevRel at a 25-person API company with a GraphQL API. Developers use GraphiQL, but it's barebones: no query history, no team sharing, no variable templates, and it doesn't show schema documentation inline. New developers spend 30 minutes figuring out nested query syntax. Support gets 200 "how do I query X?" tickets monthly. The schema explorer doesn't show deprecations clearly. They need a rich playground with autocompletion, documentation, saved queries, and team collaboration.

## Step 1: Build the Playground

```typescript
// src/graphql/playground.ts — GraphQL playground with history, sharing, and schema exploration
import { pool } from "../db";
import { Redis } from "ioredis";
import { buildSchema, introspectionFromSchema, GraphQLSchema, printSchema } from "graphql";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
  description: string;
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  collectionId: string | null;
  shareUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface QueryCollection {
  id: string;
  name: string;
  description: string;
  queries: string[];
  isPublic: boolean;
  createdBy: string;
}

interface QueryExecution {
  query: string;
  variables: any;
  headers: Record<string, string>;
}

interface ExecutionResult {
  data: any;
  errors: any[];
  extensions: {
    tracing: { duration: number; parsing: number; validation: number; execution: number };
    complexity: number;
  };
}

// Execute GraphQL query through playground
export async function executeQuery(
  execution: QueryExecution,
  userId: string
): Promise<ExecutionResult> {
  // Rate limit
  const rateKey = `gqlplay:rate:${userId}`;
  const count = await redis.incr(rateKey);
  await redis.expire(rateKey, 60);
  if (count > 60) throw new Error("Rate limit exceeded: 60 queries/minute");

  // Validate query complexity
  const complexity = estimateComplexity(execution.query);
  if (complexity > 1000) throw new Error(`Query too complex: ${complexity}/1000`);

  const start = Date.now();

  // Forward to GraphQL server
  const response = await fetch(`${process.env.GRAPHQL_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...execution.headers,
    },
    body: JSON.stringify({
      query: execution.query,
      variables: execution.variables,
    }),
  });

  const result = await response.json();
  const duration = Date.now() - start;

  // Save to history
  await redis.rpush(`gqlplay:history:${userId}`, JSON.stringify({
    query: execution.query,
    variables: execution.variables,
    duration,
    status: result.errors ? "error" : "success",
    timestamp: new Date().toISOString(),
  }));
  await redis.ltrim(`gqlplay:history:${userId}`, -100, -1);

  return {
    data: result.data,
    errors: result.errors || [],
    extensions: {
      tracing: { duration, parsing: 0, validation: 0, execution: duration },
      complexity,
    },
  };
}

// Get schema documentation
export async function getSchemaDocumentation(): Promise<{
  types: SchemaType[];
  queries: SchemaField[];
  mutations: SchemaField[];
  subscriptions: SchemaField[];
}> {
  const cached = await redis.get("gqlplay:schema:docs");
  if (cached) return JSON.parse(cached);

  // Introspect schema
  const response = await fetch(`${process.env.GRAPHQL_ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{
        __schema {
          types { name description kind fields { name description type { name kind ofType { name kind } } args { name description type { name kind } defaultValue } isDeprecated deprecationReason } }
          queryType { fields { name description type { name kind ofType { name } } args { name type { name kind } defaultValue description } isDeprecated deprecationReason } }
          mutationType { fields { name description type { name kind ofType { name } } args { name type { name kind } defaultValue description } isDeprecated deprecationReason } }
        }
      }`,
    }),
  });

  const { data } = await response.json();
  const schema = data.__schema;

  const types: SchemaType[] = schema.types
    .filter((t: any) => !t.name.startsWith("__"))
    .map((t: any) => ({
      name: t.name, description: t.description, kind: t.kind,
      fields: (t.fields || []).map((f: any) => ({
        name: f.name, description: f.description,
        type: formatType(f.type),
        args: f.args, isDeprecated: f.isDeprecated,
        deprecationReason: f.deprecationReason,
      })),
    }));

  const result = {
    types,
    queries: (schema.queryType?.fields || []).map(formatField),
    mutations: (schema.mutationType?.fields || []).map(formatField),
    subscriptions: [],
  };

  await redis.setex("gqlplay:schema:docs", 300, JSON.stringify(result));
  return result;
}

// Autocompletion suggestions
export async function getAutocompleteSuggestions(
  query: string,
  cursorPosition: number
): Promise<Array<{ label: string; type: string; description: string; insertText: string }>> {
  const docs = await getSchemaDocumentation();
  const context = analyzeQueryContext(query, cursorPosition);
  const suggestions: Array<{ label: string; type: string; description: string; insertText: string }> = [];

  if (context.level === "root") {
    for (const q of docs.queries) {
      suggestions.push({
        label: q.name, type: "query",
        description: q.description || "",
        insertText: generateQueryTemplate(q),
      });
    }
  } else if (context.level === "field" && context.parentType) {
    const type = docs.types.find((t) => t.name === context.parentType);
    if (type) {
      for (const field of type.fields) {
        suggestions.push({
          label: field.name, type: field.type,
          description: field.description || (field.isDeprecated ? `⚠️ Deprecated: ${field.deprecationReason}` : ""),
          insertText: field.name,
        });
      }
    }
  }

  return suggestions;
}

// Save query
export async function saveQuery(params: {
  name: string; query: string; variables?: string; description?: string;
  tags?: string[]; isPublic?: boolean; collectionId?: string; userId: string;
}): Promise<SavedQuery> {
  const id = `sq-${randomBytes(6).toString("hex")}`;
  const shareUrl = `${process.env.APP_URL}/playground/q/${id}`;

  const saved: SavedQuery = {
    id, name: params.name, query: params.query,
    variables: params.variables || "{}", headers: {},
    description: params.description || "", tags: params.tags || [],
    isPublic: params.isPublic || false, createdBy: params.userId,
    collectionId: params.collectionId || null, shareUrl,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO saved_queries (id, name, query, variables, description, tags, is_public, created_by, collection_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [id, saved.name, saved.query, saved.variables, saved.description,
     JSON.stringify(saved.tags), saved.isPublic, params.userId, saved.collectionId]
  );

  return saved;
}

// Get query history
export async function getHistory(userId: string): Promise<any[]> {
  const items = await redis.lrange(`gqlplay:history:${userId}`, 0, -1);
  return items.map((i) => JSON.parse(i)).reverse();
}

function estimateComplexity(query: string): number {
  let complexity = 1;
  const depth = (query.match(/\{/g) || []).length;
  complexity += depth * 10;
  const fields = (query.match(/\w+\s*[\({]/g) || []).length;
  complexity += fields * 5;
  return complexity;
}

function analyzeQueryContext(query: string, cursor: number): { level: string; parentType: string | null } {
  const before = query.slice(0, cursor);
  const braces = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
  if (braces <= 1) return { level: "root", parentType: null };
  return { level: "field", parentType: "Query" };
}

function formatType(type: any): string {
  if (!type) return "Unknown";
  if (type.kind === "NON_NULL") return `${formatType(type.ofType)}!`;
  if (type.kind === "LIST") return `[${formatType(type.ofType)}]`;
  return type.name || "Unknown";
}

function formatField(f: any): SchemaField {
  return { name: f.name, description: f.description, type: formatType(f.type), args: f.args || [], isDeprecated: f.isDeprecated, deprecationReason: f.deprecationReason };
}

function generateQueryTemplate(field: SchemaField): string {
  const args = field.args.length > 0
    ? `(${field.args.map((a: any) => `${a.name}: $${a.name}`).join(", ")})`
    : "";
  return `${field.name}${args} {\n  \n}`;
}

interface SchemaType { name: string; description: string; kind: string; fields: SchemaField[] }
interface SchemaField { name: string; description: string; type: string; args: any[]; isDeprecated: boolean; deprecationReason: string | null }
```

## Results

- **Support tickets: 200/month → 60** — inline schema docs with deprecation warnings answer "how do I query X?" before users ask
- **Time to first query: 30 min → 3 min** — autocompletion and query templates; developers explore the API without reading docs
- **Shared queries accelerate onboarding** — senior developer saves complex query, shares URL; junior developer runs it immediately; team ramp-up time halved
- **Deprecated fields visible** — ⚠️ icon on deprecated fields with migration guidance; clients stop using old fields before removal
- **Query complexity protection** — playground shows complexity score before execution; developers learn to write efficient queries; production API stays fast
