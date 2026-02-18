---
name: blender-compositing
description: >-
  Automate Blender compositing and post-processing with Python. Use when the
  user wants to set up compositor nodes, add post-processing effects, color
  correct renders, combine render passes, apply blur or glare, key green
  screens, create node-based VFX pipelines, or script the Blender compositor.
license: Apache-2.0
compatibility: >-
  Requires Blender 3.0+. Run: blender --background --python script.py
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["blender", "compositing", "vfx", "post-processing", "nodes"]
---

# Blender Compositing

## Overview

Build node-based compositing pipelines in Blender using Python. Set up render passes, add post-processing effects (blur, glare, color correction), combine layers, key green screens, and output final composited images — all scriptable from the terminal.

## Instructions

### 1. Enable compositing and set up the node tree

```python
import bpy

scene = bpy.context.scene
scene.use_nodes = True
tree = scene.node_tree
nodes = tree.nodes
links = tree.links
nodes.clear()

# Minimum setup: Render Layers → Composite
rl_node = nodes.new('CompositorNodeRLayers')
rl_node.location = (0, 0)
comp_node = nodes.new('CompositorNodeComposite')
comp_node.location = (600, 0)
links.new(rl_node.outputs['Image'], comp_node.inputs['Image'])

# Optional viewer for preview
viewer = nodes.new('CompositorNodeViewer')
viewer.location = (600, -200)
links.new(rl_node.outputs['Image'], viewer.inputs['Image'])
```

### 2. Color correction nodes

```python
# Brightness/Contrast
bc = nodes.new('CompositorNodeBrightContrast')
bc.inputs['Bright'].default_value = 10
bc.inputs['Contrast'].default_value = 20

# Hue/Saturation/Value
hsv = nodes.new('CompositorNodeHueSat')
hsv.inputs['Hue'].default_value = 0.5       # 0.5 = no change
hsv.inputs['Saturation'].default_value = 1.2

# Color Balance (Lift/Gamma/Gain)
cb = nodes.new('CompositorNodeColorBalance')
cb.correction_method = 'LIFT_GAMMA_GAIN'
cb.lift = (0.95, 0.95, 1.0)    # cool shadows
cb.gain = (1.1, 1.05, 1.0)     # warm highlights

# Gamma
gamma = nodes.new('CompositorNodeGamma')
gamma.inputs['Gamma'].default_value = 1.2
```

### 3. Filter and effect nodes

```python
# Blur
blur = nodes.new('CompositorNodeBlur')
blur.filter_type = 'GAUSS'
blur.size_x = 10
blur.size_y = 10

# Glare (bloom, streaks, fog glow)
glare = nodes.new('CompositorNodeGlare')
glare.glare_type = 'BLOOM'  # BLOOM, STREAKS, FOG_GLOW, SIMPLE_STAR, GHOSTS
glare.threshold = 0.8
glare.size = 6
glare.quality = 'HIGH'

# Denoise (best placed right after Render Layers)
denoise = nodes.new('CompositorNodeDenoise')

# Sharpen
sharpen = nodes.new('CompositorNodeFilter')
sharpen.filter_type = 'SHARPEN'
```

### 4. Combine render passes

```python
# Enable render passes on the view layer
view_layer = bpy.context.view_layer
view_layer.use_pass_diffuse_color = True
view_layer.use_pass_glossy_direct = True
view_layer.use_pass_ambient_occlusion = True
view_layer.use_pass_z = True

# Mix passes: Diffuse * AO
rl = nodes.new('CompositorNodeRLayers')
mix = nodes.new('CompositorNodeMixRGB')
mix.blend_type = 'MULTIPLY'
mix.inputs['Fac'].default_value = 0.5
links.new(rl.outputs['DiffCol'], mix.inputs[1])
links.new(rl.outputs['AO'], mix.inputs[2])
```

### 5. Alpha compositing and keying

```python
# Alpha Over — composite foreground over background
alpha_over = nodes.new('CompositorNodeAlphaOver')
alpha_over.inputs['Fac'].default_value = 1.0
# Connect: background → input 1, foreground (with alpha) → input 2

# Keying node — green screen removal
keying = nodes.new('CompositorNodeKeying')
keying.inputs['Key Color'].default_value = (0, 1, 0, 1)
keying.clip_black = 0.1
keying.clip_white = 0.9

# Color Spill — remove green fringing after keying
spill = nodes.new('CompositorNodeColorSpill')
spill.channel = 'G'
spill.limit_method = 'AVERAGE'
```

### 6. File output for multi-layer EXR

```python
file_out = nodes.new('CompositorNodeOutputFile')
file_out.base_path = "/tmp/comp_output/"
file_out.format.file_format = 'OPEN_EXR_MULTILAYER'
file_out.file_slots.new("Diffuse")
file_out.file_slots.new("AO")

rl = nodes.get('Render Layers')
links.new(rl.outputs['DiffCol'], file_out.inputs['Diffuse'])
links.new(rl.outputs['AO'], file_out.inputs['AO'])
```

## Examples

### Example 1: Cinematic color grade pipeline

**User request:** "Add a cinematic look — warm highlights, cool shadows, bloom, and vignette"

```python
import bpy

scene = bpy.context.scene
scene.use_nodes = True
tree = scene.node_tree
nodes = tree.nodes
links = tree.links
nodes.clear()

rl = nodes.new('CompositorNodeRLayers')
rl.location = (0, 0)

# Color Balance
cb = nodes.new('CompositorNodeColorBalance')
cb.location = (250, 0)
cb.correction_method = 'LIFT_GAMMA_GAIN'
cb.lift = (0.92, 0.93, 1.0)
cb.gain = (1.15, 1.08, 0.95)
links.new(rl.outputs['Image'], cb.inputs['Image'])

# Bloom
glare = nodes.new('CompositorNodeGlare')
glare.location = (500, 0)
glare.glare_type = 'BLOOM'
glare.threshold = 0.7
glare.size = 7
links.new(cb.outputs['Image'], glare.inputs['Image'])

# Vignette (Ellipse Mask → Blur → Multiply)
ellipse = nodes.new('CompositorNodeEllipseMask')
ellipse.location = (300, -400)
ellipse.width = 0.85
ellipse.height = 0.85
blur_mask = nodes.new('CompositorNodeBlur')
blur_mask.location = (500, -400)
blur_mask.filter_type = 'GAUSS'
blur_mask.size_x = 200
blur_mask.size_y = 200
links.new(ellipse.outputs['Mask'], blur_mask.inputs['Image'])

mix_vig = nodes.new('CompositorNodeMixRGB')
mix_vig.location = (750, 0)
mix_vig.blend_type = 'MULTIPLY'
mix_vig.inputs['Fac'].default_value = 0.6
links.new(glare.outputs['Image'], mix_vig.inputs[1])
links.new(blur_mask.outputs['Image'], mix_vig.inputs[2])

comp = nodes.new('CompositorNodeComposite')
comp.location = (1000, 0)
links.new(mix_vig.outputs['Image'], comp.inputs['Image'])
```

### Example 2: Green screen composite

**User request:** "Composite my 3D character over a photo background"

```python
import bpy

scene = bpy.context.scene
scene.use_nodes = True
scene.render.film_transparent = True  # Use alpha instead of keying
tree = scene.node_tree
nodes = tree.nodes
links = tree.links
nodes.clear()

rl = nodes.new('CompositorNodeRLayers')
rl.location = (0, 0)
bg_image = nodes.new('CompositorNodeImage')
bg_image.location = (0, -400)
bg_image.image = bpy.data.images.load("/path/to/background.jpg")

alpha_over = nodes.new('CompositorNodeAlphaOver')
alpha_over.location = (400, -100)
links.new(bg_image.outputs['Image'], alpha_over.inputs[1])
links.new(rl.outputs['Image'], alpha_over.inputs[2])

comp = nodes.new('CompositorNodeComposite')
comp.location = (650, -100)
links.new(alpha_over.outputs['Image'], comp.inputs['Image'])
```

## Guidelines

- Always set `scene.use_nodes = True` before accessing the compositor node tree.
- Connect Render Layers → Composite at minimum. Without a Composite node, nothing renders.
- Enable render passes on the View Layer before they appear as outputs on the Render Layers node.
- For green screen work, prefer `film_transparent = True` with Alpha Over instead of Keying when you control the 3D scene.
- Chain color corrections: exposure/levels first, then color balance, then creative grading.
- The Denoise node works best placed right after Render Layers, before color adjustments.
- Use `OPEN_EXR_MULTILAYER` on File Output to save all passes in one file.
- Node positions (`node.location`) are for visual layout only — they don't affect functionality.
