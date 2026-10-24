---
title: Build a Procedural Game Assets Pipeline with Houdini
slug: build-procedural-game-assets-pipeline-with-houdini
description: Create a procedural pipeline using Houdini HDAs for generating infinite variations of game-ready environments — terrain, vegetation, buildings, and props — that export directly to Unreal Engine via Houdini Engine plugin, replacing 3 months of manual environment art with a parameterized system that generates production-quality assets on demand.
skills: [houdini, unreal-engine]
category: design
tags: [procedural, game-dev, pipeline, hda, unreal, environment-art, automation]
---

# Build a Procedural Game Assets Pipeline with Houdini

## The Problem

Ren is the tech art lead on a 12-person indie studio building an open-world survival game. The game needs hundreds of unique buildings, thousands of vegetation variations, and terrain that spans 16 square kilometers, but the art team is only 3 people. At the current pace the environment alone would take far longer than the 5 months they have.

## The Solution

Ren builds a Houdini-based procedural pipeline: HDAs (Houdini Digital Assets) that generate variations from parameters, output game-ready meshes with LODs and collision, and load in Unreal Engine through the Houdini Engine for Unreal plugin, where level designers change parameters instead of modeling by hand.

Licensing decides who can do what. Houdini Apprentice assets (`.hdanc`) do not load in Houdini Engine, so the HDA author needs a commercial Houdini, or Houdini Indie (`.hdalc`, for studios under the revenue limit on SideFX's licensing page; Houdini Engine Indie is free). Check SideFX's current terms for your studio before committing. At the time of writing the plugin ships binaries for UE 5.7 and 5.8, with source for earlier UE5 versions; UE4 is no longer supported.

## Step-by-Step Walkthrough

### Step 1: Building generator HDA

One HDA generates any building from its footprint curve, floor count, style and weathering level. The VEX below runs in an Attribute Wrangle inside the HDA, with Run Over set to Primitives, over the facade primitives produced by an upstream loop that sets `i@floor_index` and `f@facade_width`. Local variables must not reuse VEX function names (`floor` is one), so the floor index is `fl`.

```c
int fl = i@floor_index;
int total_floors = chi("../total_floors");
float facade_width = f@facade_width;

float window_width = 1.2;
float window_height = 1.8;
float window_spacing = 0.8;
float margin = 1.0;
int num_windows = int(floor((facade_width - 2 * margin) / (window_width + window_spacing)));

if (fl == 0) {                                 // ground floor: fewer, larger openings
    window_height = 2.5;
    window_width = 2.0;
    num_windows = max(num_windows / 2, 1);
}

// window_type: 1 regular, 2 dormer, 3 door/shop, 4 balcony
if (fl == total_floors - 1 && rand(@primnum * 7.7) > 0.5) {
    i@window_type = 2;
} else if (fl == 0) {
    i@window_type = rand(@primnum * 3.3) > 0.6 ? 3 : 1;
} else {
    i@window_type = rand(@primnum * 5.5) > 0.8 ? 4 : 1;
}

i@num_windows = num_windows;
f@window_width = window_width;
f@window_height = window_height;

float age = chf("../weathering");              // 0 = new, 1 = ruined
if (age > 0.3) {
    f@crack_depth = fit01(age, 0, 0.15);       // read by a downstream noise-displaced Boolean
    f@edge_damage = fit01(age, 0, 0.3);
}
```

Promote the controls to HDA parameters in four groups:

- **Structure**: footprint curve input, floors (1-8), floor height, roof type, roof overhang.
- **Facade**: style, window density, balcony probability, door style, ground-floor use.
- **Weathering**: age, moss, dirt, broken windows, collapsed sections.
- **Export**: LOD count and a polycount target per LOD, collision type.

Build the LODs inside the HDA, not afterwards: a PolyReduce SOP per LOD, with each level in a primitive group named `lod0` (the full-detail mesh), `lod1`, `lod2` and so on. Houdini Engine for Unreal turns those groups into the LODs of one Static Mesh, ordered alphabetically by group name; geometry outside any LOD group becomes a separate mesh. Detail attributes named `lod0_screensize`, `lod1_screensize`, ... set the screen size at which each level switches (the plugin computes them if you leave them out). Put the collision shape in a group named `collision_geo` for complex collision. Do not pack the geometry inside the LOD groups, or the plugin makes an instancer instead of a LOD level.

### Step 2: Terrain biomes and vegetation scattering

Erode the terrain with the HeightField Erode node and paint or simulate a `moisture` layer. Scatter points over it with HeightField Scatter (turn on Match Normals with Terrain so the points get `@N`). Then run this Point Wrangle with the heightfield wired into its second input, so the wrangle can sample the `moisture` layer. The output points are the input of a Copy to Points node, or become instances directly in Unreal.

```c
float altitude = @P.y;
float slope = 1.0 - dot(normalize(@N), {0, 1, 0});   // 0 flat, 1 vertical
float moisture = volumesample(1, "moisture", @P);   // heightfield layer on input 2
float temperature = fit(altitude, 0, 200, 25, -10);

string biome = "desert";
if (temperature < 0) biome = "snow";
else if (temperature < 10 && altitude > 80) biome = "alpine";
else if (moisture > 0.6) biome = "forest";
else if (moisture > 0.3) biome = "grassland";
s@biome = biome;

float density = 0.05;
if (biome == "forest") density = 1.0;
else if (biome == "grassland") density = 0.4;
else if (biome == "alpine") density = 0.2;
else if (biome == "snow") density = 0.1;

if (slope > 0.7 || rand(@ptnum * 17.3) > density) {
    removepoint(0, @ptnum);
    return;
}

float r = rand(@ptnum * 23.7);
if (biome == "forest")         s@veg_type = r < 0.4 ? "oak_tree" : r < 0.7 ? "pine_tree" : r < 0.85 ? "bush" : "fern";
else if (biome == "alpine")    s@veg_type = r < 0.6 ? "pine_tree" : r < 0.8 ? "rock" : "alpine_flower";
else if (biome == "desert")    s@veg_type = r < 0.5 ? "cactus" : "dead_bush";
else if (biome == "grassland") s@veg_type = r < 0.7 ? "grass_clump" : "bush";
else                           s@veg_type = "rock";

f@pscale = fit01(rand(@ptnum * 31.1), 0.6, 1.4);
p@orient = quaternion(radians(rand(@ptnum * 31.2) * 360), {0, 1, 0});   // random yaw
```

### Step 3: Batch variations with PDG (TOPs)

To bake a catalogue of buildings to disk, use a TOP network:

1. **CSV Input** reads `building_configs.csv` and creates one work item per row, with the columns as attributes (floors, style, weathering, seed).
2. **HDA Processor** cooks the building HDA once per work item (with hython). Its HDA Parameters tab is filled from the asset's interface, and you drive each parameter from a work item attribute.
3. The same node writes the cooked geometry to the output file path and tag you set on it, one file per work item. The `top_roaderbuilder` example shipped in `$HH/help/files/pdg_examples/` shows this pattern, writing out geometry defined in a digital asset.
4. A Python Script TOP writes a manifest CSV of the output paths, for Unreal's Data Table import.

Work items are independent, so the schedulers scale the same graph from your workstation to a farm: **Local Scheduler** uses the cores of one machine, and the **HQueue**, **Deadline** and **Tractor** schedulers distribute to other machines. Measure cook time on your own HDA with a few rows first; it depends entirely on the geometry and the machine.

### Step 4: Houdini Engine in Unreal

1. Install the Houdini Engine for Unreal plugin that matches your Houdini and UE versions (see SideFX's install page), and create a session.
2. Import `building_generator.hda` into the Content Browser and drag it into the level. Its parameters appear in the Details panel, and the building recooks when a value changes.
3. Level designers pick a style, floor count and weathering, and edit the footprint curve in the viewport.
4. **Bake** converts the cooked outputs into native assets: Static Meshes (with the LODs and collision from Step 1) in the Content Browser.

For terrain, the plugin can take a Landscape as an input and output Landscapes. Instancers (packed primitives or point attributes) are output as Instanced Static Mesh Components, so a million trees are instances of a few meshes rather than copies of geometry. A Dynamic Mesh output has no LODs, so choose Static Mesh outputs for anything that ships.

## Real-World Example

Ren spends the first weeks on the building HDA and the biome wrangle and gives level designers three style presets. The designers place and tweak buildings in the editor, and when the art director later changes the roof style, they change one parameter and re-bake, instead of re-modeling. The three artists spend their time on hero props and materials. The numbers (buildings generated, cook times, weeks saved) are the studio's to measure on its own hardware; start by timing 20 PDG work items and extrapolating.

## Related Skills

- [houdini](../skills/houdini/) for VEX, HDA authoring, TOPs and the licensing details
- [unreal-engine](../skills/unreal-engine/) for importing, baking and using the generated assets in the editor
