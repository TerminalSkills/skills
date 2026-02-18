---
name: blender-render-automation
description: >-
  Automate Blender rendering from the command line. Use when the user wants to
  set up renders, batch render scenes, configure Cycles or EEVEE, set up
  cameras and lights, render animations, create materials and shaders, or
  build a render pipeline with Blender Python scripting.
license: Apache-2.0
compatibility: >-
  Requires Blender 3.0+. GPU rendering requires compatible CUDA, OptiX, or
  HIP device. Run: blender --background --python script.py
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["blender", "rendering", "cycles", "eevee", "3d"]
---

# Blender Render Automation

## Overview

Automate Blender's rendering pipeline from the terminal. Configure render engines (Cycles/EEVEE), set up cameras and lighting, create materials, and batch render scenes or animations — all headlessly via Python scripts.

## Instructions

### 1. Configure the render engine

```python
import bpy

scene = bpy.context.scene

# Cycles (ray-traced, production quality)
scene.render.engine = 'CYCLES'
cycles = scene.cycles
cycles.samples = 256
cycles.use_denoising = True
cycles.denoiser = 'OPENIMAGEDENOISE'
cycles.device = 'GPU'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'CUDA'  # or 'OPTIX', 'HIP'
prefs.get_devices()
for device in prefs.devices:
    device.use = True

# EEVEE (fast, real-time)
scene.render.engine = 'BLENDER_EEVEE_NEXT'
eevee = scene.eevee
eevee.taa_render_samples = 64
```

### 2. Output resolution and format

```python
render = bpy.context.scene.render
render.resolution_x = 1920
render.resolution_y = 1080
render.resolution_percentage = 100
render.image_settings.file_format = 'PNG'  # PNG, JPEG, OPEN_EXR, TIFF
render.image_settings.color_mode = 'RGBA'
render.film_transparent = True  # transparent background
```

### 3. Cameras and lighting

```python
import math
from mathutils import Vector

# Camera
bpy.ops.object.camera_add(location=(7, -6, 5))
camera = bpy.context.active_object
target = Vector((0, 0, 1))
direction = target - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
cam_data = camera.data
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.focus_distance = 5
cam_data.dof.aperture_fstop = 2.8
bpy.context.scene.camera = camera

# Track-to constraint (auto-aim)
track = camera.constraints.new(type='TRACK_TO')
track.target = bpy.data.objects["MySubject"]

# Area light
bpy.ops.object.light_add(type='AREA', location=(0, -4, 3))
area = bpy.context.active_object
area.data.energy = 500
area.data.size = 2

# HDRI environment lighting
world = bpy.context.scene.world or bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links
nodes.clear()
bg = nodes.new('ShaderNodeBackground')
env = nodes.new('ShaderNodeTexEnvironment')
output = nodes.new('ShaderNodeOutputWorld')
env.image = bpy.data.images.load("/path/to/hdri.hdr")
links.new(env.outputs['Color'], bg.inputs['Color'])
links.new(bg.outputs['Background'], output.inputs['Surface'])
```

### 4. Create materials

```python
def create_pbr_material(name, color, metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def create_glass_material(name, color=(1, 1, 1), ior=1.45):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Transmission Weight'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.0
    bsdf.inputs['IOR'].default_value = ior
    return mat

obj = bpy.data.objects["MyCube"]
obj.data.materials.append(create_pbr_material("BlueMetal", (0.1, 0.3, 0.8), metallic=1.0, roughness=0.2))
```

### 5. Render frames and animations

```python
# Single frame
scene.render.filepath = "/tmp/render_output.png"
bpy.ops.render.render(write_still=True)

# Animation as image sequence
scene.frame_start = 1
scene.frame_end = 250
scene.render.fps = 24
scene.render.filepath = "/tmp/anim/frame_"
bpy.ops.render.render(animation=True)

# Animation as video
scene.render.filepath = "/tmp/animation.mp4"
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
bpy.ops.render.render(animation=True)
```

CLI:
```bash
blender scene.blend --background --render-output /tmp/frame_ --render-frame 1
blender scene.blend --background --frame-start 1 --frame-end 100 --render-anim
```

### 6. Batch render multiple cameras

```python
import os

output_dir = "/tmp/renders"
os.makedirs(output_dir, exist_ok=True)
scene = bpy.context.scene
for cam in [obj for obj in bpy.data.objects if obj.type == 'CAMERA']:
    scene.camera = cam
    scene.render.filepath = os.path.join(output_dir, f"{cam.name}.png")
    bpy.ops.render.render(write_still=True)
```

## Examples

### Example 1: Product shot render pipeline

**User request:** "Set up a clean studio render for a 3D product"

**Output:** Script that clears the scene, imports the product OBJ, creates a white backdrop with PBR material, sets up three-point lighting (key area light, fill, rim), adds a camera with Track-To constraint aimed at the product, configures Cycles at 128 samples with denoising, transparent background (RGBA), and renders at 2000x2000.

### Example 2: Batch render turntable animation

**User request:** "Render a 360-degree turntable of my model — 36 frames"

**Output:** Script that creates a camera, loops 36 steps around the model at equal angular intervals using `cos`/`sin`, renders each frame with Cycles + denoising to a numbered PNG sequence, then provides the ffmpeg command to assemble into an MP4.

## Guidelines

- Always use `--background` for headless rendering.
- Cycles is physically accurate but slow. EEVEE is fast but approximate. Use EEVEE for previews, Cycles for final output.
- Enable denoising to get clean results with fewer samples — 128-256 with denoising often matches 1000+ without.
- For GPU rendering, call `prefs.get_devices()` after setting `compute_device_type`.
- Render animations as image sequences (PNG), not directly to video. If a render crashes mid-way, you keep completed frames.
- Use `film_transparent = True` and RGBA for renders needing transparent backgrounds.
- HDRI environment maps produce the most realistic lighting. Free HDRIs at Poly Haven.
- The Principled BSDF handles most materials — adjust Base Color, Metallic, Roughness, and Transmission.
