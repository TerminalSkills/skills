---
name: hasura
description: Expert guidance for Hasura, the GraphQL engine that gives the agent instant, real-time GraphQL APIs over PostgreSQL (and other databases). Helps developers set up Hasura, configure permissions, write custom business logic with Actions and Event Triggers, and optimize GraphQL queries for production.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - graphql
  - postgres
  - api
  - real-time
  - permissions
---

# Hasura — Instant GraphQL API on PostgreSQL


## Overview


Hasura, the GraphQL engine that gives the user instant, real-time GraphQL APIs over PostgreSQL (and other databases). Helps developers set up Hasura, configure permissions, write custom business logic with Actions and Event Triggers, and optimize GraphQL queries for production.


## Instructions

### Quick Start

```bash
# Docker Compose for local development
cat > docker-compose.yml << 'EOF'
version: "3.6"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgrespassword
    volumes:
      - pgdata:/var/lib/postgresql/data

  hasura:
    image: hasura/graphql-engine:v2.42.0
    ports:
      - "8080:8080"
    environment:
      HASURA_GRAPHQL_DATABASE_URL: postgres://postgres:postgrespassword@postgres:5432/postgres
      HASURA_GRAPHQL_ADMIN_SECRET: mysecretkey
      HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
      HASURA_GRAPHQL_DEV_MODE: "true"
      HASURA_GRAPHQL_ENABLED_LOG_TYPES: startup,http-log,query-log
    depends_on:
      - postgres

volumes:
  pgdata:
EOF

docker compose up -d
# Console at http://localhost:8080/console
```

### Auto-Generated API

```graphql
# After creating a "users" table in PostgreSQL,
# Hasura auto-generates these operations:

# Query all users with filtering, sorting, pagination
query {
  users(
    where: { plan: { _eq: "pro" }, created_at: { _gte: "2026-01-01" } }
    order_by: { created_at: desc }
    limit: 20
    offset: 0
  ) {
    id
    email
    plan
    created_at
    # Nested relationship (auto-detected from foreign keys)
    posts(where: { published: { _eq: true } }) {
      id
      title
    }
    posts_aggregate {
      aggregate { count }
    }
  }
  # Aggregation
  users_aggregate(where: { plan: { _eq: "pro" } }) {
    aggregate {
      count
      avg { lifetime_value }
    }
  }
}

# Insert
mutation {
  insert_users_one(object: {
    email: "new@example.com"
    plan: "free"
  }) {
    id
  }
}

# Update
mutation {
  update_users(
    where: { id: { _eq: "user-123" } }
    _set: { plan: "pro" }
  ) {
    affected_rows
    returning { id plan }
  }
}

# Real-time subscription
subscription {
  users(where: { online: { _eq: true } }) {
    id
    email
    last_seen
  }
}
```

### Permissions (Row-Level Security)

```yaml
# metadata/databases/default/tables/public_orders.yaml
# Fine-grained permissions per role
table:
  name: orders
  schema: public

# Select: users can only see their own orders
select_permissions:
  - role: user
    permission:
      columns: [id, amount, status, created_at]
      filter:
        user_id: { _eq: X-Hasura-User-Id }
      limit: 100

  # Admin role: see all orders
  - role: admin
    permission:
      columns: "*"
      filter: {}
      allow_aggregations: true

# Insert: users can create orders for themselves
insert_permissions:
  - role: user
    permission:
      columns: [amount, items, shipping_address]
      set:
        user_id: X-Hasura-User-Id    # Auto-set from auth token
        status: pending               # Force initial status
      check:
        amount: { _gt: 0 }           # Validate: positive amount

# Update: users can only cancel their pending orders
update_permissions:
  - role: user
    permission:
      columns: [status]
      filter:
        user_id: { _eq: X-Hasura-User-Id }
        status: { _eq: "pending" }
      set: {}
      check:
        status: { _eq: "cancelled" }  # Can only set to cancelled
```

### Actions (Custom Business Logic)

```yaml
# metadata/actions.yaml — Extend GraphQL with custom resolvers
actions:
  - name: processPayment
    definition:
      kind: synchronous
      handler: http://api:3000/actions/process-payment
      type: mutation
      arguments:
        - name: order_id
          type: uuid!
        - name: payment_method
          type: String!
      output_type: PaymentResult
    permissions:
      - role: user
```

```typescript
// api/actions/process-payment.ts — Action handler
export default async function handler(req: Request) {
  const { input, session_variables } = await req.json();
  const userId = session_variables["x-hasura-user-id"];
  const { order_id, payment_method } = input;

  // Verify order belongs to user
  const order = await db.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [order_id, userId]);
  if (!order.rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  // Process payment via Stripe
  const charge = await stripe.charges.create({
    amount: order.rows[0].amount,
    currency: "usd",
    source: payment_method,
  });

  // Update order status
  await db.query("UPDATE orders SET status = 'paid', payment_id = $1 WHERE id = $2", [charge.id, order_id]);

  return Response.json({ success: true, payment_id: charge.id });
}
```

### Event Triggers

```yaml
# metadata/databases/default/tables/public_orders.yaml
event_triggers:
  - name: on_order_paid
    definition:
      enable_manual: false
      insert:
        columns: "*"
      update:
        columns: [status]
    retry_conf:
      num_retries: 3
      interval_sec: 10
    webhook: http://api:3000/webhooks/order-paid
    headers:
      - name: x-webhook-secret
        value_from_env: WEBHOOK_SECRET
```

```typescript
// api/webhooks/order-paid.ts — Event trigger handler
export default async function handler(req: Request) {
  const { event } = await req.json();
  const { old: oldRow, new: newRow } = event.data;

  // Only process when status changes to "paid"
  if (newRow.status === "paid" && oldRow?.status !== "paid") {
    // Send confirmation email
    await sendEmail(newRow.user_id, "Order Confirmed", `Order #${newRow.id} paid.`);
    // Update inventory
    await decrementInventory(newRow.items);
    // Notify fulfillment
    await notifyFulfillment(newRow);
  }

  return Response.json({ success: true });
}
```

### Migrations

```bash
# Apply metadata and migrations from code
hasura metadata apply
hasura migrate apply --database-name default

# Create a new migration
hasura migrate create add_orders_table --database-name default

# Export current state
hasura metadata export
hasura migrate create init --from-server --database-name default
```

## Installation

```bash
# CLI
npm install -g hasura-cli

# Docker
docker pull hasura/graphql-engine:latest

# Hasura Cloud (managed)
# https://cloud.hasura.io
```


## Examples


### Example 1: Building a feature with Hasura

**User request:**

```
Add a real-time collaborative quick start to my React app using Hasura.
```

The agent installs the package, creates the component with proper Hasura initialization, implements the quick start with event handling and state management, and adds TypeScript types for the integration.

### Example 2: Migrating an existing feature to Hasura

**User request:**

```
I have a basic auto-generated api built with custom code. Migrate it to use Hasura for better auto-generated api support.
```

The agent reads the existing implementation, maps the custom logic to Hasura's API, rewrites the components using Hasura's primitives, preserves existing behavior, and adds features only possible with Hasura (like Permissions, Actions).


## Guidelines

1. **Permissions on every table** — Tables without permissions are invisible to non-admin roles; define permissions as part of your schema
2. **Use relationships** — Define foreign key relationships; Hasura auto-generates nested queries (no N+1 problem)
3. **Event triggers for side effects** — Use event triggers (not polling) for email, notifications, and external API calls
4. **Actions for business logic** — Complex operations (payments, multi-step workflows) go in Actions, not in client code
5. **Migrations in CI/CD** — Export metadata and migrations; apply via CLI in your deployment pipeline
6. **Admin secret ≠ user auth** — Use JWT or webhook auth for users; admin secret is for CI/CD and internal tools only
7. **Subscriptions for real-time** — Use GraphQL subscriptions instead of polling; Hasura handles WebSocket efficiently
8. **Use views for complex queries** — Create PostgreSQL views for complex aggregations; track them as tables in Hasura
