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
  category: architecture
  tags: [architecture, dimensions, floor-plan, 3d, building, proportions, spatial-design]
  use-cases:
    - "Generate a floor plan with correct room proportions and door/window sizes"
    - "Validate that a building model has realistic dimensions"
    - "Create a 3D building where walls, floors, and ceilings have proper measurements"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Architectural Dimensions Reference

This skill provides authoritative dimensional standards for AI agents generating or validating 3D/2D architectural models. All dimensions follow international best practices and common building codes (ISO, IBC, Eurocode). **All values are in meters (m) unless stated otherwise.**

---

## 1. Ceiling Heights

Ceiling height is measured from finished floor to finished ceiling (FF to FC).

| Space Type | Minimum | Standard | Luxury / Ideal |
|---|---|---|---|
| Residential habitable room | 2.4 m | 2.7 m | 3.0 m |
| Residential corridor / bathroom | 2.1 m | 2.4 m | 2.7 m |
| Commercial office | 2.7 m | 3.0–3.6 m | 4.0 m |
| Retail / showroom | 3.5 m | 4.0–5.0 m | 6.0 m |
| Industrial / warehouse | 4.5 m | 6.0–8.0 m | 12.0 m+ |
| Basement / parking garage | 2.2 m | 2.4 m | 2.7 m |
| Lobby / atrium | 4.0 m | 5.0–8.0 m | open |

**Rules:**
- Never generate a habitable room with ceiling height < 2.4 m
- Structural floor-to-floor height = ceiling height + floor slab thickness (typically +0.3–0.4 m)
- Double-height spaces: multiply standard height × 2, add 0.3 m for structural clearance

---

## 2. Wall Thicknesses

| Wall Type | Thickness |
|---|---|
| Interior partition (non-load-bearing) | 0.10–0.15 m (100–150 mm) |
| Interior load-bearing | 0.20 m minimum |
| Exterior wall — timber/light frame | 0.14–0.20 m (140–200 mm) |
| Exterior wall — masonry (brick/block) | 0.20–0.35 m |
| Exterior wall — reinforced concrete | 0.20–0.40 m |
| Retaining wall (basement) | 0.25–0.40 m |
| Firewall / party wall | 0.20–0.30 m |

**Rules:**
- Use 0.10 m for interior partitions when space is at a premium
- Use 0.20 m for all exterior walls by default
- Wall thickness must equal door/window jamb reveal depth

---

## 3. Doors

All heights measured from finished floor to top of door leaf (not frame).

| Door Type | Width | Height | Notes |
|---|---|---|---|
| Standard interior | 0.900 m | 2.100 m | Most common |
| Narrow interior | 0.700–0.800 m | 2.100 m | Secondary rooms |
| Bathroom / WC | 0.800 m | 2.100 m | Min. 0.900 m for accessibility |
| Main entry / exterior | 0.900–1.000 m | 2.100–2.400 m | Taller for grandeur |
| Double door (pair) | 1.200–1.800 m | 2.100 m | Each leaf 0.6–0.9 m |
| Sliding door (interior) | 0.900–1.200 m | 2.100 m | No swing clearance needed |
| Garage door (single) | 2.400–2.700 m | 2.100–2.400 m | Width varies |
| Garage door (double) | 4.800–5.400 m | 2.100–2.400 m | |
| Accessible door (wheelchair) | 0.900 m min | 2.100 m | Clear opening 0.820 m min |

**Frame and clearance:**
- Door frame opening = door leaf width + 100 mm each side (for jamb + gap)
- Door frame height = door leaf height + 50–100 mm (head jamb + gap)
- Door swing radius = door width (clear floor space for swing)
- Reveal depth (jamb thickness) = wall thickness

**Placement rules:**
- Minimum 100 mm clearance from door edge to adjacent wall corner
- Hinge side: 150 mm min from corner to allow finger clearance
- Do not place doors so swings conflict with each other

---

## 4. Windows

All sill heights measured from finished floor level (FFL).

| Window Type | Sill Height | Window Height | Total Top Height |
|---|---|---|---|
| Standard residential | 0.900 m | 1.200–1.500 m | 2.100–2.400 m |
| Low sill (view / living room) | 0.300–0.600 m | 1.500–1.800 m | 2.100–2.400 m |
| Full-height / floor-to-ceiling | 0.100 m | ceiling height − 0.2 m | near ceiling |
| High window (privacy / bathroom) | 1.500–1.800 m | 0.400–0.600 m | near ceiling |
| Egress window (minimum opening) | any | 0.550 m × 1.000 m clear | — |
| Commercial storefront | 0.100 m | floor to ceiling | curtain wall |
| Skylight / rooflight | N/A (roof) | varies | varies |

**Rules:**
- Every habitable room must have at least one window
- Minimum window area ≥ 10% of floor area (natural light requirement)
- Egress window: minimum clear opening 550 mm wide × 1000 mm high for escape
- Window head height should align with door head height (2.100–2.400 m) for visual harmony
- Bay / bow windows: project 0.3–0.9 m from face of wall

---

## 5. Stairs

| Parameter | Minimum | Ideal | Maximum |
|---|---|---|---|
| Riser height (R) | 0.150 m | 0.175 m | 0.190 m |
| Tread depth (T) | 0.250 m | 0.280 m | 0.350 m |
| Stair width (residential) | 0.900 m | 1.000 m | — |
| Stair width (public / commercial) | 1.200 m | 1.500 m | — |
| Headroom (vertical clearance) | 2.000 m | 2.100 m | — |
| Handrail height | 0.865 m | 0.900 m | 1.000 m |
| Landing depth | 0.900 m | stair width | — |
| Max risers between landings | — | 16 | 18 |

**Comfort rule: 2R + T = 600–630 mm**
- Example: R=175 mm, T=275 mm → 2(175)+275 = 625 ✓
- Example: R=180 mm, T=260 mm → 2(180)+260 = 620 ✓

**Calculating stair geometry:**
```
Number of risers = ceiling height / riser height (round to integer)
Adjusted riser height = ceiling height / number of risers
Stair run = (number of risers - 1) × tread depth
```

**Example for 2.7 m ceiling:**
- Risers: 2700 / 175 = 15.4 → 16 risers
- Adjusted R: 2700 / 16 = 168.75 mm ✓ (within range)
- Treads: 15 treads × 280 mm = 4.200 m horizontal run

---

## 6. Room Sizes

### Residential

| Room | Minimum (m) | Typical (m) | Generous (m) |
|---|---|---|---|
| Bedroom — single | 2.4 × 3.0 (7.2 m²) | 3.0 × 3.5 (10.5 m²) | 3.5 × 4.0 (14 m²) |
| Bedroom — double / master | 3.0 × 3.5 (10.5 m²) | 4.0 × 4.5 (18 m²) | 5.0 × 5.5 (27.5 m²) |
| Bathroom (full) | 1.5 × 2.1 (3.15 m²) | 2.0 × 2.5 (5 m²) | 2.5 × 3.5 (8.75 m²) |
| En-suite / shower room | 1.2 × 2.1 (2.5 m²) | 1.5 × 2.5 (3.75 m²) | 2.0 × 2.5 (5 m²) |
| WC / powder room | 0.9 × 1.8 (1.6 m²) | 1.0 × 2.0 (2 m²) | 1.2 × 2.2 (2.6 m²) |
| Kitchen | 2.4 × 3.0 (7.2 m²) | 3.0 × 4.0 (12 m²) | 4.0 × 5.0 (20 m²) |
| Living room | 3.5 × 4.5 (15.75 m²) | 4.5 × 6.0 (27 m²) | 6.0 × 7.0 (42 m²) |
| Dining room (6 people) | 3.0 × 3.5 (10.5 m²) | 3.5 × 4.5 (15.75 m²) | 4.0 × 6.0 (24 m²) |
| Study / home office | 2.4 × 2.7 (6.5 m²) | 3.0 × 3.5 (10.5 m²) | 4.0 × 4.5 (18 m²) |
| Laundry room | 1.5 × 2.0 (3 m²) | 2.0 × 2.5 (5 m²) | 2.5 × 3.0 (7.5 m²) |
| Walk-in closet | 1.5 × 2.1 (3.15 m²) | 2.0 × 3.0 (6 m²) | 2.5 × 4.0 (10 m²) |
| Corridor / hallway | min 0.9 m wide | 1.0–1.2 m wide | 1.5 m wide |
| Closet / wardrobe depth | 0.6 m min | 0.65 m | 0.7 m |

### Commercial

| Space | Typical per person | Notes |
|---|---|---|
| Open-plan office | 6–10 m² per person | includes circulation |
| Private office | 12–25 m² | single occupant |
| Meeting room (6 people) | 20–25 m² | 3.3 m² per person |
| Reception lobby | 15–30 m² min | |
| Retail (small shop) | 30–80 m² | |

---

## 7. Structural Spans

| Structural System | Typical Span | Maximum Span |
|---|---|---|
| Timber joist floor | 3.5–4.5 m | 5.0 m |
| Timber glulam beam | 6.0–10.0 m | 15.0 m |
| Steel beam (I-section) | 6.0–12.0 m | 20.0 m+ |
| Concrete one-way slab | 4.0–6.0 m | 8.0 m |
| Concrete two-way flat slab | 5.0–8.0 m | 10.0 m |
| Concrete post-tensioned slab | 8.0–12.0 m | 16.0 m |
| Steel truss | 15.0–30.0 m | 60.0 m+ |
| Column grid (commercial) | 6.0 × 6.0 m typical | 9.0 × 9.0 m max |
| Column grid (parking) | 7.5 × 7.5 m typical | — |

**Slab thickness rules of thumb:**
- Concrete one-way slab: span / 25 to span / 30
- Concrete flat slab: span / 30 to span / 35
- Example: 6 m span → slab thickness ≈ 200–240 mm

---

## 8. Parking and Vehicle Access

| Element | Minimum | Standard |
|---|---|---|
| Car space (parallel) | 2.4 × 6.0 m | 2.5 × 6.5 m |
| Car space (90° angle) | 2.4 × 4.8 m | 2.7 × 5.5 m |
| Car space (accessible) | 3.2 × 5.5 m | 3.6 × 6.0 m |
| Aisle width (90° two-way) | 6.0 m | 6.5 m |
| Aisle width (one-way) | 3.0 m | 3.5 m |
| Ramp gradient (internal) | — | 1:10 (10%) ideal |
| Ramp gradient (maximum) | — | 1:6 (17%) max |
| Headroom (parking garage) | 2.1 m | 2.4 m |
| Lane width (driveway) | 3.0 m | 3.5 m |
| Turning radius (car) | 5.5 m inner | 8.0 m outer |

---

## 9. Human Scale Reference

Use these as calibration checks when verifying model proportions.

| Reference | Dimension |
|---|---|
| Average adult height | 1.75 m |
| Eye level (standing) | 1.65 m |
| Eye level (seated) | 1.20 m |
| Shoulder height (standing) | 1.45 m |
| Elbow height (standing) | 1.10 m |
| Comfortable reach height | 1.80 m |
| Maximum reach height | 2.10 m |
| Comfortable counter height (kitchen) | 0.90 m |
| Dining table height | 0.73–0.76 m |
| Desk height | 0.72–0.75 m |
| Seat height (chair) | 0.43–0.46 m |
| Bed height (top of mattress) | 0.50–0.60 m |
| Handrail height | 0.90–1.00 m |
| Shoulder width | 0.45 m |
| Passage clearance (single person) | 0.55 m min, 0.90 m comfortable |
| Passage clearance (two people passing) | 1.20 m |
| Wheelchair width | 0.70 m, turn radius 1.50 m |

---

## 10. JSON Schema for Building Model

Use this TypeScript interface as the canonical data model for AI-generated buildings:

```typescript
type Point2D = { x: number; y: number };  // meters from site origin

interface BuildingModel {
  units: "meters" | "feet";               // always use "meters"
  site: {
    width: number;                         // m (east-west)
    depth: number;                         // m (north-south)
    orientation: number;                   // degrees clockwise from north (0 = north)
  };
  building: {
    levels: Level[];
    footprint: Point2D[];                  // closed polygon of building outline
  };
}

interface Level {
  id: string;                              // "L0", "L1", "L-1" (basement)
  name: string;                            // "Ground Floor", "Level 1", "Basement"
  elevation: number;                       // m above site datum (0 = ground floor FFL)
  height: number;                          // floor-to-ceiling height in m (typically 2.7)
  rooms: Room[];
  walls: Wall[];
  slabs?: Slab[];                          // floor/ceiling slabs
}

interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;                       // m (0.10 interior, 0.20 exterior)
  height: number;                          // m — matches Level.height
  isExterior: boolean;
  material?: "timber" | "masonry" | "concrete" | "steel" | "glass";
  openings: Opening[];
}

interface Opening {
  id: string;
  type: "door" | "window" | "opening";    // "opening" = no frame, just void
  offsetFromStart: number;                 // m from wall start point
  width: number;                           // m
  height: number;                          // m (leaf/glass height, not frame)
  sillHeight: number;                      // m from FFL (0 for doors, 0.9 for windows)
  frameWidth?: number;                     // m jamb reveal (= wall thickness)
}

interface Room {
  id: string;
  name: string;                            // e.g. "Master Bedroom", "Kitchen"
  type: RoomType;
  area: number;                            // m² (computed from polygon)
  polygon: Point2D[];                      // closed polygon, CCW winding
  ceilingHeight?: number;                  // override Level.height if different
}

type RoomType =
  | "bedroom" | "bathroom" | "ensuite" | "wc"
  | "kitchen" | "living" | "dining" | "study"
  | "corridor" | "lobby" | "stairwell"
  | "garage" | "utility" | "storage" | "other";

interface Slab {
  polygon: Point2D[];
  thickness: number;                       // m (typically 0.20–0.30)
  isRoof: boolean;
}
```

### Canonical dimension defaults for code generation

```typescript
const DEFAULTS = {
  ceilingHeight: 2.7,          // m — residential standard
  wallThicknessInterior: 0.10, // m
  wallThicknessExterior: 0.20, // m
  slabThickness: 0.25,         // m
  floorToFloor: 3.0,           // ceilingHeight + slabThickness + finishes
  doorWidth: 0.9,              // m
  doorHeight: 2.1,             // m
  windowSillHeight: 0.9,       // m
  windowHeight: 1.2,           // m
} as const;
```

---

## 11. Validation Rules

Apply these checks after generating any building model. Flag violations as errors or warnings.

### Hard errors (must fix before model is valid)

```typescript
function validateBuildingModel(model: BuildingModel): ValidationResult[] {
  const errors: ValidationResult[] = [];

  for (const level of model.building.levels) {
    // Ceiling height
    if (level.height < 2.1) {
      errors.push({ severity: 'error', rule: 'MIN_CEILING_HEIGHT',
        message: `Level ${level.name}: ceiling height ${level.height}m < 2.1m minimum` });
    }

    for (const wall of level.walls) {
      const wallLength = Math.hypot(
        wall.end.x - wall.start.x, wall.end.y - wall.start.y
      );

      // Minimum wall length
      if (wallLength < 0.3) {
        errors.push({ severity: 'error', rule: 'MIN_WALL_LENGTH',
          message: `Wall ${wall.id}: length ${wallLength.toFixed(2)}m < 0.3m minimum` });
      }

      // Wall thickness
      if (wall.isExterior && wall.thickness < 0.14) {
        errors.push({ severity: 'error', rule: 'EXTERIOR_WALL_THICKNESS',
          message: `Wall ${wall.id}: exterior wall ${wall.thickness}m < 0.14m minimum` });
      }

      for (const opening of wall.openings) {
        // Door dimensions
        if (opening.type === 'door') {
          if (opening.width < 0.7) {
            errors.push({ severity: 'error', rule: 'MIN_DOOR_WIDTH',
              message: `Opening ${opening.id}: door width ${opening.width}m < 0.7m minimum` });
          }
          if (opening.height < 1.9) {
            errors.push({ severity: 'error', rule: 'MIN_DOOR_HEIGHT',
              message: `Opening ${opening.id}: door height ${opening.height}m < 1.9m minimum` });
          }
          if (opening.sillHeight !== 0) {
            errors.push({ severity: 'error', rule: 'DOOR_SILL_HEIGHT',
              message: `Opening ${opening.id}: door sill must be 0 (at floor level)` });
          }
        }

        // Opening fits within wall
        if (opening.offsetFromStart + opening.width > wallLength) {
          errors.push({ severity: 'error', rule: 'OPENING_EXCEEDS_WALL',
            message: `Opening ${opening.id}: extends beyond wall end` });
        }

        // Minimum edge clearance (100mm from wall end)
        if (opening.offsetFromStart < 0.1 || 
            (wallLength - opening.offsetFromStart - opening.width) < 0.1) {
          errors.push({ severity: 'warning', rule: 'OPENING_EDGE_CLEARANCE',
            message: `Opening ${opening.id}: less than 100mm clearance to wall end` });
        }
      }
    }

    for (const room of level.rooms) {
      // Minimum room width
      const bbox = getBoundingBox(room.polygon);
      const minDim = Math.min(bbox.width, bbox.depth);

      if (room.type === 'corridor' && minDim < 0.9) {
        errors.push({ severity: 'error', rule: 'MIN_CORRIDOR_WIDTH',
          message: `Room ${room.name}: corridor width ${minDim.toFixed(2)}m < 0.9m minimum` });
      }
      if (!['corridor', 'wc', 'storage'].includes(room.type) && minDim < 1.5) {
        errors.push({ severity: 'error', rule: 'MIN_HABITABLE_WIDTH',
          message: `Room ${room.name}: habitable room width ${minDim.toFixed(2)}m < 1.5m minimum` });
      }

      // Window requirement
      const habitableTypes: RoomType[] = ['bedroom', 'living', 'dining', 'kitchen', 'study'];
      if (habitableTypes.includes(room.type)) {
        const hasWindow = checkRoomHasWindow(room, level.walls);
        if (!hasWindow) {
          errors.push({ severity: 'error', rule: 'HABITABLE_ROOM_WINDOW',
            message: `Room ${room.name}: habitable room must have at least one window` });
        }
      }
    }

    // Level must have at least one exit
    const hasExit = level.walls.some(w =>
      w.isExterior && w.openings.some(o => o.type === 'door')
    );
    if (!hasExit) {
      errors.push({ severity: 'error', rule: 'LEVEL_EXIT',
        message: `Level ${level.name}: must have at least one exit door to exterior or stairwell` });
    }
  }

  // Bedroom ratio for residential
  const totalArea = getTotalFloorArea(model);
  const bedroomArea = getAreaByType(model, 'bedroom');
  if (totalArea > 0 && bedroomArea / totalArea < 0.25) {
    errors.push({ severity: 'warning', rule: 'BEDROOM_RATIO',
      message: `Bedroom area is only ${((bedroomArea/totalArea)*100).toFixed(0)}% of total — typical residential is 35%+` });
  }

  return errors;
}

interface ValidationResult {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}
```

### Quick sanity checks

Before generating a model, verify these proportions:

| Check | Expected range |
|---|---|
| Floor-to-floor height | 2.7–4.0 m (residential 3.0 m typical) |
| Building footprint density | 30–60% of site for residential |
| Window-to-wall ratio | 15–40% (residential), 40–80% (commercial) |
| Circulation area ratio | 15–25% of total floor area |
| Stair width adequate | 0.9 m min residential, 1.2 m min public |
| Number of bedrooms vs bathrooms | 1 bathroom per 2 bedrooms minimum |
