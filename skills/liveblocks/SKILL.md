---
name: liveblocks
description: Expert guidance for Liveblocks, the platform for adding real-time collaboration features to web applications. Helps developers implement live cursors, presence indicators, collaborative editing, comments, and notifications using Liveblocks' React hooks and APIs.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - real-time
  - collaboration
  - multiplayer
  - presence
  - cursors
---

# Liveblocks — Real-Time Collaboration SDK


## Overview

You are an expert in Liveblocks, the platform for adding real-time collaboration features to web applications. You help developers implement live cursors, presence indicators, collaborative editing, comments, and notifications using Liveblocks' React hooks and APIs.

## Instructions

### Room Setup and Presence

Configure a collaborative room with user presence tracking:

```typescript
// src/liveblocks.config.ts — Liveblocks type configuration
import { createClient } from "@liveblocks/client";
import { createRoomContext, createLiveblocksContext } from "@liveblocks/react";

const client = createClient({
  publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY!,
  // Or use auth endpoint for production (recommended)
  // authEndpoint: "/api/liveblocks-auth",
});

// Define types for your collaborative data
type Presence = {
  cursor: { x: number; y: number } | null;  // User's cursor position
  selectedId: string | null;                  // Currently selected element
  name: string;                               // Display name
  color: string;                              // Avatar/cursor color
};

type Storage = {
  shapes: LiveList<Shape>;                    // Shared canvas shapes
  document: LiveObject<DocumentState>;        // Shared document state
};

type UserMeta = {
  id: string;
  info: { name: string; avatar: string; color: string };
};

export const {
  RoomProvider,
  useMyPresence,
  useOthers,
  useStorage,
  useMutation,
  useSelf,
} = createRoomContext<Presence, Storage, UserMeta>(client);
```

### Live Cursors

Show other users' cursor positions in real time:

```tsx
// src/components/LiveCursors.tsx — Display cursors of all connected users
import { useOthers, useMyPresence } from "../liveblocks.config";
import { useCallback, useEffect } from "react";

export function LiveCursors() {
  const others = useOthers();
  const [myPresence, updateMyPresence] = useMyPresence();

  // Track cursor movement and broadcast to other users
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      updateMyPresence({
        cursor: { x: e.clientX, y: e.clientY },
      });
    },
    [updateMyPresence]
  );

  const handlePointerLeave = useCallback(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ position: "relative", width: "100%", height: "100vh" }}
    >
      {/* Render other users' cursors */}
      {others.map(({ connectionId, presence, info }) => {
        if (!presence.cursor) return null;
        return (
          <Cursor
            key={connectionId}
            x={presence.cursor.x}
            y={presence.cursor.y}
            name={info?.name ?? "Anonymous"}
            color={info?.color ?? "#000"}
          />
        );
      })}
    </div>
  );
}

function Cursor({ x, y, name, color }: { x: number; y: number; name: string; color: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* SVG cursor icon */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill={color}>
        <path d="M5 3l14 8-6 2-2 6z" />
      </svg>
      {/* Name label */}
      <span style={{
        backgroundColor: color,
        color: "white",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        whiteSpace: "nowrap",
      }}>
        {name}
      </span>
    </div>
  );
}
```

### Collaborative Storage

Shared data structures that sync across all users:

```tsx
// src/components/CollaborativeCanvas.tsx — Shared canvas with conflict-free updates
import { useStorage, useMutation } from "../liveblocks.config";
import { LiveList, LiveObject } from "@liveblocks/client";

type Shape = {
  id: string;
  type: "rectangle" | "circle" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export function CollaborativeCanvas() {
  // useStorage reads from the shared room storage (synced via CRDT)
  const shapes = useStorage((root) => root.shapes);

  // useMutation creates a function that can modify shared storage
  // Mutations are atomic and conflict-free — two users can edit simultaneously
  const addShape = useMutation(({ storage }, shape: Shape) => {
    const shapes = storage.get("shapes");
    shapes.push(new LiveObject(shape));
  }, []);

  const moveShape = useMutation(({ storage }, id: string, x: number, y: number) => {
    const shapes = storage.get("shapes");
    const shape = shapes.find((s) => s.get("id") === id);
    if (shape) {
      shape.set("x", x);    // Only the changed field syncs — bandwidth efficient
      shape.set("y", y);
    }
  }, []);

  const deleteShape = useMutation(({ storage }, id: string) => {
    const shapes = storage.get("shapes");
    const index = shapes.findIndex((s) => s.get("id") === id);
    if (index !== -1) shapes.delete(index);
  }, []);

  return (
    <canvas>
      {shapes?.map((shape) => (
        <CanvasShape
          key={shape.id}
          shape={shape}
          onMove={(x, y) => moveShape(shape.id, x, y)}
          onDelete={() => deleteShape(shape.id)}
        />
      ))}
    </canvas>
  );
}
```

### Comments and Threads

Add comment threads to any part of your application:

```tsx
// src/components/Comments.tsx — Inline comments on document elements
import { useThreads, useCreateThread, useCreateComment } from "@liveblocks/react/suspense";

export function CommentsSidebar({ elementId }: { elementId: string }) {
  // Fetch all comment threads for this room
  const { threads } = useThreads();
  const createThread = useCreateThread();
  const createComment = useCreateComment();

  // Filter threads attached to the selected element
  const elementThreads = threads.filter(
    (thread) => thread.metadata.elementId === elementId
  );

  const handleNewThread = (body: string) => {
    createThread({
      body: { version: 1, content: [{ type: "paragraph", children: [{ text: body }] }] },
      metadata: { elementId, resolved: false },
    });
  };

  return (
    <div className="comments-sidebar">
      <h3>Comments</h3>
      {elementThreads.map((thread) => (
        <ThreadView
          key={thread.id}
          thread={thread}
          onReply={(body) => createComment({ threadId: thread.id, body })}
        />
      ))}
      <NewThreadForm onSubmit={handleNewThread} />
    </div>
  );
}
```

### Authentication Endpoint

Secure room access with token-based auth:

```typescript
// app/api/liveblocks-auth/route.ts — Next.js auth endpoint
import { Liveblocks } from "@liveblocks/node";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prepare Liveblocks session with user identity
  const liveblocksSession = liveblocks.prepareSession(session.user.id, {
    userInfo: {
      name: session.user.name,
      avatar: session.user.image,
      color: generateColor(session.user.id),  // Deterministic color from user ID
    },
  });

  // Grant access to specific rooms based on your authorization logic
  const { room } = await request.json();
  const hasAccess = await checkRoomAccess(session.user.id, room);

  if (hasAccess) {
    liveblocksSession.allow(room, liveblocksSession.FULL_ACCESS);
  }

  const { status, body } = await liveblocksSession.authorize();
  return new NextResponse(body, { status });
}
```

## Installation

```bash
# Core packages
npm install @liveblocks/client @liveblocks/react

# For Next.js with comments and notifications
npm install @liveblocks/node @liveblocks/react-ui

# Yjs integration for text editing
npm install @liveblocks/yjs yjs
```


## Examples

### Example 1

**User request:** "Help me set up Liveblocks"

The agent follows the instructions above to configure Liveblocks with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Liveblocks configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Use auth endpoint in production** — Public API keys are fine for dev; production needs proper authentication
2. **Type your presence and storage** — TypeScript generics prevent runtime errors in collaborative data
3. **Granular mutations** — Update individual fields, not entire objects; Liveblocks only syncs what changed
4. **Throttle presence updates** — Cursor movement fires constantly; throttle to 50-100ms intervals
5. **Handle offline gracefully** — Liveblocks queues changes offline; show a connection status indicator
6. **Room naming convention** — Use predictable patterns like `project:{projectId}:document:{docId}`
7. **Clean up storage** — Delete rooms when projects are archived; storage persists indefinitely
8. **Test with multiple tabs** — Open your app in 2-3 tabs during development to verify real-time sync
