---
name: xyflow
description: >-
  xyflow is the library family behind React Flow (@xyflow/react) and Svelte Flow (@xyflow/svelte) for building node-based editors: draggable nodes, connectable edges, zoom and pan. Use when a user asks to "build a workflow editor", "add a node graph or flowchart to the app", "make a drag-and-drop pipeline builder", "create custom nodes with handles", or "save and restore a React Flow diagram". Covers v12 setup, controlled state, custom nodes, handles, providers and persistence.
license: Apache-2.0
compatibility: "React 17+ for @xyflow/react, Svelte 5.25+ for @xyflow/svelte"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "react-flow, xyflow, node-editor, workflow, diagram"
  repository: https://github.com/xyflow/xyflow
---

# xyflow — node-based editors for React and Svelte

## Overview

xyflow is the monorepo that publishes two libraries with the same ideas: **React Flow** as `@xyflow/react` and **Svelte Flow** as `@xyflow/svelte`. Both render an interactive canvas where `nodes` (with a position and `data`) are joined by `edges` (with a `source` and `target`), and both bring zoom, pan, selection, dragging and connecting out of the box, plus `Background`, `Controls` and `MiniMap` helpers.

The package name matters. Version 12 of React Flow is published as `@xyflow/react` and exports `ReactFlow` as a named export. The older unscoped `reactflow` package is the legacy v11 line, whose API differs (default export, `reactflow/dist/style.css`); do not mix examples between them. This skill documents `@xyflow/react` first and `@xyflow/svelte` in a short section.

The library draws the graph and handles interaction. It does not execute a workflow, lay nodes out automatically, or save anything; those parts belong to your code (or to a layout library such as dagre or elkjs).

## Instructions

### Installation

```bash
npm install @xyflow/react
```

For Svelte 5:

```bash
npm install @xyflow/svelte
```

The stylesheet is mandatory; without it nodes and edges render unstyled:

```typescript
import '@xyflow/react/dist/style.css';
```

`<ReactFlow />` fills its parent. The parent must have an explicit height, otherwise the canvas is 0 pixels tall and nothing shows.

### A controlled flow

`useNodesState` and `useEdgesState` give you state plus the change handlers the component needs for dragging, selecting and deleting. `addEdge` turns a finished connection into an edge.

```tsx
import { useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: 'webhook', position: { x: 0, y: 0 }, data: { label: 'Webhook' }, type: 'input' },
  { id: 'summarize', position: { x: 0, y: 120 }, data: { label: 'Summarize ticket' } },
];
const initialEdges: Edge[] = [{ id: 'webhook-summarize', source: 'webhook', target: 'summarize' }];

export default function Flow() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onConnect: OnConnect = useCallback((c) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

Built-in node types are `default`, `input` and `output`. Node ids and edge ids must be unique strings. Pass `colorMode="system"` (or `"dark"`/`"light"`) for theming.

### Custom nodes and handles

A custom node is a React component registered under a `type`. A `Handle` is a connection point: `type="source"` starts a connection, `type="target"` receives one. Define the `nodeTypes` object outside the component (or memoise it); creating it inside the render function makes React Flow log a warning that you created a new nodeTypes object.

```tsx
import { Handle, Position, type Node, type NodeProps, type NodeTypes } from '@xyflow/react';

type StepData = { label: string; kind: 'trigger' | 'llm' | 'action' };
type StepNode = Node<StepData, 'step'>;

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  return (
    <div className={selected ? 'step step-selected' : 'step'}>
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} />}
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const nodeTypes: NodeTypes = { step: StepNodeView };
```

Use it with `<ReactFlow nodeTypes={nodeTypes} ... />` and nodes shaped `{ id, type: 'step', position, data: { label, kind } }`. Give a node several handles by adding an `id` to each `Handle`, then reference it from an edge with `sourceHandle` or `targetHandle`. Add the CSS class `nodrag` to inputs and buttons inside a node so that typing or clicking does not drag the node.

### Hooks need a provider

Hooks such as `useReactFlow`, `useNodes` and `useNodeId` only work below a `<ReactFlowProvider>`, or inside the `<ReactFlow>` tree itself. If a toolbar outside the canvas needs them, wrap both:

```tsx
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

function SaveButton() {
  const { toObject, fitView, screenToFlowPosition, updateNodeData } = useReactFlow();
  return <button onClick={() => localStorage.setItem('flow', JSON.stringify(toObject()))}>Save</button>;
}

export default function App() {
  return (
    <ReactFlowProvider>
      <SaveButton />
      <Flow />
    </ReactFlowProvider>
  );
}
```

`toObject()` returns `{ nodes, edges, viewport }`, which is what to persist. To restore, pass the saved nodes and edges as the initial state and the viewport through `defaultViewport`. `updateNodeData(id, { ... })` merges new data into one node, which is how a settings panel edits the selected node. `screenToFlowPosition({ x, y })` converts a mouse position to canvas coordinates, which you need when dropping a new node from a palette.

### Validating connections

```tsx
<ReactFlow
  isValidConnection={(c) => c.source !== c.target}
  onConnect={onConnect}
  /* nodes, edges, handlers as above */
/>
```

Return `false` to refuse a connection (here, self-loops). For rules that depend on node kinds, look the nodes up in your own state by `c.source` and `c.target`.

### Svelte Flow

Svelte Flow targets Svelte 5. Hold `nodes` and `edges` in `$state.raw` (deep reactivity is slow for large graphs) and bind them:

```svelte
<script lang="ts">
  import { SvelteFlow, Controls, MiniMap, Background, BackgroundVariant } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';

  let nodes = $state.raw([
    { id: '1', position: { x: 0, y: 0 }, data: { label: 'Webhook' } },
    { id: '2', position: { x: 0, y: 100 }, data: { label: 'Summarize ticket' } },
  ]);
  let edges = $state.raw([{ id: 'e1-2', source: '1', target: '2' }]);
</script>

<div style:width="100vw" style:height="100vh">
  <SvelteFlow bind:nodes bind:edges fitView colorMode="system">
    <Controls />
    <MiniMap />
    <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
  </SvelteFlow>
</div>
```

Older Svelte Flow examples that use `writable` stores and `on:nodeclick` belong to a previous version; follow the Svelte 5 pattern above.

## Examples

### 1. A support-ticket pipeline editor

User request: "Give ops a canvas where they connect a webhook trigger to LLM and email steps, and keep what they build."

```bash
npm install @xyflow/react
```

Register the `step` node type from the section above, render `Flow` inside `ReactFlowProvider`, and add a `SaveButton` that stores `toObject()`. On load, read the stored JSON and use it as initial state:

```tsx
const saved = JSON.parse(localStorage.getItem('flow') ?? 'null') as
  | { nodes: Node[]; edges: Edge[]; viewport: { x: number; y: number; zoom: number } }
  | null;

const [nodes, , onNodesChange] = useNodesState(saved?.nodes ?? initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(saved?.edges ?? initialEdges);
```

The result is a full-screen canvas with a dotted background. Dragging from the bottom handle of "Webhook" to the top handle of "Summarize ticket" draws an edge, and after a reload the same nodes, edges and viewport come back. For a real product, store the JSON on the server instead of `localStorage`.

### 2. Dropping new nodes from a palette

User request: "Let me drag 'LLM' and 'Email' items from a sidebar onto the canvas."

```tsx
import { useReactFlow, type Node } from '@xyflow/react';

export function Palette() {
  return (
    <aside>
      {['llm', 'action'].map((kind) => (
        <div key={kind} draggable onDragStart={(e) => e.dataTransfer.setData('application/step-kind', kind)}>
          {kind === 'llm' ? 'LLM call' : 'Send email'}
        </div>
      ))}
    </aside>
  );
}

export function useDropNode(setNodes: (fn: (n: Node[]) => Node[]) => void) {
  const { screenToFlowPosition } = useReactFlow();
  return {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData('application/step-kind');
      if (!kind) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setNodes((ns) => ns.concat({ id: crypto.randomUUID(), type: 'step', position, data: { label: kind === 'llm' ? 'LLM call' : 'Send email', kind } }));
    },
  };
}
```

Spread the returned `onDragOver` and `onDrop` onto `<ReactFlow>`. Dropping a palette item at the cursor creates a node exactly under the pointer, even after the user has zoomed or panned.

## Guidelines

- Import `@xyflow/react/dist/style.css` once and give the canvas parent a height; these two omissions cause most "blank canvas" reports.
- Use the `@xyflow/react` import names (`import { ReactFlow } from '@xyflow/react'`). Code with `import ReactFlow from 'reactflow'` is v11 and will not mix with v12 types.
- Keep `nodeTypes` and `edgeTypes` outside components, and wrap callbacks passed to `ReactFlow` in `useCallback` when the graph is large.
- Keep node `data` small and serialisable; store large payloads elsewhere and reference them by id. Do not put secrets in node data, since `toObject()` is what you save and may send to the browser.
- For hundreds of nodes, avoid heavy custom nodes and avoid re-creating the `nodes` array on every keystroke; update one node with `updateNodeData`.
- The library does no automatic layout. Compute positions with a layout library and then set node `position` values.
- The graph is drawn in the browser. In Next.js put the flow in a client component (`'use client'`).
- Do not use xyflow for chart-like data visualisation or for graphs with tens of thousands of nodes; use a canvas or WebGL graph renderer instead.
