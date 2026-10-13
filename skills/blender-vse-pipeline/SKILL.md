---
name: blender-vse-pipeline
description: >-
  Automate video editing in Blender's Video Sequence Editor with Python. Use
  when the user wants to add video, image, or audio strips, create transitions,
  apply effects, build edit timelines, batch assemble footage, estimate render
  times, or script any VSE workflow from the command line.
license: Apache-2.0
compatibility: >-
  Requires Blender 5.0+ (strips API; 4.x used scene.sequence_editor.sequences).
  FFmpeg codecs included with Blender. Run: blender --background --python script.py
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: ["blender", "video-editing", "vse", "timeline", "pipeline"]
  repository: https://projects.blender.org/blender/blender
---

# Blender VSE Pipeline

## Overview

Automate video editing with Blender's Video Sequence Editor (VSE) using Python. Add and arrange strips (video, image, audio), create transitions, apply effects, assemble edits from file lists, and render final video — all headlessly from the terminal. Checked against the Blender 5.2 LTS Python API reference.

Blender 5.0 renamed the VSE API: `Sequence` became `Strip`, `scene.sequence_editor.sequences` became `.strips`, `sequences_all` became `.strips_all`, and `new_effect` takes `length`, `input1`, `input2` instead of `frame_end`, `seq1`, `seq2`. The `TRANSFORM` effect strip is gone; every image or movie strip now has `strip.transform` and `strip.crop`. The timing properties `frame_final_start`, `frame_final_end`, `frame_final_duration`, `frame_offset_start`, `frame_offset_end` and `frame_start` are deprecated (removal planned for 6.0) in favour of `left_handle`, `right_handle`, `duration`, `left_handle_offset`, `right_handle_offset` and `content_start`.

## Instructions

### 1. Initialize the sequence editor

```python
import bpy

scene = bpy.context.scene
if not scene.sequence_editor:
    scene.sequence_editor_create()
strips = scene.sequence_editor.strips
scene.frame_start = 1
scene.frame_end = 250
scene.render.fps = 24
```

### 2. Add strips

```python
# Video strip
strip = strips.new_movie(name="Clip_A", filepath="/srv/footage/interview_cam_a.mp4", channel=1, frame_start=1)
strip.left_handle_offset = 24    # trim start (skip 1 sec at 24 fps)
strip.right_handle_offset = 48   # trim end

# Image strip (hold for duration)
img = strips.new_image(name="Title_Card", filepath="/srv/footage/title_card.png", channel=2, frame_start=1, fit_method='FIT')
img.duration = 72  # 3 seconds at 24fps

# Image sequence
import glob
img_files = sorted(glob.glob("/srv/renders/shot_010/frame_*.png"))
img_seq = strips.new_image(name="Render", filepath=img_files[0], channel=1, frame_start=1)
for f in img_files[1:]:
    img_seq.elements.append(f.split("/")[-1])

# Audio strip with fade in/out
audio = strips.new_sound(name="Music", filepath="/srv/audio/theme_music.mp3", channel=3, frame_start=1)
audio.volume = 0.0
audio.keyframe_insert(data_path="volume", frame=1)
audio.volume = 0.6
audio.keyframe_insert(data_path="volume", frame=24)
audio.volume = 0.6
audio.keyframe_insert(data_path="volume", frame=audio.right_handle - 48)
audio.volume = 0.0
audio.keyframe_insert(data_path="volume", frame=audio.right_handle)
```

### 3. Transitions and effects

```python
# Cross dissolve (strips must overlap and be on different channels)
cross = strips.new_effect(
    name="CrossDissolve", type='GAMMA_CROSS', channel=3,
    frame_start=clip_b.left_handle, length=24,
    input1=clip_a, input2=clip_b
)

# Color strip (solid background)
color = strips.new_effect(name="BlackBG", type='COLOR', channel=1, frame_start=1, length=48)
color.color = (0, 0, 0)

# Text overlay
text = strips.new_effect(name="Title", type='TEXT', channel=4, frame_start=1, length=72)
text.text = "Harbor Cities, Episode 3"
text.font_size = 80
text.color = (1, 1, 1, 1)
text.location = (0.5, 0.5)       # relative position in the frame
text.anchor_x = 'CENTER'         # text box anchor relative to location
text.anchor_y = 'CENTER'
text.alignment_x = 'CENTER'      # alignment of lines inside the box
text.use_shadow = True

# Speed control
speed = strips.new_effect(name="SlowMo", type='SPEED', channel=5,
    frame_start=clip_a.left_handle, length=clip_a.duration, input1=clip_a)
speed.speed_control = 'MULTIPLY'     # default STRETCH fits the input to the strip length
speed.speed_factor = 0.5

# Transform (position, scale, rotation) is a property of image/movie strips
clip_a.transform.scale_x = 1.2
clip_a.transform.scale_y = 1.2
clip_a.transform.offset_x = 40       # pixels
clip_a.crop.min_x = 20               # crop left edge by 20 px
```

### 4. Strip modifiers for color correction

```python
strip = strips["Clip_A"]
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
all_strips = scene.sequence_editor.strips_all
if all_strips:
    scene.frame_start = min(s.left_handle for s in all_strips)
    scene.frame_end = max(s.right_handle for s in all_strips)

bpy.ops.render.render(animation=True)
```

## Examples

### Example 1: Assemble an edit from a shot list

**User request:** "Build a timeline from video clips with crossfades between them"

```python
import bpy, os

clips = ["/srv/footage/shot_01.mp4", "/srv/footage/shot_02.mp4", "/srv/footage/shot_03.mp4", "/srv/footage/shot_04.mp4"]
crossfade_frames = 12

scene = bpy.context.scene
scene.render.fps = 24
if not scene.sequence_editor:
    scene.sequence_editor_create()
strips = scene.sequence_editor.strips
current_frame = 1
prev_strip = None

for i, clip_path in enumerate(clips):
    if prev_strip and crossfade_frames > 0:
        current_frame -= crossfade_frames
    strip = strips.new_movie(
        name=os.path.splitext(os.path.basename(clip_path))[0],
        filepath=clip_path, channel=1 + (i % 2), frame_start=current_frame
    )
    if prev_strip and crossfade_frames > 0:
        strips.new_effect(name=f"Fade_{i}", type='GAMMA_CROSS', channel=3,
            frame_start=current_frame, length=crossfade_frames,
            input1=prev_strip, input2=strip)
    current_frame += strip.duration
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
strips = bpy.context.scene.sequence_editor.strips

for text_content, start_sec, dur_sec in titles:
    start_frame = int(start_sec * fps) + 1
    text = strips.new_effect(name=text_content[:20], type='TEXT', channel=5,
        frame_start=start_frame, length=int(dur_sec * fps))
    text.text = text_content
    text.font_size = 60
    text.color = (1, 1, 1, 1)
    text.location = (0.5, 0.15)
    text.anchor_x = 'CENTER'
    text.alignment_x = 'CENTER'
    text.use_shadow = True
```

## Guidelines

- Always call `scene.sequence_editor_create()` if `scene.sequence_editor` is `None`.
- Use `strips.new_movie()`, `new_image()`, `new_sound()`, `new_effect()`. Avoid `bpy.ops.sequencer.*` in background mode.
- Cross dissolves need strips on different channels with overlapping frames. Alternate channels (1, 2, 1, 2).
- `left_handle_offset` / `right_handle_offset` trim content without moving the strip; `left_handle` is where the strip starts on the timeline. The older `frame_offset_*`, `frame_final_*` and `frame_start` names still work in 5.x but are deprecated.
- For audio fades, keyframe `strip.volume` — no built-in fade effect in VSE.
- Render long edits as image sequences first, then assemble with ffmpeg.
- Set resolution to match source footage to avoid scaling artifacts, or pass `fit_method` (`FIT`, `FILL`, `STRETCH`, `ORIGINAL`) when adding image and movie strips.
- The container default of `scene.render.ffmpeg.format` is MKV; set `MPEG4` explicitly for `.mp4` output. `ffmpeg.constant_rate_factor` controls quality.
- VSE processes channels bottom-to-top — higher channels layer on top.
