---
name: moviepy
description: >-
  Edit and compose video with Python using MoviePy. Use when a user asks to
  programmatically edit videos, create video montages, add text overlays,
  build automated video pipelines, composite multiple clips, apply video
  effects, generate social media videos from templates, concatenate clips,
  extract audio, create GIFs, build slideshows, add transitions, resize
  and crop videos, or integrate video editing into Python applications.
  Covers MoviePy 2.x for compositing, effects, text, and rendering.
license: Apache-2.0
compatibility: "Python 3.8+, ffmpeg required"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: video
  tags: ["moviepy", "python", "video-editing", "compositing", "automation", "social-media"]
---

# MoviePy

## Overview

Edit video programmatically with MoviePy — the Python library for video compositing, cutting, effects, and rendering. Ideal for automated video pipelines: social media content generation, bulk video processing, slideshow builders, subtitle embedding, template-based video creation, and any workflow where you need code-driven video editing without a GUI. Built on ffmpeg.

## Instructions

### Step 1: Installation

```bash
pip install moviepy

# MoviePy requires ffmpeg
apt install -y ffmpeg    # Ubuntu/Debian
brew install ffmpeg      # macOS

# Optional: for text rendering
apt install -y imagemagick
# Or: pip install Pillow (MoviePy uses PIL for text in v2.x)
```

### Step 2: Basic Operations

**Load, trim, and export:**
```python
from moviepy import VideoFileClip, AudioFileClip

# Load a video
clip = VideoFileClip("input.mp4")
print(f"Duration: {clip.duration}s, Size: {clip.size}, FPS: {clip.fps}")

# Trim (subclip)
trimmed = clip.subclipped(10, 60)  # 10s to 60s

# Resize
resized = clip.resized(height=720)  # Maintain aspect ratio
resized = clip.resized((1080, 1920))  # Force size (Instagram story)

# Crop
cropped = clip.cropped(x1=100, y1=50, x2=1820, y2=1030)

# Speed
fast = clip.with_speed_scaled(2.0)  # 2x speed
slow = clip.with_speed_scaled(0.5)  # Half speed

# Without audio
silent = clip.without_audio()

# Export
trimmed.write_videofile("output.mp4", fps=24, codec="libx264",
    audio_codec="aac", bitrate="5000k",
    preset="medium",  # ultrafast, fast, medium, slow
    threads=4)

# Export as GIF
clip.subclipped(5, 10).write_gif("output.gif", fps=15)

# Close clips to free memory
clip.close()
```

### Step 3: Concatenation & Composition

**Concatenate clips (one after another):**
```python
from moviepy import VideoFileClip, concatenate_videoclips

clip1 = VideoFileClip("scene1.mp4")
clip2 = VideoFileClip("scene2.mp4")
clip3 = VideoFileClip("scene3.mp4")

# Simple concatenation
final = concatenate_videoclips([clip1, clip2, clip3])

# With transition (crossfade)
final = concatenate_videoclips([
    clip1,
    clip2.with_start(clip1.duration - 1).crossfadein(1),  # 1s crossfade
    clip3.with_start(clip1.duration + clip2.duration - 2).crossfadein(1),
], method="compose")

final.write_videofile("combined.mp4")
```

**Composite (overlay clips):**
```python
from moviepy import VideoFileClip, CompositeVideoClip, ColorClip

# Background
bg = ColorClip(size=(1920, 1080), color=(15, 23, 42), duration=10)

# Main video (centered, scaled)
main = VideoFileClip("main.mp4").resized(height=800)
main = main.with_position("center")

# Logo (top-right corner)
logo = (VideoFileClip("logo.png", duration=10)
        .resized(height=60)
        .with_position((1820, 30)))  # x, y from top-left

# Lower third
lower = (VideoFileClip("lower_third.png", duration=5)
         .with_position(("center", 900))
         .with_start(2))  # Appears at 2s

composite = CompositeVideoClip([bg, main, logo, lower], size=(1920, 1080))
composite.write_videofile("composite.mp4", fps=30)
```

### Step 4: Text Overlays

```python
from moviepy import TextClip, CompositeVideoClip, VideoFileClip

video = VideoFileClip("input.mp4")

# Simple text overlay
title = (TextClip(text="Episode 1: Getting Started",
                  font_size=60,
                  color="white",
                  font="Arial-Bold",
                  stroke_color="black",
                  stroke_width=2)
         .with_duration(5)
         .with_position("center")
         .with_start(1))

# Animated text (fade in/out)
subtitle = (TextClip(text="Welcome to the show",
                     font_size=36,
                     color="white",
                     bg_color="rgba(0,0,0,128)")
            .with_duration(4)
            .with_position(("center", 900))
            .with_start(3)
            .crossfadein(0.5)
            .crossfadeout(0.5))

# Multiple text elements
final = CompositeVideoClip([video, title, subtitle])
final.write_videofile("titled.mp4")
```

**Dynamic text from data:**
```python
def create_title_card(text, duration=3, size=(1920, 1080)):
    bg = ColorClip(size=size, color=(15, 23, 42), duration=duration)
    title = (TextClip(text=text, font_size=72, color="white", font="Arial-Bold")
             .with_duration(duration)
             .with_position("center")
             .crossfadein(0.5)
             .crossfadeout(0.5))
    return CompositeVideoClip([bg, title], size=size)

# Build episode from segments with title cards
segments = [
    ("Introduction", "intro.mp4"),
    ("Chapter 1: The Problem", "ch1.mp4"),
    ("Chapter 2: The Solution", "ch2.mp4"),
    ("Conclusion", "conclusion.mp4"),
]

clips = []
for title, video_path in segments:
    clips.append(create_title_card(title))
    clips.append(VideoFileClip(video_path))

final = concatenate_videoclips(clips)
final.write_videofile("full_episode.mp4")
```

### Step 5: Audio Operations

```python
from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip

video = VideoFileClip("input.mp4")

# Extract audio
video.audio.write_audiofile("extracted.mp3")

# Replace audio
new_audio = AudioFileClip("voiceover.mp3")
video_with_vo = video.with_audio(new_audio)

# Mix audio tracks
original_audio = video.audio.with_volume_scaled(0.3)  # Duck original
music = AudioFileClip("bg_music.mp3").with_volume_scaled(0.15)
voiceover = AudioFileClip("narration.mp3")

mixed = CompositeAudioClip([original_audio, music, voiceover])
final = video.with_audio(mixed)
final.write_videofile("mixed.mp4")

# Fade audio
from moviepy import audio_fadein, audio_fadeout
faded_audio = audio_fadein(audio_fadeout(video.audio, 2), 1)  # 1s in, 2s out
```

### Step 6: Effects & Filters

```python
from moviepy import VideoFileClip
from moviepy import vfx

clip = VideoFileClip("input.mp4")

# Built-in effects
mirrored = clip.with_effects([vfx.MirrorX()])
bw = clip.with_effects([vfx.BlackAndWhite()])
inverted = clip.with_effects([vfx.InvertColors()])
rotated = clip.rotated(90)  # Degrees
faded = clip.with_effects([vfx.FadeIn(1), vfx.FadeOut(2)])

# Custom frame-by-frame effect
def add_vignette(frame):
    """Apply vignette effect to a frame (numpy array)."""
    import numpy as np
    rows, cols = frame.shape[:2]
    X = np.arange(cols) - cols / 2
    Y = np.arange(rows) - rows / 2
    X, Y = np.meshgrid(X, Y)
    mask = np.sqrt(X**2 + Y**2)
    mask = 1 - np.clip(mask / (max(rows, cols) * 0.5), 0, 1)
    mask = mask ** 1.5
    return (frame * mask[:, :, np.newaxis]).astype("uint8")

vignetted = clip.image_transform(add_vignette)

# Time-based effect (changes over time)
def zoom_in(get_frame, t):
    """Slowly zoom in over time."""
    frame = get_frame(t)
    zoom = 1 + t * 0.02  # 2% zoom per second
    h, w = frame.shape[:2]
    new_h, new_w = int(h / zoom), int(w / zoom)
    y1 = (h - new_h) // 2
    x1 = (w - new_w) // 2
    cropped = frame[y1:y1+new_h, x1:x1+new_w]
    from PIL import Image
    import numpy as np
    img = Image.fromarray(cropped).resize((w, h), Image.LANCZOS)
    return np.array(img)

zoomed = clip.transform(zoom_in)
```

### Step 7: Social Media Video Generator

```python
from moviepy import *
import json

def create_social_video(config):
    """Generate a social media video from a config dict."""
    
    size_map = {
        "instagram_post": (1080, 1080),
        "instagram_story": (1080, 1920),
        "youtube_short": (1080, 1920),
        "tiktok": (1080, 1920),
        "youtube": (1920, 1080),
        "twitter": (1280, 720),
    }
    
    platform = config.get("platform", "instagram_post")
    size = size_map[platform]
    duration = config.get("duration", 15)
    
    # Background
    if config.get("background_video"):
        bg = (VideoFileClip(config["background_video"])
              .subclipped(0, duration)
              .resized(size))
    elif config.get("background_color"):
        bg = ColorClip(size=size, color=config["background_color"], duration=duration)
    else:
        bg = ColorClip(size=size, color=(0, 0, 0), duration=duration)
    
    layers = [bg]
    
    # Text layers
    for text_cfg in config.get("texts", []):
        txt = (TextClip(
            text=text_cfg["text"],
            font_size=text_cfg.get("size", 48),
            color=text_cfg.get("color", "white"),
            font=text_cfg.get("font", "Arial-Bold"),
            stroke_color=text_cfg.get("stroke", None),
            stroke_width=text_cfg.get("stroke_width", 0),
            method="caption",
            size=(size[0] - 100, None),  # Wrap text
        )
        .with_duration(text_cfg.get("duration", duration))
        .with_start(text_cfg.get("start", 0))
        .with_position(text_cfg.get("position", "center")))
        
        if text_cfg.get("fade_in"):
            txt = txt.crossfadein(text_cfg["fade_in"])
        if text_cfg.get("fade_out"):
            txt = txt.crossfadeout(text_cfg["fade_out"])
        
        layers.append(txt)
    
    # Audio
    audio_layers = []
    if config.get("music"):
        music = (AudioFileClip(config["music"])
                 .subclipped(0, duration)
                 .with_volume_scaled(config.get("music_volume", 0.3)))
        audio_layers.append(music)
    
    if config.get("voiceover"):
        vo = AudioFileClip(config["voiceover"])
        audio_layers.append(vo)
    
    final = CompositeVideoClip(layers, size=size)
    
    if audio_layers:
        final = final.with_audio(CompositeAudioClip(audio_layers))
    
    return final

# Usage
config = {
    "platform": "instagram_story",
    "duration": 15,
    "background_color": (15, 23, 42),
    "texts": [
        {"text": "5 Python Tips", "size": 72, "color": "white", "position": ("center", 400), "start": 0, "duration": 3, "fade_in": 0.5},
        {"text": "You Didn't Know", "size": 48, "color": "#38bdf8", "position": ("center", 500), "start": 0.5, "duration": 2.5, "fade_in": 0.5},
        {"text": "Tip #1: Walrus Operator", "size": 56, "color": "white", "position": "center", "start": 3, "duration": 3},
    ],
    "music": "bg_music.mp3",
    "music_volume": 0.2,
}

video = create_social_video(config)
video.write_videofile("social_post.mp4", fps=30)
```

### Step 8: Batch Processing

```python
import os
from moviepy import VideoFileClip, TextClip, CompositeVideoClip

def process_video(input_path, output_path, watermark_text="@mychannel"):
    """Add watermark, trim, resize, and export."""
    clip = VideoFileClip(input_path)
    
    # Resize to 1080p
    clip = clip.resized(height=1080)
    
    # Add watermark
    watermark = (TextClip(text=watermark_text, font_size=24, color="white")
                 .with_opacity(0.5)
                 .with_duration(clip.duration)
                 .with_position((20, 20)))
    
    final = CompositeVideoClip([clip, watermark])
    final.write_videofile(output_path, fps=clip.fps, codec="libx264",
                          audio_codec="aac", preset="fast", threads=4)
    clip.close()

# Batch process
input_dir = "raw_videos"
output_dir = "processed"
os.makedirs(output_dir, exist_ok=True)

for filename in os.listdir(input_dir):
    if filename.endswith((".mp4", ".mov", ".avi")):
        print(f"Processing: {filename}")
        process_video(
            os.path.join(input_dir, filename),
            os.path.join(output_dir, filename.rsplit(".", 1)[0] + ".mp4"),
        )
        print(f"  ✅ Done")
```

### Step 9: Slideshow Builder

```python
from moviepy import *
from pathlib import Path

def build_slideshow(image_paths, output_path, duration_per_image=4,
                    transition_duration=1, music_path=None, size=(1920, 1080)):
    """Create a slideshow with Ken Burns effect and crossfade transitions."""
    
    clips = []
    for i, img_path in enumerate(image_paths):
        # Load image as clip
        img_clip = (ImageClip(img_path)
                    .with_duration(duration_per_image)
                    .resized(lambda t: 1 + 0.03 * t))  # Slow zoom (Ken Burns)
        
        # Center and crop to target size
        img_clip = img_clip.resized(height=size[1] + 100)  # Slightly larger for zoom
        img_clip = img_clip.with_position("center")
        
        # Wrap in composite to enforce size
        img_clip = CompositeVideoClip([img_clip], size=size)
        
        # Add crossfade
        if i > 0:
            img_clip = img_clip.crossfadein(transition_duration)
        
        clips.append(img_clip)
    
    final = concatenate_videoclips(clips, method="compose",
                                    padding=-transition_duration)
    
    # Add music
    if music_path:
        music = (AudioFileClip(music_path)
                 .subclipped(0, final.duration)
                 .with_volume_scaled(0.4))
        music = audio_fadeout(audio_fadein(music, 1), 2)
        final = final.with_audio(music)
    
    final.write_videofile(output_path, fps=30, codec="libx264")

# Usage
images = sorted(Path("photos").glob("*.jpg"))
build_slideshow(images, "slideshow.mp4", music_path="ambient.mp3")
```
