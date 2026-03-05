---
title: Build a Collaborative Design Tool with Real-Time Sync
slug: build-collaborative-design-tool-with-realtime-sync
description: Build a multiplayer whiteboard application using Liveblocks for presence and cursors, Yjs for conflict-free document sync, tldraw for the infinite canvas, and Arcjet for rate limiting and bot protection.
skills: [liveblocks, yjs, tldraw, arcjet]
category: Real-Time & Collaboration
tags: [collaboration, real-time, whiteboard, multiplayer, crdt, canvas]
---

# Build a Collaborative Design Tool with Real-Time Sync

Dani runs a design agency where the team constantly shares mockups, diagrams, and brainstorm boards. Their current workflow — export a PNG, upload to Slack, get feedback as text messages — loses context with every handoff. She wants a shared whiteboard where everyone draws simultaneously, sees each other's cursors, and the board survives browser refreshes.

The technical challenge: multiple people editing the same canvas at the same time without conflicts, data loss, or a loading spinner every time someone moves a shape.

## Step 1: Set Up the Infinite Canvas

The canvas is the core of the experience. tldraw provides a production-ready infinite canvas with drawing tools, shapes, and zoom — the same engine behind tldraw.com, which handles millions of users.

```tsx
// src/components/DesignBoard.tsx — The main canvas component
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import { useYjsStore } from "./useYjsStore";
import { LiveCursors } from "./LiveCursors";
import "tldraw/tldraw.css";

interface Props {
  boardId: string;
  userName: string;
  userColor: string;
}

export function DesignBoard({ boardId, userName, userColor }: Props) {
  // Connect the tldraw store to Yjs for CRDT-based sync
  // Every shape, arrow, and text element syncs across all connected clients
  const store = useYjsStore({
    roomId: boardId,
    shapeUtils: defaultShapeUtils,
  });

  if (!store) return <div className="loading">Connecting to board...</div>;

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        store={store}
        components={{
          // Inject live cursors from other users into the canvas
          InFrontOfTheCanvas: () => <LiveCursors boardId={boardId} />,
        }}
      />
    </div>
  );
}
```

## Step 2: Wire Up CRDT Sync with Yjs

Yjs handles the hard part — conflict resolution. When two designers move the same shape simultaneously, Yjs merges both changes without losing either one. The CRDT algorithm guarantees that all clients converge to the same state, regardless of network delays or ordering.

```typescript
// src/hooks/useYjsStore.ts — Bridge between tldraw and Yjs
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useEffect, useMemo, useState } from "react";
import { createTLStore, TLRecord, TLStoreWithStatus } from "tldraw";

export function useYjsStore({ roomId, shapeUtils }: {
  roomId: string;
  shapeUtils: any[];
}): TLStoreWithStatus | null {
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus | null>(null);

  // Yjs document — the single source of truth for the canvas
  const doc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    const yStore = doc.getMap<TLRecord>("tldraw");
    const tldrawStore = createTLStore({ shapeUtils });

    // IndexedDB — saves the document locally for offline support
    // If the user's browser goes offline, they can keep drawing
    // Changes merge automatically when they reconnect
    const indexedDb = new IndexeddbPersistence(`board-${roomId}`, doc);

    // WebSocket — syncs with the server and other clients in real time
    const wsProvider = new WebsocketProvider(
      process.env.NEXT_PUBLIC_YJS_WS_URL!,
      roomId,
      doc,
      { connect: true }
    );

    // Sync Yjs → tldraw: when remote changes arrive, update the canvas
    const observer = (events: Y.YMapEvent<TLRecord>) => {
      const toAdd: TLRecord[] = [];
      const toUpdate: TLRecord[] = [];
      const toRemove: TLRecord["id"][] = [];

      events.changes.keys.forEach((change, key) => {
        switch (change.action) {
          case "add":
          case "update":
            const record = yStore.get(key);
            if (record) {
              change.action === "add" ? toAdd.push(record) : toUpdate.push(record);
            }
            break;
          case "delete":
            toRemove.push(key as TLRecord["id"]);
            break;
        }
      });

      tldrawStore.mergeRemoteChanges(() => {
        if (toAdd.length) tldrawStore.put(toAdd);
        if (toUpdate.length) tldrawStore.put(toUpdate);
        if (toRemove.length) tldrawStore.remove(toRemove);
      });
    };

    yStore.observe(observer);

    // Sync tldraw → Yjs: when the user draws, push changes to Yjs
    const unsubscribe = tldrawStore.listen(
      ({ changes }) => {
        doc.transact(() => {
          Object.values(changes.added).forEach((record) => yStore.set(record.id, record));
          Object.values(changes.updated).forEach(([, record]) => yStore.set(record.id, record));
          Object.values(changes.removed).forEach((record) => yStore.delete(record.id));
        });
      },
      { source: "user", scope: "document" }
    );

    setStoreWithStatus({
      status: "synced-remote",
      store: tldrawStore,
      connectionStatus: "online",
    });

    // Update connection status
    wsProvider.on("status", ({ status }: { status: string }) => {
      setStoreWithStatus((prev) =>
        prev ? { ...prev, connectionStatus: status === "connected" ? "online" : "offline" } : null
      );
    });

    return () => {
      yStore.unobserve(observer);
      unsubscribe();
      wsProvider.destroy();
      indexedDb.destroy();
      doc.destroy();
    };
  }, [doc, roomId, shapeUtils]);

  return storeWithStatus;
}
```

## Step 3: Add Live Cursors and Presence

Seeing where teammates are working is essential for collaboration. Liveblocks' presence system shows cursor positions, user names, and what each person has selected — all updating in under 50ms.

```tsx
// src/components/LiveCursors.tsx — Show other users' cursors on the canvas
import { RoomProvider, useOthers, useMyPresence } from "../liveblocks.config";
import { useCallback, useEffect } from "react";

export function LiveCursorsProvider({ boardId, children }: {
  boardId: string;
  children: React.ReactNode;
}) {
  return (
    <RoomProvider
      id={`board-${boardId}`}
      initialPresence={{ cursor: null, selectedShape: null, name: "", color: "" }}
    >
      {children}
    </RoomProvider>
  );
}

export function LiveCursors({ boardId }: { boardId: string }) {
  const others = useOthers();
  const [, updatePresence] = useMyPresence();

  // Broadcast cursor position on mouse move
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      updatePresence({
        cursor: { x: e.clientX, y: e.clientY },
      });
    },
    [updatePresence]
  );

  const handlePointerLeave = useCallback(() => {
    updatePresence({ cursor: null });
  }, [updatePresence]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [handlePointerMove, handlePointerLeave]);

  return (
    <>
      {others.map(({ connectionId, presence }) => {
        if (!presence.cursor) return null;
        return (
          <div
            key={connectionId}
            style={{
              position: "absolute",
              left: presence.cursor.x,
              top: presence.cursor.y,
              pointerEvents: "none",
              zIndex: 9999,
              transition: "left 0.05s, top 0.05s",   // Smooth interpolation
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill={presence.color}>
              <path d="M3 1l12 7-5 2-2 5z" />
            </svg>
            <span style={{
              backgroundColor: presence.color,
              color: "white",
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "11px",
              marginLeft: "4px",
              whiteSpace: "nowrap",
            }}>
              {presence.name}
            </span>
          </div>
        );
      })}
    </>
  );
}

// Sidebar: show who's currently on the board
export function ActiveUsers() {
  const others = useOthers();

  return (
    <div className="active-users">
      {others.map(({ connectionId, presence }) => (
        <div
          key={connectionId}
          className="avatar"
          style={{ backgroundColor: presence.color }}
          title={presence.name}
        >
          {presence.name?.[0]?.toUpperCase()}
        </div>
      ))}
      <span className="count">{others.length + 1} online</span>
    </div>
  );
}
```

## Step 4: Protect the API

Before going live, Dani adds Arcjet to protect the board creation API and WebSocket upgrade endpoints from abuse. Without this, bots could create thousands of boards or flood the WebSocket server.

```typescript
// app/api/boards/route.ts — Board creation with security
import arcjet, { tokenBucket, detectBot, shield, validateEmail } from "@arcjet/next";
import { NextRequest, NextResponse } from "next/server";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"],
    }),
    tokenBucket({
      mode: "LIVE",
      refillRate: 5,           // 5 board creations per minute
      interval: 60,
      capacity: 10,            // Burst: 10 boards at once max
    }),
  ],
});

export async function POST(request: NextRequest) {
  const decision = await aj.protect(request);

  if (decision.isDenied()) {
    return NextResponse.json(
      { error: decision.reason.isRateLimit()
        ? "Too many boards created. Please wait."
        : "Request blocked for security reasons." },
      { status: decision.reason.isRateLimit() ? 429 : 403 }
    );
  }

  const { name, inviteEmails } = await request.json();

  // Create the board
  const board = await db.board.create({
    data: {
      name,
      slug: generateSlug(),
      createdBy: request.headers.get("x-user-id")!,
    },
  });

  // Send invite emails to collaborators
  if (inviteEmails?.length) {
    for (const email of inviteEmails) {
      await sendBoardInvite(email, board.slug, board.name);
    }
  }

  return NextResponse.json({
    board: { id: board.id, slug: board.slug, url: `/boards/${board.slug}` },
  });
}
```

## Step 5: Yjs WebSocket Server

The final piece is the server that relays Yjs updates between clients and persists board state to the database.

```typescript
// server/yjs-server.ts — WebSocket server for Yjs document sync
import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import * as Y from "yjs";
import { PrismaClient } from "@prisma/client";

const wss = new WebSocketServer({ port: 4444 });
const prisma = new PrismaClient();

// Persist Yjs documents to PostgreSQL
setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    // Load existing board state from database
    const board = await prisma.board.findUnique({
      where: { slug: docName },
      select: { yjsState: true },
    });

    if (board?.yjsState) {
      const state = new Uint8Array(board.yjsState);
      Y.applyUpdate(ydoc, state);
    }

    // Save incremental updates (debounced to avoid DB spam)
    let saveTimeout: NodeJS.Timeout;
    ydoc.on("update", () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const state = Y.encodeStateAsUpdate(ydoc);
        await prisma.board.update({
          where: { slug: docName },
          data: { yjsState: Buffer.from(state) },
        });
      }, 2000);   // Save at most every 2 seconds
    });
  },
  writeState: async (docName: string, ydoc: Y.Doc) => {
    // Final save when all clients disconnect
    const state = Y.encodeStateAsUpdate(ydoc);
    await prisma.board.update({
      where: { slug: docName },
      data: { yjsState: Buffer.from(state), updatedAt: new Date() },
    });
  },
});

wss.on("connection", async (ws, req) => {
  // Extract and verify auth token
  const url = new URL(req.url!, "http://localhost");
  const token = url.searchParams.get("token");

  if (!token || !(await verifyToken(token))) {
    ws.close(4001, "Unauthorized");
    return;
  }

  setupWSConnection(ws, req);
});

console.log("Yjs WebSocket server running on port 4444");
```

## Results

After deploying the collaborative board to the design team, Dani sees immediate changes in their workflow. Design reviews happen on the board itself — designers draw, annotate, and discuss in real time instead of exporting screenshots. The average design feedback cycle dropped from 4 hours (export → upload → comment → re-export) to 15 minutes (draw together, talk, iterate).

The Yjs CRDT layer handles conflict resolution invisibly. In one session, three designers simultaneously moved shapes on the same frame — all changes merged correctly without any manual conflict resolution. The IndexedDB persistence proved its value when a team member's WiFi dropped during a brainstorm; they kept drawing offline, and everything synced when they reconnected.

Arcjet blocked 340 bot requests in the first week — mostly automated scanners probing the API endpoints. The rate limiter caught one incident where a buggy integration script tried to create boards in a loop.

The board loads in under 2 seconds, including Yjs state hydration from the database. Live cursors update at 60fps with Liveblocks' presence system, giving the team a genuine feeling of working in the same room.
