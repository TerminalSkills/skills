---
title: Build a gRPC Microservice in TypeScript
slug: build-grpc-microservice-in-typescript
description: >-
  Build a gRPC service in TypeScript: define a protobuf schema, generate types,
  implement unary and server-streaming handlers with zod validation and status
  codes, write a deadline-aware client, and package it with Docker.
skills:
  - grpc
  - docker-helper
  - zod
category: development
tags:
  - grpc
  - microservices
  - protobuf
  - typescript
  - api
---

# Build a gRPC Microservice in TypeScript

Viktor's microservices communicate via REST, but loose JSON contracts cause bugs. Service A sends `{ user_id: "123" }`, service B expects `{ userId: "123" }`. gRPC solves this: the contract lives in a protobuf file, typed clients and servers come from it, payloads are binary (typically much smaller than JSON), and streaming is built in. This walkthrough builds a user service with `@grpc/grpc-js`, generates TypeScript types with `proto-loader-gen-types`, validates input with zod, and packages it with Docker.

## Step 1: Set up the project

```bash
mkdir user-service && cd user-service
npm init -y
npm install @grpc/grpc-js @grpc/proto-loader zod
npm install -D typescript tsx @types/node
mkdir proto src
```

`tsconfig.json`:

```json
{ "compilerOptions": { "target": "ES2022", "module": "node16", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

## Step 2: Define the protobuf schema

```protobuf
// proto/user.proto
syntax = "proto3";

package user;

service UserService {
  // Unary RPCs
  rpc GetUser(GetUserRequest) returns (UserResponse);
  rpc CreateUser(CreateUserRequest) returns (UserResponse);

  // Server streaming — push updates as they happen
  rpc WatchUserActivity(WatchRequest) returns (stream ActivityEvent);
}

message GetUserRequest {
  string id = 1;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
  string role = 3;
}

message UserResponse {
  string id = 1;
  string email = 2;
  string name = 3;
  string role = 4;
  int64 created_at = 5;
}

message WatchRequest {
  string user_id = 1;
}

message ActivityEvent {
  string user_id = 1;
  string action = 2;
  string details = 3;
  int64 timestamp = 4;
}
```

Field numbers are permanent: never reuse one, and mark removed fields `reserved`. Mark a field `optional` when the server must tell "not sent" from "set to empty".

## Step 3: Generate TypeScript types

`@grpc/proto-loader` loads the `.proto` at runtime, so there is no protoc toolchain to install. Its bundled `proto-loader-gen-types` command generates the matching TypeScript interfaces:

```bash
npx proto-loader-gen-types --keepCase=false --longs=String --enums=String --defaults --oneofs \
  --grpcLib=@grpc/grpc-js --outDir=src/generated proto/user.proto
```

Add it as an npm script (`"gen": "..."`) and rerun it whenever the `.proto` changes. Use the same options in `loadSync` below: the generated types describe exactly what the loader returns.

## Step 4: Implement the server

```typescript
// src/server.ts
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { z } from "zod";
import type { ProtoGrpcType } from "./generated/user";
import type { UserServiceHandlers } from "./generated/user/UserService";
import type { UserResponse } from "./generated/user/UserResponse";

const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, "../proto/user.proto"),
  { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true },
);
const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

// zod guards the edge: protobuf only checks types, not "is this an email"
const CreateUser = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

// In-memory store; swap for your database layer
const users = new Map<string, UserResponse>();

const handlers: UserServiceHandlers = {
  GetUser(call, callback) {
    const user = users.get(call.request.id);
    if (!user) {
      return callback({ code: grpc.status.NOT_FOUND, message: `User ${call.request.id} not found` });
    }
    callback(null, user);
  },

  CreateUser(call, callback) {
    const parsed = CreateUser.safeParse({
      ...call.request,
      role: call.request.role || undefined, // proto3 sends "" for an unset string
    });
    if (!parsed.success) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: z.prettifyError(parsed.error) });
    }
    const { email, name, role } = parsed.data;
    if ([...users.values()].some((u) => u.email === email)) {
      return callback({ code: grpc.status.ALREADY_EXISTS, message: "Email already exists" });
    }
    const user: UserResponse = {
      id: randomUUID(), email, name, role,
      createdAt: Math.floor(Date.now() / 1000),
    };
    users.set(user.id!, user);
    callback(null, user);
  },

  // Server streaming: push events until the client goes away
  WatchUserActivity(call) {
    const userId = call.request.userId;
    const timer = setInterval(() => {
      // In production, subscribe to a queue or event stream instead of a timer
      call.write({ userId, action: "page_view", details: "/dashboard", timestamp: Math.floor(Date.now() / 1000) });
    }, 1000);
    call.on("cancelled", () => clearInterval(timer));
    call.on("error", () => clearInterval(timer));
  },
};

const server = new grpc.Server();
server.addService(proto.user.UserService.service, handlers);

// 127.0.0.1 for local work; in a container bind 0.0.0.0 and publish the port on loopback
const addr = process.env.GRPC_ADDR ?? "127.0.0.1:50051";
server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) throw err;
  console.log(`gRPC server listening on ${port}`); // grpc-js >= 1.10: no server.start() needed
});
```

Handler names are the RPC names from the proto (`GetUser`), and the generated `UserServiceHandlers` type makes the compiler list any RPC you forgot. Errors use gRPC status codes (`NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`), which map cleanly onto HTTP codes if you add a REST gateway later.

## Step 5: Write a client and try it

```typescript
// src/client.ts
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { ProtoGrpcType } from "./generated/user";
import type { CreateUserRequest } from "./generated/user/CreateUserRequest";
import type { GetUserRequest } from "./generated/user/GetUserRequest";
import type { UserResponse__Output } from "./generated/user/UserResponse";

const def = protoLoader.loadSync(path.join(__dirname, "../proto/user.proto"), {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(def) as unknown as ProtoGrpcType;

const client = new proto.user.UserService(
  process.env.GRPC_ADDR ?? "127.0.0.1:50051",
  grpc.credentials.createInsecure(),
);

// Always set a deadline: an unbounded call can hang forever
const opts = () => ({ deadline: Date.now() + 5_000 });
// Wrap any unary method as a promise
const unary = <Req, Res>(
  fn: (req: Req, opts: grpc.CallOptions, cb: (e: grpc.ServiceError | null, r?: Res) => void) => unknown,
  req: Req,
) => new Promise<Res>((resolve, reject) =>
  fn.call(client, req, opts(), (e, r) => (e ? reject(e) : resolve(r as Res))));

async function main() {
  const created = await unary<CreateUserRequest, UserResponse__Output>(client.CreateUser, { email: "viktor@example.com", name: "Viktor", role: "admin" });
  console.log("created", created);
  console.log("fetched", await unary<GetUserRequest, UserResponse__Output>(client.GetUser, { id: created.id }));

  await unary(client.CreateUser, { email: "not-an-email", name: "X" })
    .catch((e: grpc.ServiceError) => console.log("invalid ->", grpc.status[e.code], e.details));

  const stream = client.WatchUserActivity({ userId: created.id });
  stream.on("data", (ev) => { console.log("event", ev); stream.cancel(); });
  stream.on("error", (e) => { if (e.code !== grpc.status.CANCELLED) console.error(e); else client.close(); });
}
main();
```

Run both (the server in one terminal, the client in another):

```console
$ npx tsc --noEmit
$ npx tsx src/server.ts
gRPC server listening on 50051
$ npx tsx src/client.ts
created { id: 'fe076dfd-...', email: 'viktor@example.com', name: 'Viktor', role: 'admin', createdAt: '1793834712' }
fetched { id: 'fe076dfd-...', ... }
invalid -> INVALID_ARGUMENT ✖ Invalid email address
  → at email
event { userId: 'fe076dfd-...', action: 'page_view', details: '/dashboard', timestamp: '1793834713' }
```

`int64` fields arrive as strings because of `longs: String`; that avoids silent precision loss above 2^53.

## Step 6: Package it with Docker

```dockerfile
# Dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY proto ./proto
COPY src ./src
RUN npx tsc

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY proto ./proto
USER node
EXPOSE 50051
CMD ["node", "dist/server.js"]
```

```bash
docker build -t user-service .
# Inside the container the server binds 0.0.0.0; publish the port on loopback only
docker run -d --name user-service -e GRPC_ADDR=0.0.0.0:50051 -p 127.0.0.1:50051:50051 user-service
docker logs user-service
```

`createInsecure()` sends plaintext. Keep it for localhost and a private network; across hosts use `grpc.ServerCredentials.createSsl(...)` or terminate TLS at your proxy or mesh.

## Summary

Viktor's services now share one protobuf contract. The generated types turn a field-name mismatch into a compile error, zod rejects malformed input with `INVALID_ARGUMENT` before it reaches the database layer, the activity watcher pushes events over a server stream without polling, and the Docker image runs the compiled service as a non-root user. The in-memory `Map` is a stand-in: replace it with the team's database calls. The same `.proto` file generates clients in Go or Python when he adds services in those languages.

## Related Skills

- [grpc](/skills/grpc) - protobuf design, streaming, interceptors, deadlines and health checks
- [docker-helper](/skills/docker-helper) - Dockerfile practices used in Step 6
- [zod](/skills/zod) - schema validation at the service edge
