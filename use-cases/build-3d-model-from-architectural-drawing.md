---
title: Build 3D Model from Architectural Drawing
slug: build-3d-model-from-architectural-drawing
description: Turn an architectural drawing image into a code-checked 3D massing model using Vision AI parsing, IBC checks and a Three.js generation recipe.
skills:
  - architectural-drawing-parser
  - ibc-building-codes
  - spec-to-3d
category: design
tags:
  - architecture
  - 3d-modeling
  - building-codes
  - vision-ai
---

# Build 3D Model from Architectural Drawing

## The Problem

Architects and developers receive building drawings as images or PDFs and need 3D models for visualization, BIM workflows, or client presentations. Manually recreating a drawing in a 3D tool takes hours per sheet. The drawings also carry code data (occupancy type, construction type, sprinklers, stories, travel distances) that should be checked before anyone models or presents the building.

## The Solution

Chain three skills: (1) `architectural-drawing-parser` sends the drawing to a vision-capable Claude model and gets back structured building data as JSON, (2) `ibc-building-codes` checks that data against the International Building Code tables, and (3) `spec-to-3d` turns the validated numbers into a massing model: a plain Building3D JSON and a Three.js `Group`. The result is a massing model for spatial checks, not a BIM model: units are boxes, and walls, doors, windows and stairs are not generated. For BIM-style editing you hand the numbers to Pascal Editor.

## Step-by-Step Walkthrough

### Step 1: Prepare the drawing

Convert each PDF page to an image with `pdftoppm -jpeg -r 150 drawing.pdf page`. The Claude API also accepts a whole PDF as a `document` block (up to 32 MB per request and 100 pages when the context window is under 1M tokens). Images are downscaled to a long edge of 1568 px on standard models, so tiny dimension text on a large sheet can be lost; crop the table you need, such as the building area analysis, into its own image.

### Step 2: Parse the drawing

Ask the agent to run `architectural-drawing-parser` on the image. It sends the image first and the instructions after it, asks for one JSON object with occupancy, construction type, sprinkler system, stories, height, units with areas in sqft and sqm, and travel distances, and rejects the reply if required fields are missing. Fields the sheet does not show come back as `null`; do not fill them in by hand without saying so.

### Step 3: Validate against the IBC

Run the data through `ibc-building-codes`. It looks up the allowable height and stories for the occupancy and construction type (Tables 504.3 and 504.4, sprinklered column), exit access travel distance (Table 1017.2), exits per story (Table 1006.3.3) and the minimum dwelling unit size (Chapter 12), and compares them with the parsed values. Read each limit from the table text of the edition the project adopted, because many jurisdictions amend the code and sprinkler allowances are already built into the tables rather than added on top. Anything flagged here is fixed or noted before modeling.

### Step 4: Generate the massing model

`spec-to-3d` is a recipe you implement in your project, not an installable package. Save its reference implementation as `massing.mjs` (it needs `npm install three`; the page was checked with `three@0.186.1`) and call it with the validated data:

```javascript
import { buildModel } from "./massing.mjs";

const model = buildModel({
  stories: { actual: 3 },
  units: [{ name: "Type A", areaSqft: 834 }, { name: "Type B", areaSqft: 645 }],
});
console.log(model.totalHeight.toFixed(2), model.footprintWidth.toFixed(2), model.footprintDepth.toFixed(2));
```

```console
$ node run.mjs
8.23 13.66 10.78
```

The defaults are a 9 ft (2.74 m) floor-to-floor height, unit depth = sqrt(area x 1.5), a 0.15 m party wall between units and a 5 ft corridor behind them. They are design defaults, not code values.

### Step 5: Export and visualize

`JSON.stringify(model)` gives the Building3D JSON for your own converters. `toThree(model)` returns a `THREE.Group` that you add to a scene with `OrbitControls`; in a browser, `GLTFExporter` turns it into a GLB for Blender or other viewers. IFC is not produced: Building3D has no walls or openings, so an IFC export needs a converter you write against your own schema. For BIM-style work, run Pascal Editor locally with `npx @pascal-app/cli editor` (Node.js 22.13 or newer), install the `pascal` command with `npm install --global @pascal-app/cli`, and have your agent launch `pascal mcp connect`. The agent then creates levels and walls through Pascal's MCP tools using your Building3D numbers; read the tool schemas first and do not hand-write Pascal's scene JSON.

## Real-World Example

An architecture firm receives a scanned code sheet for a 3-story wood-frame apartment building and needs a massing model for a client meeting. The sheet shows R-2 occupancy, V-B construction, NFPA 13 sprinklers, 3 stories at 35 ft, a longest travel path of 66 ft and two unit types (Type A at 834 SF, Type B at 645 SF).

1. The parser extracts those fields as JSON; the height and story limits are read from the table, not from the sheet.
2. The IBC check compares 3 stories, 35 ft and the 66 ft travel path with the limits in the adopted edition's tables for R-2 / V-B sprinklered and flags anything over; the team confirms the unit sizes against the minimum in Chapter 12.
3. `buildModel` produces three levels of 2.74 m (8.23 m total); Type A is 7.19 m x 10.78 m, Type B is 6.32 m x 9.48 m, on a 13.66 m x 10.78 m footprint with a corridor behind the units.
4. The team views the Three.js group in a browser and sends the Building3D numbers to Pascal Editor for walls and levels.

The model shows mass and proportions only. Rooms, openings and stairs come from the drawings, and the code check does not replace review by the design professional or the code official.

## Related Skills

- [architectural-drawing-parser](../skills/architectural-drawing-parser/SKILL.md) -- Vision AI extraction of building data from drawings
- [ibc-building-codes](../skills/ibc-building-codes/SKILL.md) -- US building code reference and validation
- [spec-to-3d](../skills/spec-to-3d/SKILL.md) -- massing model generation from structured specs
