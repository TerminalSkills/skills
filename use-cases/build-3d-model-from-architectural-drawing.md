# Build a 3D Model from an Architectural Drawing

## Overview

**Goal:** Take an architectural drawing image or PDF (such as a US IBC code compliance sheet) and produce an accurate, code-validated 3D building model — without manual modeling.

**Who this is for:** Developers and architects who receive building drawings and need to quickly generate 3D visualizations, BIM models, or spatial data for downstream use. This workflow replaces hours of manual modeling with a fully automated, AI-driven pipeline.

**Skills used:**
- [`architectural-drawing-parser`](../skills/architectural-drawing-parser/SKILL.md) — Vision AI extraction
- [`ibc-building-codes`](../skills/ibc-building-codes/SKILL.md) — US code validation
- [`spec-to-3d`](../skills/spec-to-3d/SKILL.md) — 3D model generation

---

## Real Example

**Input drawing:** IBC code compliance sheet for a 3-story multi-family residential building.

```
Building Classification:
  Occupancy:         R-2 (Multi-family residential)
  Construction Type: V-B (Unprotected wood frame)
  Sprinkler System:  NFPA 13

Code Compliance:
  Height permitted:  60'-0" (with NFPA 13 sprinklers)
  Height actual:     ~35'-0"
  Stories permitted: 4 (with sprinklers)
  Stories actual:    3

Unit Types:
  Type A (Large):   834 SF (77.5 m²) → 5 occupants @ 1/200 SF
  Type B (Small):   645 SF (59.9 m²) → 4 occupants @ 1/200 SF

Egress:
  Max travel distance: 66'-0" (all floors) < 125'-0" permitted ✓
```

**Output:**
- 3D building with 3 levels, 2 unit types, egress stairs at both ends
- IBC compliance validated: PASS
- Exported as Pascal Editor JSON or Three.js scene

---

## Step-by-Step Guide

### Step 1 — Load the Architectural Drawing

Acceptable inputs:
- **JPEG/PNG image** of a scanned or photographed drawing
- **PDF converted to image** (use `pdf2image`, `pdftoppm`, or similar)
- **Public URL** to a drawing image

```typescript
// Option A: Local file
const imagePath = "./building_code_compliance.jpg";

// Option B: Public URL
const imageUrl = "https://example.com/drawings/floor-plan.png";

// Option C: Convert PDF to images first
// pdftoppm -jpeg -r 150 drawing.pdf drawing_page
// → drawing_page-1.jpg, drawing_page-2.jpg, etc.
```

For best results:
- Use **150 DPI or higher** resolution
- Make sure text in title blocks and tables is legible
- If the PDF has multiple sheets, convert each to a separate image

---

### Step 2 — Parse with Vision AI

Use the `architectural-drawing-parser` skill to extract structured building data:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const client = new Anthropic();

async function parseArchitecturalDrawing(imagePath: string) {
  const base64 = fs.readFileSync(imagePath).toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
        { type: "text", text: "Extract all building data as JSON: occupancy, constructionType, sprinklerSystem, stories {permitted, actual}, height {permitted, actual in feet and meters}, totalBuildingArea {sqft, sqm}, units [{name, area {sqft, sqm}, occupantLoad, loadFactor}], travelDistances [{floor, maximum {feet, meters}}]. Return only valid JSON." },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

const buildingData = await parseArchitecturalDrawing("./building_plan.jpg");
console.log("Extracted:", JSON.stringify(buildingData, null, 2));
```

**Expected output from the example drawing:**

```json
{
  "occupancy": "R-2",
  "constructionType": "V-B",
  "sprinklerSystem": "NFPA 13",
  "stories": { "permitted": 4, "actual": 3 },
  "height": {
    "permitted": { "feet": 60, "meters": 18.29 },
    "actual": { "feet": 35, "meters": 10.67 }
  },
  "totalBuildingArea": { "sqft": 8910, "sqm": 827.9 },
  "units": [
    { "name": "Type A", "area": { "sqft": 834, "sqm": 77.5 }, "occupantLoad": 5, "loadFactor": "1/200 SF" },
    { "name": "Type B", "area": { "sqft": 645, "sqm": 59.9 }, "occupantLoad": 4, "loadFactor": "1/200 SF" }
  ],
  "travelDistances": [
    { "floor": "Level 1", "maximum": { "feet": 66, "meters": 20.1 } },
    { "floor": "Level 2", "maximum": { "feet": 66, "meters": 20.1 } },
    { "floor": "Level 3", "maximum": { "feet": 66, "meters": 20.1 } }
  ],
  "scale": "1/16\" = 1'-0\""
}
```

---

### Step 3 — Validate Against IBC Codes

Use the `ibc-building-codes` skill to verify the design is code-compliant:

```typescript
function validateBuilding(buildingData: any) {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Height check (V-B + NFPA 13 → 60' max)
  const permittedFt = buildingData.height.permitted.feet;
  const actualFt = buildingData.height.actual.feet;
  if (actualFt > permittedFt) {
    violations.push(`Height ${actualFt}' exceeds permitted ${permittedFt}'`);
  }

  // Story check (V-B + NFPA 13 → 4 stories max)
  if (buildingData.stories.actual > buildingData.stories.permitted) {
    violations.push(`${buildingData.stories.actual} stories exceeds permitted ${buildingData.stories.permitted}`);
  }

  // Travel distance check (R-2 max 125')
  for (const td of buildingData.travelDistances) {
    if (td.maximum.feet > 125) {
      violations.push(`Travel distance ${td.maximum.feet}' on ${td.floor} exceeds 125' maximum`);
    }
  }

  // Unit size check (min 220 SF for studio, 70 SF per bedroom)
  for (const unit of buildingData.units) {
    if (unit.area.sqft < 220) {
      violations.push(`${unit.name}: ${unit.area.sqft} SF < 220 SF minimum`);
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}

const result = validateBuilding(buildingData);
// → { compliant: true, violations: [], warnings: [] }
```

---

### Step 4 — Generate 3D Model

Use the `spec-to-3d` skill to convert structured data into a 3D model:

```typescript
function generateBuilding3D(buildingData: any) {
  const ftToM = (ft: number) => ft * 0.3048;
  const levels = [];
  const levelHeightM = ftToM(9); // 9'-0" standard floor-to-floor

  for (let i = 0; i < buildingData.stories.actual; i++) {
    const elevation = i * levelHeightM;
    const units = [];
    let offsetX = 0;

    for (const unitType of buildingData.units) {
      const areaSqM = unitType.area.sqm;
      const depth = Math.sqrt(areaSqM / 1.5);
      const width = areaSqM / depth;

      units.push({
        type: unitType.name,
        position: { x: offsetX, y: elevation, z: 0 },
        width, depth, height: levelHeightM,
      });

      offsetX += width + 0.15;
    }

    levels.push({ elevation, height: levelHeightM, units });
  }

  return { levels, totalHeight: buildingData.stories.actual * levelHeightM };
}

const model = generateBuilding3D(buildingData);
console.log(`Generated: ${model.levels.length} levels, ${model.totalHeight.toFixed(2)}m total height`);
// → Generated: 3 levels, 8.23m total height
```

---

### Step 5 — Export to Your Format

#### Pascal Editor (BIM node graph)

```typescript
function toPascalEditor(building: any) {
  const nodes: any = {};
  const ts = Date.now();

  nodes[`site_${ts}`] = { id: `site_${ts}`, type: "site", parentId: null, visible: true };
  nodes[`building_${ts}`] = { id: `building_${ts}`, type: "building", parentId: `site_${ts}`, visible: true };

  building.levels.forEach((level: any, i: number) => {
    nodes[`level_${i}`] = {
      id: `level_${i}`, type: "level", parentId: `building_${ts}`,
      elevation: level.elevation, height: level.height,
      name: i === 0 ? "Ground Floor" : `Level ${i}`, visible: true,
    };
  });

  return { nodes, rootNodeIds: [`site_${ts}`] };
}

const pascalData = toPascalEditor(model);
fs.writeFileSync("building.pascal.json", JSON.stringify(pascalData, null, 2));
```

#### Three.js (web viewer)

```typescript
import * as THREE from "three";

function toThreeJS(building: any): THREE.Group {
  const group = new THREE.Group();

  for (const level of building.levels) {
    const levelGroup = new THREE.Group();
    levelGroup.position.y = level.elevation;

    for (const unit of level.units) {
      // Floor slab
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(unit.width, 0.2, unit.depth),
        new THREE.MeshLambertMaterial({ color: 0xd4c5a9 })
      );
      slab.position.set(unit.position.x + unit.width / 2, -0.1, unit.depth / 2);
      levelGroup.add(slab);

      // Exterior walls
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8ddd0 });
      [
        new THREE.BoxGeometry(unit.width, unit.height, 0.3), // front
        new THREE.BoxGeometry(unit.width, unit.height, 0.3), // back
      ].forEach((geo, idx) => {
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(unit.position.x + unit.width / 2, unit.height / 2, idx === 0 ? 0 : unit.depth);
        levelGroup.add(mesh);
      });
    }

    group.add(levelGroup);
  }

  return group;
}
```

#### Plain JSON (for IFC/GLB pipeline)

```typescript
fs.writeFileSync("building.json", JSON.stringify(model, null, 2));
// Feed into IFC.js, ifcopenshell, or a GLB exporter
```

---

### Step 6 — Load & Visualize

**Pascal Editor:** Import the `.pascal.json` file directly in Pascal Editor.

**Three.js web viewer:**

```html
<!DOCTYPE html>
<html>
<head><title>Building Viewer</title></head>
<body>
<script type="module">
  import * as THREE from "https://cdn.skypack.dev/three";
  import { OrbitControls } from "https://cdn.skypack.dev/three/examples/jsm/controls/OrbitControls.js";

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(30, 15, 30);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(10, 4, 5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  // Load and add the generated building
  const buildingGroup = toThreeJS(buildingModel); // from step 5
  scene.add(buildingGroup);

  // Grid helper
  scene.add(new THREE.GridHelper(100, 50, 0xcccccc, 0xe8e8e8));

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
</script>
</body>
</html>
```

---

## Complete Pipeline (one function)

```typescript
async function drawingTo3D(imagePath: string, format: "json" | "pascal" | "threejs" = "json") {
  console.log("1/3 Parsing drawing...");
  const buildingData = await parseArchitecturalDrawing(imagePath);

  console.log("2/3 Validating IBC compliance...");
  const validation = validateBuilding(buildingData);
  if (!validation.compliant) console.warn("Violations:", validation.violations);
  else console.log("  ✓ IBC compliant");

  console.log("3/3 Generating 3D model...");
  const model = generateBuilding3D(buildingData);

  switch (format) {
    case "pascal":  return toPascalEditor(model);
    case "threejs": return toThreeJS(model);
    default:        return model;
  }
}

// Usage
const model = await drawingTo3D("./ibc_compliance_drawing.jpg", "pascal");
fs.writeFileSync("output.pascal.json", JSON.stringify(model, null, 2));
console.log("Done! Open output.pascal.json in Pascal Editor.");
```

---

## Diagram: Data Flow

```
┌─────────────────────────────┐
│  Architectural Drawing      │
│  (JPG/PNG/PDF)              │
└────────────┬────────────────┘
             │ Vision AI (Claude)
             ▼
┌─────────────────────────────┐
│  BuildingData JSON          │
│  occupancy, type, stories,  │
│  height, units, egress...   │
└────────────┬────────────────┘
             │ IBC validation
             ▼
┌─────────────────────────────┐
│  Validated IBCBuildingModel │
│  ✓ height, ✓ stories,       │
│  ✓ travel distance, ✓ units │
└────────────┬────────────────┘
             │ 3D generation
             ▼
┌────────────────────────────────────────┐
│  Building3D                            │
│  3 levels × 2.74m each = 8.23m total  │
│  Type A: 7.19m × 10.78m per floor     │
│  Type B: 6.32m × 9.48m per floor      │
│  2 stairs, 1 corridor per floor        │
└──┬─────────────┬──────────────┬────────┘
   │             │              │
   ▼             ▼              ▼
Pascal       Three.js         JSON
Editor       Group          (IFC/GLB)
JSON         (web viewer)   export
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| JSON not extracted from drawing | Check image resolution (≥150 DPI); try cropping to the Building Area Analysis table |
| Wrong occupancy detected | Add `"Look specifically for occupancy type near the title block"` to the prompt |
| Unit areas seem off | Verify `loadFactor` field — confirm the drawing uses gross SF, not net |
| 3D model too flat/tall | Override `levelHeightFt` based on actual section drawing height |
| Travel distance violation | Check if the actual drawing has a longer corridor; adjust `corridorDepth` |
| PDF not accepted by API | Convert with `pdftoppm -jpeg -r 150 input.pdf page` first |
