---
name: turso
description: >-
  Assists with building applications using Turso, an edge SQLite database built on libSQL.
  Use when setting up embedded replicas for zero-latency reads, implementing multi-tenant
  database-per-user architecture, or integrating with Drizzle ORM. Trigger words: turso,
  libsql, edge sqlite, embedded replica, database-per-tenant, turso cli.
license: Apache-2.0
compatibility: "Works with any JavaScript/TypeScript runtime via @libsql/client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["turso", "sqlite", "edge-database", "libsql", "embedded-replica"]
---

# Turso

## Overview

Turso is an edge SQLite database built on libSQL (a fork of SQLite) that replicates data to 30+ edge locations worldwide. It features embedded replicas for sub-millisecond reads, a multi-database architecture for SaaS multi-tenancy, and compatibility with Drizzle ORM and Prisma via driver adapters.

## Instructions

- When connecting to Turso, use `createClient({ url, authToken })` for cloud access, or `createClient({ url: "file:local.db", syncUrl, authToken })` for embedded replicas with local reads.
- When setting up embedded replicas, configure `syncInterval` based on staleness tolerance (60s for dashboards, 5s for collaborative apps) and call `client.sync()` after important writes for immediate consistency.
- When executing queries, use `execute()` for single statements with parameterized queries, `batch()` for multiple related writes in a single transaction and network round-trip, and `transaction()` for interactive transactions.
- When building multi-tenant SaaS, use database-per-tenant architecture with database groups for shared schema, and the Platform API for programmatic database creation and deletion.
- When integrating with ORMs, use `drizzle-orm/libsql` adapter for Drizzle or `@prisma/adapter-libsql` for Prisma, and reserve raw SQL for complex analytics queries.
- When managing databases, use the `turso` CLI for creating databases, adding replicas to regions, generating auth tokens, and running interactive SQL shells.
- When using vector search, leverage Turso's built-in vector similarity search without needing external extensions.

## Examples

### Example 1: Set up embedded replicas for a read-heavy app

**User request:** "Configure Turso with local embedded replicas for my analytics dashboard"

**Actions:**
1. Create a Turso database with `turso db create` and add replicas in target regions
2. Configure `@libsql/client` with `file:local.db` and `syncUrl` pointing to Turso cloud
3. Set `syncInterval` to 60 seconds for dashboard-appropriate freshness
4. Implement read queries against local replica and writes against the primary

**Output:** An analytics dashboard with sub-millisecond reads from the local SQLite replica.

### Example 2: Build multi-tenant SaaS with database-per-user

**User request:** "Set up isolated databases for each customer in my SaaS app"

**Actions:**
1. Create a database group with shared schema using `turso group create`
2. Implement tenant provisioning that creates a database per customer via the Platform API
3. Configure placement groups to co-locate databases near their users
4. Apply schema migrations to all databases in the group simultaneously

**Output:** An isolated multi-tenant architecture with per-customer databases sharing a common schema.

## Guidelines

- Use embedded replicas for read-heavy applications; local reads are 100x faster than network queries.
- Call `client.sync()` after important writes when using embedded replicas to see changes immediately.
- Use `batch()` for multiple related writes; they execute in a single transaction and network round-trip.
- Prefer database-per-tenant over row-level isolation for SaaS for simpler queries and easier data deletion.
- Set `syncInterval` based on staleness tolerance: 60s for dashboards, 5s for collaborative apps.
- Use Drizzle ORM with the libSQL adapter for type-safe queries; raw SQL only for complex analytics.
- Keep databases small; SQLite scales better with many small databases than one large one.
