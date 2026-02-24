---
name: partykit
description: >-
  Build multiplayer and collaborative apps with PartyKit. Use when a user asks
  to build real-time collaboration features, create multiplayer experiences,
  add live cursors, build collaborative editing, create real-time voting or
  polls, sync state across clients, or build WebSocket servers on the edge.
  Covers PartyServer definition, client connections, state management,
  hibernation, and deployment to Cloudflare.
license: Apache-2.0
compatibility: 'Node.js 18+ (deploys to Cloudflare Workers)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - partykit
    - realtime
    - multiplayer
    - collaboration
    - websocket
    - edge
---

# PartyKit

## Overview

PartyKit is a platform for building real-time, multiplayer, and collaborative applications. Each "party" is an isolated room running on Cloudflare's edge network — close to users for low latency. Unlike Socket.IO (which needs a persistent server), PartyKit runs serverless with automatic hibernation — you pay for active connections, not idle servers. Use it for collaborative editing, live cursors, multiplayer games, real-time polls, and any feature where multiple clients need synchronized state.

## Instructions

### Step 1: Setup

```bash
# Create new project
npm create partykit@latest my-party
cd my-party

# Or add to existing project
npm install partykit partysocket

# Start development server
npx partykit dev
# Server running at http://127.0.0.1:1999
```

### Step 2: Define a Party Server

```typescript
// party/index.ts — A PartyKit server (one instance per room)
import type * as Party from 'partykit/server'

export default class ChatRoom implements Party.Server {
  // Shared state for this room
  messages: Array<{ author: string; text: string; timestamp: number }> = []

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    /** Called when a client connects to this room. */
    // Send existing messages to the new connection
    conn.send(JSON.stringify({ type: 'history', messages: this.messages }))

    // Notify others
    this.room.broadcast(
      JSON.stringify({ type: 'user-joined', connectionId: conn.id }),
      [conn.id]    // exclude the new connection
    )
  }

  onMessage(message: string, sender: Party.Connection) {
    /** Called when a client sends a message. */
    const data = JSON.parse(message)

    if (data.type === 'chat') {
      const chatMessage = {
        author: data.author,
        text: data.text,
        timestamp: Date.now(),
      }
      this.messages.push(chatMessage)

      // Broadcast to all connections in this room
      this.room.broadcast(JSON.stringify({ type: 'new-message', message: chatMessage }))
    }
  }

  onClose(conn: Party.Connection) {
    this.room.broadcast(JSON.stringify({ type: 'user-left', connectionId: conn.id }))
  }
}
```

### Step 3: Client Connection

```typescript
// hooks/useParty.ts — React hook for PartyKit connection
import usePartySocket from 'partysocket/react'

export function useChatRoom(roomId: string, userName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST!,
    room: roomId,
    onMessage(event) {
      const data = JSON.parse(event.data)

      if (data.type === 'history') {
        setMessages(data.messages)
      } else if (data.type === 'new-message') {
        setMessages(prev => [...prev, data.message])
      }
    },
  })

  const sendMessage = (text: string) => {
    socket.send(JSON.stringify({ type: 'chat', author: userName, text }))
  }

  return { messages, sendMessage, readyState: socket.readyState }
}
```

### Step 4: Live Cursors

```typescript
// party/cursors.ts — Real-time cursor sharing (like Figma)
import type * as Party from 'partykit/server'

type Cursor = { x: number; y: number; name: string; color: string }

export default class CursorRoom implements Party.Server {
  cursors = new Map<string, Cursor>()

  constructor(readonly room: Party.Room) {}

  onMessage(message: string, sender: Party.Connection) {
    const cursor: Cursor = JSON.parse(message)
    this.cursors.set(sender.id, cursor)

    // Broadcast cursor position to everyone else
    this.room.broadcast(
      JSON.stringify({ id: sender.id, ...cursor }),
      [sender.id]
    )
  }

  onClose(conn: Party.Connection) {
    this.cursors.delete(conn.id)
    this.room.broadcast(JSON.stringify({ id: conn.id, gone: true }))
  }
}
```

### Step 5: Deploy

```bash
# Deploy to Cloudflare's edge network
npx partykit deploy

# Custom domain
npx partykit deploy --domain my-party.example.com

# Environment variables
npx partykit env add OPENAI_API_KEY
```

## Examples

### Example 1: Add collaborative editing to a document app
**User prompt:** "Add real-time collaboration to our note-taking app — multiple users editing the same document with live cursors."

The agent will:
1. Create a PartyKit server that manages document state and cursor positions.
2. Use CRDT (Yjs) for conflict-free concurrent editing.
3. Add cursor presence showing each editor's position and name.
4. Deploy to Cloudflare's edge for global low-latency access.

### Example 2: Build a live polling/voting feature
**User prompt:** "Add real-time polls to our presentation tool. Audience votes on their phones, results update live on the presenter's screen."

The agent will:
1. Create a party room per poll with vote state.
2. Audience connects via phone, casts votes.
3. Presenter view receives real-time vote count updates.
4. Results animate as votes come in.

## Guidelines

- Each room is an isolated instance — state is not shared between rooms. Use room IDs to partition data (one room per document, per game session, per chat channel).
- PartyKit hibernates rooms with no active connections — you're not paying for idle rooms. State persists in the room object while connections exist.
- For persistent state (survive room hibernation), use PartyKit's built-in storage (`this.room.storage`) or an external database.
- Use `partysocket` (not raw WebSocket) on the client — it handles reconnection, buffering, and the PartyKit protocol.
- PartyKit deploys to Cloudflare's edge network — rooms run closest to the first connecting user, then all subsequent users connect to that location.
