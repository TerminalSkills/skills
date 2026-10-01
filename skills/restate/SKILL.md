---
name: restate
description: >-
  Restate is a durable execution engine that makes distributed application code
  resilient to crashes, with SDKs for TypeScript, Java, Go and more. Use when someone asks to "durable execution",
  "Restate", "resilient workflows", "distributed transactions", "saga pattern",
  "fault-tolerant services", or "replace Temporal with something lighter".
  Covers durable handlers, virtual objects, workflows, and sagas.
license: Apache-2.0
compatibility: "TypeScript SDK needs Node.js 22+ (or Bun/Deno). SDKs also exist for Java/Kotlin, Python, Go and Rust. Self-hosted server or Restate Cloud."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["durable-execution", "restate", "distributed", "workflows", "resilience"]
  repository: https://github.com/restatedev/restate
---

# Restate

## Overview

Restate is a durable execution engine — your code runs reliably even when things crash. Write normal async functions, and Restate ensures they complete: if a service crashes mid-execution, it resumes exactly where it left off. No lost state, no duplicate side effects. Like Temporal but with a simpler programming model — just annotate your functions, no state machines or DSLs.

Two processes are involved: the Restate Server (a single binary that stores the execution journal, exposes the ingress on port 8080 and the admin API and UI on port 9070) and your service (an HTTP endpoint on port 9080 by default). Callers always talk to the server, never to the service directly.

## When to Use

- Distributed transactions (payment → inventory → shipping)
- Long-running workflows that must complete (onboarding, provisioning)
- Saga pattern with compensating actions (rollback on failure)
- Exactly-once processing of events
- Replacing complex retry/queue logic with durable execution

## Instructions

### Setup

```bash
# SDK for your service
npm install @restatedev/restate-sdk

# Server and CLI (also on Homebrew: restatedev/tap/restate-server, restatedev/tap/restate)
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
restate-server            # ingress :8080, admin API + UI :9070, data in ./restate-data

# Or run the server in Docker
docker run --name restate_dev --rm -p 8080:8080 -p 9070:9070 \
  --add-host=host.docker.internal:host-gateway \
  docker.restate.dev/restatedev/restate:latest
```

After starting your service, register it with the server. Nothing can be invoked until this is done, and it must be repeated whenever handlers are added or renamed:

```bash
restate deployments register http://localhost:9080 --yes   # --yes skips the confirmation prompt
# Server in Docker: restate deployments register http://host.docker.internal:9080 --yes
# Development, same URL with changed handlers: add --force to replace the earlier registration
restate services list
```

### Durable Service

```typescript
// services/payment.ts — Durable payment service
import * as restate from "@restatedev/restate-sdk";

type Order = { orderId: string; userId: string; amountCents: number };

export const paymentService = restate.service({
  name: "payments",
  handlers: {
    // If the process crashes between steps, the handler is replayed and
    // completed steps return their recorded result instead of running again
    processPayment: async (ctx: restate.Context, order: Order) => {
      // Stable across retries — unlike crypto.randomUUID()
      const idempotencyKey = ctx.rand.uuidv4();

      const charge = await ctx.run("charge-payment", async () => {
        return await stripeApi.charge(order.userId, order.amountCents, idempotencyKey);
      });

      await ctx.run("confirm-order", async () => {
        await orderDb.confirm(order.orderId, charge.id);
      });

      await ctx.run("notify", async () => {
        await emailApi.send(order.userId, "Order confirmed!");
      });

      return { orderId: order.orderId, chargeId: charge.id, status: "completed" };
    },
  },
});

// Starts an HTTP/2 server; port defaults to 9080. List every service, object and workflow you define
restate.serve({ services: [paymentService], port: 9080 });
```

`restate.endpoint().bind(...).listen()` from older tutorials is deprecated; use `restate.serve`, or `restate.createEndpointHandler` (imported from `@restatedev/restate-sdk/lambda` or `/fetch`) for AWS Lambda, Deno and Cloudflare Workers.

A step that throws an ordinary `Error` is retried with exponential backoff; after 70 attempts (the server default) the invocation is paused, not failed. Throw `restate.TerminalError` to stop retrying and return the failure to the caller, or cap a step with a retry policy:

```typescript
await ctx.run("charge-payment", () => stripeApi.charge(order.userId, order.amountCents), {
  initialRetryInterval: { milliseconds: 500 },
  maxRetryAttempts: 5, // afterwards a TerminalError is thrown
});
```

### Virtual Objects (Stateful Entities)

```typescript
// services/cart.ts — Stateful shopping cart (single-writer per key)
type CartItem = { sku: string; quantity: number; priceCents: number };

export const cartObject = restate.object({
  name: "cart",
  handlers: {
    // Exclusive handler: only one runs per cart key at a time — no race conditions
    addItem: async (ctx: restate.ObjectContext, item: CartItem) => {
      const items = (await ctx.get<CartItem[]>("items")) ?? [];
      items.push(item);
      ctx.set("items", items);
      return { items: items.length };
    },

    checkout: async (ctx: restate.ObjectContext, userId: string) => {
      const items = (await ctx.get<CartItem[]>("items")) ?? [];
      if (items.length === 0) {
        throw new restate.TerminalError("Cart is empty", { errorCode: 400 });
      }
      const amountCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

      // Durable call to another service; ctx.key is the cart ID from the URL
      const result = await ctx
        .serviceClient(paymentService)
        .processPayment({ orderId: ctx.key, userId, amountCents });

      ctx.clear("items");
      return result;
    },

    // Shared handler: read-only, runs concurrently. Without the wrapper
    // the handler is exclusive and queues behind writers.
    getItems: restate.handlers.object.shared(
      async (ctx: restate.ObjectSharedContext) => (await ctx.get<CartItem[]>("items")) ?? []
    ),
  },
});
```

Call other handlers with `ctx.serviceClient(svc)`, `ctx.objectClient(obj, key)` and `ctx.workflowClient(wf, id)`. The `...SendClient` variants send a one-way message; add `restate.rpc.sendOpts({ delay: { hours: 5 } })` as the last argument to schedule it.

### Workflows

A workflow runs its `run` handler exactly once per workflow ID. Other handlers take a `WorkflowSharedContext` and can query state or resolve a promise the workflow is waiting on.

```typescript
// services/signup.ts — Wait for an email click without holding a process
export const signupWorkflow = restate.workflow({
  name: "signup",
  handlers: {
    run: async (ctx: restate.WorkflowContext, user: { email: string }) => {
      const code = ctx.rand.uuidv4();
      await ctx.run("send-email", () => emailApi.sendVerification(user.email, code));
      ctx.set("status", "waiting-for-click");

      const clicked = await ctx.promise<string>("email-clicked");
      ctx.set("status", "verified");
      return clicked === code;
    },
    click: async (ctx: restate.WorkflowSharedContext, code: string) => {
      await ctx.promise<string>("email-clicked").resolve(code);
    },
    status: async (ctx: restate.WorkflowSharedContext) =>
      (await ctx.get<string>("status")) ?? "unknown",
  },
});
```

### Saga Pattern (Compensating Actions)

```typescript
// services/booking.ts — Saga: undo completed steps when a later one fails for good
export const bookingService = restate.service({
  name: "booking",
  handlers: {
    bookTrip: async (ctx: restate.Context, trip: TripRequest) => {
      const compensations: (() => Promise<unknown>)[] = [];
      try {
        // Register the undo before the action, in case the action half-succeeds
        compensations.push(() => ctx.run("cancel-flight", () => flightApi.cancel(trip.tripId)));
        const flightId = await ctx.run("book-flight", () => flightApi.book(trip.flight));

        compensations.push(() => ctx.run("cancel-hotel", () => hotelApi.cancel(trip.tripId)));
        const hotelId = await ctx.run("book-hotel", () => hotelApi.book(trip.hotel));

        const carId = await ctx.run("book-car", () => carApi.book(trip.car));
        return { flightId, hotelId, carId, status: "confirmed" };
      } catch (e) {
        // Only terminal errors mean "give up"; anything else is retried by Restate
        if (e instanceof restate.TerminalError) {
          for (const undo of compensations.reverse()) await undo();
        }
        throw e;
      }
    },
  },
});
```

### Invoking Handlers over HTTP

```bash
# Service: /restate/call/{service}/{handler}
curl localhost:8080/restate/call/payments/processPayment \
  -H 'idempotency-key: order-7731' \
  --json '{"orderId":"order-7731","userId":"user-381","amountCents":12300}'

# Virtual object or workflow: the key goes between service and handler
curl localhost:8080/restate/call/cart/order-1042/getItems

# Fire-and-forget, optionally delayed
curl "localhost:8080/restate/send/payments/processPayment?delay=10s" \
  --json '{"orderId":"order-7732","userId":"user-381","amountCents":4900}'
```

The `/restate/call` and `/restate/send` prefixes are for Restate Server 1.7 and later. On 1.6 and earlier use `/{service}/{handler}` and `/{service}/{handler}/send`.

## Examples

### Example 1: Reliable payment processing

**User prompt:** "Build a payment flow that never loses a charge — even if the server crashes between charging the card and updating the database."

The agent writes `paymentService` and `cartObject` as above, starts `restate-server` and the service, registers the deployment, then drives it through the ingress:

```bash
restate deployments register http://localhost:9080 --yes   # --yes skips the confirmation prompt
curl localhost:8080/restate/call/cart/order-1042/addItem \
  --json '{"sku":"KB-87","quantity":2,"priceCents":4900}'
curl localhost:8080/restate/call/cart/order-1042/checkout --json '"user-381"'
```

```json
{"items":1}
{"orderId":"order-1042","chargeId":"ch_02a61802","status":"completed"}
```

If the service is killed after `charge-payment` completes, the retry skips the charge and continues with `confirm-order`. A second `checkout` on the now empty cart returns HTTP 400 `{"code":400,"message":"Cart is empty","source":"invocation"}` instead of retrying.

### Example 2: Distributed saga for e-commerce

**User prompt:** "Implement an order workflow: reserve inventory → charge payment → ship. If any step fails, roll back everything."

The agent builds a service shaped like `bookingService`, one `ctx.run` per step, with each compensation registered before its action. When the last step throws `new restate.TerminalError("No cars left", { errorCode: 409 })`, the compensations run in reverse order and the caller receives the error:

```bash
curl -i localhost:8080/restate/call/booking/bookTrip \
  --json '{"tripId":"LIS-2292","flight":"TP1351","hotel":"Bairro Alto","car":"compact"}'
```

```text
HTTP/1.1 409 Conflict
{"code":409,"message":"No cars left","source":"invocation"}
```

The service log shows `cancel-hotel` then `cancel-flight`. Inspect any invocation, its journal and its retries in the UI at `http://localhost:9070` or with `restate invocations list`.

## Guidelines

- **`ctx.run()` for side effects** — wrap every non-deterministic operation (HTTP calls, database writes, `Date.now()`, random IDs). Name each step; the name shows up in the UI and CLI.
- **No context calls inside `ctx.run`** — `ctx.get`, `ctx.sleep` and nested `ctx.run` are not allowed in the closure.
- **A step is done only once its result is journaled** — if the process dies or the closure throws midway, the whole closure runs again on retry. Pass an idempotency key (`ctx.rand.uuidv4()`) to external APIs.
- **`TerminalError` to stop retries** — by default the server gives an invocation 70 attempts and then pauses it instead of failing it. Validation and business failures must be terminal or the caller never gets an answer.
- **Sagas compensate on `TerminalError` only** — a bare `catch` that compensates on every error also undoes work on transient failures that Restate was about to retry.
- **Virtual objects for stateful entities** — single-writer guarantee per key. A long `ctx.sleep` or a waiting call in an exclusive handler blocks every other call to that key; request-response calls between exclusive handlers (A → B → A) can deadlock.
- **`ctx.sleep({ seconds: 10 })` for delays** — durable timers that survive crashes. For long delays prefer a delayed message so the handler can finish.
- **Workflows run once per ID** — submitting the same ID again returns HTTP 409. State and results are kept for 24 hours after completion by default.
- **Changing handler code under in-flight invocations** causes journal mismatches. Deploy the new version to a new URL and register it; running invocations finish on the old deployment.
- **Secure the service endpoint** — the SDK warns that it accepts unsigned requests. Keep port 9080 private, or pass `identityKeys` to `restate.serve` so only your Restate instance can call it. Do not expose port 9070 (admin API) publicly.
- **Self-hosted** — single binary with an embedded store, no external database. Deleting `restate-data` wipes all invocations, state and registrations.
- **When not to use** — plain stateless request handlers with no multi-step side effects gain nothing from the extra hop through the server.
