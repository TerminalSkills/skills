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
  version: "1.1.0"
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
- Implement heartbeats: ping every 30 s and terminate any socket that has not answered the previous ping (the pattern in the `ws` README). Browsers answer pings automatically
- Set `maxPayload` explicitly. `ws` defaults to 100 MiB (104857600 bytes), not 64 KB: `new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })`
- Add connection limits per user (default: 5 concurrent connections)

### 2. Authentication

Authenticate during the WebSocket handshake, not after. The browser `WebSocket` API cannot set an `Authorization` header, so use one of these:

- **Cookie**: the session cookie is sent automatically on the upgrade request. Use this for same-site apps.
- **Short-lived token**: the app gets a JWT that expires in about 60 seconds from an authenticated endpoint and connects with `wss://host/ws?token=...`. Query strings end up in proxy and access logs, so never put a long-lived token there.

The server validates before it upgrades. `ws` documents `verifyClient` as discouraged, so do the check in the `upgrade` handler, as the `ws` README's client-authentication example does:

```javascript
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

const publicKey = process.env.JWT_PUBLIC_KEY; // PEM, from the secret store
const server = createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

wss.on('connection', (ws, req, user) => {
  ws.on('error', console.error);
  ws.on('message', (data) => {
    // Parse the JSON envelope and route by `event` (see Event Routing below)
  });
});

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {}); // ignore resets before the upgrade completes
  let user;
  try {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token') ?? '';
    user = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'app' });
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
});

server.listen(8080);
```

A client that sends no token gets `401` and the socket is closed before any frame is exchanged. Do NOT accept auth via a post-connection message — the connection is already open and resources allocated.

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
4. With Socket.IO, use `@socket.io/redis-adapter`. It works only with Socket.IO. With raw `ws`, subscribe with ioredis directly, using a dedicated subscriber connection: a connection in subscribe mode cannot run other commands
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

- **Always authenticate at handshake** — never after connection is open, and never with a long-lived token in the URL
- **Pin the JWT algorithm** — pass `algorithms` to `jwt.verify` so a token cannot pick its own algorithm
- **Use binary frames** for large payloads (images, files) — text frames for JSON
- **Implement backpressure** — if a client can't keep up, buffer then disconnect
- **Log connection lifecycle** — connect, disconnect, error, room join/leave (debugging is hard without this)
- **Test with connection drops** — kill connections mid-message to verify recovery
- **Set idle timeouts** — disconnect clients that stop sending heartbeats
- **Never trust client input** — validate every message against expected schema
