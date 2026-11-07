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

Sami is the platform engineer at a 30-person fintech startup. After splitting a monolith into 6 microservices, communication between them is a mess.

All inter-service calls are REST over HTTP/1.1. A single payment request triggers a chain of calls: payment to user, user to compliance (KYC), compliance to documents. Every hop serializes JSON, crosses the network and deserializes again; the p95 for the payment flow is 840ms and compliance requires under 500ms.

Authentication is duplicated: each service validates JWTs on its own. Error handling is inconsistent: one service returns `{ "error": "not found" }`, another `{ "code": 404, "msg": "Not found" }`, a third `{ "status": "error", "reason": "missing" }`. Every service hand-maintains an HTTP client for every other service, and retried POSTs have created duplicate payments. External clients (web, mobile) need REST; internal services do not.

## The Solution

Keep REST for external clients and move service-to-service calls to gRPC. A gateway sits at the boundary: it authenticates the JWT once, validates the JSON, calls internal services over gRPC with the user identity in metadata, and maps gRPC status codes to HTTP in one place. The **rest-api** skill shapes the public API (status codes, error format, idempotency), **grpc** the internal contracts, and **docker-helper** the packaging. The code below was run end to end with `@grpc/grpc-js` 1.14, `@grpc/proto-loader` 0.8, Express 5 and `jsonwebtoken` 9.

## Step-by-Step Walkthrough

### Step 1: Set up the project and the proto contracts

```bash
npm init -y && npm install @grpc/grpc-js @grpc/proto-loader express jsonwebtoken zod
npm install -D typescript tsx @types/node @types/express @types/jsonwebtoken
```

Every message and service lives in one shared `proto/` directory, versioned by package name (`payment.v1`):

```protobuf
// proto/payment/v1/payment.proto
syntax = "proto3";
package payment.v1;

service PaymentService {
  rpc CreatePayment(CreatePaymentRequest) returns (Payment);
}

enum PaymentStatus {
  PAYMENT_STATUS_UNSPECIFIED = 0;
  PAYMENT_STATUS_PROCESSING = 1;
  PAYMENT_STATUS_COMPLETED = 2;
}

message CreatePaymentRequest {
  int64 amount_cents = 1;
  string currency = 2;        // ISO 4217: "USD", "EUR"
  string idempotency_key = 3; // a retried request returns the same payment
}

message Payment {
  string id = 1;
  string user_id = 2;
  int64 amount_cents = 3;
  string currency = 4;
  PaymentStatus status = 5;
}

// proto/compliance/v1/compliance.proto
syntax = "proto3";
package compliance.v1;

service ComplianceService {
  rpc CheckKyc(CheckKycRequest) returns (CheckKycResponse);
}

message CheckKycRequest { string user_id = 1; int64 amount_cents = 2; }
message CheckKycResponse { bool approved = 1; string reason = 2; }
```

`idempotency_key` is part of the contract, not an optional header that half the services forget to check. `int64` values reach JavaScript as strings (`longs: String` in the loader) to avoid precision loss.

### Step 2: A shared gRPC helper

`@grpc/proto-loader` reads the `.proto` files at runtime, so there is no `protoc` step (`npx proto-loader-gen-types` adds TypeScript interfaces if you want them). The helper loads a contract, wraps calls in promises with a mandatory deadline, and reads the identity metadata:

```typescript
// src/grpc.ts
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
export function load(file: string): any {
  const def = protoLoader.loadSync(file, {
    includeDirs: [path.join(__dirname, "../proto")],
    keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
  });
  return grpc.loadPackageDefinition(def);
}
export function call<T = any>(client: any, method: string, req: object, md = new grpc.Metadata()): Promise<T> {
  return new Promise((resolve, reject) =>
    client[method](req, md, { deadline: Date.now() + 3000 }, (err: grpc.ServiceError | null, res: T) =>
      err ? reject(err) : resolve(res)));
}
export function userFrom(md: grpc.Metadata) {
  const id = md.get("x-user-id")[0]?.toString();
  return id ? { id, role: md.get("x-user-role")[0]?.toString() } : null;
}
```

### Step 3: The internal services

The compliance service is a single handler:

```typescript
// src/compliance.ts
import * as grpc from "@grpc/grpc-js";
import { load } from "./grpc";
const pkg = load("compliance/v1/compliance.proto");
const server = new grpc.Server();
server.addService(pkg.compliance.v1.ComplianceService.service, {
  CheckKyc(c: any, cb: any) {
    const { amountCents } = c.request;
    cb(null, Number(amountCents) > 1_000_000
      ? { approved: false, reason: "amount above manual-review limit" }
      : { approved: true, reason: "" });
  },
});
server.bindAsync(process.env.GRPC_ADDR ?? "127.0.0.1:50052", grpc.ServerCredentials.createInsecure(),
  (err, port) => { if (err) throw err; console.log(`compliance on ${port}`); });
```

The payment service calls compliance over gRPC, rejects missing identity with `UNAUTHENTICATED`, and stores the in-flight promise per idempotency key before awaiting, so two concurrent retries cannot both charge:

```typescript
// src/payment.ts
import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { call, load, userFrom } from "./grpc";
const payments = load("payment/v1/payment.proto").payment.v1;
const compliance = new (load("compliance/v1/compliance.proto").compliance.v1.ComplianceService)(
  process.env.COMPLIANCE_ADDR ?? "127.0.0.1:50052", grpc.credentials.createInsecure());
const byKey = new Map<string, Promise<any>>(); // user:key -> in-flight or finished payment
async function charge(user: { id: string }, req: any) {
  const kyc = await call(compliance, "CheckKyc", { userId: user.id, amountCents: req.amountCents });
  if (!kyc.approved) {
    throw { code: grpc.status.FAILED_PRECONDITION, message: `KYC failed: ${kyc.reason}` };
  }
  const p = { id: randomUUID(), userId: user.id, amountCents: req.amountCents, currency: req.currency, status: "PAYMENT_STATUS_PROCESSING" };
  return p;
}
const handlers = {
  CreatePayment(c: any, cb: any) {
    const user = userFrom(c.metadata);
    if (!user) return cb({ code: grpc.status.UNAUTHENTICATED, message: "missing user context" });
    const req = c.request;
    if (!req.idempotencyKey) return cb({ code: grpc.status.INVALID_ARGUMENT, message: "idempotency_key required" });
    const key = `${user.id}:${req.idempotencyKey}`;
    if (!byKey.has(key)) {
      const run = charge(user, req);
      byKey.set(key, run);
      run.catch(() => byKey.delete(key)); // a failed attempt may be retried
    }
    byKey.get(key)!.then((p) => cb(null, p), (e) => cb(e));
  },
};
const server = new grpc.Server();
server.addService(payments.PaymentService.service, handlers);
server.bindAsync(process.env.GRPC_ADDR ?? "127.0.0.1:50051", grpc.ServerCredentials.createInsecure(),
  (err, port) => { if (err) throw err; console.log(`payment on ${port}`); });
```

### Step 4: The gateway

External clients send JSON over HTTPS. The gateway verifies the JWT once (algorithm pinned to HS256, secret from the environment), validates the body with zod, and forwards `x-user-id` and `x-user-role` as gRPC metadata. Internal services trust that metadata, so they must only be reachable from the gateway (Step 6).

```typescript
// src/gateway.ts
import express, { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import * as grpc from "@grpc/grpc-js";
import { z } from "zod";
import { call, load } from "./grpc";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const payments = new (load("payment/v1/payment.proto").payment.v1.PaymentService)(
  process.env.PAYMENT_ADDR ?? "127.0.0.1:50051", grpc.credentials.createInsecure());
const HTTP: Record<number, number> = {
  [grpc.status.INVALID_ARGUMENT]: 400, [grpc.status.UNAUTHENTICATED]: 401, [grpc.status.PERMISSION_DENIED]: 403,
  [grpc.status.NOT_FOUND]: 404, [grpc.status.ALREADY_EXISTS]: 409, [grpc.status.FAILED_PRECONDITION]: 422,
  [grpc.status.RESOURCE_EXHAUSTED]: 429, [grpc.status.UNAVAILABLE]: 503, [grpc.status.DEADLINE_EXCEEDED]: 504,
};
function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  try {
    const claims = jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (!claims.sub) throw new Error("no subject");
    res.locals.user = { id: claims.sub, role: String(claims.role ?? "user") };
    next();
  } catch {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or missing token" } });
  }
}
const identity = (res: Response) => {
  const md = new grpc.Metadata();
  md.set("x-user-id", res.locals.user.id);
  md.set("x-user-role", res.locals.user.role);
  return md;
};
const CreatePayment = z.object({
  amount_cents: z.number().int().positive().max(100_000_000),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
});
const app = express();
app.use(express.json({ limit: "10kb" }));
app.use("/api/v1", auth);
app.post("/api/v1/payments", async (req, res, next) => {
  const key = req.header("Idempotency-Key");
  const body = CreatePayment.safeParse(req.body);
  if (!key) return void res.status(400).json({ error: { code: "INVALID_ARGUMENT", message: "Idempotency-Key header required" } });
  if (!body.success) return void res.status(400).json({ error: { code: "INVALID_ARGUMENT", message: z.prettifyError(body.error) } });
  try {
    const p = await call(payments, "CreatePayment", {
      amountCents: body.data.amount_cents, currency: body.data.currency, idempotencyKey: key,
    }, identity(res));
    res.status(201).json(p);
  } catch (e) { next(e); }
});
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = HTTP[err.code] ?? 500;
  res.status(status).json({ error: { code: grpc.status[err.code] ?? "INTERNAL", message: status === 500 ? "Internal error" : err.details ?? err.message } });
});
app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? "127.0.0.1");
```

Use a `tsconfig.json` with `"module": "node16"`, `"strict": true`, `"outDir": "dist"`, `"rootDir": "src"`.

### Step 5: Try it

Start the three processes (each in its own terminal, `JWT_SECRET` exported; everything binds to 127.0.0.1) and call the gateway with an HS256 token whose `sub` is `user_42`:

```console
$ npx tsx src/compliance.ts   # compliance on 50052
$ npx tsx src/payment.ts      # payment on 50051
$ npx tsx src/gateway.ts      # REST on 127.0.0.1:3000
$ curl -s -X POST localhost:3000/api/v1/payments -H "Authorization: Bearer $TOKEN" \
    -H 'Idempotency-Key: order-1001' -H 'content-type: application/json' -d '{"amount_cents":4900}'
{"id":"e644b5a9-...","userId":"user_42","amountCents":"4900","currency":"USD","status":"PAYMENT_STATUS_PROCESSING"}
```

Repeating the request with the same `Idempotency-Key` returns the same payment id. An amount of 5000000 returns `422` (`FAILED_PRECONDITION`), a missing token `401`, a missing key `400`.

### Step 6: Package with Docker Compose

One image holds all three services; only the gateway publishes a port, and only on loopback. The gRPC services have no `ports:` entry, so they are reachable only on the Compose network:

```dockerfile
# Dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --include=dev
COPY proto ./proto
COPY src ./src
RUN npx tsc && npm prune --omit=dev
USER node
```

```yaml
# compose.yaml
services:
  gateway:
    build: .
    command: ["node", "dist/gateway.js"]
    environment: { HOST: 0.0.0.0, PAYMENT_ADDR: "payment:50051", JWT_SECRET: "${JWT_SECRET:?set JWT_SECRET}" }
    ports: ["127.0.0.1:3000:3000"]
  payment:
    build: .
    command: ["node", "dist/payment.js"]
    environment: { GRPC_ADDR: "0.0.0.0:50051", COMPLIANCE_ADDR: "compliance:50052" }
  compliance:
    build: .
    command: ["node", "dist/compliance.js"]
    environment: { GRPC_ADDR: "0.0.0.0:50052" }
```

```bash
export JWT_SECRET=$(openssl rand -base64 32)
docker compose up -d --build
```

For hosts that do not share a private network, use `grpc.ServerCredentials.createSsl(...)` or mutual TLS from a service mesh instead of `createInsecure()`.

## Real-World Example

On their own staging data, the p95 fell from 840ms to under the 500ms compliance limit once the chain of JSON hops became binary gRPC calls over persistent HTTP/2 connections. Your numbers will differ, so measure your own p95 before and after.

The 30 hand-maintained HTTP clients are gone: each service loads the same `.proto` files. When compliance adds a `risk_score` field, every consumer sees it at the next load. The error-format inconsistency disappeared because internal services only use gRPC status codes, and the gateway's single table turns them into HTTP codes. Retried payment requests with the same `Idempotency-Key` return the first payment instead of charging twice. The in-memory key map is a teaching stand-in: in production store keys in a database with a unique constraint and compare the payload, so a reused key with a different amount is rejected.

## Related Skills

- [rest-api](/skills/rest-api) - public API design: status codes, error shape, validation, auth middleware
- [grpc](/skills/grpc) - protobuf design, streaming, deadlines, metadata and interceptors
- [docker-helper](/skills/docker-helper) - Dockerfile and Compose practices used in Step 6
