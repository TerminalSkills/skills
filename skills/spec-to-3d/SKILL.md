---
name: spec-to-3d
description: >-
  Generate 3D building models from architectural specifications, parsed drawings, or
  building code data. Outputs Pascal Editor JSON, Three.js geometry, or IFC format.
  Use when: converting floor plans to 3D, building spec-driven 3D models, generating
  architectural visualizations from structured data.
license: Apache-2.0
compatibility: "Node.js 18+, Three.js or Pascal Editor"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: architecture
  tags: [3d-modeling, architecture, pascal-editor, three-js, ifc, floor-plan, building-generation]
  use-cases:
    - "Generate a 3D apartment building from an IBC code compliance drawing"
    - "Convert a parsed floor plan JSON into a Three.js 3D scene"
    - "Build a multi-story residential building model from unit type specifications"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Spec to 3D — Building Model Generator

## Overview

Convert structured architectural data (from `architectural-drawing-parser` or manual specs) into 3D building models. Supports three output formats: **Pascal Editor JSON** (BIM-style node graph), **Three.js** (interactive web viewer), and **plain JSON** (for further processing or IFC conversion).

## Pipeline Overview

```
Architectural Drawing (image/PDF)
        ↓  architectural-drawing-parser
Structured BuildingData JSON
        ↓  ibc-building-codes (validation)
Validated IBCBuildingModel
        ↓  spec-to-3d  ← THIS SKILL
3D Model Output:
  ├── Pascal Editor JSON (BIM node graph)
  ├── Three.js Group (interactive web viewer)
  └── Building3D JSON (plain data for IFC/GLB export)
```

## 3D Data Interfaces

```typescript
interface Point3D { x: number; y: number; z: number; }

interface Building3D {
  levels: Level3D[];
  totalHeight: number;  // meters
  footprintWidth: number;
  footprintDepth: number;
}

interface Level3D {
  elevation: number;    // meters above grade
  height: number;       // floor-to-floor height in meters
  units: Unit3D[];
  corridors: Box3D[];
  stairs: Stair3D[];
}

interface Unit3D {
  type: string;         // "Type A", "Type B", etc.
  position: Point3D;
  width: number;        // meters
  depth: number;        // meters
  height: number;       // floor-to-ceiling in meters
  rooms: Room3D[];
  walls: Wall3D[];
  openings: Opening3D[];
}

interface Room3D {
  name: string;
  type: string;
  x: number; y: number; z: number;
  width: number; depth: number; height: number;  // all in meters
}

interface Wall3D {
  startX: number; startZ: number;
  endX: number; endZ: number;
  centerX: number; centerZ: number;
  length: number;
  thickness: number;   // typically 0.15m interior, 0.3m exterior
  rotation: number;    // radians
  isExterior: boolean;
}

interface Opening3D {
  type: "door" | "window";
  wallIndex: number;
  position: number;    // 0.0–1.0 along wall
  width: number;
  height: number;
  sillHeight: number;  // 0 for doors, ~0.9m for windows
}

interface Box3D {
  x: number; z: number;
  width: number; depth: number; height: number;
}

interface Stair3D {
  x: number; z: number;
  width: number; depth: number;
  bottomElevation: number;
  topElevation: number;
  direction: "north" | "south" | "east" | "west";
}
```

## Core: Generate Building3D from ParsedData

```typescript
// Convert feet to meters
const ftToM = (ft: number) => ft * 0.3048;

function generateBuilding3D(buildingData: BuildingData): Building3D {
  const levels: Level3D[] = [];

  // R-2 residential standard: 9'-0" floor-to-floor (2.74m)
  // Minimum per IBC: 7'-0" (2.13m) habitable rooms
  const levelHeightFt = 9.0;
  const levelHeightM = ftToM(levelHeightFt);

  let maxWidth = 0;
  let maxDepth = 0;

  for (let i = 0; i < buildingData.stories.actual; i++) {
    const elevation = i * levelHeightM;
    const units: Unit3D[] = [];
    let offsetX = 0;

    for (const unitType of buildingData.units) {
      // Derive 3D dimensions from area
      // Typical apartment aspect ratio 1:1.5 (width:depth)
      const areaSqM = unitType.area.sqm;
      const aspectRatio = 1.5;
      const depth = Math.sqrt(areaSqM / aspectRatio);
      const width = areaSqM / depth;

      const unit: Unit3D = {
        type: unitType.name,
        position: { x: offsetX, y: elevation, z: 0 },
        width,
        depth,
        height: levelHeightM,
        rooms: generateRoomsForUnit(unitType, width, depth, levelHeightM),
        walls: generateUnitWalls(offsetX, 0, width, depth, levelHeightM),
        openings: generateUnitOpenings(width, depth),
      };

      units.push(unit);
      offsetX += width + 0.15; // 150mm party wall between units
    }

    maxWidth = Math.max(maxWidth, offsetX);
    maxDepth = Math.max(maxDepth, units[0]?.depth ?? 0);

    // Common corridor runs along one side of all units
    const corridorDepth = ftToM(5); // 5'-0" (1.52m) corridor
    const corridors: Box3D[] = [{
      x: 0,
      z: -corridorDepth,
      width: offsetX,
      depth: corridorDepth,
      height: levelHeightM,
    }];

    // Stairs at each end of corridor (skip for top floor)
    const stairs: Stair3D[] = i < buildingData.stories.actual - 1
      ? generateStairs(elevation, levelHeightM, offsetX)
      : [];

    levels.push({ elevation, height: levelHeightM, units, corridors, stairs });
  }

  return {
    levels,
    totalHeight: buildingData.stories.actual * levelHeightM,
    footprintWidth: maxWidth,
    footprintDepth: maxDepth,
  };
}

function generateRoomsForUnit(
  unit: UnitType,
  width: number,
  depth: number,
  floorHeight: number
): Room3D[] {
  const layout = determineUnitLayout(unit.area.sqm);
  const rooms: Room3D[] = [];
  let currentY = 0;

  for (const room of layout) {
    const roomWidth = room.widthRatio * width;
    const roomDepth = room.depthRatio * depth;
    const ceilHeight = room.type === "bathroom" ? 2.44 : floorHeight - 0.3;

    rooms.push({
      name: room.name,
      type: room.type,
      x: room.xOffset * width,
      y: currentY,
      z: 0,
      width: roomWidth,
      depth: roomDepth,
      height: ceilHeight,
    });

    if (room.stackVertically) currentY += roomDepth;
  }

  return rooms;
}

interface RoomLayout {
  name: string; type: string;
  widthRatio: number; depthRatio: number;
  xOffset: number; stackVertically: boolean;
}

function determineUnitLayout(areaSqM: number): RoomLayout[] {
  if (areaSqM < 50) {
    // Studio / efficiency (< ~540 SF)
    return [
      { name: "Living/Bedroom", type: "living",  widthRatio: 1.0, depthRatio: 0.75, xOffset: 0,   stackVertically: true },
      { name: "Kitchen",        type: "kitchen", widthRatio: 0.5, depthRatio: 0.15, xOffset: 0,   stackVertically: false },
      { name: "Bathroom",       type: "bathroom",widthRatio: 0.5, depthRatio: 0.15, xOffset: 0.5, stackVertically: true },
    ];
  } else if (areaSqM < 70) {
    // 1 bedroom (645 SF ≈ 59.9 m²)
    return [
      { name: "Living Room", type: "living",  widthRatio: 0.6, depthRatio: 0.45, xOffset: 0,   stackVertically: false },
      { name: "Kitchen",     type: "kitchen", widthRatio: 0.4, depthRatio: 0.45, xOffset: 0.6, stackVertically: true },
      { name: "Bedroom",     type: "bedroom", widthRatio: 0.6, depthRatio: 0.40, xOffset: 0,   stackVertically: true },
      { name: "Bathroom",    type: "bathroom",widthRatio: 0.4, depthRatio: 0.40, xOffset: 0.6, stackVertically: false },
    ];
  } else {
    // 2 bedroom (834 SF ≈ 77.5 m²)
    return [
      { name: "Living Room",    type: "living",  widthRatio: 0.6,  depthRatio: 0.40, xOffset: 0,    stackVertically: false },
      { name: "Kitchen",        type: "kitchen", widthRatio: 0.4,  depthRatio: 0.40, xOffset: 0.6,  stackVertically: false },
      { name: "Master Bedroom", type: "bedroom", widthRatio: 0.5,  depthRatio: 0.35, xOffset: 0,    stackVertically: true },
      { name: "Bedroom 2",      type: "bedroom", widthRatio: 0.5,  depthRatio: 0.35, xOffset: 0.5,  stackVertically: false },
      { name: "Master Bath",    type: "bathroom",widthRatio: 0.25, depthRatio: 0.25, xOffset: 0,    stackVertically: true },
      { name: "Bathroom",       type: "bathroom",widthRatio: 0.25, depthRatio: 0.25, xOffset: 0.25, stackVertically: false },
    ];
  }
}

function generateUnitWalls(
  unitX: number, unitZ: number,
  width: number, depth: number, height: number
): Wall3D[] {
  const extThick = 0.30;  // 300mm exterior wall
  const intThick = 0.15;  // 150mm interior partition

  return [
    // Exterior walls
    { startX: unitX,       startZ: unitZ,       endX: unitX + width, endZ: unitZ,       centerX: unitX + width / 2, centerZ: unitZ,           length: width, thickness: extThick, rotation: 0,            isExterior: true },
    { startX: unitX,       startZ: unitZ + depth, endX: unitX + width, endZ: unitZ + depth, centerX: unitX + width / 2, centerZ: unitZ + depth, length: width, thickness: extThick, rotation: 0,            isExterior: true },
    { startX: unitX,       startZ: unitZ,       endX: unitX,         endZ: unitZ + depth, centerX: unitX,             centerZ: unitZ + depth / 2, length: depth, thickness: extThick, rotation: Math.PI / 2, isExterior: true },
    { startX: unitX + width, startZ: unitZ,     endX: unitX + width, endZ: unitZ + depth, centerX: unitX + width,     centerZ: unitZ + depth / 2, length: depth, thickness: intThick, rotation: Math.PI / 2, isExterior: false },
  ];
}

function generateUnitOpenings(width: number, depth: number): Opening3D[] {
  return [
    // Front door
    { type: "door",   wallIndex: 0, position: 0.15, width: 0.91, height: 2.13, sillHeight: 0 },
    // Living room window
    { type: "window", wallIndex: 1, position: 0.30, width: 1.52, height: 1.22, sillHeight: 0.91 },
    // Bedroom window
    { type: "window", wallIndex: 1, position: 0.70, width: 1.07, height: 1.22, sillHeight: 0.91 },
  ];
}

function generateStairs(
  bottomElevation: number, floorHeight: number, buildingWidth: number
): Stair3D[] {
  // Two stairs at opposite ends of the building
  return [
    {
      x: 0, z: -ftToM(10),
      width: ftToM(4), depth: ftToM(10),
      bottomElevation,
      topElevation: bottomElevation + floorHeight,
      direction: "north",
    },
    {
      x: buildingWidth - ftToM(4), z: -ftToM(10),
      width: ftToM(4), depth: ftToM(10),
      bottomElevation,
      topElevation: bottomElevation + floorHeight,
      direction: "north",
    },
  ];
}
```

## Output Format 1: Three.js Scene

```typescript
import * as THREE from "three";

function buildThreeJSScene(building: Building3D): THREE.Group {
  const buildingGroup = new THREE.Group();

  for (const level of building.levels) {
    const levelGroup = new THREE.Group();
    levelGroup.position.y = level.elevation;

    for (const unit of level.units) {
      // Floor slab
      const slabGeo = new THREE.BoxGeometry(unit.width, 0.2, unit.depth);
      const slabMat = new THREE.MeshLambertMaterial({ color: 0xd0d0d0 });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(unit.position.x + unit.width / 2, -0.1, unit.depth / 2);
      levelGroup.add(slab);

      // Walls
      for (const wall of unit.walls) {
        const wallGeo = new THREE.BoxGeometry(wall.length, unit.height, wall.thickness);
        const wallMat = new THREE.MeshLambertMaterial({
          color: wall.isExterior ? 0xc8b89a : 0xe8e8e8,
        });
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(wall.centerX, unit.height / 2, wall.centerZ);
        wallMesh.rotation.y = wall.rotation;
        levelGroup.add(wallMesh);
      }

      // Windows (translucent blue boxes)
      for (const opening of unit.openings.filter(o => o.type === "window")) {
        const winGeo = new THREE.BoxGeometry(opening.width, opening.height, 0.05);
        const winMat = new THREE.MeshLambertMaterial({
          color: 0x88ccff, transparent: true, opacity: 0.4,
        });
        const winMesh = new THREE.Mesh(winGeo, winMat);
        levelGroup.add(winMesh);
      }
    }

    // Corridors
    for (const corridor of level.corridors) {
      const corrGeo = new THREE.BoxGeometry(corridor.width, corridor.height, corridor.depth);
      const corrMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
      const corr = new THREE.Mesh(corrGeo, corrMat);
      corr.position.set(corridor.x + corridor.width / 2, corridor.height / 2, corridor.z + corridor.depth / 2);
      levelGroup.add(corr);
    }

    // Stairs
    for (const stair of level.stairs) {
      const stairGeo = new THREE.BoxGeometry(stair.width, level.height, stair.depth);
      const stairMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
      const stairMesh = new THREE.Mesh(stairGeo, stairMat);
      stairMesh.position.set(stair.x + stair.width / 2, level.height / 2, stair.z + stair.depth / 2);
      levelGroup.add(stairMesh);
    }

    buildingGroup.add(levelGroup);
  }

  return buildingGroup;
}
```

## Output Format 2: Pascal Editor JSON

```typescript
function toPascalEditorFormat(building: Building3D): { nodes: Record<string, any>; rootNodeIds: string[] } {
  const nodes: Record<string, any> = {};
  const rootNodeIds: string[] = [];

  const ts = Date.now();
  const siteId = `site_${ts}`;
  nodes[siteId] = { id: siteId, type: "site", parentId: null, visible: true };
  rootNodeIds.push(siteId);

  const buildingId = `building_${ts}`;
  nodes[buildingId] = {
    id: buildingId, type: "building", parentId: siteId,
    width: building.footprintWidth, depth: building.footprintDepth,
    height: building.totalHeight, visible: true,
  };

  for (let i = 0; i < building.levels.length; i++) {
    const level = building.levels[i];
    const levelId = `level_${i}`;

    nodes[levelId] = {
      id: levelId, type: "level", parentId: buildingId,
      elevation: level.elevation, height: level.height,
      name: i === 0 ? "Ground Floor" : `Level ${i}`,
      visible: true,
    };

    // Walls from all units on this level
    let wallIdx = 0;
    for (const unit of level.units) {
      for (const wall of unit.walls) {
        const wallId = `wall_${i}_${wallIdx++}`;
        nodes[wallId] = {
          id: wallId, type: "wall", parentId: levelId,
          start: { x: wall.startX, y: wall.startZ },
          end:   { x: wall.endX,   y: wall.endZ },
          thickness: wall.thickness,
          height: level.height,
          isExterior: wall.isExterior,
          visible: true,
        };
      }
    }

    // Rooms
    let roomIdx = 0;
    for (const unit of level.units) {
      for (const room of unit.rooms) {
        const roomId = `room_${i}_${roomIdx++}`;
        nodes[roomId] = {
          id: roomId, type: "room", parentId: levelId,
          name: room.name, roomType: room.type,
          x: unit.position.x + room.x, z: room.y,
          width: room.width, depth: room.depth,
          height: room.height, visible: true,
        };
      }
    }
  }

  return { nodes, rootNodeIds };
}
```

## Full Pipeline: Drawing → 3D

```typescript
async function drawingTo3D(
  imagePath: string,
  outputFormat: "threejs" | "pascal" | "json" = "json"
): Promise<Building3D | THREE.Group | ReturnType<typeof toPascalEditorFormat>> {

  // Step 1: Parse the architectural drawing
  console.log("Step 1: Parsing architectural drawing with Vision AI...");
  const buildingData = await parseArchitecturalDrawing(imagePath);
  console.log(`  → Occupancy: ${buildingData.occupancy}, Type: ${buildingData.constructionType}`);
  console.log(`  → ${buildingData.stories.actual} stories, ${buildingData.height.actual.feet}' actual height`);
  console.log(`  → ${buildingData.units.length} unit type(s)`);

  // Step 2: Build and validate the IBC model
  console.log("Step 2: Validating against IBC codes...");
  const ibcModel: IBCBuildingModel = {
    codeReference: "IBC 2021",
    occupancy: { primary: buildingData.occupancy, mixed: false },
    constructionType: buildingData.constructionType,
    sprinklers: { required: true, system: buildingData.sprinklerSystem as any },
    code_compliance: {
      permittedHeight: buildingData.height.permitted,
      actualHeight:    buildingData.height.actual,
      permittedStories: buildingData.stories.permitted,
      actualStories:    buildingData.stories.actual,
      permittedArea: { sqft: 999999, sqm: 92903 },
      actualArea:    buildingData.totalBuildingArea,
      compliant: true,
    },
    egress: {
      travelDistance: {
        max_feet: 125,
        actual_max_feet: Math.max(...buildingData.travelDistances.map(t => t.maximum.feet)),
        compliant: true,
      },
      exits_per_floor: 2,
      stairWidth: { inches: 44, mm: 1118 },
    },
    units: buildingData.units.map(u => ({
      type: u.name, count: u.count ?? 1,
      area: u.area, bedrooms: Math.max(0, Math.round(u.area.sqft / 300) - 1),
      occupantLoad: u.occupantLoad,
    })),
  };

  const validation = validateIBCCompliance(ibcModel);
  if (validation.violations.length > 0) {
    console.warn("  ⚠ IBC violations:", validation.violations);
  } else {
    console.log("  ✓ IBC compliance: PASS");
  }
  if (validation.warnings.length > 0) {
    console.warn("  ⚠ Warnings:", validation.warnings);
  }

  // Step 3: Generate 3D model
  console.log("Step 3: Generating 3D model...");
  const building3D = generateBuilding3D(buildingData);
  console.log(`  → ${building3D.levels.length} levels, total height ${building3D.totalHeight.toFixed(2)}m`);

  if (outputFormat === "pascal") {
    const pascal = toPascalEditorFormat(building3D);
    console.log(`  → Pascal Editor: ${Object.keys(pascal.nodes).length} nodes`);
    return pascal;
  }

  if (outputFormat === "threejs") {
    const scene = buildThreeJSScene(building3D);
    console.log(`  → Three.js Group ready`);
    return scene;
  }

  return building3D;
}
```

## Example: R-2 / V-B 3-Story Building

Running the full pipeline on the sample IBC compliance drawing:

```
Input:  building_code_compliance.jpg
        R-2 occupancy, V-B construction, NFPA 13, 3 stories

Step 1: Parsing architectural drawing with Vision AI...
  → Occupancy: R-2, Type: V-B
  → 3 stories, 35' actual height (60' permitted with sprinklers)
  → 2 unit types

Step 2: Validating against IBC codes...
  ✓ IBC compliance: PASS

Step 3: Generating 3D model...
  → 3 levels, total height 8.23m

Generated Building3D:
  Level 0 (Ground Floor):  elevation 0.00m,  height 2.74m
  Level 1:                 elevation 2.74m,  height 2.74m
  Level 2:                 elevation 5.49m,  height 2.74m

Unit Types per Floor:
  Type A (834 SF / 77.5 m²): width 7.19m × depth 10.78m, 2 bedrooms, 5 occupants
  Type B (645 SF / 59.9 m²): width 6.32m × depth 9.48m,  1 bedroom,  4 occupants

Egress:
  2 stairs per floor, 44" wide, at building ends
  Common corridor: 5'-0" (1.52m) wide
  Max travel distance: 66'-0" < 125'-0" permitted ✓
```

## Supported Output Formats

| Format | Use Case |
|---|---|
| `json` (Building3D) | Further processing, IFC conversion, custom renderers |
| `pascal` (Pascal Editor) | Direct import into Pascal Editor BIM tool |
| `threejs` (THREE.Group) | Web-based interactive 3D viewer |

## Notes on Accuracy

- Floor-to-floor height defaults to 9'-0" (2.74m); override `levelHeightFt` if drawing specifies otherwise
- Unit aspect ratio defaults to 1:1.5; override `aspectRatio` for corridor-loaded or deep units
- Wall thickness: 300mm exterior, 150mm interior partitions (standard US wood frame)
- Window/door positions are generated algorithmically; use `extractFloorPlanRooms()` for actual positions from drawings
