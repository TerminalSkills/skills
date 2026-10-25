---
name: blender-motion-capture
description: >-
  Automate motion capture and tracking workflows in Blender with Python. Use
  when the user wants to import BVH or FBX mocap data, retarget motion to
  armatures, track camera or object motion from video, solve camera motion,
  clean up motion capture data, or script any tracking pipeline in Blender.
license: Apache-2.0
compatibility: >-
  Requires Blender 5.0+ (layered actions; on 4.x use action.fcurves directly).
  Video tracking needs the Movie Clip Editor, so run it with the UI open.
  Run: blender --background --python script.py (import/retarget/export)
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: "blender, motion-capture, tracking, mocap, animation"
  repository: https://projects.blender.org/blender/blender
---

# Blender Motion Capture

## Overview

Import, process, and retarget motion capture data in Blender using Python. Work with BVH/FBX mocap files, track camera and object motion from video footage, solve 3D camera paths, and clean up animation data. Checked against the Blender 5.2 Python API reference.

Blender 5.0 changed how animation data is stored: an Action now has layers, strips and slots, and F-Curves live in a channelbag (`action.layers[0].strips[0].channelbag(slot).fcurves`), not in `action.fcurves`. Code written for 4.x that touches `action.fcurves` fails on 5.x.

## Instructions

### 1. Import BVH motion capture files

```python
import bpy

bpy.ops.import_anim.bvh(
    filepath="/srv/mocap/walk_cycle.bvh",
    target='ARMATURE',
    global_scale=0.01,            # BVH files are usually in centimeters
    frame_start=1,
    use_fps_scale=False,
    update_scene_fps=True,        # match the scene fps to the file
    update_scene_duration=True,   # extend the scene frame range to the clip
    rotate_mode='QUATERNION',     # NATIVE keeps the file's Euler order, which breaks quaternion copies
    axis_forward='-Z', axis_up='Y'
)

armature = bpy.context.active_object
action = armature.animation_data.action
print(f"Imported: {armature.name}, Bones: {len(armature.data.bones)}, Frames: {tuple(action.frame_range)}")
```

### 2. Import FBX with animation

```python
bpy.ops.import_scene.fbx(
    filepath="/srv/mocap/capture_take01.fbx",
    use_anim=True,
    ignore_leaf_bones=True,
    automatic_bone_orientation=True,
    primary_bone_axis='Y', secondary_bone_axis='X'
)
```

Newer Blender versions also ship a C++ importer, `bpy.ops.wm.fbx_import(filepath=..., use_anim=True, ignore_leaf_bones=True)`, which has no bone-axis options. Both exist in 5.2; try the one that gives the right bone orientation for your rig.

### 3. Retarget motion between armatures

This copy-per-frame approach assumes both rigs share the same rest pose and bone roll. If they do not, or you need foot contact and offsets, constrain the target bones (`Copy Rotation` with `mix_mode='REPLACE'`) and bake with `bpy.ops.nla.bake(bake_types={'POSE'}, visual_keying=True, clear_constraints=True)`, or use an add-on such as Rokoko Studio Live or Auto-Rig Pro.

```python
import bpy

def retarget_motion(source_armature, target_armature, bone_mapping):
    """Retarget animation using a bone name mapping: {target_bone: source_bone}"""
    source_action = source_armature.animation_data.action
    frame_start, frame_end = int(source_action.frame_range[0]), int(source_action.frame_range[1])

    if not target_armature.animation_data:
        target_armature.animation_data_create()
    new_action = bpy.data.actions.new(f"{source_action.name}_retarget")
    target_armature.animation_data.action = new_action   # keyframe_insert() creates the slot and channels

    for frame in range(frame_start, frame_end + 1):
        bpy.context.scene.frame_set(frame)
        for tgt_name, src_name in bone_mapping.items():
            src = source_armature.pose.bones.get(src_name)
            tgt = target_armature.pose.bones.get(tgt_name)
            if not src or not tgt:
                continue
            tgt.rotation_mode = 'QUATERNION'
            tgt.rotation_quaternion = (src.rotation_quaternion if src.rotation_mode == 'QUATERNION'
                                       else src.rotation_euler.to_quaternion())
            tgt.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            # Copy location for root bone only
            if src_name == list(bone_mapping.values())[0]:
                tgt.location = src.location
                tgt.keyframe_insert(data_path="location", frame=frame)

# Example Mixamo → Rigify mapping
mapping = {
    "spine": "mixamorig:Hips", "spine.001": "mixamorig:Spine",
    "spine.004": "mixamorig:Neck", "spine.006": "mixamorig:Head",
    "upper_arm.L": "mixamorig:LeftArm", "forearm.L": "mixamorig:LeftForeArm",
    "upper_arm.R": "mixamorig:RightArm", "forearm.R": "mixamorig:RightForeArm",
    "thigh.L": "mixamorig:LeftUpLeg", "shin.L": "mixamorig:LeftLeg",
    "thigh.R": "mixamorig:RightUpLeg", "shin.R": "mixamorig:RightLeg",
}
```

### 4. Clean up motion capture data

```python
def decimate_fcurve(fcurve, factor=0.5):
    """Remove keyframes to reduce data while keeping shape."""
    points = fcurve.keyframe_points
    total = len(points)
    keep_every = max(1, int(1.0 / factor))
    remove_indices = [i for i in range(total) if i % keep_every != 0 and i != 0 and i != total - 1]
    for i in reversed(remove_indices):
        points.remove(points[i])

def action_fcurves(action, slot):
    """All F-Curves of one slot in a layered action (Blender 5.0+)."""
    for layer in action.layers:
        for strip in layer.strips:
            channelbag = strip.channelbag(slot)
            if channelbag:
                yield from channelbag.fcurves

armature = bpy.context.active_object
anim = armature.animation_data
for fcurve in action_fcurves(anim.action, anim.action_slot):
    decimate_fcurve(fcurve, factor=0.5)
    fcurve.update()
```

### 5. Video motion tracking and camera solve

The `bpy.ops.clip.*` operators need a Movie Clip Editor area, so they fail in `--background` mode. Open Blender with its UI, switch an area to the Movie Clip Editor, and either run the script from the Text Editor or wrap each call in `with bpy.context.temp_override(area=clip_area, region=clip_region):`.

```python
# Load footage
clip = bpy.data.movieclips.load("/srv/footage/street_pan.mp4")
scene = bpy.context.scene
scene.active_clip = clip

# Configure tracking
tracking = clip.tracking
settings = tracking.settings
settings.default_pattern_size = 21
settings.default_search_size = 71
settings.default_motion_model = 'Affine'   # Loc, LocScale, LocRot, LocRotScale, Affine, Perspective

# Camera settings for solving
camera = tracking.camera
camera.sensor_width = 36.0
camera.focal_length = 50.0

# Create and follow markers (needs the clip editor context), drop bad tracks, then solve
bpy.ops.clip.detect_features(placement='FRAME', margin=16, threshold=0.5, min_distance=120)
bpy.ops.clip.track_markers(backwards=False, sequence=True)
bpy.ops.clip.clean_tracks(frames=10, error=3.0, action='DELETE_TRACK')

# Solve camera motion
bpy.ops.clip.solve_camera()
solve_error = tracking.reconstruction.average_error
print(f"Solve error: {solve_error:.4f} px ({'Good' if solve_error < 0.5 else 'Needs refinement'})")

# Set up scene from solved data
bpy.ops.clip.setup_tracking_scene()
```

### 6. Apply tracked motion to objects

```python
obj = bpy.data.objects["Cube"]
constraint = obj.constraints.new(type='FOLLOW_TRACK')
constraint.clip = clip
constraint.track = tracking.tracks[0].name      # the track is referenced by name (a string)
constraint.use_3d_position = True
constraint.camera = scene.camera

# Bake constraint to keyframes
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.nla.bake(
    frame_start=1, frame_end=clip.frame_duration,
    only_selected=True, visual_keying=True,
    clear_constraints=True, bake_types={'OBJECT'}
)
```

### 7. Export animation data

```python
# Export as BVH
bpy.ops.export_anim.bvh(
    filepath="/tmp/output_mocap.bvh",
    frame_start=int(action.frame_range[0]),
    frame_end=int(action.frame_range[1]),
    rotate_mode='NATIVE',
    root_transform_only=False
)

# Export as FBX with baked animation
bpy.ops.export_scene.fbx(
    filepath="/tmp/output_anim.fbx",
    use_selection=True, bake_anim=True,
    bake_anim_use_all_bones=True, add_leaf_bones=False
)
```

## Examples

### Example 1: Batch scan mocap library

**User request:** "Import all BVH files from a folder, list bone counts and frame ranges"

```python
import bpy, glob, os

for filepath in sorted(glob.glob("/srv/mocap/library/*.bvh")):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_anim.bvh(filepath=filepath, target='ARMATURE', global_scale=0.01, frame_start=1)
    arm = bpy.context.active_object
    if arm and arm.animation_data:
        action = arm.animation_data.action
        duration = (action.frame_range[1] - action.frame_range[0]) / bpy.context.scene.render.fps
        print(f"{os.path.basename(filepath)}: {len(arm.data.bones)} bones, {duration:.1f}s")
```

Run: `blender --background --python scan_mocap.py`

### Example 2: Apply mocap to character and render

**User request:** "Import a BVH file, apply it to my rigged character, and render a preview"

```python
import bpy

bpy.ops.wm.open_mainfile(filepath="/srv/projects/hero_character.blend")
char_armature = bpy.data.objects["Armature"]

bpy.ops.import_anim.bvh(filepath="/srv/mocap/walk_cycle.bvh", target='ARMATURE', global_scale=0.01)
mocap_armature = bpy.context.active_object
mocap_action = mocap_armature.animation_data.action

# Transfer action (works when bone names match)
if not char_armature.animation_data:
    char_armature.animation_data_create()
char_armature.animation_data.action = mocap_action
# Blender 5.0+: pick the slot explicitly if it was not matched by name
if char_armature.animation_data.action_slot is None:
    char_armature.animation_data.action_slot = mocap_action.slots[0]

# Remove temp armature, set frame range, add camera, render
bpy.data.objects.remove(mocap_armature)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = int(mocap_action.frame_range[0]), int(mocap_action.frame_range[1])
scene.render.filepath = "/tmp/mocap_preview/frame_"
bpy.ops.render.render(animation=True)
```

## Guidelines

- BVH is simplest (plain text with hierarchy + motion). FBX supports richer data (blend shapes, multiple takes).
- Scale matters: BVH files often use centimeters. Set `global_scale=0.01` for cm-based files.
- Bone name matching is critical for retargeting. Build a mapping dictionary for each source format.
- For retargeting, copy rotations for all bones but only location for the root/hip bone.
- Clean up imported mocap by decimating keyframes — raw mocap has every-frame keys, making editing difficult. On Blender 5.x reach F-Curves through the action's layers, strips and channelbag; `action.fcurves` no longer exists.
- `bpy.ops.clip.*` operators depend on the Movie Clip Editor context; test them in a foreground session first.
- Camera solve quality depends on marker count and distribution. Use 8+ well-distributed markers, keep error below 0.5px.
- Use `bpy.ops.nla.bake()` to convert constraints to keyframes for export.
- Always export with `bake_anim=True` in FBX to flatten NLA strips and constraints.
