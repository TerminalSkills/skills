---
name: blender-compositing
description: >-
  Blender's compositor post-processes renders with a node graph, and this skill
  scripts it from Python (bpy) in Blender 5.x. Use when the user wants to set up
  compositor nodes, add post-processing effects, color correct renders, combine
  render passes, apply blur or glare, key green screens, write passes to
  multilayer EXR, or port a compositing script that broke after Blender 5.0
  (scene.node_tree, CompositorNodeComposite, glare_type and file_slots are gone).
license: Apache-2.0
compatibility: >-
  Blender 5.0+ (checked against the 5.2 LTS API). Blender 4.x uses a different
  API, see the version notes. Run: blender --background scene.blend --python comp.py
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  repository: https://projects.blender.org/blender/blender
  tags: ["blender", "compositing", "vfx", "post-processing", "nodes"]
---

# Blender Compositing

## Overview

Build node-based compositing pipelines in Blender using Python. Set up render passes, add post-processing effects (blur, glare, color correction), combine layers, key green screens, and output final composited images — all scriptable from the terminal. Blender 5.0 reworked this API: the compositing tree is its own data-block (`scene.compositing_node_group`), the final image goes to a Group Output node, and almost every node option became an input socket.

## Instructions

### 1. Create the compositing node group

```python
import bpy

scene = bpy.context.scene
tree = bpy.data.node_groups.new("Final Comp", "CompositorNodeTree")
scene.compositing_node_group = tree
nodes, links = tree.nodes, tree.links

# Minimum setup: Render Layers -> Group Output (its first input must be a Color socket)
rl = nodes.new("CompositorNodeRLayers")
out = nodes.new("NodeGroupOutput")
out.location = (900, 0)
tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
links.new(rl.outputs["Image"], out.inputs["Image"])

# Optional viewer for the Image Editor backdrop
viewer = nodes.new("CompositorNodeViewer")
viewer.location = (900, -200)
links.new(rl.outputs["Image"], viewer.inputs["Image"])
```

A new tree is empty; do not rely on default nodes. To reuse an existing tree, read `scene.compositing_node_group` (it is `None` until one is assigned).

### 2. Set node options through inputs

Options are sockets: `node.inputs["Name"].default_value`. Menu inputs take the label shown in the UI (`"Bloom"`, `"Fog Glow"`), not the old upper-case identifiers.

```python
# Brightness/Contrast
bc = nodes.new("CompositorNodeBrightContrast")
bc.inputs["Brightness"].default_value = 10
bc.inputs["Contrast"].default_value = 20

# Hue/Saturation/Value
hsv = nodes.new("CompositorNodeHueSat")
hsv.inputs["Hue"].default_value = 0.5         # 0.5 = no change
hsv.inputs["Saturation"].default_value = 1.2

# Color Balance: two inputs are named "Lift" (float and color), so use the identifier
cb = nodes.new("CompositorNodeColorBalance")
cb.inputs["Type"].default_value = "Lift/Gamma/Gain"
cb.inputs["Color Lift"].default_value = (0.95, 0.95, 1.0, 1.0)   # cool shadows
cb.inputs["Color Gain"].default_value = (1.1, 1.05, 1.0, 1.0)    # warm highlights

# Gamma and Math are the shader nodes now (CompositorNodeGamma was removed)
gamma = nodes.new("ShaderNodeGamma")
gamma.inputs["Gamma"].default_value = 1.2
```

### 3. Filter and effect nodes

```python
# Blur: Size is a 2D vector in pixels
blur = nodes.new("CompositorNodeBlur")
blur.inputs["Type"].default_value = "Gaussian"
blur.inputs["Size"].default_value = (10, 10)

# Glare: Bloom, Ghosts, Streaks, Fog Glow, Simple Star, Sun Beams, Kernel
glare = nodes.new("CompositorNodeGlare")
glare.inputs["Type"].default_value = "Bloom"
glare.inputs["Quality"].default_value = "High"
glare.inputs["Threshold"].default_value = 0.8
glare.inputs["Size"].default_value = 0.6       # 0..1

# Denoise (best placed right after Render Layers)
denoise = nodes.new("CompositorNodeDenoise")

# Sharpen
sharpen = nodes.new("CompositorNodeFilter")
sharpen.inputs["Type"].default_value = "Box Sharpen"
```

To discover the inputs and menu values of any node:

```python
for s in glare.inputs:
    print(s.name, s.identifier, s.bl_idname, getattr(s, "default_value", None))
```

### 4. Combine render passes

```python
# Enable passes on the view layer, then read the output names from the node
view_layer = bpy.context.view_layer
view_layer.use_pass_diffuse_color = True
view_layer.use_pass_ambient_occlusion = True
view_layer.use_pass_z = True
print([o.name for o in rl.outputs if o.enabled])
# Cycles: ['Image', 'Alpha', 'Depth', 'Diffuse Color', 'Ambient Occlusion', 'Noisy Image']

# Multiply diffuse color by AO with the Mix node (CompositorNodeMixRGB was removed)
mix = nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.blend_type = "MULTIPLY"
mix.inputs["Factor"].default_value = 0.5
links.new(rl.outputs["Diffuse Color"], mix.inputs["A"])
links.new(rl.outputs["Ambient Occlusion"], mix.inputs["B"])
# mix.outputs["Result"] carries the color result
```

Set `data_type` before linking: `inputs["A"]` resolves to the socket that is active for the current type.

### 5. Alpha compositing and keying

```python
# Alpha Over: always address the inputs by name, their order changed in 5.0
alpha_over = nodes.new("CompositorNodeAlphaOver")
alpha_over.inputs["Factor"].default_value = 1.0
# links.new(plate.outputs["Image"], alpha_over.inputs["Background"])
# links.new(rl.outputs["Image"], alpha_over.inputs["Foreground"])

# Keying node: green screen removal
keying = nodes.new("CompositorNodeKeying")
keying.inputs["Key Color"].default_value = (0.1, 0.8, 0.2, 1.0)
keying.inputs["Black Level"].default_value = 0.1
keying.inputs["White Level"].default_value = 0.9

# Color Spill: remove green fringing after keying
spill = nodes.new("CompositorNodeColorSpill")
spill.inputs["Spill Channel"].default_value = "G"
spill.inputs["Limit Method"].default_value = "Average"
```

### 6. File output for multi-layer EXR

```python
file_out = nodes.new("CompositorNodeOutputFile")
file_out.directory = "/tmp/comp_output/"
file_out.file_name = "shot010_passes"
file_out.format.media_type = "MULTI_LAYER_IMAGE"
file_out.format.file_format = "OPEN_EXR_MULTILAYER"
file_out.file_output_items.new("RGBA", "Diffuse")
file_out.file_output_items.new("FLOAT", "AO")

links.new(rl.outputs["Diffuse Color"], file_out.inputs["Diffuse"])
links.new(rl.outputs["Ambient Occlusion"], file_out.inputs["AO"])
```

The frame number is appended only for animation renders (`blender -b -a`, `-f 12`, or `render(animation=True)`); put `####` in `file_name` to force it.

### Version notes (porting 4.x scripts)

| Blender 4.x | Blender 5.x |
| --- | --- |
| `scene.use_nodes = True`; `scene.node_tree` | `scene.compositing_node_group = bpy.data.node_groups.new(name, "CompositorNodeTree")` |
| `CompositorNodeComposite` | `NodeGroupOutput` plus a Color socket on `tree.interface` |
| `CompositorNodeMixRGB`, `Gamma`, `Math`, `Value`, `MapRange` | `ShaderNodeMix`, `ShaderNodeGamma`, `ShaderNodeMath`, `ShaderNodeValue`, `ShaderNodeMapRange` |
| `glare.glare_type = 'BLOOM'`, `blur.size_x`, `cb.lift`, `keying.clip_black` | `node.inputs[...]` as shown above |
| `file_out.base_path`, `file_slots.new()` | `directory`, `file_name`, `file_output_items.new(type, name)` |
| Alpha Over `inputs[1]` / `inputs[2]` | `inputs["Background"]` / `inputs["Foreground"]` |
| Pass outputs `DiffCol`, `AO` | `Diffuse Color`, `Ambient Occlusion` |

`scene.use_nodes` still exists in 5.x but always returns `True`, does nothing, and is scheduled for removal in 6.0. Blender 4.5 LTS already has the option inputs and keeps the old properties as deprecated, so it is the version to port on.

## Examples

### Example 1: Cinematic color grade pipeline

**User request:** "Add a cinematic look — warm highlights, cool shadows, bloom, and vignette"

```python
import bpy

scene = bpy.context.scene
tree = bpy.data.node_groups.new("Cinematic Grade", "CompositorNodeTree")
scene.compositing_node_group = tree
nodes, links = tree.nodes, tree.links

rl = nodes.new("CompositorNodeRLayers")

# Color Balance
cb = nodes.new("CompositorNodeColorBalance")
cb.location = (250, 0)
cb.inputs["Type"].default_value = "Lift/Gamma/Gain"
cb.inputs["Color Lift"].default_value = (0.92, 0.93, 1.0, 1.0)
cb.inputs["Color Gain"].default_value = (1.15, 1.08, 0.95, 1.0)
links.new(rl.outputs["Image"], cb.inputs["Image"])

# Bloom
glare = nodes.new("CompositorNodeGlare")
glare.location = (500, 0)
glare.inputs["Type"].default_value = "Bloom"
glare.inputs["Threshold"].default_value = 0.7
glare.inputs["Size"].default_value = 0.7
links.new(cb.outputs["Image"], glare.inputs["Image"])

# Vignette (Ellipse Mask -> Blur -> Multiply)
ellipse = nodes.new("CompositorNodeEllipseMask")
ellipse.location = (300, -400)
ellipse.inputs["Size"].default_value = (0.85, 0.85)
blur_mask = nodes.new("CompositorNodeBlur")
blur_mask.location = (500, -400)
blur_mask.inputs["Size"].default_value = (200, 200)
links.new(ellipse.outputs["Mask"], blur_mask.inputs["Image"])

mix_vig = nodes.new("ShaderNodeMix")
mix_vig.location = (750, 0)
mix_vig.data_type = "RGBA"
mix_vig.blend_type = "MULTIPLY"
mix_vig.inputs["Factor"].default_value = 0.6
links.new(glare.outputs["Image"], mix_vig.inputs["A"])
links.new(blur_mask.outputs["Image"], mix_vig.inputs["B"])

out = nodes.new("NodeGroupOutput")
out.location = (1000, 0)
tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
links.new(mix_vig.outputs["Result"], out.inputs["Image"])

scene.render.filepath = "/tmp/comp_output/graded_"
bpy.ops.render.render(write_still=True)
```

```bash
blender --background ~/projects/alley_shot/alley.blend --python grade.py
```

Result: the render log ends with `Saved: '/tmp/comp_output/graded_.png'`. The image has blue-tinted shadows, warm highlights, glow around pixels brighter than 0.7, and corners darkened by up to 60%.

### Example 2: Composite a render over a photo plate

**User request:** "Composite my 3D character over a photo background"

```python
import bpy

scene = bpy.context.scene
scene.render.film_transparent = True  # Use alpha instead of keying
tree = bpy.data.node_groups.new("Plate Comp", "CompositorNodeTree")
scene.compositing_node_group = tree
nodes, links = tree.nodes, tree.links

rl = nodes.new("CompositorNodeRLayers")
plate = nodes.new("CompositorNodeImage")
plate.location = (0, -400)
plate.image = bpy.data.images.load(bpy.path.abspath("//plates/rooftop_plate.jpg"))

alpha_over = nodes.new("CompositorNodeAlphaOver")
alpha_over.location = (400, -100)
links.new(plate.outputs["Image"], alpha_over.inputs["Background"])
links.new(rl.outputs["Image"], alpha_over.inputs["Foreground"])

out = nodes.new("NodeGroupOutput")
out.location = (650, -100)
tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
links.new(alpha_over.outputs["Image"], out.inputs["Image"])
```

Result: the next render shows the character over `rooftop_plate.jpg`. The compositor works at the render resolution, so a plate with a different size is centered and cropped or padded; when the sizes differ, add a `CompositorNodeScale` node after the Image node with `inputs["Type"].default_value = "Render Size"` (its default, `"Relative"` at 1.0, changes nothing) and `inputs["Frame Type"]` set to `"Crop"` or `"Fit"` to keep the aspect ratio.

## Guidelines

- Create or fetch the tree through `scene.compositing_node_group`. `scene.node_tree` raises `AttributeError` in 5.x and `scene.use_nodes = True` no longer creates anything.
- End the tree with a Group Output node whose first input is a Color socket. With no Group Output node the render is saved uncomposited; with one that has nothing linked the frame comes out black. `scene.render.use_compositing = False` switches compositing off.
- A leftover 4.x assignment can fail silently: `ellipse.width = 0.85` now sets the node's width in the editor, because `width` is a property of every node. Removed properties such as `glare.glare_type` raise `AttributeError`.
- Menu inputs raise `TypeError: enum "BLOOM" not found in ('Bloom', ...)` on a wrong value; the message lists the accepted labels.
- When two inputs share a name (Color Balance `Lift`, Keying `Blur Size`), `inputs["Lift"]` returns the first one. Use the identifier (`"Color Lift"`, `"Postprocess Blur Size"`), which `inputs[...]` also accepts, and never numeric indices: socket order changes between releases.
- Enable render passes on the View Layer before linking them; until then `rl.outputs["Diffuse Color"]` raises `KeyError` (the socket is disabled in 5.0, where name lookup skips it, and absent in 5.2).
- For green screen work, prefer `film_transparent = True` with Alpha Over instead of Keying when you control the 3D scene.
- Chain color corrections: exposure/levels first, then color balance, then creative grading. The Denoise node works best right after Render Layers.
- Use the multilayer EXR media type on File Output to save all passes in one file.
- Headless rendering: set `scene.render.compositor_device = 'CPU'` explicitly. The default differs between releases, and the GPU compositor needs a working GPU context, which servers and containers often lack.
- Node positions (`node.location`) are for visual layout only — they don't affect functionality.
