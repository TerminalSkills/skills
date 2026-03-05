---
name: excalidraw
category: Real-Time & Collaboration
tags: [whiteboard, diagrams, sketching, collaboration, react, hand-drawn]
version: 1.0.0
author: terminal-skills
---

# Excalidraw — Hand-Drawn Whiteboard SDK

You are an expert in Excalidraw, the open-source virtual whiteboard library for creating hand-drawn style diagrams and sketches. You help developers embed Excalidraw in React applications, build custom integrations, and leverage the API for programmatic diagram creation.

## Core Capabilities

### Basic Embedding

Add an Excalidraw whiteboard to any React application:

```tsx
// src/components/Whiteboard.tsx — Embed Excalidraw in a React app
import { Excalidraw } from "@excalidraw/excalidraw";
import { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { AppState } from "@excalidraw/excalidraw/types/types";
import { useState, useCallback } from "react";

export function Whiteboard() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], state: AppState) => {
      // Called on every change — debounce before persisting
      console.log(`${elements.length} elements on canvas`);
    },
    []
  );

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <Excalidraw
        ref={(api) => setExcalidrawAPI(api)}
        onChange={handleChange}
        initialData={{
          appState: {
            viewBackgroundColor: "#fafafa",
            currentItemFontFamily: 1,    // 1 = Virgil (hand-drawn), 2 = Helvetica, 3 = Cascadia
          },
        }}
        UIOptions={{
          canvasActions: {
            loadScene: true,
            export: { saveFileToDisk: true },
            toggleTheme: true,
          },
        }}
      />
    </div>
  );
}
```

### Programmatic Scene Creation

Generate diagrams from code or data:

```typescript
// src/diagrams/architecture.ts — Generate architecture diagrams programmatically
import { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

interface ServiceNode {
  name: string;
  type: "api" | "database" | "queue" | "cache" | "frontend";
  x: number;
  y: number;
}

function createServiceBox(service: ServiceNode): ExcalidrawElement {
  const colors: Record<string, string> = {
    api: "#a5d8ff",        // Blue for APIs
    database: "#b2f2bb",   // Green for databases
    queue: "#ffec99",      // Yellow for queues
    cache: "#ffc9c9",      // Red for caches
    frontend: "#d0bfff",   // Purple for frontends
  };

  return {
    type: "rectangle",
    id: `service-${service.name}`,
    x: service.x,
    y: service.y,
    width: 200,
    height: 80,
    strokeColor: "#1e1e1e",
    backgroundColor: colors[service.type] || "#e9ecef",
    fillStyle: "solid",
    strokeWidth: 2,
    roughness: 1,            // 0 = smooth, 1 = hand-drawn, 2 = very rough
    roundness: { type: 3, value: 8 },
    isDeleted: false,
    boundElements: null,
    locked: false,
    opacity: 100,
    angle: 0,
    seed: Math.floor(Math.random() * 100000),  // Random seed for hand-drawn variation
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    groupIds: [],
    frameId: null,
    link: null,
    updated: Date.now(),
  } as any;
}

function createArrow(
  fromId: string, toId: string,
  startX: number, startY: number,
  endX: number, endY: number,
  label?: string
): ExcalidrawElement {
  return {
    type: "arrow",
    id: `arrow-${fromId}-${toId}`,
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY,
    strokeColor: "#1e1e1e",
    strokeWidth: 2,
    roughness: 1,
    points: [[0, 0], [endX - startX, endY - startY]],
    startBinding: { elementId: fromId, focus: 0, gap: 4 },
    endBinding: { elementId: toId, focus: 0, gap: 4 },
    startArrowhead: null,
    endArrowhead: "arrow",
    isDeleted: false,
    opacity: 100,
    angle: 0,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    groupIds: [],
    boundElements: null,
    locked: false,
    frameId: null,
    link: null,
    updated: Date.now(),
  } as any;
}

// Generate a full architecture diagram
export function generateArchitectureDiagram(services: ServiceNode[], connections: [string, string][]) {
  const elements: ExcalidrawElement[] = [];

  // Create service boxes
  for (const service of services) {
    elements.push(createServiceBox(service));

    // Add label text
    elements.push({
      type: "text",
      id: `label-${service.name}`,
      x: service.x + 20,
      y: service.y + 25,
      width: 160,
      height: 30,
      text: `${service.name}\n(${service.type})`,
      fontSize: 16,
      fontFamily: 1,           // Virgil hand-drawn font
      textAlign: "center",
      verticalAlign: "middle",
      strokeColor: "#1e1e1e",
      isDeleted: false,
      opacity: 100,
      angle: 0,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      groupIds: [],
      boundElements: null,
      locked: false,
      frameId: null,
      link: null,
      updated: Date.now(),
      containerId: `service-${service.name}`,
    } as any);
  }

  // Create arrows for connections
  for (const [from, to] of connections) {
    const fromService = services.find(s => s.name === from)!;
    const toService = services.find(s => s.name === to)!;
    elements.push(createArrow(
      `service-${from}`, `service-${to}`,
      fromService.x + 200, fromService.y + 40,
      toService.x, toService.y + 40,
    ));
  }

  return elements;
}
```

### Export and Import

Save diagrams as files, images, or shareable links:

```typescript
// src/utils/export.ts — Export Excalidraw scenes in various formats
import { exportToBlob, exportToSvg, serializeAsJSON } from "@excalidraw/excalidraw";

async function exportAsPNG(excalidrawAPI: any) {
  const elements = excalidrawAPI.getSceneElements();
  const appState = excalidrawAPI.getAppState();

  const blob = await exportToBlob({
    elements,
    appState: { ...appState, exportWithDarkMode: false },
    files: excalidrawAPI.getFiles(),
    getDimensions: () => ({ width: 1920, height: 1080, scale: 2 }),  // 2x for retina
  });

  // Download the image
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "diagram.png";
  link.click();
  URL.revokeObjectURL(url);
}

async function exportAsSVG(excalidrawAPI: any) {
  const elements = excalidrawAPI.getSceneElements();
  const svg = await exportToSvg({
    elements,
    appState: { exportWithDarkMode: false },
    files: excalidrawAPI.getFiles(),
  });
  return svg.outerHTML;   // Returns SVG as string
}

function saveAsExcalidrawFile(excalidrawAPI: any) {
  const elements = excalidrawAPI.getSceneElements();
  const appState = excalidrawAPI.getAppState();
  const json = serializeAsJSON(elements, appState, excalidrawAPI.getFiles(), "local");

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "diagram.excalidraw";
  link.click();
}

// Load from .excalidraw file
async function loadFromFile(excalidrawAPI: any, file: File) {
  const text = await file.text();
  const data = JSON.parse(text);
  excalidrawAPI.updateScene({
    elements: data.elements,
    appState: data.appState,
  });
}
```

### Collaboration with Excalidraw+

Set up real-time collaboration:

```tsx
// src/components/CollaborativeBoard.tsx — Real-time whiteboard with collaboration
import { Excalidraw, LiveCollaborationTrigger } from "@excalidraw/excalidraw";

export function CollaborativeBoard({ roomId }: { roomId: string }) {
  return (
    <div style={{ height: "100vh" }}>
      <Excalidraw
        isCollaborating={true}
        // Custom collaboration backend using WebSocket
        onCollabButtonClick={() => {
          // Open share dialog or copy room link
          const link = `${window.location.origin}/board/${roomId}`;
          navigator.clipboard.writeText(link);
        }}
        renderTopRightUI={() => (
          <LiveCollaborationTrigger
            isCollaborating={true}
            onSelect={() => {}}
          />
        )}
      />
    </div>
  );
}
```

## Installation

```bash
npm install @excalidraw/excalidraw

# Peer dependencies
npm install react react-dom
```

## Best Practices

1. **Container must have dimensions** — Excalidraw expands to fill its container; ensure explicit height/width
2. **Debounce onChange** — Canvas fires updates on every mouse move during drawing; debounce to 500ms for persistence
3. **Use roughness for style** — `roughness: 0` for clean diagrams, `1` for hand-drawn feel, `2` for sketch style
4. **Seed for consistency** — Same seed = same hand-drawn variation; use deterministic seeds for reproducible diagrams
5. **Export SVG for docs** — SVG exports are resolution-independent and embed well in documentation
6. **Lazy load the component** — Excalidraw bundle is ~1MB; use `React.lazy()` to avoid blocking initial page load
7. **Use frames for grouping** — Frames in Excalidraw act as containers; export individual frames as separate images
8. **Store .excalidraw files in git** — The JSON format is text-based and diffs well in version control
