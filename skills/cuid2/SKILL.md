---
name: cuid2
description: >-
  Generate collision-resistant IDs with CUID2. Use when a user asks to generate
  unique IDs, create URL-safe identifiers, replace UUIDs with something shorter,
  or generate sortable unique keys for databases.
license: Apache-2.0
compatibility: 'Any JavaScript/TypeScript environment'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: utilities
  tags:
    - cuid2
    - id
    - uuid
    - unique
    - database
---

# CUID2

## Overview

CUID2 generates collision-resistant, URL-safe, sortable unique IDs. Shorter than UUIDs (24 chars vs 36), no dashes, and can be sorted chronologically. Used by Prisma, PlanetScale, and many modern stacks as a UUID alternative.

## Instructions

### Step 1: Basic Usage

```typescript
import { createId, isCuid } from '@paralleldrive/cuid2'

const id = createId()          // "clh3am8gj0000h58w1x9c0jxr"
console.log(id.length)         // 24 characters
console.log(isCuid(id))        // true

// Custom length
import { init } from '@paralleldrive/cuid2'
const createShortId = init({ length: 10 })
const shortId = createShortId()  // "cm3xk7p2f0"
```

### Step 2: Database Primary Keys

```typescript
// Prisma schema
// model User {
//   id        String   @id @default(cuid())
//   email     String   @unique
//   createdAt DateTime @default(now())
// }

// Drizzle schema
import { text, sqliteTable } from 'drizzle-orm/sqlite-core'
import { createId } from '@paralleldrive/cuid2'

const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(createId),
  email: text('email').notNull(),
})
```

### Comparison

| Feature | UUID v4 | CUID2 | nanoid |
|---------|---------|-------|--------|
| Length | 36 | 24 | 21 |
| URL-safe | No (dashes) | Yes | Yes |
| Sortable | No | Roughly | No |
| Collision-safe | Yes | Yes | Yes |

## Guidelines

- CUID2 is roughly sortable by creation time — useful for pagination without timestamps.
- Use as primary key instead of auto-increment integers — prevents enumeration attacks.
- For shorter IDs (URLs, invite codes), use nanoid or CUID2 with custom length.
- Prisma natively supports `@default(cuid())` — no extra setup needed.
