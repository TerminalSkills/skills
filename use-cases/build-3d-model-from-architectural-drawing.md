---
title: Build 3D Model from Architectural Drawing
slug: build-3d-model-from-architectural-drawing
description: Transform architectural drawing images into code-validated 3D building models using Vision AI parsing, IBC compliance checks, and automated 3D generation.
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

Architects and developers receive building drawings as images or PDFs and need 3D models for visualization, BIM workflows, or client presentations. Manually recreating a drawing in a 3D tool takes hours per sheet. The drawings contain critical code compliance data (occupancy types, construction types, egress requirements) that must be validated before modeling. There is no automated way to go from a scanned IBC compliance sheet to a validated 3D building model.

## The Solution

Chain three skills into an automated pipeline: (1) `architectural-drawing-parser` uses Vision AI to extract structured building data from drawing images, (2) `ibc-building-codes` validates the extracted data against US International Building Code requirements, and (3) `spec-to-3d` generates a 3D model in Three.js, Pascal Editor JSON, or plain JSON format. The entire flow runs in a single function call and produces a code-validated 3D model in seconds.

## Step-by-Step Walkthrough

### Step 1: Prepare the Drawing

Convert your architectural drawing to a JPEG or PNG image at 150 DPI or higher. For multi-page PDFs, convert each page separately using `pdftoppm -jpeg -r 150 drawing.pdf output`. The parser works best with US-standard IBC compliance sheets, building area analysis tables, and floor plans.

### Step 2: Parse the Drawing with Vision AI

Send the image to `architectural-drawing-parser`. It uses Claude's vision capabilities to extract all building data as structured JSON: occupancy type, construction type, sprinkler system, stories, height, unit types with areas, travel distances, and room layouts. The output is a `BuildingData` object ready for validation.

### Step 3: Validate Against IBC Codes

Pass the extracted data through `ibc-building-codes` validation. It checks height limits (e.g., V-B with NFPA 13 allows 4 stories / 60 ft), travel distances (R-2 max 125 ft), unit size minimums (220 SF for studios, 70 SF per bedroom), exit access doorway requirements, and sprinkler compliance. Any violations are flagged before 3D generation.

### Step 4: Generate the 3D Model

Feed the validated data into `spec-to-3d`. It calculates unit dimensions from area (using 1:1.5 aspect ratio), generates room subdivisions based on unit size, places corridor and stairwells, and builds wall/opening geometry. Choose your output format: Three.js Group for web viewing, Pascal Editor JSON for BIM import, or plain JSON for IFC/GLB conversion.

### Step 5: Export and Visualize

Save the output to a file. Pascal Editor JSON imports directly into Pascal Editor. Three.js Groups render in any WebGL viewer with OrbitControls. Plain JSON feeds into ifcopenshell or GLB exporters for industry-standard BIM workflows.

## Real-World Example

An architecture firm receives a scanned IBC code compliance sheet for a 3-story wood-frame apartment building. They need a 3D massing model for a client presentation by end of day.

**Input**: `ibc_compliance_sheet.jpg` -- Building area analysis table showing R-2 occupancy, V-B construction, NFPA 13 sprinklers, 3 stories at 35 ft, two unit types (Type A at 834 SF, Type B at 645 SF).

**Pipeline execution**:
1. Parser extracts: R-2, V-B, NFPA 13, 3 stories/35 ft actual (4 stories/60 ft permitted), 2 unit types, 66 ft max travel distance
2. IBC validation: all checks pass -- height under limit, stories under limit, travel distance under 125 ft, all units above 220 SF minimum
3. 3D generation produces: 3 levels at 2.74m each (8.23m total), Type A units at 7.19m x 10.78m with 2-bedroom layout, Type B units at 6.32m x 9.48m with 1-bedroom layout, corridors and stairs

**Output**: Pascal Editor JSON with 60+ nodes (site, building, 3 levels, walls, rooms) -- imported into Pascal Editor and rendered for the client meeting in under 5 minutes total.

## Related Skills

- [architectural-drawing-parser](../skills/architectural-drawing-parser/SKILL.md) -- Vision AI extraction of building data from drawings
- [ibc-building-codes](../skills/ibc-building-codes/SKILL.md) -- US building code reference and validation
- [spec-to-3d](../skills/spec-to-3d/SKILL.md) -- 3D model generation from structured specs
