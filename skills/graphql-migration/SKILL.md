---
name: graphql-migration
description: >-
  Migrate REST APIs to GraphQL incrementally. Use when someone asks to
  "add GraphQL", "wrap REST in GraphQL", "strangler fig migration",
  "generate schema from endpoints", or "reduce over-fetching". Covers
  schema generation from REST response shapes, resolver scaffolding with
  DataLoader batching, compatibility proxy setup, and deprecation tracking.
license: Apache-2.0
compatibility: "Node.js 18+, works with Express, Fastify, or Koa"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["graphql", "rest-api", "migration", "api-design"]
---

# GraphQL Migration

## Overview

This skill helps AI agents guide an incremental migration from REST to GraphQL. Instead of a risky rewrite, it uses a strangler-fig pattern: GraphQL resolvers delegate to existing REST service functions, a compatibility proxy keeps old routes alive, and traffic metrics decide when to retire them.

## Instructions

### Phase 1 — Audit

1. Scan route definitions (Express `router.*`, Fastify `fastify.*`, or equivalent).
2. For each route extract: method, path, path/query params, response shape (from types, JSDoc, or sample responses).
3. Group endpoints by domain noun (users, orders, products).
4. Calculate an "over-fetch score" for each endpoint: `response_size / typical_client_usage`. Rank by score descending.
5. Output a markdown table with columns: Domain, Method, Path, Response Fields, Over-Fetch Score.

### Phase 2 — Schema Generation

1. Map each REST response shape to a GraphQL type. Rules:
   - `snake_case` JSON keys → `camelCase` GraphQL fields.
   - Nested objects become separate types with relationships.
   - Arrays of resources get Relay-style Connection types with `edges`, `node`, `pageInfo`.
   - ID fields use `ID!` scalar.
2. Create Query root fields: one for single-resource fetch, one for list with pagination.
3. Create Mutation root fields only for POST/PUT/PATCH/DELETE endpoints.
4. Write the schema to `schema.graphql` at the project root.

### Phase 3 — Resolver Scaffolding

1. For each Query/Mutation field, generate a resolver file in `src/graphql/resolvers/`.
2. Resolvers must call existing service functions directly (e.g., `userService.getById(id)`) — never call REST over HTTP internally.
3. Add DataLoader instances for any relationship that could cause N+1 queries:
   ```js
   const productLoader = new DataLoader(ids => productService.getByIds(ids));
   ```
4. Map service-layer errors to GraphQL errors with appropriate extensions:
   - 404 → `extensions: { code: 'NOT_FOUND' }`
   - 403 → `extensions: { code: 'FORBIDDEN' }`
   - 422 → `extensions: { code: 'VALIDATION_ERROR' }`

### Phase 4 — Compatibility Proxy

1. Mount the GraphQL endpoint at `/graphql` using Apollo Server or Mercurius.
2. Keep all existing REST routes unchanged.
3. Add a middleware that logs per-route traffic counts to a metrics store.
4. Add a `Sunset` header to REST responses once a GraphQL equivalent exists.
5. Create a dashboard query that shows REST traffic trending over time so the team knows when it is safe to remove a route.

### Phase 5 — Validation

1. For each migrated endpoint, write a parallel test that:
   - Calls the REST endpoint.
   - Calls the equivalent GraphQL query.
   - Deep-diffs the response payloads (ignoring key casing differences).
2. Report mismatches with field path and expected vs actual values.

## Examples

### Example 1 — Schema from REST response

**Input:** "Generate a GraphQL type for this REST response from GET /products/:id"
```json
{
  "id": "p-42",
  "product_name": "Wireless Keyboard",
  "price_cents": 4999,
  "seller": { "id": "s-7", "name": "TechGear", "rating": 4.8 },
  "reviews": [{ "id": "r-1", "score": 5, "text": "Great!" }]
}
```

**Output:**
```graphql
type Product {
  id: ID!
  productName: String!
  priceCents: Int!
  seller: Seller!
  reviews(first: Int, after: String): ReviewConnection!
}

type Seller {
  id: ID!
  name: String!
  rating: Float!
}

type Review {
  id: ID!
  score: Int!
  text: String!
}

type ReviewConnection {
  edges: [ReviewEdge!]!
  pageInfo: PageInfo!
}
```

### Example 2 — Resolver with DataLoader

**Input:** "Create a resolver for the `product` query that uses DataLoader for the seller relationship."

**Output:**
```js
// src/graphql/resolvers/product.js
import DataLoader from 'dataloader';
import * as productService from '../../services/product.js';
import * as sellerService from '../../services/seller.js';

const sellerLoader = new DataLoader(ids =>
  sellerService.getByIds(ids).then(sellers =>
    ids.map(id => sellers.find(s => s.id === id))
  )
);

export const resolvers = {
  Query: {
    product: (_, { id }) => productService.getById(id),
  },
  Product: {
    seller: (product) => sellerLoader.load(product.sellerId),
    reviews: (product, { first = 10, after }) =>
      productService.getReviews(product.id, { first, after }),
  },
};
```

## Guidelines

- **Never remove REST routes until traffic is zero.** The strangler-fig works only if old clients are unaffected.
- **Batch aggressively.** Any resolver that fetches a related resource by ID needs a DataLoader.
- **Preserve field semantics.** If REST returns `price_cents` as an integer, the GraphQL field `priceCents` must also be an integer — do not silently convert to dollars.
- **Test with real payloads.** Parallel tests should use production-like data, not stubs.
- **Add deprecation notices gradually.** Use the `@deprecated` directive in the schema and the `Sunset` HTTP header on REST responses.
