---
name: liveblocks
description: >-
  Liveblocks is a hosted platform for adding real-time collaboration to web
  apps: live cursors, presence, shared storage, comments, notifications and
  collaborative text editors. Use this skill when a user wants multiplayer
  features in a React or Next.js app, asks how to use Liveblocks hooks
  (useOthers, useStorage, useMutation, useThreads), set up the LiveblocksProvider
  and RoomProvider, or write the server auth endpoint with @liveblocks/node.
license: Apache-2.0
compatibility: "React 18 or 19; Node.js server for the auth endpoint; Liveblocks account with public and secret keys"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/liveblocks/liveblocks
  tags: "real-time, collaboration, multiplayer, presence, cursors"
---

# Liveblocks — Real-Time Collaboration SDK

## Overview

Liveblocks runs the WebSocket servers, storage and permissions for collaborative features. A **room** is a shared space; inside it you get **Presence** (per-user, ephemeral: cursor, selection), **Storage** (persistent conflict-free data built from `LiveObject`, `LiveList`, `LiveMap`), **Comments** (threads, composer, UI components), **Notifications**, and editor bindings (`@liveblocks/react-tiptap`, `react-lexical`, `react-blocknote`, `@liveblocks/yjs`). Current packages are 3.x (3.24 in October 2026); keep every `@liveblocks/*` package on the same version.

In 3.x you import hooks directly from `@liveblocks/react/suspense` (Suspense hooks: data is always defined) or `@liveblocks/react` (regular hooks: data is `null` while loading). Types are declared once, globally, in `liveblocks.config.ts`. `createRoomContext` still exists but is the non-standard route.

## Instructions

1. Install and generate the config file:

```bash
npm install @liveblocks/client @liveblocks/react
npm install @liveblocks/react-ui    # Thread, Composer, notifications UI
npm install @liveblocks/node        # server-side auth, REST API
npx create-liveblocks-app@latest --init --framework react
```

2. Declare your types by augmenting the global `Liveblocks` interface (keys: `Presence`, `Storage`, `UserMeta`, `RoomEvent`, `ThreadMetadata`, `RoomInfo`):

```typescript
// liveblocks.config.ts
import type { LiveList, LiveObject } from "@liveblocks/client";

type Shape = { id: string; x: number; y: number; width: number; height: number; fill: string };

declare global {
  interface Liveblocks {
    Presence: { cursor: { x: number; y: number } | null; selectedId: string | null };
    Storage: { shapes: LiveList<LiveObject<Shape>> };
    UserMeta: { id: string; info: { name: string; avatar: string; color: string } };
    ThreadMetadata: { elementId: string; resolved: boolean };
  }
}
export {};
```

3. Wrap the app in `LiveblocksProvider` (client config: `publicApiKey` for prototypes, `authEndpoint` for production), then `RoomProvider` (room `id`, `initialPresence`, `initialStorage`), then `ClientSideSuspense` (renders the fallback on the server, since Suspense hooks throw there):

```tsx
// app/Room.tsx
"use client";
import { ReactNode } from "react";
import { LiveList } from "@liveblocks/client";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense";

export function Room({ roomId, children }: { roomId: string; children: ReactNode }) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" throttle={50}>
      <RoomProvider id={roomId} initialPresence={{ cursor: null, selectedId: null }}
                    initialStorage={{ shapes: new LiveList([]) }}>
        <ClientSideSuspense fallback={<div>Loading…</div>}>{children}</ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
```

`initialStorage` only applies the first time a room is created; later changes to it have no effect. `throttle` (16 to 1000 ms, default 100) controls how often updates are sent.

4. Presence hooks: `useOthers`, `useSelf`, `useMyPresence`, `useUpdateMyPresence` (merges a partial object and re-renders less than `useMyPresence`). Storage hooks: `useStorage(selector)` reads immutable snapshots, `useMutation(({ storage, self, others, setMyPresence }, ...args) => ...)` writes. Pass selectors to avoid re-rendering on unrelated changes.
5. Comments: `useThreads`, `useCreateThread`, `useCreateComment` from `@liveblocks/react/suspense`, ready-made `Thread` and `Composer` from `@liveblocks/react-ui`, and `import "@liveblocks/react-ui/styles.css"` once in the root layout. `resolveUsers` / `resolveMentionSuggestions` on `LiveblocksProvider` turn user IDs into names and avatars.
6. Auth on the server: `Liveblocks.identifyUser` (ID token, recommended for most apps; permissions come from room accesses and groups) or `prepareSession` (access token, you list the rooms per request). Never cache the auth endpoint's response. The secret key (`sk_...`) stays on the server.

## Examples

### Live cursors

```tsx
// components/LiveCursors.tsx
"use client";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react/suspense";

export function LiveCursors({ children }: { children: React.ReactNode }) {
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

  return (
    <div
      style={{ position: "relative", height: "100vh" }}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        updateMyPresence({ cursor: { x: e.clientX - box.left, y: e.clientY - box.top } });
      }}
      onPointerLeave={() => updateMyPresence({ cursor: null })}
    >
      {children}
      {others.map(({ connectionId, presence, info }) =>
        presence.cursor ? (
          <div key={connectionId} style={{ position: "absolute", left: presence.cursor.x,
               top: presence.cursor.y, pointerEvents: "none", color: info.color }}>
            ▲ {info.name}
          </div>
        ) : null,
      )}
    </div>
  );
}
```

Result: with the app open in two tabs signed in as different users, each tab shows the other user's name following the pointer, and it disappears when the pointer leaves.

### Shared canvas shapes with mutations

```tsx
import { LiveObject } from "@liveblocks/client";
import { useMutation, useStorage } from "@liveblocks/react/suspense";

export function useShapes() {
  const shapes = useStorage((root) => root.shapes); // readonly plain objects

  const addShape = useMutation(({ storage }, shape: Shape) => {
    storage.get("shapes").push(new LiveObject(shape));
  }, []);

  const moveShape = useMutation(({ storage }, id: string, x: number, y: number) => {
    const shape = storage.get("shapes").find((s) => s.get("id") === id);
    shape?.update({ x, y }); // only changed fields sync
  }, []);

  return { shapes, addShape, moveShape };
}
```

Result: two users dragging different shapes both succeed; concurrent edits to the same field resolve last-write-wins.

### Comment threads

```tsx
import { useThreads } from "@liveblocks/react/suspense";
import { Composer, Thread } from "@liveblocks/react-ui";

export function ElementComments({ elementId }: { elementId: string }) {
  const { threads } = useThreads({ query: { metadata: { elementId } } });
  return (
    <aside>
      {threads.map((t) => <Thread key={t.id} thread={t} />)}
      <Composer metadata={{ elementId, resolved: false }} />
    </aside>
  );
}
```

Result: a sidebar listing the threads for one canvas element, with a composer that creates a new thread tagged with that element.

### Auth endpoint (Next.js route handler)

```typescript
// app/api/liveblocks-auth/route.ts
import { Liveblocks } from "@liveblocks/node";
import { getSession } from "@/lib/auth";

const liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY! });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { room } = await request.json();
  if (!(await canAccessRoom(session.user.id, room))) return new Response("Forbidden", { status: 403 });

  const lb = liveblocks.prepareSession(session.user.id, {
    userInfo: { name: session.user.name, avatar: session.user.image, color: colorFor(session.user.id) },
  });
  lb.allow(room, lb.FULL_ACCESS);
  const { body, status } = await lb.authorize();
  return new Response(body, { status });
}
```

Result: the browser client posts `{ room }` to this route and receives a token; denied users get 403 and cannot join.

## Guidelines

- Use `authEndpoint` in production. A `publicApiKey` lets anyone with the key join any room.
- `useOthers()` without a selector re-renders on every presence change; use `useOthersMapped` or a selector for cursors and avatar stacks.
- Mutate inside `useMutation`, not by editing the object from `useStorage`: those snapshots are read-only.
- Storage values must be JSON-serialisable, and a `LiveList` of `LiveObject` is better than a plain array in a `LiveObject` when items are edited independently.
- Presence resets when a user disconnects; put anything that must persist in Storage.
- Use `useErrorListener` to catch failed optimistic writes such as `CREATE_THREAD_ERROR`; set `preventUnsavedChanges` on the provider for editors.
- Room IDs should encode the tenant, for example `acme:project-42:doc-7`; rooms and storage persist until deleted through the REST API (`liveblocks.deleteRoom`).
- Upgrading from 2.x: run `npx liveblocks@latest upgrade`; 3.0 needs TypeScript 5+, changed mention callbacks to `MentionData` objects and removed deprecated hooks like `useBatch` and `useStorageStatus`.
