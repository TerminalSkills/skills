---
title: "Build a Realtime Collaborative Editor"
slug: build-realtime-collaborative-editor
description: "Create a collaborative text editor where multiple users can edit documents simultaneously with live cursors, presence indicators, and conflict-free synchronization."
skills: [websocket-builder, realtime-database, auth-system-setup]
category: development
tags: [websocket, collaboration, realtime, editor, crdt, presence]
---

# Build a Realtime Collaborative Editor

## The Problem

Noa is building an internal knowledge base tool for her five-person engineering team. The key requirement: multiple people need to edit the same document at the same time, like Google Docs but self-hosted and private. Hosted editors charge per seat, and some run on someone else's servers, which fails the data residency requirements of their enterprise clients.

The real engineering challenge is conflict resolution. When two people type at the same position simultaneously, both edits need to survive. Last-write-wins and locking either lose data or destroy the collaborative experience. Noa needs live cursors showing who is editing where, synchronization without conflicts, and authentication so access is controlled per document.

## The Solution

Use **auth-system-setup** for user accounts, sessions and document roles, **websocket-builder** for the real-time layer (rooms, connection authentication, reconnects), and **realtime-database** to persist document state in PostgreSQL. Conflict resolution is delegated to Yjs, a CRDT library, with Hocuspocus as the WebSocket server that speaks Yjs's sync protocol, and CodeMirror 6 as the editor.

## Step-by-Step Walkthrough

### Step 1: Set Up Authentication and Document Permissions

```text
I need user authentication for the editor. Simple email + password login,
short-lived JWT access tokens, and document-level permissions: owner, editor,
viewer. The owner can share documents with others and set their role. Use
PostgreSQL for storage.
```

Registration hashes passwords with a modern algorithm (argon2id or bcrypt), and the API issues a short-lived JWT whose `sub` is the user id. Document access uses a simple role model:

| Role | Read | Write | Share | Delete |
|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

A `document_permissions(document_id, user_id, role)` table backs it. `POST /documents/:id/share` (owner only, body `{ email, role }`) creates a row, and a `requireDocumentAccess(minRole)` middleware returns 403 when the role is too low. Creating a document makes the creator its owner. Roles are checked again by the collaboration server in the next step, because the WebSocket does not go through your HTTP middleware.

### Step 2: Build the Collaboration Server

```text
Set up the WebSocket server. Each document is a room. I need connection
authentication (verify the JWT and the user's role on connect), read-only
enforcement for viewers, and debounced persistence to PostgreSQL.
```

Hocuspocus rooms are named after the document id. The client sends its token as part of the protocol handshake (not in the URL, where it would end up in access logs), and `onAuthenticate` decides whether the connection lives. Setting `connectionConfig.readOnly` makes the server ignore that client's edits while it still receives everyone else's. This sketch was run against two editors, a viewer and a rejected user:

```typescript
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { jwtVerify } from 'jose'

type Role = 'owner' | 'editor' | 'viewer'

// Replace the bodies with queries against your documents / document_permissions tables.
export const store = {
  async load(docId: string): Promise<Uint8Array | null> { return null },
  async save(docId: string, state: Uint8Array): Promise<void> {},
  async roleFor(userId: string, docId: string): Promise<Role | null> { return 'editor' },
}

const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET)

export const server = new Server({
  address: '127.0.0.1',
  port: Number(process.env.PORT ?? 1234),
  debounce: 2000,     // save at most every 2 s after an edit
  maxDebounce: 10000, // but never wait longer than 10 s under constant typing

  // Runs on connect; throwing rejects the connection.
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const { payload } = await jwtVerify(token, secret)
    const userId = String(payload.sub)
    const role = await store.roleFor(userId, documentName)
    if (!role) throw new Error('not allowed')
    connectionConfig.readOnly = role === 'viewer' // server drops this client's edits
    return { userId, name: String(payload.name ?? userId), role }
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => store.load(documentName),
      store: async ({ documentName, state }) => store.save(documentName, state),
    }),
  ],
})

server.listen()
```

In a test with this server, an editor typed "hello " and another typed "world " at position 0 at the same moment. Both clients and the viewer converged on `world hello `, a viewer's attempted edit never reached the others, and a user without a role was rejected with `permission-denied`.

Hocuspocus handles pings and reconnects on the provider side, so you do not hand-write heartbeats. Run one server process per document set; to scale across processes, add Hocuspocus's Redis extension rather than sharing state yourself.

### Step 3: Persist Documents

CRDT merges are commutative: the order updates arrive in does not matter, so there is no central transform server as in operational transformation. The server keeps one `Y.Doc` per open document and the `Database` extension stores its encoded state:

```sql
CREATE TABLE documents (
  id         UUID PRIMARY KEY,
  title      TEXT NOT NULL,
  yjs_state  BYTEA,                -- Y.encodeStateAsUpdate(doc)
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

`store.load` selects `yjs_state` and `store.save` upserts it; `debounce` and `maxDebounce` control how often that happens, and the state is also written when the last client leaves. If you need "who changed this paragraph", keep periodic snapshots in a second table, or store each incoming update with its user id with an `onChange` hook; the single-state table above does not keep history by itself.

Yjs also works offline. A client keeps editing while disconnected and its changes merge on reconnect.

### Step 4: Live Cursors and Presence

```text
Show each user's cursor and selection in real time, with a color and a name
label per user. Also show a presence list in the sidebar.
```

Presence is Yjs awareness, a small state object each client publishes and the server relays; it is not stored in the document. The client sets `{ name, color }` under the `user` field, and `y-codemirror.next` draws remote cursors, selections and name labels from it. For the sidebar, read `provider.awareness.getStates()` and re-render on its `change` event; an entry is removed when its client disconnects, or after 30 seconds of silence if it crashed. "Active versus idle" is your own convention: publish a `lastActive` timestamp in the same state and grey out entries older than 30 seconds.

### Step 5: Build the Editor UI

```text
Create the frontend: document list sidebar, the collaborative editor in the
center, presence panel on the right. Use CodeMirror 6 with markdown support.
```

Use a three-column layout: document list, editor, presence and share button. The editor wiring is short:

```typescript
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { yCollab } from 'y-codemirror.next'

export function openEditor(parent: HTMLElement, docId: string, token: string,
                           me: { name: string; color: string }) {
  const ydoc = new Y.Doc()
  new IndexeddbPersistence(docId, ydoc)            // survives reloads while offline
  const provider = new HocuspocusProvider({
    url: 'wss://docs.example.com/collab',          // your server, behind TLS
    name: docId,
    document: ydoc,
    token,
  })
  // y-codemirror.next draws remote cursors and selections from this field
  provider.awareness?.setLocalStateField('user', { name: me.name, color: me.color })

  const ytext = ydoc.getText('content')
  const undoManager = new Y.UndoManager(ytext)     // undoes only this user's edits
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [basicSetup, markdown(), yCollab(ytext, provider.awareness, { undoManager })],
    }),
  })
  return { view, provider, ydoc }
}
```

The IndexedDB persistence keeps local edits across reloads while offline. The provider's `onStatus` callback drives the status bar: "Connected", "Reconnecting...", or "Offline, changes sync when reconnected". Serve the collab endpoint over `wss://`.

## Real-World Example

Noa's team sets up the self-hosted editor on a small VPS in a weekend and starts writing specs, runbooks and design docs in it. Live cursors make pair-writing easy: two engineers draft an API spec together and watch each other's changes as they type.

The CRDT earns its keep during an incident. Two engineers edit the same runbook while troubleshooting production, one updating the timeline and the other writing down the root cause. Their edits merge with no conflicts and no coordination. The team's contractors get viewer links that can read the runbook but cannot change it, because the server enforces the role, not just the UI.

## Related Skills

- [auth-system-setup](/skills/auth-system-setup) - accounts, sessions and the owner/editor/viewer role model
- [websocket-builder](/skills/websocket-builder) - rooms, connection authentication and reconnect handling
- [realtime-database](/skills/realtime-database) - PostgreSQL schema for document state
