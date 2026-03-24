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
  category: design
  tags: [ibc, building-codes, occupancy, construction-type, egress]
---

# IBC Building Codes Reference

## Overview

Structured reference for the US International Building Code (IBC) 2021 and International Residential Code (IRC). Use it to validate building designs, generate code-compliant models, and understand occupancy and construction type constraints. Covers common residential and mixed-use scenarios including occupancy classifications, construction types, height/area limits, egress requirements, and sprinkler systems.

## Instructions

### Occupancy Classifications (IBC Chapter 3)

- **A** -- Assembly: A-1 (theaters), A-2 (restaurants/bars), A-3 (libraries/gyms), A-4 (indoor arenas), A-5 (outdoor stadiums)
- **B** -- Business: offices, banks, outpatient clinics
- **E** -- Educational: K-12 schools, day care (>5 children)
- **F** -- Factory: F-1 (moderate hazard), F-2 (low hazard)
- **H** -- High Hazard: H-1 through H-5
- **I** -- Institutional: I-1 (supervised residential), I-2 (hospitals), I-3 (jails), I-4 (day care)
- **M** -- Mercantile: retail stores, markets
- **R** -- Residential: R-1 (hotels, <30 days), **R-2 (apartments/condos)**, R-3 (single-family), R-4 (assisted living 6-16)
- **S** -- Storage: S-1 (moderate hazard), S-2 (low hazard)
- **U** -- Utility: garages, fences, tanks

### Construction Types (IBC Table 601)

- **Type I** (non-combustible, highest fire resistance): I-A (unlimited height/area), I-B (unlimited)
- **Type II** (non-combustible, lower rating): II-A (1 hr), II-B (0 hr)
- **Type III** (non-combustible exterior, combustible interior): III-A (1 hr interior), III-B (0 hr)
- **Type IV** (heavy timber/mass timber): IV-HT, IV-A, IV-B, IV-C
- **Type V** (combustible/wood frame): V-A (1 hr, protected), **V-B (0 hr, unprotected)**

### R-2 Height and Story Limits

Without sprinklers / With NFPA 13 sprinklers (+1 story, +20 ft):

| Construction Type | Stories (no sprinkler / sprinkler) | Height ft (no / sprinkler) |
|---|---|---|
| V-B | 3 / 4 | 40 / 60 |
| V-A | 4 / 5 | 50 / 70 |
| III-B | 4 / 5 | 55 / 75 |
| III-A | 5 / 6 | 65 / 85 |
| II-B | 4 / 5 | 55 / 75 |
| II-A | 5 / 6 | 65 / 85 |
| I-B | 11 / 12 | 160 / 180 |
| I-A | Unlimited | Unlimited |

### Egress Requirements (IBC Chapter 10)

- **Travel distance** (R-2): 125 ft (38 m) -- not increased with sprinklers
- **Exit access doorways**: 2 required if unit > 500 SF; 1 permitted if unit <= 500 SF
- **Stairway width**: 44" (>49 occupants), 36" (<=49 occupants)
- **Corridor width**: 44" minimum for common corridors
- **Riser height**: 4"-7" (7-3/4" max residential); **Tread depth**: 11" minimum

### Occupant Load (IBC Table 1004.5)

- R-2 Residential: 200 SF gross per occupant (round up)
- Example: 834 SF / 200 = 4.17 -> 5 occupants
- Assembly (no fixed seats): 7 SF net per person
- Business: 100 SF gross per person

### Sprinkler Systems

- **NFPA 13** -- Full coverage including concealed spaces; required for R-2 > 4 stories; enables +1 story/+20 ft
- **NFPA 13R** -- Residential up to 4 stories; covers units and corridors; same height increase as NFPA 13
- **NFPA 13D** -- One/two-family dwellings only (R-3); does not trigger IBC height increases

### R-2 Dwelling Unit Minimums (IBC Section 1208)

- Ceiling height: 7'-0" habitable rooms, 6'-8" bathrooms/corridors
- Studio/efficiency: 220 SF minimum
- Sleeping rooms: 70 SF minimum, 7'-0" minimum dimension
- Corridor within unit: 36" minimum; common corridor: 44" (>= 50 occupants)

## Examples

### Example 1: Checking Occupancy Classification

A developer is designing a mixed-use building with apartments on floors 2-4 and a restaurant on the ground floor. They need to determine the correct IBC occupancy classifications.

```
Building use analysis:
  Floors 2-4: 12 apartment units (permanent residents, lease > 30 days)
    -> R-2 (Multi-family residential, permanent occupancy)
  Floor 1: Restaurant with bar seating for 120 patrons
    -> A-2 (Assembly, food/drink consumption)

Result: Mixed occupancy R-2 / A-2
  - Must meet the more restrictive requirements of both occupancy types
  - Fire separation required between A-2 ground floor and R-2 upper floors (IBC Table 508.4)
  - Sprinkler system: NFPA 13 recommended (covers both occupancies)
```

### Example 2: Validating Egress Requirements

An architect needs to verify that a 3-story V-B apartment building with NFPA 13 sprinklers meets IBC egress requirements.

```
Building: R-2, V-B, 3 stories, NFPA 13
  Unit sizes: Type A = 834 SF, Type B = 645 SF (6 of each per floor)

Height/story check:
  Permitted: 4 stories / 60 ft (V-B + NFPA 13)
  Actual: 3 stories / 35 ft
  -> PASS

Travel distance check:
  Maximum permitted: 125 ft (R-2, not increased with sprinklers)
  Actual longest path: 66 ft (Level 2, far unit to nearest stair)
  -> PASS

Exit access doorways:
  Type A (834 SF > 500 SF): 2 exit access doorways required -> PASS (has 2)
  Type B (645 SF > 500 SF): 2 exit access doorways required -> PASS (has 2)

Stair width:
  Occupant load per floor: (6 x 5) + (6 x 4) = 54 occupants
  54 > 49 -> 44" minimum stair width required
  Actual: 44" -> PASS

Overall: ALL EGRESS REQUIREMENTS MET
```

## Guidelines

- IBC 2021 is the reference edition; local jurisdictions may adopt older editions or amendments
- Always verify against the locally adopted code -- many cities add amendments (e.g., NYC, Chicago, LA)
- Height/area increases from sprinklers apply only once, regardless of sprinkler type (NFPA 13 vs 13R)
- Mixed-occupancy buildings must meet the more restrictive requirements of all occupancy types present
- Occupant load calculations always round up to the next whole number
- This reference covers common scenarios; unusual occupancy types (H, I) require specialist review
- The data here is for reference and education -- not a substitute for a licensed code official's review
