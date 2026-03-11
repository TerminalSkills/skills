---
title: Build a Procedural Game Assets Pipeline with Houdini
slug: build-procedural-game-assets-pipeline-with-houdini
description: Create a procedural pipeline using Houdini HDAs for generating infinite variations of game-ready environments — terrain, vegetation, buildings, and props — that export directly to Unreal Engine via Houdini Engine plugin, replacing 3 months of manual environment art with a parameterized system that generates production-quality assets on demand.
skills: [houdini]
category: 3D & VFX
tags: [procedural, game-dev, pipeline, hda, unreal, environment-art, automation]
---

# Build a Procedural Game Assets Pipeline with Houdini

Ren is the tech art lead on a 12-person indie studio building an open-world survival game. The game needs hundreds of unique buildings, thousands of vegetation variations, and terrain that spans 16 square kilometers — but the art team is only 3 people. At current pace, the environment alone would take 14 months. They have 5 months.

Ren builds a Houdini-based procedural pipeline: HDAs (Houdini Digital Assets) that generate infinite variations from parameters, export game-ready assets with LODs and collision, and plug directly into Unreal Engine where level designers tweak parameters instead of modeling by hand.

## Step 1: Procedural Building Generator HDA

Instead of modeling 200 buildings, Ren creates one HDA that generates any building from parameters: footprint shape, floor count, architectural style, and weathering level.

```c
// VEX: Building facade generator (Point Wrangle inside HDA)
// Generates window and door placement on extruded floors

int floor = @floor_index;                     // Set by upstream FOR loop
int total_floors = chi("../total_floors");     // HDA parameter
float floor_height = chf("../floor_height");  // 3.0 default
float facade_width = @facade_width;           // Per-prim attribute

// Window placement rules
float window_width = 1.2;                     // Meters
float window_height = 1.8;
float window_spacing = 0.8;                   // Gap between windows
float margin = 1.0;                           // Edge margin

// Calculate how many windows fit on this facade
int num_windows = (int)floor((facade_width - 2 * margin) / (window_width + window_spacing));

// Ground floor: wider openings for shops/doors
if (floor == 0) {
    window_height = 2.5;
    window_width = 2.0;
    num_windows = max(num_windows / 2, 1);    // Fewer, larger openings
}

// Top floor: sometimes dormers instead of windows
if (floor == total_floors - 1 && rand(@primnum * 7.7) > 0.5) {
    i@window_type = 2;                        // Dormer window
} else if (floor == 0) {
    i@window_type = rand(@primnum * 3.3) > 0.6 ? 3 : 1;  // Door or shop window
} else {
    i@window_type = rand(@primnum * 5.5) > 0.8 ? 4 : 1;  // Balcony or regular
}

i@num_windows = num_windows;
f@window_width = window_width;
f@window_height = window_height;

// Weathering: age affects material and geometry
float age = chf("../weathering");             // 0 = new, 1 = ruined
if (age > 0.3) {
    // Add cracks and broken edges (downstream Boolean with noise-displaced cutter)
    f@crack_depth = fit01(age, 0, 0.15);
    f@edge_damage = fit01(age, 0, 0.3);
}
```

```markdown
## Building Generator HDA — Parameter Interface

### Tab: Structure
- Footprint: Curve input (draw any shape)
- Floors: Integer slider (1–8)
- Floor Height: Float (2.5–4.0 m)
- Roof Type: Dropdown [Flat, Gable, Hip, Mansard, Dome]
- Roof Overhang: Float (0–1.0 m)

### Tab: Facade
- Style: Dropdown [Medieval, Colonial, Modern, Industrial, Fantasy]
- Window Density: Float (0.3–1.0)
- Balcony Probability: Float (0–0.5)
- Door Style: Dropdown [Wooden, Arched, Glass, Garage]
- Ground Floor: Dropdown [Residential, Shop, Tavern, Workshop]

### Tab: Weathering
- Age: Float (0–1) — new → ruined
- Moss Coverage: Float (0–0.4)
- Dirt: Float (0–0.6)
- Broken Windows: Float (0–0.3)
- Collapsed Sections: Float (0–0.2)

### Tab: Export
- LOD Levels: Integer (1–4)
- Polycount Target: [High: 15K, Med: 5K, Low: 1K, Proxy: 200]
- Collision: Dropdown [Convex Hull, Box, Mesh]
- UV: Auto-generated with UDIM support
- Texture Size: Dropdown [512, 1024, 2048, 4096]
```

## Step 2: Terrain System with Vegetation Scattering

```c
// VEX: Biome-based vegetation scattering (Point Wrangle)
// Input: terrain heightfield converted to points

float altitude = @P.y;
float slope = 1.0 - dot(@N, {0, 1, 0});      // 0 = flat, 1 = cliff
float moisture = f@moisture;                   // Painted in Houdini or from erosion sim
float temperature = fit(altitude, 0, 200, 25, -10);  // Higher = colder

// Determine biome
string biome = "";
if (temperature < 0) {
    biome = "snow";
} else if (temperature < 10 && altitude > 80) {
    biome = "alpine";
} else if (moisture > 0.6) {
    biome = "forest";
} else if (moisture > 0.3) {
    biome = "grassland";
} else {
    biome = "desert";
}
s@biome = biome;

// Skip vegetation on steep slopes
if (slope > 0.7) {
    removepoint(0, @ptnum);
    return;
}

// Density by biome
float density = 1.0;
if (biome == "forest") density = 1.0;
else if (biome == "grassland") density = 0.4;
else if (biome == "alpine") density = 0.2;
else if (biome == "desert") density = 0.05;
else if (biome == "snow") density = 0.1;

// Probabilistic removal for density control
if (rand(@ptnum * 17.3) > density) {
    removepoint(0, @ptnum);
    return;
}

// Assign vegetation type
float r = rand(@ptnum * 23.7);
if (biome == "forest") {
    if (r < 0.4) s@veg_type = "oak_tree";
    else if (r < 0.7) s@veg_type = "pine_tree";
    else if (r < 0.85) s@veg_type = "bush";
    else s@veg_type = "fern";
} else if (biome == "alpine") {
    if (r < 0.6) s@veg_type = "pine_tree";
    else if (r < 0.8) s@veg_type = "rock";
    else s@veg_type = "alpine_flower";
} else if (biome == "desert") {
    if (r < 0.5) s@veg_type = "cactus";
    else s@veg_type = "dead_bush";
}

// Randomize scale and rotation
float seed = @ptnum * 31.1;
f@pscale = fit01(rand(seed), 0.6, 1.4);
f@rot_y = rand(seed + 1) * 360;              // Random Y rotation
```

## Step 3: PDG Batch Processing

```markdown
## PDG Pipeline: Generate 500 Building Variations

### Node Graph:
CSV Input (building_configs.csv: 500 rows with parameter combos)
  → HDA Processor (building_generator HDA)
    → For Each: LOD Level [0, 1, 2, 3]
      → PolyReduce (target polycount per LOD)
      → UV Flatten (auto-UV each LOD)
      → ROP Geometry (export .fbx)
    → ROP Texture (bake textures: albedo, normal, roughness, AO)
  → Python Script (generate Unreal DataTable CSV with asset paths)

### Performance:
- 500 buildings × 4 LODs = 2,000 assets
- 8-core workstation: ~4 hours (parallelized across cores)
- vs. manual: ~3 months for an artist

### Farm Rendering:
PDG distributes work items across available machines:
- Scheduler: HQueue / Deadline / AWS Thinkbox
- Each work item is independent → near-linear scaling
- 10 machines → ~24 minutes for 500 buildings
```

## Step 4: Houdini Engine in Unreal

```markdown
## Unreal Engine Integration

### Setup
1. Install Houdini Engine for Unreal plugin
2. Drop building_generator.hda into Unreal Content Browser
3. Drag into level → Houdini parameters appear in Details panel
4. Level designers tweak parameters → geometry regenerates live

### Workflow for Level Designers
1. Place building HDA at desired location
2. Set style: "Medieval", floors: 3, weathering: 0.4
3. Adjust footprint curve in-editor
4. Click "Bake" → generates static mesh with materials and collision
5. Repeat 200 times with different parameters

### Landscape Integration
- Houdini terrain HDA reads Unreal Landscape heightfield
- Scatters vegetation as Unreal Foliage instances (not geometry copies)
- Respects Unreal's HLOD and streaming system
- Generates NavMesh-friendly collision

### Performance
- HDA cooking: 2-5 seconds per building (interactive)
- Baked static mesh: same perf as hand-modeled asset
- LOD transitions handled by Unreal's standard LOD system
```

## Results

The 3-person art team delivers a 16 km² game world in 4.5 months instead of the estimated 14 months. The world contains 480 unique buildings, 12 vegetation biomes, and terrain with erosion-simulated rivers and cliffs.

- **Buildings**: 480 unique variations from 1 HDA (would have been ~50 hand-modeled)
- **Vegetation**: 2.3 million instances across 12 biomes, 23 plant species
- **Terrain**: 16 km² with procedural erosion, painted biome masks, auto-scattered props
- **LODs**: 4 levels per asset, auto-generated (saved ~400 hours of manual LOD creation)
- **Iteration speed**: Change architectural style parameter → all 480 buildings update in minutes
- **Art team time saved**: 9.5 months (~$142K at $50/hr) replaced by 3 weeks of HDA development
- **Pipeline**: Fully reproducible; when art direction changes, regenerate everything from parameters
