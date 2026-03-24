---
name: pascal-editor
description: >-
  Build and extend 3D building editor apps using Pascal Editor's architecture (React Three Fiber
  + Zustand scene graph). Use when: building 3D architectural tools, creating BIM-like editors,
  extending Pascal Editor with custom features, building floor plan generators.
license: MIT
compatibility: "Node.js 18+, React 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [pascal-editor, 3d, react-three-fiber, architecture, bim]
---

# Pascal Editor Integration

## Overview

Pascal Editor ([pascalorg/editor](https://github.com/pascalorg/editor)) is an open-source 3D building editor built with React Three Fiber and WebGPU. It provides a node-based scene graph, Zustand state management, and a systems architecture ideal for AI-driven architectural generation. This skill covers the core API for creating, manipulating, and exporting building geometry.

## Instructions

### Quick Start

```bash
npx create-next-app@latest my-building-app
cd my-building-app
npm install @pascal-app/core @pascal-app/ui @react-three/fiber @react-three/drei three zustand
```

### Node Hierarchy

Pascal uses a tree of typed nodes:

```
Site -> Building -> Level -> Wall -> Opening (door/window)
                          -> Slab (floor/ceiling)
                          -> Zone (room boundary)
                          -> Item (furniture, fixture)
```

Every node has: `id` (UUID), `type`, `parentId`, `children` (child IDs), `props` (type-specific), and `dirty` (marks for rebuild).

### Zustand Stores

```typescript
import { useScene, useViewer, useEditor } from '@pascal-app/core'

// useScene -- scene graph (nodes, relations)
const { nodes, createNode, updateNode, deleteNode } = useScene()

// useViewer -- viewport state (camera, selection)
const { selectedIds, camera, setSelection } = useViewer()

// useEditor -- tool mode and UI state
const { activeTool, setTool, history } = useEditor()
```

### Creating Walls with Openings

```typescript
const scene = useScene.getState()

// Exterior wall: 4.5m long, 200mm thick, 2.7m ceiling
const wall = await scene.createNode({
  type: 'wall',
  props: {
    start: { x: 0, y: 0 }, end: { x: 4.5, y: 0 },
    thickness: 0.20, height: 2.7,
    isExterior: true, material: 'masonry',
  }
}, levelId)

// Add a window: 1.2m wide, sill at 900mm
await scene.createNode({
  type: 'item',
  props: {
    itemType: 'window', wallId: wall.id,
    offsetFromStart: 1.5, width: 1.2, height: 1.2, sillHeight: 0.9,
  }
}, wall.id)

// Add a door: 900mm wide
await scene.createNode({
  type: 'item',
  props: {
    itemType: 'door', wallId: wall.id,
    offsetFromStart: 3.0, width: 0.9, height: 2.1, sillHeight: 0,
  }
}, wall.id)
```

### Creating Levels and Rooms

```typescript
const level = await scene.createNode({
  type: 'level',
  props: { name: 'Ground Floor', elevation: 0, height: 2.7, index: 0 }
}, buildingId)

// Floor slab
await scene.createNode({
  type: 'slab',
  props: {
    polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }],
    thickness: 0.25, isRoof: false,
  }
}, level.id)

// Room zone for labeling and area calculation
await scene.createNode({
  type: 'zone',
  props: {
    name: 'Living Room', roomType: 'living',
    polygon: [{ x: 0.1, y: 0.1 }, { x: 5.4, y: 0.1 }, { x: 5.4, y: 7.9 }, { x: 0.1, y: 7.9 }],
  }
}, level.id)
```

### Exporting Scene to JSON

```typescript
function exportScene(): BuildingExport {
  const { nodes } = useScene.getState()
  const allNodes = Object.values(nodes)
  const site = allNodes.find(n => n.type === 'site')
  const building = allNodes.find(n => n.type === 'building')
  const levels = allNodes
    .filter(n => n.type === 'level' && n.parentId === building.id)
    .sort((a, b) => a.props.elevation - b.props.elevation)

  return {
    units: 'meters',
    site: { width: site.props.width, depth: site.props.depth },
    building: {
      levels: levels.map(level => ({
        name: level.props.name,
        elevation: level.props.elevation,
        height: level.props.height,
        walls: getChildrenByType(level.id, 'wall', allNodes),
        rooms: getChildrenByType(level.id, 'zone', allNodes),
      }))
    }
  }
}
```

### Rendering with React Three Fiber

```tsx
import { Canvas } from '@react-three/fiber'
import { PascalScene, PascalCamera, PascalControls } from '@pascal-app/ui'

export function BuildingViewer() {
  return (
    <Canvas camera={{ position: [0, 20, 20], fov: 45 }}>
      <PascalScene />
      <PascalCamera />
      <PascalControls />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} castShadow />
    </Canvas>
  )
}
```

### Grid Snapping

Pascal uses a 100 mm grid (0.1 m) by default:

```typescript
const snapToGrid = (value: number, gridSize = 0.1) =>
  Math.round(value / gridSize) * gridSize
```

## Examples

### Example 1: Build a 10m x 8m Ground Floor

Create a complete ground floor with exterior walls, an interior partition dividing living from bedrooms, and appropriate openings:

1. Create level node with elevation 0, height 2.7 m
2. Create floor slab: 10 m x 8 m polygon, 0.25 m thick
3. Create 4 exterior walls (0.20 m thick, masonry): north (10 m), east (8 m), south (10 m), west (8 m)
4. Add interior partition at x=5.5 (0.10 m thick, timber) running full depth
5. Add entry door on north wall: 1.0 m x 2.1 m at offset 3.5 m
6. Add windows on east wall: two 1.2 m x 1.2 m at sill 0.9 m, offsets 1.2 m and 4.5 m
7. Create zones: Living Room (5.3 m x 7.8 m = 41.3 m2), Bedroom area (4.3 m x 7.8 m = 33.5 m2)
8. Export to JSON for validation against `architectural-dimensions` rules

### Example 2: Register a Custom Validation System

Create a system that checks wall thickness whenever a wall node changes:

```typescript
import { registerSystem, useScene } from '@pascal-app/core'

registerSystem({
  name: 'wall-validator',
  nodeTypes: ['wall'],
  priority: 100,
  process(dirtyNodes) {
    for (const node of dirtyNodes) {
      const { thickness, isExterior, height } = node.props
      if (isExterior && thickness < 0.14)
        console.warn(`Wall ${node.id}: exterior ${thickness}m < 0.14m minimum`)
      if (height < 2.1)
        console.warn(`Wall ${node.id}: height ${height}m < 2.1m minimum`)
    }
  }
})
```

This runs automatically whenever wall nodes are marked dirty, before geometry systems rebuild meshes.

## Guidelines

- All dimensions are in meters -- Pascal uses metric internally
- Use `useScene` for all node CRUD operations, `useViewer` for selection/camera, `useEditor` for tools
- Snap coordinates to 0.1 m grid for clean geometry
- Wall thickness: 0.20 m for exterior, 0.10 m for interior partitions
- Door sill height is always 0 (floor level); window sill height defaults to 0.9 m
- Register custom systems with priority > 50 to run before geometry rebuild (0-50)
- Combine with `architectural-dimensions` skill for real-world measurement validation
- Key packages: `@pascal-app/core`, `@pascal-app/ui`, `@react-three/fiber`, `three`, `zustand`
- GitHub: [github.com/pascalorg/editor](https://github.com/pascalorg/editor)
