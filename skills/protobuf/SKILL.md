---
name: protobuf
description: >-
  You are an expert in Protocol Buffers (protobuf), Google's language-neutral
  binary serialization format. You help developers define data schemas with
  `.proto` files, generate typed code for multiple languages, build efficient
  APIs with gRPC, and handle schema evolution with backward/forward
  compatibility — achieving 3-10x smaller payloads and 20-100x faster
  serialization than JSON.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - serialization
    - grpc
    - schema
    - binary
    - cross-language
    - performance
---

# Protocol Buffers — Efficient Binary Serialization

You are an expert in Protocol Buffers (protobuf), Google's language-neutral binary serialization format. You help developers define data schemas with `.proto` files, generate typed code for multiple languages, build efficient APIs with gRPC, and handle schema evolution with backward/forward compatibility — achieving 3-10x smaller payloads and 20-100x faster serialization than JSON.

## Core Capabilities

### Proto Schema Definition

```protobuf
// proto/user.proto
syntax = "proto3";
package myapp.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/field_mask.proto";

option go_package = "github.com/myapp/proto/v1";

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  Role role = 4;
  Address address = 5;
  repeated Post posts = 6;                // Repeated = array
  map<string, string> metadata = 7;       // Map type
  google.protobuf.Timestamp created_at = 8;

  // Oneof — only one field set at a time
  oneof contact {
    string phone = 9;
    string slack_id = 10;
  }

  // Optional (explicit presence tracking)
  optional string bio = 11;
}

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_USER = 1;
  ROLE_ADMIN = 2;
  ROLE_MODERATOR = 3;
}

message Address {
  string street = 1;
  string city = 2;
  string country = 3;
  string zip = 4;
}

message Post {
  string id = 1;
  string title = 2;
  bool published = 3;
}

// Service definition (for gRPC)
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  rpc DeleteUser(DeleteUserRequest) returns (google.protobuf.Empty);
  rpc StreamUsers(StreamUsersRequest) returns (stream User);
}

message GetUserRequest {
  string id = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
  string filter = 3;                     // e.g., "role=ADMIN"
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message CreateUserRequest {
  User user = 1;
}

message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2;  // Partial updates
}
```

### Usage in TypeScript

```typescript
// Generated from proto using protoc or buf
import { UserServiceClient } from "./generated/user_grpc_pb";
import { GetUserRequest, CreateUserRequest, User } from "./generated/user_pb";
import * as grpc from "@grpc/grpc-js";

const client = new UserServiceClient("localhost:50051", grpc.credentials.createInsecure());

// Get user
const req = new GetUserRequest();
req.setId("user-123");

client.getUser(req, (err, response) => {
  if (err) throw err;
  console.log(response.getName());
  console.log(response.getEmail());
  console.log(response.getRole());
});

// Streaming
const stream = client.streamUsers(new StreamUsersRequest());
stream.on("data", (user: User) => console.log(user.getName()));
stream.on("end", () => console.log("Stream ended"));
```

### Schema Evolution Rules

```protobuf
// Adding new fields is safe (backward compatible)
message User {
  string id = 1;
  string name = 2;
  string email = 3;
  // NEW: added in v2 — old clients ignore it, new clients get default ""
  string avatar_url = 12;
}

// NEVER: change field numbers
// NEVER: change field types (int32 → string)
// OK: rename fields (wire format uses numbers, not names)
// OK: add new fields with new numbers
// OK: remove fields (but reserve the number)
// OK: convert singular to repeated (compatible for scalar types)

// Reserve removed field numbers to prevent reuse
message User {
  reserved 4, 7;                          // Don't reuse these numbers
  reserved "old_field_name";              // Documentation
}
```

## Installation

```bash
# protoc compiler
brew install protobuf

# Buf (modern protobuf toolchain — recommended)
brew install bufbuild/buf/buf
buf generate                              # Generate code from proto files

# Language-specific plugins
npm install @grpc/grpc-js @grpc/proto-loader    # Node.js
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest  # Go
pip install grpcio-tools                  # Python
```

## Best Practices

1. **Field numbers are forever** — Never change or reuse field numbers; they're the wire format identity
2. **Reserve removed fields** — Use `reserved` to prevent accidentally reusing deleted field numbers
3. **Use Buf** — Use `buf` CLI instead of raw `protoc`; linting, breaking change detection, BSR registry
4. **Proto3 defaults** — All fields have zero defaults; use `optional` for explicit presence tracking
5. **Enums start at 0** — Always include `UNSPECIFIED = 0` as the first enum value; it's the default
6. **Package versioning** — Use `package myapp.v1;` for API versioning; create `v2` package for breaking changes
7. **FieldMask for updates** — Use `google.protobuf.FieldMask` for partial updates; clients specify which fields to change
8. **Backward compatibility** — New fields with new numbers are always safe; old clients ignore unknown fields
