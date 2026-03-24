---
name: spec-to-3d
description: >-
  Generate 3D building models from architectural specifications, parsed drawings, or
  building code data. Outputs Three.js geometry, Pascal Editor JSON, or plain JSON for
  IFC conversion. Use when: converting floor plans to 3D, building spec-driven 3D models,
  generating architectural visualizations from structured data.
license: Apache-2.0
compatibility: "Node.js 18+, Three.js or Pascal Editor"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [3d-modeling, architecture, three-js, ifc, building-generation]
---

# Spec to 3D -- Building Model Generator

## Overview

Convert structured architectural data (from `architectural-drawing-parser` or manual specs) into 3D building models. Supports three output formats: **Three.js** (interactive web viewer), **Pascal Editor JSON** (BIM-style node graph), and **plain JSON** (for IFC/GLB conversion). Works as the final stage in a drawing-to-3D pipeline alongside `architectural-drawing-parser` and `ibc-building-codes`.

## Instructions

### Pipeline

```
Architectural Drawing (image/PDF)
        |  architectural-drawing-parser
Structured BuildingData JSON
        |  ibc-building-codes (validation)
Validated Building Data
        |  spec-to-3d (THIS SKILL)
3D Model Output:
  - Three.js Group (web viewer)
  - Pascal Editor JSON (BIM node graph)
  - Building3D JSON (for IFC/GLB export)
```

### Input Requirements

The generator expects a `BuildingData` object with:

- **stories** -- `{ permitted, actual }` (number of floors)
- **units** -- Array of `{ name, area: { sqft, sqm }, occupantLoad }` (unit types per floor)
- **height** -- `{ permitted, actual }` in feet and meters
- **occupancy** and **constructionType** -- for IBC validation context

### Generation Logic

1. **Floor-to-floor height**: Default 9'-0" (2.74m) per IBC R-2 residential standard (7'-0" minimum habitable)
2. **Unit dimensions**: Derived from area using 1:1.5 aspect ratio (width:depth). Override for corridor-loaded or deep units
3. **Wall thickness**: 300mm exterior, 150mm interior partitions (US wood frame standard)
4. **Layout**: Units placed side-by-side per floor with 150mm party walls, common corridor along one side (5'-0" / 1.52m wide)
5. **Stairs**: Two stairwells at building ends, 4'-0" wide x 10'-0" deep
6. **Room subdivision**: Automatic based on unit area -- studio (<50 sqm), 1-bed (50-70 sqm), 2-bed (>70 sqm)

### Output Formats

| Format | Use Case | Description |
|---|---|---|
| `json` (Building3D) | IFC conversion, custom renderers | Plain data: levels, units, rooms, walls, openings |
| `pascal` (Pascal Editor) | BIM workflows | Node graph with site > building > level > wall/room hierarchy |
| `threejs` (THREE.Group) | Web-based 3D viewer | Mesh geometry with materials for floors, walls, windows |

### Key Interfaces

```typescript
interface Building3D {
  levels: Level3D[];
  totalHeight: number;       // meters
  footprintWidth: number;
  footprintDepth: number;
}

interface Level3D {
  elevation: number;         // meters above grade
  height: number;            // floor-to-floor in meters
  units: Unit3D[];
  corridors: Box3D[];
  stairs: Stair3D[];
}

interface Unit3D {
  type: string;
  position: { x: number; y: number; z: number };
  width: number; depth: number; height: number;  // meters
  rooms: Room3D[];
  walls: Wall3D[];
  openings: Opening3D[];
}
```

## Examples

### Example 1: Converting a Building Spec to a 3D Model

A developer has parsed data from an IBC compliance sheet for a 3-story R-2 apartment building and wants to generate a 3D model for visualization.

```
Input BuildingData:
  occupancy: R-2, constructionType: V-B, sprinklerSystem: NFPA 13
  stories: { permitted: 4, actual: 3 }
  units:
    - Type A: 834 SF (77.5 sqm), 5 occupants
    - Type B: 645 SF (59.9 sqm), 4 occupants

Generated Building3D (format: "json"):
  Level 0 (Ground Floor): elevation 0.00m, height 2.74m
    Type A: 7.19m wide x 10.78m deep (2-bedroom layout: living, kitchen, master bed, bed 2, 2 baths)
    Type B: 6.32m wide x 9.48m deep (1-bedroom layout: living, kitchen, bedroom, bath)
    Corridor: full building width x 1.52m deep
    2 stairwells at building ends

  Level 1: elevation 2.74m, height 2.74m (same layout)
  Level 2: elevation 5.49m, height 2.74m (same layout, no stairs above)

  Total height: 8.23m
  Footprint: ~13.66m x 10.78m
  Wall count: 12 exterior + 8 interior per floor
  Openings: 1 door + 2 windows per unit
```

### Example 2: Generating IFC-Compatible Output

An architect needs to export the building data for use in an IFC/BIM workflow. They generate Pascal Editor JSON that maps to a site > building > level > element hierarchy.

```
Input: Same 3-story R-2 building as Example 1
Output format: "pascal"

Generated Pascal Editor JSON:
{
  "nodes": {
    "site_1700000000": { "type": "site", "parentId": null },
    "building_1700000000": { "type": "building", "parentId": "site_...", "width": 13.66, "depth": 10.78, "height": 8.23 },
    "level_0": { "type": "level", "name": "Ground Floor", "elevation": 0.00, "height": 2.74 },
    "level_1": { "type": "level", "name": "Level 1", "elevation": 2.74, "height": 2.74 },
    "level_2": { "type": "level", "name": "Level 2", "elevation": 5.49, "height": 2.74 },
    "wall_0_0": { "type": "wall", "parentId": "level_0", "start": { "x": 0, "y": 0 }, "end": { "x": 7.19, "y": 0 }, "thickness": 0.30, "isExterior": true },
    "room_0_0": { "type": "room", "parentId": "level_0", "name": "Living Room", "roomType": "living", "width": 4.31, "depth": 4.31 },
    ... (60+ nodes total across 3 levels)
  },
  "rootNodeIds": ["site_1700000000"]
}

This JSON imports directly into Pascal Editor or can be converted to IFC using ifcopenshell.
```

## Guidelines

- Floor-to-floor height defaults to 9'-0" (2.74m); override if the source drawing specifies otherwise
- Unit aspect ratio defaults to 1:1.5; corridor-loaded or deep units may need 1:2 or higher
- Window and door positions are generated algorithmically; use `architectural-drawing-parser` room extraction for actual positions from drawings
- The Three.js output creates simple box geometry -- suitable for massing models and spatial validation, not photorealistic rendering
- For production BIM use, export to Pascal Editor JSON and refine in a BIM tool
- Stair geometry is simplified (box representation); detailed stair modeling requires a dedicated BIM tool
- All dimensions are in meters internally; input data in feet is converted using 1 ft = 0.3048 m
