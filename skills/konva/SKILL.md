---
name: konva
category: Data Visualization
tags: [canvas, 2d, graphics, interactive, react, drawing, editor]
version: 1.0.0
author: terminal-skills
---

# Konva — 2D Canvas Graphics Framework

You are an expert in Konva, the 2D canvas library for building interactive graphics applications with React. You help developers create design editors, image annotators, flowchart builders, and interactive canvases with drag-and-drop, transformations, layering, and event handling — all rendered on HTML5 Canvas for high performance.

## Core Capabilities

### React Integration (react-konva)

```tsx
import { Stage, Layer, Rect, Circle, Text, Image, Transformer, Group } from "react-konva";
import { useState, useRef } from "react";

function DesignEditor() {
  const [shapes, setShapes] = useState([
    { id: "1", type: "rect", x: 50, y: 50, width: 200, height: 100, fill: "#4f46e5" },
    { id: "2", type: "circle", x: 400, y: 150, radius: 60, fill: "#22c55e" },
    { id: "3", type: "text", x: 100, y: 200, text: "Hello World", fontSize: 24, fill: "#000" },
  ]);
  const [selectedId, setSelectedId] = useState(null);
  const transformerRef = useRef(null);

  const handleDragEnd = (id, e) => {
    setShapes(shapes.map(s =>
      s.id === id ? { ...s, x: e.target.x(), y: e.target.y() } : s
    ));
  };

  return (
    <Stage width={800} height={600} onMouseDown={(e) => {
      // Deselect when clicking on empty area
      if (e.target === e.target.getStage()) setSelectedId(null);
    }}>
      <Layer>
        {shapes.map((shape) => {
          const Component = shape.type === "rect" ? Rect
            : shape.type === "circle" ? Circle : Text;

          return (
            <Component
              key={shape.id}
              {...shape}
              draggable
              onClick={() => setSelectedId(shape.id)}
              onDragEnd={(e) => handleDragEnd(shape.id, e)}
            />
          );
        })}

        {/* Transformer for resize/rotate */}
        {selectedId && (
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit minimum size
              if (newBox.width < 20 || newBox.height < 20) return oldBox;
              return newBox;
            }}
          />
        )}
      </Layer>
    </Stage>
  );
}
```

### Image Annotation

```tsx
function ImageAnnotator({ imageUrl }) {
  const [annotations, setAnnotations] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [newRect, setNewRect] = useState(null);

  const handleMouseDown = (e) => {
    const pos = e.target.getStage().getPointerPosition();
    setIsDrawing(true);
    setNewRect({ x: pos.x, y: pos.y, width: 0, height: 0, id: Date.now().toString() });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !newRect) return;
    const pos = e.target.getStage().getPointerPosition();
    setNewRect({
      ...newRect,
      width: pos.x - newRect.x,
      height: pos.y - newRect.y,
    });
  };

  const handleMouseUp = () => {
    if (newRect && Math.abs(newRect.width) > 10) {
      setAnnotations([...annotations, { ...newRect, label: "New Label" }]);
    }
    setIsDrawing(false);
    setNewRect(null);
  };

  return (
    <Stage width={800} height={600}
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}>
      <Layer>
        <KonvaImage image={loadedImage} />
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

### Export

```typescript
// Export canvas as image
const stage = stageRef.current;
const dataUrl = stage.toDataURL({ pixelRatio: 2 });  // 2x for retina

// Export as blob for upload
stage.toBlob({
  callback: (blob) => {
    const formData = new FormData();
    formData.append("image", blob, "design.png");
    fetch("/api/upload", { method: "POST", body: formData });
  },
  pixelRatio: 2,
});
```

## Installation

```bash
npm install konva react-konva
```

## Best Practices

1. **react-konva for React** — Use `react-konva` for declarative canvas rendering; maps React's component model to Konva shapes
2. **Layers for performance** — Separate static content (background, grid) from interactive content (draggable shapes) into different `<Layer>` components
3. **Transformer for manipulation** — Use `<Transformer>` for resize/rotate handles; it provides standard design tool interactions
4. **Hit detection** — Konva handles pixel-perfect hit detection; complex shapes respond correctly to clicks and hovers
5. **Virtual canvas for large scenes** — Use stage dragging and zooming for infinite canvas experiences; only render visible shapes
6. **Export at 2x** — Use `pixelRatio: 2` when exporting for retina displays; images look crisp on all screens
7. **Undo/redo with state** — Store shape state in an array; implement undo/redo by navigating the state history
8. **Performance** — Konva handles thousands of shapes on Canvas; for 10K+ shapes, use `listening: false` on static elements
