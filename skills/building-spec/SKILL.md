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
  category: design
  tags: [architecture, building-spec, floor-plan, 3d, standards]
---

# Building Spec

## Overview

Before generating any building, floor plan, or spatial design, always look for a project-specific specification file. This skill defines the workflow for finding, parsing, and applying custom dimension constraints so that every generated element matches client requirements. When no spec file exists, fall back to defaults from the `architectural-dimensions` skill.

## Instructions

### Step 1: Find the Spec File

Search the project root (and parent directories) for any of these filenames:
- `BUILDING_SPEC.md`
- `DIMENSIONS.md`
- `building-spec.md`
- `dimensions.md`

If found, load it and treat it as ground truth for all dimensions.

### Step 2: Parse the Spec

Extract structured parameters from the spec file:

- **Units**: metric (meters) or imperial (feet/inches)
- **Floor heights**: ground, upper, basement ceiling heights
- **Wall thicknesses**: external, load-bearing, partition
- **Door dimensions**: main entrance, internal, bathroom (width x height)
- **Window dimensions**: sill height, standard size, room-specific overrides
- **Room requirements**: minimum area and width per room type
- **Special requirements**: accessibility, max height, setbacks, parking

### Step 3: Apply During Generation

When generating building geometry:

1. Use spec values as absolute constraints for all dimensions
2. Fill any gaps with defaults (ceiling 2.7 m, exterior wall 0.25 m, partition 0.10 m, door 0.9 m x 2.1 m)
3. Every room must meet the spec minimum area and width
4. All doors and windows must use spec-defined sizes

### Step 4: Validate Against Spec

After generation, check every element:

- Ceiling heights match spec per level type (ground vs upper)
- Wall thicknesses match spec (exterior vs partition)
- Door widths meet spec minimums
- Room areas meet spec minimums per room type
- Any violations must be reported or auto-corrected before output

### Standard BUILDING_SPEC.md Template

Projects should create this file in the root directory:

```markdown
# Building Dimensions Specification

## Project Information
- **Project name:** [Your Project Name]
- **Standard:** Metric (meters) | Imperial (feet/inches)
- **Building type:** Residential | Commercial | Mixed-use

## Floor Heights
- Ground floor: 2.7m
- Upper floors: 2.7m
- Basement: 2.4m

## Wall Thicknesses
- External walls: 0.25m
- Internal load-bearing: 0.20m
- Internal partitions: 0.10m

## Doors
- Main entrance: 1.0m wide x 2.1m tall
- Standard internal: 0.9m x 2.1m
- Bathroom: 0.8m x 2.1m

## Windows
- Standard sill height: 0.9m from floor
- Standard window: 1.2m wide x 1.2m tall

## Room Requirements
| Room | Min Area | Min Width |
|------|----------|-----------|
| Bedroom | 10m2 | 2.7m |
| Master bedroom | 16m2 | 3.2m |
| Kitchen | 8m2 | 2.4m |
| Bathroom | 4m2 | 1.5m |
| Living room | 20m2 | 3.5m |
| Corridor | -- | 1.0m |
```

### Default Fallback Values

When no spec file is found, use these defaults:

| Parameter | Value |
|---|---|
| Ceiling height (ground/upper) | 2.7 m |
| Ceiling height (basement) | 2.4 m |
| External wall | 0.25 m |
| Partition | 0.10 m |
| Main entrance door | 0.9 m x 2.1 m |
| Bathroom door | 0.8 m x 2.1 m |
| Window sill height | 0.9 m |
| Standard window | 1.2 m x 1.2 m |
| Bedroom min area | 10 m2 |
| Kitchen min area | 8 m2 |
| Living room min area | 20 m2 |
| Corridor min width | 1.0 m |

## Examples

### Example 1: Generate a Building from a Custom Spec

A project has `BUILDING_SPEC.md` with ground floor height 3.5 m (retail), upper floors 2.7 m, external walls 0.30 m, and minimum bedroom area 12 m2.

1. Find spec: `BUILDING_SPEC.md` exists in project root
2. Parse: ground=3.5 m, upper=2.7 m, ext_wall=0.30 m, bedroom_min=12 m2
3. Generate: ground floor level with 3.5 m ceiling, 0.30 m exterior walls, all bedrooms >= 12 m2
4. Validate: check each element against spec values
5. Result: all rooms meet custom minimums, ground floor has retail-height ceiling

### Example 2: Validate an Existing Model Against Spec

A model has a bedroom at 9 m2 but the spec requires minimum 10 m2:

1. Load spec: bedroom min area = 10 m2
2. Scan model rooms: bedroom R-bed2 has area 9.0 m2
3. Violation detected: "Room Bedroom 2: area 9.0 m2 < spec minimum 10 m2"
4. Auto-fix: expand room width from 2.5 m to 2.8 m, increasing area to 11.2 m2
5. Re-validate: all rooms now pass

### Example 3: No Spec File Found

No `BUILDING_SPEC.md` or `DIMENSIONS.md` in the project:

1. Search project root and parent directories -- not found
2. Fall back to default values (2.7 m ceiling, 0.25 m ext wall, 0.10 m partition)
3. Generate using defaults from the `architectural-dimensions` skill
4. Validate against standard minimums

## Guidelines

- Always search for a spec file before generating any architectural elements
- Spec values override all defaults -- treat the spec as ground truth
- If a spec value is missing for a particular element, use the default fallback
- Report all spec violations as errors, not warnings
- Pair this skill with `architectural-dimensions` for comprehensive validation
- When creating a new project, generate the `BUILDING_SPEC.md` template for the client to fill in
- Keep spec files in the project root for easy discovery
