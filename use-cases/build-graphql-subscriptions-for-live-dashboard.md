---
title: Build GraphQL Subscriptions for a Live Dashboard
slug: build-graphql-subscriptions-for-live-dashboard
description: Implement real-time GraphQL subscriptions with GraphQL Yoga, graphql-ws and Redis to power a live analytics dashboard that updates the moment backend data changes.
skills:
  - graphql-yoga
  - typescript
  - redis
  - postgresql
  - nextjs
category: development
tags:
  - graphql
  - real-time
  - websockets
  - dashboard
  - subscriptions
---

# Build GraphQL Subscriptions for a Live Dashboard

## The Problem

Dani runs engineering at a 40-person logistics startup. Their operations dashboard shows driver locations, delivery statuses and warehouse throughput, but every metric is stale by the time dispatchers see it. The dashboard polls the REST API every 30 seconds, which means thousands of queries an hour against the database. Two dispatchers already routed drivers to the wrong warehouse because they were looking at 45-second-old data.

## Step 1: Set Up the GraphQL Server with Subscription Support

Install the packages (**graphql-yoga** v6 needs Node 22.15 or newer; **@graphql-yoga/redis-event-target** declares `ioredis ^5` as its peer, so pin that major):

```bash
npm install graphql-yoga graphql graphql-ws ws jsonwebtoken pg ioredis@5 @graphql-yoga/redis-event-target
npm install -D typescript tsx @types/ws @types/jsonwebtoken @types/pg
```

Yoga v6 serves subscriptions over Server-Sent Events by default, which needs no extra server. This dashboard uses WebSockets through `graphql-ws` instead, so one connection carries many subscriptions and the browser can send connection params. HTTP handles queries and mutations; the `ws` server handles subscriptions. The server binds to `127.0.0.1` (put a TLS proxy in front), checks the `Origin` header on the upgrade, and requires a short-lived RS256 token on both transports:

```typescript
// src/server.ts — Yoga over HTTP, graphql-ws over WebSocket, both on loopback
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { createSchema, createYoga } from "graphql-yoga";
import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";

// Short-lived RS256 token minted by your login endpoint; the algorithm is pinned so a token cannot pick its own
const tokenOk = (t: unknown) => {
  try { jwt.verify(String(t), process.env.JWT_PUBLIC_KEY!, { algorithms: ["RS256"], issuer: "app" }); return true; }
  catch { return false; }
};
const origins = new Set([process.env.APP_ORIGIN!]);   // e.g. https://dash.example.com

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  cors: { origin: [process.env.APP_ORIGIN!] },   // browser queries from the dashboard origin
  graphiql: { subscriptionsProtocol: "WS" },   // GraphiQL is on only when NODE_ENV=development
  plugins: [{   // HTTP queries and mutations need the same token as the sockets
    onRequest({ request, fetchAPI, endResponse }) {
      if (request.method !== "OPTIONS" && !tokenOk(request.headers.get("authorization")?.replace(/^Bearer /, "")))
        endResponse(new fetchAPI.Response("Unauthorized", { status: 401 }));
    },
  }],
});

const server = createServer(yoga);
const wsServer = new WebSocketServer({
  server,
  path: yoga.graphqlEndpoint,
  maxPayload: 64 * 1024,   // ws defaults to 100 MiB
  verifyClient: ({ origin }: { origin: string }) => origins.has(origin),   // browsers always send Origin
});

useServer(
  {
    onConnect: (ctx) => tokenOk(ctx.connectionParams?.token),   // false closes the socket with 4403
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, _id, payload) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
        ...ctx, req: ctx.extra.request, socket: ctx.extra.socket, params: payload,
      });
      const args = {
        schema,
        operationName: payload.operationName,
        document: parse(payload.query),
        variableValues: payload.variables,
        contextValue: await contextFactory(),
        rootValue: { execute, subscribe },
      };
      const errors = validate(schema, args.document);
      return errors.length ? errors : args;
    },
  },
  wsServer,
);

server.listen(Number(process.env.PORT ?? 4000), "127.0.0.1", () =>
  console.log(`GraphQL on http://127.0.0.1:${process.env.PORT ?? 4000}/graphql`));   // TLS proxy in front
```

## Step 2: Define the Schema with Subscription Types

Postgres holds the data, so create the tables first, then declare the subscription fields next to queries and mutations:

```sql
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), driver_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', origin TEXT NOT NULL, destination TEXT NOT NULL,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE warehouse_metrics (
  warehouse_id TEXT NOT NULL, throughput INT NOT NULL, utilization DOUBLE PRECISION NOT NULL,
  active_drivers INT NOT NULL, pending_orders INT NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT now());
```

```typescript
export const typeDefs = /* GraphQL */ `
  type Delivery { id: ID! driverId: String! status: DeliveryStatus! origin: String! destination: String!
    lat: Float lng: Float updatedAt: String! }
  enum DeliveryStatus { PENDING PICKED_UP IN_TRANSIT DELIVERED FAILED }
  type WarehouseMetric { warehouseId: String! throughput: Int! utilization: Float! activeDrivers: Int!
    pendingOrders: Int! timestamp: String! }
  type SystemAlert { severity: AlertSeverity! message: String! warehouseId: String timestamp: String! }
  enum AlertSeverity { INFO WARNING CRITICAL }
  type Query { deliveries(status: DeliveryStatus): [Delivery!]! warehouseMetrics(warehouseId: String!): WarehouseMetric }
  type Mutation {
    updateDeliveryStatus(id: ID!, status: DeliveryStatus!, lat: Float, lng: Float): Delivery!
    recordWarehouseMetric(warehouseId: String!, throughput: Int!, utilization: Float!, activeDrivers: Int!, pendingOrders: Int!): WarehouseMetric!
  }
  type Subscription { deliveryUpdated(driverId: String): Delivery! warehouseMetricChanged(warehouseId: String!): WarehouseMetric! systemAlert: SystemAlert! }
`;
```

## Step 3: Build the Pub/Sub Layer with Redis

Yoga's `createPubSub` is in-memory by default, so an event published on one server never reaches a subscriber on another. With a Redis event target every instance publishes to Redis and forwards events to its own sockets. Publisher and subscriber need separate connections, because a connection in subscribe mode cannot run other commands.

```typescript
// src/pubsub.ts — Yoga's PubSub backed by Redis, so every server instance sees every event
import { createPubSub } from "graphql-yoga";
import { createRedisEventTarget } from "@graphql-yoga/redis-event-target";
import Redis from "ioredis";

export type Delivery = { id: string; driver_id: string; status: string; origin: string; destination: string; lat: number | null; lng: number | null; updated_at: Date | string };
export type Metric = { warehouse_id: string; throughput: number; utilization: number; active_drivers: number; pending_orders: number; timestamp: Date | string };
export type Alert = { severity: "INFO" | "WARNING" | "CRITICAL"; message: string; warehouseId: string | null; timestamp: string };
const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
export const pubSub = createPubSub<{
  deliveryUpdated: [delivery: Delivery];
  warehouseMetric: [warehouseId: string, metric: Metric];  // [topic, id, payload]
  systemAlert: [alert: Alert]; }>({ eventTarget: createRedisEventTarget({ publishClient: new Redis(url), subscribeClient: new Redis(url) }) });
```

## Step 4: Implement Subscription Resolvers with Filtering

A subscription resolver returns an async iterable. `pubSub.subscribe("warehouseMetric", warehouseId)` uses the id as part of the topic, so each client only receives its warehouse. For the driver filter, `pipe` and `filter` (exported by `graphql-yoga`) drop events the client did not ask for. The mutations write to Postgres first and publish after the row exists. The pool is a standard `pg` `Pool` exported from `./db` (`new Pool({ connectionString: process.env.DATABASE_URL })`).

```typescript
// src/resolvers.ts — subscriptions are async iterables from the PubSub, filtered per client
import { filter, pipe } from "graphql-yoga";
import { pool } from "./db";
import { pubSub, type Alert } from "./pubsub";

const alert = (severity: Alert["severity"], message: string, warehouseId: string | null) =>
  pubSub.publish("systemAlert", { severity, message, warehouseId, timestamp: new Date().toISOString() });

// Rows are snake_case; events that crossed Redis carry dates as JSON strings, hence new Date()
const toDelivery = (r: any) => ({ id: r.id, driverId: r.driver_id, status: r.status, origin: r.origin,
  destination: r.destination, lat: r.lat, lng: r.lng, updatedAt: new Date(r.updated_at).toISOString() });
const toMetric = (r: any) => ({ warehouseId: r.warehouse_id, throughput: r.throughput, utilization: r.utilization,
  activeDrivers: r.active_drivers, pendingOrders: r.pending_orders, timestamp: new Date(r.timestamp).toISOString() });

export const resolvers = {
  Query: {
    deliveries: async (_: unknown, { status }: { status?: string }) => {
      const { rows } = await pool.query(
        "SELECT * FROM deliveries WHERE ($1::text IS NULL OR status = $1) ORDER BY updated_at DESC LIMIT 500", [status ?? null]);
      return rows.map(toDelivery);
    },
    warehouseMetrics: async (_: unknown, { warehouseId }: { warehouseId: string }) => {
      const { rows } = await pool.query(
        "SELECT * FROM warehouse_metrics WHERE warehouse_id = $1 ORDER BY timestamp DESC LIMIT 1", [warehouseId]);
      return rows[0] ? toMetric(rows[0]) : null;
    },
  },
  Mutation: {
    updateDeliveryStatus: async (_: unknown, { id, status, lat, lng }: any) => {
      const { rows } = await pool.query(
        `UPDATE deliveries SET status = $2, lat = COALESCE($3, lat), lng = COALESCE($4, lng), updated_at = now()
         WHERE id = $1 RETURNING *`, [id, status, lat, lng]);
      if (!rows[0]) throw new Error(`Delivery ${id} not found`);
      await pubSub.publish("deliveryUpdated", rows[0]);
      if (status === "FAILED") await alert("WARNING", `Delivery ${id} failed — reassignment needed`, rows[0].origin);
      return toDelivery(rows[0]);
    },
    recordWarehouseMetric: async (_: unknown, a: any) => {
      const { rows } = await pool.query(
        `INSERT INTO warehouse_metrics (warehouse_id, throughput, utilization, active_drivers, pending_orders, timestamp)
         VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
        [a.warehouseId, a.throughput, a.utilization, a.activeDrivers, a.pendingOrders]);
      await pubSub.publish("warehouseMetric", a.warehouseId, rows[0]);
      if (a.utilization > 0.9) await alert("CRITICAL", `Warehouse ${a.warehouseId} at ${Math.round(a.utilization * 100)}% capacity`, a.warehouseId);
      return toMetric(rows[0]);
    },
  },
  Subscription: {
    deliveryUpdated: {
      subscribe: (_: unknown, { driverId }: { driverId?: string }) =>
        pipe(pubSub.subscribe("deliveryUpdated"), filter((d) => !driverId || d.driver_id === driverId)),
      resolve: toDelivery },
    warehouseMetricChanged: {
      subscribe: (_: unknown, { warehouseId }: { warehouseId: string }) => pubSub.subscribe("warehouseMetric", warehouseId),
      resolve: toMetric },
    systemAlert: { subscribe: () => pubSub.subscribe("systemAlert"), resolve: (a: Alert) => a },
  },
};
```

## Step 5: Build the React Dashboard with Live Subscriptions

The client is a small hook on top of `graphql-ws`, used from a client component in a Next.js App Router page (`"use client"`). The browser fetches a fresh token on every (re)connect, so no long-lived secret reaches the bundle.

```typescript
// src/web/useSubscription.ts — one shared graphql-ws client; each hook call is one subscription
"use client";
import { useEffect, useState } from "react";
import { createClient } from "graphql-ws";

const client = createClient({
  url: process.env.NEXT_PUBLIC_GRAPHQL_WS_URL!,   // wss://api.example.com/graphql
  // Called on every (re)connect: fetch a fresh short-lived token from your login endpoint
  connectionParams: async () => ({ token: await fetch("/api/dashboard-token").then((r) => r.text()) }),
  lazy: true,   // connect on the first subscription, close after the last one ends
});

export function useSubscription<T>(query: string, variables: Record<string, unknown> = {}) {
  const [data, setData] = useState<T | null>(null);
  const key = JSON.stringify(variables);   // stable dependency for the variables object
  useEffect(() => {
    const dispose = client.subscribe<T>(
      { query, variables: JSON.parse(key) },
      { next: (r) => { if (r.data) setData(r.data); }, error: console.error, complete: () => {} },
    );
    return dispose;   // unsubscribes on unmount or when variables change
  }, [query, key]);
  return { data };
}
```
```tsx
// src/web/LiveDashboard.tsx — metric panels and an alert feed (deliveryUpdated is consumed the same way)
"use client";
import { useEffect, useState } from "react";
import { useSubscription } from "./useSubscription";

type Alert = { severity: string; message: string; timestamp: string };
type Metric = { throughput: number; utilization: number; activeDrivers: number; pendingOrders: number };

const ALERT = `subscription { systemAlert { severity message timestamp } }`;
const METRIC = `subscription ($warehouseId: String!) { warehouseMetricChanged(warehouseId: $warehouseId) { throughput utilization activeDrivers pendingOrders } }`;

export function LiveDashboard({ warehouseIds }: { warehouseIds: string[] }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alert = useSubscription<{ systemAlert: Alert }>(ALERT).data?.systemAlert;

  // Fold pushed events into local state; events are not replayed, so load current rows with a query on mount
  useEffect(() => { if (alert) setAlerts((a) => [alert, ...a].slice(0, 50)); }, [alert]);

  return (
    <div>
      {warehouseIds.map((id) => <WarehousePanel key={id} warehouseId={id} />)}
      <h2>Alerts</h2>
      <ul>{alerts.map((a) => <li key={a.timestamp + a.message}>[{a.severity}] {a.message}</li>)}</ul>
    </div>
  );
}

function WarehousePanel({ warehouseId }: { warehouseId: string }) {
  const m = useSubscription<{ warehouseMetricChanged: Metric }>(METRIC, { warehouseId }).data?.warehouseMetricChanged;
  return (
    <section>
      <h3>{warehouseId}</h3>
      {m ? `${m.throughput}/hr · ${Math.round(m.utilization * 100)}% · ${m.activeDrivers} drivers · ${m.pendingOrders} pending` : "waiting for data…"}
    </section>
  );
}
```

## Real-World Example

The logistics team replaced the 30-second REST poll with these subscriptions. Dispatchers see a status change when the mutation commits, the polling queries are gone, and a second server instance can be added because Redis carries events between instances. Pub/sub is at-most-once, so an offline dashboard misses events: on mount and reconnect it runs the `deliveries` and `warehouseMetrics` queries, then lets the subscriptions keep it fresh.

## Related Skills

- [graphql-yoga](../skills/graphql-yoga/SKILL.md) — v6 server, subscriptions, `createPubSub` and the Redis event target (Steps 1, 3, 4)
- [typescript](../skills/typescript/SKILL.md) — typed pub/sub topics and the `tsc --noEmit` check on the server and the client (Steps 3-5)
- [redis](../skills/redis/SKILL.md) — pub/sub between server instances, separate publisher and subscriber connections (Step 3)
- [postgresql](../skills/postgresql/SKILL.md) — deliveries and metrics tables, write-then-publish (Steps 2, 4)
- [nextjs](../skills/nextjs/SKILL.md) — the dashboard as a client component in the App Router (Step 5)
