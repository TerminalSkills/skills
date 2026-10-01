---
name: konva
description: >-
  Builds interactive 2D canvas applications with Konva, a JavaScript library that draws shapes, text and images on HTML5 Canvas with layers, events and drag-and-drop. Use when a user asks to create drawing tools, image editors, interactive graphics, drag-and-drop interfaces, or canvas-based UIs using Konva or react-konva.
license: Apache-2.0
compatibility: "Konva 10 (ES modules) in modern browsers. react-konva 19.3 needs React 19.3 (react-konva 19.2 for React 19.2, react-konva@18 for React 18). Rendering in Node.js needs the canvas or skia-canvas package."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["canvas", "2d", "graphics", "interactive", "react"]
  repository: https://github.com/konvajs/konva
---
# Konva — 2D Canvas Graphics Framework

## Overview

Konva is a 2D canvas library for interactive graphics: a scene graph of stage, layers, groups and shapes with hit detection, drag-and-drop, transforms, animation and export, all rendered on HTML5 Canvas. It works as plain JavaScript and, through `react-konva`, as declarative React components — the usual base for design editors, image annotators, flowchart builders and whiteboards.

Konva 10 (September 2025) is ESM-only and no longer loads a Node.js canvas by itself; the current release is 10.7.0. `react-konva` versions follow React: the major version must match, and react-konva 19.3 needs React 19.3 or newer — the unpinned install fails with `ERESOLVE` on React 19.2 and 18.

## Instructions

### Installation

```bash
npm install konva react-konva            # React 19.3 (react-konva 19.3)
npm install konva react-konva@19.2       # React 19.2
npm install konva react-konva@18         # React 18
npm install use-image                    # hook that loads an image for <Image>
```

Without a bundler, load `https://unpkg.com/konva@10/konva.min.js` with a `<script>` tag; it defines the global `Konva`. In CommonJS, Konva 10 is `require("konva").default`.

### Plain JavaScript

```js
import Konva from "konva";

const stage = new Konva.Stage({ container: "seat-map", width: 640, height: 360 });  // id of a <div>
const layer = new Konva.Layer();
stage.add(layer);

for (let col = 0; col < 8; col++) {
  const seat = new Konva.Circle({
    x: 80 + col * 68, y: 70, radius: 22,
    fill: "#e5e7eb", stroke: "#6b7280", name: "seat", id: `A${col + 1}`,
  });
  // Changing an attribute redraws the layer; no manual draw() call is needed
  seat.on("click tap", () => seat.fill(seat.fill() === "#22c55e" ? "#e5e7eb" : "#22c55e"));
  layer.add(seat);
}

const selected = () => stage.find(".seat").filter((s) => s.fill() === "#22c55e").map((s) => s.id());
```

Selectors work like CSS: `"#A3"` by id, `".seat"` by name, `"Circle"` by class.

### React Integration (react-konva)

```tsx
import { Stage, Layer, Rect, Circle, Text, Transformer } from "react-konva";
import { useEffect, useRef, useState } from "react";
import type Konva from "konva";

type Shape = { id: string; type: "rect" | "circle" | "text"; x: number; y: number; rotation?: number;
  width?: number; height?: number; radius?: number; text?: string; fontSize?: number; fill: string };

function DesignEditor() {
  const [shapes, setShapes] = useState<Shape[]>([
    { id: "card", type: "rect", x: 50, y: 50, width: 200, height: 100, fill: "#4f46e5" },
    { id: "badge", type: "circle", x: 400, y: 150, radius: 60, fill: "#22c55e" },
    { id: "title", type: "text", x: 100, y: 200, text: "Spring Sale", fontSize: 24, fill: "#111827" },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // A Transformer shows nothing until it is given the nodes to control
  useEffect(() => {
    const node = selectedId ? layerRef.current?.findOne("#" + selectedId) : null;
    transformerRef.current?.nodes(node ? [node] : []);
  }, [selectedId]);

  const update = (id: string, attrs: Partial<Shape>) =>
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...attrs } : s)));

  return (
    <Stage width={800} height={600} onMouseDown={(e) => {
      // Deselect when clicking on empty area
      if (e.target === e.target.getStage()) setSelectedId(null);
    }}>
      <Layer ref={layerRef}>
        {shapes.map(({ type, ...attrs }) => {
          const Component: React.ElementType = type === "rect" ? Rect : type === "circle" ? Circle : Text;
          return (
            <Component
              key={attrs.id}
              {...attrs}
              draggable
              onClick={() => setSelectedId(attrs.id)}
              onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
                update(attrs.id, { x: e.target.x(), y: e.target.y() })}
              onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
                // Transformer changes scale, not size: fold the scale back into the size
                const node = e.target;
                const scaleX = node.scaleX(), scaleY = node.scaleY();
                node.scale({ x: 1, y: 1 });
                update(attrs.id, {
                  x: node.x(), y: node.y(), rotation: node.rotation(),
                  ...(type === "rect" && { width: node.width() * scaleX, height: node.height() * scaleY }),
                  ...(type === "circle" && { radius: (attrs.radius ?? 0) * scaleX }),
                  ...(type === "text" && { fontSize: (attrs.fontSize ?? 12) * scaleY }),
                });
              }}
            />
          );
        })}

        {/* Transformer for resize/rotate */}
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) =>
            // Limit minimum size
            newBox.width < 20 || newBox.height < 20 ? oldBox : newBox}
        />
      </Layer>
    </Stage>
  );
}
```

### Image Annotation

```tsx
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage } from "react-konva";
import { useRef, useState } from "react";
import useImage from "use-image";
import type Konva from "konva";

type Box = { id: string; x: number; y: number; width: number; height: number; label?: string };

function ImageAnnotator({ imageUrl }: { imageUrl: string }) {
  const [image] = useImage(imageUrl, "anonymous");   // CORS mode keeps the canvas exportable
  const [annotations, setAnnotations] = useState<Box[]>([]);
  const [newRect, setNewRect] = useState<Box | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) setNewRect({ x: pos.x, y: pos.y, width: 0, height: 0, id: crypto.randomUUID() });
  };
  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!newRect || !pos) return;
    setNewRect({ ...newRect, width: pos.x - newRect.x, height: pos.y - newRect.y });
  };
  const handleMouseUp = () => {
    if (newRect && Math.abs(newRect.width) > 10 && Math.abs(newRect.height) > 10) {
      // Dragging up or left gives negative sizes: store a normalized box
      setAnnotations([...annotations, {
        id: newRect.id, label: "New Label",
        x: Math.min(newRect.x, newRect.x + newRect.width),
        y: Math.min(newRect.y, newRect.y + newRect.height),
        width: Math.abs(newRect.width), height: Math.abs(newRect.height),
      }]);
    }
    setNewRect(null);
  };

  return (
    <Stage ref={stageRef} width={800} height={600}
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}>
      <Layer listening={false}>
        <KonvaImage image={image} width={800} height={600} />
      </Layer>
      <Layer>
        {annotations.map((ann) => (
          <Group key={ann.id}>
            <Rect {...ann} stroke="#ef4444" strokeWidth={2} fill="rgba(239,68,68,0.1)" />
            <Text x={ann.x} y={ann.y - 20} text={ann.label} fill="#ef4444" fontSize={14} />
          </Group>
        ))}
        {newRect && <Rect {...newRect} stroke="#4f46e5" strokeWidth={2} dash={[5, 5]} />}
      </Layer>
    </Stage>
  );
}
```

`react-konva` exports its image shape as `Image`, which shadows the browser's `Image` constructor — import it under another name. The `image` prop takes a loaded `HTMLImageElement` (or canvas or video), never a URL.

### Export

```typescript
// Export canvas as image
const stage = stageRef.current;
const dataUrl = stage.toDataURL({ pixelRatio: 2 });  // 2x for retina

// Export as blob for upload — toBlob() returns a Promise (the `callback` option still works)
const blob = await stage.toBlob({ pixelRatio: 2 });
const formData = new FormData();
formData.append("image", blob, "design.png");
await fetch("/api/upload", { method: "POST", body: formData });
```

Both calls fail with `SecurityError` ("Tainted canvases may not be exported") once the canvas contains an image from another origin that was loaded without CORS; load such images with `useImage(url, "anonymous")` from a server that sends `Access-Control-Allow-Origin`.

## Examples

### Example 1: Zoom and pan a whiteboard

**User request:** "Our react-konva board needs zoom with the mouse wheel, centred on the cursor, and panning by dragging the background."

```tsx
import { Stage, Layer, Rect, Text } from "react-konva";
import type Konva from "konva";

const notes = [
  { id: "n1", x: 120, y: 90, text: "Interview 5 customers", fill: "#fde68a" },
  { id: "n2", x: 380, y: 210, text: "Ship pricing page", fill: "#bbf7d0" },
];

export function ZoomableBoard() {
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();                       // keep the page from scrolling
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const oldScale = stage.scaleX();
    const newScale = Math.min(8, Math.max(0.2, e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1));
    // The point under the cursor must stay under the cursor
    const anchor = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: pointer.x - anchor.x * newScale, y: pointer.y - anchor.y * newScale });
  };
  return (
    <Stage width={window.innerWidth} height={window.innerHeight} draggable onWheel={handleWheel}>
      <Layer>
        {notes.map((n) => (
          <Rect key={n.id} x={n.x} y={n.y} width={180} height={120} fill={n.fill} cornerRadius={8} />
        ))}
        {notes.map((n) => (
          <Text key={n.id} x={n.x + 12} y={n.y + 12} width={156} text={n.text} fontSize={18} listening={false} />
        ))}
      </Layer>
    </Stage>
  );
}
```

Result: one wheel notch up with the cursor at (210, 150) changes the stage scale from 1 to 1.1 and its position to (-21, -15), so the note under the cursor stays put. Scrolling out stops at 0.2, scrolling in at 8. Dragging anywhere moves the whole board because the stage itself is `draggable`.

### Example 2: Render a share image on the server

**User request:** "Generate a 1200×630 PNG for each changelog post in our Node build script, with the same Konva code we use in the browser."

```js
// render-card.mjs — setup: npm install konva skia-canvas — run: node render-card.mjs
import Konva from "konva";
import "konva/skia-backend";            // or "konva/canvas-backend" with the canvas package
import { writeFile } from "node:fs/promises";

const stage = new Konva.Stage({ width: 1200, height: 630 });   // no `container` on the server
const layer = new Konva.Layer();
stage.add(layer);

layer.add(new Konva.Rect({ width: 1200, height: 630, fill: "#0f172a" }));
layer.add(new Konva.Circle({ x: 1050, y: 120, radius: 220, fill: "#4f46e5", opacity: 0.6 }));
layer.add(new Konva.Text({
  x: 80, y: 220, width: 900,
  text: "Shipping changelog: week 40",
  fontSize: 72, fontStyle: "bold", fill: "#f8fafc",
}));

// toBlob() needs a browser canvas; toDataURL() works with both Node backends
const png = Buffer.from(stage.toDataURL().split(",")[1], "base64");
await writeFile("og-week-40.png", png);
console.log("og-week-40.png", png.length, "bytes");
```

Result: the script prints `og-week-40.png` with its size (about 29 KB) and writes a 1200×630 PNG with the dark background, the purple circle in the top-right corner and the white headline wrapped onto two lines. Without the backend import, Konva 10 stops with "Konva.js unsupported environment".

## Guidelines

1. **react-konva for React** — Use `react-konva` for declarative canvas rendering; it maps React's component model to Konva shapes. It works in browsers only, not in React Native
2. **Layers for performance** — Separate static content (background, grid) from interactive content (draggable shapes) into different `<Layer>` components, but stay at three to five: every layer is a separate `<canvas>` element with its own memory
3. **Transformer for manipulation** — Use `<Transformer>` for resize/rotate handles and attach nodes with `transformer.nodes([...])`; it changes `scaleX`/`scaleY`, so reset the scale and store real sizes in `onTransformEnd`
4. **Hit detection** — Konva handles pixel-perfect hit detection; complex shapes respond correctly to clicks and hovers
5. **Large scenes** — Use stage dragging and zooming for infinite canvas experiences; Konva does not skip off-screen shapes by itself, so set `visible={false}` on shapes outside the viewport or do not render them
6. **Export at 2x** — Use `pixelRatio: 2` when exporting for retina displays; images look crisp on all screens
7. **Undo/redo with state** — Store shape state in an array; implement undo/redo by navigating the state history
8. **Performance** — For thousands of shapes set `listening={false}` on static shapes or whole layers, `perfectDrawEnabled={false}` on shapes with fill, stroke and opacity, and `cache()` complex groups
9. **Next.js** — Konva 10 works in a Client Component (`"use client"`) without extra setup; Konva 9 and older need the `canvas` package installed or the component loaded with `dynamic(..., { ssr: false })`
10. **State after drag** — react-konva updates only the props that change in render, so after a drag or resize the new position and scale live in the Konva node, not in your state; write them back in `onDragEnd` and `onTransformEnd` or saved data will be stale
11. **When not to use Konva** — for static charts use a chart library or SVG; for text-heavy or accessible UI use DOM elements, since canvas content is invisible to screen readers and browser search
