---
name: realtime-database
description: >-
  When the user needs to design database schemas and queries optimized for
  real-time applications. Use when the user mentions "chat database," "message
  storage," "real-time sync," "message history," "unread count," "cursor
  pagination," "event sourcing," or "live data." Handles schema design for
  messaging, activity feeds, notifications, and collaborative apps with
  efficient pagination and sync. For WebSocket transport, see websocket-builder.
license: Apache-2.0
compatibility: "PostgreSQL 13+ (examples use PostgreSQL syntax; tested on PostgreSQL 18)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["database", "real-time", "messaging", "schema-design"]
---

# Real-Time Database

## Overview

Designs database schemas and query patterns optimized for real-time applications — chat, activity feeds, notifications, collaborative editing. Focuses on efficient message storage, cursor-based pagination, unread tracking, and sync protocols that minimize data transfer on reconnection.

## Instructions

### 1. Schema Design for Messaging

Core tables for a chat system:

```sql
-- Channels (direct messages + groups)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
  name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Channel membership with read tracking
CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels(id),
  user_id UUID NOT NULL,
  role VARCHAR(20) DEFAULT 'member',
  last_read_message_id BIGINT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

-- Messages with sequential IDs for ordering
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  reply_to_id BIGINT REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_channel_cursor
  ON messages(channel_id, id DESC) WHERE deleted_at IS NULL;
```

Use BIGSERIAL for message IDs — sequential, sortable, perfect for cursor pagination. The DDL above is PostgreSQL; MySQL and MongoDB need their own equivalents (`AUTO_INCREMENT`, ObjectId ordering). Check the index with `EXPLAIN` on the history query: it should show an index scan on `idx_messages_channel_cursor`.

### 2. Cursor-Based Pagination

Never use OFFSET for message history. The database still reads and discards every skipped row, so deep pages get slower, and rows shift as new messages arrive. A keyset (cursor) query seeks straight to the index position, so its cost depends on the page size, not on how far back you go.

```sql
-- Load 50 messages before a cursor (scrolling up)
SELECT id, sender_id, content, created_at
FROM messages
WHERE channel_id = $1 AND id < $2 AND deleted_at IS NULL
ORDER BY id DESC
LIMIT 50;

-- Load messages after a cursor (sync on reconnect); cap the batch
SELECT id, sender_id, content, created_at
FROM messages
WHERE channel_id = $1 AND id > $2 AND deleted_at IS NULL
ORDER BY id ASC
LIMIT 200;
```

Return cursor metadata: `{ messages: [...], nextCursor: 12345, hasMore: true }`

### 3. Unread Count Tracking

Use the `last_read_message_id` approach — one integer per user per channel:

```sql
-- Get unread count for a user across all channels
SELECT cm.channel_id, COUNT(m.id) AS unread_count
FROM channel_members cm
JOIN messages m ON m.channel_id = cm.channel_id
  AND m.id > COALESCE(cm.last_read_message_id, 0)
  AND m.deleted_at IS NULL
  AND m.sender_id != $1
WHERE cm.user_id = $1
GROUP BY cm.channel_id
HAVING COUNT(m.id) > 0;

-- Mark channel as read
UPDATE channel_members
SET last_read_message_id = $2
WHERE channel_id = $1 AND user_id = $3;
```

The count scans every unread row, so its cost grows with the backlog. For channels with large backlogs, show "99+" and stop counting, or keep a counter column updated on insert.

### 4. Reconnection Sync

When a client reconnects, minimize data transfer:

```
1. Client sends: { lastMessageIds: { "ch_1": 500, "ch_2": 300 } }
2. Server queries: new messages per channel since those IDs
3. If gap > 200 messages: send summary + latest 50 (client should full-reload)
4. Return: { channels: { "ch_1": { messages: [...], hasMore: false } } }
```

### 5. Soft Deletes and Edits

Messages should use soft deletes to maintain thread integrity:

- `deleted_at` timestamp — filter in queries, show "message deleted" in UI
- `updated_at` timestamp — mark edited messages
- Keep `reply_to_id` references valid even after parent is soft-deleted

## Examples

### Example 1: Chat Schema for SaaS App

**Prompt**: "Design the database for chat in my project management tool. Direct messages and project channels."

**Output**: Complete migration with channels, members, messages tables; cursor pagination queries; unread count query; and index strategy. The history page is an index-only scan on `(channel_id, id DESC)`, so its cost tracks the page size rather than the table size. Measure with `EXPLAIN ANALYZE` on your own data before promising a latency.

### Example 2: Activity Feed Schema

**Prompt**: "I need an activity feed — user actions like 'Alex commented on Task-42'. Need fan-out for team feeds."

**Output**: Events table with actor/verb/object pattern, fan-out-on-write to per-user feed tables, cursor pagination, and a cleanup job for feeds older than 90 days.

## Guidelines

- **Use sequential IDs** (BIGSERIAL) for cursor pagination — random UUIDv4 values do not sort by creation time. UUIDv7 does, and PostgreSQL 18 has `uuidv7()`
- **Sequence IDs are not commit-ordered** — a value is taken at INSERT, not at COMMIT, and gaps can appear when transactions abort (see the PostgreSQL sequence docs). A reconnect sync using `id > last_id` can therefore skip a message that commits late. Re-read a small overlap (e.g. the last 50 ids) and de-duplicate by id on the client
- **Never use OFFSET** — keyset pagination seeks into the index; OFFSET reads and discards every skipped row
- **Track reads per-channel, not per-message** — one integer vs. millions of rows
- **Index for your access patterns** — (channel_id, id DESC) covers 90% of chat queries
- **Soft delete messages** — hard deletes break reply chains and confuse users
- **Partition large tables** by channel_id or time range if exceeding 100M rows
- **Cache hot channels** in Redis — recent messages and member lists
