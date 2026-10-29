---
title: "Create 3D Animated Product Showcases with Blender"
slug: create-3d-animated-product-showcase-with-blender
description: "Model, animate, and render product showcase videos in Blender using scripted scene setup, keyframe animation for motion, Grease Pencil for leader-line overlays, and automated rendering."
skills:
  - blender-scripting
  - blender-animation
  - blender-grease-pencil
  - blender-render-automation
category: design
tags:
  - blender
  - 3d-modeling
  - animation
  - product-showcase
  - motion-graphics
---

# Create 3D Animated Product Showcases with Blender

## The Problem

A consumer electronics company launches 4 products per year and needs 3D animated showcase videos for each: a hero turntable animation for the product page, an exploded view showing internal components for the tech specs section, an annotated feature callout video for social media, and a lifestyle scene placing the product in context. The company outsources these to a motion graphics studio at $15,000 per product -- $60,000 annually for content that could be produced in-house using the existing CAD files. The turnaround time is 3-4 weeks per product, which delays marketing campaigns that depend on the visual assets. Revision requests add another week, and the studio cannot start until they receive the finalized CAD file, creating a bottleneck in the launch timeline.

## The Solution

Use **blender-scripting** to import and clean the product geometry, **blender-animation** to keyframe the turntable, exploded view and camera, **blender-grease-pencil** to draw leader lines in the 3D scene, and **blender-render-automation** to render the outputs from the command line. All scripts target Blender 5.x (the Grease Pencil and animation APIs changed in 4.3 and 5.0) and run with `blender --background --python script.py`.

## Step-by-Step Walkthrough

### 1. Import and prepare the product model

Blender cannot import STEP files. Export the CAD model as glTF, FBX or OBJ first (from your CAD tool, or from FreeCAD), then bring that file in.

> Use blender-scripting. Import headphones.glb into a fresh scene, delete hidden internal geometry, merge duplicate vertices (`bmesh.ops.remove_doubles`), recalculate normals, and keep each logical part (earcups, headband, cushions, driver, battery, PCB) as its own object so it can be animated separately. Set metric units and check the model is 18 cm wide.

Assign materials with Principled BSDF inputs (read them by node type, not by name). Brushed aluminium is a high Metallic value with Roughness around 0.3; matte plastic is Metallic 0 with higher Roughness.

### 2. Create the hero turntable animation

> Use blender-animation and blender-render-automation. Parent the product to an empty, rotate the empty 360 degrees about Z over 180 frames at 30 fps (6 seconds), and make the first and last keyframes linear so the loop does not slow down at the seam. Add a three-point light rig (key, fill, rim) and a camera that moves slightly closer during the turn. Enable `scene.render.film_transparent` and render a 4K RGBA PNG sequence.

Set `scene.render.film_transparent = True`, `image_settings.file_format = 'PNG'` and `image_settings.color_mode = 'RGBA'` so marketing can composite the turntable over any backdrop. Keyframes default to Bezier interpolation, which eases in and out; for a seamless loop switch the rotation curve to `LINEAR`. In Blender 5.0 the F-Curves live in the action's channelbag (`action.fcurves` was removed):

```python
import bpy, math
from bpy_extras import anim_utils

scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 180

pivot = bpy.data.objects.new("Turntable", None)    # empty; parent the product to it
scene.collection.objects.link(pivot)
pivot.keyframe_insert("rotation_euler", index=2, frame=1)
pivot.rotation_euler.z = math.radians(360)
pivot.keyframe_insert("rotation_euler", index=2, frame=181)   # frame 181 equals frame 1, so 1-180 loops without a repeated frame

anim = pivot.animation_data
channelbag = anim_utils.action_get_channelbag_for_slot(anim.action, anim.action_slot)
for fcurve in channelbag.fcurves:
    for kp in fcurve.keyframe_points:
        kp.interpolation = 'LINEAR'
```

### 3. Build the exploded view animation

> Use blender-animation. Create a 10-second exploded view at 30 fps. Hold the assembled product for 2 seconds, then move each part 15-20 cm along its own axis with staggered start frames, outside to inside, hold the exploded state for 3 seconds, and reverse it so the clip loops.

Insert location keyframes per part with `obj.keyframe_insert("location", index=2, frame=...)`. Bezier interpolation gives the ease; stagger by offsetting each part's start frame. For the reverse, copy the keys in the Dope Sheet or insert the return keys explicitly.

### 4. Add Grease Pencil leader lines and text labels

Grease Pencil is a 2D drawing object that lives in 3D space. In Blender 4.3 it was rewritten (GPv3) and in 5.0 the old API was removed, so older tutorials with `stroke.points.add()` or `layer.info` fail. Strokes are filled through attributes on a layer's drawing. Grease Pencil has no text tool, so the labels are ordinary text objects and Grease Pencil draws the lines.

> Use blender-grease-pencil. Create a Grease Pencil object with one layer, draw a leader line from each component to a label position, reveal each line with a Build modifier timed to when its part separates, and add the label text as Font objects facing the camera.

```python
import bpy, math

gp_data = bpy.data.grease_pencils.new("Callouts")          # 5.0+: bpy.data.grease_pencils is v3
gp_obj = bpy.data.objects.new("Callouts", gp_data)
bpy.context.collection.objects.link(gp_obj)

mat = bpy.data.materials.new("GP_White")
bpy.data.materials.create_gpencil_data(mat)
mat.grease_pencil.color = (1, 1, 1, 1)
gp_data.materials.append(mat)

def add_stroke(drawing, points, radius=0.01):
    attrs = drawing.attributes
    first = attrs.domain_size('POINT')
    drawing.add_strokes([len(points)])
    rad_attr = attrs.get("radius") or attrs.new("radius", 'FLOAT', 'POINT')   # create it if missing
    pos, rad = attrs["position"].data, rad_attr.data
    for i, co in enumerate(points):
        pos[first + i].vector = co
        rad[first + i].value = radius
    drawing.tag_positions_changed()

drawing = gp_data.layers.new("Callouts").frames.new(1).drawing
add_stroke(drawing, [(0.5, 0, 0.9), (1.2, 0, 1.3), (1.8, 0, 1.3)])      # driver leader line

build = gp_obj.modifiers.new("Reveal", 'GREASE_PENCIL_BUILD')
build.mode = 'SEQUENTIAL'
build.time_mode = 'FRAMES'
build.length = 30            # frames to draw the line
build.start_delay = 150      # frames to wait before the line starts drawing; match it to when the part has separated

curve = bpy.data.curves.new("driver label", 'FONT')
curve.body = "40mm driver"
curve.size = 0.2
label = bpy.data.objects.new("driver label", curve)
label.location = (1.9, 0, 1.25)
label.rotation_euler = (math.radians(90), 0, 0)    # stand the text up to face a camera looking along +Y
bpy.context.collection.objects.link(label)
```

I ran this on Blender 5.0.1 and rendered frames: the line is absent before the build delay and fully drawn after it. Line thickness is `radius` per point in scene units, so it scales with camera distance like any 3D object: it does not keep a constant on-screen size, so check the lines at both ends of the camera move. Dimension lines and arrowheads are just more strokes.

### 5. Render the final showcase suite

> Use blender-render-automation. Render with Cycles at 128 samples with denoising: the turntable as a 4K PNG sequence with alpha, the exploded view as H.264 MP4 with the callouts, and a second exploded-view file with the Callouts object hidden for the engineering team.

From the shell, render a frame range with `blender -b showcase.blend -s 1 -e 180 -a`, and pick the GPU with `-- --cycles-device OPTIX` (or CUDA, HIP, METAL, ONEAPI). A 1080x1080 social crop is a separate render with the resolution set to 1080x1080 and the camera framed for it. Check a few frames at low samples first, and encode the PNG sequence to MP4 with ffmpeg or the VSE.

## Real-World Example

An in-house designer builds the showcase suite for a new pair of earbuds. The CAD export arrives with far more internal geometry than the product needs, so cleaning the mesh and separating the parts takes the first day. The turntable renders overnight as a transparent PNG sequence. The exploded view takes the most care: eight parts with staggered separations only look natural once the timing is tuned by eye. The Grease Pencil leader lines and text labels are the last pass, and the transparent turntable is reused on the product page, in the investor deck and on the trade show screen.

## Related Skills

- [blender-scripting](../skills/blender-scripting/) -- headless bpy scripting for import and cleanup
- [blender-animation](../skills/blender-animation/) -- keyframes, interpolation and layered actions in Blender 5.x
- [blender-grease-pencil](../skills/blender-grease-pencil/) -- Grease Pencil v3 strokes, layers and modifiers
- [blender-render-automation](../skills/blender-render-automation/) -- Cycles settings and command-line rendering
