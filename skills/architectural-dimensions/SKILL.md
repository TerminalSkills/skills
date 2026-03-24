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
  version: "1.0.0"
  category: design
  tags: [architecture, dimensions, floor-plan, 3d, building]
---

# Architectural Dimensions Reference

## Overview

Authoritative dimensional standards for AI agents generating or validating 3D/2D architectural models. All dimensions follow international best practices and common building codes (ISO, IBC, Eurocode). All values are in meters (m) unless stated otherwise.

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

Never generate a habitable room with ceiling height < 2.4 m. Structural floor-to-floor height = ceiling height + 0.3-0.4 m for slab thickness.

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
| Accessible (wheelchair) | 0.900 m min | 2.100 m |

Door frame opening = leaf width + 100 mm each side. Minimum 100 mm clearance from door edge to adjacent wall corner. Door sill height is always 0 (at floor level).

### 4. Windows

| Window Type | Sill Height | Window Height |
|---|---|---|
| Standard residential | 0.900 m | 1.200-1.500 m |
| Low sill (living room) | 0.300-0.600 m | 1.500-1.800 m |
| Floor-to-ceiling | 0.100 m | ceiling height - 0.2 m |
| High window (bathroom) | 1.500-1.800 m | 0.400-0.600 m |

Every habitable room must have at least one window. Minimum window area >= 10% of floor area. Window head height should align with door head height (2.100-2.400 m).

### 5. Stairs

| Parameter | Minimum | Ideal | Maximum |
|---|---|---|---|
| Riser height | 0.150 m | 0.175 m | 0.190 m |
| Tread depth | 0.250 m | 0.280 m | 0.350 m |
| Stair width (residential) | 0.900 m | 1.000 m | -- |
| Headroom | 2.000 m | 2.100 m | -- |

Comfort rule: 2R + T = 600-630 mm. Number of risers = ceiling height / riser height (round to integer).

### 6. Room Sizes (Residential)

| Room | Minimum | Typical | Generous |
|---|---|---|---|
| Bedroom (single) | 7.2 m2 | 10.5 m2 | 14 m2 |
| Bedroom (master) | 10.5 m2 | 18 m2 | 27.5 m2 |
| Bathroom (full) | 3.15 m2 | 5 m2 | 8.75 m2 |
| Kitchen | 7.2 m2 | 12 m2 | 20 m2 |
| Living room | 15.75 m2 | 27 m2 | 42 m2 |
| Corridor/hallway | 0.9 m wide | 1.0-1.2 m | 1.5 m |

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
| Building footprint density | 30-60% of site for residential |
| Window-to-wall ratio | 15-40% (residential), 40-80% (commercial) |
| Circulation area ratio | 15-25% of total floor area |
| Bedrooms vs bathrooms | 1 bathroom per 2 bedrooms minimum |

Hard errors to flag: ceiling height < 2.1 m, exterior wall < 0.14 m thick, door width < 0.7 m, door height < 1.9 m, corridor width < 0.9 m, habitable room without window, no exterior exit door on any level.

## Examples

### Example 1: Validate a Residential Floor Plan

Given a 3-bedroom apartment at 85 m2:

- Ceiling height: 2.7 m (standard residential)
- Exterior walls: 0.20 m (masonry default)
- Interior partitions: 0.10 m
- Master bedroom: 14 m2 with 1.2 m x 1.2 m window at 0.9 m sill -- passes minimum 10.5 m2, has window
- Kitchen: 12 m2 with 1.0 m x 1.2 m window -- passes minimum 7.2 m2
- Corridor: 1.0 m wide -- passes minimum 0.9 m
- All doors: 0.9 m x 2.1 m standard, bathroom doors 0.8 m x 2.1 m
- Entry door: 1.0 m x 2.1 m on exterior wall
- Result: all checks pass

### Example 2: Calculate Stair Geometry for 2.7 m Ceiling

- Target riser: 0.175 m, tread: 0.280 m
- Number of risers: 2700 / 175 = 15.4, round to 16
- Adjusted riser: 2700 / 16 = 168.75 mm (within 150-190 range)
- Comfort check: 2(168.75) + 280 = 617.5 mm (within 600-630)
- Number of treads: 16 - 1 = 15
- Horizontal run: 15 x 0.280 = 4.200 m
- Stair width: 1.0 m (residential standard)
- Headroom clearance: 2.1 m minimum verified

## Guidelines

- Always use meters as the base unit for all dimensions
- When in doubt between minimum and standard values, use standard
- Exterior walls default to 0.20 m unless project specifies otherwise
- Interior partitions default to 0.10 m
- Ceiling height defaults to 2.7 m for residential
- Every habitable room must have natural light (window area >= 10% of floor area)
- Validate all openings fit within their host wall with 100 mm edge clearance
- For accessibility compliance, use 0.900 m minimum door width and 1.200 m corridor width
- Cross-reference room dimensions against both minimum area and minimum width requirements
