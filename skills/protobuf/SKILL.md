---
name: protobuf
description: >-
  Define data schemas with Protocol Buffers (protobuf), Google's language-neutral
  binary serialization format, and generate typed code for TypeScript, Go,
  Python and other languages. Use when the user asks about ".proto files",
  "protobuf schema", "gRPC service definition", "buf generate", "protoc",
  "binary serialization", or how to change a schema without breaking existing
  clients (field numbers, reserved fields, backward compatibility).
license: Apache-2.0
compatibility: "protoc 33+ or the buf CLI 1.x; runtimes for C++, Java, Python, Go, Node.js/TypeScript, C#, Rust, Ruby, PHP, Kotlin, Dart."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["protobuf", "grpc", "serialization", "schema", "buf"]
  repository: "https://github.com/protocolbuffers/protobuf"
---

# Protocol Buffers — Efficient Binary Serialization

## Overview

Protocol Buffers describe data in `.proto` files; a compiler generates classes for your language, and messages are encoded in a compact binary format identified by field numbers, not names. Payloads are usually much smaller than JSON and parsing is faster, and the schema is a checked contract between services. The same files define gRPC services. Current releases at the time of writing: protoc/protobuf v36.2 (September 2026), buf 1.73, `@bufbuild/protobuf` and `protoc-gen-es` 2.16. Schemas start with `syntax = "proto3";` (still fully supported) or the newer `edition = "2023";` / `"2024"`, which replaces `syntax` and makes behaviours such as field presence a per-file or per-field feature.

## Instructions

### 1. Install the tools

```bash
# Compiler (check the version: package managers can be old)
sudo apt install -y protobuf-compiler     # Debian/Ubuntu
brew install protobuf                     # macOS
winget install protobuf                   # Windows
protoc --version                          # should be 33 or newer

# buf: linting, breaking-change detection, code generation
brew install bufbuild/buf/buf             # or: npm install --save-dev @bufbuild/buf
```

Binary releases of `protoc` (zip files per OS) are on the GitHub releases page of protocolbuffers/protobuf.

### 2. Write the schema

Use one directory per package, e.g. `proto/myapp/v1/user.proto`. Every RPC gets its own request and response message (buf's `STANDARD` lint rules require it).

```protobuf
syntax = "proto3";

package myapp.v1;

import "google/protobuf/field_mask.proto";
import "google/protobuf/timestamp.proto";

option go_package = "github.com/northwind/api/gen/myapp/v1;myappv1";

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_USER = 1;
  ROLE_ADMIN = 2;
}

message User {
  reserved 4, 7;                       // numbers of deleted fields
  reserved "old_field_name";
  string id = 1;
  string name = 2;
  string email = 3;
  Role role = 5;
  repeated string tags = 6;
  map<string, string> metadata = 8;
  google.protobuf.Timestamp created_at = 9;
  oneof contact {                      // at most one is set
    string phone = 10;
    string slack_id = 11;
  }
  optional string bio = 12;            // has explicit presence: unset differs from ""
}

message GetUserRequest { string id = 1; }
message GetUserResponse { User user = 1; }
message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2;   // which fields to change
}
message UpdateUserResponse { User user = 1; }

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc UpdateUser(UpdateUserRequest) returns (UpdateUserResponse);
}
```

Return `google.protobuf.Empty` only if you accept lint warnings: it needs `import "google/protobuf/empty.proto";`, and buf recommends a dedicated empty response message.

In an edition file the first line is `edition = "2023";`, `optional` and `required` are not used (fields have explicit presence by default; write `features.field_presence = IMPLICIT` to get proto3 behaviour), and everything else above looks the same.

### 3. Generate code with buf

`buf.yaml` (module and rules) and `buf.gen.yaml` (plugins) live next to the `proto` directory:

```yaml
# buf.yaml
version: v2
modules:
  - path: proto
lint:
  use: [STANDARD]
breaking:
  use: [FILE]
```

```yaml
# buf.gen.yaml — TypeScript with protobuf-es; the plugin comes from npm
version: v2
plugins:
  - local: node_modules/.bin/protoc-gen-es
    out: src/gen
    opt: target=ts
```

```bash
npm install @bufbuild/protobuf
npm install --save-dev @bufbuild/protoc-gen-es @bufbuild/buf
npx buf lint
npx buf generate        # writes src/gen/myapp/v1/user_pb.ts
```

With plain `protoc`: `protoc -Iproto --python_out=gen --go_out=gen --go_opt=paths=source_relative proto/myapp/v1/user.proto` (Go also needs `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`, and `protoc-gen-go-grpc` for services).

### 4. Use the generated code (TypeScript)

protobuf-es v2 generates plain types plus a schema object per message; there are no getters and setters.

```typescript
import { create, toBinary, fromBinary, toJsonString } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { UserSchema, Role } from "./gen/myapp/v1/user_pb";

const user = create(UserSchema, {
  id: "usr_8421",
  name: "Maria Santos",
  email: "maria@northwind.dev",
  role: Role.ADMIN,
  createdAt: timestampFromDate(new Date("2026-03-01T10:00:00Z")),
  contact: { case: "slackId", value: "U02ABC" },    // oneof is a { case, value } object
});

const bytes = toBinary(UserSchema, user);            // Uint8Array
const same = fromBinary(UserSchema, bytes);
console.log(toJsonString(UserSchema, same));         // canonical protobuf JSON
```

For RPC from TypeScript use Connect (`@connectrpc/connect`, `@connectrpc/connect-node`, v2) with `protoc-gen-es` v2, which also speaks gRPC and gRPC-Web. Go, Java and Python use `grpc` or Connect libraries with their own plugins.

### 5. Evolve the schema safely

- Safe: add a field with a new number; rename a field (the wire format uses numbers; JSON names change though); delete a field and `reserved` its number and name.
- Unsafe: change a field number or reuse a deleted one; change a type to an incompatible one (`int32` to `string`); move a field into or out of an existing `oneof`.
- Let the tool check: `buf breaking --against '.git#branch=main'` (or against a saved image: `buf build -o before.binpb`, then `buf breaking --against before.binpb`). It reports, for example, `Field "3" with name "email" on message "User" changed type from "string" to "int32"`.

## Examples

### Example 1: Add a field to a deployed message without breaking clients

**User request:** "We need an avatar URL on User, and the old mobile app versions are still in use."

Add `string avatar_url = 13;` to `User` (next free number, never reuse 4 or 7), then:

```bash
npx buf lint && npx buf build -o /tmp/after.binpb
npx buf breaking --against '.git#branch=main'
npx buf generate
```

Result: `buf breaking` prints nothing (the change is compatible); old apps ignore the new field, and new servers see `""` when an old client does not send it.

### Example 2: Replace a hand-written JSON API contract with a shared schema

**User request:** "Our Go backend and Next.js frontend keep drifting on the order payload. Use protobuf."

Create `proto/shop/v1/order.proto` with `Order`, `OrderItem` and an `OrderService`, add `go` and `es` plugins to `buf.gen.yaml` (`remote` BSR plugins or `local` binaries), run `npx buf generate`, and commit the generated code or generate in CI. The Go server implements the generated handler interface and the frontend calls it through a Connect client created with `createClient(OrderService, transport)`. Result: a field change in `order.proto` fails compilation on both sides until each is updated, and `buf breaking` in CI blocks incompatible changes.

## Guidelines

- Field numbers are permanent identity: never change or reuse them; `reserved` removed numbers and names. Numbers 1-15 take one byte, so give them to frequent fields.
- The first enum value must be the zero value and should be `NAME_UNSPECIFIED = 0`; prefix values with the enum name (`ROLE_ADMIN`) because enum values share the package namespace.
- proto3 scalars without `optional` cannot tell "unset" from the default (0, "", false). Use `optional` (or a wrapper or `FieldMask`) when absence matters.
- Version the package (`myapp.v1`); make breaking changes in `v2` alongside `v1`.
- Do not parse untrusted protobuf as JSON or binary without size limits, and never treat a successfully parsed message as validated: add validation rules (for example protovalidate).
- Do not use `float` for money; use an integer amount in minor units plus a currency code.
- Do not hand-edit generated files and keep the generator versions pinned in `package.json` or `buf.gen.yaml`, because runtime and generated code must match.
- Protobuf is not human-readable and is poorly suited to browsers calling arbitrary APIs without a Connect or gRPC-Web layer; plain JSON is fine for small public APIs.
