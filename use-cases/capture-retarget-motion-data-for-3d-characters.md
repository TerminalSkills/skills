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

Using **blender-motion-capture** to handle data import, bone mapping, and retargeting, combined with **blender-scripting** to batch-process all 30 clips and apply consistent cleanup, the studio reduces per-move animation time from 5 hours to 25 minutes.

## Step-by-Step Walkthrough

### 1. Import and clean raw motion capture data

Load raw BVH files and fix common issues like noisy joint data, ground plane offset, and frame rate mismatches.

> Import the BVH file /mocap/roundhouse_kick.bvh into Blender. Clean up the data: apply a Butterworth low-pass filter to remove jitter from the wrist and ankle joints, fix the ground plane so feet do not clip through the floor, and convert from 120fps capture rate to 30fps for the game engine. Use blender-motion-capture.

### 2. Map mocap bones to the character rig

Create a bone mapping configuration that translates the mocap skeleton hierarchy to the studio's custom armature.

> Create a bone mapping from our Rokoko mocap skeleton to our custom game character rig. The mocap uses names like "Hips", "Spine1", "LeftUpLeg" while our rig uses "root_bone", "spine_01", "thigh_L". Save the mapping as a reusable JSON config at /config/bone_map.json so it works for all 8 characters.

### 3. Batch retarget all 30 combat moves

Process every BVH file through the bone mapping and apply per-clip adjustments automatically.

> Use blender-scripting to batch process all 30 BVH files in /mocap/combat/. For each file: import, apply the bone mapping from bone_map.json, retarget onto the character rig from /characters/fighter_01.blend, constrain the root bone to prevent sliding, and export the retargeted animation as an FBX action. Save outputs to /animations/fighter_01/.

### 4. Apply post-processing cleanup passes

Fix common retargeting artifacts like foot sliding, interpenetration, and unnatural joint angles.

> Run a cleanup pass on all 30 retargeted animations: apply inverse kinematics foot locking to prevent foot sliding during grounded moves, clamp elbow and knee joint angles to anatomically valid ranges, smooth transitions in the first and last 5 frames for blending in the game engine, and flag any frames where hands intersect the body mesh.

## Real-World Example

The studio recorded all 30 combat moves in a single 4-hour mocap session with two performers. Using the automated pipeline, they retargeted and cleaned all 30 animations onto their first character in under 13 hours total. Repeating the process for the remaining 7 characters took 3 hours each since the bone mapping and cleanup presets were reusable. The entire 8-character animation set that was estimated at 1,440 hours of hand animation was completed in approximately 34 hours of pipeline-assisted work.
