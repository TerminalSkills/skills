---
name: building-spec
description: >-
  Read and apply a project-specific BUILDING_SPEC.md or DIMENSIONS.md file before generating
  any architectural elements. Use when: generating floor plans, 3D buildings, or any spatial
  design where the project has defined custom dimensions, room requirements, or design standards.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: architecture
  tags: [architecture, dimensions, building-spec, floor-plan, 3d, standards, proportions]
  use-cases:
    - "Generate a building where all rooms, doors, and windows match client specifications"
    - "Validate that an AI-generated floor plan meets project-specific requirements"
    - "Apply custom dimension standards to any architectural generation task"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Building Spec

## Overview

Before generating any building, floor plan, or spatial design, always:
1. Look for `BUILDING_SPEC.md` or `DIMENSIONS.md` in the project root
2. Load the spec and treat it as ground truth
3. Fill any gaps with defaults from the `architectural-dimensions` skill
4. Validate all generated elements against the spec

## Finding the Spec File

```typescript
import fs from "fs";
import path from "path";

function findBuildingSpec(startDir: string = process.cwd()): string | null {
  const names = ["BUILDING_SPEC.md", "DIMENSIONS.md", "building-spec.md", "dimensions.md"];
  
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    dir = path.dirname(dir);
  }
  return null;
}

const specPath = findBuildingSpec();
const spec = specPath ? fs.readFileSync(specPath, "utf8") : null;
```

## Standard BUILDING_SPEC.md Template

Create this file in your project root:

```markdown
# Building Dimensions Specification

## Project Information
- **Project name:** [Your Project Name]
- **Standard:** Metric (meters) | Imperial (feet/inches)
- **Building type:** Residential | Commercial | Mixed-use | Industrial
- **Location/Code:** [Country/Region building code reference]

## Floor Heights
- Ground floor: 2.7m
- Upper floors: 2.7m
- Basement: 2.4m
- <!-- Override example: Ground floor: 3.5m (retail ground floor) -->

## Wall Thicknesses
- External walls: 0.25m
- Internal load-bearing walls: 0.20m
- Internal partitions: 0.10m

## Doors
- Main entrance: 1.0m wide × 2.1m tall
- Standard internal: 0.9m × 2.1m
- Bathroom: 0.8m × 2.1m
- Emergency/fire exit: 0.9m × 2.1m
- <!-- Add custom doors as needed -->

## Windows
- Standard sill height: 0.9m from floor
- Standard window: 1.2m wide × 1.2m tall
- Living area windows: 1.8m wide × 1.4m tall
- Bathroom: 0.6m × 0.6m (frosted)

## Room Requirements
| Room | Min Area | Min Width | Notes |
|------|----------|-----------|-------|
| Bedroom | 10m² | 2.7m | Must have window |
| Master bedroom | 16m² | 3.2m | En-suite if possible |
| Kitchen | 8m² | 2.4m | |
| Bathroom | 4m² | 1.5m | |
| Living room | 20m² | 3.5m | |
| Corridor | — | 1.0m | Accessible: 1.2m |

## Special Requirements
- Wheelchair accessible: [Yes/No, specify which areas]
- Minimum floor area: [total m²]
- Maximum building height: [m]
- Setbacks: [front/rear/side distances from plot boundary]
- Parking: [number of spaces required]

## Materials (for reference)
- External walls: [material]
- Roof: [type and material]
- Flooring: [material per room type]
```

## Parsing the Spec

When you receive a building spec, extract structured parameters:

```typescript
interface BuildingSpec {
  units: "metric" | "imperial";
  buildingType: string;
  floorHeights: {
    ground: number;
    upper: number;
    basement?: number;
  };
  walls: {
    external: number;
    loadBearing: number;
    partition: number;
  };
  doors: {
    mainEntrance: { width: number; height: number };
    internal: { width: number; height: number };
    bathroom: { width: number; height: number };
    [key: string]: { width: number; height: number };
  };
  windows: {
    sillHeight: number;
    standard: { width: number; height: number };
    [key: string]: any;
  };
  rooms: {
    [roomType: string]: {
      minArea: number;
      minWidth: number;
      notes?: string;
    };
  };
  special: {
    accessible?: boolean;
    minFloorArea?: number;
    maxHeight?: number;
    parking?: number;
  };
}

async function parseSpecWithAI(specMarkdown: string): Promise<BuildingSpec> {
  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Parse this building specification into a structured JSON object.
Extract all dimensions in meters (convert from feet if needed).

BUILDING SPEC:
${specMarkdown}

Return valid JSON matching the BuildingSpec interface. Use null for missing values.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : getDefaultSpec();
}
```

## Applying the Spec to Generation

```typescript
async function generateBuildingWithSpec(
  description: string,
  specPath?: string
): Promise<BuildingModel> {
  
  // 1. Load spec
  const specFile = specPath || findBuildingSpec();
  const specMarkdown = specFile ? fs.readFileSync(specFile, "utf8") : null;
  const spec = specMarkdown 
    ? await parseSpecWithAI(specMarkdown)
    : getDefaultSpec();

  // 2. Generate building with spec as constraint
  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: `You are an architectural design AI. Generate building models using the following specification as absolute constraints.

BUILDING SPECIFICATION:
${specMarkdown || "No spec file found — use standard architectural dimensions."}

RULES:
- All dimensions MUST comply with the spec
- If a spec value is not provided, use standard architectural defaults
- Every room must meet minimum area and width requirements
- All doors and windows must use spec-defined sizes
- Validate each element against spec before including it`,
    messages: [{
      role: "user",
      content: `Generate a building based on this description: ${description}
      
Output as JSON BuildingModel with all dimensions in meters.`,
    }],
  });

  const model = extractJSON(response);
  
  // 3. Validate against spec
  const violations = validateAgainstSpec(model, spec);
  if (violations.length > 0) {
    throw new Error(`Spec violations:\n${violations.join("\n")}`);
  }

  return model;
}
```

## Validation Against Spec

```typescript
interface SpecViolation {
  element: string;
  issue: string;
  expected: string;
  actual: string;
}

function validateAgainstSpec(model: BuildingModel, spec: BuildingSpec): SpecViolation[] {
  const violations: SpecViolation[] = [];

  for (const level of model.building.levels) {
    // Check ceiling height
    const expectedHeight = level.elevation === 0 
      ? spec.floorHeights.ground 
      : spec.floorHeights.upper;
    
    if (Math.abs(level.height - expectedHeight) > 0.05) {
      violations.push({
        element: `Level ${level.name}`,
        issue: "Ceiling height mismatch",
        expected: `${expectedHeight}m`,
        actual: `${level.height}m`,
      });
    }

    // Check wall thicknesses
    for (const wall of level.walls) {
      const expectedThickness = wall.isExterior 
        ? spec.walls.external 
        : spec.walls.partition;
      
      if (Math.abs(wall.thickness - expectedThickness) > 0.02) {
        violations.push({
          element: `Wall at (${wall.start.x},${wall.start.y})`,
          issue: "Wall thickness mismatch",
          expected: `${expectedThickness}m`,
          actual: `${wall.thickness}m`,
        });
      }

      // Check door dimensions
      for (const opening of wall.openings.filter(o => o.type === "door")) {
        const specDoor = spec.doors.internal;
        if (opening.width < specDoor.width - 0.05) {
          violations.push({
            element: "Door opening",
            issue: "Door too narrow",
            expected: `≥${specDoor.width}m`,
            actual: `${opening.width}m`,
          });
        }
      }
    }

    // Check room minimum sizes
    for (const room of level.rooms) {
      const roomSpec = spec.rooms[room.type];
      if (roomSpec && room.area < roomSpec.minArea) {
        violations.push({
          element: `Room: ${room.name}`,
          issue: "Room too small",
          expected: `≥${roomSpec.minArea}m²`,
          actual: `${room.area.toFixed(1)}m²`,
        });
      }
    }
  }

  return violations;
}
```

## Default Spec (Fallback)

```typescript
function getDefaultSpec(): BuildingSpec {
  return {
    units: "metric",
    buildingType: "residential",
    floorHeights: { ground: 2.7, upper: 2.7, basement: 2.4 },
    walls: { external: 0.25, loadBearing: 0.20, partition: 0.10 },
    doors: {
      mainEntrance: { width: 0.9, height: 2.1 },
      internal: { width: 0.9, height: 2.1 },
      bathroom: { width: 0.8, height: 2.1 },
    },
    windows: {
      sillHeight: 0.9,
      standard: { width: 1.2, height: 1.2 },
    },
    rooms: {
      bedroom: { minArea: 10, minWidth: 2.7 },
      master_bedroom: { minArea: 16, minWidth: 3.2 },
      kitchen: { minArea: 8, minWidth: 2.4 },
      bathroom: { minArea: 4, minWidth: 1.5 },
      living: { minArea: 20, minWidth: 3.5 },
      corridor: { minArea: 0, minWidth: 1.0 },
    },
    special: {},
  };
}
```

## Workflow Summary

```
1. findBuildingSpec() → locate BUILDING_SPEC.md
2. parseSpecWithAI()  → extract structured parameters
3. generateBuilding() → Claude generates with spec as system prompt constraint
4. validateAgainstSpec() → check every element meets spec
5. If violations → auto-fix or report to user
6. Output → validated BuildingModel JSON
```
