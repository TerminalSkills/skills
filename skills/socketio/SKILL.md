---
name: socketio
description: >-
  Socket.IO is a Node.js library for bidirectional, event-based real-time communication between browsers (or other clients) and a server, with WebSocket transport, HTTP long-polling fallback, automatic reconnection, rooms and namespaces. Use when a user asks to build a chat, live notifications, a real-time dashboard, presence indicators, collaborative editing or pub/sub messaging, add WebSocket communication, authenticate socket connections, or scale Socket.IO across several servers with the Redis adapter.
license: Apache-2.0
compatibility: 'Node.js 18+ recommended for the server (socket.io 4.x supports older), any modern browser or Node.js for the client'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/socketio/socket.io
  tags: "socketio, websocket, realtime, chat, events"
---

# Socket.IO

## Overview

Socket.IO adds its own protocol on top of WebSocket and HTTP long-polling: named events, acknowledgements, rooms, namespaces, automatic reconnection and broadcasting. A Socket.IO client can only talk to a Socket.IO server (and the reverse); it is not a plain WebSocket endpoint. The current release line is 4.x (`socket.io` and `socket.io-client` 4.8). This skill covers server setup with Express, a typed browser client, JWT authentication in a middleware, rooms with acknowledgements, presence and scaling with the Redis adapter.

## Instructions

### Step 1: Install

```bash
npm install socket.io express jsonwebtoken     # server
npm install socket.io-client                   # browser / Node client
npm install @socket.io/redis-adapter redis     # only for several server instances
```

### Step 2: Server with authentication and rooms

The auth middleware runs before `connection`. The client sends the token in the handshake `auth` object; do not put tokens in the URL query. This server was run end to end with socket.io 4.8.4: a bad token is rejected with `Invalid token`, and a message sent to a room reaches the other member.

```typescript
// server.ts
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import express from 'express'
import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET
if (!secret) throw new Error('JWT_SECRET is required')

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:3000'] },   // list the real frontend origins
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
})

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (typeof token !== 'string') return next(new Error('Authentication required'))
  try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] }) as { sub: string; name: string }
    socket.data.userId = claims.sub
    socket.data.userName = claims.name
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`)   // one room per user: reach all of a user's tabs

  socket.on('join-room', async (roomId: string, ack: (r: unknown) => void) => {
    await socket.join(roomId)
    socket.to(roomId).emit('user-joined', { userId: socket.data.userId, roomId })
    const members = (await io.in(roomId).fetchSockets()).map((s) => s.data.userName)
    ack({ ok: true, members })
  })

  socket.on('room-message', ({ roomId, text }: { roomId: string; text: string }) => {
    if (!socket.rooms.has(roomId)) return        // only members may post
    io.to(roomId).emit('message', { roomId, text, from: socket.data.userName, at: Date.now() })
  })

  socket.on('disconnect', (reason) => console.log(`${socket.id} left: ${reason}`))
})

httpServer.listen(3001, () => console.log('Socket.IO on :3001'))
```

`connectionStateRecovery` lets a client that dropped briefly resume with its rooms and missed events (`socket.recovered` is true on the client). It is not supported by the Redis adapter.

### Step 3: Browser client (React)

Create the socket inside the effect so React StrictMode's double mount cleans up, and keep it in state so components re-render when it exists.

```typescript
// useSocket.ts
import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(url: string, token: string) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const s = io(url, { auth: { token } })
    s.on('connect', () => setIsConnected(true))
    s.on('disconnect', () => setIsConnected(false))
    s.on('connect_error', (err) => console.error('socket rejected:', err.message))
    setSocket(s)
    return () => { s.disconnect() }
  }, [url, token])

  return { socket, isConnected }
}
```

Join a room and wait for the server's reply with an acknowledgement:

```typescript
const reply = await socket.emitWithAck('join-room', 'general')   // { ok: true, members: ['Maria'] }
socket.on('message', (m) => console.log(m.from, m.text))
socket.emit('room-message', { roomId: 'general', text: 'Standup at 10:00' })
```

Reconnection is on by default. After a reconnect without state recovery (`socket.recovered === false`) the server has forgotten the rooms: re-join them in the `connect` handler.

### Step 4: Presence

Count connections per user instead of keeping a user-to-socket map: users have several tabs, and a map is also wrong once there is more than one server.

```typescript
io.on('connection', async (socket) => {
  const { userId, userName } = socket.data
  const sockets = await io.in(`user:${userId}`).fetchSockets()
  if (sockets.length === 1) io.emit('presence-update', { userId, userName, status: 'online' })

  socket.on('disconnect', async () => {
    const left = await io.in(`user:${userId}`).fetchSockets()
    if (left.length === 0) io.emit('presence-update', { userId, userName, status: 'offline' })
  })
})
```

`fetchSockets()` works across servers when the Redis adapter is installed. For a large user base keep presence in Redis or the database instead.

### Step 5: Scale with the Redis adapter

```typescript
// server-scaled.ts
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'

const pubClient = createClient({ url: process.env.REDIS_URL })   // e.g. redis://10.0.0.5:6379
const subClient = pubClient.duplicate()
await Promise.all([pubClient.connect(), subClient.connect()])

const io = new Server(httpServer, { adapter: createAdapter(pubClient, subClient) })
```

This part is from the official docs and was not run (no Redis in the test environment). For new deployments the docs recommend the sharded adapter (`@socket.io/redis-adapter` `createShardedAdapter`, Redis 7+). The docs warn that the `redis` package may not restore subscriptions after a reconnect; `ioredis` is the alternative. Redis must be on a private network: adapter messages are not signed or encrypted, and anyone who can publish to the channels can inject events.

With several servers and long-polling enabled, the load balancer must use sticky sessions; otherwise restrict clients to `transports: ['websocket']`.

## Examples

### Example 1: Group chat with rooms

Request: "Build a group chat where users join rooms, see who is in each room and messages appear instantly."

The agent sets up the server from Step 2 and the hook from Step 3, shows `members` from the `join-room` acknowledgement in a member list, and renders `message` events in a list. Result: two browsers logged in as different users, both in `general`, see `Maria: Standup at 10:00` at once; a third user who has not joined sees nothing.

### Example 2: Live notification badge

Request: "When someone mentions a user in a comment, update their notification bell without a page refresh."

On the server, after saving the comment: `io.to('user:42').emit('notification', { id, text })`. The `user:<id>` room from Step 2 reaches every open tab of that user, on any server when the Redis adapter is used. The client does `socket.on('notification', n => setUnread(c => c + 1))`.

## Guidelines

- Always authenticate in `io.use` and check room membership before relaying messages; otherwise anyone can connect and read or post to any room.
- Set `cors.origin` to the real frontend origins. It only matters when the page and server are on different origins.
- Send small payloads (ids, short text) and let the client fetch details; large events slow every connected client.
- Use acknowledgements (`emitWithAck`) when the sender needs to know the server handled the event. Add a timeout with `socket.timeout(5000).emitWithAck(...)` so the promise rejects instead of waiting forever.
- Server-side state in a variable (user maps, counters) is per process; move it to Redis or a database before you run two instances.
- For a plain WebSocket endpoint (no Socket.IO protocol) use the `ws` package instead.
