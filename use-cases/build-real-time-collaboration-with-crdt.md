---
title: Build Real-Time Collaboration with CRDTs
slug: build-real-time-collaboration-with-crdt
description: >
  Add Google Docs-style real-time editing to a project management app
  using Yjs CRDTs: offline edits, automatic conflict resolution, and
  per-task permissions, without operational transforms.
skills:
  - typescript
  - yjs
  - redis
  - hono
  - zod
  - postgresql
category: development
tags:
  - crdt
  - real-time
  - collaboration
  - yjs
  - websocket
  - offline-first
---

# Build Real-Time Collaboration with CRDTs

## The Problem

A project management SaaS has thousands of teams using shared task boards and documents. Users constantly overwrite each other's changes: with last-write-wins, whoever saves last destroys everyone else's work. The team tried operational transforms (OT), but their server-side implementation was buggy: cursor jumps, lost characters, ghost edits. Worse, the app does not work offline at all, so field teams in areas with spotty connectivity cannot use it and some of them leave.

## The Solution

Model each task as a Yjs document, a CRDT whose copies merge to the same result in any order, so there is nothing to transform on the server. **yjs** supplies the document types, **typescript** types the model, and **zod** validates everything that arrives from other clients. A Hocuspocus WebSocket server speaks the Yjs sync protocol, **postgresql** stores each document's state as the system of record, **redis** fans updates out between several collab servers, and **hono** serves the REST API that hands the browser a short-lived collab token.

## Step-by-Step Walkthrough

### Step 1: Model the task as a CRDT document

Pick the shared type by how the field is edited. Free text is `Y.Text`, which merges at character level. A checklist is the interesting case: an array indexed by position makes two users reordering or inserting at once fight over indexes, so key the items by id in a `Y.Map` and keep their position in an `order` number.

```typescript
import * as Y from 'yjs'
import { z } from 'zod'

// A task is one Y.Doc. Text fields are Y.Text (character-level merge); the checklist
// is a Y.Map keyed by item id, so no two clients ever fight over an array index.
export const title = (doc: Y.Doc) => doc.getText('title')
export const description = (doc: Y.Doc) => doc.getText('description')
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

// Awareness is untrusted input from other clients: validate before rendering it.
export const Presence = z.object({
  user: z.object({ id: z.string(), name: z.string(), color: z.string() }),
  field: z.enum(['title', 'description']).optional(),
})
```

Three choices here matter. `setDone` sets the value instead of toggling it, so two offline users who both tick a box agree on `true`, where two toggles would cancel out. `moveBetween` changes one number instead of deleting and re-inserting the item, so a concurrent move cannot duplicate or lose it. And the presence schema is checked with zod because awareness data comes from other browsers and must not be trusted when you render it.

A test with two documents made offline edits on both sides: both ticked the same item, both moved the same item, and both typed at the start of the title. After exchanging updates, the checklist was identical on both, the item appeared once, and the title was `v2 Release ` on both. Run the same test (with `Y.encodeStateAsUpdate` and `Y.applyUpdate`) in your own suite.

### Step 2: Run the collab server

Use a server that speaks the Yjs sync protocol, such as Hocuspocus, instead of relaying raw bytes yourself: the protocol has a handshake, awareness messages and read-only handling that a hand-written relay gets wrong. The server below checks the token and the user's membership of the task, makes viewers read-only, loads and saves state in PostgreSQL, and uses Redis to share updates with other collab server processes.

```typescript
import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { Redis as HocuspocusRedis } from '@hocuspocus/extension-redis'
import { jwtVerify } from 'jose'
import pg from 'pg'

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET)

new Server({
  address: '127.0.0.1',
  port: 1234,
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const { payload } = await jwtVerify(token, secret)
    const { rows } = await db.query(
      'SELECT role FROM task_members WHERE task_id = $1 AND user_id = $2',
      [documentName, payload.sub],
    )
    if (!rows[0]) throw new Error('not a member of this task')
    connectionConfig.readOnly = rows[0].role === 'viewer'
    return { user: { id: payload.sub, name: payload.name } }
  },
  extensions: [
    // Fan-out between several collab servers; Redis is not the system of record.
    new HocuspocusRedis({ host: '127.0.0.1', port: 6379 }),
    // Postgres is.
    new Database({
      fetch: async ({ documentName }) =>
        (await db.query('SELECT state FROM task_docs WHERE task_id = $1', [documentName]))
          .rows[0]?.state ?? null,
      store: async ({ documentName, state }) => {
        await db.query(
          `INSERT INTO task_docs (task_id, state, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (task_id) DO UPDATE SET state = $2, updated_at = now()`,
          [documentName, state],
        )
      },
    }),
  ],
}).listen()
```

The tables are `task_members(task_id, user_id, role)` and `task_docs(task_id PRIMARY KEY, state BYTEA, updated_at)`. Redis is only the message bus here. Do not make it the only copy of a document: a default Redis install can lose recent writes on restart. Start Redis bound to `127.0.0.1` (or on a private network with a password), and one collab server needs no Redis at all.

### Step 3: Issue collab tokens from the API

The REST API stays in Hono. The browser calls it with its normal session, receives a token that lives five minutes, and uses it to open the WebSocket. The collab server re-checks membership on connect, so the token only proves who the user is.

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { zValidator } from '@hono/zod-validator'
import { SignJWT } from 'jose'
import { z } from 'zod'

const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET)
const app = new Hono<{ Variables: { userId: string; userName: string } }>()

// Your session middleware sets userId / userName here.

// The browser asks for a short-lived collab token, then opens the WebSocket itself.
app.post('/tasks/:id/collab-token',
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

### Step 4: Offline-first client

Combine a local IndexedDB copy with the network provider. Edits are applied to the local document immediately and stored on disk; when the connection comes back, the provider exchanges updates with the server and both sides converge. There is no separate "offline mode" to code.

```typescript
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'

export async function openTask(taskId: string) {
  const { token } = await (await fetch(`/tasks/${taskId}/collab-token`, { method: 'POST' })).json()
  const ydoc = new Y.Doc()
  const local = new IndexeddbPersistence(taskId, ydoc)
  const provider = new HocuspocusProvider({
    url: 'wss://collab.example.com', name: taskId, document: ydoc, token,
  })
  provider.awareness?.setLocalStateField('user', { id: 'u1', name: 'Dana', color: '#e11d48' })
  const undo = new Y.UndoManager([ydoc.getText('description'), ydoc.getMap('checklist')])
  return { ydoc, provider, local, undo }
}
```

`Y.UndoManager` tracks only changes made by this client by default, so Undo never reverts a teammate's edit. Bind the text types to your editor with the matching Yjs binding (for example `y-codemirror.next`), and subscribe to `ydoc.getMap('checklist').observeDeep` to re-render the board. A token expires after five minutes, so request a fresh one before reconnecting after a long offline period.

## Real-World Example

A field-services company runs its inspection checklists on the board. Dana, on a rooftop with no signal, ticks four checklist items and adds two comments in the description. At the same moment the office coordinator reorders the list and fixes a typo in the title. When Dana's phone reconnects, both sets of changes merge: her four ticks are kept, the new order is kept, the typo fix is kept, and nobody sees a conflict dialog. The company's support tickets about "my changes disappeared" stop being about overwrites and go back to being about the occasional real bug.

## Limits to plan for

- A CRDT converges, but it does not know your business rules. Two people can both assign the same item to different owners; the last write wins on that field. If that matters, show who assigned it and let people change it.
- Deleted content is kept as tombstones until Yjs garbage collection compacts it, so test document size with your real edit volume before promising a limit.
- Concurrent editing of one string is merged at character level, which can interleave two people's words if they type at the same spot at the same time. Cursors and presence make this rare in practice.

## Related Skills

- [yjs](/skills/yjs) - shared types, awareness and the offline provider
- [typescript](/skills/typescript) - typed document helpers
- [zod](/skills/zod) - validation of awareness and request data
- [hono](/skills/hono) - REST API and collab token endpoint
- [postgresql](/skills/postgresql) - durable document state and membership
- [redis](/skills/redis) - fan-out between collab servers
