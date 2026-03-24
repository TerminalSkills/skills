---
name: architectural-drawing-parser
description: >-
  Parse architectural drawings, floor plans, and building code compliance documents using
  Vision AI. Extracts building type, occupancy, floor areas, room layouts, dimensions,
  and code parameters. Use when: reading PDF floor plans, analyzing architectural drawings,
  extracting building data from images or scanned documents.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: architecture
  tags: [architecture, ocr, vision-ai, floor-plan, building-codes, ibc, pdf-parsing]
  use-cases:
    - "Extract all dimensions and room data from a scanned floor plan image"
    - "Parse a building code compliance drawing to get occupancy, construction type, areas"
    - "Convert a PDF architectural drawing into structured JSON for 3D modeling"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Architectural Drawing Parser

## Overview

Vision AI pipeline to extract structured building data from architectural drawings, floor plans, and IBC/IRC code compliance documents. Uses Claude's vision capabilities to read and interpret professional drawings, returning a normalized JSON object suitable for downstream 3D modeling or code validation workflows.

## What Can Be Extracted

### Building Metadata
- **Occupancy type**: R-1, R-2, A-1 through A-5, B, E, F, H, I, M, S, U
- **Construction type**: Type I-A through V-B per IBC Table 601
- **Sprinkler system**: NFPA 13, NFPA 13R, NFPA 13D, or None

### Building Dimensions
- Building height (permitted vs actual, feet and meters)
- Number of stories (permitted vs actual)
- Total building area (sqft and sqm)
- Building footprint

### Unit Breakdown
- Unit types (Type A, Type B, Large Unit, Small Unit, etc.)
- Areas per unit type in both SF and m²
- Occupant load per unit and load factors

### Code Compliance Data
- Sprinkler system type and reference
- Egress travel distances per floor
- Exit access doorway requirements
- Means of egress widths

### Floor Plan Elements (when floor plan image provided)
- Rooms with names, types, and estimated dimensions
- Walls (exterior vs interior)
- Doors and windows
- Stairs and corridors

## Data Interfaces

```typescript
interface BuildingData {
  // Building Classification
  occupancy: string;        // "R-2", "A-2", "B", etc.
  constructionType: string; // "V-B", "I-A", "III-B", etc.
  sprinklerSystem: string;  // "NFPA 13", "NFPA 13R", "None"

  // Building Dimensions
  stories: {
    permitted: number;
    actual: number;
  };
  height: {
    permitted: { feet: number; meters: number };
    actual: { feet: number; meters: number };
  };

  // Areas
  totalBuildingArea: { sqft: number; sqm: number };
  units: UnitType[];

  // Egress
  travelDistances: {
    floor: string;
    maximum: { feet: number; meters: number };
  }[];

  // Structural
  scale: string;       // e.g. "1/16\" = 1'-0\""
  scaleRatio: number;  // pixels per foot (if image)

  // Rooms (if floor plan image provided)
  rooms?: Room[];
  walls?: Wall[];
}

interface UnitType {
  name: string;                      // "Type A", "Large Unit", etc.
  area: { sqft: number; sqm: number };
  occupantLoad: number;
  loadFactor: string;                // "1/200 SF gross"
  count?: number;
}

interface Room {
  name: string;
  type: string;
  estimatedArea: { sqft: number; sqm: number };
  dimensions?: { width: number; depth: number; units: "feet" | "meters" };
}

interface Wall {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  thickness: number;   // meters
  height: number;      // meters
  isExterior: boolean;
}
```

## TypeScript Implementation

```typescript
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const client = new Anthropic();

// Parse drawing from local image file
async function parseArchitecturalDrawing(imagePath: string): Promise<BuildingData> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType,
            data: base64Image,
          },
        },
        {
          type: "text",
          text: `Analyze this architectural drawing and extract ALL building data.

Return a JSON object with these fields:
1. occupancy - IBC occupancy type (e.g. "R-2", "A-2", "B")
2. constructionType - IBC construction type (e.g. "V-B", "I-A", "III-B")
3. sprinklerSystem - sprinkler reference ("NFPA 13", "NFPA 13R", "NFPA 13D", or "None")
4. stories - { permitted: number, actual: number }
5. height - { permitted: { feet, meters }, actual: { feet, meters } }
6. totalBuildingArea - { sqft, sqm }
7. units - array of { name, area: { sqft, sqm }, occupantLoad, loadFactor, count }
8. travelDistances - array of { floor, maximum: { feet, meters } }
9. scale - scale notation string if visible (e.g. "1/16\" = 1'-0\"")
10. scaleRatio - estimated pixels per foot if determinable

Look specifically for:
- Building Area Analysis tables
- Occupancy classifications (R-1, R-2, A, B, S, etc.)
- IBC Construction Types (I-A, I-B, II-A, II-B, III-A, III-B, IV, V-A, V-B)
- NFPA sprinkler references
- Floor areas in square feet
- Travel distance measurements
- Scale bar or scale notation

Convert all areas to both sqft and sqm (1 sqft = 0.0929 sqm).
Convert all distances to both feet and meters (1 foot = 0.3048 m).
Return only valid JSON, no explanation text.`,
        },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not extract JSON from response");

  return JSON.parse(jsonMatch[0]) as BuildingData;
}

// Parse drawing from a public URL
async function parseDrawingFromUrl(imageUrl: string): Promise<BuildingData> {
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "url", url: imageUrl },
        },
        {
          type: "text",
          text: `Extract all architectural and building code data from this drawing.
Return structured JSON with: occupancy, constructionType, sprinklerSystem,
stories (permitted/actual), height (permitted/actual in feet and meters),
totalBuildingArea (sqft and sqm), units (array with name, area, occupantLoad, loadFactor),
travelDistances (array with floor, maximum in feet and meters).
Return only valid JSON.`,
        },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

// Extract individual rooms from a floor plan image
async function extractFloorPlanRooms(imagePath: string): Promise<Room[]> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 },
        },
        {
          type: "text",
          text: `Identify all rooms visible in this floor plan.
For each room extract:
- name: label shown (bedroom, bathroom, kitchen, living room, corridor, etc.)
- type: category (bedroom, bathroom, kitchen, living, dining, corridor, utility, storage)
- dimensions: estimated width × depth in feet based on scale
- area: estimated area in both sqft and sqm

The scale is 1/16" = 1'-0" unless a different scale bar is visible.

Return as a JSON array of rooms:
[{ "name": string, "type": string, "dimensions": { "width": number, "depth": number, "units": "feet" }, "estimatedArea": { "sqft": number, "sqm": number } }]
Return only valid JSON.`,
        },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}
```

## Python Implementation

```python
import anthropic
import base64
import json
from pathlib import Path

client = anthropic.Anthropic()


def parse_architectural_drawing(image_path: str) -> dict:
    """Parse an architectural drawing image and extract structured building data."""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode()

    ext = Path(image_path).suffix.lower()
    media_type = "image/png" if ext == ".png" else "image/jpeg"

    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_data,
                    },
                },
                {
                    "type": "text",
                    "text": (
                        "Extract all building data from this architectural drawing. "
                        "Return JSON with: occupancy, constructionType, sprinklerSystem, "
                        "stories (permitted/actual), height (permitted/actual in feet and meters), "
                        "totalBuildingArea (sqft and sqm), "
                        "units (array with name, area {sqft, sqm}, occupantLoad, loadFactor), "
                        "travelDistances (array with floor, maximum {feet, meters}). "
                        "Return only valid JSON."
                    ),
                },
            ],
        }],
    )

    text = response.content[0].text
    # Extract JSON block from response
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        return json.loads(text[start:end])
    return {}


def parse_drawing_from_url(image_url: str) -> dict:
    """Parse an architectural drawing from a public URL."""
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "url", "url": image_url}},
                {
                    "type": "text",
                    "text": (
                        "Extract all building data from this architectural drawing. "
                        "Return structured JSON with occupancy, constructionType, sprinklerSystem, "
                        "stories, height, units, and travelDistances. Return only valid JSON."
                    ),
                },
            ],
        }],
    )
    text = response.content[0].text
    start = text.find("{")
    end = text.rfind("}") + 1
    return json.loads(text[start:end]) if start >= 0 and end > start else {}


# Example usage
if __name__ == "__main__":
    data = parse_architectural_drawing("building_plan.jpg")
    print(f"Occupancy:         {data.get('occupancy')}")
    print(f"Construction Type: {data.get('constructionType')}")
    print(f"Sprinkler System:  {data.get('sprinklerSystem')}")
    print(f"Stories (actual):  {data.get('stories', {}).get('actual')}")
    print(f"Height (permitted): {data.get('height', {}).get('permitted', {}).get('feet')} ft")
    print(f"Units: {len(data.get('units', []))} types")
    for unit in data.get("units", []):
        sqft = unit.get("area", {}).get("sqft", 0)
        sqm = unit.get("area", {}).get("sqm", 0)
        occ = unit.get("occupantLoad", "?")
        print(f"  - {unit['name']}: {sqft} SF ({sqm:.1f} m²), {occ} occupants")
```

## Supported Drawing Types

| Drawing Type | What Is Extracted |
|---|---|
| IBC/IRC code compliance drawings | All: occupancy, construction type, heights, stories, areas, egress, units |
| Floor plans (unit-level) | Rooms, dimensions, wall layouts, door/window positions |
| Site plans | Building footprint, setbacks, parking |
| Section drawings | Floor heights, ceiling heights, structural system |
| Building area analysis tables | Unit types, SF per unit, occupant loads, travel distances |
| Egress/evacuation plans | Travel distances, exit locations, corridor widths |

## Tips for Best Results

- **Resolution**: Use 150 DPI or higher for scanned drawings
- **Format**: JPEG or PNG; PDFs should be converted to images first
- **Text size**: Text smaller than 6pt may not be readable; zoom in for detail drawings
- **Multiple sheets**: Call the function once per sheet, then merge the results
- **Verification**: Always compare extracted data against the source document before use in structural calculations

## Limitations

- Accuracy depends on drawing quality and image resolution
- Very small text (title blocks, fine notes) may be misread
- Complex overlapping hatching or linework may confuse room detection
- Proprietary symbols or non-standard abbreviations may not be recognized
- PDF extraction requires conversion to image first (use `pdf2image` or similar)
