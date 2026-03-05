---
name: yjs
description: Expert guidance for Yjs, the high-performance CRDT (Conflict-free Replicated Data Type) framework for building collaborative applications. Helps developers implement real-time document editing, offline-first sync, and peer-to-peer collaboration with automatic conflict resolution.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - crdt
  - real-time
  - collaboration
  - text-editing
  - offline-first
---

# Yjs — CRDT Framework for Collaborative Editing


## Overview


Yjs, the high-performance CRDT (Conflict-free Replicated Data Type) framework for building collaborative applications. Helps developers implement real-time document editing, offline-first sync, and peer-to-peer collaboration with automatic conflict resolution.


## Instructions

### Document and Shared Types

Create collaborative data structures that merge automatically:

```typescript
// src/collaboration/document.ts — Set up a collaborative document with shared types
import * as Y from "yjs";

// A Y.Doc is the top-level container for all shared data
// Every connected client gets a copy that stays in sync
const doc = new Y.Doc();

// Y.Text — collaborative rich text (used with editors like Tiptap, ProseMirror)
const yText = doc.getText("document-content");
yText.insert(0, "Hello, ");
yText.insert(7, "world!");
// Result: "Hello, world!" — inserts merge correctly even if concurrent

// Y.Map — collaborative key-value store (like a shared object)
const yMap = doc.getMap("settings");
yMap.set("theme", "dark");
yMap.set("fontSize", 14);
// Two users setting different keys: both applied
// Two users setting the same key: last-write-wins (deterministic)

// Y.Array — collaborative ordered list
const yArray = doc.getArray("tasks");
yArray.push([{ id: "1", title: "Design mockup", done: false }]);
yArray.push([{ id: "2", title: "Implement API", done: false }]);
// Concurrent inserts at different positions: both preserved in correct order

// Y.XmlFragment — collaborative XML tree (for rich text editors)
const yXml = doc.getXmlFragment("rich-content");
// Used internally by editor bindings (Tiptap, ProseMirror, Slate)

// Nested structures — Y types can be nested arbitrarily
const yNestedMap = new Y.Map();
yNestedMap.set("status", "active");
yMap.set("project", yNestedMap);  // Map inside a map
```

### WebSocket Provider

Connect clients through a WebSocket server for real-time sync:

```typescript
// src/collaboration/provider.ts — WebSocket-based real-time sync
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();

// Connect to a y-websocket server
// All clients in the same room sync automatically
const provider = new WebsocketProvider(
  "wss://your-yjs-server.example.com",  // WebSocket server URL
  "document-room-123",                   // Room name — clients in same room sync
  doc,
  {
    connect: true,                        // Auto-connect on creation
    params: { token: "auth-token-here" }, // Auth params sent on connect
  }
);

// Awareness — lightweight presence data (cursors, selections, user info)
// Unlike document state, awareness is ephemeral (not persisted)
const awareness = provider.awareness;

awareness.setLocalStateField("user", {
  name: "Alice",
  color: "#ff5733",
  cursor: null,
});

// Listen to other users' awareness changes
awareness.on("change", () => {
  const states = awareness.getStates();  // Map<clientId, state>
  states.forEach((state, clientId) => {
    if (clientId !== doc.clientID) {
      console.log(`User ${state.user?.name} is connected`);
    }
  });
});

// Connection status
provider.on("status", ({ status }: { status: string }) => {
  console.log(`Connection: ${status}`);  // "connecting" | "connected" | "disconnected"
});

// Sync status — fires when initial sync with server is complete
provider.on("sync", (isSynced: boolean) => {
  if (isSynced) console.log("Document fully synced with server");
});
```

### Server-Side Setup

Run a y-websocket server for document persistence:

```typescript
// server/yjs-server.ts — WebSocket server with persistence
import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import * as Y from "yjs";
import { MongodbPersistence } from "y-mongodb-provider";

const wss = new WebSocketServer({ port: 1234 });

// Persist documents to MongoDB (survives server restarts)
const mdb = new MongodbPersistence(process.env.MONGODB_URL!, {
  collectionName: "yjs-documents",
  flushSize: 100,          // Batch 100 updates before flushing to DB
  multipleCollections: true, // Separate collection per document for performance
});

setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    // Load existing document state from MongoDB
    const persistedDoc = await mdb.getYDoc(docName);
    const persistedState = Y.encodeStateAsUpdate(persistedDoc);
    Y.applyUpdate(ydoc, persistedState);

    // Save updates as they happen
    ydoc.on("update", (update: Uint8Array) => {
      mdb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName: string, ydoc: Y.Doc) => {
    // Called when all clients disconnect — final persistence
    await mdb.flushDocument(docName);
  },
});

wss.on("connection", (ws, req) => {
  // Authenticate the connection
  const token = new URL(req.url!, "http://localhost").searchParams.get("token");
  if (!verifyToken(token)) {
    ws.close(4001, "Unauthorized");
    return;
  }

  setupWSConnection(ws, req);
});

console.log("Yjs WebSocket server running on port 1234");
```

### Editor Integration (Tiptap)

Add collaborative editing to a Tiptap rich text editor:

```tsx
// src/components/CollaborativeEditor.tsx — Tiptap with Yjs collaboration
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

interface Props {
  documentId: string;
  userName: string;
  userColor: string;
}

export function CollaborativeEditor({ documentId, userName, userColor }: Props) {
  const doc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(
    () => new WebsocketProvider("wss://yjs.example.com", documentId, doc),
    [doc, documentId]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,    // Disable default history — Yjs handles undo/redo
      }),
      Collaboration.configure({
        document: doc,     // Bind editor content to Yjs document
      }),
      CollaborationCursor.configure({
        provider,          // Share cursor positions via awareness
        user: { name: userName, color: userColor },
      }),
    ],
  });

  // Clean up on unmount
  useEffect(() => {
    return () => {
      provider.destroy();
      doc.destroy();
    };
  }, [doc, provider]);

  return (
    <div className="editor-container">
      <EditorContent editor={editor} />
      <ConnectionStatus provider={provider} />
    </div>
  );
}

function ConnectionStatus({ provider }: { provider: WebsocketProvider }) {
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const handler = ({ status }: { status: string }) => setStatus(status);
    provider.on("status", handler);
    return () => provider.off("status", handler);
  }, [provider]);

  return (
    <div className={`status-badge ${status}`}>
      {status === "connected" ? "🟢 Connected" : "🔴 Reconnecting..."}
    </div>
  );
}
```

### Offline Support and Sync

Handle offline editing with automatic merge on reconnect:

```typescript
// src/collaboration/offline.ts — IndexedDB persistence for offline support
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();

// IndexedDB provider — saves document locally in the browser
// Changes made offline are preserved and synced when reconnected
const indexedDb = new IndexeddbPersistence("my-app-docs", doc);

indexedDb.on("synced", () => {
  console.log("Local data loaded from IndexedDB");
});

// WebSocket provider — syncs with other clients when online
const wsProvider = new WebsocketProvider("wss://yjs.example.com", "doc-123", doc);

// The two providers work together:
// 1. Online: changes sync via WebSocket AND save to IndexedDB
// 2. Offline: changes save to IndexedDB only
// 3. Reconnect: IndexedDB state syncs with server, merging all changes

// Observe document changes (from any source: local, remote, or loaded from DB)
doc.on("update", (update: Uint8Array, origin: any) => {
  if (origin === "local") {
    console.log("Local change");
  } else {
    console.log("Remote change received");
  }
});
```

## Installation

```bash
# Core library
npm install yjs

# Providers (pick what you need)
npm install y-websocket          # WebSocket sync
npm install y-indexeddb           # Browser offline persistence
npm install y-webrtc              # Peer-to-peer sync (no server)

# Editor bindings
npm install @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor

# Server persistence
npm install y-mongodb-provider    # MongoDB
npm install y-leveldb             # LevelDB (lightweight)
```


## Examples


### Example 1: Setting up Yjs with a custom configuration

**User request:**

```
I just installed Yjs. Help me configure it for my TypeScript + React workflow with my preferred keybindings.
```

The agent creates the configuration file with TypeScript-aware settings, configures relevant plugins/extensions for React development, sets up keyboard shortcuts matching the user's preferences, and verifies the setup works correctly.

### Example 2: Extending Yjs with custom functionality

**User request:**

```
I want to add a custom websocket provider to Yjs. How do I build one?
```

The agent scaffolds the extension/plugin project, implements the core functionality following Yjs's API patterns, adds configuration options, and provides testing instructions to verify it works end-to-end.


## Guidelines

1. **Choose the right shared type** — Y.Text for documents, Y.Map for settings/state, Y.Array for lists; don't force everything into one type
2. **Keep documents small** — Large Y.Docs (>10MB) impact performance; split content into multiple documents
3. **Use awareness for ephemeral data** — Cursors, selections, and typing indicators belong in awareness, not document state
4. **Always add offline persistence** — y-indexeddb prevents data loss on disconnect; it's one line of code
5. **Authenticate at the provider level** — Validate tokens in the WebSocket server before allowing sync
6. **Batch observations** — Use `doc.transact()` to group multiple changes into one update event
7. **Garbage collect** — Call `doc.gc = true` to enable garbage collection of deleted content
8. **Test concurrent edits** — Open multiple browser tabs and edit simultaneously; verify merge behavior
