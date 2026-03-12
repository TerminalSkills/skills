---
name: effect-platform
category: Backend Development
tags: [typescript, functional, error-handling, concurrency, observability, schema]
version: 1.0.0
author: terminal-skills
---

# Effect Platform — Production TypeScript Framework

You are an expert in Effect (Effect-TS), the production-grade TypeScript framework for building reliable, composable applications. You help developers write type-safe code with structured error handling (typed errors in the type signature), dependency injection, concurrency, retries, scheduling, streaming, schema validation, and built-in observability — replacing scattered libraries (zod, retry, pino, awilix) with a single coherent platform.

## Core Capabilities

### Typed Errors and Effects

```typescript
import { Effect, pipe } from "effect";
import { Schema } from "@effect/schema";

// Typed errors — compiler knows exactly what can fail
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  userId: Schema.String,
}) {}

class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String,
}) {}

class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  field: Schema.String,
  reason: Schema.String,
}) {}

// Function signature tells you: returns User, can fail with UserNotFound | DatabaseError
function getUser(id: string): Effect.Effect<User, UserNotFound | DatabaseError> {
  return pipe(
    Effect.tryPromise({
      try: () => db.users.findUnique({ where: { id } }),
      catch: (e) => new DatabaseError({ message: String(e) }),
    }),
    Effect.flatMap((user) =>
      user ? Effect.succeed(user) : Effect.fail(new UserNotFound({ userId: id })),
    ),
  );
}

// Compose effects — errors propagate and accumulate in the type
function getUserProfile(id: string): Effect.Effect<
  UserProfile,
  UserNotFound | DatabaseError | ValidationError  // Compiler tracks all possible errors
> {
  return pipe(
    getUser(id),
    Effect.flatMap((user) => getPreferences(user.id)),
    Effect.map((prefs) => ({ ...user, preferences: prefs })),
  );
}

// Handle errors exhaustively
const program = pipe(
  getUserProfile("user-42"),
  Effect.catchTags({
    UserNotFound: (e) => Effect.succeed({ error: "User not found", userId: e.userId }),
    DatabaseError: (e) => Effect.die(e),   // Unrecoverable — crash
    ValidationError: (e) => Effect.succeed({ error: `Invalid ${e.field}: ${e.reason}` }),
  }),
);

// Run
const result = await Effect.runPromise(program);
```

### Dependency Injection (Layers)

```typescript
import { Effect, Context, Layer } from "effect";

// Define service interfaces
class Database extends Context.Tag("Database")<Database, {
  readonly query: (sql: string) => Effect.Effect<any[], DatabaseError>;
}>() {}

class EmailService extends Context.Tag("EmailService")<EmailService, {
  readonly send: (to: string, subject: string, body: string) => Effect.Effect<void>;
}>() {}

// Use services in your effects
function createUser(data: CreateUserInput) {
  return Effect.gen(function* () {
    const db = yield* Database;
    const email = yield* EmailService;

    const [user] = yield* db.query("INSERT INTO users ...");
    yield* email.send(data.email, "Welcome!", "Thanks for signing up");

    return user;
  });
}

// Provide implementations via Layers
const DatabaseLive = Layer.succeed(Database, {
  query: (sql) => Effect.tryPromise({ try: () => pool.query(sql), catch: (e) => new DatabaseError({ message: String(e) }) }),
});

const EmailLive = Layer.succeed(EmailService, {
  send: (to, subject, body) => Effect.promise(() => resend.emails.send({ to, subject, html: body })),
});

// Compose and run
const AppLayer = Layer.merge(DatabaseLive, EmailLive);
await Effect.runPromise(pipe(createUser(input), Effect.provide(AppLayer)));
```

### Concurrency and Retries

```typescript
import { Effect, Schedule } from "effect";

// Retry with exponential backoff
const reliableCall = pipe(
  callExternalApi(),
  Effect.retry(
    Schedule.exponential("100 millis").pipe(
      Schedule.compose(Schedule.recurs(5)),   // Max 5 retries
      Schedule.jittered,                      // Add randomness
    ),
  ),
);

// Concurrent execution with limits
const results = yield* Effect.forEach(
  userIds,
  (id) => fetchUserData(id),
  { concurrency: 10 },                       // Max 10 concurrent
);

// Race — first to complete wins
const fastest = yield* Effect.race(
  fetchFromPrimary(query),
  fetchFromReplica(query),
);

// Timeout
const withTimeout = pipe(
  longRunningTask(),
  Effect.timeout("5 seconds"),
);
```

## Installation

```bash
npm install effect @effect/schema @effect/platform
```

## Best Practices

1. **Typed errors** — Errors in the type signature; compiler enforces exhaustive handling; no forgotten catch blocks
2. **Effect.gen** — Use generator syntax for readable async-like code; `yield*` instead of `await`
3. **Layers for DI** — Define services with `Context.Tag`; swap implementations for testing without mocks
4. **Schema validation** — Use `@effect/schema` instead of Zod; integrates with Effect error channel
5. **Retry policies** — Use `Schedule` for retry, backoff, jitter; declarative, composable
6. **Concurrency** — Use `Effect.forEach` with `concurrency` option; bounded parallelism built-in
7. **Streaming** — Use `Stream` for processing large datasets; backpressure, transformation, batching
8. **Observability** — Built-in tracing and metrics via OpenTelemetry; no additional instrumentation code
