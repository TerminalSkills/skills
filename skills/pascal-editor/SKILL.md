---
name: pascal-editor
description: >-
  Build and extend 3D building editor apps with Pascal Editor, an open-source React Three Fiber and WebGPU editor whose scene is a flat Zustand node store (site, building, level, wall, door, window, slab, zone). Use when building a 3D architectural tool or BIM-like editor, generating floor plans from code or an AI agent, extending Pascal with custom node plugins, or running its MCP server.
license: MIT
compatibility: "Node.js 22.13+, React 18 or 19, three 0.186, @react-three/fiber 9, @react-three/drei 10"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: [pascal-editor, 3d, react-three-fiber, architecture, bim]
  repository: https://github.com/pascalorg/editor
---

# Pascal Editor Integration

## Overview

Pascal Editor ([pascalorg/editor](https://github.com/pascalorg/editor), MIT) is a 3D building editor built on React Three Fiber with a WebGPU renderer. The scene is a flat dictionary of typed nodes held in a Zustand store (`useScene`); parent/child links are ids. It ships as npm packages: `@pascal-app/core` (zod node schemas, stores, registry), `@pascal-app/viewer` (3D rendering), `@pascal-app/nodes` (built-in node definitions, renderers and systems as a plugin), `@pascal-app/editor` (tools and panels) and `@pascal-app/cli` (local editor plus MCP server). There is no `@pascal-app/ui` package. Versions checked: core and viewer 1.0.3.

## Instructions

### Run the editor locally, or let an agent drive it

```bash
npm install --global @pascal-app/cli
npx @pascal-app/cli editor        # editor + authenticated MCP service, projects in ~/.pascal/data/pascal.db
```

An agent can be pointed at `pascal mcp connect` (no browser needed). To embed instead of run, install into a Next.js app:

```bash
npm install @pascal-app/core @pascal-app/viewer @pascal-app/nodes @pascal-app/editor
npm install next react react-dom three @react-three/fiber @react-three/drei lucide-react zustand
```

### Node hierarchy

```
Site -> Building -> Level -> Wall -> Door / Window / Item
                          -> Slab, Ceiling, Roof, Zone, Stair, Guide, Scan ...
```

Every node has `id` (prefixed, e.g. `wall_4muwxrhv...`), `type`, `parentId`, `visible`, optional `metadata`, and containers have `children` (ids). Properties are flat on the node: there is no `props` wrapper. Units are metres; plan coordinates are `[x, z]` pairs.

### Stores

```typescript
import { useScene } from '@pascal-app/core'   // nodes, rootNodeIds, dirtyNodes, CRUD
import { useViewer } from '@pascal-app/viewer' // selection, levelMode, wallMode, camera mode
```

`useScene` actions include `createNode(node, parentId?)`, `createNodes`, `updateNode(id, data)`, `updateNodes`, `deleteNode(s)`, `markDirty`, `setScene`, `clearScene`. The scene persists to IndexedDB with undo/redo (Zundo). `useEditor` (active tool, layers, panels) lives in `@pascal-app/editor`.

### Create nodes: parse with the zod schema, then store

Schemas are exported from `@pascal-app/core` and fill defaults and ids. Verified in Node 24:

```typescript
import { useScene, SiteNode, BuildingNode, LevelNode, WallNode, DoorNode, SlabNode, ZoneNode } from '@pascal-app/core'

const scene = useScene.getState()
const site = SiteNode.parse({ polygon: { type: 'polygon', points: [[0, 0], [30, 0], [30, 30], [0, 30]] } })
scene.createNode(site)
const building = BuildingNode.parse({}); scene.createNode(building, site.id)
const level = LevelNode.parse({ level: 0, height: 2.7 }); scene.createNode(level, building.id)

const wall = WallNode.parse({ start: [0, 0], end: [10, 0], thickness: 0.2, height: 2.7 })
scene.createNode(wall, level.id)

// Door position is the centre in wall-local coordinates; y = half the height
const door = DoorNode.parse({ position: [3.5, 1.05, 0], width: 1.0, height: 2.1, wallId: wall.id })
scene.createNode(door, wall.id)
```

The parent's `children` array is updated by `createNode`. Other useful fields: `WindowNode` has `position`, `width` and `height` (default 1.5), `windowType`, `sill`; `SlabNode` has `polygon`, `holes`, `thickness`, `elevation`; `ZoneNode` has `name`, `polygon`, `ceilingHeight` (2.7), `color`, `spaceRole`. `LevelNode` uses `level` (index), `baseElevation` and `height`, not an `elevation` per level. `updateNode` schedules work with `requestAnimationFrame`, so it only runs in a browser, not a bare Node script.

### Render

```tsx
import { loadPlugin } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'
import { Viewer } from '@pascal-app/viewer'

const registryReady = loadPlugin(builtinPlugin)   // register node definitions before rendering

export function BuildingViewer({ ready }: { ready: boolean }) {
  return ready ? <div style={{ width: '100vw', height: '100vh' }}><Viewer /></div> : null
}
```

Set `ready` after `registryReady` resolves. `Viewer` creates its own canvas and accepts children such as camera controls. Geometry is rebuilt by systems (`WallSystem`, `ZoneSystem`, ...) for nodes in `dirtyNodes`.

### Extending

New node types are plugins registered with `loadPlugin`; the reference example is [pascalorg/plugin-trees](https://github.com/pascalorg/plugin-trees). Look up a node's 3D object through `useRegistry`; components talk through the exported `emitter` (mitt).

## Examples

### Example 1: "Generate a 10 m x 8 m ground floor from a script"

1. Parse and create site, building and a level (`height: 2.7`) as above.
2. Create four walls with `WallNode.parse({ start, end, thickness: 0.2, height: 2.7 })`: `[0,0]->[10,0]`, `[10,0]->[10,8]`, `[10,8]->[0,8]`, `[0,8]->[0,0]`.
3. Add `SlabNode` with polygon `[[0,0],[10,0],[10,8],[0,8]]`, thickness 0.25.
4. Add an entry `DoorNode` (width 1.0, height 2.1) at wall-local x 3.5 on the first wall, and a `WindowNode` on the east wall.
5. Add two `ZoneNode`s named "Living Room" and "Bedrooms" for labels and area.

Result: `Object.keys(useScene.getState().nodes)` lists the new ids, and the level's `children` holds walls, slab and zones.

### Example 2: "Let Claude Code edit the model through MCP"

```bash
npx @pascal-app/cli editor
```

The CLI prints the editor URL and starts the MCP service on free ports. Add an MCP server entry whose command is `pascal mcp connect` to the agent's configuration, then ask it to "add a 1.2 m window to the south wall of Ground Floor". The agent uses the exposed tools (see `@pascal-app/core/agent-tools`) and you see the change in the open editor.

## Guidelines

- Node.js 22.13+ is required to build the monorepo; peer versions are three ^0.186, fiber ^9, drei ^10.
- WebGPU is needed for the renderer; check browser support before blaming your code.
- Dimensions are metres. Door and window `position` is relative to the wall, not the level.
- Always create nodes from the schema (`XNode.parse`) so ids and defaults are valid; parent them with the second argument of `createNode`.
- Wall `height` and `thickness` are optional with no schema default, so pass them explicitly.
- Do not copy the old `@pascal-app/ui`, `registerSystem` or `props:` examples found in older posts; they do not exist in 1.0.x.
- Pre-1.0 saved scenes may need `scene-migrations` (`@pascal-app/core/scene-migrations`).
- Pair with the `architectural-dimensions` skill for real-world size checks.
