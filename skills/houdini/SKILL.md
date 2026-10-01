---
name: houdini
description: >-
  SideFX Houdini is a node-based 3D application for procedural modeling,
  simulation, visual effects and USD scene assembly, scripted with VEX and
  Python (the hou module). Use when a user asks to "write a VEX wrangle",
  "script Houdini with Python", "run hython from the command line", "render a
  USD file with husk", "set up a pyro, FLIP, Vellum or RBD simulation",
  "batch-process assets with PDG", or "build a Houdini digital asset (HDA)".
  Covers Houdini 22: network types, VEX snippets, hou scripting, the
  command-line tools, Solaris and Karma, PDG/TOPs, HDAs and licence editions.
license: Apache-2.0
compatibility: "Requires an installed Houdini (Windows, macOS or Linux) and a licence; the free Apprentice licence is enough for non-commercial work. Names were checked against the Houdini 22.0 documentation."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: design
  tags:
    - procedural
    - vfx
    - simulation
    - 3d
    - pipeline
---

# SideFX Houdini — Procedural 3D & VFX

## Overview

Houdini builds everything as networks of nodes: change a parameter upstream and everything downstream recooks. An agent cannot click in the interface, so its useful work is text: VEX snippets for wrangle nodes, Python that drives the `hou` module, shell commands for the batch tools (`hython`, `hbatch`, `hrender`, `husk`), and node recipes the artist wires by hand.

Houdini is closed source. Node type names, parameter names and function signatures change between versions, so take them from the installed version (section 3 shows how) or from the documentation at sidefx.com/docs/houdini, never from memory.

## Instructions

### 1. Know the network types

| Network | What it holds |
|---|---|
| SOP (geometry) | Modeling and geometry processing; also SOP-level solvers for pyro, FLIP, Vellum, RBD, MPM |
| DOP (dynamics) | Low-level simulation networks; working in them directly needs Houdini FX |
| LOP (Solaris) | USD scene assembly, lookdev, lighting, Karma render settings |
| TOP (PDG) | Work items and dependencies for batch jobs and farm submission |
| COP (Copernicus) | Image processing and texture generation |
| CHOP, VOP | Channel/motion data; visual VEX networks |
| ROP (`/out`) | Render and export nodes: USD Render, Karma, Mantra, Geometry, Alembic, Filmbox FBX |

Objects live under `/obj`, render nodes under `/out`, the default TOP network under `/tasks`, LOP networks under `/stage`.

### 2. Run Houdini's tools from a shell

The command-line programs sit in `$HFS/bin`. Load the environment first:

```bash
cd /opt/hfs22.0.459 && source houdini_setup    # Linux
# macOS: open "Houdini Terminal" from the Utilities folder of the install
# Windows: Start menu > Side Effects Software > Houdini > Command Line Tools
```

```bash
hython shots/sh010.hip        # Python shell with hou imported and the scene loaded
hython build_scene.py         # run a Python script
hbatch shots/sh010.hip        # HScript shell: "render mantra1" at its prompt renders that ROP
hrender -e -f 1001 1048 -d /out/mantra1 shots/sh010.hip    # render a frame range of one ROP
husk -h                       # most programs in $HFS/bin print usage with -h
```

`hython` and `hbatch` check out a Houdini Engine licence first, then Core, then FX; `hython --list-license-checks` prints the list. To change that, put licence options in `HOUDINI_HYTHON_LIC_OPT`, for example `--check-licenses=Houdini-Escape --skip-licenses=Houdini-Engine,Houdini-Master` for Core only (Escape is the internal name of Core, Master of FX). The older `HOUDINI_SCRIPT_LICENSE` variable is deprecated. A plain Python interpreter can also `import hou` once `$HFS/houdini/pythonX.Ylibs` is on `sys.path`; that uses a licence too, and `hou.releaseLicense()` gives it back.

### 3. Script scenes with Python (`hou`)

```python
# build_scene.py — run with: hython build_scene.py
import hou

hou.hipFile.clear()
geo = hou.node("/obj").createNode("geo", "crate")
box = geo.createNode("box")
subd = geo.createNode("subdivide")
subd.parm("iterations").set(3)
subd.setFirstInput(box)

wrangle = geo.createNode("attribwrangle", "color_by_height")
wrangle.setInput(0, subd)
wrangle.parm("snippet").set("@Cd = set(fit(@P.y, -0.5, 0.5, 0, 1), 0.4, 0.1);")
wrangle.setDisplayFlag(True)
wrangle.setRenderFlag(True)
geo.layoutChildren()

geometry = wrangle.geometry()                 # cooks the node if needed
print(len(geometry.points()), "points")
for point in geometry.points()[:3]:
    print(point.number(), point.position(), point.attribValue("Cd"))

geometry.saveToFile("crate.bgeo")
hou.hipFile.save("crate.hip")
```

Find the real names instead of guessing them:

```python
node = hou.node("/obj/crate/color_by_height")
node.type().name()                               # type name to pass to createNode()
[p.name() for p in node.parms()]                 # internal parameter names
print(node.asCode())                             # Python that recreates this node
sorted(hou.sopNodeTypeCategory().nodeTypes())    # every SOP type in this build
node.errors(), node.warnings()                   # messages from the last cook
```

Other calls worth knowing: `hou.hipFile.load(path)` raises `hou.LoadWarning` when the file loads with warnings (catch it and continue); `hou.node("/out/mantra1").render(frame_range=(1001, 1048), verbose=True)` renders a ROP; `hou.parm("/obj/crate/tx").set(2.5)` and `hou.node("/obj/crate").parmTuple("t").set((1, 2, 3))` set values; `with hou.undos.group("Rename props"):` makes a block of changes one undo step in an interactive session.

### 4. Write VEX for wrangle nodes

An Attribute Wrangle runs the snippet once per point, primitive, vertex or once for the whole geometry (its **Run Over** parameter). Rules that matter:

- `@name` reads or writes an attribute; writing a new one creates it. Unknown attributes are float unless prefixed: `f@` float, `i@` int, `v@` vector, `u@` vector2, `p@` vector4, `s@` string, `3@`/`4@` matrices.
- Known without a prefix: `@P`, `@N`, `@Cd`, `@v`, `@up`, `@uv` (vectors), `@orient` (vector4), `@id`, `@ptnum`, `@primnum`, `@numpt`, `@elemnum` (ints), `@name` (string). `@Time`, `@Frame` and `@TimeInc` give the time; `$F` does not exist in VEX.
- `chf("name")`, `chi("name")`, `chramp("name", pos)` read parameters of the wrangle node itself, so the parameter has to exist on the node (add it as a spare parameter).
- Functions are overloaded on return type: `rand()` and the noise functions can return a float or a vector. Assign to a typed variable or wrap the call in `float( ... )` to pick one.
- Trigonometry is in radians and every statement ends with a semicolon.

```c
// Point wrangle on scattered points: thin out steep slopes, vary size, tag a tree type
float slope = 1.0 - dot(@N, {0, 1, 0});          // 0 = flat, 1 = vertical
if (slope > chf("max_slope")) {
    removepoint(0, @ptnum);
    return;
}
float seed = @ptnum * 13.37;
f@pscale = fit01(float(rand(seed)), 0.5, 1.5);

i@tree_type = 0;                                  // oak
if (@P.y > 50) {
    i@tree_type = 1;                              // pine above 50 units
} else if (@P.y > 20 && float(rand(seed + 1)) > 0.5) {
    i@tree_type = 1;                              // mixed band
}
@Cd = {0.2, 0.6, 0.1};
if (i@tree_type == 1) @Cd = {0.1, 0.4, 0.2};
```

```c
// Volume Wrangle: layered noise added to an existing density volume
float freq = chf("frequency");
float amp = chf("amplitude");
float n = 0;
for (int i = 0; i < chi("octaves"); i++) {
    n += amp * float(onoise(@P * freq + chf("time_offset") * @Time, 4, 0.5, 1.0));
    freq *= 2.17;
    amp *= 0.45;
}
@density += n;
```

A Volume Wrangle binds volumes by name and never creates one: writing `@temperature` does nothing unless a volume with that name is in the input.

### 5. Set up simulations

SOP-level recipes; each node name is what the artist types in the Tab menu:

| Effect | Node chain |
|---|---|
| Fire, smoke | Pyro Source → Volume Rasterize Attributes → Pyro Solver → Pyro Bake Volume |
| Liquids | FLIP Container → FLIP Boundary (sources, sinks) and FLIP Collide → FLIP Solver → Particle Fluid Surface |
| Cloth, hair, grains, soft bodies | Vellum Constraints → Vellum Solver → Vellum Post-Process |
| Destruction | RBD Material Fracture → RBD Bullet Solver |
| Snow, mud, sand, soil | MPM Container, MPM Source, MPM Collider → MPM Solver |
| Crowds | Agent → Crowd Source, then a Crowd Solver in a DOP network |

Put a File Cache node after every solver and read the cache downstream. The SOP-level solvers are digital assets that wrap DOP networks: they work in Houdini Core, while editing DOP nodes directly requires Houdini FX. MPM is the exception: it is not available in Core.

### 6. Assemble and render USD with Solaris and Karma

A typical LOP chain: SOP Import, Sublayer or Reference to bring data in → Material Library and Assign Material → Camera and lights → Karma Render Settings → USD Render ROP. The USD Render node writes the stage to a USD file and starts `husk`, which can also be run by hand:

```bash
husk --list-cameras shots/sh010.usd
husk --engine xpu -f 1001 -n 48 -r 1920 1080 -c /cameras/shotcam \
     --make-output-path -o 'render/sh010.$F4.exr' shots/sh010.usd
```

`-f` is the first frame, `-n` the number of frames, `-i` the increment, `-s` a RenderSettings prim, `-R` another Hydra render delegate. `--engine` takes `cpu` or `xpu`; Karma XPU uses CPU and GPU devices together. Single quotes keep the shell from expanding `$F4`.

### 7. Automate with PDG/TOPs

A TOP network turns a job into work items. Example chain for a batch of assets: File Pattern (find heightmaps) → HDA Processor (cook an asset per file) → ROP Geometry Output → ImageMagick (thumbnails) → CSV Output (manifest). A Wedge node creates work items with varying attribute values. Scheduler nodes decide where the work runs: Local Scheduler, HQueue Scheduler, Deadline Scheduler, Tractor Scheduler.

```python
top = hou.node("/tasks/topnet1/csvoutput1")
top.cookWorkItems(block=True)      # generate and cook, wait until done
top.dirtyAllWorkItems(False)       # before a full recook: delete all work items; False keeps output files on disk
```

### 8. Package tools as digital assets

```python
geo = hou.node("/obj/crate")
subnet = geo.collapseIntoSubnet(geo.children(), "crate_generator")   # assets are made from subnets
asset = subnet.createDigitalAsset(
    name="studio::crate_generator::1.0",
    hda_file_name="hda/crate_generator.hda",
    description="Crate Generator",
)
hou.hda.installFile("hda/crate_generator.hda")
[d.nodeTypeName() for d in hou.hda.definitionsInFile("hda/crate_generator.hda")]
```

Houdini Engine loads the same `.hda` files in Unreal, Unity, Maya and 3ds Max and runs them in batch mode on a farm.

### 9. Pick an edition

| Edition | Use | Limits |
|---|---|---|
| Apprentice (free) | Non-commercial learning | `.hipnc`/`.hdanc` files, renders capped at 1920x1080 and watermarked, no third-party renderers, assets do not load in Houdini Engine |
| Indie ($299 a year) | Revenue under $100K a year | `.hiplc`/`.hdalc` files, at most 3 licences per organisation; Engine Indie is free |
| Core | Commercial, no direct DOP work | Modeling, animation, Solaris, Karma, SOP-level solvers except MPM |
| FX | Commercial, everything | Adds the DOP simulation networks |

Prices change: check sidefx.com/products/compare. Houdini is downloaded from sidefx.com with an account and installed with the Houdini Installer, which also has a command-line form (`houdini_installer install --product Houdini --version 22.0.459 ...`).

## Examples

### Example 1: A wrangle for scattering trees

**User request:**

```
I scatter points on a terrain for trees. Remove the ones on cliffs, give the rest a random size, and make high ground pine instead of oak.
```

The agent gives the first snippet from section 4 and tells the artist where it goes: a Scatter node on the terrain, an Attribute Wrangle after it with **Run Over** set to Points, the snippet in **VEXpression**, and a float spare parameter named `max_slope` on the wrangle (0.6 is a reasonable start). The terrain needs point normals (`@N`) before the Scatter. The result is a point cloud with `pscale` between 0.5 and 1.5, an integer `tree_type` (0 oak, 1 pine) and a preview colour, ready for a Copy to Points node that picks the tree by `tree_type`.

### Example 2: Render a shot on a headless Linux machine

**User request:**

```
Render frames 1001-1048 of shots/sh010.hip from /out/karma_beauty on our render box, no GUI.
```

The agent writes a script and the command that runs it:

```python
# render_sh010.py
import hou

try:
    hou.hipFile.load("shots/sh010.hip")
except hou.LoadWarning as warning:
    print(warning)

rop = hou.node("/out/karma_beauty")
if rop is None:
    raise SystemExit("no node /out/karma_beauty in this file")
rop.render(frame_range=(1001, 1048), verbose=True)
```

```bash
cd /opt/hfs22.0.459 && source houdini_setup && cd /mnt/projects/harbor
hython render_sh010.py
```

`hython` prints a line per frame and exits when frame 1048 is written; images go wherever the ROP's output parameter points. If the shot is already exported to USD, `husk -f 1001 -n 48 -o 'render/sh010.$F4.exr' shots/sh010.usd` renders it without loading the scene file.

## Guidelines

1. **Never invent node or parameter names** — read them from the running session (`node.type().name()`, `node.parms()`, `asCode()`) or the documentation for the installed version.
2. **VEX for per-element work, Python for scene management** — VEX runs multithreaded over points and voxels; a Python loop over `geometry.points()` on a large mesh is slow.
3. **Cache simulations to disk** — a File Cache after each solver; never leave a downstream network cooking a live simulation.
4. **Scripts consume licences** — `hython`, `hbatch` and `import hou` each check one out; in long-running Python services call `hou.releaseLicense()` when the Houdini work is done.
5. **Licence file formats do not mix** — Apprentice saves `.hipnc`/`.hdanc` and Indie `.hiplc`/`.hdalc`; SideFX does not allow Apprentice files in the same pipeline as commercial or Indie work.
6. **Keep attributes as the interface between nodes** — store decisions as point or primitive attributes and let downstream nodes read them.
7. **Version digital assets in the type name** — `studio::crate_generator::1.0` lets old scenes keep the old definition when 2.0 ships.
8. **Karma replaces Mantra for new projects** — render through Solaris and `husk`; `hrender` and Mantra ROPs remain for existing scenes. Karma XPU supports fewer features than Karma CPU, so check a shot on both before switching.
9. **Do not open untrusted `.hip` or `.hda` files** — assets carry event scripts (for example OnLoaded) that run Python when a scene loads.
