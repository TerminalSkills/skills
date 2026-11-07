---
title: Build a Collaborative Design Tool with Real-Time Sync
slug: build-collaborative-design-tool-with-realtime-sync
description: Build a multiplayer whiteboard with tldraw and its official @tldraw/sync server for the shared canvas and live cursors, Liveblocks Comments for threads on shapes, and Arcjet for rate limiting and bot protection.
skills:
  - tldraw
  - liveblocks
  - arcjet
category: development
tags:
- collaboration
- real-time
- whiteboard
- multiplayer
- tldraw
---

# Build a Collaborative Design Tool with Real-Time Sync

## The Problem

Dani runs a design agency where the team constantly shares mockups, diagrams, and brainstorm boards. Their current workflow (export a PNG, upload to Slack, get feedback as text messages) loses context with every handoff. She wants a shared whiteboard where everyone draws simultaneously, sees each other's cursors, can comment on a specific shape, and the board survives browser refreshes.

The challenge: many people editing one canvas at once without conflicts or data loss, and without writing a sync engine.

## The Solution

tldraw ships its own multiplayer layer, `@tldraw/sync`, with a server-side room (`TLSocketRoom`) that the SDK talks to directly. It syncs the canvas, shows live cursors and a presence menu out of the box, and persists to SQLite or Durable Objects. So the shared canvas does not need a hand-built Yjs bridge (there is no maintained `@tldraw/yjs` package). Liveblocks is used for what tldraw does not have, threaded comments on shapes, and Arcjet protects the board-creation endpoint.

```bash
npx terminal-skills install tldraw liveblocks arcjet
npm install tldraw @tldraw/sync @tldraw/sync-core ws
npm install @liveblocks/client @liveblocks/react @liveblocks/react-ui @liveblocks/node
npm install @arcjet/next
```

Requirements: Node.js 22.13+ (the server uses the built-in `node:sqlite`) and React 18.2+ or 19.2.1+. Production use of tldraw needs a license key (the `licenseKey` prop on `<Tldraw>`); development needs none.

## Step-by-Step Walkthrough

### Step 1: A signed token for each board

The sync server must not let anyone with a board URL in. The Next.js app signs a short-lived token after checking the user's session; the sync server verifies it with the same secret. Compare signatures in constant time.

```typescript
// src/lib/board-token.ts: shared by the Next.js app and the sync server
import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (payload: string) => createHmac("sha256", process.env.BOARD_TOKEN_SECRET!).update(payload).digest("base64url");

export function signBoardToken(userId: string, boardId: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ u: userId, b: boardId, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyBoardToken(token: string, boardId: string): { userId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const [expected, given] = [Buffer.from(sign(payload)), Buffer.from(sig)];
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const { u, b, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
  return b === boardId && exp > Date.now() / 1000 ? { userId: u } : null;
}
```

### Step 2: The sync server

One `TLSocketRoom` per board, stored in a SQLite file. When the last person leaves, the room is closed and freed. The board ID is restricted to `[a-z0-9-]` before it is used in a file name.

```typescript
// server/rooms.ts
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from "@tldraw/sync-core";

const DIR = "./.rooms";
mkdirSync(DIR, { recursive: true });

const rooms = new Map<string, TLSocketRoom<any, void>>();

export function makeOrLoadRoom(boardId: string): TLSocketRoom<any, void> {
  const existing = rooms.get(boardId);
  if (existing && !existing.isClosed()) return existing;
  const db = new DatabaseSync(join(DIR, `${boardId}.db`));
  const room = new TLSocketRoom({
    storage: new SQLiteSyncStorage({ sql: new NodeSqliteWrapper(db) }),
    onSessionRemoved(room, { numSessionsRemaining }) {
      if (numSessionsRemaining > 0) return;   // last person left: free the room
      room.close();
      db.close();
      rooms.delete(boardId);
    },
  });
  rooms.set(boardId, room);
  return room;
}
```

The HTTP server upgrades only authenticated WebSocket requests and also serves image and video uploads (tldraw requires you to say where assets are stored). It listens on loopback; put a TLS-terminating reverse proxy in front for `wss://`.

```typescript
// server/sync-server.ts
//   ws://127.0.0.1:5858/connect/<boardId>?sessionId=…&token=…   multiplayer sync
//   PUT/GET /uploads/<boardId>/<file>                             images and videos
import { createServer } from "node:http";
import { createWriteStream, createReadStream, mkdirSync, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { WebSocketServer } from "ws";
import { verifyBoardToken } from "../lib/board-token";
import { makeOrLoadRoom } from "./rooms";

const MAX_UPLOAD = 10 * 1024 * 1024, UPLOADS = "./.uploads";
mkdirSync(UPLOADS, { recursive: true });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = url.pathname.match(/^\/uploads\/([a-z0-9-]+)\/([A-Za-z0-9.-]{1,120})$/);
  if (!m || m[2].startsWith(".")) return void res.writeHead(404).end();
  const [, boardId, name] = m;
  const file = `${UPLOADS}/${boardId}-${name}`;

  if (req.method === "PUT") {
    const token = url.searchParams.get("token");
    if (!token || !verifyBoardToken(token, boardId)) return void res.writeHead(401).end();
    if (Number(req.headers["content-length"] ?? 0) > MAX_UPLOAD) return void res.writeHead(413).end();
    await pipeline(req, createWriteStream(file, { flags: "wx" }));   // never overwrite
    return void res.writeHead(201).end();
  }
  if (req.method === "GET" && existsSync(file)) {   // CSP: uploaded SVGs must not run script on our origin
    res.writeHead(200, { "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" });
    return void createReadStream(file).pipe(res);
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/connect\/([a-z0-9-]+)$/);
  const [sessionId, token] = [url.searchParams.get("sessionId"), url.searchParams.get("token")];
  // Reject before the upgrade completes: no valid token, no socket
  if (!match || !sessionId || !token || !verifyBoardToken(token, match[1])) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    makeOrLoadRoom(match[1]).handleSocketConnect({ sessionId, socket: ws });
  });
});

server.listen(Number(process.env.PORT ?? 5858), "127.0.0.1");
```

Run it with `BOARD_TOKEN_SECRET=… npx tsx server/sync-server.ts` (Node prints an experimental-feature warning for `node:sqlite`).

### Step 3: The canvas

`useSync` returns a store that `<Tldraw>` understands. It handles loading and connection state, and multiplayer UX (cursors, the presence menu, following another user) is built in, so there is no cursor component to write. The name and colour other people see come from the user's tldraw preferences, which we set on mount.

```tsx
// src/components/DesignBoard.tsx
import { useMemo } from "react";
import { Tldraw, TLAssetStore, uniqueId } from "tldraw";
import { useSync } from "@tldraw/sync";
import "tldraw/tldraw.css";
import { BoardComments } from "./BoardComments";

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL!;             // e.g. wss://sync.example.com
const SYNC_HTTP_URL = process.env.NEXT_PUBLIC_SYNC_HTTP_URL!;   // e.g. https://sync.example.com

export function DesignBoard({ boardId, token, userName, userColor }: {
  boardId: string; token: string; userName: string; userColor: string;
}) {
  const assets = useMemo<TLAssetStore>(() => ({
    async upload(_asset, file) {
      const name = `${uniqueId()}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, "-");
      const url = `${SYNC_HTTP_URL}/uploads/${boardId}/${name}`;
      const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { method: "PUT", body: file });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      return { src: url };
    },
    resolve: (asset) => asset.props.src,
  }), [boardId, token]);

  const components = useMemo(() => ({ InFrontOfTheCanvas: () => <BoardComments boardId={boardId} /> }), [boardId]);
  const store = useSync({
    uri: `${SYNC_URL}/connect/${boardId}?token=${encodeURIComponent(token)}`,
    assets,
  });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        store={store}
        components={components}
        onMount={(editor) => {
          editor.user.updateUserPreferences({ name: userName, color: userColor });   // shown on your cursor
        }}
      />
    </div>
  );
}
```

Two people dragging the same shape converge to the same result: the server room is the authority and applies changes in the order it receives them. If a client goes offline, `useSync` reconnects and resynchronises when the connection returns.

### Step 4: Comment threads on shapes

tldraw has no commenting, so Liveblocks Comments fills the gap. The room ID `board-<id>` is separate from the sync room; Liveblocks stores only the threads, with the shape ID as thread metadata. The `authEndpoint` is the route from the `liveblocks` skill (`prepareSession`, then `allow(room, FULL_ACCESS)`), which should check that the user may open that board.

```tsx
// src/components/BoardComments.tsx: threads for the selected shape
import { useEditor, useValue } from "tldraw";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider, useThreads } from "@liveblocks/react/suspense";
import { Composer, Thread } from "@liveblocks/react-ui";
import "@liveblocks/react-ui/styles.css";

declare global {
  interface Liveblocks {
    ThreadMetadata: { shapeId: string };
  }
}

function ShapeThreads({ shapeId }: { shapeId: string }) {
  const { threads } = useThreads({ query: { metadata: { shapeId } } });
  return (
    <>{threads.map((t) => <Thread key={t.id} thread={t} />)}<Composer metadata={{ shapeId }} /></>
  );
}

// Rendered inside <Tldraw>, because it needs useEditor
export function BoardComments({ boardId }: { boardId: string }) {
  const editor = useEditor();
  const shapeId = useValue("selected shape", () => editor.getOnlySelectedShapeId(), [editor]);

  return (
    <aside style={{ position: "absolute", top: 60, right: 8, width: 320, zIndex: 300 }}>
      {shapeId ? (
        <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
          <RoomProvider id={`board-${boardId}`}>
            <ClientSideSuspense fallback={null}><ShapeThreads shapeId={shapeId} /></ClientSideSuspense>
          </RoomProvider>
        </LiveblocksProvider>
      ) : null}
    </aside>
  );
}
```

### Step 5: Protect board creation

Arcjet guards the endpoint that creates boards, so bots cannot create thousands of them. A token bucket needs the cost of each request: `protect(request, { requested: 1 })`.

```typescript
// app/api/boards/route.ts
import arcjet, { detectBot, shield, tokenBucket } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({ mode: "LIVE", allow: [] }),   // an API route has no use for crawlers
    tokenBucket({ mode: "LIVE", refillRate: 5, interval: 60, capacity: 10 }),
  ],
});

export async function POST(request: NextRequest) {
  const decision = await aj.protect(request, { requested: 1 });   // each board costs one token

  if (decision.isDenied()) {
    const limited = decision.reason.isRateLimit();
    return NextResponse.json({ error: limited ? "Too many boards created." : "Request blocked." }, { status: limited ? 429 : 403 });
  }

  // Check the session, create the board row, then return a token for the sync server:
  //   signBoardToken(session.user.id, board.slug)
  return NextResponse.json({ ok: true });
}
```

Start the rules in `DRY_RUN` and read the decisions in the Arcjet dashboard before switching to `LIVE`. Arcjet protects the HTTP endpoint; the WebSocket server is protected by the signed token from Step 1.

## Real-World Example

Dani's team replaces its export-and-upload loop with the board. Design reviews happen on the canvas: designers draw and annotate together, and open a comment thread on the shape that needs a decision instead of pasting a screenshot into Slack. The review that used to take an afternoon of back-and-forth (the team's own estimate was about four hours from export to re-export) now happens in one call.

Each board lives in its own SQLite file, so a refresh or a sync-server restart loses nothing. A buggy integration script that tried to create boards in a loop hit the Arcjet token bucket and received 429 responses instead of filling the database.

## Related Skills

- [tldraw](../skills/tldraw/) -- the infinite canvas, plus `@tldraw/sync` for multiplayer (this page replaces the old custom Yjs bridge with it)
- [liveblocks](../skills/liveblocks/) -- Comments threads on selected shapes and the auth route for the comment room
- [arcjet](../skills/arcjet/) -- shield, bot detection and a token-bucket limit on board creation
