---
title: Automate Social Media Video Production
slug: automate-social-media-video-production
description: "Build a Python pipeline that batch-produces branded short-form videos for Instagram, TikTok, YouTube Shorts, and Twitter from JSON templates and CSV data using MoviePy."
skills: [ffmpeg]
category: content
tags: [moviepy, ffmpeg, video, social-media, automation, batch-processing]
---

# Automate Social Media Video Production

## The Problem

Sami runs a content agency that produces 50+ short videos per week for clients across Instagram, TikTok, YouTube Shorts, and Twitter. Each video follows a template — background clip, text overlays, branded intro/outro, music, and platform-specific sizing. The team manually edits each one in Premiere Pro, which takes 30-45 minutes per video. That's 25-37 hours of editing per week for content that's structurally identical.

The real pain is platform variations. A single "Python Tip" video needs five exports: 9:16 for Reels, TikTok, and YouTube Shorts, 16:9 for Twitter, 1:1 for Instagram posts. Each platform has different safe zones where UI elements cover the content — TikTok's bottom bar is 400 pixels tall, and text placed there is unreadable. Multiply 50 content pieces by 5 platforms and you're looking at 250 renders per week.

Sami wants a Python pipeline that takes a JSON template and a CSV of content, then outputs ready-to-post videos in under a minute each.

## The Solution

Using the **ffmpeg** skill with MoviePy, build a template-driven video renderer. JSON defines the layout (text layers, timing, animations), a brand kit provides client-specific assets (logo, intro, outro, fonts), and a CSV feeds content variations. The pipeline renders all combinations across all platform sizes using multiprocessing, then validates each output against platform upload limits.

## Step-by-Step Walkthrough

### Step 1: Platform Specs and Template System

Every platform has specific resolution requirements and safe zones — areas covered by UI elements where text shouldn't appear. These go into a central config:

```python
# templates.py
PLATFORM_SIZES = {
    "instagram_reel": (1080, 1920),   # 9:16 vertical
    "tiktok": (1080, 1920),           # 9:16 vertical
    "youtube_short": (1080, 1920),    # 9:16 vertical
    "twitter": (1280, 720),           # 16:9 landscape
    "instagram_post": (1080, 1080),   # 1:1 square
}

# Safe zones: (top, bottom, left, right) in pixels
# Text placed in these areas gets covered by platform UI
SAFE_ZONES = {
    "instagram_reel": (200, 350, 40, 40),
    "tiktok": (150, 400, 40, 40),       # Tallest bottom bar of any platform
    "youtube_short": (150, 300, 40, 40),
    "twitter": (0, 0, 0, 0),            # Landscape — no overlays
    "instagram_post": (0, 100, 0, 0),
}
```

Video templates are JSON files that define everything about a video's layout. Each text layer maps a `field` name to a CSV column, so the same template renders different content per row:

```json
{
  "name": "Quote Card",
  "duration": 15,
  "background": { "type": "color", "color": [15, 23, 42] },
  "texts": [
    {
      "field": "headline", "default": "Did You Know?",
      "size": 64, "color": "white", "font": "Arial-Bold",
      "position": ["center", 0.3], "start": 0.5, "duration": 4,
      "effect": "scale_in"
    },
    {
      "field": "body", "size": 42, "color": "#94a3b8",
      "position": ["center", 0.5], "start": 1.5, "duration": 10,
      "effect": "fade_in", "wrap_width": 0.85
    },
    {
      "field": "cta", "default": "Follow for more",
      "size": 36, "color": "#38bdf8", "font": "Arial-Bold",
      "position": ["center", 0.75], "start": 8, "duration": 7,
      "effect": "slide_up"
    }
  ],
  "music": { "volume": 0.2, "duck_on_voiceover": 0.08, "fade_in": 1, "fade_out": 2 },
  "watermark": { "position": "top_right", "opacity": 0.5, "height": 40, "margin": 20 }
}
```

### Step 2: Text Animation Effects

Four reusable text effects, each taking a MoviePy TextClip and returning a modified clip. Templates reference them by name:

```python
# effects.py
from moviepy import TextClip

def fade_in_text(text_clip, duration=0.5):
    return text_clip.crossfadein(duration)

def slide_up_text(text_clip, distance=100, duration=0.5):
    final_pos = text_clip.pos
    final_y = final_pos[1] if isinstance(final_pos, tuple) else 0
    def position_func(t):
        progress = min(t / duration, 1.0)
        progress = 1 - (1 - progress) ** 3  # Ease-out cubic
        x = final_pos[0] if isinstance(final_pos, tuple) else "center"
        return (x, final_y + distance * (1 - progress))
    return text_clip.with_position(position_func)

def scale_in_text(text_clip, duration=0.5):
    def resize_func(t):
        if t < duration:
            progress = 1 - (1 - t / duration) ** 3
            return max(progress, 0.01)
        return 1.0
    return text_clip.resized(resize_func)

EFFECTS = { "fade_in": fade_in_text, "slide_up": slide_up_text, "scale_in": scale_in_text }
```

### Step 3: The Core Rendering Engine

The renderer takes a template, brand kit, CSV data row, and target platform, then composites everything into a finished video. The key trick is converting relative positions (0.0-1.0) to absolute pixels while respecting safe zones:

```python
# renderer.py
from moviepy import *
from effects import EFFECTS
from templates import PLATFORM_SIZES, SAFE_ZONES

def render_video(template, brand, data, platform, output_path, voiceover_path=None):
    size = PLATFORM_SIZES[platform]
    safe = SAFE_ZONES[platform]
    duration = template["duration"]

    # Background: video clip or solid color
    bg_cfg = template["background"]
    if bg_cfg["type"] == "video":
        bg = VideoFileClip(bg_cfg["path"]).subclipped(0, duration).resized(size)
    else:
        bg = ColorClip(size=size, color=tuple(bg_cfg["color"]), duration=duration)

    layers = [bg]

    # Text layers — each mapped to a CSV column via the "field" key
    for text_cfg in template.get("texts", []):
        text = data.get(text_cfg["field"], text_cfg.get("default", ""))
        if not text: continue

        # Convert relative Y positions to absolute pixels within safe zones
        pos = text_cfg["position"]
        if isinstance(pos[1], float) and pos[1] <= 1.0:
            usable_top, usable_bottom = safe[0], size[1] - safe[1]
            y = usable_top + (usable_bottom - usable_top) * pos[1]
            pos = ("center", int(y))

        txt = TextClip(text=text, font_size=text_cfg.get("size", 48),
                       color=text_cfg.get("color", "white"),
                       method="caption", size=(int(size[0] * text_cfg.get("wrap_width", 0.9)), None))
        txt = txt.with_duration(text_cfg.get("duration", duration)).with_start(text_cfg.get("start", 0)).with_position(pos)

        effect_name = text_cfg.get("effect")
        if effect_name and effect_name in EFFECTS:
            txt = EFFECTS[effect_name](txt)
        layers.append(txt)

    # Watermark, audio mixing, intro/outro from brand kit
    video = CompositeVideoClip(layers, size=size)

    # Prepend branded intro, append outro, export H.264 MP4
    clips = []
    if brand.get("intro"): clips.append(VideoFileClip(brand["intro"]).resized(size))
    clips.append(video)
    if brand.get("outro"): clips.append(VideoFileClip(brand["outro"]).resized(size))

    final = concatenate_videoclips(clips)
    final.write_videofile(output_path, fps=30, codec="libx264", audio_codec="aac",
                          bitrate="8000k", preset="fast", threads=4, logger=None)
```

### Step 4: Quality Checker

Every rendered video passes through a quality gate that validates duration, resolution, audio track presence, and file size against platform-specific limits:

```python
# qc.py
PLATFORM_LIMITS = {
    "instagram_reel": {"max_duration": 90, "max_size_mb": 250, "resolution": (1080, 1920)},
    "tiktok":         {"max_duration": 180, "max_size_mb": 287, "resolution": (1080, 1920)},
    "youtube_short":  {"max_duration": 60,  "max_size_mb": 500, "resolution": (1080, 1920)},
    "twitter":        {"max_duration": 140, "max_size_mb": 512, "resolution": (1280, 720)},
    "instagram_post": {"max_duration": 60,  "max_size_mb": 250, "resolution": (1080, 1080)},
}

def check_video(path, platform):
    issues = []
    limits = PLATFORM_LIMITS[platform]
    clip = VideoFileClip(path)

    if clip.duration > limits["max_duration"]:
        issues.append(f"Duration {clip.duration:.1f}s exceeds {limits['max_duration']}s")
    if clip.size != list(limits["resolution"]):
        issues.append(f"Resolution {clip.size} != {limits['resolution']}")
    if clip.audio is None:
        issues.append("No audio track — most platforms reject silent videos")
    if os.path.getsize(path) / (1024*1024) > limits["max_size_mb"]:
        issues.append(f"File too large for {platform}")

    clip.close()
    return issues if issues else ["PASS"]
```

### Step 5: Batch Pipeline with Multiprocessing

The entry point reads a CSV where each row is a content variation, then renders every row across every platform using `ProcessPoolExecutor` for parallel rendering:

```python
# pipeline.py
from concurrent.futures import ProcessPoolExecutor, as_completed

def batch_produce(template_path, brand_name, csv_path, output_dir, platforms=None, workers=4):
    template = load_template(template_path)
    brand = load_brand(brand_name)
    platforms = platforms or list(PLATFORM_SIZES.keys())

    with open(csv_path) as f:
        rows = list(csv.DictReader(f))

    total = len(rows) * len(platforms)
    print(f"Batch: {len(rows)} variations x {len(platforms)} platforms = {total} videos")

    jobs = []
    for i, row in enumerate(rows):
        for platform in platforms:
            name = row.get("name", f"video_{i+1}").replace(" ", "_")
            jobs.append((template, brand, row, platform, f"{output_dir}/{platform}/{name}.mp4"))

    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(render_and_check, job): job for job in jobs}
        for future in as_completed(futures):
            path, platform, issues = future.result()
            status = "PASS" if issues == ["PASS"] else "FAIL"
            print(f"  [{status}] {platform}: {Path(path).name}")
```

Feed it a CSV like this:

```csv
name,headline,body,cta
python-tip-1,Python Tip #1,"The walrus operator := lets you assign and test in one expression.",Follow for more
python-tip-2,Python Tip #2,"Use match/case for structural pattern matching. Cleaner than if/elif chains.",Save this post
python-tip-3,Python Tip #3,"f-strings support = for self-documenting prints: f'{x=}' outputs 'x=42'.",Share with a dev friend
```

```bash
python pipeline.py batches/facts.csv
# 3 variations x 5 platforms = 15 videos rendered and validated
```

## Real-World Example

Sami runs the pipeline for the first time on a Monday with 12 content pieces for a client's "React Tips" series. The CSV has 12 rows, the template is a dark-background quote card, and the brand kit includes the client's logo, intro bumper, and signature blue accent color.

The pipeline fires up 4 workers and starts chewing through 60 videos (12 tips across 5 platforms). Each render takes about 40 seconds. In 12 minutes, all 60 videos are done and validated — 58 pass QC on the first run. Two TikTok exports fail because the body text is too long and overlaps the safe zone. A quick edit to wrap width in the template, a re-render of just those two, and everything passes.

What used to take the team 6-9 hours of manual Premiere editing per client per week now takes 12 minutes of compute time and 5 minutes of CSV preparation. Sami scales from 3 clients to 11 without hiring another editor. The agency's video output goes from 50 to 200+ per week, and the team spends their time on creative work — writing better copy, testing new templates — instead of dragging text boxes around in a timeline.
