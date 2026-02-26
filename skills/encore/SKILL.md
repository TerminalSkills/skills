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
compatibility: "TypeScript or Go. Encore Cloud or self-hosted."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["backend", "encore", "framework", "infrastructure", "type-safe"]
---

# Encore

## Overview

Encore is a backend framework where infrastructure is part of the code — define an API endpoint and Encore provisions the cloud resources automatically. Databases, pub/sub, cron jobs, and caching are declared in your TypeScript/Go code, not in Terraform files. Encore understands your application architecture and generates infrastructure, API documentation, and architecture diagrams from the code. Local development mirrors production exactly.

## When to Use

- Building cloud backends without managing infrastructure manually
- Want type-safe APIs with automatic documentation
- Need databases, pub/sub, and cron without configuring them
- Rapid prototyping that scales to production
- Teams that want to focus on business logic, not DevOps

## Instructions

### Setup

```bash
# Install Encore CLI (macOS/Linux)
brew install encoredev/tap/encore

# Create a new app
encore app create my-app --lang=ts
cd my-app
encore run  # Local dev server with hot reload
```

### Define API Endpoints

```typescript
// backend/user/user.ts — API endpoints are just exported functions
import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// Database declared in code — Encore provisions it automatically
const db = new SQLDatabase("users", {
  migrations: "./migrations",
});

interface User {
  id: number;
  email: string;
  name: string;
}

// POST /user.create — Type-safe request/response
export const create = api(
  { method: "POST", path: "/user", expose: true },
  async (params: { email: string; name: string }): Promise<User> => {
    const row = await db.queryRow`
      INSERT INTO users (email, name)
      VALUES (${params.email}, ${params.name})
      RETURNING id, email, name
    `;
    return row!;
  }
);

// GET /user/:id — Path parameters are typed
export const get = api(
  { method: "GET", path: "/user/:id", expose: true },
  async (params: { id: number }): Promise<User> => {
    const row = await db.queryRow`
      SELECT id, email, name FROM users WHERE id = ${params.id}
    `;
    if (!row) throw new Error("User not found");
    return row;
  }
);

// GET /user — List with query params
export const list = api(
  { method: "GET", path: "/user", expose: true },
  async (params: { limit?: number; offset?: number }): Promise<{ users: User[] }> => {
    const rows = await db.query`
      SELECT id, email, name FROM users
      ORDER BY id DESC
      LIMIT ${params.limit ?? 20} OFFSET ${params.offset ?? 0}
    `;
    return { users: rows };
  }
);
```

### Pub/Sub

```typescript
// backend/notifications/notifications.ts — Event-driven with pub/sub
import { Topic, Subscription } from "encore.dev/pubsub";

// Declare a topic — Encore provisions the message broker
export const userCreated = new Topic<{ userId: number; email: string }>("user-created");

// Publish events
export async function notifyUserCreated(userId: number, email: string) {
  await userCreated.publish({ userId, email });
}

// Subscribe to events
const _ = new Subscription(userCreated, "send-welcome-email", {
  handler: async (event) => {
    await sendEmail(event.email, {
      subject: "Welcome!",
      body: "Thanks for signing up.",
    });
  },
});
```

### Cron Jobs

```typescript
// backend/reports/cron.ts — Scheduled tasks
import { CronJob } from "encore.dev/cron";

// Runs daily at 9 AM UTC — Encore handles scheduling
const dailyReport = new CronJob("daily-report", {
  title: "Generate Daily Report",
  schedule: "0 9 * * *",
  endpoint: generateReport,
});

export const generateReport = api(
  { method: "POST", path: "/reports/daily" },
  async (): Promise<{ generated: boolean }> => {
    const stats = await db.query`SELECT ...`;
    await sendSlackReport(stats);
    return { generated: true };
  }
);
```

### Deploy

```bash
# Deploy to Encore Cloud (auto-provisions all infrastructure)
git push encore main

# Or self-host with Docker
encore build docker my-app:latest
docker run my-app:latest
```

## Examples

### Example 1: Build a SaaS backend

**User prompt:** "Build a backend for a project management tool with users, projects, and real-time updates."

The agent will define Encore services with databases, pub/sub for real-time events, and cron for notifications — all infrastructure auto-provisioned.

### Example 2: Microservices with service-to-service calls

**User prompt:** "Split our monolith into microservices with type-safe internal communication."

The agent will create Encore services that call each other with typed function calls (no HTTP clients to write), with automatic tracing and documentation.

## Guidelines

- **Infrastructure is code** — databases, pub/sub, cron declared in TypeScript
- **`api()` for endpoints** — type-safe request/response with automatic validation
- **`SQLDatabase` for databases** — Encore provisions Postgres automatically
- **`Topic` / `Subscription` for events** — pub/sub without message broker setup
- **`CronJob` for schedules** — declare in code, Encore handles execution
- **`encore run` for local dev** — mirrors production environment exactly
- **Auto-generated docs** — API documentation from your type definitions
- **Architecture diagrams** — Encore understands your service graph
- **Tracing built-in** — distributed tracing across services without config
- **`expose: true` for public APIs** — internal services are private by default
