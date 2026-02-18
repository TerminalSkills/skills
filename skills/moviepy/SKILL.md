---
name: moviepy
description: >-
  Edit and compose video with Python using MoviePy. Use when a user asks to
  programmatically edit videos, create video montages, add text overlays, build
  automated video pipelines, composite multiple clips, apply video effects,
  generate social media videos from templates, concatenate clips, extract audio,
  create GIFs, build slideshows, add transitions, resize and crop videos, or
  integrate video editing into Python applications. Covers MoviePy 2.x for
  compositing, effects, text, and rendering.
license: Apache-2.0
compatibility: 'Python 3.8+, ffmpeg required'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - moviepy
    - python
    - video-editing
    - compositing
    - automation
---

# MoviePy

## Overview

Edit video programmatically with MoviePy — the Python library for video compositing, cutting, effects, and rendering. Ideal for automated video pipelines: social media content generation, bulk video processing, slideshow builders, subtitle embedding, template-based video creation, and any workflow where you need code-driven video editing without a GUI. Built on ffmpeg.

## Instructions

### Step 1: Installation

```bash
pip install moviepy
apt install -y ffmpeg         # Ubuntu/Debian
# Optional for text: apt install -y imagemagick
# Or: pip install Pillow (MoviePy v2.x uses PIL for text)
```

### Step 2: Basic Operations

```python
from moviepy import VideoFileClip, AudioFileClip

clip = VideoFileClip("input.mp4")
print(f"Duration: {clip.duration}s, Size: {clip.size}, FPS: {clip.fps}")

trimmed = clip.subclipped(10, 60)            # 10s to 60s
resized = clip.resized(height=720)            # Maintain aspect ratio
resized = clip.resized((1080, 1920))          # Force size
cropped = clip.cropped(x1=100, y1=50, x2=1820, y2=1030)
fast = clip.with_speed_scaled(2.0)            # 2x speed
silent = clip.without_audio()

trimmed.write_videofile("output.mp4", fps=24, codec="libx264",
    audio_codec="aac", bitrate="5000k", preset="medium", threads=4)
clip.subclipped(5, 10).write_gif("output.gif", fps=15)
clip.close()
```

### Step 3: Concatenation & Composition

```python
from moviepy import VideoFileClip, concatenate_videoclips, CompositeVideoClip, ColorClip

# Concatenate clips sequentially
final = concatenate_videoclips([
    VideoFileClip("scene1.mp4"),
    VideoFileClip("scene2.mp4"),
    VideoFileClip("scene3.mp4"),
])

# Composite (overlay layers)
bg = ColorClip(size=(1920, 1080), color=(15, 23, 42), duration=10)
main = VideoFileClip("main.mp4").resized(height=800).with_position("center")
logo = (VideoFileClip("logo.png", duration=10)
        .resized(height=60).with_position((1820, 30)))

composite = CompositeVideoClip([bg, main, logo], size=(1920, 1080))
composite.write_videofile("composite.mp4", fps=30)
```

### Step 4: Text Overlays

```python
from moviepy import TextClip, CompositeVideoClip, VideoFileClip

video = VideoFileClip("input.mp4")
title = (TextClip(text="Episode 1: Getting Started",
                  font_size=60, color="white", font="Arial-Bold",
                  stroke_color="black", stroke_width=2)
         .with_duration(5).with_position("center").with_start(1))

subtitle = (TextClip(text="Welcome to the show",
                     font_size=36, color="white", bg_color="rgba(0,0,0,128)")
            .with_duration(4).with_position(("center", 900))
            .with_start(3).crossfadein(0.5).crossfadeout(0.5))

final = CompositeVideoClip([video, title, subtitle])
final.write_videofile("titled.mp4")
```

### Step 5: Audio Operations

```python
from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip

video = VideoFileClip("input.mp4")
video.audio.write_audiofile("extracted.mp3")

# Mix audio tracks
original = video.audio.with_volume_scaled(0.3)
music = AudioFileClip("bg_music.mp3").with_volume_scaled(0.15)
voiceover = AudioFileClip("narration.mp3")
mixed = CompositeAudioClip([original, music, voiceover])
final = video.with_audio(mixed)
final.write_videofile("mixed.mp4")
```

### Step 6: Effects & Custom Filters

```python
from moviepy import VideoFileClip, vfx

clip = VideoFileClip("input.mp4")
clip.with_effects([vfx.MirrorX()])           # Mirror horizontally
clip.with_effects([vfx.BlackAndWhite()])      # Grayscale
clip.with_effects([vfx.FadeIn(1), vfx.FadeOut(2)])

# Custom frame-by-frame effect
def add_vignette(frame):
    import numpy as np
    rows, cols = frame.shape[:2]
    X, Y = np.meshgrid(np.arange(cols) - cols/2, np.arange(rows) - rows/2)
    mask = 1 - np.clip(np.sqrt(X**2 + Y**2) / (max(rows, cols) * 0.5), 0, 1)
    return (frame * mask[:, :, np.newaxis] ** 1.5).astype("uint8")

vignetted = clip.image_transform(add_vignette)
```

### Step 7: Batch Processing

```python
import os
from moviepy import VideoFileClip, TextClip, CompositeVideoClip

def process_video(input_path, output_path, watermark_text="@mychannel"):
    clip = VideoFileClip(input_path).resized(height=1080)
    watermark = (TextClip(text=watermark_text, font_size=24, color="white")
                 .with_opacity(0.5).with_duration(clip.duration).with_position((20, 20)))
    final = CompositeVideoClip([clip, watermark])
    final.write_videofile(output_path, fps=clip.fps, codec="libx264",
                          audio_codec="aac", preset="fast", threads=4)
    clip.close()

input_dir, output_dir = "raw_videos", "processed"
os.makedirs(output_dir, exist_ok=True)
for f in os.listdir(input_dir):
    if f.endswith((".mp4", ".mov", ".avi")):
        process_video(os.path.join(input_dir, f),
                      os.path.join(output_dir, f.rsplit(".", 1)[0] + ".mp4"))
```

## Examples

### Example 1: Generate 30 Instagram story videos from a JSON config
**User prompt:** "I have a products.json file with 30 entries, each containing name, price, tagline, and image_path. Write a Python script that generates a 1080x1920 Instagram story for each product with the product image as background, name in bold white at the top, price in green, and tagline at the bottom with a fade-in."

The agent will write a script that loads `products.json`, iterates over each entry, creates a `ColorClip` background at 1080x1920, loads the product image and resizes it to fill the frame, creates `TextClip` layers for the name (72px, bold, top), price (56px, green `#22c55e`, center), and tagline (36px, bottom with `crossfadein(0.5)`), composites them with `CompositeVideoClip`, renders each to `stories/{name}.mp4` at 30fps, and closes all clips.

### Example 2: Concatenate interview clips with title cards and background music
**User prompt:** "I have 5 interview clips in /footage/ named q1.mp4 through q5.mp4. Create a script that puts a 3-second dark title card with white text before each clip showing 'Question 1' through 'Question 5', concatenates everything, adds background music from ambient.mp3 at 20% volume, and exports as interview_final.mp4."

The agent will write a script that builds title cards using `ColorClip` with dark background and `TextClip` for each question number, loads each interview clip with `VideoFileClip`, interleaves title cards and clips into a list, concatenates with `concatenate_videoclips`, loads `ambient.mp3` as an `AudioFileClip` trimmed to the total duration at 20% volume, mixes it with the original audio using `CompositeAudioClip`, and writes the final video.

## Guidelines

- Always call `clip.close()` after writing output to free ffmpeg processes and file handles, especially in batch loops
- MoviePy 2.x changed many method names from 1.x; use `subclipped()` not `subclip()`, `resized()` not `resize()`, `with_position()` not `set_position()`
- Set `threads=4` or higher in `write_videofile()` for multi-core encoding, and use `preset="fast"` for batch jobs where speed matters more than file size
- For text rendering, MoviePy 2.x uses Pillow by default; install ImageMagick only if you need the `method="caption"` word-wrapping feature
- Large batch jobs can exhaust RAM since each clip keeps decoded frames in memory; process one clip at a time and close it before starting the next
