---
name: websocket-builder
description: >-
  When the user wants to build real-time features using WebSockets. Use when the
  user mentions "WebSocket," "real-time," "live updates," "socket," "ws," "push
  notifications," "live chat," "streaming data," or "bidirectional communication."
  Covers server setup, room management, authentication, reconnection handling,
  and scaling with Redis pub/sub. For data persistence, see realtime-database.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.9+, or Go 1.21+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["websocket", "real-time", "backend", "chat"]
---

# WebSocket Builder

## Overview

Builds production-ready WebSocket servers for real-time features — chat, live dashboards, collaborative editing, notifications. Handles the hard parts: authentication during handshake, room/channel management, connection lifecycle, automatic reconnection, message ordering, and horizontal scaling via Redis pub/sub.

## Instructions

### 1. Server Setup

When setting up a WebSocket server:

- Attach to existing HTTP server (share the port)
- Use a mature library: `ws` for Node.js, `websockets` for Python, `gorilla/websocket` for Go
- Implement ping/pong heartbeats (30s interval, 90s timeout)
- Set max message size to prevent abuse (default: 64KB)
- Add connection limits per user (default: 5 concurrent connections)

### 2. Authentication

Authenticate during the WebSocket handshake, not after:

```
1. Client connects with token in query string: ws://host/ws?token=<jwt>
2. Server validates JWT before upgrading the connection
3. If invalid → reject with 401 before upgrade completes
4. Attach user context to the socket object for later use
```

Do NOT accept auth via a post-connection message — the connection is already open and resources allocated.

### 3. Room/Channel Management

```
RoomManager:
  join(socketId, roomId) — Add socket to room, notify members
  leave(socketId, roomId) — Remove socket, notify members
  broadcast(roomId, event, data, excludeSocketId?) — Send to all in room
  getMembers(roomId) — List connected user IDs
  getUserRooms(socketId) — List rooms for a socket

On connect: auto-join user's channel rooms from database
On disconnect: leave all rooms, broadcast presence update
```

### 4. Event Routing

Use a message format with event types:

```json
{ "event": "message.send", "data": { "channelId": "ch_1", "content": "Hello" }, "id": "client-uuid" }
```

Route events to handlers:

```
eventHandlers = {
  "message.send": handleMessageSend,
  "message.edit": handleMessageEdit,
  "typing.start": handleTypingStart,
  "presence.heartbeat": handleHeartbeat
}
```

Always include a client-generated `id` for idempotency and acknowledgment.

### 5. Scaling with Redis Pub/Sub

For multi-server deployments:

```
1. Each server subscribes to Redis channels matching room IDs
2. On broadcast: publish to Redis channel instead of local-only broadcast
3. Each server receives the publish and forwards to local sockets in that room
4. Use Redis adapter (e.g., @socket.io/redis-adapter or custom with ioredis)
```

### 6. Reconnection Protocol

```
Client-side:
  1. On disconnect: attempt reconnect with exponential backoff (1s, 2s, 4s, max 30s)
  2. On reconnect: send last_event_id to server
  3. Server replays missed events since that ID
  4. Client merges with local state, deduplicating by event ID

Server-side:
  1. Keep recent events in Redis sorted set (TTL: 1 hour)
  2. On reconnect with last_event_id: return all events after that ID
  3. If ID is too old (beyond retention): send full state refresh
```

## Examples

### Example 1: Chat WebSocket Server (Node.js)

**Prompt**: "Set up a WebSocket server for my Express app with rooms and JWT auth"

**Output**: Server with authenticated connections, room manager, event routing, ping/pong heartbeats, and reconnection support. Files: `ws/server.ts`, `ws/rooms.ts`, `ws/handlers/`, `ws/middleware/auth.ts`.

### Example 2: Live Dashboard (Python)

**Prompt**: "I need real-time updates for a monitoring dashboard. FastAPI backend, 500 concurrent viewers."

**Output**: WebSocket endpoint with broadcast-only channels (viewers don't send), Redis pub/sub for horizontal scaling, connection pooling, and automatic cleanup. Files: `realtime/server.py`, `realtime/broadcaster.py`, `realtime/redis_pubsub.py`.

## Guidelines

- **Always authenticate at handshake** — never after connection is open
- **Use binary frames** for large payloads (images, files) — text frames for JSON
- **Implement backpressure** — if a client can't keep up, buffer then disconnect
- **Log connection lifecycle** — connect, disconnect, error, room join/leave (debugging is hard without this)
- **Test with connection drops** — kill connections mid-message to verify recovery
- **Set idle timeouts** — disconnect clients that stop sending heartbeats
- **Never trust client input** — validate every message against expected schema
