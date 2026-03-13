---
title: Build a gRPC Microservice in TypeScript
slug: build-grpc-microservice-in-typescript
description: >-
  Build a high-performance gRPC service with TypeScript — define protobuf
  schemas, implement server and client, add streaming, error handling,
  middleware, and connect to a REST gateway.
skills:
  - grpc
  - docker-compose
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

Viktor's microservices communicate via REST, but serialization overhead and lack of contracts cause bugs. Service A sends `{ user_id: "123" }`, service B expects `{ userId: "123" }`. gRPC solves this: define the contract in protobuf, generate typed clients for every language, get binary serialization (10x faster than JSON), and bidirectional streaming for real-time data flows.

## Step 1: Define Protobuf Schema

```protobuf
// proto/user.proto
syntax = "proto3";

package user;

service UserService {
  // Unary RPCs
  rpc GetUser(GetUserRequest) returns (UserResponse);
  rpc CreateUser(CreateUserRequest) returns (UserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc UpdateUser(UpdateUserRequest) returns (UserResponse);
  rpc DeleteUser(DeleteUserRequest) returns (Empty);

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

message UpdateUserRequest {
  string id = 1;
  optional string name = 2;
  optional string role = 3;
}

message DeleteUserRequest {
  string id = 1;
}

message UserResponse {
  string id = 1;
  string email = 2;
  string name = 3;
  string role = 4;
  int64 created_at = 5;
}

message ListUsersRequest {
  int32 page = 1;
  int32 limit = 2;
  optional string role_filter = 3;
}

message ListUsersResponse {
  repeated UserResponse users = 1;
  int32 total = 2;
  int32 page = 3;
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

message Empty {}
```

## Step 2: Generate TypeScript Types

```bash
npm install @grpc/grpc-js @grpc/proto-loader google-protobuf
npm install -D grpc-tools grpc_tools_node_protoc_ts
```

```bash
#!/bin/bash
# scripts/gen-proto.sh
PROTO_DIR=./proto
OUT_DIR=./src/generated

mkdir -p $OUT_DIR

npx grpc_tools_node_protoc \
  --js_out=import_style=commonjs,binary:$OUT_DIR \
  --grpc_out=grpc_js:$OUT_DIR \
  --ts_out=grpc_js:$OUT_DIR \
  -I $PROTO_DIR \
  $PROTO_DIR/*.proto

echo "Generated TypeScript types from protobuf"
```

## Step 3: Implement the Server

```typescript
// src/server.ts
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

const PROTO_PATH = path.join(__dirname, "../proto/user.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

// Service implementation
const userService: grpc.UntypedServiceImplementation = {
  async getUser(call, callback) {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, call.request.id),
      });

      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `User ${call.request.id} not found`,
        });
      }

      callback(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: Math.floor(user.createdAt.getTime() / 1000),
      });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: "Internal error" });
    }
  },

  async createUser(call, callback) {
    try {
      const { email, name, role } = call.request;
      const [user] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email,
        name,
        role: role || "viewer",
        createdAt: new Date(),
      }).returning();

      callback(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: Math.floor(user.createdAt.getTime() / 1000),
      });
    } catch (err: any) {
      if (err.code === "23505") {
        callback({ code: grpc.status.ALREADY_EXISTS, message: "Email already exists" });
      } else {
        callback({ code: grpc.status.INTERNAL, message: "Internal error" });
      }
    }
  },

  async listUsers(call, callback) {
    const { page = 1, limit = 20, roleFilter } = call.request;
    const offset = (page - 1) * limit;

    const where = roleFilter ? eq(users.role, roleFilter) : undefined;
    const [data, [{ count }]] = await Promise.all([
      db.query.users.findMany({ where, limit, offset, orderBy: [desc(users.createdAt)] }),
      db.select({ count: sql`count(*)` }).from(users).where(where),
    ]);

    callback(null, {
      users: data.map(toProtoUser),
      total: Number(count),
      page,
    });
  },

  // Server streaming
  watchUserActivity(call) {
    const userId = call.request.userId;
    console.log(`Watching activity for user: ${userId}`);

    const interval = setInterval(() => {
      // In reality, this would come from a message queue or event stream
      call.write({
        userId,
        action: "page_view",
        details: "/dashboard",
        timestamp: Math.floor(Date.now() / 1000),
      });
    }, 5000);

    call.on("cancelled", () => {
      clearInterval(interval);
      console.log(`Watch cancelled for user: ${userId}`);
    });
  },
};

// Start server
const server = new grpc.Server();
server.addService(proto.user.UserService.service, userService);

server.bindAsync("0.0.0.0:50051", grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) throw err;
  console.log(`gRPC server running on port ${port}`);
});
```

## Step 4: Type-Safe Client

```typescript
// src/client.ts
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const packageDefinition = protoLoader.loadSync("./proto/user.proto", {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

const client = new proto.user.UserService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

// Promisify for async/await
function promisify<TReq, TRes>(method: Function): (req: TReq) => Promise<TRes> {
  return (request: TReq) =>
    new Promise((resolve, reject) => {
      method.call(client, request, (err: any, response: TRes) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
}

export const userClient = {
  getUser: promisify<{ id: string }, UserResponse>(client.getUser),
  createUser: promisify<CreateUserRequest, UserResponse>(client.createUser),
  listUsers: promisify<ListUsersRequest, ListUsersResponse>(client.listUsers),

  watchActivity(userId: string, onEvent: (event: ActivityEvent) => void) {
    const stream = client.watchUserActivity({ userId });
    stream.on("data", onEvent);
    stream.on("error", (err: any) => console.error("Stream error:", err));
    return () => stream.cancel();
  },
};

// Usage
const user = await userClient.getUser({ id: "abc-123" });
const { users, total } = await userClient.listUsers({ page: 1, limit: 10 });
```

## Summary

Viktor's microservices now communicate through gRPC with strict contracts. The protobuf schema is the source of truth — both services generate types from the same `.proto` file, so field name mismatches are impossible. Binary serialization makes payloads 5-10x smaller than JSON. Server streaming lets the activity watcher push real-time events without polling. Error handling uses gRPC status codes (`NOT_FOUND`, `ALREADY_EXISTS`) that map cleanly to HTTP status codes if he adds a REST gateway later. The protobuf definition is language-agnostic — if he later writes a Go or Python service, it generates compatible clients from the same schema.
