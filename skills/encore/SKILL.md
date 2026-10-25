---
name: encore
description: >-
  Build cloud backend applications with Encore — type-safe backend framework
  with built-in infrastructure. Use when someone asks to "build a backend",
  "Encore", "type-safe API framework", "backend with built-in infra",
  "auto-provision cloud resources", or "backend framework with databases
  built-in". Covers API definition, databases, pub/sub, cron, and
  auto-provisioned infrastructure.
license: Apache-2.0
compatibility: "Encore CLI, Node.js (Encore.ts) or Go (Encore.go), Docker running for local databases. Deploys to Encore Cloud, your own AWS/GCP account, or self-hosted Docker."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/encoredev/encore
  tags: "backend, encore, framework, infrastructure, type-safe"
---

# Encore

## Overview

Encore is an open-source backend framework (TypeScript via the `encore.dev` npm package, or Go) where infrastructure is declared in application code. You write `api()` endpoints, `new SQLDatabase(...)`, `new Topic(...)` and `new CronJob(...)`; the Encore CLI compiles the app, runs the resources locally (Postgres in Docker, an in-process broker), and Encore Cloud provisions the real ones in AWS or GCP. It also generates API docs, a service catalog, a client library and distributed traces from the same source. This skill covers Encore.ts (`encore.dev` 1.58.x).

## When to Use

- Building a typed REST backend where databases, pub/sub and cron should not need Terraform
- Splitting a monolith into services that call each other as plain functions
- Self-hosting a compiled backend as a Docker image

## Instructions

### Setup

```bash
brew install encoredev/tap/encore      # macOS and Linux with Homebrew
encore version
encore app create orders-api --lang=ts # asks to sign in to Encore Cloud unless --platform=false
cd orders-api
encore run                             # local server + dashboard (needs Docker for databases)
```

On Windows or Linux without Homebrew, the docs provide an installer script; download it, read it, then run it rather than piping it into a shell. `encore app create --example=ts/url-shortener` starts from a working example instead of an empty app.

A service is a directory containing an `encore.service.ts` file with `import { Service } from "encore.dev/service"; export default new Service("user");`; put it next to the endpoints below. The local dashboard (printed by `encore run`, `http://localhost:9400`) shows requests, traces and the architecture diagram.

### Define API endpoints

```typescript
// user/user.ts — service "user"
import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("users", { migrations: "./migrations" });

interface User { id: number; email: string; name: string }

export const create = api(
  { method: "POST", path: "/user", expose: true },
  async (params: { email: string; name: string }): Promise<User> => {
    const row = await db.queryRow<User>`
      INSERT INTO users (email, name) VALUES (${params.email}, ${params.name})
      RETURNING id, email, name`;
    return row!;
  },
);

export const get = api(
  { method: "GET", path: "/user/:id", expose: true },
  async ({ id }: { id: number }): Promise<User> => {
    const row = await db.queryRow<User>`SELECT id, email, name FROM users WHERE id = ${id}`;
    if (!row) throw APIError.notFound("user not found");   // returns HTTP 404
    return row;
  },
);

export const list = api(
  { method: "GET", path: "/user", expose: true },
  async (p: { limit?: number; offset?: number }): Promise<{ users: User[] }> => {
    const users = await db.queryAll<User>`
      SELECT id, email, name FROM users ORDER BY id DESC
      LIMIT ${p.limit ?? 20} OFFSET ${p.offset ?? 0}`;
    return { users };
  },
);
```

```sql
-- user/migrations/1_create_users.up.sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
```

Rules worth knowing:

- Endpoints are private unless `expose: true`; private ones can only be called by other services and cron jobs. `auth: true` requires an auth handler.
- For GET, HEAD and DELETE the parameters come from the query string; for other methods from the JSON body unless the field is typed `Query<number>`, `Header<"X-Request-Id">` and so on.
- Migrations are `<number>_<name>.up.sql` files that run in order; there are no automatic down migrations.
- `db.query` returns an async iterator (`for await (const row of rows)`); use `queryAll` for an array and `exec` for statements without rows.
- Add a new database or topic while `encore run` is running and you must restart it.

### Call another service

```typescript
// orders/orders.ts
import { api } from "encore.dev/api";
import { user } from "~encore/clients";      // generated typed client, no HTTP code

export const summary = api(
  { method: "GET", path: "/orders/:userId/summary", expose: true },
  async ({ userId }: { userId: number }): Promise<{ owner: string }> => {
    const u = await user.get({ id: userId });
    return { owner: u.name };
  },
);
```

### Pub/Sub

```typescript
// notifications/events.ts
import { Topic, Subscription } from "encore.dev/pubsub";

export interface UserCreated { userId: number; email: string }

export const userCreated = new Topic<UserCreated>("user-created", {
  deliveryGuarantee: "at-least-once",       // required; or "exactly-once"
});

new Subscription(userCreated, "send-welcome-email", {
  handler: async (event) => {
    await mailer.sendWelcome(event.email);  // must be idempotent: delivery can repeat
  },
});
```

Publish with `await userCreated.publish({ userId: 42, email: "maria@northwind.io" })`. A handler that throws is retried, then the event goes to a dead-letter queue.

### Cron jobs

```typescript
// reports/cron.ts
import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";

export const generateReport = api({}, async (): Promise<void> => {
  // build and send the daily report; must be idempotent and take no parameters
});

new CronJob("daily-report", {
  title: "Generate daily report",
  schedule: "0 9 * * *",                    // cron expression (UTC); or every: "6h"
  endpoint: generateReport,
});
```

`every` must divide 24 hours evenly (`10m`, `6h`, not `7h`). Cron jobs do not run in `encore run` or preview environments, so call the endpoint by hand to test. On the free Encore Cloud tier a job runs at most once an hour at a random minute.

### Test, deploy, self-host

```bash
encore test                                   # runs your test runner with Encore's test setup
git push encore                               # build and deploy to Encore Cloud (staging)
encore build docker --config=infra.json orders-api:1.0.0
docker run -e PORT=8080 -p 127.0.0.1:8080:8080 orders-api:1.0.0
```

`encore app create` adds a git remote named `encore`. A self-hosted image needs an infrastructure config file (`--config`) whenever the app uses databases, pub/sub, caches or secrets; the image does not run migrations and does not trigger cron jobs, so apply migrations yourself and call the cron endpoints from your own scheduler.

## Examples

### Example 1: Build a SaaS backend

**User prompt:** "Build a backend for a project management tool with users, projects and email notifications when a project is created."

Create services `user` and `project`, each with its own `SQLDatabase` and migrations. `project.create` calls `user.get` through `~encore/clients` to check the owner, inserts the row, then publishes `ProjectCreated` to a topic. A `notifications` service subscribes and sends the email. Result: `encore run` starts everything, the dashboard at `http://localhost:9400` shows one trace spanning `project.create`, `user.get` and the database queries, and `curl -X POST localhost:4000/project -d '{"ownerId":7,"name":"Q4 launch"}'` returns the created project.

### Example 2: Split a monolith into services

**User prompt:** "Split our Express monolith into billing and accounts services with type-safe internal calls."

Move each area into its own directory with its own `api()` endpoints, make internal ones private (no `expose`), and replace HTTP clients with `import { accounts } from "~encore/clients"`. Result: renaming a field in `accounts.get` becomes a compile error in `billing`, and the Flow diagram in the dashboard shows the dependency between the two services.

## Guidelines

- Declare databases, topics and cron jobs at the top level of a module; the compiler reads them statically and rejects them inside functions.
- Keep subscription handlers and cron endpoints idempotent; both can run more than once.
- Throw `APIError` (`APIError.notFound`, `APIError.invalidArgument`) instead of `Error`, otherwise clients get a 500.
- Keep secrets out of code: define them with `secret("StripeKey")` from `encore.dev/config` and set them with `encore secret set`.
- Docker must be running for local databases; port 4000 is the app, 9400 the dashboard.
- Encore Cloud is optional: you can deploy to your own AWS/GCP account or build a Docker image, but then provisioning, migrations and cron scheduling become yours.
- Not a fit when you need a framework you already depend on (NestJS, Express middleware) to own the HTTP layer; Encore owns the request lifecycle.
