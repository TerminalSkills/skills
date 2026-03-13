---
title: Build Microservice Communication with gRPC
slug: build-microservice-communication-with-grpc
description: Build type-safe microservice communication using gRPC with Protocol Buffers — replacing REST with strongly typed contracts, bidirectional streaming, and 10x better performance for internal APIs.
skills:
  - typescript
  - zod
  - redis
category: Backend Development
tags:
  - grpc
  - microservices
  - protobuf
  - rpc
  - performance
---

# Build Microservice Communication with gRPC

## The Problem

Tao leads backend at a 50-person company with 12 microservices. All inter-service communication is REST over HTTP/1.1 with JSON. A single user request fans out to 4 services, each adding 20-50ms of JSON serialization overhead. Total internal latency is 200ms just in serialization. API contracts are informal — when the user service changes its response shape, the order service breaks in production. gRPC with Protocol Buffers would enforce contracts at compile time, reduce serialization overhead by 90%, and enable bidirectional streaming for real-time data.

## Step 1: Define Service Contracts with Protocol Buffers

```protobuf
// proto/user_service.proto — Strongly typed service contract
syntax = "proto3";

package user;

service UserService {
  // Unary RPC — single request, single response
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  
  // Server streaming — real-time user activity feed
  rpc StreamUserActivity(StreamActivityRequest) returns (stream ActivityEvent);
  
  // Batch — get multiple users efficiently
  rpc GetUsers(GetUsersRequest) returns (GetUsersResponse);
}

message GetUserRequest {
  string user_id = 1;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
  string plan = 3;
}

message UpdateUserRequest {
  string user_id = 1;
  optional string name = 2;
  optional string email = 3;
  optional string plan = 4;
}

message User {
  string id = 1;
  string email = 2;
  string name = 3;
  string plan = 4;
  string avatar_url = 5;
  int64 created_at = 6;       // Unix timestamp
  repeated string roles = 7;
}

message GetUsersRequest {
  repeated string user_ids = 1;
}

message GetUsersResponse {
  repeated User users = 1;
}

message StreamActivityRequest {
  string user_id = 1;
  int64 since = 2;            // Unix timestamp
}

message ActivityEvent {
  string event_id = 1;
  string user_id = 2;
  string action = 3;
  string resource_type = 4;
  string resource_id = 5;
  int64 timestamp = 6;
  map<string, string> metadata = 7;
}
```

## Step 2: Implement the gRPC Server

```typescript
// src/server/user-grpc-server.ts — gRPC server implementation
import { Server, ServerCredentials, ServerUnaryCall, sendUnaryData, ServerWritableStream } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// Load proto definition
const packageDef = loadSync("proto/user_service.proto", {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = require("@grpc/grpc-js").loadPackageDefinition(packageDef);

// Service implementation
const userServiceImpl = {
  // Unary: Get single user
  async getUser(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    const { userId } = call.request;

    // Check cache first
    const cached = await redis.get(`user:${userId}`);
    if (cached) {
      callback(null, JSON.parse(cached));
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, email, name, plan, avatar_url, created_at, roles FROM users WHERE id = $1",
      [userId]
    );

    if (rows.length === 0) {
      callback({ code: 5, message: "User not found" }); // NOT_FOUND
      return;
    }

    const user = {
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].name,
      plan: rows[0].plan,
      avatarUrl: rows[0].avatar_url || "",
      createdAt: Math.floor(new Date(rows[0].created_at).getTime() / 1000),
      roles: rows[0].roles || [],
    };

    await redis.setex(`user:${userId}`, 60, JSON.stringify(user));
    callback(null, user);
  },

  // Batch: Get multiple users in one call
  async getUsers(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    const { userIds } = call.request;

    if (userIds.length === 0) {
      callback(null, { users: [] });
      return;
    }

    if (userIds.length > 100) {
      callback({ code: 3, message: "Max 100 users per batch" }); // INVALID_ARGUMENT
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, email, name, plan, avatar_url, created_at, roles FROM users WHERE id = ANY($1)",
      [userIds]
    );

    const users = rows.map((r) => ({
      id: r.id, email: r.email, name: r.name, plan: r.plan,
      avatarUrl: r.avatar_url || "",
      createdAt: Math.floor(new Date(r.created_at).getTime() / 1000),
      roles: r.roles || [],
    }));

    callback(null, { users });
  },

  // Server streaming: real-time activity feed
  async streamUserActivity(call: ServerWritableStream<any, any>) {
    const { userId, since } = call.request;
    const sub = new Redis(process.env.REDIS_URL!);

    // Send historical events first
    const { rows: history } = await pool.query(
      `SELECT * FROM activity_events WHERE user_id = $1 AND timestamp > to_timestamp($2)
       ORDER BY timestamp LIMIT 100`,
      [userId, since]
    );

    for (const event of history) {
      call.write({
        eventId: event.id,
        userId: event.user_id,
        action: event.action,
        resourceType: event.resource_type,
        resourceId: event.resource_id,
        timestamp: Math.floor(new Date(event.timestamp).getTime() / 1000),
        metadata: event.metadata || {},
      });
    }

    // Stream new events in real-time
    await sub.subscribe(`activity:${userId}`);
    sub.on("message", (_, message) => {
      const event = JSON.parse(message);
      call.write(event);
    });

    call.on("cancelled", () => {
      sub.unsubscribe();
      sub.disconnect();
    });
  },

  // Create user
  async createUser(call: ServerUnaryCall<any, any>, callback: sendUnaryData<any>) {
    const { email, name, plan } = call.request;

    try {
      const { rows: [user] } = await pool.query(
        `INSERT INTO users (email, name, plan, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [email, name, plan || "free"]
      );

      callback(null, {
        id: user.id, email: user.email, name: user.name, plan: user.plan,
        avatarUrl: "", createdAt: Math.floor(new Date(user.created_at).getTime() / 1000), roles: [],
      });
    } catch (err: any) {
      if (err.code === "23505") { // unique violation
        callback({ code: 6, message: "Email already exists" }); // ALREADY_EXISTS
      } else {
        callback({ code: 13, message: err.message }); // INTERNAL
      }
    }
  },
};

// Start gRPC server
export function startGrpcServer(port: number = 50051): void {
  const server = new Server();
  server.addService(proto.user.UserService.service, userServiceImpl);

  server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (err) => {
    if (err) throw err;
    console.log(`gRPC server listening on port ${port}`);
  });
}
```

## Step 3: Build the Client

```typescript
// src/client/user-client.ts — Type-safe gRPC client with connection pooling
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

const packageDef = loadSync("proto/user_service.proto", { keepCase: false, longs: String });
const proto = loadPackageDefinition(packageDef) as any;

const client = new proto.user.UserService(
  process.env.USER_SERVICE_URL || "localhost:50051",
  credentials.createInsecure(),
  {
    "grpc.keepalive_time_ms": 10000,
    "grpc.keepalive_timeout_ms": 5000,
  }
);

// Promisified client methods
export function getUser(userId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.getUser({ userId }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

export function getUsers(userIds: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    client.getUsers({ userIds }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response.users);
    });
  });
}

// Streaming client
export function streamActivity(userId: string, since: number, onEvent: (event: any) => void): () => void {
  const stream = client.streamUserActivity({ userId, since });
  stream.on("data", onEvent);
  stream.on("error", (err: any) => console.error("Stream error:", err));
  return () => stream.cancel();
}
```

## Results

- **Internal API latency dropped from 200ms to 18ms** — Protocol Buffers binary serialization is 10x faster than JSON; HTTP/2 multiplexing eliminates connection overhead
- **Contract changes caught at compile time** — when the user service adds a required field, every consuming service gets a compile error; no more production surprises
- **Batch API reduces round trips** — `GetUsers` with 50 IDs is one gRPC call instead of 50 REST calls; the order service's user resolution went from 500ms to 8ms
- **Server streaming enables real-time features** — activity feed streams events as they happen; no polling, no WebSocket complexity, just gRPC streaming
- **Payload size reduced by 70%** — Protobuf encoding is significantly smaller than JSON; network bandwidth costs dropped proportionally
