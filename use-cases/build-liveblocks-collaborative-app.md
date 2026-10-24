---
title: "Build a Real-Time Collaborative App with Liveblocks"
description: "Add Figma-style collaboration to your React app: live cursors, presence avatars, shared canvas state that merges concurrent edits, undo/redo, and server-side room permissions with Liveblocks."
skills: [liveblocks]
difficulty: intermediate
time_estimate: "4 hours"
tags: [liveblocks, collaboration, real-time, cursors, presence, crdt, react, canvas]
---

# Build a Real-Time Collaborative App with Liveblocks

## The Problem

You are building a productivity tool and the most requested feature is "real-time collaboration". Users want to see who else is in the document, watch their cursors, and edit the same canvas without overwriting each other, like Figma. You have a React app and do not want to run your own WebSocket servers, persistence and conflict resolution.

## The Solution

[Liveblocks](https://liveblocks.io/docs) hosts the rooms. Inside a room you get two kinds of state: **presence** (per-user and ephemeral: cursor, name) and **storage** (persistent, conflict-free data built from `LiveObject`, `LiveList` and `LiveMap`). You add a small auth endpoint so only the right people can enter a room. Checked against `@liveblocks/*` 3.24 and Next.js 16 (type-checked; not run against a live Liveblocks project).

## Step-by-Step Walkthrough

### Step 1: Install and declare your types

Every `@liveblocks/*` package must be on the same version.

```bash
npm install @liveblocks/client @liveblocks/react @liveblocks/node
```

In 3.x the types are declared once, globally, and the hooks come straight from `@liveblocks/react/suspense`:

```ts
// liveblocks.config.ts
import type { LiveMap, LiveObject } from "@liveblocks/client";
type Shape = { x: number; y: number; width: number; height: number; fill: string };
declare global {
  interface Liveblocks {
    // Ephemeral, per connection
    Presence: { cursor: { x: number; y: number } | null };
    // Persistent, conflict-free document state
    Storage: { shapes: LiveMap<string, LiveObject<Shape>> };
    // Set by your auth endpoint, read with useSelf() and useOthers()
    UserMeta: { id: string; info: { name: string; color: string } };
  }
}
export {};
```

### Step 2: Auth endpoint

A `publicApiKey` is for prototypes. For a real app, keep the secret key on the server (`LIVEBLOCKS_SECRET_KEY`, never `NEXT_PUBLIC_`) and let your own session decide who may enter which room. The `userInfo` you attach here is what `useSelf().info` and `useOthers()` return on the client.

```ts
// app/api/liveblocks-auth/route.ts
import { Liveblocks } from "@liveblocks/node";
import { getCurrentUser, userCanOpenRoom } from "@/lib/auth"; // your own session and permission checks
const liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY! });
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { room } = await request.json();
  if (!(await userCanOpenRoom(user.id, room))) return new Response("Forbidden", { status: 403 });
  const session = liveblocks.prepareSession(user.id, {
    userInfo: { name: user.name, color: `hsl(${hash(user.id) % 360} 70% 45%)` },
  });
  session.allow(room, session.FULL_ACCESS);
  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
```

Do not cache this endpoint's responses. Room ids such as `canvas:<id>` let you grant whole groups of rooms with a wildcard (`session.allow("canvas:*", ...)`) when that fits your model.

### Step 3: Room provider

`ClientSideSuspense` renders the fallback on the server and the children once the room has loaded, so the Suspense hooks never return `null`. `initialStorage` only applies the first time a room is created. In Next.js 15 and later `params` is a Promise.

```tsx
// app/canvas/[roomId]/Room.tsx
"use client";
import { ReactNode } from "react";
import { LiveMap } from "@liveblocks/client";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense";
export function Room({ roomId, children }: { roomId: string; children: ReactNode }) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null }}
        initialStorage={{ shapes: new LiveMap() }}
      >
        <ClientSideSuspense fallback={<p>Loading room…</p>}>{children}</ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
```

```tsx
// app/canvas/[roomId]/page.tsx
import { Room } from "./Room";
import { CollaborativeCanvas } from "@/components/CollaborativeCanvas";
export default async function CanvasPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <Room roomId={`canvas:${roomId}`}>
      <CollaborativeCanvas />
    </Room>
  );
}
```

### Step 4: Live cursors

Presence updates are throttled by the client, so calling `updateMyPresence` on every pointer move is fine.

```tsx
// components/LiveCursors.tsx
"use client";
import { ReactNode } from "react";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react/suspense";
export function LiveCursors({ children }: { children: ReactNode }) {
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();
  return (
    <div
      style={{ position: "relative", flex: 1 }}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        updateMyPresence({ cursor: { x: Math.round(e.clientX - box.left), y: Math.round(e.clientY - box.top) } });
      }}
      onPointerLeave={() => updateMyPresence({ cursor: null })}
    >
      {children}
      {others.map(({ connectionId, presence, info }) =>
        presence.cursor ? (
          <div
            key={connectionId}
            style={{
              position: "absolute", left: 0, top: 0, pointerEvents: "none",
              transform: `translate(${presence.cursor.x}px, ${presence.cursor.y}px)`, color: info.color,
            }}
          >
            ▲ {info.name}
          </div>
        ) : null,
      )}
    </div>
  );
}
```

### Step 5: Presence avatars

```tsx
// components/PresenceAvatars.tsx
"use client";
import { useOthers, useSelf } from "@liveblocks/react/suspense";
function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span title={name} style={{ background: color, color: "white", borderRadius: "50%", width: 32, height: 32,
      display: "inline-grid", placeItems: "center", fontWeight: 600 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
export function PresenceAvatars() {
  const self = useSelf();
  const others = useOthers();
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <Avatar name={`${self.info.name} (you)`} color={self.info.color} />
      {others.slice(0, 4).map((o) => <Avatar key={o.connectionId} name={o.info.name} color={o.info.color} />)}
      {others.length > 4 && <span>+{others.length - 4}</span>}
      <span>{others.length + 1} online</span>
    </div>
  );
}
```

### Step 6: Shared canvas with undo and redo

Each shape is a `LiveObject`, so two people moving different shapes never conflict, and two people editing the same field resolve last-write-wins. Pausing history during a drag makes the whole drag one undo step. `useStorage` returns a frozen plain object for a `LiveMap`, hence `Object.entries`.

```tsx
// components/CollaborativeCanvas.tsx
"use client";
import { useRef } from "react";
import { LiveObject } from "@liveblocks/client";
import {
  useCanRedo, useCanUndo, useHistory, useMutation, useRedo, useStorage, useUndo,
} from "@liveblocks/react/suspense";
import { LiveCursors } from "./LiveCursors";
import { PresenceAvatars } from "./PresenceAvatars";
export function CollaborativeCanvas() {
  const shapes = useStorage((root) => root.shapes); // a frozen plain object keyed by shape id
  const { pause, resume } = useHistory();
  const [undo, redo, canUndo, canRedo] = [useUndo(), useRedo(), useCanUndo(), useCanRedo()];
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const addShape = useMutation(({ storage }, x: number, y: number) => {
    storage.get("shapes").set(
      crypto.randomUUID(),
      new LiveObject({ x, y, width: 120, height: 80, fill: `hsl(${Math.random() * 360} 60% 75%)` }),
    );
  }, []);
  const moveShape = useMutation(({ storage }, id: string, x: number, y: number) => {
    storage.get("shapes").get(id)?.update({ x, y }); // only x and y sync
  }, []);
  const deleteShape = useMutation(({ storage }, id: string) => {
    storage.get("shapes").delete(id);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header style={{ display: "flex", gap: 8, padding: 8, justifyContent: "space-between" }}>
        <div>
          <button onClick={undo} disabled={!canUndo}>Undo</button>
          <button onClick={redo} disabled={!canRedo}>Redo</button>
        </div>
        <PresenceAvatars />
      </header>
      <LiveCursors>
        <div
          style={{ position: "absolute", inset: 0, background: "#f6f6f8", overflow: "hidden", touchAction: "none" }}
          onDoubleClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            addShape(e.clientX - box.left, e.clientY - box.top);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const box = e.currentTarget.getBoundingClientRect();
            moveShape(drag.current.id, e.clientX - box.left - drag.current.dx, e.clientY - box.top - drag.current.dy);
          }}
          onPointerUp={() => { drag.current = null; resume(); }}
        >
          {Object.entries(shapes).map(([id, s]) => (
            <div
              key={id}
              style={{ position: "absolute", left: s.x, top: s.y, width: s.width, height: s.height,
                background: s.fill, borderRadius: 6, cursor: "grab", userSelect: "none" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.parentElement!.getBoundingClientRect();
                drag.current = { id, dx: e.clientX - box.left - s.x, dy: e.clientY - box.top - s.y };
                e.currentTarget.parentElement!.setPointerCapture(e.pointerId);
                pause(); // the whole drag becomes one undo step
              }}
              onContextMenu={(e) => { e.preventDefault(); deleteShape(id); }}
            />
          ))}
        </div>
      </LiveCursors>
    </div>
  );
}
```

Open `/canvas/demo` in two browsers signed in as different users: double-click to add a rectangle, drag it, right-click to delete it, and use Undo and Redo (they only undo your own changes).

## Real-World Example

A four-person team ("Sketchpad", an invented whiteboard startup) ships the canvas to beta users. They start with the public key in a prototype, then add the auth endpoint before launch so only workspace members get a token. The first support ticket ("my colleague moved my box") turns into a feature: they add `selectedId` to presence and draw an outline around shapes other people are holding. For rich text, they add a text editor binding (`@liveblocks/yjs` with a Yjs-based editor) in the same room instead of storing text in `LiveMap`.

## Related Skills

- [liveblocks](/skills/liveblocks): hooks, storage types, comments and notifications, and server-side authentication
