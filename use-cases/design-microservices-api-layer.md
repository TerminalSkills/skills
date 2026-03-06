---
title: "Design a Microservices API Layer with REST and gRPC"
slug: design-microservices-api-layer
description: "Build an API gateway with REST for external clients and gRPC for internal service-to-service communication, reducing latency and unifying authentication."
skills: [rest-api, grpc, docker-helper]
category: development
tags: [rest, grpc, microservices, api-gateway, protobuf, performance]
---

# Design a Microservices API Layer with REST and gRPC

## The Problem

Sami is the platform engineer at a 30-person fintech startup. They started as a monolith, and after splitting into 6 microservices last year, the architecture works — but communication between services is a mess.

All inter-service calls go through REST over HTTP/1.1. The payment service calls the user service to verify accounts, which calls the compliance service for KYC checks, which calls the document service for ID verification. A single payment request triggers a chain of 4 REST calls. Each call serializes to JSON, crosses the network, deserializes, processes, serializes the response, and sends it back. Total overhead per hop: 12-18ms just in serialization and HTTP connection setup.

The p95 latency for the payment flow is 840ms. Compliance requires it under 500ms. The JSON payloads between services average 4.2KB when the actual data needed is under 800 bytes — field names, null values, and nested objects that the receiving service ignores.

Authentication is duplicated: each service validates JWTs independently, making 6 Redis lookups per payment flow. Error handling is inconsistent — the user service returns `{ "error": "not found" }`, the compliance service returns `{ "code": 404, "msg": "Not found" }`, and the document service returns `{ "status": "error", "reason": "missing" }`. Every service has its own client library for every other service, totaling 30 hand-maintained HTTP clients.

External clients (web app, mobile) need REST — they can't speak gRPC. But internal services have no such constraint. The team wastes 8 hours per week debugging serialization mismatches, maintaining client libraries, and dealing with undocumented endpoint changes.

## The Solution

Using the **rest-api**, **grpc**, and **docker-helper** skills, the architecture keeps REST for external-facing APIs (mobile, web, third-party integrations) and switches internal service-to-service communication to gRPC with Protocol Buffers. An API gateway sits at the boundary, translating between the two worlds — so external clients see clean REST while internal services get type-safe, high-performance gRPC.

## Step-by-Step Walkthrough

### Step 1: Define the Proto Contracts

The root of the problem is 30 hand-maintained HTTP clients with no shared contract. Protocol Buffers fix this by defining every message and service in `.proto` files that generate type-safe clients for Node.js, Python, and Go simultaneously.

Start with common types that every service shares:

```protobuf
// proto/common/v1/common.proto — shared types used across all services
syntax = "proto3";
package common.v1;

message Money {
  int64 amount_cents = 1;
  string currency = 2;     // ISO 4217: "USD", "EUR", "GBP"
}
// Also: Address, PaginationRequest, Timestamp wrappers
```

Then the payment service proto — this is the contract that the gateway and other services call:

```protobuf
// proto/payment/v1/payment.proto
syntax = "proto3";
package payment.v1;

import "common/v1/common.proto";

service PaymentService {
  rpc CreatePayment(CreatePaymentRequest) returns (CreatePaymentResponse);
  rpc GetPayment(GetPaymentRequest) returns (Payment);
  // Server streaming — client receives status updates in real time
  rpc WatchPayment(WatchPaymentRequest) returns (stream PaymentStatusEvent);
}

message CreatePaymentRequest {
  string user_id = 1;
  common.v1.Money amount = 2;
  string description = 3;
  string idempotency_key = 4;   // Prevents duplicate charges
}

message Payment {
  string id = 1;
  string user_id = 2;
  common.v1.Money amount = 3;
  PaymentStatus status = 4;   // PENDING, PROCESSING, COMPLETED, FAILED
  string created_at = 5;
}
```

Notice the `idempotency_key` — a lesson learned from REST, where retried POST requests created duplicate payments. With protobuf, the field is part of the contract, not an optional header that half the services forget to check.

### Step 2: Build the API Gateway Translation Layer

The gateway is where REST meets gRPC. External clients send JSON over HTTPS; the gateway validates, translates to protobuf, calls internal gRPC services, and translates back. Authentication happens once, at this boundary.

```typescript
// api-gateway/src/routes/payments.ts
import express from "express";
import { PaymentServiceClient } from "../generated/payment/v1/payment_grpc_pb";
import { CreatePaymentRequest } from "../generated/payment/v1/payment_pb";
import { Money } from "../generated/common/v1/common_pb";
import { grpcToHttpError } from "../middleware/error-mapper";
import { credentials, Metadata } from "@grpc/grpc-js";

const router = express.Router();
const paymentClient = new PaymentServiceClient(
  process.env.PAYMENT_SERVICE_URL || "payment-service:50051",
  credentials.createInsecure()   // Internal network — TLS terminated at ingress
);

// POST /api/v1/payments → PaymentService.CreatePayment
router.post("/", async (req, res, next) => {
  try {
    const grpcRequest = new CreatePaymentRequest();
    grpcRequest.setUserId(req.user.id);         // From JWT, validated at gateway
    grpcRequest.setDescription(req.body.description);
    grpcRequest.setIdempotencyKey(req.body.idempotency_key);

    const money = new Money();
    money.setAmountCents(req.body.amount_cents);
    money.setCurrency(req.body.currency || "USD");
    grpcRequest.setAmount(money);

    // Forward user context as gRPC metadata — no JWT re-validation downstream
    const metadata = new Metadata();
    metadata.set("x-user-id", req.user.id);
    metadata.set("x-user-role", req.user.role);
    metadata.set("x-request-id", req.requestId);

    const response = await callGrpc(paymentClient, "createPayment", grpcRequest, metadata);
    res.status(201).json(paymentToJson(response));
  } catch (err) {
    next(grpcToHttpError(err));   // gRPC INVALID_ARGUMENT → 400, NOT_FOUND → 404, etc.
  }
});
```

The `grpcToHttpError` middleware maps gRPC status codes to HTTP status codes consistently. No more guessing whether `{ "error": "not found" }` means 404 or 500 — every service uses the same gRPC codes, and the gateway translates them uniformly.

### Step 3: Implement Auth Propagation with gRPC Metadata

This is where the 6-Redis-lookups-per-request problem gets solved. The gateway validates the JWT once and passes user context as trusted gRPC metadata. Internal services read it from the metadata — no Redis, no token validation, no cryptographic verification:

```typescript
// api-gateway/src/middleware/auth.ts
import { verify } from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = verify(token, process.env.JWT_SECRET);
    req.requestId = crypto.randomUUID();
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
```

On the receiving end, a gRPC interceptor extracts user context from metadata on every request:

```typescript
// payment-service/src/interceptors/auth.ts
import { ServerUnaryCall, Metadata } from "@grpc/grpc-js";

export function authInterceptor(call: ServerUnaryCall<any, any>, callback, next) {
  const userId = call.metadata.get("x-user-id")[0]?.toString();
  const userRole = call.metadata.get("x-user-role")[0]?.toString();
  const requestId = call.metadata.get("x-request-id")[0]?.toString();

  if (!userId) {
    return callback({ code: 16, message: "Unauthenticated: missing user context" });
  }

  // Attach to call context — available in all handlers
  call.user = { id: userId, role: userRole };
  call.requestId = requestId;
  next();
}
```

One JWT validation per request instead of six. The Redis lookups disappear entirely for the internal hops.

### Step 4: Build the Payment Service with Internal gRPC Calls

The payment service itself makes gRPC calls to the user and compliance services. With HTTP/2 multiplexing, these calls share a single connection per service — no connection pool management, no keep-alive tuning:

```typescript
// payment-service/src/handlers/create-payment.ts
import { UserServiceClient } from "../generated/user/v1/user_grpc_pb";
import { ComplianceServiceClient } from "../generated/compliance/v1/compliance_grpc_pb";

const userClient = new UserServiceClient("user-service:50051", insecureCreds);
const complianceClient = new ComplianceServiceClient("compliance-service:50051", insecureCreds);

async function createPayment(call, callback) {
  const { userId, amount, idempotencyKey } = call.request.toObject();

  // Internal gRPC calls — user context propagated via metadata
  const metadata = propagateMetadata(call);

  // Parallel calls where possible — HTTP/2 multiplexing makes this efficient
  const [user, kycResult] = await Promise.all([
    callGrpc(userClient, "getUser", { userId }, metadata),
    callGrpc(complianceClient, "checkKyc", { userId, amount }, metadata),
  ]);

  if (kycResult.status === "BLOCKED") {
    return callback({
      code: 9,  // FAILED_PRECONDITION
      message: `KYC check failed: ${kycResult.reason}`,
    });
  }

  const payment = await db.payments.create({
    userId, amount, idempotencyKey,
    status: "PROCESSING",
  });

  callback(null, toPaymentProto(payment));
}
```

The `Promise.all` on lines where user verification and KYC run in parallel shaves another 80-120ms off the payment flow. With REST over HTTP/1.1, parallel requests to the same host required separate TCP connections. HTTP/2 multiplexes them over one.

### Step 5: Add Streaming for Real-Time Payment Status

Server streaming replaces the old polling pattern. Instead of the mobile app hitting `GET /payments/:id/status` every 2 seconds, the gateway opens a Server-Sent Events stream backed by a gRPC server stream:

```typescript
// api-gateway/src/routes/payments.ts — SSE endpoint
router.get("/:id/status", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const metadata = new Metadata();
  metadata.set("x-user-id", req.user.id);

  // gRPC server stream → SSE events
  const stream = paymentClient.watchPayment({ paymentId: req.params.id }, metadata);

  stream.on("data", (event) => {
    res.write(`data: ${JSON.stringify({
      status: event.getStatus(),
      timestamp: event.getTimestamp(),
      message: event.getMessage(),
    })}\n\n`);
  });

  stream.on("end", () => res.end());
  stream.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });

  req.on("close", () => stream.cancel());
});
```

External clients get clean SSE — standard browser APIs work. Internally, gRPC server streaming handles the multiplexing and backpressure. No WebSocket libraries, no socket.io, no sticky sessions.

### Step 6: Docker Compose with Shared Proto Generation

All six services share the same proto directory, mounted read-only. A `proto-gen` service runs `protoc` at build time, generating type-safe clients for Node.js, Python, and Go from the same source files:

```yaml
# docker-helper.yml
services:
  api-gateway:
    build: { context: ., dockerfile: api-gateway/Dockerfile }
    ports: ["3000:3000"]
    depends_on: [user-service, payment-service, compliance-service]
    volumes: ["./proto:/app/proto:ro"]

  payment-service:
    build: { context: ., dockerfile: payment-service/Dockerfile }
    ports: ["50051:50051"]
    volumes: ["./proto:/app/proto:ro"]

  proto-gen:
    image: namely/protoc-all:1.51
    volumes:
      - ./proto:/proto
      - ./api-gateway/src/generated:/output/node
      - ./compliance-service/generated:/output/python
      - ./document-service/generated:/output/go
    command: -f proto/**/*.proto -l node -l python -l go -o /output
```

A proto change gets caught at compile time across all languages. No more discovering at 2 AM that the compliance service added a required field that the payment service doesn't send.

## Real-World Example

Three weeks after the migration, Sami's latency dashboard tells the story. The p95 for the payment flow dropped from 840ms to 320ms — well under the 500ms compliance requirement. Protobuf serialization and HTTP/2 multiplexing account for most of the improvement, but the parallel user+KYC calls (impossible with HTTP/1.1 without connection pool gymnastics) contributed another 100ms.

Internal payloads average 780 bytes, down from 4.2KB of JSON. The 30 hand-maintained HTTP clients are gone — replaced by auto-generated gRPC stubs that compile against the proto definitions. When the compliance team adds a `risk_score` field to the KYC response, every consuming service knows about it at build time.

The team's weekly debugging hours dropped from 8 to 2. The error format inconsistency disappeared overnight — gRPC status codes map cleanly to HTTP codes at the gateway, and internal services never invent their own error shapes. The one JWT validation per request eliminated 5 Redis roundtrips from every payment flow.

Sami's favorite part: a new engineer onboarded last week and had a working gRPC service talking to the existing mesh within a day. She read the proto files, ran the code generator, and implemented the interface. No Slack messages asking "what does the user service return when the account is suspended?" — it's in the proto, enforced by the compiler.
