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
compatibility: "PostgreSQL 14+, MySQL 8+, or MongoDB 6+"
metadata:
  author: terminal-skills
  version: "1.0.0"
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

Use BIGSERIAL for message IDs — sequential, sortable, perfect for cursor pagination.

### 2. Cursor-Based Pagination

Never use OFFSET for message history — it's O(n) and results shift as new messages arrive.

```sql
-- Load 50 messages before a cursor (scrolling up)
SELECT id, sender_id, content, created_at
FROM messages
WHERE channel_id = $1 AND id < $2 AND deleted_at IS NULL
ORDER BY id DESC
LIMIT 50;

-- Load messages after a cursor (sync on reconnect)
SELECT id, sender_id, content, created_at
FROM messages
WHERE channel_id = $1 AND id > $2 AND deleted_at IS NULL
ORDER BY id ASC;
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

**Output**: Complete migration with channels, members, messages tables; cursor pagination queries; unread count query; and index strategy. Estimated performance: sub-10ms for message history with 10M+ messages.

### Example 2: Activity Feed Schema

**Prompt**: "I need an activity feed — user actions like 'Alex commented on Task-42'. Need fan-out for team feeds."

**Output**: Events table with actor/verb/object pattern, fan-out-on-write to per-user feed tables, cursor pagination, and a cleanup job for feeds older than 90 days.

## Guidelines

- **Use sequential IDs** (BIGSERIAL) for cursor pagination — UUIDs can't be sorted by creation order
- **Never use OFFSET** — cursor pagination is O(1), OFFSET is O(n)
- **Track reads per-channel, not per-message** — one integer vs. millions of rows
- **Index for your access patterns** — (channel_id, id DESC) covers 90% of chat queries
- **Soft delete messages** — hard deletes break reply chains and confuse users
- **Partition large tables** by channel_id or time range if exceeding 100M rows
- **Cache hot channels** in Redis — recent messages and member lists
