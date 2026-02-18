---
name: grpc
description: >-
  Build high-performance RPC services with gRPC and Protocol Buffers. Use when a
  user asks to create gRPC services, define protobuf schemas, implement
  streaming RPCs, build microservice communication, set up service-to-service
  calls, implement bidirectional streaming, add interceptors/middleware to gRPC,
  generate client stubs, handle gRPC errors, implement health checks, configure
  load balancing, or build gRPC-Web for browser clients. Covers unary,
  server/client/bidirectional streaming, interceptors, deadlines, metadata,
  reflection, and production patterns.
license: Apache-2.0
compatibility: 'Node.js 18+, Python 3.9+, or Go 1.21+ (grpc, protobuf)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - grpc
    - rpc
    - protobuf
    - microservices
    - streaming
---

# gRPC

## Overview

Build high-performance, strongly-typed RPC services using gRPC and Protocol Buffers. gRPC uses HTTP/2 for transport, protobuf for serialization (10x smaller than JSON, 5-10x faster parsing), and generates client/server code in 12+ languages. Ideal for microservice communication, real-time streaming, and performance-critical APIs.

## Instructions

### Step 1: Install Tools

```bash
# Protocol Buffer Compiler
brew install protobuf           # macOS
apt install -y protobuf-compiler # Ubuntu/Debian

# Node.js
npm install @grpc/grpc-js @grpc/proto-loader

# Python
pip install grpcio grpcio-tools grpcio-reflection grpcio-health-checking

# Go
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

### Step 2: Define Protocol Buffers

```protobuf
// proto/user_service.proto
syntax = "proto3";
package userservice.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";
import "google/protobuf/field_mask.proto";

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  rpc DeleteUser(DeleteUserRequest) returns (google.protobuf.Empty);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc WatchUser(WatchUserRequest) returns (stream UserEvent);        // Server streaming
  rpc BatchCreateUsers(stream CreateUserRequest) returns (BatchCreateUsersResponse); // Client streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);         // Bidirectional
}

message User {
  string id = 1;
  string email = 2;
  string name = 3;
  Role role = 5;
  google.protobuf.Timestamp created_at = 6;
}

enum Role { ROLE_UNSPECIFIED = 0; ROLE_USER = 1; ROLE_ADMIN = 2; }

message GetUserRequest { string id = 1; }
message CreateUserRequest { string email = 1; string name = 2; string password = 3; }
message UpdateUserRequest { string id = 1; string name = 2; google.protobuf.FieldMask update_mask = 4; }
message DeleteUserRequest { string id = 1; }
message ListUsersRequest { int32 page_size = 1; string page_token = 2; string filter = 3; }
message ListUsersResponse { repeated User users = 1; string next_page_token = 2; int32 total_count = 3; }
message WatchUserRequest { string id = 1; }
message UserEvent {
  enum EventType { EVENT_TYPE_UNSPECIFIED = 0; EVENT_TYPE_UPDATED = 1; EVENT_TYPE_DELETED = 2; }
  EventType type = 1; User user = 2; google.protobuf.Timestamp timestamp = 3;
}
message BatchCreateUsersResponse { int32 created_count = 1; repeated string failed_emails = 2; }
message ChatMessage { string sender_id = 1; string text = 2; google.protobuf.Timestamp timestamp = 3; }
```

Protobuf rules: field numbers are forever (never reuse), use `UNSPECIFIED = 0` for enums, `repeated` for lists, `FieldMask` for partial updates, `Timestamp` for dates, version via package name (`userservice.v1`).

### Step 3: Generate Code

```bash
# Python
python -m grpc_tools.protoc -I proto --python_out=gen --grpc_python_out=gen --pyi_out=gen proto/user_service.proto

# Go
protoc -I proto --go_out=gen --go_opt=paths=source_relative --go-grpc_out=gen --go-grpc_opt=paths=source_relative proto/user_service.proto
```

Node.js can load protos dynamically (no codegen needed):
```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const packageDef = protoLoader.loadSync('proto/user_service.proto', {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).userservice.v1;
```

### Step 4: Server Implementation (Node.js)

```javascript
const userService = {
  GetUser(call, callback) {
    const user = users.get(call.request.id);
    if (!user) return callback({ code: grpc.status.NOT_FOUND, message: `User ${call.request.id} not found` });
    callback(null, user);
  },
  CreateUser(call, callback) {
    const { email, name } = call.request;
    const user = { id: crypto.randomUUID(), email, name, role: 'ROLE_USER', created_at: { seconds: Date.now() / 1000 } };
    users.set(user.id, user);
    callback(null, user);
  },
  WatchUser(call) { // Server streaming
    const interval = setInterval(() => {
      const user = users.get(call.request.id);
      if (user) call.write({ type: 'EVENT_TYPE_UPDATED', user, timestamp: { seconds: Date.now() / 1000 } });
    }, 5000);
    call.on('cancelled', () => clearInterval(interval));
  },
  BatchCreateUsers(call, callback) { // Client streaming
    let created = 0; const failed = [];
    call.on('data', (req) => { users.set(crypto.randomUUID(), { email: req.email, name: req.name }); created++; });
    call.on('end', () => callback(null, { created_count: created, failed_emails: failed }));
  },
  Chat(call) { // Bidirectional streaming
    call.on('data', (msg) => call.write({ sender_id: 'server', text: `Received: ${msg.text}` }));
    call.on('end', () => call.end());
  },
};

const server = new grpc.Server();
server.addService(proto.UserService.service, userService);
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {});
```

### Step 5: Client Implementation

```javascript
const client = new proto.UserService('localhost:50051', grpc.credentials.createInsecure());

// Unary with deadline
const deadline = new Date(); deadline.setSeconds(deadline.getSeconds() + 5);
client.GetUser({ id: '123' }, { deadline }, (err, user) => { if (!err) console.log(user); });

// Server streaming
const stream = client.WatchUser({ id: '123' });
stream.on('data', (event) => console.log('Event:', event));

// Client streaming
const batch = client.BatchCreateUsers((err, resp) => console.log(`Created: ${resp.created_count}`));
batch.write({ email: 'alice@test.com', name: 'Alice' });
batch.write({ email: 'bob@test.com', name: 'Bob' });
batch.end();
```

### Step 6: Error Handling

```
gRPC Status Codes:
NOT_FOUND (5)          — Resource missing (like HTTP 404)
INVALID_ARGUMENT (3)   — Bad input (like HTTP 400)
UNAUTHENTICATED (16)   — Not authenticated (like HTTP 401)
PERMISSION_DENIED (7)  — Forbidden (like HTTP 403)
ALREADY_EXISTS (6)     — Duplicate (like HTTP 409)
RESOURCE_EXHAUSTED (8) — Rate limited (like HTTP 429)
DEADLINE_EXCEEDED (4)  — Timeout
UNAVAILABLE (14)       — Service down (like HTTP 503)
INTERNAL (13)          — Server error (like HTTP 500)
```

### Step 7: Testing with grpcurl

```bash
brew install grpcurl
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext -d '{"email": "alice@test.com", "name": "Alice"}' \
  localhost:50051 userservice.v1.UserService/CreateUser
```

## Examples

### Example 1: Build a user microservice with gRPC
**User prompt:** "Create a gRPC user service in Node.js with CRUD operations and server streaming for live user updates."

The agent will:
1. Create `proto/user_service.proto` with `UserService` defining `GetUser`, `CreateUser`, `ListUsers` (unary RPCs) and `WatchUser` (server streaming)
2. Load the proto dynamically using `@grpc/proto-loader`
3. Implement handlers for each RPC method, using proper status codes (`NOT_FOUND`, `ALREADY_EXISTS`)
4. Start the server on port 50051 and verify with `grpcurl -plaintext localhost:50051 list`

### Example 2: Add batch user import with client streaming
**User prompt:** "Add a batch import endpoint to the user service that accepts a stream of user records from a CSV file and returns a summary of created/failed records."

The agent will:
1. Add a `BatchCreateUsers(stream CreateUserRequest) returns (BatchCreateUsersResponse)` RPC to the proto file
2. Implement the server handler with `call.on('data')` to process each streamed request, tracking created count and failed emails
3. Build a client script that reads the CSV, streams each row as a `CreateUserRequest`, and calls `batch.end()` when done
4. Return the `BatchCreateUsersResponse` with `created_count` and `failed_emails` array

## Guidelines

1. **Proto design is your API contract** — review it as carefully as database schemas
2. **Never change field numbers** — add new fields, deprecate old ones with `reserved`
3. **Use `FieldMask` for updates** — distinguishes "not sent" from "set to empty"
4. **Always set deadlines** — unbound calls leak resources; 5-30s for most RPCs
5. **Enable reflection in dev** — makes debugging with grpcurl/grpcui easy
6. **Health checks on every service** — standard gRPC health protocol for load balancers
7. **Interceptors for cross-cutting concerns** — auth, logging, metrics, tracing
8. **Use streaming sparingly** — unary RPCs are simpler to debug and load-balance
9. **Version via package name** — `userservice.v1`, `userservice.v2`
10. **Keep messages small** — gRPC default max is 4MB; large payloads should be chunked
