---
name: 3dsmax-scripting
category: design
version: 1.0.0
description: >-
  Automate 3ds Max with MAXScript and Python — scene manipulation, object
  creation, material assignment, camera setup, batch operations, UI tools,
  and file I/O. Use when tasks involve automating repetitive 3ds Max workflows,
  batch processing scenes, creating custom tools, or scripting scene setup
  for archviz, product visualization, or VFX.
author: terminal-skills
tags: [3dsmax, maxscript, python, automation, scripting, 3d]
---

# 3ds Max Scripting

Automate 3ds Max workflows with MAXScript (native) and Python (3ds Max 2022+).

## MAXScript Basics

MAXScript is 3ds Max's built-in scripting language. Run scripts from the MAXScript Listener (F11), Script Editor, or command line.

### Objects and Scene

```maxscript
-- Create objects
local b = Box width:100 height:50 length:100 pos:[0, 0, 0] name:"MyBox"
local s = Sphere radius:25 pos:[200, 0, 25] segments:32
local p = Plane width:500 length:500 pos:[0, 0, 0]

-- Access objects
local obj = $MyBox              -- By name ($ selector)
local obj = getNodeByName "MyBox"  -- By name (function)
local all = objects              -- All scene objects
local sel = selection            -- Current selection

-- Transform
obj.pos = [100, 200, 0]         -- Position
obj.rotation = eulerAngles 0 0 45  -- Rotation (degrees)
obj.scale = [2, 2, 2]           -- Scale

-- Properties
obj.wirecolor = color 255 0 0   -- Wireframe color
obj.renderable = true
obj.isHidden = false

-- Iterate all objects
for obj in objects do (
    if classOf obj == Box then (
        format "Box: % at %\n" obj.name obj.pos
    )
)
```

### Materials

```maxscript
-- Standard material
local mat = StandardMaterial()
mat.name = "Red Glossy"
mat.diffuseColor = color 200 30 30
mat.specularLevel = 80
mat.glossiness = 60

-- V-Ray material (requires V-Ray installed)
local vmat = VRayMtl()
vmat.name = "Wood Floor"
vmat.diffuse = color 180 140 100
vmat.reflection = color 30 30 30         -- Subtle reflection
vmat.reflectionGlossiness = 0.85          -- Slightly rough
vmat.texmap_diffuse = BitmapTexture filename:"D:/textures/wood_diffuse.jpg"
vmat.texmap_bump = BitmapTexture filename:"D:/textures/wood_normal.jpg"
vmat.texmap_bump_multiplier = 1.5         -- Bump strength

-- Apply material to object
$MyBox.material = vmat

-- Multi-sub material (different material per face ID)
local multi = MultiSubMaterial numsubs:3
multi[1] = VRayMtl name:"Wall Paint" diffuse:(color 240 238 232)
multi[2] = VRayMtl name:"Wood Trim" diffuse:(color 160 120 80)
multi[3] = VRayMtl name:"Glass" diffuse:(color 200 220 230) refraction:(color 250 250 250)
```

### Cameras

```maxscript
-- V-Ray Physical Camera (archviz standard)
fn createArchvizCamera name pos target fov:65.0 = (
    local cam = VRayPhysicalCamera()
    cam.name = name
    cam.pos = pos
    cam.targeted = true
    cam.target.pos = target

    -- Lens
    cam.specify_fov = true
    cam.fov = fov

    -- Exposure
    cam.ISO = 400
    cam.shutter_speed = 60.0
    cam.f_number = 2.8

    -- Auto white balance
    cam.white_balance_preset = 1  -- Daylight

    -- Vertical correction (crucial for archviz — keeps verticals straight)
    cam.auto_vertical_tilt_correction = 1.0

    cam
)

createArchvizCamera "LivingRoom" [5, -3, 1.5] [-2, 5, 1.2] fov:75
```

### Lights

```maxscript
-- V-Ray Sun + Sky (exterior lighting)
local sun = VRaySun pos:[100, -50, 80]
sun.intensity_multiplier = 1.0
sun.size_multiplier = 3.0          -- Soft shadows
sun.turbidity = 3.0                -- Atmosphere haze

-- V-Ray Rectangle Light (interior fill)
local rect = VRayLight()
rect.type = 1                       -- Plane light
rect.pos = [0, 0, 2.8]             -- Ceiling height
rect.multiplier = 15.0
rect.color = color 255 244 229      -- Warm white (3000K)
rect.width = 60
rect.height = 60
rect.invisible = true               -- Don't render the light shape

-- V-Ray IES Light (architectural fixtures)
local ies = VRayIES()
ies.pos = [1.5, 3.0, 2.7]
ies.ies_file = "D:/ies/downlight.ies"
ies.multiplier = 800.0              -- Lumens
ies.color_mode = 1                  -- Temperature
ies.color_temperature = 3000        -- Warm
```

### File I/O

```maxscript
-- Read JSON config (3ds Max 2022+)
fn readJSON path = (
    local f = openFile path mode:"r"
    local str = ""
    while not eof f do str += readLine f + "\n"
    close f
    -- Use .NET JSON parser
    local jObj = (dotNetClass "Newtonsoft.Json.Linq.JObject").Parse str
    jObj
)

-- Write log file
fn writeLog path msg = (
    local f = openFile path mode:"a"
    if f == undefined then f = createFile path
    format "% | %\n" localTime msg to:f
    close f
)

-- Import/export
importFile "D:/models/furniture.fbx" #noPrompt
exportFile "D:/export/scene.fbx" #noPrompt selectedOnly:true
```

## Python in 3ds Max

3ds Max 2022+ includes Python 3 with `pymxs` module for accessing MAXScript objects:

```python
"""scene_audit.py — Audit scene for common archviz issues."""
import pymxs
from pymxs import runtime as rt

def audit_scene():
    """Check scene for common issues: missing textures, high-poly objects, etc."""
    issues = []

    for obj in rt.objects:
        # Check for high-poly objects (>500K faces in archviz is suspicious)
        if rt.classOf(obj) in [rt.Editable_Poly, rt.Editable_Mesh]:
            face_count = rt.getNumFaces(obj)
            if face_count > 500000:
                issues.append(f"High poly: {obj.name} ({face_count:,} faces)")

        # Check for missing materials
        if obj.material is None and obj.renderable:
            issues.append(f"No material: {obj.name}")

    # Check for missing texture files
    for mat in rt.sceneMaterials:
        check_material_textures(mat, issues)

    return issues

def check_material_textures(mat, issues):
    """Recursively check material tree for missing texture files."""
    if hasattr(mat, 'texmap_diffuse') and mat.texmap_diffuse:
        tex = mat.texmap_diffuse
        if hasattr(tex, 'filename') and tex.filename:
            import os
            if not os.path.exists(tex.filename):
                issues.append(f"Missing texture: {tex.filename} (in {mat.name})")
```

## Batch Operations

### Command Line Rendering

```bash
# Render a scene from command line (no GUI)
"C:\Program Files\Autodesk\3ds Max 2025\3dsmax.exe" ^
  -silent -mxs "loadMaxFile \"D:/scene.max\"; render()" ^
  -o "D:/output/render.exr" -w 4000 -h 2250

# Run a MAXScript file
3dsmax.exe -silent -mxs "fileIn \"D:/scripts/batch_render.ms\""

# Run with specific camera
3dsmax.exe -silent -mxs "loadMaxFile \"D:/scene.max\"; viewport.setCamera (getNodeByName \"Camera01\"); render()"
```

### Batch Process Multiple Files

```maxscript
-- batch_process.ms — Process all .max files in a directory

fn processAllScenes folderPath = (
    local files = getFiles (folderPath + "/*.max")
    local results = #()

    for f in files do (
        format "Processing: %\n" f
        loadMaxFile f quiet:true

        -- Do something with each scene
        local objCount = objects.count
        local camCount = (for c in cameras where classOf c != Targetobject collect c).count

        append results #(getFilenameFile f, objCount, camCount)

        resetMaxFile #noPrompt
    )

    results
)
```

## Scene Management

```maxscript
-- Layer management
fn organizeByType = (
    local layerMgr = LayerManager

    -- Create layers
    local furnitureLayer = layerMgr.newLayerFromName "Furniture"
    local architectureLayer = layerMgr.newLayerFromName "Architecture"
    local lightsLayer = layerMgr.newLayerFromName "Lights"

    for obj in objects do (
        case (superClassOf obj) of (
            Light: lightsLayer.addNode obj
            default: (
                if matchPattern obj.name pattern:"*chair*" or
                   matchPattern obj.name pattern:"*table*" or
                   matchPattern obj.name pattern:"*sofa*" then
                    furnitureLayer.addNode obj
                else
                    architectureLayer.addNode obj
            )
        )
    )
)

-- Selection sets
selectionSets["Interior Cameras"] = for c in cameras where
    matchPattern c.name pattern:"int_*" collect c

-- Named selection sets for render elements
fn selectByMaterialName matName = (
    select (for obj in objects where obj.material != undefined and
            obj.material.name == matName collect obj)
)
```

## Guidelines

- **Always `#noPrompt` for batch operations** — without it, file dialogs block script execution
- **Use `undo on` blocks** for destructive operations — wrap scene changes so they can be undone
- **`gc()` (garbage collect) in loops** — MAXScript leaks memory in long-running scripts. Call `gc light:true` periodically.
- **Test in Listener first** — debug scripts interactively before running them in batch mode
- **V-Ray objects require V-Ray loaded** — check `renderers.current` before creating V-Ray-specific objects
- **File paths use forward slashes or escaped backslashes** — `"D:/path"` or `"D:\\path"`, never raw `"D:\path"`
- **Python `pymxs` is slower than MAXScript** — use Python for file I/O and logic, MAXScript for scene manipulation
- **Save before batch operations** — `saveMaxFile (maxFilePath + maxFileName)` as a safety net
