---
name: socketio
description: >-
  Add real-time communication with Socket.IO. Use when a user asks to build
  real-time features, add WebSocket communication, build a chat application,
  implement live notifications, create collaborative editing, stream live data,
  build real-time dashboards, add presence indicators, or implement pub/sub
  messaging in a web app. Covers server setup, client connection, rooms,
  namespaces, authentication, scaling with Redis adapter, and Next.js integration.
license: Apache-2.0
compatibility: 'Node.js 16+ (server), any browser (client)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - socketio
    - websocket
    - realtime
    - chat
    - live
    - events
---

# Socket.IO

## Overview

Socket.IO is the most popular real-time communication library for Node.js. It provides bidirectional event-based communication between client and server, with automatic fallback from WebSocket to HTTP long-polling, reconnection handling, room-based broadcasting, and namespace isolation. This skill covers server setup, client integration, rooms, authentication middleware, scaling with Redis, and common patterns like chat, notifications, and presence.

## Instructions

### Step 1: Installation

```bash
# Server
npm install socket.io

# Client
npm install socket.io-client

# Redis adapter (for scaling across multiple servers)
npm install @socket.io/redis-adapter redis
```

### Step 2: Server Setup

```typescript
// server.ts — Socket.IO server with Express
import { createServer } from 'http'
import { Server } from 'socket.io'
import express from 'express'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',    // frontend URL
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`)

  // Listen for events from this client
  socket.on('message', (data) => {
    console.log(`Message from ${socket.id}:`, data)

    // Broadcast to all other clients
    socket.broadcast.emit('message', {
      ...data,
      senderId: socket.id,
      timestamp: Date.now(),
    })
  })

  // Rooms — group clients together
  socket.on('join-room', (roomId) => {
    socket.join(roomId)
    io.to(roomId).emit('user-joined', { userId: socket.id, roomId })
  })

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId)
    io.to(roomId).emit('user-left', { userId: socket.id })
  })

  // Send to specific room
  socket.on('room-message', ({ roomId, message }) => {
    io.to(roomId).emit('message', { message, senderId: socket.id })
  })

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${socket.id}, reason: ${reason}`)
  })
})

httpServer.listen(3001, () => console.log('Socket.IO server on :3001'))
```

### Step 3: Client Connection

```typescript
// hooks/useSocket.ts — React hook for Socket.IO client
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket(url: string = 'http://localhost:3001') {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [url])

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data)
  }, [])

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler)
    return () => { socketRef.current?.off(event, handler) }
  }, [])

  return { socket: socketRef.current, isConnected, emit, on }
}
```

### Step 4: Authentication Middleware

```typescript
// middleware/socket-auth.ts — Authenticate WebSocket connections
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

export function setupAuth(io: Server) {
  io.use((socket, next) => {
    /**
     * Verify JWT token from handshake auth.
     * Rejects connections without valid authentication.
     */
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!)
      socket.data.userId = (decoded as any).userId
      socket.data.userName = (decoded as any).userName
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })
}

// Client-side: pass token on connection
// const socket = io('http://localhost:3001', { auth: { token: 'user-jwt-token' } })
```

### Step 5: Scaling with Redis Adapter

```typescript
// server-scaled.ts — Scale Socket.IO across multiple server instances
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({ url: 'redis://localhost:6379' })
const subClient = pubClient.duplicate()

await pubClient.connect()
await subClient.connect()

const io = new Server(httpServer)
io.adapter(createAdapter(pubClient, subClient))
// Now events are broadcast across all server instances via Redis pub/sub
```

### Step 6: Presence (Online Status)

```typescript
// presence.ts — Track who's online in real-time
const onlineUsers = new Map<string, { socketId: string; userName: string }>()

io.on('connection', (socket) => {
  const userId = socket.data.userId
  const userName = socket.data.userName

  // Mark online
  onlineUsers.set(userId, { socketId: socket.id, userName })
  io.emit('presence-update', { userId, userName, status: 'online' })

  // Send current online list to newly connected user
  socket.emit('online-users', Array.from(onlineUsers.entries()).map(([id, data]) => ({
    userId: id,
    userName: data.userName,
    status: 'online',
  })))

  socket.on('disconnect', () => {
    onlineUsers.delete(userId)
    io.emit('presence-update', { userId, userName, status: 'offline' })
  })
})
```

## Examples

### Example 1: Build a real-time chat application
**User prompt:** "Build a group chat where users join rooms, see who's online, and messages appear instantly."

The agent will:
1. Set up Socket.IO server with room support and authentication.
2. Build React components: ChatRoom, MessageList, UserList, MessageInput.
3. Implement join/leave room events with member lists.
4. Add typing indicators and read receipts.
5. Scale with Redis adapter for multi-server deployment.

### Example 2: Add live notifications to a SaaS app
**User prompt:** "When a user is mentioned in a comment, show a real-time notification bell update without page refresh."

The agent will:
1. Connect Socket.IO on app load with user authentication.
2. Server sends notification events when comments mention a user.
3. Client updates the notification count badge in real-time.
4. Clicking the bell shows the notification panel with mark-as-read.

## Guidelines

- Socket.IO is not raw WebSocket — it's a higher-level protocol with its own framing. Socket.IO clients can only connect to Socket.IO servers, and vice versa. For raw WebSocket, use the `ws` package.
- Always add authentication middleware — without it, anyone can connect and listen to events.
- Use rooms for grouping (chat rooms, document collaboration sessions, team channels). They're more efficient than manually managing arrays of socket IDs.
- For production with multiple server instances, the Redis adapter is mandatory — without it, events only reach clients connected to the same server.
- Emit minimal data — Socket.IO messages are not compressed by default. Send IDs and let the client fetch details, rather than sending large objects over WebSocket.
- Handle reconnection gracefully — Socket.IO auto-reconnects, but the client should re-join rooms and re-sync state after reconnection.
