---
title: "Build a Real-Time Collaborative App with Liveblocks"
description: "Add Figma/Notion-style collaboration to your app: live cursors, presence avatars, synced shared state, and undo/redo — all with Liveblocks in a React app."
skills: [liveblocks]
difficulty: intermediate
time_estimate: "4 hours"
tags: [liveblocks, collaboration, real-time, cursors, presence, yjs, crdt, react, canvas]
---

# Build a Real-Time Collaborative App with Liveblocks

**Persona:** You're building a productivity tool and your biggest feature request is "real-time collaboration." Users want to see who else is online, follow their cursors, and edit without conflicts — like Figma or Notion. You have a React app and need to add this without building your own WebSocket infrastructure.

---

## What You'll Build

- **Liveblocks Room** with typed presence and storage
- **Live cursors:** see other users' mouse positions in real time
- **Presence indicators:** avatars, names, online badges
- **Shared canvas/document state** with Yjs CRDT — no conflict resolution code
- **Undo/redo history** that works across collaborators

---

## Step 1: Setup Liveblocks

```bash
npm install @liveblocks/client @liveblocks/react @liveblocks/react-ui
```

Create `liveblocks.config.ts` to define your types:

```ts
// liveblocks.config.ts
import { createClient } from '@liveblocks/client';
import { createRoomContext } from '@liveblocks/react';

const client = createClient({
  publicApiKey: process.env.NEXT_PUBLIC_LIVEBLOCKS_KEY!,
});

// Typed presence: what each user broadcasts about themselves
type Presence = {
  cursor: { x: number; y: number } | null;
  name: string;
  color: string;
  selectedId: string | null;
};

// Shared storage: the collaborative document state
type Storage = {
  shapes: LiveMap<string, Shape>;
  docContent: LiveObject<{ text: string }>;
};

type Shape = {
  type: 'rect' | 'circle' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  label?: string;
};

export const {
  RoomProvider,
  useRoom,
  useMyPresence,
  useOthers,
  useSelf,
  useStorage,
  useMutation,
  useHistory,
  useCanUndo,
  useCanRedo,
  useOthersMapped,
} = createRoomContext<Presence, Storage>(client);
```

---

## Step 2: Room Provider Setup

Wrap your collaborative page with `RoomProvider`:

```tsx
// app/canvas/[roomId]/page.tsx
'use client';
import { RoomProvider } from '@/liveblocks.config';
import { LiveMap, LiveObject } from '@liveblocks/client';
import { CollaborativeCanvas } from '@/components/CollaborativeCanvas';
import { ClientSideSuspense } from '@liveblocks/react';

export default function CanvasPage({ params }: { params: { roomId: string } }) {
  return (
    <RoomProvider
      id={params.roomId}
      initialPresence={{
        cursor: null,
        name: 'Anonymous',
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        selectedId: null,
      }}
      initialStorage={{
        shapes: new LiveMap(),
        docContent: new LiveObject({ text: '' }),
      }}
    >
      <ClientSideSuspense fallback={<div>Loading room...</div>}>
        {() => <CollaborativeCanvas />}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
```

---

## Step 3: Live Cursors

Broadcast your cursor position and render others' cursors:

```tsx
// components/LiveCursors.tsx
'use client';
import { useMyPresence, useOthersMapped } from '@/liveblocks.config';
import { useCallback } from 'react';

export function LiveCursors({ children }: { children: React.ReactNode }) {
  const [, updateMyPresence] = useMyPresence();

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    updateMyPresence({
      cursor: { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) },
    });
  }, [updateMyPresence]);

  const onPointerLeave = useCallback(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  const others = useOthersMapped(other => ({
    cursor: other.presence.cursor,
    name: other.presence.name,
    color: other.presence.color,
  }));

  return (
    <div className="relative w-full h-full" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {children}
      {others.map(([id, { cursor, name, color }]) =>
        cursor ? (
          <div
            key={id}
            className="pointer-events-none absolute z-50 select-none"
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          >
            {/* SVG cursor */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill={color}>
              <path d="M0 0 L0 14 L4 10 L8 16 L10 15 L6 9 L12 9 Z" />
            </svg>
            <div
              className="px-2 py-0.5 rounded text-xs text-white font-medium ml-3 -mt-1 whitespace-nowrap"
              style={{ backgroundColor: color }}
            >
              {name}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
```

---

## Step 4: Presence Avatars

Show who's in the room:

```tsx
// components/PresenceAvatars.tsx
'use client';
import { useOthers, useSelf } from '@/liveblocks.config';

export function PresenceAvatars() {
  const self = useSelf();
  const others = useOthers();

  return (
    <div className="flex items-center gap-1 p-2">
      {/* Current user */}
      <Avatar name={self?.presence.name ?? 'You'} color={self?.presence.color ?? '#888'} isMe />

      {/* Others */}
      {others.slice(0, 4).map(other => (
        <Avatar
          key={other.connectionId}
          name={other.presence.name}
          color={other.presence.color}
        />
      ))}

      {others.length > 4 && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
          +{others.length - 4}
        </div>
      )}

      <span className="text-sm text-gray-500 ml-2">
        {others.length + 1} online
      </span>
    </div>
  );
}

function Avatar({ name, color, isMe }: { name: string; color: string; isMe?: boolean }) {
  return (
    <div
      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white ${isMe ? 'ring-indigo-500' : ''}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {name[0].toUpperCase()}
      {isMe && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white" />}
    </div>
  );
}
```

---

## Step 5: Shared Canvas with Mutations

Add, move, and delete shapes collaboratively:

```tsx
// components/CollaborativeCanvas.tsx
'use client';
import { useStorage, useMutation, useHistory, useCanUndo, useCanRedo } from '@/liveblocks.config';
import { LiveCursors } from './LiveCursors';

export function CollaborativeCanvas() {
  const shapes = useStorage(root => root.shapes);
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const addShape = useMutation(({ storage }, x: number, y: number) => {
    const id = crypto.randomUUID();
    storage.get('shapes').set(id, {
      type: 'rect', x, y, width: 120, height: 80,
      fill: `hsl(${Math.random() * 360}, 60%, 70%)`,
    });
  }, []);

  const moveShape = useMutation(({ storage }, id: string, x: number, y: number) => {
    const shape = storage.get('shapes').get(id);
    if (shape) {
      storage.get('shapes').set(id, { ...shape, x, y });
    }
  }, []);

  const deleteShape = useMutation(({ storage }, id: string) => {
    storage.get('shapes').delete(id);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="p-2 border-b flex gap-2">
        <button onClick={() => history.undo()} disabled={!canUndo} className="btn">↩ Undo</button>
        <button onClick={() => history.redo()} disabled={!canRedo} className="btn">↪ Redo</button>
      </div>

      <LiveCursors>
        <div
          className="flex-1 bg-gray-50 relative overflow-hidden"
          onDoubleClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            addShape(e.clientX - rect.left, e.clientY - rect.top);
          }}
        >
          {shapes && Array.from(shapes.entries()).map(([id, shape]) => (
            <div
              key={id}
              className="absolute rounded cursor-move select-none flex items-center justify-center text-sm"
              style={{ left: shape.x, top: shape.y, width: shape.width, height: shape.height, backgroundColor: shape.fill }}
              onContextMenu={e => { e.preventDefault(); deleteShape(id); }}
              draggable
              onDragEnd={e => {
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                moveShape(id, e.clientX - rect.left - shape.width / 2, e.clientY - rect.top - shape.height / 2);
              }}
            >
              {shape.label ?? 'Double-click to add'}
            </div>
          ))}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-400 text-sm">
            Double-click to add shape · Right-click to delete · Drag to move
          </p>
        </div>
      </LiveCursors>
    </div>
  );
}
```

---

## Key Outcomes

- Live cursors for all users in the room
- Presence avatars showing who's online
- Conflict-free shared state via Liveblocks CRDT
- Undo/redo works across all collaborators
- Zero WebSocket infrastructure to maintain
