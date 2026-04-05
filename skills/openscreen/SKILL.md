---
name: openscreen
description: >-
  Create stunning screen recordings and product demos with OpenScreen — open-source, no
  watermarks, free for commercial use. Use when: recording product demos, creating tutorial
  videos, building marketing content, screen recording with post-processing effects.
license: MIT
compatibility: "macOS, Windows, Linux"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["screen-recording", "demo", "video", "marketing", "open-source"]
---

# OpenScreen

## Overview

Open-source screen recording app for creating beautiful product demos and walkthroughs. A free alternative to Screen Studio — no watermarks, no subscriptions, MIT licensed for personal and commercial use.

**Repository:** [siddharthvaddem/openscreen](https://github.com/siddharthvaddem/openscreen)

OpenScreen captures your screen and applies post-processing effects (zoom, cursor highlighting, backgrounds, motion blur) to produce polished demo videos — the kind you'd normally need Screen Studio ($29/month) or a video editor to create.

### Key Differentiators

- **Free forever** — MIT license, no usage limits, no watermarks
- **Post-processing effects** — automatic/manual zooms, motion blur, custom backgrounds
- **Cross-platform** — macOS, Windows, Linux
- **Built with Electron** — React + TypeScript + PixiJS for rendering

## Instructions

### Installation

#### macOS

Download from [GitHub Releases](https://github.com/siddharthvaddem/openscreen/releases).

If macOS Gatekeeper blocks the app:

```bash
# Remove quarantine attribute
xattr -rd com.apple.quarantine /Applications/Openscreen.app
```

Then grant permissions in **System Settings → Privacy & Security** for:
- Screen Recording
- Accessibility

#### Linux

```bash
# Download the AppImage
chmod +x Openscreen-Linux-*.AppImage
./Openscreen-Linux-*.AppImage

# If sandbox error occurs:
./Openscreen-Linux-*.AppImage --no-sandbox
```

Requires PipeWire for system audio capture (default on Ubuntu 22.04+, Fedora 34+).

#### Windows

Download and run the installer from GitHub Releases. System audio works out of the box.

### Core Features

#### Screen Capture
- **Full screen** or **specific window** recording
- **Microphone audio** and **system audio** capture simultaneously
- Region cropping to hide unwanted areas

#### Zoom Effects
- **Automatic zooms** — follows cursor clicks and interactions
- **Manual zooms** — place zooms at specific timestamps
- **Customizable depth** — control how far each zoom goes
- **Duration & position** — fine-tune timing and focal point

#### Post-Processing
- **Motion blur** — smoother pan and zoom transitions
- **Background options** — wallpapers, solid colors, gradients, or custom images
- **Annotations** — add text, arrows, and images on top of recordings
- **Speed control** — vary playback speed at different segments
- **Trimming** — cut out unwanted sections

#### Export
- Multiple **aspect ratios** — 16:9, 9:16 (vertical), 1:1 (square)
- Multiple **resolutions** — from 720p to 4K
- Optimized compression for web or social media

## Examples

### Example 1: Recording a Product Demo

**User request:** "Record a polished product demo for our landing page."

**Steps:**
1. Close unnecessary apps and notifications
2. Set display to 1920×1080, open the app to demo
3. Launch OpenScreen, select capture source (full screen or window)
4. Enable microphone for narration, choose gradient background
5. Record — walk through the demo naturally, clicking and interacting
6. Review auto-generated zoom keyframes, adjust depth and timing
7. Add manual zooms for key moments, set motion blur intensity
8. Trim dead time, export at 16:9 1080p for web

### Example 2: Creating Social Media Content

**User request:** "Create a short vertical video showing our new feature."

**Steps:**
1. Set up recording focused on the specific feature area
2. Record a concise walkthrough (30-60 seconds)
3. In post-processing, add text annotations highlighting key moments
4. Set aspect ratio to 9:16 (vertical) for Instagram/TikTok
5. Increase speed on setup steps, slow down on the key interaction
6. Export with optimized compression for social media

## Guidelines

- Use a clean desktop — hide dock/taskbar icons you don't need
- Increase cursor size — makes zooms look cleaner
- Move deliberately — slow, purposeful mouse movements record better
- Use gradient backgrounds — they look professional with minimal effort
- Record at 60fps — smoother playback, especially with zoom effects
- Export twice — once for web (compressed, 1080p) and once for presentations (higher quality)
- Beta software — expect occasional bugs; no webcam overlay yet
- No CLI currently — GUI-only application
