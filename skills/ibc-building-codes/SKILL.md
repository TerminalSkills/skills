---
name: ibc-building-codes
description: >-
  Reference for the US International Building Code (IBC 2024): occupancy groups, construction types, height and story limits, means of egress, occupant load and dwelling unit minimums, with R-2 apartment buildings as the worked case. Use when generating US-compliant building models, checking a design against the IBC, or explaining occupancy classifications and construction types.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: [ibc, building-codes, occupancy, construction-type, egress]
---

# IBC Building Codes Reference

## Overview

Structured reference for the International Building Code (IBC), edition 2024, which is the current ICC edition; the 2021 edition is still adopted in many places and the next edition (2027) is expected from ICC late in 2026. Use it to sanity-check building designs, drive code-aware model generation and explain occupancy and construction-type constraints. Values below were checked against the 2024 IBC text (Chapters 3, 5, 6, 9, 10 and 12); they cover common residential and mixed-use cases, not every exception. Single-family houses fall under the International Residential Code, not the IBC.

## Instructions

### Occupancy classifications (Chapter 3)

- **A** Assembly: A-1 theaters, A-2 restaurants and bars, A-3 worship, libraries, gyms, A-4 indoor arenas, A-5 outdoor stadiums
- **B** Business: offices, banks, outpatient clinics
- **E** Educational: schools, and day care for more than five children older than 2-1/2 years
- **F** Factory (F-1 moderate, F-2 low hazard); **H** High hazard (H-1 to H-5)
- **I** Institutional: I-1 supervised residential, I-2 hospitals and nursing homes, I-3 detention, I-4 adult and child day care
- **M** Mercantile; **S** Storage (S-1, S-2); **U** Utility and miscellaneous
- **R** Residential: R-1 transient (hotels, motels), **R-2** apartments, dormitories, non-transient hotels and congregate living with more than 16 occupants, **R-3** one- and two-family dwellings and small care homes, **R-4** supervised residential care for more than five and up to 16 persons

### Construction types (Chapter 6, Table 601)

- **Type I** (noncombustible): I-A (frame 3 h), I-B (frame 2 h)
- **Type II** (noncombustible): II-A (frame 1 h), II-B (0 h)
- **Type III** (noncombustible exterior walls, combustible interior): III-A (1 h), III-B (0 h)
- **Type IV** (heavy and mass timber): IV-A (3 h frame), IV-B (2 h), IV-C (2 h), IV-HT (heavy timber)
- **Type V** (combustible): V-A (1 h), V-B (0 h, unprotected wood frame)

### R-2 height and story limits (Tables 504.3 and 504.4)

New Group R buildings must be sprinklered throughout (Section 903.2.8), so the sprinklered "S" column (NFPA 13) is the one that applies; the unsprinklered column is only for evaluating existing buildings. In the current tables the sprinkler credit is already built into the values: do not add "+1 story / +20 ft" on top.

| Type | Stories (S) | Height ft (S) | Height ft (NS, existing only) |
|---|---|---|---|
| I-A | Unlimited | Unlimited | Unlimited |
| I-B | 12 | 180 | 160 |
| II-A | 5 | 85 | 65 |
| II-B | 5 | 75 | 55 |
| III-A | 5 | 85 | 65 |
| III-B | 5 | 75 | 55 |
| IV-A | 18 | 270 | 65 |
| IV-B | 12 | 180 | 65 |
| IV-C | 8 | 85 | 65 |
| IV-HT | 5 | 85 | 65 |
| V-A | 4 | 70 | 50 |
| V-B | 3 | 60 | 40 |

NFPA 13R systems (Section 903.3.1.2) are allowed in R-2 up to four stories above grade plane with the roof less than 45 ft above fire department vehicle access, and the 13R height limit in Table 504.3 is 60 ft. Special increases exist for R-1 and R-2 of Type IIIA (+10 ft and +1 story, Section 510.5) and Type IIA (up to 9 stories and 100 ft, Section 510.6), each with strict conditions; Section 510 also covers podium (parking garage) schemes. Both height and stories must pass, plus allowable area (Table 506.2).

### Egress (Chapter 10)

- **Exit access travel distance** (Table 1017.2): groups A, E, F-1, M, R and S-1 allow 200 ft unsprinklered and 250 ft sprinklered. The sprinkler allowance does apply to R-2.
- **One exit or exit access doorway from a space** (Table 1006.2.1): R-2 spaces with occupant load up to 20 and a common path of egress travel of 125 ft or less (sprinklered). A dwelling unit's size in square feet is not the test; occupant load and common path are.
- **Exits per story** (Table 1006.3.3): 2 exits for 1 to 500 occupants, 3 for 501 to 1,000, 4 above 1,000. A single exit per story is allowed in R-2 only within Table 1006.3.4(1): up to 4 dwelling units, 125 ft travel, no higher than the third story, sprinklered with emergency escape openings.
- **Stairway width** (1011.2): 44 in minimum, 36 in where the stair serves fewer than 50 occupants.
- **Stairs**: riser 4 to 7 in, tread at least 11 in (1011.5.2). Within R-3 and within dwelling units of R-2 (not Accessible or Type A), risers up to 7-3/4 in and treads at least 10 in.
- **Corridor width** (Table 1020.3): 44 in generally; 36 in where occupant load is under 50 or within a dwelling unit.

### Occupant load (Table 1004.5, floor area per occupant)

- Residential 200 gross, dormitories 50 gross, business 150 gross, mercantile 60 gross, educational classroom 20 net
- Assembly without fixed seats: 7 net concentrated, 15 net unconcentrated, 5 net standing
- Example: an 834 SF apartment at 200 gross gives 4.17, so use 5 occupants (round up)

```
occupants = ceil(area_sf / factor_sf_per_person)
ceil(834 / 200)  = 5    # apartment, residential 200 gross
ceil(2400 / 150) = 16   # office floor, business 150 gross
ceil(900 / 15)   = 60   # restaurant dining, unconcentrated 15 net
```

### Sprinklers (Chapter 9)

- **NFPA 13** (903.3.1.1): required throughout Group R; no storey cap.
- **NFPA 13R** (903.3.1.2): Group R up to four stories above grade plane; for R-2 the roof must be under 45 ft above fire department access.
- **NFPA 13D** (903.3.1.3): one- and two-family dwellings, R-3, R-4 Condition 1 and townhouses only.

### Dwelling unit minimums (Section 1208 in 2024)

- Habitable rooms (not kitchens) at least 7 ft in any plan dimension
- Ceiling height 7 ft 6 in in habitable spaces and corridors; 7 ft in bathrooms, kitchens, storage and laundry rooms; 7 ft for corridors inside a dwelling unit
- Each dwelling unit has at least 190 SF of habitable space and one room of 120 SF net; other habitable rooms and sleeping units 70 SF net
- Efficiency units need a separate closet, kitchen sink, cooking appliance, refrigerator and a bathroom (the old separate 220 SF figure is not in the 2024 text)

## Examples

### Example 1: "Classify a building with a restaurant under apartments"

```
Floors 2-4: 12 apartment units, leases over 30 days  -> R-2
Floor 1: restaurant with bar seating for 120 patrons -> A-2
Result: mixed occupancy R-2 / A-2
  - Each occupancy must meet its own height and story limits (504.2)
  - Separate the occupancies per Section 508 and Table 508.4
  - Sprinklers: NFPA 13 throughout (Group R requires them)
```

### Example 2: "Check a 3-story V-B apartment building"

```
Building: R-2, Type V-B, 3 stories, 35 ft, NFPA 13, 12 units per floor
Height/story (Tables 504.3/504.4, S column): 3 stories / 60 ft allowed
  Actual 3 stories / 35 ft -> PASS (at the story limit, no spare floor)
Travel distance (Table 1017.2): 250 ft sprinklered
  Longest path 66 ft -> PASS
Exits per story (Table 1006.3.3): occupant load 54 (1-500) -> 2 exits;
  single exit not allowed with 12 units (Table 1006.3.4(1) caps at 4)
Unit doorways (Table 1006.2.1): unit occupant load 5, common path 40 ft
  (limit 20 occupants, 125 ft) -> one exit access doorway is enough
Stair width: 54 occupants >= 50 -> 44 in required; provided 44 in -> PASS
```

## Guidelines

- The adopted edition governs: many jurisdictions still enforce 2018 or 2021, and cities (NYC, Chicago, Los Angeles) amend heavily. Ask which edition applies.
- Read Tables 504.3, 504.4 and 506.2 separately and apply their footnotes; passing one does not satisfy the others. Verify table values against the official text at codes.iccsafe.org before relying on them.
- Mixed occupancies need the separation or nonseparated-use method of Section 508 and each use must meet its own limits.
- Round occupant loads up; use gross or net area exactly as Table 1004.5 states.
- Accessibility (Chapter 11), energy and local fire code requirements are outside this reference.
- This is a reference for design checks and education, not a substitute for review by a licensed design professional or the code official.
