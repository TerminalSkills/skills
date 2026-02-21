---
title: "Build a Type-Safe API with Deno and Drizzle ORM"
slug: build-api-with-deno-and-drizzle
description: "Create a production API using Deno's secure runtime and Drizzle ORM for type-safe database queries with zero code generation."
skills:
  - deno
  - drizzle-orm
category: development
tags:
  - deno
  - drizzle
  - typescript
  - api
  - database
---

# Build a Type-Safe API with Deno and Drizzle ORM

## The Problem

Setting up a new Node.js API project means configuring TypeScript, ESLint, Prettier, a test runner, a bundler, and managing node_modules. The tsconfig alone has 30 options to get wrong. Your ORM options are either Prisma with its code generation step that breaks in CI, or TypeORM with decorators that lose type safety at runtime. You want a modern TypeScript API where the database schema is defined in plain TypeScript, queries are fully typed end-to-end, and the runtime has sane security defaults without bolting on 15 dev dependencies.

## The Solution

Use the **deno** skill to set up the runtime with built-in TypeScript, testing, and permissions-based security, then use **drizzle-orm** to define the database schema in TypeScript and write SQL-like queries that are fully type-checked at compile time with no code generation step.

## Step-by-Step Walkthrough

### 1. Set up the Deno project with Oak server

Scaffold a Deno HTTP server with routing, middleware, and permission flags.

> Create a Deno API project using Oak for routing. Set up a project structure with routes, middleware, and database modules. Configure deno.json with tasks for dev, test, and build. Lock down permissions so the process can only access the network and the database file.

Deno runs with `--allow-net --allow-read=./data` so even if a dependency is compromised, it cannot access the filesystem or environment variables beyond what is explicitly permitted.

### 2. Define the database schema with Drizzle

Write the schema in plain TypeScript -- no decorators, no codegen, no schema.prisma files.

> Define a Drizzle schema for a project management API with tables for users, projects, tasks, and comments. Use PostgreSQL with proper foreign keys, indexes on frequently queried columns, and created_at/updated_at timestamps. Generate the initial migration from the schema.

The schema definition is a regular TypeScript file. Changing a column type is a one-line edit that immediately shows type errors everywhere the old type was used.

### 3. Build type-safe CRUD endpoints

Every query is fully typed from database row to API response.

> Create CRUD endpoints for tasks: list tasks with filtering by project and status, create a task with validation, update task status, and soft-delete. Use Drizzle's query builder so the return types flow from the schema definition. Add pagination with cursor-based navigation.

### 4. Add testing with Deno's built-in test runner

No Jest, no Vitest, no test configuration files.

> Write integration tests for the task endpoints using Deno's built-in test runner. Set up a test database that resets between tests. Test the happy path, validation errors, and permission checks. Run with deno test --allow-net --allow-read.

## Real-World Example

A two-person startup building a project management tool was spending more time fighting TypeScript configuration and Prisma's code generation than writing features. Prisma Client generation added 8 seconds to every CI build, and schema changes required running `prisma generate` locally before the editor would recognize new fields. They switched to Deno with Drizzle ORM and eliminated the codegen step entirely. Schema changes showed type errors instantly in the editor. The Deno permission system caught a malicious dependency in a transitive package that tried to read environment variables -- the process crashed with a permission error instead of leaking their database credentials.
