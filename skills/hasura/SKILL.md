---
name: hasura
description: Hasura GraphQL Engine v2 generates a real-time GraphQL API (queries, mutations, subscriptions) over PostgreSQL and other databases, with row-level permissions per role. Use when a user asks to set up or self-host Hasura with Docker, write permission rules, add Actions or Event Triggers for business logic, or manage migrations and metadata with the Hasura CLI. Covers Hasura v2 (graphql-engine), not Hasura DDN (v3).
license: Apache-2.0
compatibility: Docker and a PostgreSQL database. Written for Hasura GraphQL Engine v2 (checked against v2.50); does not apply to Hasura DDN.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
  - graphql
  - postgres
  - api
  - real-time
  - permissions
  repository: https://github.com/hasura/graphql-engine
---

# Hasura — Instant GraphQL API on PostgreSQL

## Overview

Hasura GraphQL Engine connects to a database and serves a GraphQL API for every tracked table: filtering, sorting, pagination, aggregations, mutations and live subscriptions, with access rules per role. Custom logic is attached through Actions (your HTTP handler behind a GraphQL field) and Event Triggers (webhooks on row changes).

**This skill covers Hasura v2** — the `hasura/graphql-engine` server, the `hasura` CLI and YAML metadata. Hasura DDN (v3) is a separate product with its own `ddn` CLI, `supergraph.yaml` projects, HML metadata and data connectors; nothing below (env vars, metadata files, CLI commands) carries over to it. `hasura.io/docs/latest` now points at DDN, so use `hasura.io/docs/2.0` for v2.

## Instructions

### Quick Start

```yaml
# docker-compose.yml — local development
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:   # Hasura exits if Postgres is not accepting connections yet
      { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: 5s, retries: 10 }
  hasura:
    image: hasura/graphql-engine:v2.50.3.cli-migrations-v3   # server + bundled CLI
    user: "${HOST_UID}:${HOST_GID}"                           # files the CLI writes stay yours
    ports: ["8080:8080"]
    environment:
      # Registers this database as the source named "default"
      HASURA_GRAPHQL_DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres
      HASURA_GRAPHQL_ADMIN_SECRET: ${HASURA_GRAPHQL_ADMIN_SECRET}
      HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
      HASURA_GRAPHQL_DEV_MODE: "true"          # detailed errors; turn off in production
      ACTION_BASE_URL: http://api:3000
      EVENT_WEBHOOK_SECRET: ${EVENT_WEBHOOK_SECRET}
    volumes: ["./hasura:/project"]
    depends_on:
      postgres:
        condition: service_healthy
volumes:
  pgdata:
```

```bash
export HOST_UID=$(id -u) HOST_GID=$(id -g)     # plus the three secrets, or put all five in .env
mkdir -p hasura && docker compose up -d        # create ./hasura yourself, or Docker creates it root-owned
curl -s localhost:8080/healthz                 # OK
# Console at http://localhost:8080/console, GraphQL at http://localhost:8080/v1/graphql
```

`HASURA_GRAPHQL_DATABASE_URL` is kept for backwards compatibility. The official manifests instead set `HASURA_GRAPHQL_METADATA_DATABASE_URL` plus a variable of your choice such as `PG_DATABASE_URL`; with that layout no source exists until you add one in the Console or in `metadata/databases/databases.yaml` (`database_url: { from_env: PG_DATABASE_URL }`).

### Auto-Generated API

```graphql
# After tracking a "users" table, Hasura serves these operations:
query {
  users(
    where: { plan: { _eq: "pro" }, created_at: { _gte: "2026-01-01" } }
    order_by: { created_at: desc }, limit: 20, offset: 0
  ) {
    id email
    # Relationship defined on the users → orders foreign key
    orders(where: { status: { _eq: "paid" } }) { id amount }
    orders_aggregate { aggregate { count sum { amount } } }
  }
  users_aggregate(where: { plan: { _eq: "pro" } }) { aggregate { count } }
}

mutation {
  insert_users_one(object: { email: "maria@northwind.dev", plan: "free" }) { id }
  update_users(where: { id: { _eq: "60d686a1-c947-487b-a53e-3ed6c078f3ff" } }, _set: { plan: "pro" }) {
    affected_rows
    returning { id plan }
  }
}

# Live query over WebSocket: re-sent whenever the result changes
subscription {
  orders(where: { status: { _eq: "pending" } }) { id amount created_at }
}
```

### Permissions (Row-Level Security)

```yaml
# metadata/databases/default/tables/public_orders.yaml
table: { name: orders, schema: public }
object_relationships:
  - name: user
    using: { foreign_key_constraint_on: user_id }
# Select: users can only see their own orders
select_permissions:
  - role: user
    permission:
      columns: [id, amount, status, created_at]
      filter:
        user_id: { _eq: X-Hasura-User-Id }
      limit: 100
# Insert: users create orders for themselves
insert_permissions:
  - role: user
    permission:
      columns: [amount]
      set:
        user_id: X-Hasura-User-Id    # Taken from the session, not from the client
        status: pending
      check:
        amount: { _gt: 0 }
# Update: users can only cancel their own pending orders
update_permissions:
  - role: user
    permission:
      columns: [status]
      filter:
        user_id: { _eq: X-Hasura-User-Id }
        status: { _eq: pending }
      check:
        status: { _eq: cancelled }
```

List each table file in `metadata/databases/default/tables/tables.yaml` (`- "!include public_orders.yaml"`). The `user` relationship is inconsistent unless `users` is tracked too: add a `public_users.yaml` containing `table: { name: users, schema: public }` and list it as well. The `admin` role bypasses all permissions and needs no rules. A role can only select, filter on and return the columns its select permission lists; aggregate fields appear only with `allow_aggregations: true`.

### Actions (Custom Business Logic)

An Action is declared in two files. The GraphQL signature and its types go in `metadata/actions.graphql`, the handler in `metadata/actions.yaml`:

```graphql
type Mutation {
  processPayment(order_id: uuid!, payment_method: String!): PaymentResult
}
type PaymentResult {
  success: Boolean!
  payment_id: String!
}
```

```yaml
# metadata/actions.yaml — handler and permissions
actions:
  - name: processPayment
    definition:
      kind: synchronous
      handler: "{{ACTION_BASE_URL}}/actions/process-payment"   # env var on the Hasura server
      forward_client_headers: true
    permissions:
      - role: user
custom_types:
  enums: []
  input_objects: []
  objects:
    - name: PaymentResult
  scalars: []
```

```typescript
// api/actions/process-payment.ts — Hasura POSTs { action, input, session_variables, request_query }
export default async function handler(req: Request) {
  const { input, session_variables } = await req.json();
  const userId = session_variables["x-hasura-user-id"];   // keys are always lowercase
  const order = await db.query(
    "SELECT id, amount FROM orders WHERE id = $1 AND user_id = $2 AND status = 'pending'",
    [input.order_id, userId]
  );
  if (!order.rows[0]) {
    // Errors: 4xx status and a body with "message" (plus optional "extensions")
    return Response.json({ message: "Order not found", extensions: { code: "not-found" } }, { status: 400 });
  }
  const paymentId = await chargeCard(order.rows[0], input.payment_method);
  await db.query("UPDATE orders SET status = 'paid' WHERE id = $1", [input.order_id]);
  return Response.json({ success: true, payment_id: paymentId });   // 2xx + the output type's shape
}
```

### Event Triggers

```yaml
# metadata/databases/default/tables/public_orders.yaml (same file as the permissions)
event_triggers:
  - name: on_order_paid
    definition:
      enable_manual: false
      update:
        columns: [status]
    retry_conf: { num_retries: 3, interval_sec: 10, timeout_sec: 60 }
    webhook: http://api:3000/webhooks/order-paid
    headers:
      - name: x-webhook-secret
        value_from_env: EVENT_WEBHOOK_SECRET
```

```typescript
// api/webhooks/order-paid.ts — body: { event: { op, data: { old, new } }, table, trigger, id }
export default async function handler(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.EVENT_WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });
  const { old: oldRow, new: newRow } = (await req.json()).event.data;
  // The trigger fires on every change of "status" — filter for the transition you want
  if (newRow.status === "paid" && oldRow?.status !== "paid") await sendEmail(newRow.user_id, `Order #${newRow.id} paid`);
  return Response.json({ success: true });   // any non-2xx response is retried per retry_conf
}
```

### Migrations

```bash
# One-time: scaffold config.yaml, metadata/, migrations/, seeds/
hasura init shop --endpoint http://localhost:8080
# Create and apply a schema change
hasura migrate create create_shop_tables --database-name default \
  --up-sql "CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, plan text NOT NULL DEFAULT 'free', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), amount integer NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());" \
  --down-sql "DROP TABLE orders; DROP TABLE users;"
hasura migrate apply --database-name default
# Push the metadata directory to the server and confirm it is consistent
hasura metadata apply && hasura metadata ic list
# Capture what was changed in the Console
hasura metadata export
hasura migrate create init --from-server --database-name default
```

The CLI reads the admin secret from the `HASURA_GRAPHQL_ADMIN_SECRET` environment variable. Passing `--admin-secret` to `hasura init` writes it into `config.yaml`.

## Installation

```bash
# CLI: bundled in the cli-migrations image as hasura-cli; the admin secret comes from the container env (run `init shop` with -w /project)
docker compose exec -e HOME=/tmp -w /project/shop hasura \
  hasura-cli migrate status --database-name default
# CLI via npm: community-maintained wrapper, not supported by Hasura; npm "latest" is 2.38.0
npm install --save-dev hasura-cli
```

Pin image versions (`hasura/graphql-engine:v2.50.3` is the plain server); `latest` moves between minor releases. Standalone CLI binaries (`cli-hasura-linux-amd64`, `cli-hasura-darwin-arm64`, …) are attached to each GitHub release, without published checksums. The `cli-migrations-v3` image also applies `/hasura-migrations` and `/hasura-metadata` on startup when those directories are mounted, which suits CI/CD deployments.

## Examples

### Example 1: Local Hasura where each user sees only their own orders

**User request:** "Set up Hasura locally for my users and orders tables. A logged-in user must only see their own orders."

The agent writes the compose file, the migration and `public_orders.yaml` above, runs `docker compose up -d`, `hasura migrate apply --database-name default` and `hasura metadata apply`, then checks the rule by sending the same query as two different users (the admin secret lets a request impersonate any role):

```bash
curl -s localhost:8080/v1/graphql -H "content-type: application/json" \
  -H "x-hasura-admin-secret: $HASURA_GRAPHQL_ADMIN_SECRET" \
  -H "x-hasura-role: user" \
  -H "x-hasura-user-id: 60d686a1-c947-487b-a53e-3ed6c078f3ff" \
  -d '{"query":"{ orders { amount status } }"}'
# {"data":{"orders":[{"amount":4900,"status":"pending"}]}}
```

With another user's ID in `x-hasura-user-id` the result is `{"data":{"orders":[]}}`. With no headers at all: `"x-hasura-admin-secret" required, but not found`.

### Example 2: Let users cancel an order but never mark it paid

**User request:** "Customers should be able to cancel their own pending orders from the app, and nothing else."

The agent adds the `update_permissions` rule above and applies the metadata. As role `user`, setting `status` to `paid` is rejected and `cancelled` goes through:

```graphql
mutation {
  update_orders_by_pk(pk_columns: { id: "03b7104f-c239-416b-abf6-c7f91ea5779c" }, _set: { status: "paid" }) { id status }
}
```

```json
{"errors":[{"message":"check constraint of an insert/update permission has failed","extensions":{"path":"$","code":"permission-error"}}]}
{"data":{"update_orders_by_pk":{"id":"03b7104f-c239-416b-abf6-c7f91ea5779c","status":"cancelled"}}}
```

## Guidelines

1. **v2 or DDN** — Check which product the project uses before touching it: `config.yaml` with `version: 3` and a `metadata/` directory of YAML is v2; `supergraph.yaml` and the `ddn` CLI mean DDN, and this skill does not apply
2. **Permissions on every table** — Tables without permissions are invisible to non-admin roles; define permissions as part of your schema
3. **Use relationships** — Define foreign key relationships; Hasura auto-generates nested queries (no N+1 problem)
4. **Event triggers for side effects** — Use event triggers (not polling) for email, notifications, and external API calls; delivery is at-least-once and may arrive out of order, so make handlers idempotent
5. **Actions for business logic** — Complex operations (payments, multi-step workflows) go in Actions, not in client code; verify a shared secret header in the handler so only Hasura can call it
6. **Migrations in CI/CD** — Export metadata and migrations; apply them with the CLI or the `cli-migrations-v3` image in your deployment pipeline
7. **Admin secret ≠ user auth** — Always set `HASURA_GRAPHQL_ADMIN_SECRET`; without it the GraphQL endpoint and Console are open to anyone. Use JWT (`HASURA_GRAPHQL_JWT_SECRET`, claims under `https://hasura.io/jwt/claims` with `x-hasura-default-role` and `x-hasura-allowed-roles`) or webhook auth for users; never ship the admin secret to a browser
8. **Production settings** — Set `HASURA_GRAPHQL_ENABLE_CONSOLE` and `HASURA_GRAPHQL_DEV_MODE` to `"false"`; dev mode leaks internal error details
9. **Subscriptions for real-time** — Use GraphQL subscriptions instead of polling; Hasura handles WebSocket efficiently
10. **Use views for complex queries** — Create PostgreSQL views for complex aggregations; track them as tables in Hasura
