---
title: Build a 3D Building Model with AI
slug: build-3d-building-model-with-ai
description: >-
  Generate architecturally correct 3D building models from natural language descriptions
  using AI to produce validated geometry with proper dimensions.
skills:
  - architectural-dimensions
  - pascal-editor
  - building-spec
category: design
tags: [architecture, 3d-modeling, floor-plan, building-generation]
---

# Build a 3D Building Model with AI

## The Problem

Architects and developers need to quickly prototype building layouts, but manual 3D modeling is slow and error-prone. Getting dimensions right -- ceiling heights, wall thicknesses, door sizes, room proportions -- requires constant reference to building codes. AI can generate geometry fast, but without dimensional constraints the output is unrealistic (2-meter ceilings, paper-thin walls, tiny rooms).

## The Solution

Combine the `architectural-dimensions` skill (dimensional rules and validation), `building-spec` skill (project-specific overrides), and `pascal-editor` skill (3D scene graph API) into a pipeline: natural language description goes in, validated BuildingModel JSON comes out, ready for 3D rendering in Pascal Editor.

## Step-by-Step Walkthrough

### Step 1: Describe the Building

Provide a natural language description with key requirements:

```
Create a 3-bedroom apartment, 85m2, ground floor, north-facing entrance.
Open-plan kitchen and living area, two bathrooms, storage closet.
```

### Step 2: Parse into a Room Program

Extract structured requirements from the description:

- Total area: 85 m2, single level, entrance on north wall
- Rooms: 3 bedrooms (min 10.5 m2 each), 1 living room (min 15.75 m2), 1 kitchen (min 7.2 m2), 2 bathrooms (min 5 m2 each), 1 corridor, 1 storage
- Check for a `BUILDING_SPEC.md` in the project root for custom overrides

### Step 3: Generate Layout with Correct Dimensions

Apply `architectural-dimensions` defaults: 2.7 m ceiling, 0.20 m exterior walls, 0.10 m partitions, 0.9 m x 2.1 m doors, 0.9 m window sill height. Calculate footprint (e.g., 9.5 m x 9.0 m = 85.5 m2 gross) and distribute rooms proportionally.

### Step 4: Validate the Model

Run validation checks against dimension rules:

- Every room meets minimum area and width
- Every habitable room has at least one window (area >= 10% of floor area)
- All doors and windows fit within their host walls with 100 mm edge clearance
- North wall has an exterior entry door
- Ceiling height >= 2.4 m for habitable rooms
- Corridor width >= 0.9 m

### Step 5: Load into Pascal Editor

Use `useScene.createNode()` to build the scene graph: Site, Building, Level, Wall nodes with Opening children, Zone nodes for rooms, Slab nodes for floors. Each node carries the validated dimensions from the previous steps.

### Step 6: Export

Export to BuildingModel JSON for further processing, IFC for BIM software, or DXF for 2D floor plans.

## Real-World Example

**Input:** "3-bedroom apartment, 85 m2, north-facing entrance"

**Output:** A validated BuildingModel with:

| Room | Area | Passes Minimum |
|------|------|----------------|
| Living Room | 18.4 m2 | Yes (min 15.75) |
| Kitchen | 11.8 m2 | Yes (min 7.2) |
| Master Bedroom | 14.0 m2 | Yes (min 10.5) |
| Bedroom 2 | 10.8 m2 | Yes (min 10.5) |
| Bedroom 3 | 10.5 m2 | Yes (min 10.5) |
| Bathroom | 5.2 m2 | Yes (min 5.0) |
| En-suite | 4.8 m2 | Yes (min 3.15) |
| Hallway | 5.1 m2 | Width 1.0 m (min 0.9) |

All walls have correct thickness (200 mm exterior, 100 mm interior). Ceiling height 2.7 m. Every habitable room has a window. Entry door on north wall.

## Related Skills

- `architectural-dimensions` -- dimension rules, validation checks, and default values
- `building-spec` -- project-specific dimension overrides via BUILDING_SPEC.md
- `pascal-editor` -- React Three Fiber scene graph for 3D rendering and editing
