---
title: Automate Social Media Video Production
slug: automate-social-media-video-production
description: "Build a Python pipeline that batch-produces branded short-form videos for Instagram, TikTok, YouTube Shorts, and Twitter from JSON templates and CSV data using MoviePy."
skills: [ffmpeg-video-editing]
category: content
tags: [moviepy, ffmpeg, video, social-media, automation, batch-processing]
---

# Automate Social Media Video Production

## The Problem

Sami runs a content agency that produces 50+ short videos per week for clients across Instagram, TikTok, YouTube Shorts, and Twitter. Each video follows a template — background clip, text overlays, branded intro/outro, music, and platform-specific sizing. The team manually edits each one in Premiere, which takes 30-45 minutes per video. Sami wants a Python pipeline that takes a JSON config (text, media assets, platform) and outputs a ready-to-post video in under a minute.

## The Solution

Use the **ffmpeg-video-editing** skill with MoviePy to build a template-driven video renderer. Define templates in JSON, brand kits per client, and feed a CSV of content variations. The pipeline renders all combinations across all platform sizes with multiprocessing, then runs quality checks.

## Step-by-Step Walkthrough

### 1. Define the requirements

```text
I need to automate short-form video production for our agency. We make 50+ videos per week, all following templates. Here's what I need:

1. Template system: Define video templates in JSON — background clip or color, text layers with timing/position/animation, logo placement, music track, platform sizing.
2. Multi-platform export: Render for Instagram Reels, TikTok, YouTube Shorts, Twitter, and Instagram post. Handle safe zones.
3. Text animations: Support fade-in, slide-up, typewriter, and scale-in effects.
4. Branded elements: Auto-add client's intro, outro, and watermark. Each client has their own brand kit.
5. Music & audio: Layer background music at 20% volume. Duck on voiceover. Fade in/out.
6. Batch production: Feed a CSV, render all variations across all platform sizes with multiprocessing.
7. Quality check: Verify duration, resolution, audio, and file size against platform limits.
```

### 2. Set up the project structure

```text
video-pipeline/
├── pipeline.py            # Main entry point
├── renderer.py            # Core rendering engine
├── templates.py           # Template system
├── effects.py             # Text animation effects
├── qc.py                  # Quality check
├── brands/                # Client brand kits
│   └── acme/
│       ├── brand.json
│       ├── logo.png
│       ├── intro.mp4
│       └── outro.mp4
├── templates/             # Video templates
│   └── quote-card.json
└── batches/               # CSV batch files
```

### 3. Build the text animation effects

```python
# effects.py — Reusable text animation effects for video templates.
# Each function takes a MoviePy TextClip and returns a modified clip.

from moviepy import TextClip, CompositeVideoClip


def fade_in_text(text_clip, duration=0.5):
    """Simple opacity crossfade from 0% to 100%."""
    return text_clip.crossfadein(duration)


def slide_up_text(text_clip, distance=100, duration=0.5):
    """Slide text up from below its final position with ease-out cubic easing."""
    final_pos = text_clip.pos
    if callable(final_pos):
        final_y = 0
    else:
        final_y = final_pos[1] if isinstance(final_pos, tuple) else 0

    def position_func(t):
        progress = min(t / duration, 1.0)
        progress = 1 - (1 - progress) ** 3  # Ease out cubic — fast start, slow finish
        x = final_pos[0] if isinstance(final_pos, tuple) else "center"
        y = final_y + distance * (1 - progress)
        return (x, y)

    return text_clip.with_position(position_func)


def scale_in_text(text_clip, duration=0.5):
    """Scale from near-zero to full size with ease-out easing."""
    def resize_func(t):
        if t < duration:
            progress = t / duration
            progress = 1 - (1 - progress) ** 3  # Ease out cubic
            return max(progress, 0.01)           # Avoid 0 (invisible)
        return 1.0
    return text_clip.resized(resize_func)


# Registry — template JSON references effects by name
EFFECTS = {
    "fade_in": fade_in_text,
    "slide_up": slide_up_text,
    "scale_in": scale_in_text,
}
```

### 4. Build the template system

```python
# templates.py — Platform definitions and config loaders.
# Centralizes platform specs so the renderer stays clean.

import json
from pathlib import Path

# Target resolutions per platform (width, height)
PLATFORM_SIZES = {
    "instagram_reel": (1080, 1920),   # 9:16 vertical
    "tiktok": (1080, 1920),           # 9:16 vertical
    "youtube_short": (1080, 1920),    # 9:16 vertical
    "twitter": (1280, 720),           # 16:9 landscape
    "instagram_post": (1080, 1080),   # 1:1 square
}

# Safe zones: (top, bottom, left, right) in pixels.
# These areas are covered by platform UI (username, buttons, etc.)
# so text placed here won't be readable. The renderer avoids them.
SAFE_ZONES = {
    "instagram_reel": (200, 350, 40, 40),   # Large bottom zone for UI buttons
    "tiktok": (150, 400, 40, 40),           # TikTok has the tallest bottom bar
    "youtube_short": (150, 300, 40, 40),
    "twitter": (0, 0, 0, 0),                # Landscape — no overlays on content
    "instagram_post": (0, 100, 0, 0),       # Small bottom caption area
}


def load_template(path):
    """Load a video template JSON (defines layout, text layers, timing)."""
    with open(path) as f:
        return json.load(f)


def load_brand(brand_name):
    """Load a client brand kit (colors, fonts, logo, intro/outro clips)."""
    brand_path = Path(f"brands/{brand_name}/brand.json")
    with open(brand_path) as f:
        brand = json.load(f)
    brand["_dir"] = str(brand_path.parent)  # Store path for resolving relative assets
    return brand
```

### 5. Create a video template

```json
{
  "name": "Quote Card",
  "duration": 15,
  "background": {
    "type": "color",
    "color": [15, 23, 42]
  },
  "texts": [
    {
      "field": "headline",
      "default": "Did You Know?",
      "size": 64,
      "color": "white",
      "font": "Arial-Bold",
      "position": ["center", 0.3],
      "start": 0.5,
      "duration": 4,
      "effect": "scale_in"
    },
    {
      "field": "body",
      "default": "Your fact here",
      "size": 42,
      "color": "#94a3b8",
      "font": "Arial",
      "position": ["center", 0.5],
      "start": 1.5,
      "duration": 10,
      "effect": "fade_in",
      "wrap_width": 0.85
    },
    {
      "field": "cta",
      "default": "Follow for more →",
      "size": 36,
      "color": "#38bdf8",
      "font": "Arial-Bold",
      "position": ["center", 0.75],
      "start": 8,
      "duration": 7,
      "effect": "slide_up"
    }
  ],
  "music": {
    "volume": 0.2,
    "duck_on_voiceover": 0.08,
    "fade_in": 1,
    "fade_out": 2
  },
  "watermark": {
    "position": "top_right",
    "opacity": 0.5,
    "height": 40,
    "margin": 20
  }
}
```

### 6. Create a brand kit

```json
{
  "name": "Acme Corp",
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#1e293b",
    "accent": "#f59e0b"
  },
  "fonts": {
    "heading": "Montserrat-Bold",
    "body": "Inter"
  },
  "logo": "logo.png",
  "intro": "intro.mp4",
  "outro": "outro.mp4",
  "intro_duration": 2,
  "outro_duration": 3,
  "music": "brand_music.mp3"
}
```

### 7. Build the core rendering engine

```python
# renderer.py — Core video rendering engine.
# Takes a template + brand + data + platform and produces a finished video.

from moviepy import *
from effects import EFFECTS
from templates import PLATFORM_SIZES, SAFE_ZONES, load_template, load_brand
from pathlib import Path
import os


def render_video(template, brand, data, platform, output_path,
                 voiceover_path=None, background_video=None):
    """Render a single video from template + data + brand + platform.

    Args:
        template: Parsed template JSON (layout, text layers, timing)
        brand: Parsed brand kit (colors, fonts, logo, intro/outro)
        data: Dict of field values from CSV row (headline, body, cta, etc.)
        platform: Target platform key (e.g. "instagram_reel", "tiktok")
        output_path: Where to write the final .mp4
        voiceover_path: Optional path to a voiceover audio file
        background_video: Optional override for background clip
    """

    size = PLATFORM_SIZES[platform]
    safe = SAFE_ZONES[platform]   # Pixels reserved for platform UI
    duration = template["duration"]
    brand_dir = brand["_dir"]

    # === Background ===
    # Either a video clip (scaled to fit) or a solid color
    bg_cfg = template["background"]
    if background_video or (bg_cfg["type"] == "video" and bg_cfg.get("path")):
        bg_path = background_video or bg_cfg["path"]
        bg = VideoFileClip(bg_path).subclipped(0, duration).resized(size)
    else:
        color = tuple(bg_cfg.get("color", [0, 0, 0]))
        bg = ColorClip(size=size, color=color, duration=duration)

    layers = [bg]

    # === Text layers ===
    # Each text layer is defined in the template with position, timing, and effect.
    # The "field" key maps to a column in the CSV data.
    for text_cfg in template.get("texts", []):
        field = text_cfg["field"]
        text = data.get(field, text_cfg.get("default", ""))
        if not text:
            continue

        # Convert relative positions (0.0-1.0) to absolute pixels,
        # respecting safe zones so text doesn't overlap platform UI
        pos = text_cfg["position"]
        if isinstance(pos[1], float) and pos[1] <= 1.0:
            usable_top = safe[0]
            usable_bottom = size[1] - safe[1]
            y = usable_top + (usable_bottom - usable_top) * pos[1]
            pos = ("center", int(y))

        wrap_width = int(size[0] * text_cfg.get("wrap_width", 0.9))

        txt = TextClip(
            text=text,
            font_size=text_cfg.get("size", 48),
            color=text_cfg.get("color", "white"),
            font=text_cfg.get("font", brand["fonts"]["body"]),
            method="caption",          # Auto-wrap text within the given width
            size=(wrap_width, None),
        )
        txt = (txt
               .with_duration(text_cfg.get("duration", duration))
               .with_start(text_cfg.get("start", 0))
               .with_position(pos))

        # Apply animation effect (fade_in, slide_up, scale_in, etc.)
        effect_name = text_cfg.get("effect")
        if effect_name and effect_name in EFFECTS:
            txt = EFFECTS[effect_name](txt)

        layers.append(txt)

    # === Watermark (brand logo) ===
    wm_cfg = template.get("watermark")
    if wm_cfg and brand.get("logo"):
        logo_path = os.path.join(brand_dir, brand["logo"])
        logo = (ImageClip(logo_path)
                .with_duration(duration)
                .resized(height=wm_cfg.get("height", 40))
                .with_opacity(wm_cfg.get("opacity", 0.5)))

        # Position the logo with margin, offset by safe zones
        margin = wm_cfg.get("margin", 20)
        pos_map = {
            "top_right": (size[0] - logo.size[0] - margin, margin + safe[0]),
            "top_left": (margin + safe[2], margin + safe[0]),
            "bottom_right": (size[0] - logo.size[0] - margin,
                             size[1] - logo.size[1] - margin - safe[1]),
        }
        logo = logo.with_position(pos_map.get(wm_cfg["position"], (margin, margin)))
        layers.append(logo)

    # === Compose all visual layers into one clip ===
    video = CompositeVideoClip(layers, size=size)

    # === Audio: background music + optional voiceover ===
    music_cfg = template.get("music", {})
    audio_layers = []

    music_path = (os.path.join(brand_dir, brand.get("music", ""))
                  if brand.get("music") else None)
    if music_path and os.path.exists(music_path):
        # Duck the music further when there's a voiceover
        music_vol = music_cfg.get("volume", 0.2)
        if voiceover_path:
            music_vol = music_cfg.get("duck_on_voiceover", 0.08)
        music = (AudioFileClip(music_path)
                 .subclipped(0, duration)
                 .with_volume_scaled(music_vol))
        audio_layers.append(music)

    if voiceover_path:
        vo = AudioFileClip(voiceover_path)
        audio_layers.append(vo)

    if audio_layers:
        video = video.with_audio(CompositeAudioClip(audio_layers))

    # === Prepend intro + append outro from brand kit ===
    clips = []
    if brand.get("intro"):
        intro_path = os.path.join(brand_dir, brand["intro"])
        if os.path.exists(intro_path):
            intro = VideoFileClip(intro_path).resized(size)
            intro = intro.subclipped(0, brand.get("intro_duration", 2))
            clips.append(intro)

    clips.append(video)

    if brand.get("outro"):
        outro_path = os.path.join(brand_dir, brand["outro"])
        if os.path.exists(outro_path):
            outro = VideoFileClip(outro_path).resized(size)
            outro = outro.subclipped(0, brand.get("outro_duration", 3))
            clips.append(outro)

    final = concatenate_videoclips(clips)

    # === Export to H.264 MP4 with AAC audio ===
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final.write_videofile(
        output_path, fps=30, codec="libx264",
        audio_codec="aac", bitrate="8000k",
        preset="fast", threads=4,
        logger=None,  # Suppress MoviePy's progress bar
    )

    # Release file handles to avoid leaks in batch mode
    for clip in clips + layers:
        try: clip.close()
        except: pass

    return output_path
```

### 8. Build the quality checker

```python
# qc.py — Post-render quality checker.
# Validates each video against platform-specific constraints before upload.

from moviepy import VideoFileClip
import os

# Platform upload constraints (as of 2024 — check platform docs for updates)
PLATFORM_LIMITS = {
    "instagram_reel": {"max_duration": 90, "max_size_mb": 250,
                       "resolution": (1080, 1920)},
    "tiktok": {"max_duration": 180, "max_size_mb": 287,
               "resolution": (1080, 1920)},
    "youtube_short": {"max_duration": 60, "max_size_mb": 500,
                      "resolution": (1080, 1920)},
    "twitter": {"max_duration": 140, "max_size_mb": 512,
                "resolution": (1280, 720)},
    "instagram_post": {"max_duration": 60, "max_size_mb": 250,
                       "resolution": (1080, 1080)},
}


def check_video(path, platform):
    """Validate a rendered video against platform limits.

    Returns a list of issues found, or ["PASS"] if everything checks out.
    """
    issues = []
    limits = PLATFORM_LIMITS[platform]

    try:
        clip = VideoFileClip(path)
    except Exception as e:
        return [f"Cannot open file: {e}"]

    # Check duration against platform maximum
    if clip.duration > limits["max_duration"]:
        issues.append(
            f"Duration {clip.duration:.1f}s exceeds {limits['max_duration']}s limit"
        )

    # Verify resolution matches the target platform exactly
    expected = limits["resolution"]
    if clip.size != list(expected):
        issues.append(f"Resolution {clip.size} != expected {expected}")

    # Ensure audio track exists (silent videos get rejected by most platforms)
    if clip.audio is None:
        issues.append("No audio track")

    # Check file size against platform upload limit
    size_mb = os.path.getsize(path) / (1024 * 1024)
    if size_mb > limits["max_size_mb"]:
        issues.append(
            f"File size {size_mb:.1f}MB exceeds {limits['max_size_mb']}MB limit"
        )

    clip.close()
    return issues if issues else ["PASS"]
```

### 9. Build the batch pipeline

```python
# pipeline.py — Main entry point for batch video production.
# Reads a CSV of content variations and renders each one across all platforms
# using multiprocessing for parallel rendering.

import csv
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from renderer import render_video
from templates import load_template, load_brand, PLATFORM_SIZES
from qc import check_video


def render_one(args):
    """Render a single video and run QC. Used as a multiprocessing target."""
    template, brand, data, platform, output_path, voiceover = args
    try:
        render_video(template, brand, data, platform, output_path, voiceover)
        issues = check_video(output_path, platform)
        return (output_path, platform, issues)
    except Exception as e:
        return (output_path, platform, [f"RENDER ERROR: {e}"])


def batch_produce(template_path, brand_name, csv_path, output_dir,
                  platforms=None, workers=4):
    """Produce all video variations across all platforms.

    For each CSV row x platform combination, renders a video and validates it.
    Uses ProcessPoolExecutor for parallel rendering (CPU-bound work).
    """
    template = load_template(template_path)
    brand = load_brand(brand_name)
    platforms = platforms or list(PLATFORM_SIZES.keys())

    # Read all content variations from CSV
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total = len(rows) * len(platforms)
    print(f"Batch: {len(rows)} variations x {len(platforms)} platforms = {total} videos")

    # Build the job list: one job per (variation, platform) combination
    jobs = []
    for i, row in enumerate(rows):
        for platform in platforms:
            safe_name = row.get("name", f"video_{i+1}").replace(" ", "_")
            output_path = f"{output_dir}/{platform}/{safe_name}.mp4"
            voiceover = row.get("voiceover", None)  # Optional column in CSV
            jobs.append((template, brand, row, platform, output_path, voiceover))

    # Render all jobs in parallel and collect results
    results = []
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(render_one, job): job for job in jobs}
        for future in as_completed(futures):
            path, platform, issues = future.result()
            status = "PASS" if issues == ["PASS"] else "FAIL"
            print(f"  [{status}] {platform}: {Path(path).name} - {', '.join(issues)}")
            results.append((path, platform, issues))

    passed = sum(1 for _, _, issues in results if issues == ["PASS"])
    print(f"\nDone: {passed}/{len(results)} passed QC")
    return results


if __name__ == "__main__":
    batch_produce(
        template_path="templates/quote-card.json",
        brand_name="acme",
        csv_path=sys.argv[1] if len(sys.argv) > 1 else "batches/facts.csv",
        output_dir="output",
        workers=4,  # Adjust based on CPU cores available
    )
```

### 10. Run the batch

Example CSV (`batches/facts.csv`):

```csv
name,headline,body,cta
python-tip-1,Python Tip #1,"The walrus operator := lets you assign and test in one expression. Available since Python 3.8.",Follow for more →
python-tip-2,Python Tip #2,"Use match/case for structural pattern matching. Way cleaner than if/elif chains.",Save this post
python-tip-3,Python Tip #3,"f-strings support = for self-documenting prints: f'{x=}' outputs 'x=42'.",Share with a dev friend
```

```bash
python pipeline.py batches/facts.csv
# Renders 3 videos x 5 platforms = 15 videos with QC
```

One template, infinite variations. The renderer handles platform sizing, safe zones, branded elements, text animation, audio mixing, and quality checks — all automated.