---
name: blender-scripting
description: >-
  Write and run Blender Python scripts for 3D automation and procedural
  modeling. Use when the user wants to automate Blender tasks, create 3D models
  from code, run headless scripts, manipulate scenes, batch process .blend
  files, build geometry with bmesh, apply modifiers, generate procedural
  shapes, or import/export 3D models using the bpy API.
license: Apache-2.0
compatibility: >-
  Requires Blender 3.0+ installed and accessible from the command line.
  Linux: sudo apt install blender or snap install blender.
  macOS: brew install --cask blender.
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: ["blender", "3d", "python", "automation", "procedural"]
---

# Blender Scripting

## Overview

Automate Blender tasks and create 3D models procedurally using Python and the `bpy` API. Run scripts headlessly from the terminal to manipulate scenes, build geometry with bmesh, apply modifiers, batch process files, and import/export models.

## Instructions

### 1. Run scripts from the terminal

```bash
blender --background --python script.py
blender myfile.blend --background --python script.py
blender --background --python script.py -- --output /tmp/result.png --scale 2.0
```

### 2. Scene setup and cleanup

```python
import bpy

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
```

### 3. Create and transform objects

```python
import bpy, math
from mathutils import Vector

bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
cube = bpy.context.active_object
cube.location = (3, 0, 1)
cube.rotation_euler = (0, 0, math.radians(45))
cube.scale = (1, 2, 0.5)
```

### 4. Build meshes from raw data

```python
vertices = [(-1,-1,0), (1,-1,0), (1,1,0), (-1,1,0),
            (-1,-1,2), (1,-1,2), (1,1,2), (-1,1,2)]
faces = [(0,1,2,3), (4,5,6,7), (0,1,5,4), (2,3,7,6), (0,3,7,4), (1,2,6,5)]

mesh = bpy.data.meshes.new("CustomBox")
mesh.from_pydata(vertices, [], faces)
mesh.update()
obj = bpy.data.objects.new("CustomBox", mesh)
bpy.context.collection.objects.link(obj)
```

### 5. Use bmesh for advanced mesh editing

```python
import bmesh

bm = bmesh.new()
v1 = bm.verts.new((0, 0, 0))
v2 = bm.verts.new((1, 0, 0))
v3 = bm.verts.new((1, 1, 0))
v4 = bm.verts.new((0, 1, 0))
bm.faces.new((v1, v2, v3, v4))

bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2)

mesh = bpy.data.meshes.new("Result")
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("Result", mesh)
bpy.context.collection.objects.link(obj)
```

### 6. Apply modifiers

```python
obj = bpy.context.active_object

sub = obj.modifiers.new("Subdivision", 'SUBSURF')
sub.levels = 2

mirror = obj.modifiers.new("Mirror", 'MIRROR')
mirror.use_axis = (True, False, False)

array = obj.modifiers.new("Array", 'ARRAY')
array.count = 5
array.relative_offset_displace = (1.1, 0, 0)

solid = obj.modifiers.new("Solidify", 'SOLIDIFY')
solid.thickness = 0.1

bevel = obj.modifiers.new("Bevel", 'BEVEL')
bevel.width = 0.05
bevel.segments = 3

# Apply permanently
bpy.context.view_layer.objects.active = obj
bpy.ops.object.modifier_apply(modifier="Subdivision")
```

### 7. Create curves

```python
curve_data = bpy.data.curves.new("MyCurve", type='CURVE')
curve_data.dimensions = '3D'
spline = curve_data.splines.new('BEZIER')
spline.bezier_points.add(3)
for i, (x, y, z) in enumerate([(0,0,0), (1,1,0), (2,0,1), (3,1,1)]):
    pt = spline.bezier_points[i]
    pt.co = (x, y, z)
    pt.handle_type_left = pt.handle_type_right = 'AUTO'
curve_data.bevel_depth = 0.1
obj = bpy.data.objects.new("MyCurve", curve_data)
bpy.context.collection.objects.link(obj)
```

### 8. Import and export

```python
bpy.ops.wm.obj_import(filepath="/path/model.obj")
bpy.ops.import_scene.fbx(filepath="/path/model.fbx")
bpy.ops.import_scene.gltf(filepath="/path/model.glb")
bpy.ops.wm.obj_export(filepath="/path/output.obj")
bpy.ops.export_scene.gltf(filepath="/path/output.glb", export_format='GLB')
```

### 9. Assign materials

```python
mat_red = bpy.data.materials.new("Red")
mat_red.diffuse_color = (1, 0, 0, 1)
obj.data.materials.append(mat_red)
for i, poly in enumerate(obj.data.polygons):
    poly.material_index = 0 if i % 2 == 0 else 1
```

### 10. Batch process files

```python
import glob
for filepath in glob.glob("/path/to/*.blend"):
    bpy.ops.wm.open_mainfile(filepath=filepath)
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            print(f"  {obj.name}: {len(obj.data.vertices)} verts")
    bpy.ops.wm.save_as_mainfile(filepath=filepath.replace(".blend", "_processed.blend"))
```

## Examples

### Example 1: Procedural spiral staircase

**User request:** "Generate a spiral staircase with 20 steps"

```python
import bpy, math

def create_spiral_staircase(steps=20, radius=3, height=6):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    step_height = height / steps
    for i in range(steps):
        angle = (2 * math.pi * i) / steps
        x, y = radius * math.cos(angle), radius * math.sin(angle)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, i * step_height),
                                         scale=(1.5, 0.4, step_height * 0.8))
        bpy.context.active_object.rotation_euler.z = angle
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=height, location=(0, 0, height/2))

create_spiral_staircase()
bpy.ops.wm.save_as_mainfile(filepath="/tmp/staircase.blend")
```

### Example 2: Export all mesh objects as separate OBJ files

**User request:** "Export every mesh in my .blend as a separate OBJ"

```python
import bpy, os
output_dir = "/tmp/exports"
os.makedirs(output_dir, exist_ok=True)
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.wm.obj_export(filepath=os.path.join(output_dir, f"{obj.name}.obj"),
                               export_selected_objects=True)
```

Run: `blender scene.blend --background --python export_all.py`

### Example 3: Procedural terrain from heightmap

**User request:** "Generate a terrain mesh using sine waves"

```python
import bpy, bmesh, math, random
bm = bmesh.new()
res, size = 50, 20
verts = []
for i in range(res):
    row = []
    for j in range(res):
        x, y = (i/res - 0.5) * size, (j/res - 0.5) * size
        z = math.sin(x*0.5) * math.cos(y*0.5) * 2 + random.uniform(-0.2, 0.2)
        row.append(bm.verts.new((x, y, z)))
    verts.append(row)
for i in range(res-1):
    for j in range(res-1):
        bm.faces.new((verts[i][j], verts[i+1][j], verts[i+1][j+1], verts[i][j+1]))
mesh = bpy.data.meshes.new("Terrain")
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("Terrain", mesh)
bpy.context.collection.objects.link(obj)
```

## Guidelines

- Always use `--background` when running from the terminal to skip the GUI
- Use `from_pydata()` for simple static meshes; use `bmesh` for advanced operations
- Always call `mesh.update()` after `from_pydata()` and `bm.free()` after bmesh
- Use `bpy.data` for direct data access (fast); use `bpy.ops` for complex operations
- Ensure correct object is active and selected before using operators
- For batch processing, save to new files (not overwrite originals) unless requested
- For large meshes (10k+ faces), prefer bmesh over repeated `bpy.ops` calls
- Link objects to a collection — unlinked objects won't appear in the scene
- Blender uses Z-up coordinates; account for this when importing from Y-up systems
- Use `mathutils` for vector math and matrix operations (bundled with Blender Python)
- Import/export operator names vary by Blender version; listed ones work for 3.6+
