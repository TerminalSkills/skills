---
name: blender-vse-pipeline
description: >-
  Automate video editing in Blender's Video Sequence Editor with Python. Use
  when the user wants to add video, image, or audio strips, create transitions,
  apply effects, build edit timelines, batch assemble footage, estimate render
  times, or script any VSE workflow from the command line.
license: Apache-2.0
compatibility: >-
  Requires Blender 3.0+. FFmpeg codecs included with Blender.
  Run: blender --background --python script.py
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["blender", "video-editing", "vse", "timeline", "pipeline"]
---

# Blender VSE Pipeline

## Overview

Automate video editing with Blender's Video Sequence Editor (VSE) using Python. Add and arrange strips (video, image, audio), create transitions, apply effects, assemble edits from file lists, and render final video — all headlessly from the terminal.

## Instructions

### 1. Initialize the sequence editor

```python
import bpy

scene = bpy.context.scene
if not scene.sequence_editor:
    scene.sequence_editor_create()
sequences = scene.sequence_editor.sequences
scene.frame_start = 1
scene.frame_end = 250
scene.render.fps = 24
```

### 2. Add strips

```python
# Video strip
strip = sequences.new_movie(name="Clip_A", filepath="/path/to/video.mp4", channel=1, frame_start=1)
strip.frame_offset_start = 24    # trim start (skip 1 sec)
strip.frame_offset_end = 48      # trim end

# Image strip (hold for duration)
img = sequences.new_image(name="Title_Card", filepath="/path/to/title.png", channel=2, frame_start=1, fit_method='FIT')
img.frame_final_duration = 72  # 3 seconds at 24fps

# Image sequence
import glob
img_files = sorted(glob.glob("/path/to/frames/frame_*.png"))
img_seq = sequences.new_image(name="Render", filepath=img_files[0], channel=1, frame_start=1)
for f in img_files[1:]:
    img_seq.elements.append(f.split("/")[-1])

# Audio strip with fade in/out
audio = sequences.new_sound(name="Music", filepath="/path/to/music.mp3", channel=3, frame_start=1)
audio.volume = 0.0
audio.keyframe_insert(data_path="volume", frame=1)
audio.volume = 0.6
audio.keyframe_insert(data_path="volume", frame=24)
audio.volume = 0.6
audio.keyframe_insert(data_path="volume", frame=audio.frame_final_end - 48)
audio.volume = 0.0
audio.keyframe_insert(data_path="volume", frame=audio.frame_final_end)
```

### 3. Transitions and effects

```python
# Cross dissolve (strips must overlap and be on different channels)
cross = sequences.new_effect(
    name="CrossDissolve", type='GAMMA_CROSS', channel=3,
    frame_start=clip_a.frame_final_end - 24,
    frame_end=clip_b.frame_final_start + 24,
    seq1=clip_a, seq2=clip_b
)

# Color strip (solid background)
color = sequences.new_effect(name="BlackBG", type='COLOR', channel=1, frame_start=1, frame_end=48)
color.color = (0, 0, 0)

# Text overlay
text = sequences.new_effect(name="Title", type='TEXT', channel=4, frame_start=1, frame_end=72)
text.text = "My Video Title"
text.font_size = 80
text.color = (1, 1, 1, 1)
text.location = (0.5, 0.5)
text.align_x = 'CENTER'
text.align_y = 'CENTER'
text.use_shadow = True

# Speed control
speed = sequences.new_effect(name="SlowMo", type='SPEED', channel=5,
    frame_start=clip_a.frame_final_start, frame_end=clip_a.frame_final_end, seq1=clip_a)
speed.speed_factor = 0.5

# Transform (position, scale, rotation)
transform = sequences.new_effect(name="Transform", type='TRANSFORM', channel=5, frame_start=1, frame_end=100, seq1=clip_a)
transform.scale_start_x = 1.2
transform.scale_start_y = 1.2
```

### 4. Strip modifiers for color correction

```python
strip = sequences["Clip_A"]
bc = strip.modifiers.new(name="BrightContrast", type='BRIGHT_CONTRAST')
bc.bright = 0.1
bc.contrast = 0.15

cb = strip.modifiers.new(name="ColorBalance", type='COLOR_BALANCE')
cb.color_balance.lift = (0.95, 0.95, 1.0)
cb.color_balance.gain = (1.1, 1.05, 0.95)
```

### 5. Render the final video

```python
scene = bpy.context.scene
scene.render.filepath = "/tmp/final_edit.mp4"
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.audio_codec = 'AAC'
scene.render.ffmpeg.audio_bitrate = 192
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080

# Auto-set frame range from strips
all_strips = scene.sequence_editor.sequences_all
if all_strips:
    scene.frame_start = min(s.frame_final_start for s in all_strips)
    scene.frame_end = max(s.frame_final_end for s in all_strips)

bpy.ops.render.render(animation=True)
```

## Examples

### Example 1: Assemble an edit from a shot list

**User request:** "Build a timeline from video clips with crossfades between them"

```python
import bpy, os

clips = ["/path/to/shot_01.mp4", "/path/to/shot_02.mp4", "/path/to/shot_03.mp4", "/path/to/shot_04.mp4"]
crossfade_frames = 12

scene = bpy.context.scene
scene.render.fps = 24
if not scene.sequence_editor:
    scene.sequence_editor_create()
sequences = scene.sequence_editor.sequences
current_frame = 1
prev_strip = None

for i, clip_path in enumerate(clips):
    if prev_strip and crossfade_frames > 0:
        current_frame -= crossfade_frames
    strip = sequences.new_movie(
        name=os.path.splitext(os.path.basename(clip_path))[0],
        filepath=clip_path, channel=1 + (i % 2), frame_start=current_frame
    )
    if prev_strip and crossfade_frames > 0:
        sequences.new_effect(name=f"Fade_{i}", type='GAMMA_CROSS', channel=3,
            frame_start=current_frame, frame_end=current_frame + crossfade_frames,
            seq1=prev_strip, seq2=strip)
    current_frame += strip.frame_final_duration
    prev_strip = strip

scene.frame_start = 1
scene.frame_end = current_frame
```

### Example 2: Batch add text overlays from data

**User request:** "Add text titles at specific timecodes"

```python
import bpy

titles = [("Introduction", 0, 3), ("Chapter 1", 15, 4), ("Chapter 2", 120, 4), ("Conclusion", 300, 5)]
fps = bpy.context.scene.render.fps
sequences = bpy.context.scene.sequence_editor.sequences

for text_content, start_sec, dur_sec in titles:
    start_frame = int(start_sec * fps) + 1
    text = sequences.new_effect(name=text_content[:20], type='TEXT', channel=5,
        frame_start=start_frame, frame_end=start_frame + int(dur_sec * fps))
    text.text = text_content
    text.font_size = 60
    text.color = (1, 1, 1, 1)
    text.location = (0.5, 0.15)
    text.align_x = 'CENTER'
    text.use_shadow = True
```

## Guidelines

- Always call `scene.sequence_editor_create()` if `scene.sequence_editor` is `None`.
- Use `sequences.new_movie()`, `new_image()`, `new_sound()`, `new_effect()`. Avoid `bpy.ops.sequencer.*` in background mode.
- Cross dissolves need strips on different channels with overlapping frames. Alternate channels (1, 2, 1, 2).
- `frame_offset_start/end` trims content without moving the strip. `frame_start` moves it on the timeline.
- For audio fades, keyframe `strip.volume` — no built-in fade effect in VSE.
- Render long edits as image sequences first, then assemble with ffmpeg.
- Set resolution to match source footage to avoid scaling artifacts.
- VSE processes channels bottom-to-top — higher channels layer on top.
