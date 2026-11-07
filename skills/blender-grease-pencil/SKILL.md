---
name: blender-grease-pencil
description: >-
  Create 2D art and animation in Blender using Grease Pencil and Python. Use
  when the user wants to draw strokes programmatically, create 2D animations,
  build Grease Pencil objects from code, manage GP layers and frames, apply GP
  modifiers, set up drawing guides, or script any Grease Pencil workflow in
  Blender.
license: Apache-2.0
compatibility: >-
  Requires Blender 5.0+ (Grease Pencil v3 API; the legacy v2 API used by
  Blender 2.8-4.2 was removed). Run: blender --background --python script.py
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: design
  tags: "blender, grease-pencil, 2d-animation, drawing, strokes"
  repository: https://projects.blender.org/blender/blender
---

# Blender Grease Pencil

## Overview

Create 2D drawings and animations in Blender's 3D space using Grease Pencil and Python. Build strokes from point data, manage layers and frames, apply Grease Pencil modifiers, and animate 2D content, all scriptable from the terminal.

This skill targets the Grease Pencil v3 API (Blender 5.x, checked against the 5.2 Python API reference). The old v2 API (`gpencil_add`, `layer.info`, `stroke.points.add()`, `grease_pencil_modifiers`, `GP_THICK`) no longer exists; scripts written for Blender 2.8-4.2 must be ported. In Blender 4.3-4.5 the v3 data-blocks lived in `bpy.data.grease_pencils_v3`; from 5.0 `bpy.data.grease_pencils` is v3.

Data model: a `GreasePencil` data-block has layers (and layer groups); a layer has frames keyed by frame number; each frame points to a `drawing`; a drawing holds strokes stored as curve and point attributes (`position`, `radius`, `opacity`, `material_index`, `cyclic`).

## Instructions

### 1. Create a Grease Pencil object

```python
import bpy

gp_data = bpy.data.grease_pencils.new("MyDrawing")
gp_obj = bpy.data.objects.new("MyDrawing", gp_data)   # obj.type == 'GREASEPENCIL'
bpy.context.collection.objects.link(gp_obj)

# Or use the operator
bpy.ops.object.grease_pencil_add(type='EMPTY')   # EMPTY, STROKE, MONKEY, LINEART_SCENE, LINEART_OBJECT, LINEART_COLLECTION
gp_obj = bpy.context.active_object
```

Prefer the data-level route in scripts: it works in `--background` mode and gives you an object with no pre-made layers or frames to trip over.

### 2. Add layers and frames

```python
gp_data = gp_obj.data

layer = gp_data.layers.new("Outlines", set_active=True)   # the name is layer.name
layer.blend_mode = 'REGULAR'   # REGULAR, HARDLIGHT, ADD, SUBTRACT, MULTIPLY, DIVIDE
layer.opacity = 1.0
layer.use_lights = False

frame = layer.frames.new(1)    # raises if frame 1 already exists on this layer
drawing = frame.drawing        # the container for strokes

# Copy, move, or remove keyframes
layer.frames.copy(1, 12)
layer.frames.move(12, 13)
layer.frames.remove(13)
```

Layers can be grouped: `gp_data.layer_groups` and `gp_data.layers.new(name, layer_group=group)`.

### 3. Draw strokes programmatically

Strokes are added with `drawing.add_strokes(sizes)` (one point count per stroke) and then filled through attributes. The Blender docs recommend the attributes API over `drawing.strokes[n]` for anything beyond small scripts, and warn that stroke slices become invalid after the point or curve count changes.

```python
def add_stroke(drawing, points, radius=0.02, material_index=0, cyclic=False):
    attrs = drawing.attributes
    first_curve = attrs.domain_size('CURVE')
    first_point = attrs.domain_size('POINT')
    drawing.add_strokes([len(points)])

    pos = attrs["position"].data
    rad = (attrs.get("radius") or attrs.new("radius", 'FLOAT', 'POINT')).data   # absent until first set
    for i, co in enumerate(points):
        pos[first_point + i].vector = co
        rad[first_point + i].value = radius      # radius, not width: line width is about 2 * radius

    for name, kind, value in (("material_index", 'INT', material_index),
                              ("cyclic", 'BOOLEAN', cyclic)):
        attr = attrs.get(name) or attrs.new(name, kind, 'CURVE')   # created on demand
        attr.data[first_curve].value = value
    drawing.tag_positions_changed()

add_stroke(drawing, [(0, 0, 0), (1, 0.5, 0), (2, 1, 0), (3, 0.5, 0), (4, 0, 0)])
```

Radius is in scene units (default 0.01 is thin); use 0.02-0.05 for visible lines at normal camera distances. Points also carry `opacity` (0-1).

### 4. Create Grease Pencil materials

```python
mat_solid = bpy.data.materials.new("GP_Solid")
bpy.data.materials.create_gpencil_data(mat_solid)
style = mat_solid.grease_pencil
style.color = (0.1, 0.1, 0.1, 1.0)          # stroke color
style.fill_color = (0.8, 0.2, 0.2, 1.0)     # fill color
style.show_stroke = True
style.show_fill = True
gp_obj.data.materials.append(mat_solid)     # slot index = stroke material_index
```

### 5. Apply Grease Pencil modifiers

Grease Pencil modifiers are ordinary object modifiers in v3: use `obj.modifiers` with `GREASE_PENCIL_*` types.

```python
thick = gp_obj.modifiers.new("Thickness", 'GREASE_PENCIL_THICKNESS')
thick.thickness_factor = 1.5                 # use_uniform_thickness + thickness for a fixed value

smooth = gp_obj.modifiers.new("Smooth", 'GREASE_PENCIL_SMOOTH')
smooth.factor = 0.5
smooth.step = 3

tint = gp_obj.modifiers.new("Tint", 'GREASE_PENCIL_TINT')
tint.color = (0.2, 0.5, 1.0)
tint.factor = 0.3

noise = gp_obj.modifiers.new("Noise", 'GREASE_PENCIL_NOISE')   # hand-drawn wobble
noise.factor = 0.5

subdiv = gp_obj.modifiers.new("Subdivide", 'GREASE_PENCIL_SUBDIV')
subdiv.level = 2

build = gp_obj.modifiers.new("Build", 'GREASE_PENCIL_BUILD')   # animated reveal
build.mode = 'SEQUENTIAL'      # SEQUENTIAL, CONCURRENT, ADDITIVE
build.time_mode = 'FRAMES'     # FRAMES, DRAWSPEED, PERCENTAGE
build.length = 50              # frames the build runs
build.use_restrict_frame_range = True   # then frame_start / frame_end apply
build.frame_start = 1

array = gp_obj.modifiers.new("Array", 'GREASE_PENCIL_ARRAY')
array.count = 5
array.constant_offset = (1.0, 0.0, 0.0)   # also set use_constant_offset = True
```

Other types follow the same pattern: `GREASE_PENCIL_OPACITY`, `GREASE_PENCIL_COLOR`, `GREASE_PENCIL_MIRROR`, `GREASE_PENCIL_OFFSET`, `GREASE_PENCIL_LINEART`, and so on. Every modifier has layer, material and pass filters (`tree_node_filter` takes a layer name, `material_filter` a material).

### 6. Animate frame by frame

```python
import math

layer = gp_obj.data.layers.new("Pulse")
total_frames = 24
for f in range(total_frames):
    drawing = layer.frames.new(f + 1).drawing
    radius = 0.5 + (f / total_frames) * 2.0
    ring = [(radius * math.cos(2 * math.pi * i / 32),
             radius * math.sin(2 * math.pi * i / 32), 0) for i in range(32)]
    add_stroke(drawing, ring, radius=0.03, cyclic=True)

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, total_frames
```

Each frame owns an independent drawing. Frames hold until the next keyframe, so you only create frames where the drawing changes.

### 7. Drawing guides

Guides (circular, radial, parallel, grid, isometric) are interactive Draw-mode tools in the viewport and have no scripting entry point for generating strokes. In a script, compute constrained points yourself:

```python
def snap_to_grid(point, spacing=1.0):
    return tuple(round(c / spacing) * spacing for c in point)

def snap_to_radial(point, center=(0, 0, 0), num_rays=8):
    dx, dy = point[0] - center[0], point[1] - center[1]
    step = 2 * math.pi / num_rays
    angle = round(math.atan2(dy, dx) / step) * step
    dist = math.hypot(dx, dy)
    return (center[0] + dist * math.cos(angle), center[1] + dist * math.sin(angle), point[2])
```

## Examples

### Example 1: Procedural comic panel with a speech bubble

**User request:** "Create a simple comic panel layout with borders and a speech bubble, saved as a .blend"

```python
import bpy, math

# add_stroke() from step 3 must be defined above this point
gp_data = bpy.data.grease_pencils.new("ComicPanel")
gp_obj = bpy.data.objects.new("ComicPanel", gp_data)
bpy.context.collection.objects.link(gp_obj)

mat_ink = bpy.data.materials.new("GP_Ink")
bpy.data.materials.create_gpencil_data(mat_ink)
mat_ink.grease_pencil.color = (0, 0, 0, 1)
mat_ink.grease_pencil.show_fill = False
gp_data.materials.append(mat_ink)            # index 0

mat_bubble = bpy.data.materials.new("GP_Bubble")
bpy.data.materials.create_gpencil_data(mat_bubble)
mat_bubble.grease_pencil.color = (0, 0, 0, 1)
mat_bubble.grease_pencil.fill_color = (1, 1, 1, 1)
mat_bubble.grease_pencil.show_fill = True
gp_data.materials.append(mat_bubble)         # index 1

def rect(x, y, w, h):
    return [(x, y, 0), (x + w, y, 0), (x + w, y + h, 0), (x, y + h, 0)]

borders = gp_data.layers.new("Borders").frames.new(1).drawing
add_stroke(borders, rect(0, 0, 6, 4), radius=0.05, cyclic=True)
add_stroke(borders, rect(0.2, 0.2, 2.7, 3.6), radius=0.03, cyclic=True)
add_stroke(borders, rect(3.1, 0.2, 2.7, 3.6), radius=0.03, cyclic=True)

bubble = gp_data.layers.new("Bubbles").frames.new(1).drawing
ellipse = [(4.5 + 0.8 * math.cos(2 * math.pi * i / 24), 3.0 + 0.4 * math.sin(2 * math.pi * i / 24), 0.01)
           for i in range(24)]
add_stroke(bubble, ellipse, radius=0.025, material_index=1, cyclic=True)

bpy.ops.wm.save_as_mainfile(filepath="/tmp/comic_panel.blend")
```

Result: `/tmp/comic_panel.blend` with two layers ("Borders" with three rectangles, "Bubbles" with a white-filled ellipse). Layers draw in stack order (the default `stroke_depth_order` is '2D'), so the bubble layer sits above the borders.

### Example 2: Handwriting reveal with the Build modifier

**User request:** "Animate the letters HI being written stroke by stroke"

```python
import bpy

# add_stroke() from step 3 must be defined above this point
gp_data = bpy.data.grease_pencils.new("Handwriting")
gp_obj = bpy.data.objects.new("Handwriting", gp_data)
bpy.context.collection.objects.link(gp_obj)

ink = bpy.data.materials.new("GP_Ink")
bpy.data.materials.create_gpencil_data(ink)
ink.grease_pencil.color = (0.05, 0.05, 0.15, 1)
gp_data.materials.append(ink)

drawing = gp_data.layers.new("Letters").frames.new(1).drawing
add_stroke(drawing, [(0, 0, 0), (0, 2, 0)], radius=0.05)                    # H left bar
add_stroke(drawing, [(0, 1, 0), (1, 1, 0)], radius=0.05)                    # H crossbar
add_stroke(drawing, [(1, 2, 0), (1, 0, 0)], radius=0.05)                    # H right bar
add_stroke(drawing, [(2.5, 2, 0), (2.5, 0, 0)], radius=0.05)                # I

build = gp_obj.modifiers.new("Build", 'GREASE_PENCIL_BUILD')
build.mode = 'SEQUENTIAL'
build.time_mode = 'FRAMES'
build.length = 60

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, 60
bpy.ops.wm.save_as_mainfile(filepath="/tmp/handwriting.blend")
```

Result: scrubbing frames 1-60 shows the four strokes appearing one after another.

## Guidelines

- Use `bpy.data.grease_pencils.new()` for data-level creation; `bpy.ops.object.grease_pencil_add()` is for quick objects and needs a valid context.
- Assign at least one Grease Pencil material before rendering: strokes without a material slot do not show the colors you intended.
- Stroke thickness is `radius` per point (scene units), not a pixel `line_width`; there is no `pressure` or `strength` any more (use `radius` and `opacity`).
- Never keep references to `drawing.strokes[n]` across `add_strokes`, `remove_strokes` or `resize_strokes`; re-fetch or use attributes.
- Layer names are `layer.name`; blend modes are REGULAR, HARDLIGHT, ADD, SUBTRACT, MULTIPLY, DIVIDE (OVERLAY is gone).
- `layer.frames.new()` fails if the frame number is taken; use `layer.get_frame_at()` or `layer.frames.remove()` first.
- Never hardcode enum names from memory: read them, for example `[i.identifier for i in bpy.types.Modifier.bl_rna.properties["type"].enum_items]`.
- Build modifier is the cheapest way to animate stroke reveal without per-frame scripting.
- Every script here was run in Blender 5.0.1 (`blender -b --factory-startup --python`). The `radius` point attribute does not exist on a fresh drawing: create it with `attrs.new("radius", 'FLOAT', 'POINT')` before indexing it, as `add_stroke()` does.
