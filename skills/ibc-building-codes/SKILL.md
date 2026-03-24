---
name: ibc-building-codes
description: >-
  Reference for US International Building Code (IBC) occupancy types, construction types,
  height/area limits, egress requirements, and R-2 residential standards. Use when: generating
  US-compliant building models, validating building designs against IBC, understanding
  occupancy classifications and construction types.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: architecture
  tags: [ibc, irc, building-codes, us-standards, occupancy, construction-type, egress, r2]
  use-cases:
    - "Validate a building design against IBC maximum height and story limits"
    - "Determine egress requirements for an R-2 multi-family residential building"
    - "Generate a code-compliant 3-story Type V-B apartment building"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# IBC Building Codes Reference

## Overview

This skill provides a structured reference for the US International Building Code (IBC) 2021 and International Residential Code (IRC). Use it to validate building designs, generate code-compliant models, and understand occupancy and construction type constraints. The data here covers the most common residential and mixed-use scenarios.

## Occupancy Classifications (IBC Chapter 3)

```
A - Assembly (public gathering spaces)
  A-1: Fixed seating theaters, concert halls
  A-2: Restaurants, bars, nightclubs, banquet halls
  A-3: Libraries, gymnasiums, arcades, art galleries
  A-4: Indoor sports arenas, pools
  A-5: Outdoor stadiums, bleachers, amusement parks

B - Business
  Offices, banks, outpatient clinics, professional services

E - Educational
  K-12 schools and day care (>5 children, >2.5 hrs/day)

F - Factory and Industrial
  F-1: Moderate hazard manufacturing
  F-2: Low hazard manufacturing (non-combustible)

H - High Hazard
  H-1 through H-5: Flammable, explosive, toxic materials

I - Institutional
  I-1: Supervised residential (board and care, assisted living >16)
  I-2: Medical incapacitated (hospitals, nursing homes, detox)
  I-3: Restrained occupancies (jails, prisons, detention centers)
  I-4: Day care facilities (children or adults, supervised)

M - Mercantile
  Retail stores, markets, motor fuel dispensing, showrooms

R - Residential
  R-1: Hotels, motels (transient, <30 days)
  R-2: Multi-family permanent (apartments, condos, dormitories) ← MOST COMMON
  R-3: Single/two-family dwellings, lodging houses (≤5 guests)
  R-4: Assisted living (residential care, 6–16 persons)

S - Storage
  S-1: Moderate hazard storage (combustible materials)
  S-2: Low hazard storage (non-combustible)

U - Utility and Miscellaneous
  Accessory structures: garages, fences, tanks, towers
```

## Construction Types (IBC Table 601)

```
TYPE I — Non-combustible, highest fire resistance ratings
  I-A  3–4 hr structural frame, 3 hr floors/roofs → Unlimited height and area
  I-B  2 hr structural frame, 2 hr floors/roofs   → Unlimited height and area

TYPE II — Non-combustible, lower fire resistance
  II-A  1 hr structural elements
  II-B  0 hr (protected non-combustible, no fire rating required)

TYPE III — Non-combustible exterior walls, combustible interior
  III-A  1 hr interior structural elements
  III-B  0 hr interior structural elements

TYPE IV — Heavy Timber
  IV-HT  Solid/laminated wood minimum 6"×8" columns, 6"×10" beams
  IV-A, IV-B, IV-C  Mass timber (CLT, NLT, glulam) variants per IBC 2021

TYPE V — Combustible (wood frame) ← MOST COMMON RESIDENTIAL
  V-A  1 hr fire resistance (protected wood frame)
  V-B  0 hr (unprotected wood frame, no fire rating required)
```

## R-2 Maximum Height and Stories (IBC Tables 504.3 & 504.4)

### Without Sprinklers

| Construction Type | Max Stories | Max Height (ft) |
|---|---|---|
| V-B | 3 | 40 |
| V-A | 4 | 50 |
| III-B | 4 | 55 |
| III-A | 5 | 65 |
| II-B | 4 | 55 |
| II-A | 5 | 65 |
| I-B | 11 | 160 |
| I-A | Unlimited | Unlimited |

### With NFPA 13 Sprinklers (IBC Section 504.2 — add 1 story, +20 ft)

| Construction Type | Max Stories | Max Height (ft) |
|---|---|---|
| **V-B** | **4** | **60** ← *3 actual / 60' permitted in example drawing* |
| V-A | 5 | 70 |
| III-B | 5 | 75 |
| III-A | 6 | 85 |
| II-B | 5 | 75 |
| II-A | 6 | 85 |
| I-B | 12 | 180 |
| I-A | Unlimited | Unlimited |

> **Note:** The sprinkler increase applies once regardless of whether NFPA 13 or 13R is used, provided the system covers the entire building.

## R-2 Dwelling Unit Requirements (IBC Section 1208)

```
Minimum ceiling heights:
  7'-0" (2.13 m)  → Habitable rooms (bedrooms, living rooms, kitchens)
  6'-8" (2.03 m)  → Bathrooms, corridors, storage rooms

Minimum room sizes:
  Efficiency/studio unit:    220 SF (20.4 m²) minimum total area
  One bedroom or more:       Living room + bedroom ≥ 150 SF combined
  Every sleeping room:       70 SF (6.5 m²) minimum; 7'-0" minimum dimension

Minimum corridor widths:
  36" (915 mm)    → Within dwelling units
  44" (1,118 mm)  → Common corridors serving ≥50 occupants
  36" (915 mm)    → Common corridors serving <50 occupants
```

## Egress Requirements (IBC Chapter 10)

### Travel Distance (IBC Table 1017.2)

```
R-2 without sprinklers:   125 ft (38 m)
R-2 with NFPA 13:         125 ft (38 m)  [not increased for R-2]
R-2 with NFPA 13R:        125 ft (38 m)

Note: R-2 travel distance is NOT increased with sprinklers (unlike B or A occupancies).
```

### Exit Access Doorways per Unit (IBC Section 1007)

```
Dwelling unit > 500 SF:   2 exit access doorways required
Dwelling unit ≤ 500 SF:   1 exit access doorway permitted
```

### Means of Egress Widths

```
Stairways serving >49 occupants:  44" (1,118 mm) minimum
Stairways serving ≤49 occupants:  36" (915 mm) minimum
Corridors:                         44" (1,118 mm) minimum
```

### Stair Dimensions (IBC Section 1011)

```
Riser height:    4" min – 7" max (102–178 mm); 7-3/4" (197 mm) max for residential
Tread depth:     11" (280 mm) minimum, measured horizontally
Headroom:        6'-8" (2,032 mm) minimum (measured vertically from nosing line)
Landing depth:   Same width as stair, 36" (915 mm) minimum in direction of travel
Handrail height: 34"–38" (864–965 mm) above stair nosing
```

## Occupant Load Calculations (IBC Table 1004.5)

```
R-2 Residential:
  200 SF gross per occupant

  Example: 834 SF unit ÷ 200 = 4.17 → 5 occupants (always round up)
  Example: 645 SF unit ÷ 200 = 3.22 → 4 occupants

Common/Assembly Areas (within residential buildings):
  Assembly without fixed seats:  7 SF net per person
  Business areas (leasing, mgmt): 100 SF gross per person
  Corridors:                      Not counted separately; included in served space

Accessory Storage (S-2):
  300 SF gross per occupant
```

## Sprinkler System Reference

### NFPA 13 — Standard for the Installation of Sprinkler Systems
```
Scope:     Commercial, multi-family, high-rise buildings
Coverage:  ALL areas including concealed spaces, attics, and closets
Required:  R-2 buildings >4 stories (or per local amendments)
Benefit:   Enables +1 story / +20 ft height increase per IBC 504.2
Cost:      Highest cost; most complete protection
```

### NFPA 13R — Standard for Residential Occupancies Up to 4 Stories
```
Scope:     Residential occupancies (R-1, R-2, R-3, R-4) up to 4 stories
Coverage:  Dwelling units and corridors; exemptions for some concealed spaces
Benefit:   Same +1 story height increase as NFPA 13 when whole building covered
Cost:      Less expensive than NFPA 13; residential heads only
```

### NFPA 13D — Standard for One- and Two-Family Dwellings
```
Scope:     R-3 one- and two-family dwellings and manufactured homes only
Coverage:  Habitable areas; excludes garages, attics, closets <24 SF
Not for:   R-2 multi-family; does not trigger IBC height increases
```

## TypeScript: IBC Building Model Interface

```typescript
interface IBCBuildingModel {
  codeReference: "IBC 2021" | "IBC 2018" | "IBC 2015";
  occupancy: {
    primary: string;      // "R-2"
    secondary?: string;   // "A-2" for ground-floor mixed use
    mixed: boolean;
  };
  constructionType: string;  // "V-B"
  sprinklers: {
    required: boolean;
    system: "NFPA 13" | "NFPA 13R" | "NFPA 13D" | "None";
  };
  code_compliance: {
    permittedHeight: { feet: number; meters: number };
    actualHeight: { feet: number; meters: number };
    permittedStories: number;
    actualStories: number;
    permittedArea: { sqft: number; sqm: number };
    actualArea: { sqft: number; sqm: number };
    compliant: boolean;
  };
  egress: {
    travelDistance: {
      max_feet: number;
      actual_max_feet: number;
      compliant: boolean;
    };
    exits_per_floor: number;
    stairWidth: { inches: number; mm: number };
  };
  units: {
    type: string;
    count: number;
    area: { sqft: number; sqm: number };
    bedrooms: number;
    occupantLoad: number;
  }[];
}
```

## TypeScript: IBC Compliance Validation

```typescript
function validateIBCCompliance(model: IBCBuildingModel): {
  compliant: boolean;
  violations: string[];
  warnings: string[];
} {
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1. Height check
  if (model.code_compliance.actualHeight.feet > model.code_compliance.permittedHeight.feet) {
    violations.push(
      `Height violation: ${model.code_compliance.actualHeight.feet}' actual ` +
      `exceeds permitted ${model.code_compliance.permittedHeight.feet}'`
    );
  }

  // 2. Story count check
  if (model.code_compliance.actualStories > model.code_compliance.permittedStories) {
    violations.push(
      `Story count violation: ${model.code_compliance.actualStories} stories actual ` +
      `exceeds permitted ${model.code_compliance.permittedStories}`
    );
  }

  // 3. Egress travel distance check
  const td = model.egress.travelDistance;
  if (td.actual_max_feet > td.max_feet) {
    violations.push(
      `Travel distance violation: ${td.actual_max_feet}' actual ` +
      `exceeds maximum ${td.max_feet}' for ${model.occupancy.primary}`
    );
  }

  // 4. Unit size checks
  for (const unit of model.units) {
    if (unit.bedrooms === 0 && unit.area.sqft < 220) {
      violations.push(
        `Efficiency unit too small: ${unit.area.sqft} SF < 220 SF minimum (IBC 1208.4)`
      );
    }
    if (unit.bedrooms > 0 && unit.area.sqft < 150) {
      violations.push(
        `Unit too small: ${unit.area.sqft} SF < 150 SF minimum for ${unit.bedrooms}-bedroom`
      );
    }
  }

  // 5. Sprinkler requirement check (R-2 >4 stories requires NFPA 13)
  if (
    model.occupancy.primary === "R-2" &&
    model.code_compliance.actualStories > 4 &&
    model.sprinklers.system !== "NFPA 13"
  ) {
    violations.push(
      `Sprinkler violation: R-2 buildings >4 stories require NFPA 13 ` +
      `(currently: ${model.sprinklers.system})`
    );
  }

  // 6. Warnings
  if (model.constructionType === "V-B" && model.code_compliance.actualStories >= 3) {
    warnings.push(
      "V-B construction with 3+ stories: verify local fire department access requirements"
    );
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
  };
}
```

## R-2 / V-B Quick Reference Card

For the most common scenario — a 3- or 4-story wood-frame apartment building with sprinklers:

```
Occupancy:           R-2 (Multi-family residential)
Construction Type:   V-B (Unprotected wood frame)
Sprinkler:           NFPA 13 or 13R (entire building)

Permitted height:    60'-0" (18.3 m)
Permitted stories:   4 (3 without sprinklers)
Max travel dist:     125'-0" (38.1 m)

Ceiling height min:  7'-0" (2.13 m) habitable
Corridor width min:  44" (1,118 mm) common corridors
Stair width min:     44" (1,118 mm) if >49 occupants

Occupant load:       1 per 200 SF gross
834 SF unit:         5 occupants
645 SF unit:         4 occupants
```
