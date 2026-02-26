---
name: effect-ts
description: >-
  Build robust TypeScript applications with Effect — type-safe error handling,
  concurrency, dependency injection, and streaming. Use when someone asks to
  "handle errors without try-catch", "type-safe error handling in TypeScript",
  "dependency injection without classes", "concurrent TypeScript", "Effect library",
  "replace try-catch with typed errors", or "functional programming in TypeScript".
  Covers Effect, Layer, Schedule, Stream, and Schema.
license: Apache-2.0
compatibility: "Node.js 18+ or Bun. TypeScript 5.0+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["typescript", "error-handling", "fp", "concurrency", "dependency-injection"]
---

# Effect-TS

## Overview

Effect is a TypeScript library that makes errors, dependencies, and async operations explicit in the type system. Instead of `try-catch` with `unknown` errors, every function declares exactly what can go wrong. Instead of global imports, every dependency is tracked in the type. The result: code that's easier to test, refactor, and reason about.

## When to Use

- Business logic where knowing every possible error matters (payments, auth, data pipelines)
- Applications with complex dependency graphs that need testability
- Concurrent operations that need structured concurrency (not just Promise.all)
- Data validation and transformation pipelines
- Replacing error-prone try-catch chains with typed error handling

## Instructions

### Core Concept: Effect<Success, Error, Requirements>

Every Effect value has three type parameters:
- **Success**: what it returns when it works
- **Error**: what errors it can produce
- **Requirements**: what services/dependencies it needs

```typescript
// core.ts — Effect basics: typed errors and pipe
import { Effect, pipe } from "effect";

// Define typed errors (not just Error/string)
class UserNotFound {
  readonly _tag = "UserNotFound";
  constructor(readonly userId: string) {}
}

class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly cause: unknown) {}
}

// Function that can fail with typed errors
//           Success ───┐  Error ──────────────────────────┐  Requirements ─┐
//                      ▼                                   ▼                ▼
const getUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError, never> =>
  pipe(
    Effect.tryPromise({
      try: () => db.user.findUnique({ where: { id } }),
      catch: (e) => new DatabaseError(e),
    }),
    Effect.flatMap((user) =>
      user ? Effect.succeed(user) : Effect.fail(new UserNotFound(id))
    )
  );

// Handle specific errors
const getUserOrDefault = (id: string) =>
  pipe(
    getUser(id),
    Effect.catchTag("UserNotFound", () =>
      Effect.succeed({ id: "default", name: "Guest", email: "guest@example.com" })
    )
    // DatabaseError is NOT caught — it propagates up in the type
  );
```

### Dependency Injection with Layers

```typescript
// services.ts — Dependency injection without classes
import { Effect, Context, Layer } from "effect";

// Define a service interface
class UserRepo extends Context.Tag("UserRepo")<
  UserRepo,
  {
    findById: (id: string) => Effect.Effect<User | null, DatabaseError>;
    create: (data: NewUser) => Effect.Effect<User, DatabaseError>;
  }
>() {}

// Business logic that REQUIRES UserRepo (tracked in type)
const getUser = (id: string) =>
  pipe(
    UserRepo,                    // Access the service
    Effect.flatMap((repo) => repo.findById(id)),
    Effect.flatMap((user) =>
      user ? Effect.succeed(user) : Effect.fail(new UserNotFound(id))
    )
  );
//   ^? Effect<User, UserNotFound | DatabaseError, UserRepo>
//                                                  ^^^^^^^^ dependency tracked!

// Production implementation
const UserRepoLive = Layer.succeed(UserRepo, {
  findById: (id) =>
    Effect.tryPromise({
      try: () => prisma.user.findUnique({ where: { id } }),
      catch: (e) => new DatabaseError(e),
    }),
  create: (data) =>
    Effect.tryPromise({
      try: () => prisma.user.create({ data }),
      catch: (e) => new DatabaseError(e),
    }),
});

// Test implementation
const UserRepoTest = Layer.succeed(UserRepo, {
  findById: (id) => Effect.succeed({ id, name: "Test", email: "test@test.com" }),
  create: (data) => Effect.succeed({ id: "new-id", ...data }),
});

// Run with real dependencies
Effect.runPromise(
  pipe(getUser("123"), Effect.provide(UserRepoLive))
);

// Run with test dependencies
Effect.runPromise(
  pipe(getUser("123"), Effect.provide(UserRepoTest))
);
```

### Concurrency and Scheduling

```typescript
// concurrent.ts — Structured concurrency with Effect
import { Effect, Schedule, Duration } from "effect";

// Run tasks concurrently with a limit
const processItems = (items: string[]) =>
  Effect.forEach(items, (item) => processItem(item), {
    concurrency: 5,    // Max 5 concurrent
    batching: true,     // Batch database calls
  });

// Retry with exponential backoff
const resilientFetch = (url: string) =>
  pipe(
    Effect.tryPromise(() => fetch(url).then((r) => r.json())),
    Effect.retry(
      Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.compose(Schedule.recurs(3)),  // Max 3 retries
        Schedule.jittered,                      // Add random jitter
      )
    ),
  );

// Timeout
const withTimeout = pipe(
  slowOperation(),
  Effect.timeout(Duration.seconds(5)),
);

// Race — first to complete wins
const fastest = Effect.race(
  fetchFromPrimary(),
  fetchFromFallback(),
);
```

### Schema — Runtime Validation + Type Inference

```typescript
// schema.ts — Validation with Effect Schema (replaces Zod)
import { Schema } from "effect";

const User = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(100)),
  email: Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+\.[^@]+$/)),
  age: Schema.Number.pipe(Schema.int(), Schema.between(13, 120)),
  role: Schema.Literal("user", "admin"),
  createdAt: Schema.Date,
});

// Type is inferred — no duplicate definition
type User = Schema.Schema.Type<typeof User>;

// Decode (parse + validate)
const parseUser = Schema.decodeUnknown(User);
const result = Effect.runSync(parseUser({ id: "...", name: "Kai", email: "kai@example.com", age: 25, role: "user", createdAt: new Date() }));
```

## Examples

### Example 1: Build a payment processing pipeline

**User prompt:** "Build a payment flow with typed errors for each failure case — card declined, insufficient funds, fraud detected, network timeout."

The agent will define tagged error types for each failure, compose the payment pipeline with Effect.pipe, add retry for network errors, and propagate card/fraud errors to the caller with full type information.

### Example 2: Testable service with dependency injection

**User prompt:** "I want to test my business logic without hitting the database."

The agent will define services as Effect Context.Tags, write business logic that depends on service interfaces, create Layer.succeed implementations for both production and test, and run the same logic against fake data in tests.

## Guidelines

- **Start with `Effect.tryPromise`** — wrap existing async code first, then gradually adopt more Effect patterns
- **Tag your errors** — `readonly _tag = "ErrorName"` enables `catchTag` for precise error handling
- **Layers for DI** — define service interfaces with Context.Tag, implement with Layer
- **`pipe` everything** — Effect uses pipe-based composition; avoid nesting
- **Don't `runPromise` inside Effects** — compose Effects together, run once at the entry point
- **Schema over Zod** — Effect Schema integrates with the Effect ecosystem and is more composable
- **Concurrency is explicit** — `{ concurrency: 5 }` not hidden behind promise pools
- **Learning curve is real** — Effect is powerful but complex; introduce gradually to a team
- **Effect is a runtime** — it manages execution; don't mix with raw Promises inside Effects
