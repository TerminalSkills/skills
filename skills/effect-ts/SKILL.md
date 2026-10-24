---
name: effect-ts
description: >-
  Effect is a TypeScript library for typed errors, dependency injection,
  structured concurrency, retries, streams and schema validation. Use when
  someone asks to "handle errors without try-catch", "type-safe error handling
  in TypeScript", "dependency injection without classes", "retry with
  backoff", "concurrent TypeScript", "Effect library" or "replace Promise
  chains with typed effects". Targets Effect 4.x and notes the changes from
  3.x.
license: Apache-2.0
compatibility: "Node.js 18+ or Bun; TypeScript 5.9+ with strict mode enabled; effect 4.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["typescript", "error-handling", "fp", "concurrency", "dependency-injection"]
  repository: https://github.com/Effect-TS/effect
---

# Effect-TS

## Overview

Effect makes failures and dependencies part of a function's type. An `Effect<A, E, R>` produces `A`, may fail with `E`, and needs services `R`. The current line is Effect 4.x (npm `latest` is 4.0.6; 3.22.x is tagged `prev`). Version 4 merged many packages into `effect` (`@effect/platform`, `@effect/rpc` and others), all ecosystem packages share one version, and some APIs were renamed. Code from older tutorials (`Context.Tag`, `Effect.catchAll`, `Schema.minLength`) does not compile on 4.x. Migration guide: https://github.com/Effect-TS/effect/blob/main/MIGRATION.md

Requirements: `strict: true` in `tsconfig.json`, TypeScript 5.9 or newer.

```bash
npm install effect
```

## Instructions

### Typed errors with `Effect.gen`

Define errors with `Data.TaggedError`; the `_tag` is added for you and `catchTag` narrows on it. Inside a generator, `yield*` unwraps an effect and `return yield* new MyError(...)` fails with it.

```typescript
// users.ts
import { Data, Effect } from "effect"

class UserNotFound extends Data.TaggedError("UserNotFound")<{ readonly userId: string }> {}
class DatabaseError extends Data.TaggedError("DatabaseError")<{ readonly cause: unknown }> {}

interface User { readonly id: string; readonly name: string; readonly email: string }
declare const db: { user: { findUnique(a: { where: { id: string } }): Promise<User | null> } }

export const getUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* Effect.tryPromise({
      try: () => db.user.findUnique({ where: { id } }),
      catch: (cause) => new DatabaseError({ cause }),
    })
    if (user === null) return yield* new UserNotFound({ userId: id })
    return user
  })
// Effect<User, DatabaseError | UserNotFound, never>

export const getUserOrGuest = (id: string) =>
  getUser(id).pipe(
    Effect.catchTag("UserNotFound", () =>
      Effect.succeed({ id: "guest", name: "Guest", email: "guest@northwind.dev" })),
  ) // DatabaseError stays in the error type
```

Renamed in 4.x: `Effect.catchAll` is now `Effect.catch`, `catchAllCause` is `catchCause`, `catchSome` is `catchFilter`. `catchTag` and `catchTags` are unchanged.

### Services and layers

In 4.x all of `Context.Tag`, `Context.GenericTag`, `Effect.Tag` and `Effect.Service` are replaced by `Context.Service`. The type parameters come first and the identifier goes in the second call. Static accessor proxies are gone: `yield*` the service (preferred) or use `Service.use((s) => ...)`.

```typescript
// services.ts
import { Context, Data, Effect, Layer } from "effect"

class DatabaseError extends Data.TaggedError("DatabaseError")<{ readonly cause: unknown }> {}
class UserNotFound extends Data.TaggedError("UserNotFound")<{ readonly userId: string }> {}
interface User { readonly id: string; readonly name: string; readonly email: string }
declare const prisma: { user: { findUnique(a: { where: { id: string } }): Promise<User | null> } }

export class UserRepo extends Context.Service<UserRepo, {
  findById(id: string): Effect.Effect<User | null, DatabaseError>
}>()("app/UserRepo") {
  static readonly layer = Layer.succeed(UserRepo, {
    findById: (id: string) =>
      Effect.tryPromise({
        try: () => prisma.user.findUnique({ where: { id } }),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  })
}

// Effect.fn names the function for traces and keeps generator ergonomics
export const getUser = Effect.fn("getUser")(function* (id: string) {
  const repo = yield* UserRepo
  const user = yield* repo.findById(id)
  if (user === null) return yield* new UserNotFound({ userId: id })
  return user
}) // (id: string) => Effect<User, DatabaseError | UserNotFound, UserRepo>

// Entry point: provide the real layer and run once
Effect.runPromise(getUser("u_1042").pipe(Effect.provide(UserRepo.layer)))

// Test: same logic, fake layer
const FakeRepo = Layer.succeed(UserRepo, {
  findById: (id: string) => Effect.succeed({ id, name: "Test User", email: "test@northwind.dev" }),
})
Effect.runPromise(getUser("u_1").pipe(Effect.provide(FakeRepo)))
```

Use `Layer.effect(Service, effectBuildingTheImplementation)` when building the service needs other services or resources.

### Concurrency, retry, timeout

```typescript
// resilience.ts
import { Duration, Effect, Schedule } from "effect"

// At most 5 at once; results keep input order
export const processAll = (ids: string[]) =>
  Effect.forEach(ids, (id) => processOne(id), { concurrency: 5 })

export const fetchJson = (url: string) =>
  Effect.tryPromise(() => fetch(url).then((r) => r.json() as Promise<unknown>)).pipe(
    Effect.retry({
      schedule: Schedule.exponential(Duration.seconds(1)).pipe(Schedule.jittered),
      times: 3,
    }),
    Effect.timeout(Duration.seconds(5)),
  )

// First success wins, the loser is interrupted
export const fastest = Effect.race(fetchJson("https://api-a.northwind.dev/rates"), fetchJson("https://api-b.northwind.dev/rates"))
declare const processOne: (id: string) => Effect.Effect<void>
```

### Schema

`Schema` lives in `effect`. In 4.x, constraints are added with `.check(...)` and filters are named `is*`; `Schema.Literals([...])` takes an array.

```typescript
// schema.ts
import { Schema } from "effect"

const NewUser = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(100)),
  email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+\.[^@]+$/)),
  age: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 13, maximum: 120 })),
  role: Schema.Literals(["user", "admin"]),
})
type NewUser = typeof NewUser.Type

const user = Schema.decodeUnknownSync(NewUser)({ name: "Kai", email: "kai@northwind.dev", age: 25, role: "user" })
const asEffect = Schema.decodeUnknownEffect(NewUser) // unknown -> Effect<NewUser, SchemaError>
```

### Streams

```typescript
import { Effect, Stream } from "effect"

const doubled = await Effect.runPromise(
  Stream.fromIterable([1, 2, 3, 4]).pipe(Stream.map((n) => n * 2), Stream.filter((n) => n > 2), Stream.runCollect),
) // [4, 6, 8]
```

## Examples

### Example 1: "Payment flow with typed errors for decline, fraud and timeout"

Define `CardDeclined`, `InsufficientFunds`, `FraudSuspected` as `Data.TaggedError` classes and a `PaymentGateway` service with `Context.Service`. The charge function returns `Effect<Receipt, CardDeclined | InsufficientFunds | FraudSuspected | GatewayError, PaymentGateway>`. Retry only `GatewayError` (network) with `Effect.retry({ while: (e) => e._tag === "GatewayError", schedule, times: 3 })`, and let the other errors reach the HTTP handler, where `Effect.catchTags({ CardDeclined: ..., InsufficientFunds: ... })` maps each to a response. The compiler reports any case you forget.

### Example 2: "Test my business logic without the database"

Write the logic against `UserRepo` as in the services section, then in the test provide `Layer.succeed(UserRepo, {...})` with in-memory data. No mocking library is needed, and the production layer is only provided in `main.ts`.

## Guidelines

- Install exactly one Effect line: `effect` and every `@effect/*` package (platform-node, sql-pg, vitest, opentelemetry) must have the same 4.x version. Pin `effect@3` and read the 3.x docs for an existing 3.x codebase.
- Run effects once, at the program edge (`Effect.runPromise`, or `runMain` from the platform package for your runtime). Never call `runPromise` inside an effect.
- Wrap Promise code with `Effect.tryPromise` and give `catch` a tagged error; do not leave `unknown` errors in the type.
- Modules that the docs mark `@stability unstable` (for example `effect/http`, `effect/rpc`, `effect/sql`) may change in minor releases; the import path has no `unstable` segment in 4.x.
- Concurrency is opt-in: `Effect.forEach` runs sequentially unless you pass `{ concurrency }`.
- Effect has a real learning curve; adopt it by module (one service or one pipeline) rather than rewriting an app.
