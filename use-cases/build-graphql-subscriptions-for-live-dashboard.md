---
title: Build GraphQL Subscriptions for a Live Dashboard
slug: build-graphql-subscriptions-for-live-dashboard
description: Implement real-time GraphQL subscriptions with WebSocket transport to power a live analytics dashboard that updates instantly when backend data changes.
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

Dani runs engineering at a 40-person logistics startup. Their operations dashboard shows driver locations, delivery statuses, and warehouse throughput — but every metric is stale by the time dispatchers see it. Teams poll the REST API every 30 seconds, hammering the database with 12,000 queries per hour. Two dispatchers already routed drivers to the wrong warehouse because they were looking at 45-second-old data. Real-time visibility would eliminate $18K/month in misrouted shipments.

## Step 1: Set Up the GraphQL Server with Subscription Support

The foundation is a GraphQL Yoga server with WebSocket transport for subscriptions. The HTTP layer handles queries and mutations; WebSocket handles the persistent subscription connections.

```typescript
// src/server.ts — GraphQL Yoga server with WebSocket subscription transport
import { createServer } from "node:http";
import { createYoga, createSchema } from "graphql-yoga";
import { useServer } from "graphql-ws/lib/use/ws";
import { WebSocketServer } from "ws";
import { createPubSub } from "./pubsub";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";

const pubsub = createPubSub();

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  context: () => ({ pubsub }),
  graphiql: {
    subscriptionsProtocol: "WS", // enable subscription testing in GraphiQL
  },
});

const server = createServer(yoga);

const wsServer = new WebSocketServer({
  server,
  path: yoga.graphqlEndpoint,
});

// Bind graphql-ws to handle subscription protocol
useServer(
  {
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        yoga.getEnveloped({
          ...ctx,
          req: ctx.extra.request,
          socket: ctx.extra.socket,
          params: msg.payload,
        });

      const args = {
        schema,
        operationName: msg.payload.operationName,
        document: parse(msg.payload.query),
        variableValues: msg.payload.variables,
        contextValue: await contextFactory(),
        rootValue: { execute, subscribe },
      };

      const errors = validate(schema, args.document);
      if (errors.length) return errors;
      return args;
    },
  },
  wsServer
);

server.listen(4000, () => {
  console.log("GraphQL server ready at http://localhost:4000/graphql");
});
```

## Step 2: Define the Schema with Subscription Types

The schema declares subscription types alongside queries and mutations. Each subscription maps to an event channel that resolvers can publish to.

```graphql
# src/schema.graphql — Type definitions with subscription support
type Delivery {
  id: ID!
  driverId: String!
  status: DeliveryStatus!
  origin: String!
  destination: String!
  estimatedArrival: String
  lat: Float
  lng: Float
  updatedAt: String!
}

enum DeliveryStatus {
  PENDING
  PICKED_UP
  IN_TRANSIT
  DELIVERED
  FAILED
}

type WarehouseMetric {
  warehouseId: String!
  throughput: Int!       # packages per hour
  utilization: Float!    # 0.0 - 1.0
  activeDrivers: Int!
  pendingOrders: Int!
  timestamp: String!
}

type Query {
  deliveries(status: DeliveryStatus): [Delivery!]!
  warehouseMetrics(warehouseId: String!): WarehouseMetric
}

type Mutation {
  updateDeliveryStatus(id: ID!, status: DeliveryStatus!, lat: Float, lng: Float): Delivery!
  recordWarehouseMetric(warehouseId: String!, throughput: Int!, utilization: Float!, activeDrivers: Int!, pendingOrders: Int!): WarehouseMetric!
}

type Subscription {
  deliveryUpdated(driverId: String): Delivery!
  warehouseMetricChanged(warehouseId: String!): WarehouseMetric!
  systemAlert: SystemAlert!
}

type SystemAlert {
  severity: AlertSeverity!
  message: String!
  warehouseId: String
  timestamp: String!
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}
```

## Step 3: Build the Pub/Sub Layer with Redis

A Redis-backed pub/sub ensures subscriptions work across multiple server instances. When one server processes a mutation, all servers with active subscriptions receive the event.

```typescript
// src/pubsub.ts — Redis-backed pub/sub for distributed subscription events
import { createClient } from "redis";

type EventMap = {
  "delivery:updated": [{ driverId?: string; delivery: any }];
  "warehouse:metric": [{ warehouseId: string; metric: any }];
  "system:alert": [{ alert: any }];
};

export function createPubSub() {
  const publisher = createClient({ url: process.env.REDIS_URL });
  const subscriber = createClient({ url: process.env.REDIS_URL });

  publisher.connect();
  subscriber.connect();

  const listeners = new Map<string, Set<(data: any) => void>>();

  return {
    async publish<K extends keyof EventMap>(
      channel: K,
      ...args: EventMap[K]
    ) {
      await publisher.publish(channel, JSON.stringify(args[0]));
    },

    async subscribe<K extends keyof EventMap>(
      channel: K,
      callback: (data: EventMap[K][0]) => void
    ): Promise<() => void> {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
        await subscriber.subscribe(channel, (message) => {
          const data = JSON.parse(message);
          listeners.get(channel)?.forEach((cb) => cb(data));
        });
      }

      listeners.get(channel)!.add(callback);

      // Return unsubscribe function for cleanup
      return () => {
        listeners.get(channel)?.delete(callback);
        if (listeners.get(channel)?.size === 0) {
          subscriber.unsubscribe(channel);
          listeners.delete(channel);
        }
      };
    },
  };
}
```

## Step 4: Implement Subscription Resolvers with Filtering

Resolvers wire pub/sub events to GraphQL subscriptions. The filter logic ensures clients only receive events matching their subscription arguments — a driver dashboard sees only its own deliveries.

```typescript
// src/resolvers.ts — Resolvers including filtered subscriptions
import { pool } from "./db"; // PostgreSQL connection pool

export const resolvers = {
  Query: {
    deliveries: async (_: any, { status }: { status?: string }) => {
      const query = status
        ? "SELECT * FROM deliveries WHERE status = $1 ORDER BY updated_at DESC"
        : "SELECT * FROM deliveries ORDER BY updated_at DESC";
      const params = status ? [status] : [];
      const { rows } = await pool.query(query, params);
      return rows;
    },
    warehouseMetrics: async (_: any, { warehouseId }: { warehouseId: string }) => {
      const { rows } = await pool.query(
        "SELECT * FROM warehouse_metrics WHERE warehouse_id = $1 ORDER BY timestamp DESC LIMIT 1",
        [warehouseId]
      );
      return rows[0] || null;
    },
  },

  Mutation: {
    updateDeliveryStatus: async (
      _: any,
      { id, status, lat, lng }: any,
      { pubsub }: any
    ) => {
      const { rows } = await pool.query(
        `UPDATE deliveries 
         SET status = $2, lat = COALESCE($3, lat), lng = COALESCE($4, lng), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, status, lat, lng]
      );
      const delivery = rows[0];

      // Publish to subscription channel
      await pubsub.publish("delivery:updated", {
        driverId: delivery.driver_id,
        delivery,
      });

      // Check for alert conditions
      if (status === "FAILED") {
        await pubsub.publish("system:alert", {
          alert: {
            severity: "WARNING",
            message: `Delivery ${id} failed — reassignment needed`,
            warehouseId: delivery.origin,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return delivery;
    },

    recordWarehouseMetric: async (_: any, args: any, { pubsub }: any) => {
      const { warehouseId, throughput, utilization, activeDrivers, pendingOrders } = args;
      const { rows } = await pool.query(
        `INSERT INTO warehouse_metrics (warehouse_id, throughput, utilization, active_drivers, pending_orders, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [warehouseId, throughput, utilization, activeDrivers, pendingOrders]
      );
      const metric = rows[0];

      await pubsub.publish("warehouse:metric", { warehouseId, metric });

      // Alert on high utilization
      if (utilization > 0.9) {
        await pubsub.publish("system:alert", {
          alert: {
            severity: "CRITICAL",
            message: `Warehouse ${warehouseId} at ${(utilization * 100).toFixed(0)}% capacity`,
            warehouseId,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return metric;
    },
  },

  Subscription: {
    deliveryUpdated: {
      subscribe: async function* (_: any, { driverId }: any, { pubsub }: any) {
        const queue: any[] = [];
        let resolve: (() => void) | null = null;

        const unsubscribe = await pubsub.subscribe(
          "delivery:updated",
          (data: any) => {
            // Filter: only send events matching the requested driverId
            if (driverId && data.driverId !== driverId) return;
            queue.push(data.delivery);
            resolve?.();
          }
        );

        try {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((r) => (resolve = r));
            }
            yield { deliveryUpdated: queue.shift() };
          }
        } finally {
          unsubscribe();
        }
      },
    },

    warehouseMetricChanged: {
      subscribe: async function* (_: any, { warehouseId }: any, { pubsub }: any) {
        const queue: any[] = [];
        let resolve: (() => void) | null = null;

        const unsubscribe = await pubsub.subscribe(
          "warehouse:metric",
          (data: any) => {
            if (data.warehouseId !== warehouseId) return;
            queue.push(data.metric);
            resolve?.();
          }
        );

        try {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((r) => (resolve = r));
            }
            yield { warehouseMetricChanged: queue.shift() };
          }
        } finally {
          unsubscribe();
        }
      },
    },

    systemAlert: {
      subscribe: async function* (_: any, __: any, { pubsub }: any) {
        const queue: any[] = [];
        let resolve: (() => void) | null = null;

        const unsubscribe = await pubsub.subscribe(
          "system:alert",
          (data: any) => {
            queue.push(data.alert);
            resolve?.();
          }
        );

        try {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((r) => (resolve = r));
            }
            yield { systemAlert: queue.shift() };
          }
        } finally {
          unsubscribe();
        }
      },
    },
  },
};
```

## Step 5: Build the React Dashboard with Live Subscriptions

The frontend connects via `graphql-ws` and uses subscription hooks to render live-updating widgets. No polling, no manual refresh — data flows in the moment it changes.

```typescript
// src/components/LiveDashboard.tsx — React dashboard consuming GraphQL subscriptions
import { useSubscription, gql } from "@apollo/client";
import { useState, useEffect } from "react";

const WAREHOUSE_SUBSCRIPTION = gql`
  subscription OnWarehouseMetric($warehouseId: String!) {
    warehouseMetricChanged(warehouseId: $warehouseId) {
      warehouseId
      throughput
      utilization
      activeDrivers
      pendingOrders
      timestamp
    }
  }
`;

const DELIVERY_SUBSCRIPTION = gql`
  subscription OnDeliveryUpdated {
    deliveryUpdated {
      id
      driverId
      status
      destination
      lat
      lng
      updatedAt
    }
  }
`;

const ALERT_SUBSCRIPTION = gql`
  subscription OnAlert {
    systemAlert {
      severity
      message
      warehouseId
      timestamp
    }
  }
`;

export function LiveDashboard({ warehouseIds }: { warehouseIds: string[] }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<Map<string, any>>(new Map());

  // Subscribe to delivery updates across all drivers
  useSubscription(DELIVERY_SUBSCRIPTION, {
    onData: ({ data }) => {
      const delivery = data.data?.deliveryUpdated;
      if (delivery) {
        setDeliveries((prev) => new Map(prev).set(delivery.id, delivery));
      }
    },
  });

  // Subscribe to system alerts
  useSubscription(ALERT_SUBSCRIPTION, {
    onData: ({ data }) => {
      const alert = data.data?.systemAlert;
      if (alert) {
        setAlerts((prev) => [alert, ...prev].slice(0, 50)); // keep last 50
      }
    },
  });

  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {/* Warehouse panels — each with its own subscription */}
      {warehouseIds.map((id) => (
        <WarehousePanel key={id} warehouseId={id} />
      ))}

      {/* Live delivery map */}
      <div className="col-span-2 bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">Active Deliveries</h2>
        <div className="space-y-2">
          {[...deliveries.values()]
            .filter((d) => d.status === "IN_TRANSIT")
            .map((d) => (
              <div key={d.id} className="flex justify-between border-b py-2">
                <span className="font-mono text-sm">{d.id.slice(0, 8)}</span>
                <span>{d.destination}</span>
                <StatusBadge status={d.status} />
              </div>
            ))}
        </div>
      </div>

      {/* Alert feed */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-3">System Alerts</h2>
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`p-2 rounded mb-2 text-sm ${
              alert.severity === "CRITICAL"
                ? "bg-red-100 text-red-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function WarehousePanel({ warehouseId }: { warehouseId: string }) {
  const { data } = useSubscription(WAREHOUSE_SUBSCRIPTION, {
    variables: { warehouseId },
  });

  const metric = data?.warehouseMetricChanged;
  const utilizationPct = metric ? (metric.utilization * 100).toFixed(0) : "—";

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-700">{warehouseId}</h3>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <MetricCard label="Throughput" value={metric?.throughput ?? "—"} unit="/hr" />
        <MetricCard label="Utilization" value={`${utilizationPct}%`} />
        <MetricCard label="Active Drivers" value={metric?.activeDrivers ?? "—"} />
        <MetricCard label="Pending" value={metric?.pendingOrders ?? "—"} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit = "" }: any) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold">{value}{unit}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    IN_TRANSIT: "bg-blue-100 text-blue-800",
    DELIVERED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    PENDING: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs ${colors[status] || colors.PENDING}`}>
      {status}
    </span>
  );
}
```

## Results

After deploying the subscription-based dashboard:

- **Data latency dropped from 30–45 seconds to under 200ms** — dispatchers see delivery status changes in real time
- **Database load decreased by 85%** — eliminated 12,000 polling queries per hour; subscriptions push only changed data
- **Misrouted shipments dropped from 23/month to 2/month** — saving ~$16K/month in rerouting costs
- **Dispatcher response time improved by 60%** — they act on live data instead of waiting for the next refresh cycle
- **WebSocket connections stay efficient** — Redis pub/sub distributes events across server instances, supporting 500+ concurrent dashboard users on two nodes
