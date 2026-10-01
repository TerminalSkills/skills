---
name: yjs
description: >-
  Yjs is a high-performance CRDT (Conflict-free Replicated Data Type) framework
  for building collaborative applications: shared types whose concurrent edits
  merge automatically. Use when a user asks to add real-time collaborative
  editing, shared cursors and presence, offline-first sync, or peer-to-peer
  collaboration to an app, to run or secure a y-websocket server, to persist
  Yjs documents, or to make a Tiptap or ProseMirror editor collaborative.
license: Apache-2.0
compatibility: "Yjs 13.x (14 is still in pre-release). Runs in browsers and Node.js; y-websocket 3 client, @y/websocket-server for the server, Tiptap 3 for the editor example"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
  - crdt
  - real-time
  - collaboration
  - text-editing
  - offline-first
  repository: https://github.com/yjs/yjs
---

# Yjs — CRDT Framework for Collaborative Editing

## Overview

Yjs is a CRDT framework for collaborative applications. Data lives in shared types (`Y.Text`, `Y.Map`, `Y.Array`, `Y.XmlFragment`) inside a `Y.Doc`; every client edits its own copy and the copies converge without a central authority deciding conflicts. Providers move the updates around: `y-websocket` through a server, `y-webrtc` peer to peer, `y-indexeddb` to the browser's disk for offline work.

## Instructions

### Install

```bash
npm install yjs                    # core library (13.x)
npm install y-websocket            # WebSocket client provider (3.x)
npm install y-indexeddb            # browser offline persistence
npm install y-webrtc               # peer-to-peer sync, needs a signaling server
# Server (it left the y-websocket package in v3)
npm install @y/websocket-server@0.1.1 ws
npm install y-mongodb-provider     # MongoDB persistence (community package); y-leveldb for LevelDB
# Tiptap 3 editor binding
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/extension-collaboration-caret @tiptap/y-tiptap
```

The current `@y/websocket-server` (0.1.5) depends on the Yjs 14 pre-release. Loaded next to Yjs 13 it prints "Yjs was already imported" and persistence code fails, so stay on 0.1.1, the last release with a Yjs 13 peer dependency, while the app uses Yjs 13.

### Document and Shared Types

Create collaborative data structures that merge automatically:

```typescript
// src/collaboration/document.ts — Set up a collaborative document with shared types
import * as Y from "yjs";

// A Y.Doc is the top-level container; every connected client holds a copy
const doc = new Y.Doc();
// Y.Text — collaborative text (rich text via yText.format and deltas)
const yText = doc.getText("document-content");
yText.insert(0, "Hello, ");
yText.insert(7, "world!"); // "Hello, world!" — concurrent inserts are both kept

// Y.Map — collaborative key-value store
const yMap = doc.getMap("settings");
yMap.set("theme", "dark");
// Different keys set concurrently: both applied. Same key: one write wins on every client.

// Y.Array — collaborative ordered list
const yArray = doc.getArray("tasks");
yArray.push([{ id: "1", title: "Design mockup", done: false }]);

// Y.XmlFragment — XML tree used by editor bindings (Tiptap, ProseMirror)
const yXml = doc.getXmlFragment("rich-content");
// Shared types nest: a map inside a map
const project = new Y.Map();
project.set("status", "active");
yMap.set("project", project);

// Group changes into one update; the second argument is the transaction origin
doc.transact(() => {
  yMap.set("fontSize", 14);
  yMap.set("lineHeight", 1.5);
}, "settings-form");

// React to changes
yMap.observe((event) => console.log("keys changed:", [...event.keysChanged]));
// Undo/redo for one user: undoManager.undo() reverts only local edits to yText
const undoManager = new Y.UndoManager(yText);
```

### WebSocket Provider

Connect clients through a WebSocket server for real-time sync:

```typescript
// src/collaboration/provider.ts — WebSocket-based real-time sync
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();
// All clients that join the same room on the same server sync automatically
const provider = new WebsocketProvider("ws://localhost:1234", "handbook-onboarding", doc, {
  params: { token: sessionToken }, // your app's session token, sent as ?token=... on every (re)connect
});

// Awareness — presence data (cursors, selections, user info); never persisted
const awareness = provider.awareness;
awareness.setLocalStateField("user", { name: "Alice", color: "#ff5733" });
awareness.on("change", () => {
  awareness.getStates().forEach((state, clientId) => {
    if (clientId !== doc.clientID) console.log(`${state.user?.name} is here`);
  });
});

provider.on("status", ({ status }) => console.log(status)); // "connecting" | "connected" | "disconnected"
provider.on("sync", (isSynced: boolean) => isSynced && console.log("Synced with server"));
// Fired when the server closed the connection with a 4400–4499 code: no more reconnects
provider.on("closed", ({ code, reason }) => console.log(`Rejected: ${code} ${reason}`));
```

Node.js 22 and later have a global `WebSocket`; on older versions pass `WebSocketPolyfill: require("ws")` in the options.

### Server-Side Setup

For development, `HOST=localhost PORT=1234 npx y-websocket` (from `@y/websocket-server`) starts an in-memory server; with 0.1.1 and `y-leveldb` installed, `YPERSISTENCE=./yjs-data` makes it persist to LevelDB. For a database of your choice, write the server yourself:

```javascript
// server/yjs-server.mjs — WebSocket server with MongoDB persistence
import http from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { setupWSConnection, setPersistence } from "@y/websocket-server/utils";
import { MongodbPersistence } from "y-mongodb-provider";

const mdb = new MongodbPersistence(process.env.MONGODB_URL, {
  collectionName: "yjs-documents",
  flushSize: 100, // merge stored updates into one record after 100 of them
});
setPersistence({
  provider: mdb,
  bindState: async (docName, ydoc) => {
    // Called once when the first client opens a document: load it, then store every update
    const persisted = await mdb.getYDoc(docName);
    await mdb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
    ydoc.on("update", (update) => mdb.storeUpdate(docName, update));
  },
  // Called when the last client disconnects
  writeState: async (docName) => { await mdb.flushDocument(docName); },
});

const server = http.createServer((_req, res) => { res.writeHead(200); res.end("okay"); });
const wss = new WebSocketServer({ server });
wss.on("connection", setupWSConnection); // room name = URL path
server.listen(Number(process.env.PORT ?? 1234), process.env.HOST ?? "127.0.0.1");
```

### Editor Integration (Tiptap)

Add collaborative editing to a Tiptap 3 rich text editor:

```tsx
// src/components/CollaborativeEditor.tsx — Tiptap with Yjs collaboration
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

type Collab = { doc: Y.Doc; provider: WebsocketProvider };
interface Props { documentId: string; userName: string; userColor: string }

export function CollaborativeEditor({ documentId, userName, userColor }: Props) {
  const [collab, setCollab] = useState<Collab | null>(null);
  // Create and destroy doc and provider in the same effect (safe under StrictMode)
  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider("ws://localhost:1234", documentId, doc);
    setCollab({ doc, provider });
    return () => { provider.destroy(); doc.destroy(); };
  }, [documentId]);
  return collab ? <Editor collab={collab} user={{ name: userName, color: userColor }} /> : null;
}

function Editor({ collab, user }: { collab: Collab; user: { name: string; color: string } }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Collaboration brings its own undo/redo
      Collaboration.configure({ document: collab.doc }),
      CollaborationCaret.configure({ provider: collab.provider, user }), // carets via awareness
    ],
  });
  return <EditorContent editor={editor} />;
}
```

Tiptap 2 used `@tiptap/extension-collaboration-cursor` (`CollaborationCursor`) and `StarterKit.configure({ history: false })`; both were renamed in v3.

### Offline Support and Sync

Handle offline editing with automatic merge on reconnect:

```typescript
// src/collaboration/offline.ts — IndexedDB persistence for offline support
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();
// Saves the document in the browser; use the room name as the database name
const indexedDb = new IndexeddbPersistence("handbook-onboarding", doc);
indexedDb.on("synced", () => console.log("Local data loaded from IndexedDB"));
// Syncs with other clients when online. Offline edits stay in IndexedDB and merge on reconnect
const wsProvider = new WebsocketProvider("ws://localhost:1234", "handbook-onboarding", doc);

// origin tells where an update came from: null for local edits (or the value passed to
// doc.transact), the provider instance for updates it applied
doc.on("update", (update: Uint8Array, origin: unknown) => {
  console.log(origin === wsProvider ? "Remote change received" : "Local change");
});
```

## Examples

### Example 1: Merge two copies that were edited offline

**User request:** "Two devices changed the same task list while offline. Show me that Yjs merges them and how little has to be sent."

```javascript
// merge.mjs
import * as Y from "yjs";
const laptop = new Y.Doc();
const phone = new Y.Doc();
laptop.getArray("tasks").push([{ id: "t1", title: "Design mockup" }]);
Y.applyUpdate(phone, Y.encodeStateAsUpdate(laptop)); // both start from the same state
// Offline: each device edits its own copy
laptop.getArray("tasks").push([{ id: "t2", title: "Implement API" }]);
phone.getArray("tasks").insert(0, [{ id: "t3", title: "Write tests" }]);
// Back online: each side sends only what the other is missing
const forPhone = Y.encodeStateAsUpdate(laptop, Y.encodeStateVector(phone));
const forLaptop = Y.encodeStateAsUpdate(phone, Y.encodeStateVector(laptop));
Y.applyUpdate(phone, forPhone);
Y.applyUpdate(laptop, forLaptop);
console.log(laptop.getArray("tasks").toJSON().map((t) => t.id));
console.log(phone.getArray("tasks").toJSON().map((t) => t.id));
console.log(forPhone.byteLength, "bytes sent to the phone");
```

`node merge.mjs` prints the same order on both devices (the byte count varies by a byte or two between runs, because client IDs are random):

```
[ 't3', 't1', 't2' ]
[ 't3', 't1', 't2' ]
47 bytes sent to the phone
```

### Example 2: Reject clients whose token is no longer valid

**User request:** "Users with an expired session keep reconnecting to our collaboration server every few seconds. Make the server turn them away for good."

Refusing the HTTP upgrade with 401 does not help: browsers hide that status, the provider sees close code 1006 and retries. Accept the socket, then close it with a code in the 4400–4499 range, which y-websocket 3.1 treats as permanent:

```javascript
// server/auth-server.mjs
import http from "node:http";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "@y/websocket-server/utils";

const server = http.createServer((_req, res) => { res.writeHead(200); res.end("okay"); });
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    if (token !== process.env.COLLAB_TOKEN) return ws.close(4401, "invalid token");
    setupWSConnection(ws, req);
  });
});
server.listen(1234, "127.0.0.1");
```

A client with a wrong token logs, through the `closed` handler shown above, `Rejected: 4401 invalid token` and stops reconnecting. After refreshing the session, set `provider.params = { token: newToken }` and call `provider.connect()`. Replace the string comparison with real token verification (JWT signature, session lookup).

## Guidelines

1. **Choose the right shared type** — Y.Text for documents, Y.Map for settings/state, Y.Array for lists; don't force everything into one type
2. **Keep documents small** — a Y.Doc is loaded and synced as a whole; split independent content into separate documents (one room each) or subdocuments
3. **Use awareness for ephemeral data** — Cursors, selections, and typing indicators belong in awareness, not document state
4. **Add offline persistence in the browser** — y-indexeddb keeps unsynced edits across reloads and disconnects; it's one line of code
5. **Authenticate on the server** — check the token before calling `setupWSConnection`; the room name comes from the URL, so also check that this user may open that document
6. **Batch changes** — Use `doc.transact()` to group multiple changes into one update event
7. **Garbage collection is on by default** — deleted content is compacted; create the doc with `new Y.Doc({ gc: false })` only if you need snapshots or version history
8. **One copy of Yjs** — two versions in one bundle or process break `instanceof` checks ("Yjs was already imported"); check with `npm ls yjs`
9. **`@y/websocket-server` is a starting point** — it keeps documents in memory in one process and does not scale horizontally; the y-websocket README lists Hocuspocus, y-redis and y-sweet as compatible backends
10. **Use `wss://` in production** — tokens in the query string and document updates travel in clear text over `ws://`
11. **Test concurrent edits** — Open multiple browser tabs and edit simultaneously; verify merge behavior
