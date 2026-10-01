---
name: tldraw
description: >-
  tldraw is a React SDK for building infinite-canvas apps — whiteboards, diagram
  editors, and visual tools — with a shape system, camera controls, snapshots,
  and real-time multiplayer. Use when embedding a collaborative canvas or
  whiteboard in a React app, defining custom shapes, driving the editor
  programmatically, exporting the canvas to an image, or adding multiplayer
  sync. Note: production use requires a tldraw license key.
license: Apache-2.0
compatibility: "tldraw SDK 5 with React 18.2+ or 19.2.1+. Production use requires a tldraw license key."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
  - canvas
  - whiteboard
  - drawing
  - collaboration
  - react
  repository: https://github.com/tldraw/tldraw
---

# tldraw — Infinite Canvas SDK

## Overview

tldraw is a React SDK for building infinite-canvas experiences: whiteboards,
diagram editors, and visual tools. You drop in the `<Tldraw>` component, extend
it with custom shapes that render as React/HTML or SVG, drive the canvas through
the `Editor` API, persist state with snapshots, and add real-time collaboration
with `@tldraw/sync`.

## Instructions

### Basic Setup

Install and embed a full-featured canvas. The container needs explicit
dimensions, and you must import the stylesheet.

```tsx
// src/components/Whiteboard.tsx
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export function Whiteboard() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {/* persistenceKey saves to the browser's IndexedDB and syncs across tabs */}
      <Tldraw persistenceKey="design-review-board" />
    </div>
  );
}
```

### Custom Shapes

Model your domain with a shape util. `BaseBoxShapeUtil` gives you a resizable
box; `component()` renders it (full React is allowed), `getIndicatorPath()`
returns the selection outline as a `Path2D` (it replaced the JSX `indicator()`
in SDK 5).

```tsx
// src/shapes/TaskCardShapeUtil.tsx
import { BaseBoxShapeUtil, HTMLContainer, T, TLShape } from "tldraw";

// Register the props under the shape's type name (a global registry: keep the name unique).
declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    "task-card": { title: string; assignee: string; priority: "low" | "high"; w: number; h: number };
  }
}

type TaskCard = TLShape<"task-card">;

export class TaskCardShapeUtil extends BaseBoxShapeUtil<TaskCard> {
  static override type = "task-card" as const;
  static override props = {   // validated by the store
    title: T.string, assignee: T.string, priority: T.literalEnum("low", "high"), w: T.number, h: T.number,
  };

  getDefaultProps(): TaskCard["props"] {
    return { title: "New task", assignee: "Unassigned", priority: "low", w: 280, h: 140 };
  }

  component(shape: TaskCard) {
    const border = shape.props.priority === "high" ? "#ef4444" : "#4ade80";
    return (
      <HTMLContainer
        style={{
          padding: 12,
          border: `2px solid ${border}`,
          borderRadius: 8,
          background: "white",
          pointerEvents: "all", // let the HTML receive clicks
        }}
      >
        <strong>{shape.props.title}</strong>
        <div style={{ fontSize: 11, color: "#666" }}>{shape.props.assignee}</div>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: TaskCard) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
```

Register it on the component:

```tsx
import { Tldraw } from "tldraw";
import { TaskCardShapeUtil } from "./shapes/TaskCardShapeUtil";

<Tldraw shapeUtils={[TaskCardShapeUtil]} persistenceKey="sprint-board" />;
```

### Driving the Editor API

Grab the `Editor` with the `useEditor()` hook (inside the `<Tldraw>` tree) or
from the `onMount` callback. Create/update use singular and plural forms.

```tsx
// src/hooks/useCanvasActions.ts
import { useEditor } from "tldraw";

export function useCanvasActions() {
  const editor = useEditor();

  function addTaskCard(title: string, x: number, y: number) {
    editor.createShape({ type: "task-card", x, y, props: { title } });
  }

  // Export selection (or whole page) to a PNG blob.
  // getSvg() was removed — use toImage(), getSvgString(), or getSvgElement().
  async function exportPng() {
    const ids = [...editor.getCurrentPageShapeIds()];
    if (ids.length === 0) return null;
    const { blob } = await editor.toImage(ids, { format: "png", scale: 2, background: true });
    return blob;
  }

  function zoomToFit() {
    editor.zoomToFit({ animation: { duration: 300 } });
  }

  return { addTaskCard, exportPng, zoomToFit };
}
```

### Snapshots (save & restore)

`getSnapshot`/`loadSnapshot` are top-level functions imported from `tldraw`.
`getSnapshot` returns `{ document, session }`; persist the `document` part.

```typescript
// src/persistence/snapshots.ts
import { Editor, getSnapshot, loadSnapshot } from "tldraw";

export async function saveToServer(editor: Editor, documentId: string) {
  const { document } = getSnapshot(editor.store);
  await fetch(`/api/boards/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(document),
  });
}

export async function loadFromServer(editor: Editor, documentId: string) {
  const document = await fetch(`/api/boards/${documentId}`).then((r) => r.json());
  loadSnapshot(editor.store, { document });
}

// Debounce auto-save — canvas changes fire rapidly while drawing.
export function setupAutoSave(editor: Editor, documentId: string) {
  let timer: ReturnType<typeof setTimeout>;
  return editor.store.listen(
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveToServer(editor, documentId), 2000);
    },
    { source: "user", scope: "document" }
  );
}
```

### Multiplayer with @tldraw/sync

Official real-time collaboration uses the `useSync` hook from `@tldraw/sync`
talking to a websocket backend you host (tldraw ships a Cloudflare Durable
Objects server template). For a prototype, `useSyncDemo({ roomId })` connects to
tldraw's demo server with temporary rooms. There is no `@tldraw/yjs` package.

```tsx
// src/components/MultiplayerBoard.tsx
import { Tldraw, TLAssetStore, uniqueId } from "tldraw";
import { useSync } from "@tldraw/sync";

// `assets` is required: images and videos go to your own storage, the document keeps the URL.
// The /api/uploads and /api/connect routes are the ones tldraw's sync-cloudflare template serves.
const assets: TLAssetStore = {
  async upload(_asset, file) {
    const name = `${uniqueId()}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, "-");
    const res = await fetch(`/api/uploads/${name}`, { method: "POST", body: file });
    if (!res.ok) throw new Error(`Failed to upload asset: ${res.statusText}`);
    return { src: `/api/uploads/${name}` };
  },
  resolve: (asset) => asset.props.src,
};

export function MultiplayerBoard({ roomId }: { roomId: string }) {
  // useSync manages the websocket and reconciles document + presence state.
  // An http(s) URI is upgraded to ws(s).
  const store = useSync({ uri: `${window.location.origin}/api/connect/${roomId}`, assets });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw store={store} />
    </div>
  );
}
```

## Installation

```bash
npm install tldraw          # core SDK (includes the Editor and default UI)

# For multiplayer
npm install @tldraw/sync
```

## Examples

### Example 1: Embed a whiteboard with a custom shape

**User request:**

```
Add a tldraw canvas to our React dashboard and give it a "task-card" shape so
users can drop task cards on the board.
```

The agent runs `npm install tldraw`, creates a `Whiteboard` component that
imports `tldraw/tldraw.css` and renders `<Tldraw shapeUtils={[TaskCardShapeUtil]}
persistenceKey="sprint-board" />` inside a `position: fixed; inset: 0` container,
and defines `TaskCardShapeUtil extends BaseBoxShapeUtil`. Result: an infinite
canvas that persists to IndexedDB, with draggable task cards whose React
content stays interactive.

### Example 2: Export the current board as a PNG

**User request:**

```
Add a "Download PNG" button that exports whatever is on the tldraw canvas.
```

The agent wires a button to `editor.toImage([...editor.getCurrentPageShapeIds()],
{ format: "png", scale: 2, background: true })`, turns the returned `blob` into
an object URL, and triggers a download. Result: a 2x-resolution PNG of the whole
page; if the page is empty the handler returns early.

## Guidelines

1. **Production needs a license key** — since SDK 4, running tldraw in
   production (HTTPS, non-loopback host, `NODE_ENV=production`) requires a
   license key; without one the editor stops rendering after five seconds.
   Commercial use needs a commercial license (no watermark; a free 100-day
   trial key exists). The free hobby license is for non-commercial projects,
   is granted on request and keeps the "made with tldraw" watermark.
   Development needs no key. Pass the key with the `licenseKey` prop on
   `<Tldraw>` or an env var such as `VITE_TLDRAW_LICENSE_KEY`.
2. **Container needs dimensions** — tldraw fills its parent; give it explicit
   size (e.g. `position: fixed; inset: 0`) or it renders at zero height.
3. **Custom shapes for domain data** — represent tasks, nodes, or cards as
   shapes instead of forcing everything into draw/text.
4. **Always implement `getIndicatorPath()`** — it returns the selection/hover
   outline of a custom shape; SDK 5 no longer renders the JSX `indicator()`.
5. **`getSvg()` was removed** — use `editor.toImage()` (blob), or
   `editor.getSvgString()` / `editor.getSvgElement()` for vector output.
   SVG exports are resolution-independent and smaller than raster.
6. **Persist the `document` snapshot** — `getSnapshot(editor.store)` returns
   `{ document, session }`; store `document` on your backend, keep `session`
   per-client if you want to restore the viewport.
7. **Debounce auto-save** — `editor.store.listen` fires on every change; save
   every 2–3 seconds, not per event.
8. **Multiplayer is `@tldraw/sync`, not Yjs** — the old community Yjs example is
   not a maintained package; use `useSync` against a websocket server.
