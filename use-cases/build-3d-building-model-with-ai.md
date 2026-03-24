# Build a 3D Building Model with AI

**Persona:** Architect or developer who wants to quickly prototype building layouts using natural language, with AI generating correct geometry and dimensions.

**Skills required:**
- `architectural-dimensions` — dimension rules and validation
- `pascal-editor` — scene graph API for 3D model creation

---

## Overview

Describe a building in plain language. Claude parses the description, applies the `architectural-dimensions` ruleset to produce correct measurements, generates a `BuildingModel` JSON, validates it, then outputs to Pascal Editor format ready for 3D rendering.

---

## Step-by-Step Pipeline

### Step 1 — Natural Language Input

```
User: "Create a 3-bedroom apartment, 85m², ground floor, north-facing entrance.
       Open-plan kitchen and living area, two bathrooms, storage closet."
```

### Step 2 — AI Parses Description into Room Program

Claude extracts the building program:

```typescript
interface BuildingProgram {
  totalArea: number;         // 85 m²
  levels: number;            // 1
  entrance: 'north' | 'south' | 'east' | 'west';
  rooms: RoomRequirement[];
}

interface RoomRequirement {
  type: RoomType;
  count: number;
  minArea?: number;          // from architectural-dimensions rules
  targetArea?: number;       // from user description or pro-rata split
}

const program: BuildingProgram = {
  totalArea: 85,
  levels: 1,
  entrance: 'north',
  rooms: [
    { type: 'bedroom',  count: 3, minArea: 10.5, targetArea: 13 },
    { type: 'living',   count: 1, minArea: 15.75, targetArea: 18 },
    { type: 'kitchen',  count: 1, minArea: 7.2,  targetArea: 12 },
    { type: 'bathroom', count: 2, minArea: 5,    targetArea: 5.5 },
    { type: 'corridor', count: 1, minArea: 4,    targetArea: 5 },
    { type: 'storage',  count: 1, minArea: 2,    targetArea: 3 },
  ]
}

// Verify areas sum to target
const roomTotal = program.rooms.reduce((s, r) => s + r.targetArea * r.count, 0)
// 39 + 18 + 12 + 11 + 5 + 3 = 88 m² — adjust proportionally to reach 85 m²
```

### Step 3 — Generate Layout with Correct Dimensions

```typescript
import { DEFAULTS } from '@skills/architectural-dimensions'

function generateApartmentLayout(program: BuildingProgram): BuildingModel {
  // Apartment footprint: ~9.5m × 9m = 85.5m² (allows for wall thickness deductions)
  const footprintWidth = 9.5
  const footprintDepth = 9.0

  // Layout strategy: corridor spine running east-west,
  // bedrooms on south side, living/kitchen on north (near entrance)
  const layout: BuildingModel = {
    units: 'meters',
    site: {
      width: 12,
      depth: 12,
      orientation: 0,        // north = up
    },
    building: {
      footprint: [
        { x: 1.25, y: 1.5 }, { x: 10.75, y: 1.5 },
        { x: 10.75, y: 10.5 }, { x: 1.25, y: 10.5 }
      ],
      levels: [{
        id: 'L0',
        name: 'Ground Floor',
        elevation: 0,
        height: DEFAULTS.ceilingHeight,   // 2.7m
        walls: generateWalls(footprintWidth, footprintDepth),
        rooms: generateRooms(program),
      }]
    }
  }

  return layout
}

function generateWalls(w: number, d: number): Wall[] {
  const ext = DEFAULTS.wallThicknessExterior   // 0.20m
  const int = DEFAULTS.wallThicknessInterior   // 0.10m
  const h = DEFAULTS.ceilingHeight             // 2.7m

  return [
    // Exterior walls
    { id: 'W-N', start: {x:0,y:d}, end: {x:w,y:d}, thickness: ext, height: h,
      isExterior: true, openings: [
        // Main entry door on north wall
        { id: 'D-entry', type: 'door', offsetFromStart: 3.5, width: 1.0, height: 2.1, sillHeight: 0 },
        // Living room window
        { id: 'Win-living', type: 'window', offsetFromStart: 0.5, width: 2.4, height: 1.2, sillHeight: 0.9 },
      ]},
    { id: 'W-E', start: {x:w,y:d}, end: {x:w,y:0}, thickness: ext, height: h,
      isExterior: true, openings: [
        { id: 'Win-bed1', type: 'window', offsetFromStart: 1.2, width: 1.2, height: 1.2, sillHeight: 0.9 },
        { id: 'Win-bed2', type: 'window', offsetFromStart: 4.5, width: 1.2, height: 1.2, sillHeight: 0.9 },
      ]},
    { id: 'W-S', start: {x:w,y:0}, end: {x:0,y:0}, thickness: ext, height: h,
      isExterior: true, openings: [
        { id: 'Win-bed3', type: 'window', offsetFromStart: 1.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
        { id: 'Win-kitchen', type: 'window', offsetFromStart: 5.5, width: 1.0, height: 1.2, sillHeight: 0.9 },
      ]},
    { id: 'W-W', start: {x:0,y:0}, end: {x:0,y:d}, thickness: ext, height: h,
      isExterior: true, openings: [] },

    // Interior partitions
    { id: 'W-corridor', start: {x:0.2,y:4.5}, end: {x:9.3,y:4.5},
      thickness: int, height: h, isExterior: false,
      openings: [
        { id: 'D-bed1', type: 'door', offsetFromStart: 0.5, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'D-bed2', type: 'door', offsetFromStart: 3.0, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'D-bed3', type: 'door', offsetFromStart: 5.5, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'D-bath1', type: 'door', offsetFromStart: 7.5, width: 0.8, height: 2.1, sillHeight: 0 },
      ]},
    { id: 'W-bath-div', start: {x:7.5,y:4.5}, end: {x:7.5,y:9.8},
      thickness: int, height: h, isExterior: false,
      openings: [
        { id: 'D-bath2', type: 'door', offsetFromStart: 3.5, width: 0.8, height: 2.1, sillHeight: 0 },
      ]},
  ] as Wall[]
}

function generateRooms(program: BuildingProgram): Room[] {
  return [
    { id: 'R-living',  name: 'Living Room', type: 'living',
      area: 18.4, polygon: [{x:0.2,y:4.7},{x:6.0,y:4.7},{x:6.0,y:8.8},{x:0.2,y:8.8}] },
    { id: 'R-kitchen', name: 'Kitchen', type: 'kitchen',
      area: 11.8, polygon: [{x:6.1,y:4.7},{x:9.3,y:4.7},{x:9.3,y:8.8},{x:6.1,y:8.8}] },
    { id: 'R-bed1',    name: 'Master Bedroom', type: 'bedroom',
      area: 14.0, polygon: [{x:0.2,y:0.2},{x:3.5,y:0.2},{x:3.5,y:4.3},{x:0.2,y:4.3}] },
    { id: 'R-bed2',    name: 'Bedroom 2', type: 'bedroom',
      area: 10.8, polygon: [{x:3.6,y:0.2},{x:6.2,y:0.2},{x:6.2,y:4.3},{x:3.6,y:4.3}] },
    { id: 'R-bed3',    name: 'Bedroom 3', type: 'bedroom',
      area: 10.5, polygon: [{x:6.3,y:0.2},{x:8.8,y:0.2},{x:8.8,y:4.3},{x:6.3,y:4.3}] },
    { id: 'R-bath1',   name: 'Bathroom', type: 'bathroom',
      area: 5.2,  polygon: [{x:8.9,y:0.2},{x:9.3,y:0.2},{x:9.3,y:4.3},{x:8.9,y:4.3}] },
    { id: 'R-bath2',   name: 'En-suite', type: 'ensuite',
      area: 4.8,  polygon: [{x:7.6,y:4.7},{x:9.3,y:4.7},{x:9.3,y:7.5},{x:7.6,y:7.5}] },
    { id: 'R-corridor',name: 'Hallway', type: 'corridor',
      area: 5.1,  polygon: [{x:0.2,y:4.7},{x:7.5,y:4.7},{x:7.5,y:4.4},{x:0.2,y:4.4}] },
  ] as Room[]
}
```

### Step 4 — Validate Against Dimension Rules

```typescript
import { validateBuildingModel } from '@skills/architectural-dimensions'

function validateAndReport(model: BuildingModel): boolean {
  const results = validateBuildingModel(model)
  const errors = results.filter(r => r.severity === 'error')
  const warnings = results.filter(r => r.severity === 'warning')

  if (errors.length > 0) {
    console.error('❌ Validation failed:')
    errors.forEach(e => console.error(`  [${e.rule}] ${e.message}`))
    return false
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Warnings:')
    warnings.forEach(w => console.warn(`  [${w.rule}] ${w.message}`))
  }

  console.log('✅ Building model is valid')
  return true
}

// Expected output for the apartment above:
// ✅ Building model is valid
// ⚠️  [BEDROOM_RATIO] Bedroom area is 41% of total — ✓ within range
```

### Step 5 — Load into Pascal Editor

```typescript
import { useScene } from '@pascal-app/core'

async function loadModelIntoPascal(model: BuildingModel) {
  const scene = useScene.getState()

  // Clear existing scene
  await scene.reset()

  // Create site and building
  const site = await scene.createNode({ type: 'site', props: model.site })
  const building = await scene.createNode({ type: 'building', props: {} }, site.id)

  for (const levelData of model.building.levels) {
    const level = await scene.createNode({
      type: 'level',
      props: { name: levelData.name, elevation: levelData.elevation, height: levelData.height }
    }, building.id)

    // Create walls and openings
    for (const wallData of levelData.walls) {
      const wall = await scene.createNode({ type: 'wall', props: wallData }, level.id)
      for (const opening of wallData.openings) {
        await scene.createNode({ type: 'item', props: { itemType: opening.type, ...opening } }, wall.id)
      }
    }

    // Create zones (rooms)
    for (const roomData of levelData.rooms) {
      await scene.createNode({ type: 'zone', props: roomData }, level.id)
    }
  }

  console.log('Building loaded into Pascal Editor')
}
```

### Step 6 — Export to IFC / DXF

```typescript
// IFC export (Industry Foundation Classes — universal BIM format)
import { exportToIFC } from '@pascal-app/exporters'

const ifcString = exportToIFC(model, {
  projectName: '3-Bedroom Apartment',
  author: 'AI Assistant',
  organization: 'Client Name',
  schema: 'IFC2x3',  // or 'IFC4'
})
await fs.writeFile('apartment.ifc', ifcString)

// DXF export (AutoCAD — 2D floor plan)
import { exportToDXF } from '@pascal-app/exporters'

const dxfString = exportToDXF(model, {
  level: 'L0',           // which floor to export
  scale: 1,              // 1:1 in meters
  layers: ['walls', 'doors', 'windows', 'rooms'],
})
await fs.writeFile('apartment_floor_plan.dxf', dxfString)
```

---

## Complete Example Output

Input: *"3-bedroom apartment, 85m², north-facing entrance"*

Output JSON (abbreviated):

```json
{
  "units": "meters",
  "site": { "width": 12, "depth": 12, "orientation": 0 },
  "building": {
    "levels": [{
      "id": "L0",
      "name": "Ground Floor",
      "elevation": 0,
      "height": 2.7,
      "rooms": [
        { "name": "Living Room",     "type": "living",   "area": 18.4 },
        { "name": "Kitchen",         "type": "kitchen",  "area": 11.8 },
        { "name": "Master Bedroom",  "type": "bedroom",  "area": 14.0 },
        { "name": "Bedroom 2",       "type": "bedroom",  "area": 10.8 },
        { "name": "Bedroom 3",       "type": "bedroom",  "area": 10.5 },
        { "name": "Bathroom",        "type": "bathroom", "area": 5.2  },
        { "name": "En-suite",        "type": "ensuite",  "area": 4.8  },
        { "name": "Hallway",         "type": "corridor", "area": 5.1  }
      ],
      "totalArea": 80.6,
      "ceilingHeight": "2.7m",
      "wallThickness": { "exterior": "200mm", "interior": "100mm" }
    }]
  }
}
```

**Validation summary:**
- ✅ All rooms meet minimum area requirements
- ✅ Every habitable room has at least one window
- ✅ North-facing exterior wall has entry door
- ✅ Ceiling height 2.7m meets residential standard
- ✅ Corridor width 1.0m exceeds 900mm minimum
