---
title: "Migrate from REST to GraphQL Without Breaking Existing Clients"
slug: migrate-rest-to-graphql
description: "Incrementally adopt GraphQL alongside your REST API so existing clients keep working while new ones get the benefits of a unified graph."
skills: [graphql, api-tester, code-migration]
category: development
tags: [graphql, rest-api, migration, backward-compatibility, api-gateway]
---

# Migrate from REST to GraphQL Without Breaking Existing Clients

## The Problem

Your backend has dozens of REST endpoints accumulated over years. Mobile clients over-fetch data, the frontend team maintains a fragile BFF layer, and every new feature requires coordinating three endpoint changes. You want GraphQL, but you cannot flip a switch — production clients depend on every existing route, and a big-bang rewrite would stall feature work for months.

## The Solution

Use an incremental strangler-fig approach: stand up a GraphQL gateway that wraps existing REST endpoints, migrate consumers one screen at a time, and deprecate old routes only after traffic drops to zero. Three skills work together to make this safe.

```bash
npx terminal-skills install graphql-migration api-tester code-migration
```

## Step-by-Step Walkthrough

### 1. Audit existing REST endpoints

```text
Scan the routes directory in src/routes/ and list every REST endpoint with its HTTP method, path, request params, and response shape. Group them by domain (users, orders, products). Flag endpoints that return nested resources — those benefit most from GraphQL.
```

The agent produces a structured inventory:

```text
Found 34 REST endpoints across 4 domains:
- Users (8 endpoints): GET /users, GET /users/:id, POST /users, ...
- Orders (12 endpoints): GET /orders?status=pending, GET /orders/:id/items, ...
- Products (9 endpoints): heavy nesting — GET /products/:id returns seller, reviews, variants
- Auth (5 endpoints): login, refresh, logout, verify, reset-password

High-value migration candidates (nested responses causing over-fetch):
  GET /products/:id — returns 4.2 KB avg, clients use ~800 bytes
  GET /orders/:id  — includes line items, shipping, payment in one blob
```

### 2. Generate the GraphQL schema from REST contracts

```text
Based on the endpoint audit, generate a GraphQL schema (schema.graphql) that covers Users, Orders, and Products. Map each REST response shape to a GraphQL type. Add relay-style pagination for list endpoints. Keep field names consistent with the existing JSON keys so serialization stays stable.
```

### 3. Create resolver layer that delegates to REST handlers

```text
For each GraphQL type, generate resolvers in src/graphql/resolvers/ that call the existing REST service functions directly (not over HTTP). Use DataLoader for batching — especially for orders→products and products→reviews relationships. Add error mapping from REST status codes to GraphQL errors.
```

### 4. Set up the compatibility proxy

```text
Configure the API gateway so that existing REST routes still work unchanged. Add a /graphql endpoint alongside them. Write an Express middleware that checks the Accept header — requests with application/json hit REST, requests with application/graphql hit the new layer. Add request logging to track which clients still use REST.
```

### 5. Validate with parallel testing

```text
Write integration tests that call both the old REST endpoint and the equivalent GraphQL query, then diff the responses. Run them against GET /products/:id, GET /orders?status=pending, and GET /users/:id. Report any field mismatches or missing data.
```

The agent runs both paths and reports:

```text
Parallel test results (3 endpoint pairs):
✅ GET /products/:id vs query { product(id: "p-42") { ... } } — fields match
⚠️  GET /orders?status=pending — REST returns `created_at`, GraphQL returns `createdAt`
    → Fix: add field alias in schema or update resolver mapping
✅ GET /users/:id — exact match after alias fix
```

## Real-World Example

A lead backend engineer at a mid-size e-commerce company manages an API consumed by a React web app, two native mobile apps, and three third-party integrations. The mobile team complains about slow list screens because the orders endpoint returns 6 KB per item when they need 400 bytes.

1. She asks the agent to audit all 34 endpoints and rank them by over-fetch ratio
2. The agent generates a GraphQL schema covering the top three domains in 20 minutes
3. Resolvers are scaffolded with DataLoader batching, reusing existing service functions
4. The compatibility proxy routes old clients to REST and new clients to GraphQL
5. Parallel tests catch one field-naming inconsistency before anything ships
6. After deploying, mobile payload drops 82 % on the orders screen, and no existing client breaks
