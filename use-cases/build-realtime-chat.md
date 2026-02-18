---
title: "Build a Real-Time Chat Feature for a Web Application"
slug: build-realtime-chat
description: "Implement a production-ready real-time messaging system with WebSockets, message persistence, and online presence."
skills: [websocket-builder, realtime-database]
category: development
tags: [websocket, chat, real-time, messaging, backend]
---

# Build a Real-Time Chat Feature for a Web Application

## The Problem

Adding real-time chat to an existing application seems straightforward — open a WebSocket, send messages. But production chat requires connection management with automatic reconnection, message ordering guarantees, read receipts, typing indicators, online presence tracking, and message persistence with pagination. Most tutorials cover the happy path. Production needs the other 80%.

## The Solution

Use the **websocket-builder** skill to set up the WebSocket server with room management, connection lifecycle, and event routing, then use **realtime-database** to handle message persistence, efficient retrieval, and sync. The agent builds both the server infrastructure and the data layer.

## Step-by-Step Walkthrough

### 1. Set up the WebSocket server with rooms

```text
I have a Node.js/Express app with PostgreSQL. I need to add real-time chat.
Users can have direct messages and group channels (up to 50 members).
Set up the WebSocket server with room management and authentication.
```

The agent builds the WebSocket layer:

```text
Created ws/server.ts — WebSocket server with authentication handshake
Created ws/rooms.ts — Room manager (join, leave, broadcast, member tracking)
Created ws/handlers/message.ts — Message send/receive handler
Created ws/handlers/presence.ts — Online/offline/typing indicators
Created ws/middleware/auth.ts — Validates JWT from connection query params

Architecture:
  Client connects → JWT validated → user joins their channel rooms
  Messages go: client → server → persist to DB → broadcast to room
  Presence: heartbeat every 30s, timeout after 90s → mark offline
```

### 2. Design the message storage schema

```text
Design the database schema for chat. I need: channels (direct + group),
messages with text and attachments, read receipts per user, and efficient
pagination for loading message history (latest messages first).
```

```text
Created migrations/002_chat_schema.sql:

  channels: id, type (direct|group), name, created_at
  channel_members: channel_id, user_id, role, joined_at, last_read_at
  messages: id, channel_id, sender_id, content, type, reply_to_id,
            created_at, updated_at, deleted_at

  Indexes:
    messages(channel_id, created_at DESC) — history pagination
    channel_members(user_id, channel_id) — user's channels lookup
    messages(channel_id, id) WHERE deleted_at IS NULL — active messages

  Read receipts: Using channel_members.last_read_at instead of per-message
  tracking. Unread count = messages WHERE created_at > last_read_at.
  This scales to millions of messages without a separate receipts table.
```

### 3. Implement message delivery with ordering guarantees

```text
Implement the message sending flow. I need: messages delivered in order,
no duplicates if the client reconnects, and message delivery confirmation
back to the sender. Handle the case where a user is offline — they should
see messages when they reconnect.
```

```text
Created chat/services/message.service.ts — Message create, list, mark-read
Created ws/handlers/message.ts (updated) — Delivery with idempotency

Flow:
  1. Client sends message with a client-generated UUID (idempotency key)
  2. Server checks UUID against recent messages — deduplicates retries
  3. Message saved to PostgreSQL with server-assigned sequential ID
  4. Server broadcasts to all connected room members
  5. Server sends delivery confirmation (ack) back to sender with server ID
  6. Offline members get messages on reconnect via history sync

Reconnection sync:
  Client sends last_message_id on reconnect → server returns all newer
  messages per channel. Client merges with local state by server ID.
```

### 4. Add typing indicators and presence

```text
Add typing indicators and online presence. Typing should show "Alex is typing..."
and disappear after 3 seconds of inactivity. Presence should show who's online
in a channel without hammering the database.
```

```text
Created ws/handlers/typing.ts — Typing indicator with auto-timeout
Created ws/handlers/presence.ts (updated) — Redis-backed presence

Typing:
  Client sends "typing" event → server broadcasts to channel (except sender)
  Auto-expires after 3 seconds. Client re-sends while user keeps typing.
  Debounced: max 1 typing event per 2 seconds per user per channel.

Presence (using Redis):
  SADD online:{channel_id} {user_id} — on connect/join
  SREM online:{channel_id} {user_id} — on disconnect/leave
  SMEMBERS online:{channel_id} — get online users for a channel
  Heartbeat: EXPIRE user:{user_id}:alive 90 — auto-cleanup on crash

  No database writes for presence — purely in-memory via Redis.
  Presence changes broadcast to channel members as events.
```

### 5. Write integration tests

```text
Write tests covering: sending a message and receiving it in another client,
reconnection with message sync, duplicate message prevention, and typing
indicator timeout.
```

```text
Created tests/chat/messaging.test.ts — 12 test cases
Created tests/chat/presence.test.ts — 6 test cases

Key tests:
  ✓ Message sent by user A appears in user B's WebSocket stream
  ✓ Messages arrive in server-assigned order regardless of send timing
  ✓ Duplicate client UUID is rejected, original message returned
  ✓ Reconnecting client receives missed messages since last_message_id
  ✓ Typing indicator expires after 3 seconds of no re-send
  ✓ User marked offline after missing 3 heartbeats
  ✓ Offline user gets unread count on reconnect
```

## Real-World Example

A backend developer is building an internal tool for a small logistics company. Dispatchers need to message drivers in real time. The existing app is a Next.js dashboard with a PostgreSQL database and 200 daily active users.

1. He prompts the agent with his stack and the requirement for direct messages between dispatchers and drivers
2. The agent scaffolds the WebSocket server, chat schema, and message handlers
3. He adds the group channels feature for team-wide broadcasts
4. Presence tracking lets dispatchers see which drivers are currently online
5. The full chat feature ships in three days — dispatchers stop using a separate messaging app
