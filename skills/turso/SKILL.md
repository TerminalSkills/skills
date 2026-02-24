---
name: turso
description: >-
  Use Turso for edge SQLite databases. Use when a user asks to set up an edge
  database, use SQLite in production, replicate databases globally, or choose
  a serverless database for low-latency reads.
license: Apache-2.0
compatibility: 'Node.js, Bun, Deno, Python, Go, Rust'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - turso
    - sqlite
    - edge
    - serverless
    - libsql
---

# Turso

## Overview

Turso is a managed SQLite database built on libSQL (an open-source fork of SQLite). It replicates your database to edge locations worldwide for sub-10ms reads. Free tier includes 9GB storage and 500 databases — ideal for per-tenant databases in multi-tenant SaaS.

## Instructions

### Step 1: Setup

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup

# Create database
turso db create my-app
turso db show my-app --url     # get the connection URL
turso db tokens create my-app   # get auth token
```

### Step 2: Connect from Node.js

```typescript
// db/client.ts — Turso + Drizzle ORM
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,       // libsql://my-app-user.turso.io
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

export const db = drizzle(turso)
```

### Step 3: Per-Tenant Databases

```typescript
// lib/tenant-db.ts — One database per customer (multi-tenant)
import { createClient } from '@libsql/client'

const tenantClients = new Map()

export function getTenantDb(tenantId: string) {
  if (!tenantClients.has(tenantId)) {
    const client = createClient({
      url: `libsql://${tenantId}-myapp.turso.io`,
      authToken: process.env.TURSO_GROUP_TOKEN!,
    })
    tenantClients.set(tenantId, drizzle(client))
  }
  return tenantClients.get(tenantId)
}

// Usage
const db = getTenantDb('acme-corp')
const users = await db.select().from(schema.users)
```

### Step 4: Embedded Replicas

```typescript
// db/client.ts — Local replica for zero-latency reads
import { createClient } from '@libsql/client'

const client = createClient({
  url: 'file:local-replica.db',                    // local SQLite file
  syncUrl: process.env.TURSO_DATABASE_URL!,        // remote Turso DB
  authToken: process.env.TURSO_AUTH_TOKEN!,
  syncInterval: 60,                                 // sync every 60 seconds
})

// Reads hit local file (< 1ms), writes go to remote
```

## Guidelines

- Free tier: 9GB storage, 500 databases, 25M row reads/month — very generous for SaaS.
- Use per-tenant databases for data isolation (GDPR, compliance, per-customer performance).
- Embedded replicas give local SQLite performance with remote sync — great for edge deployments.
- Works with Drizzle ORM natively via the libSQL dialect.
