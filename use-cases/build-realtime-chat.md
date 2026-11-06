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

Adding real-time chat to an existing application seems straightforward -- open a WebSocket, send messages. Tutorials make it look like a weekend project. But production chat is the other 80%: connection management with automatic reconnection, message ordering guarantees when two people type at the same time, deduplication when a flaky connection retries a send, read receipts, typing indicators, online presence tracking, and message persistence with efficient pagination for channels with 50,000 messages.

Most teams either ship a fragile implementation that drops messages during reconnection, or they spend weeks building infrastructure that a dedicated messaging product already handles. The middle ground -- a solid, production-grade chat system that fits into an existing app -- is surprisingly hard to find examples of.

## The Solution

Use the **websocket-builder** skill to set up the WebSocket server with room management, connection lifecycle, and event routing, then use **realtime-database** to design message persistence, keyset pagination, unread counts, and reconnect sync.

## Step-by-Step Walkthrough

### Step 1: Set Up the WebSocket Server with Rooms

```text
I have a Node.js/Express app with PostgreSQL. I need to add real-time chat.
Users can have direct messages and group channels (up to 50 members).
Set up the WebSocket server with room management and authentication.
```

The WebSocket layer authenticates during the handshake, manages rooms, and routes messages. The browser `WebSocket` API cannot set an `Authorization` header, so the app fetches a JWT that expires in about 60 seconds from an authenticated endpoint and connects with `wss://host/ws?token=...` (a long-lived token in the URL would end up in proxy logs). The server checks the token and the `Origin` header before upgrading, so there are no anonymous connections:

```typescript
// ws/server.ts — WebSocket server with auth handshake
import { createServer, IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';

export interface ChatSocket extends WebSocket { userId: string; isAlive: boolean }

const publicKey = process.env.JWT_PUBLIC_KEY!;                 // PEM, from the secret store
const allowedOrigins = new Set([process.env.APP_ORIGIN!]);     // e.g. https://app.example.com
const server = createServer(/* your Express app */);
// ws defaults maxPayload to 100 MiB — set a chat-sized limit
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

// rooms: channelId -> sockets connected to this server
export const rooms = new Map<string, Set<ChatSocket>>();

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});  // ignore resets before the upgrade completes
  let userId: string;
  try {
    if (!allowedOrigins.has(req.headers.origin ?? '')) throw new Error('origin');
    const token = new URL(req.url!, 'http://localhost').searchParams.get('token') ?? '';
    // Pin the algorithm so a token cannot choose its own
    userId = (jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: 'app' }) as jwt.JwtPayload).sub!;
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, userId));
});

wss.on('connection', async (raw: WebSocket, _req: IncomingMessage, userId: string) => {
  const ws = raw as ChatSocket;
  ws.userId = userId;
  ws.isAlive = true;
  // Register every listener before the first await: events fired while awaiting would be lost
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', console.error);
  ws.on('close', () => rooms.forEach((members) => members.delete(ws)));
  ws.on('message', (data) => routeEvent(ws, data.toString()));  // see Step 3

  // Auto-join every channel the user belongs to (a snapshot: reconnect after membership changes)
  const channelIds = await getUserChannelIds(userId);
  if (ws.readyState !== ws.OPEN) return;  // closed while we were loading
  for (const channelId of channelIds) {
    if (!rooms.has(channelId)) rooms.set(channelId, new Set());
    rooms.get(channelId)!.add(ws);
  }
});

// Heartbeat: ping every 30s, terminate sockets that missed the previous ping
setInterval(() => {
  for (const ws of wss.clients as Set<ChatSocket>) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

server.listen(8080, '127.0.0.1');  // put TLS termination (wss://) in front
```

Messages flow: client sends to server, server persists to the database, server broadcasts to the room. Persistence happens before the broadcast, so if the server crashes in between, reconnecting clients catch up via history sync and no message is lost. With more than one server process, publish broadcasts through Redis pub/sub (one dedicated subscriber connection per server) so every server can forward them to its local sockets.

### Step 2: Design the Message Storage Schema

```text
Design the database schema for chat. I need: channels (direct + group),
messages with text and attachments, read receipts per user, and efficient
pagination for loading message history (latest messages first).
```

The schema avoids a common trap: per-message read receipts. Tracking "user X read message Y" for every message in every channel creates a table that grows quadratically. Instead, each channel membership stores a `last_read_message_id`, and unread count becomes a simple query over messages with a larger id. Message ids are `BIGSERIAL`: sequential, sortable, and ideal for keyset (cursor) pagination, unlike random UUIDv4 values.

```sql
-- migrations/002_chat_schema.sql

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_message_id BIGINT,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL,              -- client-generated idempotency key
  content TEXT NOT NULL,
  reply_to_id BIGINT REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE (sender_id, client_id)         -- makes retries safe, even under a race
);

-- History pagination: newest messages first, active messages only
CREATE INDEX idx_messages_history ON messages (channel_id, id DESC)
  WHERE deleted_at IS NULL;

-- User's channels lookup
CREATE INDEX idx_member_channels ON channel_members (user_id, channel_id);
```

History is a keyset query, never `OFFSET` (which reads and discards every skipped row):

```sql
-- 50 messages before a cursor (scrolling up)
SELECT id, sender_id, content, created_at FROM messages
WHERE channel_id = $1 AND id < $2 AND deleted_at IS NULL
ORDER BY id DESC LIMIT 50;

-- Unread count for one channel (cap it in the UI at "99+" for big backlogs)
SELECT count(*) FROM messages m
JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
WHERE m.channel_id = $1 AND m.id > COALESCE(cm.last_read_message_id, 0)
  AND m.sender_id <> $2 AND m.deleted_at IS NULL;
```

### Step 3: Implement Message Delivery with Ordering Guarantees

```text
Implement the message sending flow. I need: messages delivered in order,
no duplicates if the client reconnects, and message delivery confirmation
back to the sender. Handle the case where a user is offline — they should
see messages when they reconnect.
```

The tricky part is not sending messages but handling retries without duplicates. Every message carries a client-generated UUID, and the `UNIQUE (sender_id, client_id)` constraint is the deduplication: the insert and the membership check happen in one statement, so two retries racing each other cannot both insert, and a user cannot post into a channel they are not a member of:

```typescript
// ws/handlers/message.ts — delivery with idempotency
import { pool } from '../db';
import { ChatSocket, rooms } from '../server';

export function routeEvent(ws: ChatSocket, raw: string) {
  let msg: { event?: string; id?: string; data?: any };
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.event === 'message.send') {
    handleMessage(ws, msg.data).catch((err) => {
      console.error(err);
      ws.send(JSON.stringify({ event: 'error', clientId: msg.data?.clientId }));
    });
  }
}

async function handleMessage(ws: ChatSocket, p: { clientId: string; channelId: string; content: string }) {
  if (typeof p?.content !== 'string' || p.content.length === 0 || p.content.length > 4000) return;  // validate input

  const inserted = await pool.query(
    `INSERT INTO messages (channel_id, sender_id, client_id, content)
     SELECT $1, $2, $3, $4
     WHERE EXISTS (SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2)
     ON CONFLICT (sender_id, client_id) DO NOTHING
     RETURNING id, channel_id, sender_id, content, created_at`,
    [p.channelId, ws.userId, p.clientId, p.content],
  );

  if (inserted.rowCount === 0) {
    // Either a retry of a message we already stored, or the sender is not a member
    const prior = await pool.query(
      'SELECT id FROM messages WHERE sender_id = $1 AND client_id = $2', [ws.userId, p.clientId]);
    if (prior.rowCount === 0) { ws.send(JSON.stringify({ event: 'error', clientId: p.clientId, reason: 'forbidden' })); return; }
    ws.send(JSON.stringify({ event: 'ack', clientId: p.clientId, serverId: prior.rows[0].id }));
    return;
  }

  const message = inserted.rows[0];
  for (const peer of rooms.get(p.channelId) ?? []) {
    if (peer !== ws && peer.readyState === peer.OPEN) peer.send(JSON.stringify({ event: 'message', data: message }));
  }
  ws.send(JSON.stringify({ event: 'ack', clientId: p.clientId, serverId: message.id }));
}
```

Reconnection sync is equally important. When a client reconnects it sends the highest message id it has seen per channel, and the server returns newer messages (`WHERE channel_id = $1 AND id > $2 ORDER BY id LIMIT 200`). A sequence value is taken at INSERT, not at COMMIT, so a message can commit after a later one and be skipped by a plain `id > last_id`. Re-read a small overlap (the last 50 ids) and de-duplicate by server id on the client. The client treats the server id as the source of truth, so there are no duplicates and no gaps.

### Step 4: Add Typing Indicators and Presence

```text
Add typing indicators and online presence. Typing should show "Alex is typing..."
and disappear after 3 seconds of inactivity. Presence should show who's online
in a channel without hammering the database.
```

Typing indicators and presence are ephemeral state, so they should not touch PostgreSQL. Redis suits both.

**Typing**: the client sends a `typing.start` event, the server broadcasts it to the channel (excluding the sender), and the client hides the indicator 3 seconds after the last event. A debounce on the client prevents flooding: at most one typing event per 2 seconds per channel.

**Presence** uses one key per user with a TTL, because Redis set members cannot expire individually:

```text
SET presence:{user_id} 1 EX 90     — on connect, and on every heartbeat
DEL presence:{user_id}             — on clean disconnect
MGET presence:{id1} presence:{id2} — which channel members are online
```

If a server crashes without closing its sockets, the key expires within 90 seconds and the user shows as offline. Broadcast presence changes to channel members as WebSocket events. Run Redis on a private network with a password; never expose it on a public interface.

### Step 5: Write Integration Tests

```text
Write tests covering: sending a message and receiving it in another client,
reconnection with message sync, duplicate message prevention, and typing
indicator timeout.
```

The test suite covers the critical paths that are easy to get wrong:

- Message sent by user A appears in user B's WebSocket stream
- Messages arrive in server-assigned id order regardless of send timing
- Duplicate client UUID (including two concurrent sends) stores one message; the original id is returned
- A user who is not a channel member cannot post to it
- Reconnecting client receives missed messages since `last_message_id`
- Typing indicator expires after 3 seconds of no re-send
- Socket that misses a ping is terminated; presence key expires after 90 seconds
- Offline user gets accurate unread count on reconnect

Each test spins up a real WebSocket server against a throwaway PostgreSQL database. No mocks for the WebSocket layer -- the tests verify actual message delivery over real connections.

## Real-World Example

A backend developer at a small logistics company needs dispatchers to message drivers in real time. The existing app is a Next.js dashboard with PostgreSQL and 200 daily active users. Separate messaging apps are creating information gaps -- dispatch instructions get lost in a personal WhatsApp thread, and there is no audit trail.

He scaffolds the WebSocket server, chat schema, and message handlers in a day. Direct messages between dispatchers and drivers go live first. Group channels for team-wide broadcasts follow. Presence tracking lets dispatchers see which drivers are currently online and reachable.

The full chat feature ships in three days. Dispatchers stop using a separate messaging app, every instruction has an audit trail, and the 90-second presence expiry means dispatchers immediately know when a driver drops off the network.

## Related Skills

- [websocket-builder](../skills/websocket-builder/SKILL.md) — handshake auth, heartbeats, rooms, event routing and Redis pub/sub scaling (Steps 1, 3)
- [realtime-database](../skills/realtime-database/SKILL.md) — chat schema, cursor pagination, unread counts and reconnect sync (Steps 2, 3)
