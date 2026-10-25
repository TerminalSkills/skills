---
name: architectural-dimensions
description: >-
  Reference for architectural dimensions, proportions, and building codes for AI-generated
  3D/2D models. Use when: generating floor plans, creating 3D buildings, validating
  architectural designs, ensuring correct human-scale proportions in models.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: "architecture, dimensions, floor-plan, 3d, building"
---

# Architectural Dimensions Reference

## Overview

Dimensional ranges for AI agents generating or validating 3D/2D architectural models. Where a value comes from a code, the code is named (US IRC/IBC for residential and stairs, ADA 2010 for accessible routes, the English NDSS for bedroom areas). The other values are typical design ranges, not code minimums. Local building code governs any real project. All values are in meters (m) unless stated otherwise.

## Instructions

When generating or validating any building model, apply these dimensional standards in order:

### 1. Ceiling Heights

| Space Type | Minimum | Standard | Luxury |
|---|---|---|---|
| Residential habitable room | 2.4 m | 2.7 m | 3.0 m |
| Residential corridor/bathroom | 2.1 m | 2.4 m | 2.7 m |
| Commercial office | 2.7 m | 3.0-3.6 m | 4.0 m |
| Retail/showroom | 3.5 m | 4.0-5.0 m | 6.0 m |
| Industrial/warehouse | 4.5 m | 6.0-8.0 m | 12.0 m+ |

The 2.4 m residential minimum is a design floor, stricter than the IRC. IRC R305.1 requires 2.13 m (7 ft) for habitable space and 2.03 m (6 ft 8 in) for bathrooms and laundry, and sloped-ceiling rooms have their own exception. Never generate a habitable room with ceiling height < 2.4 m. Structural floor-to-floor height = ceiling height + 0.3-0.4 m for slab thickness.

### 2. Wall Thicknesses

| Wall Type | Thickness |
|---|---|
| Interior partition (non-load-bearing) | 0.10-0.15 m |
| Interior load-bearing | 0.20 m minimum |
| Exterior wall (timber/light frame) | 0.14-0.20 m |
| Exterior wall (masonry) | 0.20-0.35 m |
| Exterior wall (reinforced concrete) | 0.20-0.40 m |

### 3. Doors

| Door Type | Width | Height |
|---|---|---|
| Standard interior | 0.900 m | 2.100 m |
| Bathroom/WC | 0.800 m | 2.100 m |
| Main entry/exterior | 0.900-1.000 m | 2.100-2.400 m |
| Double door (pair) | 1.200-1.800 m | 2.100 m |
| Accessible route (ADA 2010) | 0.815 m clear minimum | 2.100 m |

Door frame opening = leaf width + 100 mm each side. Minimum 100 mm clearance from door edge to adjacent wall corner. Door sill height is always 0 (at floor level).

### 4. Windows

| Window Type | Sill Height | Window Height |
|---|---|---|
| Standard residential | 0.900 m | 1.200-1.500 m |
| Low sill (living room) | 0.300-0.600 m | 1.500-1.800 m |
| Floor-to-ceiling | 0.100 m | ceiling height - 0.2 m |
| High window (bathroom) | 1.500-1.800 m | 0.400-0.600 m |

Every habitable room must have at least one window. Glazed area must be at least 8% of floor area (IRC R303.1; the IBC has a comparable natural-light rule whose section number varies by edition; openable area is a separate requirement, 4% of floor area under IRC R303.1). The 10% figure used in earlier versions of this skill is a design habit, not the code minimum. Window head height should align with door head height (2.100-2.400 m).

### 5. Stairs

| Parameter | Design minimum | Ideal | Design maximum | IRC R311.7 (US residential) |
|---|---|---|---|---|
| Riser height | 0.150 m | 0.165-0.175 m | 0.190 m | max 0.196 m (7 3/4 in) |
| Tread depth | 0.250 m | 0.280 m | 0.350 m | min 0.254 m (10 in) with nosing |
| Stair width (residential) | 0.900 m | 1.000 m | -- | min 0.914 m (36 in) |
| Headroom | 2.000 m | 2.100 m | -- | min 2.032 m (6 ft 8 in) |

Comfort rule: 2R + T = 600-630 mm. The rise is the floor-to-floor height, not the ceiling height: floor-to-floor = ceiling height + slab. Number of risers = floor-to-floor / target riser (round to integer), then recompute the riser as floor-to-floor / number of risers.

```typescript
// Stair geometry from floor-to-floor height (meters in, millimeters out)
function stairGeometry(floorToFloorM: number, targetRiserMm = 167, treadMm = 280) {
  const rise = floorToFloorM * 1000;
  const risers = Math.round(rise / targetRiserMm);
  const riserMm = rise / risers;
  const comfort = 2 * riserMm + treadMm;
  return {
    risers,
    treads: risers - 1,
    riserMm: Number(riserMm.toFixed(1)),
    comfortMm: Number(comfort.toFixed(1)),
    comfortOk: comfort >= 600 && comfort <= 630,
    runM: (risers - 1) * treadMm / 1000,
  };
}

stairGeometry(3.0); // { risers: 18, treads: 17, riserMm: 166.7, comfortMm: 613.3, comfortOk: true, runM: 4.76 }
```

### 6. Room Sizes (Residential)

Minimum areas depend on the jurisdiction. The only values checked against a published standard are the English NDSS (gov.uk, 2015): a single bedroom needs at least 7.5 m2 and at least 2.15 m wide, and a double or twin bedroom needs at least 11.5 m2. Use these as the minimum for a bedroom unless local code states otherwise. Use the table below for typical sizes.

| Room | Minimum (NDSS, England) | Typical | Generous |
|---|---|---|---|
| Bedroom (single) | 7.5 m2 | 10.5 m2 | 14 m2 |
| Bedroom (double/master) | 11.5 m2 | 18 m2 | 27.5 m2 |
| Corridor/hallway | 0.914 m wide (IRC R311.6, 36 in) | 1.0-1.2 m | 1.5 m |

The typical and generous columns are design ranges, not code values. Bathroom, kitchen and living room minimums are not listed because no source checked here sets them; take them from the local code.

### 7. Human Scale Reference

| Reference | Dimension |
|---|---|
| Average adult height | 1.75 m |
| Eye level (standing) | 1.65 m |
| Counter height (kitchen) | 0.90 m |
| Dining table height | 0.73-0.76 m |
| Desk height | 0.72-0.75 m |
| Seat height (chair) | 0.43-0.46 m |
| Wheelchair width | 0.70 m, turn radius 1.50 m |

### 8. Default Values for Code Generation

```typescript
const DEFAULTS = {
  ceilingHeight: 2.7,
  wallThicknessInterior: 0.10,
  wallThicknessExterior: 0.20,
  slabThickness: 0.25,
  floorToFloor: 3.0,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windowSillHeight: 0.9,
  windowHeight: 1.2,
} as const;
```

### 9. Validation Checks

Before finalizing any model, verify:

| Check | Expected Range |
|---|---|
| Floor-to-floor height | 2.7-4.0 m (residential 3.0 m typical) |
| Building footprint density | 30-60% of site for residential (design heuristic) |
| Window-to-wall ratio | 15-40% (residential), 40-80% (commercial) (design heuristic) |
| Circulation area ratio | 15-25% of total floor area (design heuristic) |

Hard errors to flag: ceiling height < 2.1 m, exterior wall < 0.14 m thick, door width < 0.7 m, door height < 1.9 m, corridor width < 0.914 m, habitable room without glazing of at least 8% of floor area, no exterior exit door on any level.

```typescript
// Flag hard errors on a room list; each room: { name, ceilingM, glazedM2, areaM2 }
const hardErrors = (rooms: { name: string; ceilingM: number; glazedM2: number; areaM2: number }[]) =>
  rooms.flatMap((r) => {
    const errs: string[] = [];
    if (r.ceilingM < 2.1) errs.push(`${r.name}: ceiling ${r.ceilingM} m is below 2.1 m`);
    if (r.glazedM2 < 0.08 * r.areaM2) errs.push(`${r.name}: glazing below 8% of floor area`);
    return errs;
  });
```

## Examples

### Example 1: Validate a Residential Floor Plan

Request: "Check this 85 m2 three-bedroom flat plan against standard dimensions and list anything that fails."

- Ceiling height: 2.7 m (standard residential)
- Exterior walls: 0.20 m (masonry default)
- Interior partitions: 0.10 m
- Master bedroom: 14 m2 with 1.2 m x 1.2 m window at 0.9 m sill. Passes the 11.5 m2 double-bedroom minimum. Window area 1.44 m2 is 10.3% of the room, above the 8% glazing minimum.
- Second bedroom: 9 m2 with 1.2 m x 1.2 m window. Passes the 7.5 m2 single minimum and the 8% glazing rule.
- Kitchen: 12 m2 with 1.0 m x 1.2 m window. Area is a typical size; no minimum applied (check local code).
- Corridor: 1.0 m wide. Passes the 0.914 m minimum.
- All doors: 0.9 m x 2.1 m standard, bathroom doors 0.8 m x 2.1 m
- Entry door: 1.0 m x 2.1 m on exterior wall
- Result: all checks pass

### Example 2: Calculate Stair Geometry for a 3.0 m Floor-to-Floor

Request: "I have a 3.0 m floor-to-floor height and a 3.8 m run available. Generate the stair geometry."

- Target riser: 0.167 m, tread: 0.280 m
- Number of risers: 3000 / 167 = 17.96, round to 18
- Actual riser: 3000 / 18 = 166.67 mm (within 150-190 range, below the 196 mm IRC maximum)
- Comfort check: 2(166.67) + 280 = 613.3 mm (within 600-630)
- Number of treads: 18 - 1 = 17
- Horizontal run: 17 x 0.280 = 4.760 m (exceeds the 3.8 m available; reduce tread or use a turning or landing layout)
- Stair width: 1.0 m (residential standard, above the 0.914 m IRC minimum)
- Headroom clearance: 2.032 m minimum to be verified on the model

## Guidelines

- Always use meters as the base unit for all dimensions
- When in doubt between minimum and standard values, use standard
- Exterior walls default to 0.20 m unless project specifies otherwise
- Interior partitions default to 0.10 m
- Ceiling height defaults to 2.7 m for residential
- Every habitable room must have natural light (glazed area >= 8% of floor area, per IRC R303.1)
- Validate all openings fit within their host wall with 100 mm edge clearance
- Accessible routes (ADA 2010): 0.815 m clear door width minimum; 0.915 m (36 in) minimum clear walking width, which may narrow to 0.815 m for up to 0.61 m of length; 1.525 m (60 in) passing spaces at most 61 m apart where the route is narrower than 1.525 m. The 1.2 m corridor used in earlier versions is a design choice, not an ADA requirement
- Cross-reference room dimensions against both minimum area and minimum width requirements
- Local adopted code and amendments override every value here; state which code edition a check was made against
