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

Architects and developers need to quickly prototype building layouts, but manual 3D modeling is slow and error-prone. Getting dimensions right (ceiling heights, wall thicknesses, door sizes, room proportions) requires constant reference to building codes. AI can generate geometry fast, but without dimensional constraints the output is unrealistic: 2-meter ceilings, paper-thin walls, tiny rooms.

## The Solution

Combine three skills into a pipeline. `architectural-dimensions` supplies dimension defaults and the checks to run, `building-spec` reads the project's own `BUILDING_SPEC.md` and overrides those defaults, and `pascal-editor` turns the validated layout into a scene graph in Pascal Editor (the open-source React Three Fiber editor, [pascalorg/editor](https://github.com/pascalorg/editor)). Natural language goes in; a validated scene comes out that opens in the editor or can be edited by an agent over MCP. Local building code always overrides the defaults.

## Step-by-Step Walkthrough

### Step 1: Describe the building

```text
Create a 3-bedroom apartment, 85 m2, ground floor, north-facing entrance.
Open-plan kitchen and living area, two bathrooms, storage closet.
```

### Step 2: Write down the project spec

The `building-spec` skill looks for `BUILDING_SPEC.md` in the project root and treats it as ground truth. Anything it does not mention falls back to the `architectural-dimensions` defaults (2.7 m ceiling, 0.20 m exterior walls, 0.10 m partitions, 0.9 m x 2.1 m doors, 0.9 m sill). A short spec for this project:

```markdown
# Building Dimensions Specification
- Standard: Metric
- Ground floor ceiling: 2.7m
- External walls: 0.20m
- Main entrance: 1.0m x 2.1m
- Standard window: 1.5m x 1.2m, sill 0.9m

| Room | Min Area | Min Width |
|------|----------|-----------|
| Bedroom | 10m2 | 2.7m |
| Bathroom | 4m2 | 1.5m |
| Living + kitchen (open plan) | 28m2 | 3.5m |
| Corridor | -- | 1.0m |
```

These minimums are this client's choices, not code values. The general references the skill uses are the US IRC for ceiling height (IRC R305.1: 2.13 m for habitable space and hallways; the skill keeps a stricter 2.4 m design floor) and glazing (8% of floor area, IRC R303.1), and the English NDSS for bedroom areas.

### Step 3: Lay out the rooms and validate before building

Turn the description into a room program on a 10 m x 8.5 m footprint (85 m2, north edge at z = 0) and check each room against the spec: minimum area and width, glazing of at least 8% of floor area in habitable rooms, an exterior entry door on the north wall, corridor width at least 0.914 m. Fix the program until the checks pass, then build.

### Step 4: Build the scene with Pascal's node schemas

Install the core package and run the script below. It validates first, then creates site, building, level, four walls, the slab, the entry door, five windows and eight zones, and saves the node dictionary as JSON. Always create nodes through the `XNode.parse` schemas so ids and defaults are valid, and pass `thickness` and `height` explicitly for walls because they have no default. Door and window `position` is relative to the wall: `[distance along the wall, height of the centre, 0]`.

```javascript
// build-apartment.mjs  (npm install @pascal-app/core, "type": "module")
import { writeFileSync } from "node:fs";
import { useScene, SiteNode, BuildingNode, LevelNode, WallNode, DoorNode, WindowNode, SlabNode, ZoneNode } from "@pascal-app/core";

// Values from BUILDING_SPEC.md (building-spec), gaps filled from architectural-dimensions
const spec = { ceiling: 2.7, extWall: 0.2, door: [1.0, 2.1], window: [1.5, 1.2], minGlazing: 0.08, minHall: 0.914,
  min: { bedroom: [10, 2.7], bathroom: [4, 1.5], living: [28, 3.5] } };

// Room program: [name, kind, x0, z0, x1, z1] in metres; z = 0 is the north edge
const rooms = [
  ["Living + Kitchen", "living", 0, 0, 6, 5], ["Hall", "hall", 6, 0, 7, 5],
  ["Bathroom", "bathroom", 7, 0, 10, 2.5], ["En-suite", "bathroom", 7, 2.5, 10, 4], ["Storage", "storage", 7, 4, 10, 5],
  ["Bedroom 1", "bedroom", 0, 5, 3.5, 8.5], ["Bedroom 2", "bedroom", 3.5, 5, 6.5, 8.5], ["Bedroom 3", "bedroom", 6.5, 5, 10, 8.5],
];
const windows = { // glazed area per room in m2 (windows are 1.5 x 1.2 = 1.8 m2)
  "Living + Kitchen": 2, "Bedroom 1": 1, "Bedroom 2": 1, "Bedroom 3": 1 };

const errors = [];
for (const [name, kind, x0, z0, x1, z1] of rooms) {
  const w = Math.min(x1 - x0, z1 - z0), area = (x1 - x0) * (z1 - z0);
  const [minA, minW] = spec.min[kind] ?? [0, kind === "hall" ? spec.minHall : 0];
  if (area < minA || w < minW) errors.push(`${name}: ${area} m2 x ${w} m wide is below ${minA} m2 / ${minW} m`);
  const glazed = (windows[name] ?? 0) * spec.window[0] * spec.window[1];
  if (["living", "bedroom"].includes(kind) && glazed < spec.minGlazing * area) errors.push(`${name}: glazing below 8%`);
}
console.log(errors.length ? errors : "all room checks pass");

const s = useScene.getState();
const site = SiteNode.parse({ polygon: { type: "polygon", points: [[0, 0], [30, 0], [30, 30], [0, 30]] } });
s.createNode(site);
const building = BuildingNode.parse({}); s.createNode(building, site.id);
const level = LevelNode.parse({ level: 0, height: spec.ceiling }); s.createNode(level, building.id);

const outline = [[0, 0], [10, 0], [10, 8.5], [0, 8.5]];
const walls = outline.map((start, i) => {
  const wall = WallNode.parse({ start, end: outline[(i + 1) % 4], thickness: spec.extWall, height: spec.ceiling });
  s.createNode(wall, level.id); return wall;
});
s.createNode(SlabNode.parse({ polygon: outline, thickness: 0.25 }), level.id);
// Door and window positions are wall-local: [distance along the wall, height of the centre, 0]
const add = (Node, wall, along, w, h, y) =>
  s.createNode(Node.parse({ position: [along, y, 0], width: w, height: h, wallId: wall.id }), wall.id);
add(DoorNode, walls[0], 6.5, ...spec.door, spec.door[1] / 2);          // entrance, north wall, in the hall
for (const along of [8.25, 5.0, 1.75]) add(WindowNode, walls[2], along, ...spec.window, 0.9 + spec.window[1] / 2); // south wall bedrooms
for (const along of [7.25, 4.75]) add(WindowNode, walls[3], along, ...spec.window, 0.9 + spec.window[1] / 2);      // west wall living
for (const [name, , x0, z0, x1, z1] of rooms)
  s.createNode(ZoneNode.parse({ name, polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] }), level.id);

const nodes = useScene.getState().nodes;
writeFileSync("apartment-scene.json", JSON.stringify({ nodes }, null, 2));
const count = {}; for (const n of Object.values(nodes)) count[n.type] = (count[n.type] ?? 0) + 1;
console.log(count);
```

```console
$ node build-apartment.mjs
all room checks pass
{ site: 1, building: 1, level: 1, wall: 4, slab: 1, door: 1, window: 5, zone: 8 }
```

The script was run with `@pascal-app/core` 1.0.6 under Node. Rendering needs a browser with WebGPU, so the 3D view was not checked.

### Step 5: Open it in Pascal Editor, or let an agent edit it

```bash
npx @pascal-app/cli editor
```

This starts the editor together with a local MCP service. Point your agent at `pascal mcp connect` (see the Pascal README for `pascal mcp setup <client>`) and ask for changes such as "add a 1.2 m window to the south wall"; the edit appears in the open editor. To embed the viewer in your own app, install `@pascal-app/core`, `@pascal-app/viewer` and `@pascal-app/nodes` and register the built-in plugin with `loadPlugin(builtinPlugin)` before rendering `<Viewer />`.

### Step 6: Keep the result

The scene is a plain JSON dictionary of nodes (the script writes `apartment-scene.json`), and the editor stores projects in a local SQLite database under `~/.pascal/data/`. Pascal's repository contains an IFC *import* converter, but this pipeline does not rely on IFC or DXF export; if you need those formats, check the current Pascal release first.

## Real-World Example

**Input:** "3-bedroom apartment, 85 m2, north-facing entrance"

**Output:** a validated scene with these rooms (areas measured on wall centerlines):

| Room | Area | Spec minimum |
|------|------|--------------|
| Living + Kitchen | 30.0 m2 | 28 m2, passes |
| Bedroom 1 | 12.25 m2 | 10 m2, passes |
| Bedroom 2 | 10.5 m2 | 10 m2, passes |
| Bedroom 3 | 12.25 m2 | 10 m2, passes |
| Bathroom | 7.5 m2 | 4 m2, passes |
| En-suite | 4.5 m2 | 4 m2, passes |
| Hall | 5.0 m2, 1.0 m wide | 0.914 m wide, passes |
| Storage | 3.0 m2 | no minimum |

Walls are 0.20 m, the ceiling is 2.7 m, the entry door (1.0 m x 2.1 m) is on the north wall, and each living room and bedroom has glazing above 8% of its floor area. Bathrooms get no window in this layout; a real project would add one or mechanical ventilation per local code.

## Related Skills

- `architectural-dimensions` -- dimension rules, validation checks, and default values
- `building-spec` -- project-specific dimension overrides via BUILDING_SPEC.md
- `pascal-editor` -- node schemas, scene graph and MCP access for 3D rendering and editing
