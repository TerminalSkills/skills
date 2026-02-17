---
title: "Migrate a REST API to GraphQL Without Breaking Clients"
slug: migrate-rest-api-to-graphql
description: "Incrementally replace an over-fetching REST API with a GraphQL layer, solving N+1 queries, reducing payload sizes, and unifying multiple endpoints into a single schema."
skills: [graphql, api-tester, cache-strategy]
category: development
tags: [graphql, rest, api, migration, apollo, dataloader, performance]
---

# Migrate a REST API to GraphQL Without Breaking Clients

## The Problem

Marta is a backend lead at a 20-person SaaS startup building a project management tool. Their REST API started clean — 8 endpoints, simple CRUD. Two years later it's 47 endpoints, and the mobile team is frustrated.

Loading the project dashboard requires 6 API calls: `/projects/:id`, `/projects/:id/members`, `/projects/:id/tasks?status=active`, `/users/:id` for each member's avatar, `/notifications/unread`, and `/activity/recent`. The response payloads return 40+ fields per object when the mobile app needs 5. On a 3G connection in Southeast Asia (30% of their user base), the dashboard takes 11 seconds to load.

The web team built a `/dashboard` BFF endpoint to aggregate data, but now there are two sources of truth. When a field changes in `/projects`, someone forgets to update `/dashboard`. The Android, iOS, and web teams each maintain their own BFF endpoints — 12 aggregation endpoints total, each subtly different.

API versioning made it worse. V1 and V2 run in parallel. Some clients use V1 for tasks and V2 for projects. A single schema change requires updating 4 codebases. Last quarter, a breaking change in V2 took down the iOS app for 6 hours because nobody tested that specific combination.

Weekly engineering time spent on API coordination: 15 hours across 3 teams. Mobile payload sizes average 340KB per screen. Time-to-first-paint on the dashboard: 11 seconds mobile, 3.2 seconds desktop.

## The Solution

Add a GraphQL layer on top of existing REST services. Clients migrate incrementally — old endpoints stay live while GraphQL handles new features and gradually replaces old calls.

### Prompt for Your AI Agent

```
I need to migrate our REST API to GraphQL incrementally. Here's our current setup:

**Current REST API:**
- Express.js backend, PostgreSQL with Prisma ORM
- 47 endpoints across /projects, /tasks, /users, /notifications, /activity
- Auth: JWT Bearer tokens
- Two API versions (v1, v2) running in parallel
- 12 BFF aggregation endpoints for mobile/web

**The data model (Prisma schema):**
- Project: id, name, description, status, ownerId, createdAt, updatedAt
- Task: id, title, description, status, priority, projectId, assigneeId, dueDate, createdAt
- User: id, email, name, avatar, role, createdAt
- Comment: id, text, taskId, authorId, createdAt
- Activity: id, type, entityType, entityId, userId, metadata, createdAt
- Notification: id, type, message, userId, read, createdAt

**Requirements:**
1. GraphQL runs alongside REST — no big bang migration
2. Both use the same Prisma client and database
3. Mobile dashboard should load in a single query instead of 6 calls
4. Payload size must drop from 340KB to under 50KB for dashboard
5. Subscriptions for real-time task updates and notifications
6. Auth identical to REST (same JWT, same middleware)
7. DataLoader for all relationship fields (we have N+1 everywhere in REST too)
8. Cursor-based pagination for tasks and activity feeds
9. Type generation for the React web client and React Native mobile
10. Query depth limit (max 7) and complexity limit (max 1000) for security

**Migration strategy:**
- Phase 1: Add /graphql endpoint alongside /api/v1 and /api/v2
- Phase 2: Mobile apps switch to GraphQL for dashboard + task views
- Phase 3: Web app migrates page by page
- Phase 4: Deprecate BFF endpoints and v1
- Phase 5: Full GraphQL, REST kept only for webhooks and third-party integrations

Build the GraphQL schema, resolvers with DataLoader, subscriptions for tasks and notifications, and the Apollo Client setup for React. Include query depth limiting and response caching.
```

### What Your Agent Will Do

1. **Read the `graphql` skill** for schema design, resolvers, DataLoader, subscriptions, and security patterns
2. **Design the schema** — map Prisma models to GraphQL types with proper nullability, input types, and connections
3. **Set up Apollo Server** alongside Express — same app, `/graphql` route added next to `/api`
4. **Implement DataLoaders** — batch user lookups, task-by-project, comments-by-task to eliminate N+1
5. **Build resolvers** — Query (projects, tasks, feed), Mutation (create/update/delete), Subscription (taskUpdated, notificationReceived)
6. **Add auth middleware** — reuse existing JWT verification in GraphQL context
7. **Implement cursor pagination** — for tasks and activity feeds using Relay connection spec
8. **Set up subscriptions** — WebSocket server with Redis PubSub for multi-instance support
9. **Configure security** — depth limit (7), query complexity (1000), persisted queries for production
10. **Generate TypeScript types** — codegen config for server resolvers + client operations
11. **Build Apollo Client config** — cache policies, split links for HTTP/WebSocket, optimistic updates
12. **Write the dashboard query** — single query replacing 6 REST calls, selecting only needed fields

### Expected Outcome

- **Dashboard load**: Single GraphQL query instead of 6 REST calls
- **Payload size**: 47KB (down from 340KB) — 86% reduction
- **Time-to-first-paint**: 2.8s mobile (down from 11s), 0.9s desktop (down from 3.2s)
- **N+1 eliminated**: DataLoader batches relationship queries — 3 DB queries instead of 47 for a typical dashboard load
- **Real-time**: Task status changes and notifications push to clients via subscriptions
- **Type safety**: Full TypeScript types generated from schema — zero runtime type errors in 3 months
- **API coordination time**: 4 hours/week (down from 15) — one schema replaces 12 BFF endpoints
- **Zero downtime migration**: REST and GraphQL run side by side; clients migrate at their own pace
