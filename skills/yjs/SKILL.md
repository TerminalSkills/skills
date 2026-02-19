---
name: yjs
description: >-
  Build real-time collaborative apps with Yjs CRDT framework. Use when a user
  asks to add collaborative editing, sync state between users, build Google
  Docs-like collaboration, implement conflict-free data types, or add
  offline-first collaboration.
license: Apache-2.0
compatibility: 'JavaScript/TypeScript, any runtime'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - yjs
    - crdt
    - collaboration
    - realtime
    - sync
    - offline
---

# Yjs

## Overview

Yjs is a CRDT (Conflict-free Replicated Data Type) framework for real-time collaboration. It syncs shared data structures (text, arrays, maps) between clients without a central server making decisions. Works with any editor (Tiptap, ProseMirror, Monaco, CodeMirror), any transport (WebSocket, WebRTC, y-sweet), and supports offline editing.

## Instructions

### Step 1: Setup

```bash
npm install yjs y-websocket y-protocols
```

### Step 2: Shared Document

```typescript
// lib/collab.ts — Create a shared Yjs document
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

// Create document (each client creates their own instance)
const ydoc = new Y.Doc()

// Shared types — changes sync automatically
const ytext = ydoc.getText('editor')        // shared text (for editors)
const yarray = ydoc.getArray('items')       // shared array
const ymap = ydoc.getMap('settings')        // shared key-value map

// Connect to sync server
const provider = new WebsocketProvider('ws://localhost:1234', 'room-name', ydoc)
provider.on('status', ({ status }) => console.log('Sync:', status))

// Observe changes
ytext.observe(event => {
  console.log('Text changed:', ytext.toString())
})

yarray.observe(event => {
  console.log('Array:', yarray.toArray())
})

// Make changes (auto-synced to all connected clients)
ytext.insert(0, 'Hello ')
yarray.push(['item1', 'item2'])
ymap.set('theme', 'dark')
```

### Step 3: WebSocket Server

```bash
# Start y-websocket server (handles sync between clients)
npx y-websocket
# Listens on ws://localhost:1234
```

### Step 4: Awareness (Cursors/Presence)

```typescript
// Awareness shows who's online and their cursor position
const awareness = provider.awareness

// Set local state (visible to other clients)
awareness.setLocalStateField('user', {
  name: 'Alice',
  color: '#ff0000',
  cursor: { x: 100, y: 200 },
})

// Listen for remote awareness changes
awareness.on('change', () => {
  const states = awareness.getStates()    // Map<clientID, state>
  states.forEach((state, clientId) => {
    console.log(`${state.user?.name} at`, state.user?.cursor)
  })
})
```

## Guidelines

- Yjs is transport-agnostic — use y-websocket for WebSocket, y-webrtc for P2P, or y-indexeddb for offline persistence.
- CRDTs guarantee eventual consistency without a central authority — edits never conflict, even offline.
- For rich text, use Yjs bindings: y-prosemirror (Tiptap), y-codemirror (CodeMirror), y-monaco (Monaco Editor).
- The y-websocket server is stateless — it just relays updates. Document state lives in clients and optional persistence (y-leveldb).
