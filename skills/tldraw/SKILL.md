---
name: tldraw
category: Real-Time & Collaboration
tags: [canvas, whiteboard, drawing, collaboration, react, infinite-canvas]
version: 1.0.0
author: terminal-skills
---

# tldraw — Infinite Canvas SDK

You are an expert in tldraw, the open-source library for creating infinite canvas experiences in React applications. You help developers embed collaborative whiteboards, diagram editors, and visual tools with tldraw's shape system, camera controls, and multiplayer support.

## Core Capabilities

### Basic Setup

Embed a full-featured whiteboard in a React app:

```tsx
// src/components/Whiteboard.tsx — Basic tldraw canvas
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export function Whiteboard() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        // Optional: persist to a backend
        persistenceKey="my-whiteboard"
        // Optional: customize available tools
        // tools={[...defaultTools, MyCustomTool]}
      />
    </div>
  );
}
```

### Custom Shapes

Define domain-specific shapes for your application:

```tsx
// src/shapes/TaskCardShape.tsx — Custom shape for a project management board
import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  T,
  DefaultColorStyle,
  ShapeUtil,
} from "tldraw";

// Define the shape's data structure
type TaskCard = TLBaseShape<
  "task-card",
  {
    title: string;
    description: string;
    assignee: string;
    priority: "low" | "medium" | "high" | "critical";
    status: "todo" | "in-progress" | "review" | "done";
    w: number;
    h: number;
  }
>;

// Shape utility — tells tldraw how to render and interact with the shape
export class TaskCardShapeUtil extends BaseBoxShapeUtil<TaskCard> {
  static override type = "task-card" as const;

  // Default values when a new task card is created
  getDefaultProps(): TaskCard["props"] {
    return {
      title: "New Task",
      description: "",
      assignee: "Unassigned",
      priority: "medium",
      status: "todo",
      w: 280,          // Default width in pixels
      h: 160,          // Default height
    };
  }

  // Render the shape as HTML (supports full React components)
  component(shape: TaskCard) {
    const priorityColors = {
      low: "#4ade80",
      medium: "#facc15",
      high: "#fb923c",
      critical: "#ef4444",
    };

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          padding: "12px",
          borderRadius: "8px",
          border: `2px solid ${priorityColors[shape.props.priority]}`,
          backgroundColor: "white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "all",    // Enable click/drag on the HTML content
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong style={{ fontSize: "14px" }}>{shape.props.title}</strong>
          <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            backgroundColor: priorityColors[shape.props.priority],
            color: "white",
          }}>
            {shape.props.priority}
          </span>
        </div>
        <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>
          {shape.props.description || "No description"}
        </p>
        <div style={{ fontSize: "11px", color: "#999", marginTop: "auto" }}>
          👤 {shape.props.assignee} • {shape.props.status}
        </div>
      </HTMLContainer>
    );
  }

  // Render a simplified version when zoomed out (performance optimization)
  indicator(shape: TaskCard) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
```

### Accessing the Editor API

Programmatically control the canvas:

```typescript
// src/hooks/useCanvasActions.ts — Programmatic canvas manipulation
import { useEditor } from "tldraw";

export function useCanvasActions() {
  const editor = useEditor();

  // Create shapes programmatically
  function addTaskCard(title: string, x: number, y: number) {
    editor.createShape({
      type: "task-card",
      x,
      y,
      props: {
        title,
        description: "",
        assignee: "Unassigned",
        priority: "medium",
        status: "todo",
        w: 280,
        h: 160,
      },
    });
  }

  // Export canvas as image
  async function exportAsImage() {
    const shapeIds = editor.getCurrentPageShapeIds();
    if (shapeIds.size === 0) return;

    const blob = await editor.getSvg([...shapeIds], {
      scale: 2,            // 2x resolution
      background: true,    // Include background color
    });
    return blob;
  }

  // Zoom to fit all content
  function zoomToFit() {
    editor.zoomToFit({ animation: { duration: 300 } });
  }

  // Get all shapes of a specific type
  function getTaskCards() {
    return editor
      .getCurrentPageShapes()
      .filter((s) => s.type === "task-card") as TaskCard[];
  }

  // Update a shape's properties
  function updateTaskStatus(shapeId: string, status: string) {
    editor.updateShape({
      id: shapeId,
      type: "task-card",
      props: { status },
    });
  }

  // Listen to selection changes
  function onSelectionChange(callback: (shapes: TLShape[]) => void) {
    return editor.store.listen(
      () => {
        const selectedIds = editor.getSelectedShapeIds();
        const shapes = selectedIds.map((id) => editor.getShape(id)!);
        callback(shapes);
      },
      { source: "user", scope: "session" }
    );
  }

  return {
    addTaskCard,
    exportAsImage,
    zoomToFit,
    getTaskCards,
    updateTaskStatus,
    onSelectionChange,
  };
}
```

### Multiplayer with Yjs

Add real-time collaboration using Yjs:

```tsx
// src/components/MultiplayerWhiteboard.tsx — Collaborative canvas with Yjs sync
import { Tldraw, useEditor } from "tldraw";
import { useYjsStore } from "@tldraw/yjs";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export function MultiplayerWhiteboard({ roomId }: { roomId: string }) {
  const doc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(
    () => new WebsocketProvider("wss://yjs.example.com", roomId, doc),
    [doc, roomId]
  );

  // useYjsStore bridges tldraw's store with Yjs for real-time sync
  const store = useYjsStore({
    yDoc: doc,
    provider,
    roomId,
  });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        store={store}
        // Users see each other's cursors and selections automatically
      />
    </div>
  );
}
```

### Snapshot and Restore

Save and load canvas state:

```typescript
// src/persistence/snapshots.ts — Save/load canvas state
import { Editor, TLStoreSnapshot } from "tldraw";

// Save the current canvas state as a JSON snapshot
function saveSnapshot(editor: Editor): TLStoreSnapshot {
  return editor.store.getSnapshot();
}

// Restore canvas from a saved snapshot
function loadSnapshot(editor: Editor, snapshot: TLStoreSnapshot) {
  editor.store.loadSnapshot(snapshot);
}

// Save to your backend
async function persistToServer(editor: Editor, documentId: string) {
  const snapshot = saveSnapshot(editor);
  await fetch(`/api/documents/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
}

// Auto-save on changes (debounced)
function setupAutoSave(editor: Editor, documentId: string) {
  let timeout: NodeJS.Timeout;
  editor.store.listen(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => persistToServer(editor, documentId), 2000);
  }, { source: "user", scope: "document" });
}
```

## Installation

```bash
npm install tldraw

# For multiplayer
npm install @tldraw/yjs yjs y-websocket
```

## Best Practices

1. **Full viewport container** — tldraw needs a container with explicit dimensions; `position: fixed; inset: 0` is the simplest approach
2. **Custom shapes for domain logic** — Don't force everything into draw/text; create shapes that represent your domain (tasks, nodes, cards)
3. **Use HTMLContainer for complex UI** — Custom shapes can render full React components, not just SVG
4. **Indicator for zoom performance** — Always implement `indicator()` — it renders when zoomed out instead of the full component
5. **Persist with snapshots** — Use `store.getSnapshot()` for server persistence; use Yjs for real-time sync
6. **Debounce auto-save** — Canvas changes fire rapidly during drawing; save every 2-3 seconds, not on every change
7. **Export as SVG, not PNG** — SVG exports are resolution-independent and much smaller in file size
8. **Test on touch devices** — tldraw supports touch natively, but custom shapes may need pointer event adjustments
