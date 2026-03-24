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
  category: architecture
  tags: [pascal-editor, 3d, react-three-fiber, webgpu, architecture, bim, floor-plan]
  use-cases:
    - "Build a custom 3D building editor for architecture/interior design"
    - "Add AI-powered room layout suggestions to Pascal Editor"
    - "Generate building geometry from a floor plan description"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Pascal Editor Integration

Pascal Editor ([pascalorg/editor](https://github.com/pascalorg/editor)) is an open-source 3D building editor built with React Three Fiber and WebGPU. It provides a node-based scene graph, Zustand state management, and a systems architecture ideal for AI-driven architectural generation.

## Quick Start

```bash
npx create-next-app@latest my-building-app
cd my-building-app
npm install @pascal-app/core @pascal-app/ui @react-three/fiber @react-three/drei three zustand
```

---

## Architecture Overview

### Node Hierarchy

Pascal Editor uses a tree of typed nodes:

```
Site
└── Building
    ├── Level (Ground Floor)
    │   ├── Wall (exterior/interior)
    │   │   └── Opening (door/window)
    │   ├── Slab (floor/ceiling)
    │   ├── Zone (room boundary)
    │   └── Item (furniture, fixture)
    └── Level (Level 1)
        └── ...
```

Every node has:
- `id: string` — UUID
- `type: string` — node type identifier
- `parentId: string | null`
- `children: string[]` — child node IDs
- `props: Record<string, unknown>` — type-specific properties
- `dirty: boolean` — marks node for geometry rebuild

### Zustand Stores

```typescript
import { useScene, useViewer, useEditor } from '@pascal-app/core'

// useScene — the entire scene graph (nodes, relations)
const { nodes, createNode, updateNode, deleteNode, getNode } = useScene()

// useViewer — 3D viewport state (camera, selection, visibility)
const { selectedIds, camera, setSelection } = useViewer()

// useEditor — tool mode and UI state
const { activeTool, setTool, history } = useEditor()
```

### Scene Registry

Pascal uses a fast O(1) 3D object registry to map node IDs to Three.js objects:

```typescript
import { useSceneRegistry } from '@pascal-app/core'

const registry = useSceneRegistry.getState()

// Get Three.js mesh for a node
const mesh = registry.getMesh(nodeId)

// Register a custom mesh
registry.register(nodeId, mesh)
registry.unregister(nodeId)
```

---

## Working with Nodes Programmatically

### 1. Adding a Wall with Correct Dimensions

```typescript
import { useScene } from '@pascal-app/core'

async function addWallToLevel(levelId: string) {
  const scene = useScene.getState()

  // Create an exterior wall: 4.5m long, 200mm thick, standard ceiling height
  const wall = await scene.createNode({
    type: 'wall',
    props: {
      start: { x: 0, y: 0 },          // meters from level origin
      end: { x: 4.5, y: 0 },
      thickness: 0.20,                  // 200mm — exterior wall
      height: 2.7,                      // standard ceiling height
      isExterior: true,
      material: 'masonry',
    }
  }, levelId)

  // Add a window: 1.2m wide, sill at 900mm
  await scene.createNode({
    type: 'item',
    props: {
      itemType: 'window',
      wallId: wall.id,
      offsetFromStart: 1.5,             // 1.5m from wall start
      width: 1.2,
      height: 1.2,
      sillHeight: 0.9,                  // 900mm from floor — standard
    }
  }, wall.id)

  // Add an entry door: 900mm wide, full height
  await scene.createNode({
    type: 'item',
    props: {
      itemType: 'door',
      wallId: wall.id,
      offsetFromStart: 3.0,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,                    // always 0 for doors
      hingeSide: 'left',               // 'left' | 'right'
      swingAngle: 90,                  // degrees
    }
  }, wall.id)

  return wall
}
```

### 2. Creating a Full Level with Rooms

```typescript
import { useScene } from '@pascal-app/core'

async function createGroundFloor(buildingId: string) {
  const scene = useScene.getState()

  // Create the level
  const level = await scene.createNode({
    type: 'level',
    props: {
      name: 'Ground Floor',
      elevation: 0,         // ground level
      height: 2.7,          // 2700mm ceiling
      index: 0,
    }
  }, buildingId)

  // Create floor slab
  await scene.createNode({
    type: 'slab',
    props: {
      polygon: [
        { x: 0, y: 0 }, { x: 10, y: 0 },
        { x: 10, y: 8 }, { x: 0, y: 8 }
      ],
      thickness: 0.25,
      isRoof: false,
      material: 'concrete',
    }
  }, level.id)

  // Create walls forming a 10m × 8m footprint
  const wallDefs = [
    { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, isExterior: true },
    { start: { x: 10, y: 0 }, end: { x: 10, y: 8 }, isExterior: true },
    { start: { x: 10, y: 8 }, end: { x: 0, y: 8 }, isExterior: true },
    { start: { x: 0, y: 8 }, end: { x: 0, y: 0 }, isExterior: true },
    // Interior partition: living room / bedroom divider
    { start: { x: 5.5, y: 0 }, end: { x: 5.5, y: 8 }, isExterior: false },
  ]

  for (const def of wallDefs) {
    await scene.createNode({
      type: 'wall',
      props: {
        ...def,
        thickness: def.isExterior ? 0.20 : 0.10,
        height: 2.7,
        material: def.isExterior ? 'masonry' : 'timber',
      }
    }, level.id)
  }

  // Create room zones (for area calculation and labeling)
  await scene.createNode({
    type: 'zone',
    props: {
      name: 'Living Room',
      roomType: 'living',
      polygon: [
        { x: 0.1, y: 0.1 }, { x: 5.4, y: 0.1 },
        { x: 5.4, y: 7.9 }, { x: 0.1, y: 7.9 }
      ],
    }
  }, level.id)

  return level
}
```

### 3. Custom System — Wall Thickness Validator

Systems in Pascal Editor process dirty nodes and update geometry or metadata. Register a custom system to validate dimensions on every change:

```typescript
import { registerSystem, useScene } from '@pascal-app/core'

// Systems run when nodes are marked dirty
registerSystem({
  name: 'wall-thickness-validator',
  nodeTypes: ['wall'],                    // only runs for wall nodes
  priority: 100,                          // runs before geometry systems (which are 0-50)

  process(dirtyNodes: SceneNode[]) {
    const warnings: string[] = []

    for (const node of dirtyNodes) {
      const { thickness, isExterior, height } = node.props as WallProps

      if (isExterior && thickness < 0.14) {
        warnings.push(
          `Wall ${node.id}: exterior wall thickness ${thickness}m is below 140mm minimum`
        )
        // Tag the node with a validation error
        useScene.getState().updateNode(node.id, {
          props: { ...node.props, validationError: 'EXTERIOR_WALL_TOO_THIN' }
        })
      }

      if (!isExterior && thickness < 0.075) {
        warnings.push(
          `Wall ${node.id}: interior partition ${thickness}m is unrealistically thin`
        )
      }

      if (height < 2.1) {
        warnings.push(
          `Wall ${node.id}: height ${height}m is below 2.1m minimum habitable ceiling`
        )
      }
    }

    if (warnings.length > 0) {
      console.warn('[DimensionValidator]', warnings)
      // Optionally dispatch to UI notification system
    }
  }
})
```

### 4. Reading Scene State and Exporting to JSON

```typescript
import { useScene } from '@pascal-app/core'

function exportSceneToJSON(): BuildingExport {
  const { nodes } = useScene.getState()

  const allNodes = Object.values(nodes)
  const site = allNodes.find(n => n.type === 'site')
  if (!site) throw new Error('No site node found')

  const building = allNodes.find(n => n.type === 'building' && n.parentId === site.id)
  if (!building) throw new Error('No building node found')

  const levels = allNodes
    .filter(n => n.type === 'level' && n.parentId === building.id)
    .sort((a, b) => (a.props.elevation as number) - (b.props.elevation as number))

  return {
    units: 'meters',
    exportedAt: new Date().toISOString(),
    site: {
      width: site.props.width as number,
      depth: site.props.depth as number,
      orientation: (site.props.orientation as number) ?? 0,
    },
    building: {
      levels: levels.map(level => {
        const walls = allNodes.filter(n => n.type === 'wall' && n.parentId === level.id)
        const zones = allNodes.filter(n => n.type === 'zone' && n.parentId === level.id)

        return {
          id: level.id,
          name: level.props.name as string,
          elevation: level.props.elevation as number,
          height: level.props.height as number,
          rooms: zones.map(z => ({
            id: z.id,
            name: z.props.name as string,
            type: z.props.roomType as string,
            area: computePolygonArea(z.props.polygon as Point2D[]),
            polygon: z.props.polygon as Point2D[],
          })),
          walls: walls.map(w => {
            const openings = allNodes.filter(n =>
              n.type === 'item' &&
              n.parentId === w.id &&
              ['door', 'window'].includes(n.props.itemType as string)
            )
            return {
              id: w.id,
              start: w.props.start as Point2D,
              end: w.props.end as Point2D,
              thickness: w.props.thickness as number,
              height: w.props.height as number,
              isExterior: w.props.isExterior as boolean,
              openings: openings.map(o => ({
                id: o.id,
                type: o.props.itemType as 'door' | 'window',
                offsetFromStart: o.props.offsetFromStart as number,
                width: o.props.width as number,
                height: o.props.height as number,
                sillHeight: o.props.sillHeight as number,
              })),
            }
          }),
        }
      }),
    },
  }
}

function computePolygonArea(polygon: Point2D[]): number {
  // Shoelace formula
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].x * polygon[j].y
    area -= polygon[j].x * polygon[i].y
  }
  return Math.abs(area / 2)
}
```

---

## Creating Custom Tools

Tools in Pascal Editor handle mouse/touch events and dispatch scene mutations.

```typescript
import { registerTool, useViewer } from '@pascal-app/core'
import type { PointerEvent } from '@react-three/fiber'

registerTool({
  id: 'ai-room-placer',
  label: 'AI Room Placer',
  icon: 'SparklesIcon',
  cursor: 'crosshair',

  onPointerDown(event: PointerEvent, context: ToolContext) {
    const { point } = event             // 3D world position
    const levelId = context.activeLevelId

    // Snap to 100mm grid
    const snapped = {
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.z * 10) / 10, // note: Three.js Y is up, floor plan is XZ
    }

    context.startDrag(snapped)
  },

  onPointerUp(event: PointerEvent, context: ToolContext) {
    if (!context.dragStart) return

    const start = context.dragStart
    const end = {
      x: Math.round(event.point.x * 10) / 10,
      y: Math.round(event.point.z * 10) / 10,
    }

    const width = Math.abs(end.x - start.x)
    const depth = Math.abs(end.y - start.y)

    if (width < 1.5 || depth < 1.5) {
      context.showToast('Room must be at least 1.5m × 1.5m', 'warning')
      return
    }

    // Place four walls and a zone
    context.dispatch(async () => {
      await createRoomWithWalls(context.activeLevelId, start, end)
    })
  },
})
```

---

## Useful Patterns

### Snapping to Architectural Grid

```typescript
// Pascal uses a 100mm grid (0.1m) by default
// For walls, snap ends to 50mm increments
const snapToGrid = (value: number, gridSize = 0.1) =>
  Math.round(value / gridSize) * gridSize

// Snap to nearest wall (magnetic snapping)
function snapToNearestWallEnd(point: Point2D, walls: Wall[], threshold = 0.15): Point2D {
  for (const wall of walls) {
    if (distance(point, wall.start) < threshold) return wall.start
    if (distance(point, wall.end) < threshold) return wall.end
  }
  return point
}
```

### Connecting React Three Fiber to Scene

```tsx
import { Canvas } from '@react-three/fiber'
import { PascalScene, PascalCamera, PascalControls } from '@pascal-app/ui'

export function BuildingViewer() {
  return (
    <Canvas
      gl={{ antialias: true }}
      camera={{ position: [0, 20, 20], fov: 45 }}
    >
      <PascalScene />           {/* renders all scene nodes as 3D geometry */}
      <PascalCamera />          {/* handles orbit / pan / zoom */}
      <PascalControls />        {/* keyboard shortcuts, undo/redo */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} castShadow />
    </Canvas>
  )
}
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `@pascal-app/core` | Scene graph, Zustand stores, systems |
| `@pascal-app/ui` | React Three Fiber components |
| `@react-three/fiber` | Three.js React renderer |
| `@react-three/drei` | Camera controls, helpers |
| `three` | 3D rendering |
| `zustand` | State management |

## Further Resources

- GitHub: [github.com/pascalorg/editor](https://github.com/pascalorg/editor)
- Combine with `architectural-dimensions` skill for correct real-world measurements
- See use-cases: `build-3d-building-model-with-ai`, `generate-architectural-floor-plan`
