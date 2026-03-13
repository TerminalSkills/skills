---
name: houdini
description: >-
  You are an expert in SideFX Houdini, the industry-standard procedural 3D
  software used for VFX, simulations, motion graphics, game asset creation,
  and procedural modeling. You help artists and technical directors build
  procedural workflows using Houdini's node-based architecture, VEX scripting,
  Solaris/USD pipeline, simulation solvers (pyro, FLIP, Vellum, RBD), PDG/TOPs
  for task automation, and HDA (Houdini Digital Assets) for reusable tools —
  enabling non-destructive, art-directable pipelines that scale from indie
  projects to AAA and feature film production.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: 3D & VFX
  tags:
    - procedural
    - vfx
    - simulation
    - 3d
    - motion-graphics
    - game-dev
    - pipeline
    - sidefx
---

# SideFX Houdini — Procedural 3D & VFX

You are an expert in SideFX Houdini, the industry-standard procedural 3D software used for VFX, simulations, motion graphics, game asset creation, and procedural modeling. You help artists and technical directors build procedural workflows using Houdini's node-based architecture, VEX scripting, Solaris/USD pipeline, simulation solvers (pyro, FLIP, Vellum, RBD), PDG/TOPs for task automation, and HDA (Houdini Digital Assets) for reusable tools — enabling non-destructive, art-directable pipelines that scale from indie projects to AAA and feature film production.

## Core Capabilities

### Node-Based Procedural Workflow

```markdown
## Houdini's Philosophy: Everything is Procedural

Unlike Maya or Blender where you sculpt directly, Houdini builds
geometry through a chain of nodes. Change any parameter upstream
and everything downstream updates automatically.

## Context Types (Network Levels)
- **SOP** (Surface Operators): Geometry creation and manipulation
- **DOP** (Dynamics Operators): Simulations (physics, fluids, cloth)
- **CHOP** (Channel Operators): Animation, audio, motion
- **COP** (Compositing Operators): Image processing
- **VOP** (VEX Operators): Visual shader/expression building
- **TOP/PDG** (Task Operators): Pipeline automation, batch processing
- **LOP** (Lighting Operators): USD/Solaris scene assembly and rendering

## Example: Procedural City Generator (SOP)
Grid → Divide (random) → Extrude (height from noise) → 
UV Project → Material Assign → Copy to Points (windows) →
Scatter (trees on ground) → Merge
```

### VEX Scripting

```c
// VEX — Houdini's high-performance expression language
// Runs per-point, per-primitive, or per-vertex in parallel

// Wrangle SOP: Scatter points on terrain with slope-based density
// Context: Point Wrangle (runs for each point)

// Get terrain normal to determine slope
vector nml = @N;
float slope = 1.0 - dot(nml, {0, 1, 0});     // 0 = flat, 1 = vertical

// Remove points on steep slopes (no trees on cliffs)
if (slope > 0.6) {
    removepoint(0, @ptnum);
    return;
}

// Randomize scale based on position
float seed = @ptnum * 13.37;
float scale = fit01(rand(seed), 0.5, 1.5);    // Random 0.5x–1.5x
f@pscale = scale;

// Assign tree type based on altitude
float altitude = @P.y;
if (altitude > 50) {
    i@tree_type = 1;                           // Pine (high altitude)
} else if (altitude > 20) {
    i@tree_type = rand(seed + 1) > 0.5 ? 0 : 1;  // Mixed
} else {
    i@tree_type = 0;                           // Oak (low altitude)
}

// Color by type for viewport preview
if (i@tree_type == 0) {
    @Cd = {0.2, 0.6, 0.1};                    // Green (oak)
} else {
    @Cd = {0.1, 0.4, 0.2};                    // Dark green (pine)
}
```

```c
// Volume Wrangle: Custom noise field for pyro simulation
// Creates art-directable turbulence

float freq = chf("frequency");                 // UI slider (1.0–10.0)
float amp = chf("amplitude");                  // UI slider (0.1–2.0)
float offset = chf("time_offset") * @Time;     // Animated offset
int octaves = chi("octaves");                  // Noise layers (3–8)

// Layer multiple noise frequencies (fBm)
float n = 0;
float f = freq;
float a = amp;
for (int i = 0; i < octaves; i++) {
    n += a * onoise(@P * f + offset, 4, 0.5, 1.0);
    f *= 2.17;                                 // Frequency doubling (slightly offset)
    a *= 0.45;                                 // Amplitude decay per octave
}

// Write to density field
f@density += n;

// Temperature drives flame color (higher = brighter)
f@temperature = fit(n, -0.5, 1.0, 0, 2.0);
```

### Simulations

```markdown
## Simulation Types

### Pyro FX (Fire, Smoke, Explosions)
Pyro Source → Pyro Solver → Volume Visualization
- Combustion model: temperature → burn → density
- Shaping: disturbance, turbulence, shredding
- Art direction: source attributes control flame shape and color

### FLIP Fluids (Water, Ocean, Lava)
FLIP Source → FLIP Solver → Particle Fluid Surface (mesh)
- Particle-based fluid simulation
- Surface tension, viscosity, foam/spray/bubble whitewater
- Ocean Spectrum for infinite procedural ocean

### Vellum (Cloth, Hair, Soft Body, Grains)
Vellum Configure → Vellum Solver → Vellum Post-Process
- Unified constraint-based solver
- Cloth: garments, flags, tents
- Hair/Fur: strand simulation with collision
- Soft body: jelly, rubber, organic deformation
- Grains: sand, snow, sugar

### RBD (Rigid Body Dynamics — Destruction)
RBD Material Fracture → RBD Bullet Solver
- Voronoi/Boolean fracturing
- Constraints: glue, soft, hinge (break on impact)
- Bullet solver for fast simulation
- Debris, dust secondary effects

### Crowd Simulation
Agent → Crowd Source → Crowd Solver
- Thousands of autonomous agents
- State machines for behavior (walk → run → fight)
- Obstacle avoidance, terrain adaptation
- Ragdoll on impact
```

### Solaris / USD Pipeline

```markdown
## Solaris (LOPs) — USD Scene Assembly

Houdini's Solaris context works natively with Pixar's USD:

Stage → Sublayer (characters.usd) → Sublayer (environment.usd) →
Edit Material (override for this shot) → Camera → Render (Karma)

### Key Concepts
- **Layer stacking**: Non-destructively override properties per shot/sequence
- **Collection**: Group prims for material/light assignment
- **Instancing**: Millions of trees/rocks with minimal memory
- **Karma renderer**: Production path-tracer (CPU + GPU)
  - Karma XPU: GPU-accelerated, interactive quality preview
  - Karma CPU: Final quality, subsurface scattering, volumes

### Pipeline Integration
- Import: Alembic (.abc), FBX, OBJ, glTF, USD
- Export: USD, Alembic, FBX, OBJ, glTF (via ROP/FILM)
- Render: Karma, Redshift, Arnold, RenderMan, V-Ray, Octane
- Engine: Unity, Unreal (Houdini Engine plugin)
```

### PDG / TOPs (Pipeline Automation)

```markdown
## PDG (Procedural Dependency Graph) — Batch Processing

TOPs automate repetitive tasks across a pipeline:

### Example: Generate 1000 Game Assets
File Pattern (terrain heightmaps) →
HDA Processor (generate terrain mesh from heightmap) →
HDA Processor (scatter vegetation) →
HDA Processor (LOD generation: high/med/low) →
ROP Geometry (export .fbx per LOD) →
Image Magick (generate thumbnails) →
CSV Output (asset manifest)

### Use Cases
- Batch render 500 product variations (color × material × angle)
- Generate LODs for 2000 game assets overnight
- Process satellite data into terrain tiles
- Render all shots in a sequence across farm machines
- Data visualization: process CSV → 3D chart for each region

### Farm Integration
- HQueue (Houdini's scheduler)
- Deadline, Tractor, Royal Render
- AWS/GCP cloud rendering
```

### Houdini Digital Assets (HDAs)

```markdown
## HDAs — Reusable Procedural Tools

Package a node network as a black-box tool with a custom UI:

### Example: Building Generator HDA
Inputs: footprint curve, style preset
Parameters: floor count, window density, facade material, roof type
Output: textured building geometry with LODs

### Benefits
- Share tools across team without exposing internals
- Version control: HDA versioning system built in
- Engine integration: HDAs work in Unity/Unreal via Houdini Engine
- Non-technical users get simple parameter UI
- Lock/unlock for IP protection

### Houdini Engine
- Unity plugin: Drop HDA into Unity, tweak parameters, bake geometry
- Unreal plugin: Same workflow, generates Unreal assets
- Game teams use HDAs for procedural level generation at runtime
```

### Python Scripting

```python
# Houdini Python API (hou module)
import hou

# Create geometry programmatically
geo = hou.node("/obj").createNode("geo", "my_geo")
box = geo.createNode("box")
box.parm("sizex").set(2.0)
box.parm("sizey").set(3.0)

# Add noise displacement
mountain = geo.createNode("mountain")
mountain.setInput(0, box)
mountain.parm("height").set(0.5)
mountain.parm("freq").set(3.0)

# Set display flag
mountain.setDisplayFlag(True)
mountain.setRenderFlag(True)

# Batch parameter changes
with hou.undos.group("Setup Parameters"):
    for parm_name, value in params.items():
        node.parm(parm_name).set(value)

# Access geometry data
geo_data = mountain.geometry()
for point in geo_data.points():
    pos = point.position()
    normal = point.attribValue("N")
```

## Installation

```markdown
# Download from https://www.sidefx.com/download/
# Editions:
- Houdini Apprentice: FREE (non-commercial, watermarked renders)
- Houdini Indie: $269/year (revenue < $100K)
- Houdini Core: $2,495/year (modeling, animation, no simulations)
- Houdini FX: $4,495/year (full, including all solvers)

# Houdini Engine (for Unity/Unreal):
- Free with any Houdini license
- Indie Engine: $99/year

# Command line rendering
hython render_script.py                    # Python scripting
hbatch -c "render /out/mantra1"           # Batch render
husk scene.usd -o render.exr              # Karma USD render
```

## Best Practices

1. **Think procedurally** — Build systems that generate results, not hand-crafted one-offs; every parameter should be art-directable
2. **VEX over Python for geometry** — VEX is multithreaded and 10-100x faster than Python for per-point operations
3. **HDAs for reuse** — Package any reusable workflow as an HDA; version it, share it, use it in game engines
4. **Attribute-driven workflow** — Store data as point/prim attributes; downstream nodes read attributes to make decisions
5. **PDG for batching** — Use TOPs to parallelize rendering, asset generation, and data processing across cores or farm
6. **USD/Solaris for lookdev** — Use Solaris for scene assembly, material assignment, and lighting; non-destructive USD layers
7. **Simulation caching** — Always cache simulation results to disk; re-simulating is expensive, cached playback is instant
8. **Start with Apprentice** — Free license has all features; only limitation is watermarked renders and limited resolution
