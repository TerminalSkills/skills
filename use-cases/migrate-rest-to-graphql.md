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

Your backend has dozens of REST endpoints accumulated over years. Mobile clients over-fetch data -- the orders endpoint returns 6 KB per item when the app needs 400 bytes, and on a cellular connection that wasted bandwidth is the difference between a snappy list and a loading spinner. The frontend team maintains a fragile Backend-for-Frontend layer that stitches together 3-4 REST calls per screen, and every time the backend adds a field, the BFF needs a matching update or the mobile app shows stale data.

Every new feature requires coordinating endpoint changes across backend, BFF, and multiple clients. The mobile team asks for a "light" version of the orders endpoint, the backend team creates `/api/orders/summary`, and six months later there are 4 variants of the same endpoint with subtly different response shapes. You want GraphQL -- let clients declare exactly what they need -- but you cannot flip a switch. Production clients depend on every existing route, third-party integrations have hardcoded URLs, and a big-bang rewrite would stall feature work for months.

## The Solution

Using an incremental strangler-fig approach with the **graphql**, **api-tester**, and **code-migration** skills (code-migration supplies the phased plan and the per-file execution; api-tester the parallel checks), the agent stands up a GraphQL gateway that wraps existing REST service functions, migrates consumers one screen at a time, and deprecates old routes only after traffic drops to zero. Existing clients never break because the REST endpoints keep working unchanged.

## Step-by-Step Walkthrough

### Step 1: Audit Existing REST Endpoints

```text
Scan the routes directory in src/routes/ and list every REST endpoint with its
HTTP method, path, request params, and response shape. Group them by domain
(users, orders, products). Flag endpoints that return nested resources — those
benefit most from GraphQL.
```

The audit produces a structured inventory of 34 REST endpoints across 4 domains:

| Domain | Endpoints | Notes |
|--------|-----------|-------|
| Users | 8 | `GET /users`, `GET /users/:id`, `POST /users`, ... |
| Orders | 12 | `GET /orders?status=pending`, `GET /orders/:id/items`, ... |
| Products | 9 | Heavy nesting -- `GET /products/:id` returns seller, reviews, variants |
| Auth | 5 | login, refresh, logout, verify, reset-password |

The high-value migration candidates are the endpoints with the worst over-fetch ratios. `GET /products/:id` returns 4.2 KB on average, but clients typically use about 800 bytes -- the rest is nested seller data, all review objects, and variant details the client doesn't need for most views. `GET /orders/:id` bundles line items, shipping details, and payment info into one blob even when the client only needs the order status.

Next, the code-migration skill's assess-then-plan routine turns the audit into a phased plan: (1) add `/graphql` with no REST changes, (2) move one screen at a time, (3) deprecate REST routes only once their traffic is zero. Each phase is non-breaking and can be reverted on its own.

These endpoints cause the most pain for mobile clients on slow connections and are exactly where GraphQL's field selection pays off immediately.

### Step 2: Generate the GraphQL Schema from REST Contracts

```text
Based on the endpoint audit, generate a GraphQL schema (schema.graphql) that
covers Users, Orders, and Products. Map each REST response shape to a GraphQL
type. Add relay-style pagination for list endpoints. Keep field names consistent
with the existing JSON keys so serialization stays stable.
```

The schema maps each REST response shape to a GraphQL type, preserving field names so the data layer doesn't change -- only the query interface. List endpoints get relay-style pagination with `first`, `after`, `last`, `before` arguments and `PageInfo` types. Relationships that required multiple REST calls (products to reviews, orders to line items) become natural graph edges:

```graphql
type Product {
  id: ID!
  name: String!
  price: Int!
  seller: User!              # Was a nested object in REST, now lazily resolved
  reviews(first: Int): ReviewConnection!  # Was always included, now opt-in
  variants: [Variant!]!
}

type Order {
  id: ID!
  status: OrderStatus!
  items: [LineItem!]!        # Only fetched when requested
  shipping: ShippingInfo     # Only fetched when requested
  payment: PaymentInfo       # Only fetched when requested
}
```

A mobile client that only needs `order.id` and `order.status` now gets exactly those two fields -- not the full 6 KB payload.

### Step 3: Create the Resolver Layer with DataLoader Batching

```text
For each GraphQL type, generate resolvers in src/graphql/resolvers/ that call
the existing REST service functions directly (not over HTTP). Use DataLoader
(created per request) for batching — especially for orders->products and products->reviews
relationships. Add error mapping from REST status codes to GraphQL errors.
```

This is where the strangler-fig pattern shines. Resolvers call the existing service functions -- the same `getOrderById()`, `getProductsByIds()`, and `getUserById()` that the REST handlers call. No HTTP round-trips, no duplicated business logic. The GraphQL layer is a thin query interface on top of proven code.

DataLoader solves the N+1 problem that would otherwise kill performance. When a query requests 50 orders with their products, DataLoader batches those 50 individual `getProductById()` calls into a single `getProductsByIds([...])` call. Without it, a list of 50 orders with products would fire 50 separate database queries.

Error mapping (throw `GraphQLError` with an `extensions.code`) translates REST conventions to GraphQL -- and this is trickier than it sounds. A REST 404 becomes a null field with an optional error in the `errors` array (because in GraphQL, a missing product in a list shouldn't fail the whole query). A 401 becomes an `UNAUTHENTICATED` error code that triggers the client's auth refresh flow. A 422 maps validation errors to field-level error extensions so the UI can highlight the exact form field that failed.

The resolver layer also handles the authentication pass-through: the GraphQL context extracts the JWT from the request headers and passes the authenticated user to every resolver, exactly like the REST middleware does today.

### Step 4: Mount GraphQL Next to the REST Routes

```text
Add a /graphql endpoint to the existing Express app with Apollo Server 5, next to
the REST routes. Leave every REST route unchanged. Add request logging that records
which API key or User-Agent still calls each REST endpoint. Turn introspection off
in production and add a query depth limit.
```

Both interfaces run side by side on the same server. Install Apollo Server 5 with `npm install @apollo/server graphql@16 @as-integrations/express4 dataloader graphql-depth-limit` (use `@as-integrations/express5` on Express 5). The `expressMiddleware` function comes from that integration package, not from `@apollo/server`. There is no content negotiation to write: GraphQL clients send `POST /graphql` with `Content-Type: application/json` and a body of `{ "query": "...", "variables": {...} }`, while REST clients keep calling their old URLs. The cutover is per client.

Create the DataLoaders **per request** (in the Apollo `context` function), together with the authenticated user from the JWT. A loader shared across requests would cache one user's data and serve it to another.

Request logging tracks REST usage by endpoint and by client. When traffic on a REST endpoint stays at zero for an agreed period (30 days is a common choice), it is safe to deprecate. Until then it stays live and unchanged. The React web app can migrate this sprint while the mobile apps stay on REST for another quarter, and the third-party integrations can take as long as they need.

### Step 5: Validate with Parallel Testing

With the **api-tester** skill, the agent sends the same request through both interfaces and diffs the results:

```text
Write integration tests that call both the old REST endpoint and the equivalent
GraphQL query against the local dev server, then diff the responses. Run them
against GET /products/:id, GET /orders?status=pending, and GET /users/:id. Report
any field mismatches or missing data.
```

A GraphQL call in the test is a plain JSON POST:

```bash
curl -s --max-time 30 -X POST http://127.0.0.1:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"query":"query($id: ID!){ product(id: $id){ id name price } }","variables":{"id":"p-42"}}'
```

Parallel tests diff the REST and GraphQL responses field by field:

| Endpoint Pair | Result | Issue |
|--------------|--------|-------|
| `GET /products/:id` vs `query { product(id: "p-42") { ... } }` | Match | -- |
| `GET /orders?status=pending` vs `query { orders(status: PENDING) { ... } }` | Mismatch | REST returns `created_at`, GraphQL returns `createdAt` |
| `GET /users/:id` vs `query { user(id: "u-1") { ... } }` | Match | After alias fix |

The `created_at` vs `createdAt` mismatch is the kind of subtle inconsistency that parallel testing catches before production. The REST API uses snake_case while the GraphQL schema followed JavaScript camelCase. Pick one convention for the GraphQL schema and map it in the resolver; the database column and the REST response stay `created_at`. Run these tests in CI on every PR that touches resolvers. Also assert that an unauthenticated request gets an `UNAUTHENTICATED` error and that a query nested deeper than the depth limit is rejected.

## Real-World Example

A lead backend engineer at a mid-size e-commerce company manages an API consumed by a React web app, two native mobile apps, and three third-party integrations. The mobile team has been complaining for months about slow list screens -- the orders endpoint returns 6 KB per item when they need 400 bytes, and on cellular connections the wasted bandwidth is visible in scroll jank and loading spinners.

She asks the agent to audit all 34 endpoints and rank them by over-fetch ratio. The agent generates a GraphQL schema covering the top three domains in 20 minutes. Resolvers are scaffolded with DataLoader batching, reusing the existing service functions that have been battle-tested in production for years. Old clients stay on REST and new clients use `/graphql` -- both running on the same server.

Parallel tests catch the one field-naming inconsistency before anything ships. After deploying, the mobile team migrates the orders screen to GraphQL. In the team's own measurements the payload drops from 6 KB per order to 1.1 KB. No existing client breaks. The REST endpoints stay live, gradually losing traffic as teams migrate screen by screen.

Three months later, most traffic flows through GraphQL. The BFF layer that stitched together multiple REST calls is gone -- GraphQL queries handle the composition natively. The backend team ships features faster because a single schema change serves all clients, instead of coordinating three endpoint updates across backend, BFF, and mobile.

The REST endpoints for Users and Products still serve the three third-party integrations, which have no incentive to migrate. That's fine -- the REST routes were never touched, so they keep working with no extra maintenance. The REST traffic dashboard shows a slow decline as integrators update at their own pace. One of them migrated to GraphQL voluntarily after seeing the mobile team's payload reduction numbers.

The biggest surprise: backend development velocity increased. Adding a new field to the API used to require updating the REST endpoint, the BFF transformation, and notifying mobile to update their parsing. Now it's one line in the schema, one line in the resolver, and every client gets it immediately -- or ignores it if they don't need it. The schema itself serves as living API documentation, replacing the Swagger docs that were perpetually out of date.

