---
name: excalidraw
description: Excalidraw is an open-source virtual whiteboard, shipped as a React component, for hand-drawn style diagrams. Use it to embed a whiteboard in a React or Next.js app, generate diagrams from code or Mermaid text, export PNG/SVG/.excalidraw files, or wire up collaboration. Triggers - "add Excalidraw to my app", "generate an architecture diagram", "export a diagram as SVG".
license: Apache-2.0
compatibility: "React 17, 18 or 19; @excalidraw/excalidraw 0.18.x; a browser (no server-side rendering)"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/excalidraw/excalidraw
  tags: "whiteboard, diagrams, sketching, collaboration, react"
---

# Excalidraw — Hand-Drawn Whiteboard SDK

## Overview

Excalidraw is an open-source whiteboard that ships on npm as `@excalidraw/excalidraw`, a React component (latest stable 0.18.1; React 17, 18 and 19 are supported peers). It stores a scene as a plain JSON array of elements, so diagrams can be drawn by hand, generated from code, converted from Mermaid, exported as PNG/SVG, and kept in git as `.excalidraw` files.

Three things changed in 0.18 and break older snippets: the stylesheet must be imported explicitly, the `ref` prop was replaced by an `excalidrawAPI` callback prop, and types moved to `@excalidraw/excalidraw/types` and `@excalidraw/excalidraw/element/types`. The editor needs a browser, so it cannot render on the server.

## Instructions

### Install and embed

```bash
npm install react react-dom @excalidraw/excalidraw
```

```tsx
// src/components/Whiteboard.tsx
import { useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export function Whiteboard() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const onChange = (elements: readonly OrderedExcalidrawElement[], state: AppState) => {
    // fires on every pointer move while drawing: debounce before saving
    console.log(`${elements.length} elements, tool: ${state.activeTool.type}`);
  };

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <Excalidraw
        excalidrawAPI={(instance) => setApi(instance)}
        onChange={onChange}
        initialData={{ appState: { viewBackgroundColor: "#fafafa" }, scrollToContent: true }}
        UIOptions={{ canvasActions: { loadScene: true, export: { saveFileToDisk: true } } }}
      />
    </div>
  );
}
```

The component fills 100% of its parent, so the parent needs a non-zero height. Fonts are fetched from a CDN by default; to self-host, copy the contents of `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into your public folder and set `window.EXCALIDRAW_ASSET_PATH = "/"` before the editor loads.

### Next.js (App Router)

Excalidraw touches `window`, so load it client-side only:

```tsx
// app/board/page.tsx
"use client";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

export default function BoardPage() {
  return <div style={{ height: "100vh" }}><Excalidraw /></div>;
}
```

For anything besides the `Excalidraw` component (helpers like `convertToExcalidrawElements`), put them in a wrapper component and import that wrapper dynamically.

### Generate elements with the skeleton API

Do not hand-write full element objects (they need `seed`, `version`, `versionNonce`, `index`, and more). Write skeletons and let `convertToExcalidrawElements` fill in the rest, including bound text and arrow bindings:

```tsx
// src/diagrams/architecture.ts
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

const fills: Record<string, string> = {
  api: "#a5d8ff", database: "#b2f2bb", queue: "#ffec99", cache: "#ffc9c9", frontend: "#d0bfff",
};

type Service = { id: string; label: string; kind: keyof typeof fills; x: number; y: number };

export function architectureElements(services: Service[], links: [string, string][]) {
  return convertToExcalidrawElements([
    ...services.map((s) => ({
      type: "rectangle" as const,
      id: s.id,
      x: s.x,
      y: s.y,
      width: 200,
      height: 80,
      backgroundColor: fills[s.kind],
      fillStyle: "solid" as const,
      roughness: 1,
      roundness: { type: 3 as const },
      label: { text: `${s.label}\n(${s.kind})`, fontSize: 16 },
    })),
    ...links.map(([from, to]) => ({
      type: "arrow" as const,
      x: 0,
      y: 0,
      start: { id: from },
      end: { id: to },
      endArrowhead: "arrow" as const,
    })),
  ]);
}

// api.updateScene({ elements: architectureElements(services, links) });
// api.scrollToContent(undefined, { fitToContent: true });
```

Arrows with `start`/`end` ids are positioned and bound to the shapes automatically. Other skeleton types include `ellipse`, `diamond`, `text`, `line`, `image`, `frame` and, in the unreleased master branch, `stickynote`.

### Mermaid to Excalidraw

`@excalidraw/mermaid-to-excalidraw` (the package behind the editor's Mermaid dialog) turns Mermaid text into skeleton elements; flowcharts are converted to editable shapes:

```tsx
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

const { elements, files } = await parseMermaidToExcalidraw(
  "flowchart LR\n  Browser --> API --> Postgres",
);
api.updateScene({ elements: convertToExcalidrawElements(elements) });
if (files) api.addFiles(Object.values(files));
```

Check the package README for which diagram types are supported; unsupported ones are not converted to shapes.

### Export and import

In 0.18 the export helpers read options from `appState` (the unreleased master branch replaces them with a single `exportScene`; check the version you installed):

```ts
// src/utils/export.ts
import { exportToBlob, exportToSvg, serializeAsJSON, loadFromBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export async function downloadPng(api: ExcalidrawImperativeAPI) {
  const blob = await exportToBlob({
    elements: api.getSceneElements(),
    appState: { ...api.getAppState(), exportWithDarkMode: false, exportBackground: true },
    files: api.getFiles(),
    mimeType: "image/png",
    getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
  });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: "architecture.png" }).click();
  URL.revokeObjectURL(url);
}

export async function sceneToSvgString(api: ExcalidrawImperativeAPI) {
  const svg = await exportToSvg({
    elements: api.getSceneElements(),
    appState: { exportWithDarkMode: false, exportEmbedScene: true },
    files: api.getFiles(),
  });
  return svg.outerHTML;
}

export function sceneToJson(api: ExcalidrawImperativeAPI) {
  return serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
}

export async function openExcalidrawFile(api: ExcalidrawImperativeAPI, file: File) {
  const scene = await loadFromBlob(file, null, null);   // runs restore() on old files
  api.updateScene({ elements: scene.elements, appState: scene.appState });
  api.addFiles(Object.values(scene.files));
}
```

With `exportEmbedScene: true` the scene JSON is stored inside the SVG or PNG, so the exported image can be dropped back into Excalidraw and edited.

### Collaboration

The npm package has no built-in backend. `isCollaborating` and `LiveCollaborationTrigger` only change the UI; you provide the transport (the public app uses Socket.IO with the `excalidraw-room` server and end-to-end encrypted payloads). The pieces you wire up:

- `onChange` to send local changes and `onPointerUpdate` to send cursors;
- `reconcileElements(local, remote, appState)` to merge incoming elements by version;
- `api.updateScene({ elements, collaborators })` to apply them, where `collaborators` is a `Map` of socket id to `{ pointer, username }`.

```tsx
import { Excalidraw, LiveCollaborationTrigger } from "@excalidraw/excalidraw";

<Excalidraw
  excalidrawAPI={setApi}
  isCollaborating={connected}
  renderTopRightUI={() => (
    <LiveCollaborationTrigger isCollaborating={connected} onSelect={() => setShareOpen(true)} />
  )}
/>
```

Excalidraw+ is the hosted commercial product from the same team; it is not something you enable from this package.

## Examples

### Example 1: Add a whiteboard page to a Next.js app

**User request:** "Add an Excalidraw board at /board to my Next.js 15 app and save the scene to localStorage."

Install the package, create `app/board/page.tsx` as in the Next.js section (`"use client"`, `dynamic` with `ssr: false`, the CSS import), and persist with a debounced `onChange`:

```tsx
const save = useMemo(() => debounce((els: readonly OrderedExcalidrawElement[]) => {
  localStorage.setItem("board-v1", JSON.stringify(els));
}, 500), []);
// <Excalidraw initialData={{ elements: JSON.parse(localStorage.getItem("board-v1") ?? "[]") }} onChange={save} />
```

Result: `/board` shows a full-height editor with the standard toolbar; reloading restores the drawing. If the canvas is blank, the parent has no height; if the toolbar is unstyled, the CSS import is missing.

### Example 2: Draw a service map from a list

**User request:** "Generate an Excalidraw diagram of web, api, redis and postgres with arrows between them, and export it as SVG."

Call `architectureElements` with four services at x = 0, 300, 600 (y = 0 and 160) and links `web→api`, `api→redis`, `api→postgres`, pass the result to `api.updateScene`, then `sceneToSvgString(api)`. The result is four coloured boxes with centred labels and three bound arrows; moving a box in the editor drags its arrows with it.

## Guidelines

1. **Import `@excalidraw/excalidraw/index.css`** — without it the toolbar and dialogs render unstyled.
2. **Use `excalidrawAPI={...}`, not `ref`** — 0.18 removed the ref; the callback gives you `updateScene`, `getSceneElements`, `getFiles`, `scrollToContent`.
3. **Prefer skeletons** — `convertToExcalidrawElements` generates ids, seeds, bindings and text containers; hand-built elements missing required fields break on load.
4. **Debounce `onChange`** — it fires continuously during drags; persist at most every 500 ms.
5. **Fonts** — default is Excalifont (`FONT_FAMILY.Excalifont`, 5); Virgil is 1, Helvetica 2, Cascadia 3. Use the exported `FONT_FAMILY` constant instead of numbers.
6. **`roughness`** — 0 is clean, 1 hand-drawn, 2 very rough; a fixed `seed` makes the wobble reproducible.
7. **Render client-side only** — use `dynamic(..., { ssr: false })` in Next.js; lazy-load because the bundle is large.
8. **Commit `.excalidraw` files** — they are JSON and diff well; export SVG/PNG with `exportEmbedScene` so they stay editable.
9. **Pin the version** — master already contains breaking export changes (`exportScene`) that are not in 0.18.1.
