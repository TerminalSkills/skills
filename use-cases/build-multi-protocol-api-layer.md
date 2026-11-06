---
title: "Build a Multi-Protocol API Layer with REST, GraphQL, and gRPC"
slug: build-multi-protocol-api-layer
description: "Design an API that serves REST for public clients, GraphQL for frontends, and gRPC for internal microservices from a single shared service layer."
skills:
  - grpc
  - rest-api
  - graphql
category: development
tags:
  - api-design
  - grpc
  - graphql
  - rest
  - microservices
---

# Build a Multi-Protocol API Layer with REST, GraphQL, and gRPC

## The Problem

Your platform has three types of consumers with conflicting needs. The mobile app wants a flexible GraphQL endpoint to fetch exactly the data each screen needs without over-fetching. Third-party partners demand a stable versioned REST API with OpenAPI documentation. Internal microservices need low-latency, type-safe communication with streaming support for real-time order updates. Building and maintaining three completely separate API implementations triples the surface area for bugs and drift.

## The Solution

Use the **rest-api** skill to design the public REST endpoints with proper versioning, the **graphql** skill to build the flexible query layer for frontends, and the **grpc** skill to set up internal service-to-service communication with Protocol Buffers. All three protocols share a single service layer so business logic is written once.

The code below was run together on Node 24 with Express 5, Apollo Server 5 (`graphql@16`), `graphql-ws`, `@grpc/grpc-js` and `@grpc/proto-loader`:

```bash
npm install express@5 zod express-rate-limit @apollo/server graphql@16 @as-integrations/express5 \
  dataloader graphql-ws ws @graphql-tools/schema graphql-subscriptions @grpc/grpc-js @grpc/proto-loader
```

## Step-by-Step Walkthrough

### 1. Design the shared service layer

Define the core business logic independent of any transport protocol.

> Create a service layer for our order management system with methods for createOrder, getOrder, listOrders, and updateOrderStatus. Each method should accept plain TypeScript types and return plain objects. No HTTP, no GraphQL, no Protobuf -- just business logic, domain errors, and an event emitter that fires when a status changes.

```typescript
// src/order-service.ts
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

class OrderService {
  private orders = new Map<string, Order>();
  readonly events = new EventEmitter();          // emits "status" { orderId, status, changedAt }

  async createOrder(input: { customerId: string; items: OrderItem[] }): Promise<Order> {
    if (input.items.length === 0) throw new ValidationError("An order needs at least one item");
    let totalCents = 0;
    for (const item of input.items) {
      const price = PRICES_CENTS[item.sku];
      if (price === undefined) throw new ValidationError(`Unknown SKU ${item.sku}`);
      totalCents += price * item.quantity;       // price comes from the server, never from the client
    }
    const order = { id: randomUUID(), ...input, totalCents, status: "PENDING", createdAt: new Date() } as Order;
    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(id: string): Promise<Order> { /* throws NotFoundError */ }

  // The cursor is the id of the last order returned
  async listOrders(opts: { customerId?: string; limit: number; after?: string }) {
    /* returns { orders, nextCursor } */
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = await this.getOrder(id);
    order.status = status;
    this.events.emit("status", { orderId: id, status, changedAt: new Date() });
    return order;
  }
}
export const orderService = new OrderService();
```

Each protocol maps the two domain errors to its own error model, and only the service decides what is valid.

### 2. Build the REST API for external partners

Partners need stable, versioned endpoints with comprehensive documentation.

> Wrap the order service in a REST API with versioned routes under /api/v1/. Include cursor-based pagination, proper HTTP status codes, validation with zod, and rate limiting at 100 requests per minute per API key. Document the routes in an OpenAPI 3.1 file.

```typescript
// src/rest.ts
const createOrderBody = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ sku: z.string(), quantity: z.int().min(1).max(100) })).min(1),
});

export const restRouter = express.Router();
restRouter.use(rateLimit({
  windowMs: 60_000,
  limit: 100,
  keyGenerator: (req) => req.get("x-api-key") ?? ipKeyGenerator(req.ip ?? ""),
}));

restRouter.post("/orders", async (req, res) => {
  res.status(201).json(await orderService.createOrder(createOrderBody.parse(req.body)));
});
restRouter.get("/orders/:id", async (req, res) => res.json(await orderService.getOrder(req.params.id)));
restRouter.get("/orders", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const after = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const { orders, nextCursor } = await orderService.listOrders({ limit, after });
  res.json({ data: orders, nextCursor });
});

// Express 5 forwards rejected promises to this handler
restRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", issues: err.issues });
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  res.status(500).json({ error: "Internal error" });
});
```

Mount it with `app.use("/api/v1", restRouter)` after `express.json({ limit: "100kb" })`. In a test run, an order with an unknown SKU or no items returned 400, a missing id returned 404, and `?limit=2` over four orders returned two pages with a `nextCursor` on the first and `null` on the second. Keep the rate-limit key behind real authentication: an `x-api-key` header is only a bucket name until you check it against your key store.

### 3. Add the GraphQL layer for frontends

The mobile app fetches orders, customer details, and shipping status in a single query instead of three REST calls.

> Create a GraphQL schema for orders with a nested customer resolver. Add DataLoader to batch the customer lookups and prevent N+1 problems. The mobile app needs to subscribe to order status changes in real time using GraphQL subscriptions over graphql-ws.

```typescript
// src/graphql.ts
const typeDefs = /* GraphQL */ `
  enum OrderStatus { PENDING CONFIRMED SHIPPED DELIVERED }
  type Customer { id: ID! name: String! }
  type Order { id: ID! status: OrderStatus! totalCents: Int! customer: Customer! }
  type OrderEdge { cursor: String! node: Order! }
  type OrderConnection { edges: [OrderEdge!]! nextCursor: String }
  type Query {
    order(id: ID!): Order
    orders(first: Int = 20, after: String): OrderConnection!
  }
  type Subscription { orderStatusChanged(orderId: ID!): Order! }
`;

// One DataLoader per request, so batching and caching never leak between users
export const makeContext = async () => ({ customers: new DataLoader(loadCustomersByIds) });

const pubsub = new PubSub();
orderService.events.on("status", async (u) =>
  pubsub.publish("STATUS", { orderStatusChanged: await orderService.getOrder(u.orderId) }));

export const schema = makeExecutableSchema({ typeDefs, resolvers: {
  Query: {
    order: (_, { id }) => orderService.getOrder(id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e))),
    orders: async (_, { first, after }) => {
      const r = await orderService.listOrders({ limit: Math.min(first, 100), after });
      return { edges: r.orders.map((o) => ({ cursor: o.id, node: o })), nextCursor: r.nextCursor };
    },
  },
  Order: { customer: (o, _, ctx) => ctx.customers.load(o.customerId) },
  Subscription: { orderStatusChanged: {
    subscribe: (_, { orderId }) => onlyOrder(pubsub.asyncIterableIterator("STATUS"), orderId),
    resolve: (payload) => payload.orderStatusChanged,
  } },
} });
```

`onlyOrder` is a small async generator that yields only the messages whose order id matches. Wire it with `new ApolloServer({ schema })` and `expressMiddleware(apollo, { context: makeContext })` from `@as-integrations/express5`, and serve subscriptions with `useServer({ schema, context: makeContext }, wss)` from `graphql-ws/use/ws`. A query for an order plus its customer resolved correctly, and a `SHIPPED` update reached a `graphql-ws` subscriber. Before production add authentication in `context` and query depth and cost limits.

### 4. Set up gRPC for internal services

The inventory and payment services communicate with the order service thousands of times per second.

> Define Protocol Buffer messages and service definitions for the order service, with server-side streaming of order status updates to the shipping tracker. On the client, set a deadline on every call and a retry policy for UNAVAILABLE.

The Protocol Buffer definition is the contract that all internal services compile against (`proto/orders.proto`, abridged to the messages used by `StreamOrderStatus`; `Create`, `Get` and `List` request and response messages follow the same pattern):

```protobuf
syntax = "proto3";
package orders.v1;

import "google/protobuf/timestamp.proto";

service OrderService {
  rpc CreateOrder (CreateOrderRequest) returns (Order);
  rpc GetOrder (GetOrderRequest) returns (Order);
  rpc ListOrders (ListOrdersRequest) returns (ListOrdersResponse);
  rpc StreamOrderStatus (StreamOrderStatusRequest) returns (stream OrderStatusUpdate);
}

message OrderItem { string sku = 1; int32 quantity = 2; }

message Order {
  string id = 1;
  string customer_id = 2;
  repeated OrderItem items = 3;
  int64 total_cents = 4;
  OrderStatus status = 5;
  google.protobuf.Timestamp created_at = 6;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
}

message ListOrdersRequest { string customer_id = 1; int32 page_size = 2; string page_token = 3; }
message ListOrdersResponse { repeated Order orders = 1; string next_page_token = 2; }
message StreamOrderStatusRequest { string order_id = 1; }
message OrderStatusUpdate {
  string order_id = 1;
  OrderStatus status = 2;
  google.protobuf.Timestamp changed_at = 3;
}
```

The server delegates to the same service and maps domain errors to gRPC status codes. Bind it to loopback or an internal network, never to `0.0.0.0` on a public host, and use TLS (`ServerCredentials.createSsl`) between hosts:

```typescript
// src/grpc.ts (excerpt)
const definition = protoLoader.loadSync("proto/orders.proto", { keepCase: false, longs: Number, enums: String, defaults: true });
const orders = (grpc.loadPackageDefinition(definition) as any).orders.v1;

function toGrpcError(err: unknown) {
  const code = err instanceof NotFoundError ? grpc.status.NOT_FOUND
    : err instanceof ValidationError ? grpc.status.INVALID_ARGUMENT : grpc.status.INTERNAL;
  return { code, message: err instanceof Error ? err.message : "Internal error" };
}

server.addService(orders.OrderService.service, {
  async GetOrder(call, cb) {
    try { cb(null, toProto(await orderService.getOrder(call.request.id))); } catch (e) { cb(toGrpcError(e)); }
  },
  StreamOrderStatus(call) {                      // server streaming: pushed on change, no polling
    const onStatus = (u) => {
      if (u.orderId === call.request.orderId)
        call.write({ orderId: u.orderId, status: `ORDER_STATUS_${u.status}`, changedAt: toTimestamp(u.changedAt) });
    };
    orderService.events.on("status", onStatus);
    call.on("cancelled", () => orderService.events.off("status", onStatus));
    call.on("close", () => orderService.events.off("status", onStatus));
  },
  /* CreateOrder and ListOrders follow the GetOrder pattern */
});
server.bindAsync("127.0.0.1:50051", grpc.ServerCredentials.createInsecure(), (err) => { if (err) throw err; });
```

On the client, pass a deadline on every call and enable retries for transient failures through a service config:

```typescript
const client = new orders.OrderService("orders.internal:50051", credentials, {
  "grpc.service_config": JSON.stringify({ methodConfig: [{
    name: [{ service: "orders.v1.OrderService" }],
    retryPolicy: { maxAttempts: 3, initialBackoff: "0.1s", maxBackoff: "1s", backoffMultiplier: 2,
                   retryableStatusCodes: ["UNAVAILABLE"] },
  }] }),
});
client.GetOrder({ id }, { deadline: Date.now() + 2000 }, (err, order) => { /* ... */ });
```

Retry only idempotent calls; do not put `CreateOrder` under a retry policy unless it takes an idempotency key. In the test run, a `NOT_FOUND` order surfaced as gRPC code 5 and a `SHIPPED` update arrived on the stream.

## Real-World Example

An e-commerce company serving 50,000 daily orders had a REST-only API. The mobile team complained about 6 sequential requests to render the order detail screen, adding 800ms of latency, and internal services spent a large share of CPU parsing JSON. The team introduced GraphQL for the mobile app, so the order detail screen now makes a single request, and gRPC for internal communication. Because every protocol calls the same service layer, a bug fix or a new validation rule applied to all three at once.

## Tips

- Start with the shared service layer, not the transport protocols. If the business logic is tangled with HTTP handling, adding GraphQL and gRPC means untangling it under pressure.
- Version the REST API with URL prefixes (/api/v1/) but version the gRPC service in the package name (orders.v1). This keeps versioning consistent within each protocol's conventions.
- Create the DataLoader per request from the start. N+1 query problems are invisible at low traffic but cause heavy database load as usage grows.
- Keep the Protobuf definitions in a shared repository that both client and server teams import. Copy-pasting .proto files between repos leads to version drift within weeks.

## Related Skills

- **rest-api** -- versioned partner endpoints with validation, pagination and rate limiting.
- **graphql** -- the frontend schema, DataLoader batching and subscriptions.
- **grpc** -- the Protocol Buffers contract, streaming and deadlines for internal services.
