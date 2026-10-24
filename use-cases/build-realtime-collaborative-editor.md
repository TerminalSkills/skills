---
title: "Build a Realtime Collaborative Editor"
slug: build-realtime-collaborative-editor
description: "Build self-hosted real-time co-editing with Yjs CRDTs and Hocuspocus: live cursors and presence, per-document roles, offline sync, PostgreSQL persistence, Redis scale-out, and a conflict-safe data model for non-text state like checklists."
skills: [websocket-builder, realtime-database, auth-system-setup, yjs, typescript, zod, hono, postgresql, redis]
category: development
tags: [websocket, collaboration, realtime, editor, crdt, presence, offline-first, yjs]
---

# Build a Realtime Collaborative Editor

## The Problem

Noa is building an internal knowledge base and task tool for her five-person engineering team. Several people must edit the same document at the same time, like Google Docs but self-hosted: hosted editors charge per seat, and some run on someone else's servers, which fails the data residency requirements of their enterprise clients.

The hard part is conflicts. With last-write-wins, whoever saves last destroys everyone else's work, and locking kills the collaborative feel. The team had also tried operational transforms (OT) and fought cursor jumps and lost characters. On top of conflict-free merging she needs live cursors and presence, access control per document (the WebSocket bypasses ordinary HTTP middleware), and offline editing, because some people work on trains and rooftops with no signal.

## The Solution

Conflict resolution is delegated to **yjs**, a CRDT library: copies of a document merge to the same result in any order, so the server has nothing to transform. Hocuspocus is the WebSocket server that speaks the Yjs sync protocol, and CodeMirror 6 is the editor. **auth-system-setup** covers accounts, sessions and document roles, **websocket-builder** the real-time layer (rooms, connection authentication, reconnects), and **hono** with **zod** the REST endpoint that issues short-lived collab tokens and validates untrusted data. **realtime-database** and **postgresql** persist document state as the system of record, **redis** fans updates out between several collab servers, and **typescript** types the document helpers.

## Step-by-Step Walkthrough

### Step 1: Set up authentication and document permissions

```text
I need user authentication for the editor. Simple email + password login,
short-lived JWT access tokens, and document-level permissions: owner, editor,
viewer. The owner can share documents with others and set their role. Use
PostgreSQL for storage.
```

Registration hashes passwords with a modern algorithm (argon2id or bcrypt), and the API issues a short-lived JWT whose `sub` is the user id. Roles:

| Role | Read | Write | Share | Delete |
|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

A `document_permissions(document_id, user_id, role)` table backs it. `POST /documents/:id/share` (owner only, body `{ email, role }`) creates a row, and a `requireDocumentAccess(minRole)` middleware returns 403 when the role is too low. The creator becomes the owner. The collaboration server checks the role again in Step 3.

### Step 2: Issue collab tokens from the API

The browser calls the REST API with its normal session and receives a token that lives five minutes. It uses that token to open the WebSocket, and the collab server re-checks the role on connect, so the token only proves who the user is.

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { zValidator } from '@hono/zod-validator'
import { SignJWT } from 'jose'
import { z } from 'zod'

const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET)
const app = new Hono<{ Variables: { userId: string; userName: string } }>()

// Your session middleware sets userId / userName here.

app.post('/documents/:id/collab-token',
  zValidator('param', z.object({ id: z.uuid() })),
  async (c) => {
    const token = await new SignJWT({ name: c.get('userName') })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.get('userId'))
      .setExpirationTime('5m')
      .sign(secret)
    return c.json({ token })
  })

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3000 })
```

### Step 3: Build the collaboration server

```text
Set up the WebSocket server. Each document is a room. I need connection
authentication (verify the JWT and the user's role on connect), read-only
enforcement for viewers, PostgreSQL as the system of record, and Redis so
several server processes can share a document.
```

Hocuspocus rooms are named after the document id. The client sends its token in the protocol handshake (not in the URL, where it would end up in access logs), and `onAuthenticate` decides whether the connection lives. Setting `connectionConfig.readOnly` makes the server ignore that client's edits while it still receives everyone else's. Use a server that speaks the Yjs protocol rather than relaying raw bytes yourself: the handshake, awareness messages and read-only handling are what a hand-written relay gets wrong.

```typescript
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Redis as HocuspocusRedis } from '@hocuspocus/extension-redis'
import { jwtVerify } from 'jose'
import pg from 'pg'

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET)

export const server = new Server({
  address: '127.0.0.1',
  port: Number(process.env.PORT ?? 1234),
  debounce: 2000,     // save at most every 2 s after an edit
  maxDebounce: 10000, // but never wait longer than 10 s under constant typing

  // Runs on connect; throwing rejects the connection.
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const { payload } = await jwtVerify(token, secret)
    const { rows } = await db.query(
      'SELECT role FROM document_permissions WHERE document_id = $1 AND user_id = $2',
      [documentName, payload.sub],
    )
    if (!rows[0]) throw new Error('not allowed')
    connectionConfig.readOnly = rows[0].role === 'viewer' // server drops this client's edits
    return { user: { id: String(payload.sub), name: String(payload.name ?? payload.sub) } }
  },

  extensions: [
    // Fan-out between several collab servers. Redis is NOT the system of record.
    new HocuspocusRedis({ host: '127.0.0.1', port: 6379 }),
    // PostgreSQL is.
    new Database({
      fetch: async ({ documentName }) =>
        (await db.query('SELECT yjs_state FROM documents WHERE id = $1', [documentName]))
          .rows[0]?.yjs_state ?? null,
      store: async ({ documentName, state }) => {
        await db.query(
          `INSERT INTO documents (id, yjs_state, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (id) DO UPDATE SET yjs_state = $2, updated_at = now()`,
          [documentName, state],
        )
      },
    }),
  ],
})

server.listen()
```

In a test with a server like this, an editor typed "hello " and another typed "world " at position 0 at the same moment. Both clients and a viewer converged on `world hello `, the viewer's attempted edit never reached the others, and a user without a role was rejected with `permission-denied`. Hocuspocus handles pings and reconnects on the provider side, so you do not hand-write heartbeats.

Redis is only the message bus. Do not make it the only copy of a document, because a default Redis install can lose recent writes on restart. Bind it to `127.0.0.1` (or a private network with a password); a single collab server needs no Redis at all.

### Step 4: Persist documents

CRDT merges are commutative, so there is no central transform server as in OT. The server keeps one `Y.Doc` per open document and the `Database` extension stores its encoded state:

```sql
CREATE TABLE documents (
  id         UUID PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  yjs_state  BYTEA,                -- Y.encodeStateAsUpdate(doc)
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE document_permissions (
  document_id UUID REFERENCES documents(id),
  user_id     UUID NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (document_id, user_id)
);
```

`debounce` and `maxDebounce` control how often `store` runs, and the state is also written when the last client leaves. The single-state table keeps no history. For "who changed this paragraph", write periodic snapshots to a second table, or store each incoming update with its user id from an `onChange` hook.

### Step 5: Build the editor UI with presence and offline sync

```text
Create the frontend: document list sidebar, the collaborative editor in the
center, presence panel on the right. Use CodeMirror 6 with markdown support.
Show each user's cursor with a color and a name, and keep working offline.
```

Use a three-column layout: document list, editor, presence and share button. Presence is Yjs awareness, a small state object each client publishes and the server relays; it is not stored in the document. The client sets `{ name, color }` under the `user` field and `y-codemirror.next` draws remote cursors, selections and name labels from it. Awareness comes from other browsers, so validate it with zod before rendering the sidebar.

```typescript
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { yCollab } from 'y-codemirror.next'
import { z } from 'zod'

const Presence = z.object({
  user: z.object({ name: z.string(), color: z.string() }),
  lastActive: z.number().optional(),
})

export async function openEditor(parent: HTMLElement, docId: string,
                                 me: { name: string; color: string }) {
  const res = await fetch(`/documents/${docId}/collab-token`, { method: 'POST' })
  const { token } = (await res.json()) as { token: string }

  const ydoc = new Y.Doc()
  const local = new IndexeddbPersistence(docId, ydoc) // edits survive reloads while offline
  const provider = new HocuspocusProvider({
    url: 'wss://docs.example.com/collab',             // your server, behind TLS
    name: docId,
    document: ydoc,
    token,
  })
  provider.awareness?.setLocalStateField('user', me)

  const ytext = ydoc.getText('content')
  const undoManager = new Y.UndoManager(ytext)        // undoes only this user's edits
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [basicSetup, markdown(), yCollab(ytext, provider.awareness, { undoManager })],
    }),
  })

  // Sidebar: re-render on awareness 'change'; entries vanish when a client disconnects,
  // or after 30 s of silence if it crashed.
  const peers = () =>
    [...(provider.awareness?.getStates().values() ?? [])]
      .flatMap((s) => { const p = Presence.safeParse(s); return p.success ? [p.data] : [] })
  return { view, provider, ydoc, local, peers }
}
```

Edits are applied to the local document immediately and stored in IndexedDB; when the connection returns, the provider exchanges updates with the server and both sides converge. There is no separate "offline mode" to code. The provider's `onStatus` callback drives the status bar ("Connected", "Reconnecting...", "Offline, changes sync when reconnected"). "Active versus idle" is your own convention: publish a `lastActive` timestamp in the awareness state and grey out entries older than 30 seconds. A collab token expires after five minutes, so request a fresh one before reconnecting after a long offline period.

### Step 6: Model non-text state so concurrent edits do not fight

Text fields are `Y.Text`, which merges at character level. Structured state such as a task checklist needs more care. An array indexed by position makes two users who reorder or insert at once fight over indexes, and delete-and-reinsert reordering can duplicate or lose an item. Key items by id in a `Y.Map` and keep position in a numeric `order` field, in the same `Y.Doc` as the text:

```typescript
import * as Y from 'yjs'

export const checklist = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('checklist')

export function addItem(doc: Y.Doc, text: string, assignee: string | null = null) {
  const items = checklist(doc)
  const last = Math.max(0, ...[...items.values()].map((i) => i.get('order') as number))
  const item = new Y.Map<unknown>()
  const id = crypto.randomUUID()
  doc.transact(() => {
    items.set(id, item)
    item.set('text', text)
    item.set('done', false)
    item.set('assignee', assignee)
    item.set('order', last + 1)
  })
  return id
}

// Set, don't toggle: two offline clients that both tick the box agree on `true`.
export const setDone = (doc: Y.Doc, id: string, done: boolean) =>
  checklist(doc).get(id)?.set('done', done)

// Reorder by giving the item an order between its new neighbours. Concurrent moves of
// the same item resolve to one of the two positions; nothing is duplicated or lost.
export function moveBetween(doc: Y.Doc, id: string, before?: string, after?: string) {
  const items = checklist(doc)
  const o = (k?: string) => (k ? (items.get(k)?.get('order') as number) : undefined)
  const lo = o(before) ?? (o(after) !== undefined ? o(after)! - 2 : 0)
  const hi = o(after) ?? lo + 2
  items.get(id)?.set('order', (lo + hi) / 2)
}

export const sorted = (doc: Y.Doc) =>
  [...checklist(doc).entries()]
    .map(([id, m]) => ({ id, ...(m.toJSON() as { text: string; done: boolean; order: number }) }))
    .sort((a, b) => a.order - b.order)
```

Three choices matter. `setDone` sets a value instead of toggling, so two offline ticks agree on `true` where two toggles would cancel out. `moveBetween` changes one number instead of deleting and re-inserting, so a concurrent move cannot duplicate or lose the item. And everything arriving from other clients (awareness, request bodies) is parsed with zod before use.

A test with two documents made offline edits on both sides: both ticked the same item, both moved the same item, and both typed at the start of the title. After exchanging updates (`Y.encodeStateAsUpdate` and `Y.applyUpdate`), the checklist was identical on both, the item appeared once, and the title was `v2 Release ` on both. Run the same test in your own suite. Bind `ydoc.getMap('checklist').observeDeep` to re-render the board, and pass both shared types to `Y.UndoManager`.

## Real-World Example

Noa's team deploys the editor on a small VPS in a weekend and starts writing specs, runbooks and design docs in it. Live cursors make pair-writing easy: two engineers draft an API spec together and watch each other's changes as they type. The contractors get viewer links that can read a runbook but not change it, because the server enforces the role, not just the UI.

During an incident, two engineers edit the same runbook, one updating the timeline and the other writing down the root cause, and their edits merge with no coordination. A month later the team adds inspection checklists to the same tool. Dana, on a rooftop with no signal, ticks four items and adds two comments. Meanwhile the coordinator reorders the list and fixes a typo in the title. When Dana's phone reconnects, her ticks, the new order and the typo fix are all kept, and nobody sees a conflict dialog.

## Limits to plan for

- A CRDT converges, but it does not know your business rules. Two people can assign the same item to different owners; the last write wins on that field. If that matters, show who assigned it and let people change it.
- Deleted content is kept as tombstones until Yjs garbage collection compacts it, so test document size with your real edit volume before promising a limit.
- Concurrent typing in one spot is merged at character level and can interleave two people's words. Cursors and presence make this rare in practice.
- Scaling past one process needs the Redis extension; do not share document state yourself.

## Related Skills

- [auth-system-setup](/skills/auth-system-setup) - accounts, sessions and the owner/editor/viewer role model
- [websocket-builder](/skills/websocket-builder) - rooms, connection authentication and reconnect handling
- [realtime-database](/skills/realtime-database) - persisting document state
- [yjs](/skills/yjs) - shared types, awareness and the offline provider
- [typescript](/skills/typescript) - typed document helpers
- [zod](/skills/zod) - validation of awareness and request data
- [hono](/skills/hono) - REST API and collab token endpoint
- [postgresql](/skills/postgresql) - durable document state and permissions
- [redis](/skills/redis) - fan-out between collab servers
