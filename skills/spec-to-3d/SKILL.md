---
name: spec-to-3d
description: >-
  Generate 3D building massing models from architectural specifications, parsed drawings, or
  building code data. Produces a plain Building3D JSON and a Three.js group, and hands the
  result to Pascal Editor for refinement. Use when: converting floor plans to 3D, building
  spec-driven 3D models, generating architectural visualizations from structured data.
license: Apache-2.0
compatibility: "Node.js 18+, three (npm); Node.js 22.13+ for the optional Pascal Editor CLI"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: "3d-modeling, architecture, three-js, ifc, building-generation"
---

# Spec to 3D -- Building Model Generator

## Overview

Convert structured architectural data (from `architectural-drawing-parser` or a manual spec) into a 3D massing model: stacked floors, units side by side, a corridor and a footprint. This is a recipe you implement in your own project, not an installable package. It yields two outputs: a plain **Building3D JSON** (levels, units, corridors) for custom renderers, and a **Three.js `Group`** for a web viewer. For BIM-style editing, load the result into Pascal Editor, which agents drive through its MCP server. It is the last stage after `architectural-drawing-parser` and `ibc-building-codes`.

## Instructions

### Pipeline

```text
Architectural drawing (image/PDF)  ->  architectural-drawing-parser
Structured BuildingData JSON       ->  ibc-building-codes (validation)
Validated data                     ->  this recipe -> Building3D JSON / THREE.Group
Refinement and BIM                 ->  Pascal Editor (separate tool)
```

### Input

A `BuildingData` object needs at least `stories.actual` (number of floors) and `units`, an array of `{ name, areaSqft }`. Keep `occupancy`, `constructionType` and `height` from the parser for the code check, but the geometry below does not use them.

### Generation rules (defaults, all overridable)

1. **Floor-to-floor height**: 9 ft (2.743 m). This is a design default, not a code value. Minimum ceiling heights come from the building code that applies to the project, so check it before using the model for anything beyond massing.
2. **Unit footprint**: depth = sqrt(area x 1.5), width = area / depth (aspect 1:1.5). Use 1:2 or more for deep corridor-loaded units.
3. **Layout**: units side by side along x with a 0.15 m party wall; a 5 ft (1.524 m) corridor along the back of the units.
4. **Units are boxes**: rooms, walls, doors and windows are not generated. Take their positions from the drawing parser if you need them.
5. Internal dimensions are metres: 1 ft = 0.3048 m, 1 sqft = 0.092903 sqm.

### Reference implementation

Tested with `three@0.186.1` (`npm install three`, saved as an ES module such as `massing.mjs`):

```javascript
import * as THREE from "three";

const FT = 0.3048;
const FLOOR_HEIGHT = 9 * FT;       // 2.743 m floor to floor
const CORRIDOR = 5 * FT;           // 1.524 m
const PARTY_WALL = 0.15;           // m
const SQFT = 0.092903;

export function buildModel(spec) {
  const levels = [];
  let footprintWidth = 0, footprintDepth = 0;
  for (let i = 0; i < spec.stories.actual; i++) {
    let x = 0;
    const units = spec.units.map((u) => {
      const area = u.areaSqft * SQFT;
      const depth = Math.sqrt(area * 1.5);   // width:depth = 1:1.5
      const width = area / depth;
      const unit = { type: u.name, position: { x, y: i * FLOOR_HEIGHT, z: 0 }, width, depth, height: FLOOR_HEIGHT };
      x += width + PARTY_WALL;
      footprintDepth = Math.max(footprintDepth, depth);
      return unit;
    });
    footprintWidth = x - PARTY_WALL;
    levels.push({
      elevation: i * FLOOR_HEIGHT, height: FLOOR_HEIGHT, units,
      corridors: [{ x: 0, z: footprintDepth, width: footprintWidth, depth: CORRIDOR }],
    });
  }
  return { levels, totalHeight: levels.length * FLOOR_HEIGHT, footprintWidth, footprintDepth };
}

export function toThree(model) {
  const group = new THREE.Group();
  const slab = new THREE.MeshStandardMaterial({ color: 0xcfcfcf });
  const shell = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.6 });
  for (const level of model.levels) {
    for (const u of level.units) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(u.width, u.height, u.depth), shell);
      m.position.set(u.position.x + u.width / 2, u.position.y + u.height / 2, u.position.z + u.depth / 2);
      m.name = `${u.type}@${level.elevation.toFixed(2)}`;
      group.add(m);
    }
    for (const c of level.corridors) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.width, level.height, c.depth), slab);
      m.position.set(c.x + c.width / 2, level.elevation + level.height / 2, c.z + c.depth / 2);
      group.add(m);
    }
  }
  return group;
}
```

For the two units in Example 1 this gives a total height of 8.23 m and a footprint of 13.66 x 10.78 m.

### Output formats

| Format | Use | How |
|---|---|---|
| Building3D JSON | custom renderers, your own converters | `JSON.stringify(buildModel(spec))` |
| `THREE.Group` | web viewer, massing and spatial checks | `toThree(model)`, add to a scene |
| GLB | sharing, Blender, game engines | in the browser, pass the group to `GLTFExporter` from `three/examples/jsm/exporters/GLTFExporter.js` |
| Pascal Editor | BIM-style editing | create levels and walls through Pascal's MCP tools (see Guidelines) |

IFC is not produced by this recipe. Building3D has no walls or openings, so an IFC export needs a separate converter written against your own schema.

## Examples

### Example 1: A 3-story R-2 apartment building

A developer parsed an IBC compliance sheet: occupancy R-2, construction type V-B, 3 stories (4 permitted), Type A 834 SF and Type B 645 SF. They ask: "Make a 3D massing model of this building."

```javascript
const model = buildModel({
  stories: { actual: 3 },
  units: [{ name: "Type A", areaSqft: 834 }, { name: "Type B", areaSqft: 645 }],
});
console.log(model.totalHeight.toFixed(2), model.footprintWidth.toFixed(2), model.footprintDepth.toFixed(2));
```

```console
8.23 13.66 10.78
```

Level 0 has Type A at 7.19 x 10.78 m and Type B at 6.32 x 9.48 m with a 13.66 m corridor behind them; levels 1 and 2 repeat at elevations 2.74 m and 5.49 m.

### Example 2: A viewer for the model

The developer says: "Show it in the browser so I can check the proportions."

```javascript
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 1.2), toThree(model));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(25, 18, 30);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(7, 4, 6);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

The page shows three stacked translucent blocks per unit type with a grey corridor slab; orbit with the mouse. This needs a bundler or an import map for the `three` module specifiers.

## Guidelines

- The result is a massing model for spatial validation, not a BIM model and not a rendering. Stairs, rooms, doors and windows are not modelled.
- Do not present the output as code-compliant. Run `ibc-building-codes` on the data first; the corridor width here is a default, not checked against the code.
- For BIM work, run Pascal Editor locally with `npx @pascal-app/cli editor` (Node.js 22.13+), install the `pascal` command with `npm install --global @pascal-app/cli`, and configure your agent to launch `pascal mcp connect`. Let the agent create levels and walls from your Building3D numbers through the MCP tools; read the tool schemas first and do not hand-write Pascal's scene JSON.
- Keep one active agent client per local Pascal service.
- Keep units consistent: the parser reports feet and square feet, the geometry is metres.
