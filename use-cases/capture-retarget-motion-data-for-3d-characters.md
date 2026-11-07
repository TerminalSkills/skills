---
title: "Capture and Retarget Motion Data for 3D Characters in Blender"
slug: capture-retarget-motion-data-for-3d-characters
description: "Record real-world motion capture data and retarget it onto Blender character rigs for animation production."
skills:
  - blender-motion-capture
  - blender-scripting
category: automation
tags:
  - motion-capture
  - blender
  - animation
  - character-rigging
---

# Capture and Retarget Motion Data for 3D Characters in Blender

## The Problem

An indie game studio needs to animate 30 combat moves for a fighting game character. Hand-animating each move takes a skilled animator 4-6 hours. At 30 moves, that is 120-180 hours of animation work for a single character, and they have 8 characters planned. The studio has a budget motion capture suit and raw BVH files from recording sessions, but retargeting mocap data onto their custom Blender rigs is a tedious manual process of bone mapping, scale correction, and cleanup that takes nearly as long as hand-animating.

## The Solution

Using **blender-motion-capture** to handle data import, bone mapping, and retargeting, combined with **blender-scripting** to batch-process all 30 clips and apply consistent cleanup, the studio replaces hand-keying each move with one scripted pass plus a short manual review.

## Step-by-Step Walkthrough

### 1. Import the BVH at the game's frame rate

BVH files carry their own frame rate. Set the scene to the target rate first, then let the importer rescale the keys.

> Write a Blender script that sets the scene to 30 fps, imports /mocap/roundhouse_kick.bvh with `use_fps_scale=True`, `update_scene_fps=False`, `global_scale=0.01` (the suit exports centimeters) and `rotate_mode='QUATERNION'`, then sets the scene frame range to the imported action. Use blender-motion-capture.

A 121-frame, 120 fps clip imported this way becomes a 30 fps action of about one second (31 frames). `update_scene_duration=True` only extends the range, so set `frame_start` and `frame_end` from `action.frame_range` yourself, rounding the ends (the end of that 121-frame clip comes out as 30.9988, and `int()` would cut it to 30). Run scripts with `blender --background --python script.py`.

### 2. Map mocap bones to the character rig

Keep the source-to-target names in one JSON file that your script loads.

> Create a bone mapping from our Rokoko mocap skeleton to our game rig: "Hips" to "root_bone", "Spine1" to "spine_01", "LeftUpLeg" to "thigh_L", "LeftLeg" to "shin_L", and so on. Save it as /config/bone_map.json so the same file works for all 8 characters.

```json
{
  "source_rig": "Rokoko_Smartsuit",
  "target_rig": "fighter_custom_v2",
  "bone_map": {
    "root_bone": "Hips",
    "spine_01": "Spine1",
    "thigh_L": "LeftUpLeg",
    "shin_L": "LeftLeg"
  }
}
```

This file is your own convention, not a Blender format: the script reads it and passes it to the retarget step. Blender does no retargeting by itself, so the mapping is only as good as your bone names.

### 3. Retarget and bake

Constrain each target bone to its source bone with a local-space Copy Rotation, then bake the result to keyframes on the character rig.

```python
import bpy, json

bone_map = json.load(open("/config/bone_map.json"))["bone_map"]   # target -> source
scene = bpy.context.scene
src = bpy.context.active_object              # the armature the BVH import just created
tgt = bpy.data.objects["fighter_rig"]         # the character armature from /characters/fighter_01.blend

for target_bone, source_bone in bone_map.items():
    c = tgt.pose.bones[target_bone].constraints.new('COPY_ROTATION')
    c.target, c.subtarget = src, source_bone
    c.mix_mode = 'REPLACE'
    c.target_space = c.owner_space = 'LOCAL'

bpy.ops.object.select_all(action='DESELECT')
tgt.select_set(True)
bpy.context.view_layer.objects.active = tgt
bpy.ops.nla.bake(frame_start=scene.frame_start, frame_end=scene.frame_end, step=1,
                 only_selected=False, visual_keying=True, clear_constraints=True,
                 use_current_action=False, bake_types={'POSE'})
```

Local-space copying assumes both rigs share the same rest pose and bone roll. If the root slides or limbs twist, fix the rest pose first or add a root-motion step; this recipe does not solve that for you. Take `src` right after the import: the BVH armature is named after the file.

I ran this recipe on Blender 5.0.1 with a generated 4-bone BVH and rig, and the baked action covered the whole clip.

### 4. Batch all 30 clips and smooth the curves

> Use blender-scripting to loop over /mocap/combat/*.bvh. For each file: open /characters/fighter_01.blend fresh, import, retarget and bake as above, smooth the baked curves, and export /animations/fighter_01/<clip>.fbx with baked animation.

Blender 5.0 stores F-Curves in the action's channelbag, not in `action.fcurves`:

```python
act = tgt.animation_data.action
cb = act.layers[0].strips[0].channelbag(tgt.animation_data.action_slot)
for fc in cb.fcurves:
    kp = fc.keyframe_points
    vals = [k.co[1] for k in kp]
    for i in range(2, len(kp) - 2):
        kp[i].co[1] = sum(vals[i - 2:i + 3]) / 5      # 5-key moving average
    fc.update()

bpy.data.objects.remove(src)
bpy.ops.export_scene.fbx(filepath="/animations/fighter_01/roundhouse_kick.fbx",
                         use_selection=True, bake_anim=True,
                         bake_anim_use_all_bones=True, add_leaf_bones=False)
```

Select the character armature before exporting so `use_selection` keeps only that rig. The moving average blurs fast strikes, so keep the window small (5 keys at 30 fps) and compare against the raw clip. The interactive Graph Editor also has Butterworth Smooth (`bpy.ops.graph.butterworth_smooth`), but it needs a Graph Editor area and does not run under `--background`.

### 5. Review what the script cannot fix

Foot sliding, ground contact and hand-body intersections need a human look. Open each baked clip, scrub the strikes, and fix the frames that fail by hand, for example with IK constraints on the feet.

## Real-World Example

An indie studio recorded 30 combat moves in one session with two performers. They batch-retargeted the clips onto the first character, then spent their time on the reviews in step 5 instead of on bone mapping. For the next seven characters only the target side of the setup changed: the mapping file, the settings and the batch script were reused, so each character cost a review pass rather than a fresh rebuild.

## Tips

- Record mocap at the highest frame rate your suit supports (120fps+), then downsample. You cannot recover data lost at capture time, but you can always remove frames later.
- Save bone mapping configs per mocap suit model, not per character. A Rokoko mapping works for any target rig; only the target side changes.
- Run the cleanup pass on the retargeted animation, not the raw BVH. Fixing foot sliding before retargeting wastes effort because the retarget step introduces its own artifacts.
- Keep raw BVH files archived separately from retargeted outputs. Directors frequently request re-retargeting months later with adjusted scale or root offsets.

## Related Skills

- [blender-motion-capture](../skills/blender-motion-capture/) -- BVH/FBX import, retargeting and layered-action cleanup in Blender 5.x
- [blender-scripting](../skills/blender-scripting/) -- headless bpy scripting for the batch loop
