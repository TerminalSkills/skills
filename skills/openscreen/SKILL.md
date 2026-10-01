---
name: openscreen
description: >-
  Create stunning screen recordings and product demos with OpenScreen — open-source, no
  watermarks, free for commercial use. Use when: recording product demos, creating tutorial
  videos, building marketing content, screen recording with post-processing effects.
license: MIT
compatibility: "macOS 13+, Windows 10 1903+ (x64), Linux x64 with PipeWire and xdg-desktop-portal"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: productivity
  tags: ["screen-recording", "demo", "video", "marketing", "open-source"]
  repository: https://github.com/getopenscreen/openscreen
---

# OpenScreen

## Overview

Open-source screen recording app for creating beautiful product demos and walkthroughs. A free alternative to Screen Studio — no watermarks, no account, no paid tier, MIT licensed for personal and commercial use.

**Repository:** [getopenscreen/openscreen](https://github.com/getopenscreen/openscreen) · **Docs:** [getopenscreen.com/docs](https://getopenscreen.com/docs/intro/)

The project was created by Siddharth Vaddem at `siddharthvaddem/openscreen`. That repository was archived after v1.5.0 and receives no updates; development continues at `getopenscreen/openscreen` under the same name and licence (v1.13.0, September 2026). Install from the new repository.

OpenScreen captures your screen and applies post-processing effects (zoom, cursor styling, backgrounds, motion blur, captions) to produce polished demo videos. Since the continuation it also has a command-line interface, so a script or a coding agent can record, edit the project file and render without opening the editor.

### Key Differentiators

- **Free forever** — MIT license, no usage limits, no watermarks
- **Post-processing effects** — automatic/manual zooms, motion blur, custom backgrounds, on-device captions
- **Cross-platform** — macOS, Windows, Linux, with native capture on all three
- **Scriptable** — `record`, `export`, `captions`, `sources`, `pack`, `info` subcommands with NDJSON output
- **Built with Electron** — React + TypeScript UI, a native GPU compositor for preview and export

## Instructions

### Installation

#### macOS

```bash
brew install --cask getopenscreen/openscreen/openscreen
```

Or download the `.dmg` (Apple Silicon or Intel) from [GitHub Releases](https://github.com/getopenscreen/openscreen/releases). Builds from 1.9.0 on are signed and notarized, so Gatekeeper needs no terminal workaround.

Grant **Screen Recording** and **Accessibility** in **System Settings → Privacy & Security**: Screen Recording lets it capture, Accessibility is needed for the editable cursor (shape and clicks). macOS 15 and later asks again for Screen Recording from time to time; that prompt comes from the system. Microphone recording needs macOS 15+.

#### Windows

```powershell
winget install --source msstore OpenScreen
```

The Microsoft Store package is signed and updates itself. The standalone `.exe` on the Releases page is not code-signed, so SmartScreen warns about an unknown publisher.

#### Linux

Each release publishes `.deb`, `.rpm`, `.pacman` and `.AppImage` packages (x64 only) plus `latest-linux.yml`, which lists a SHA-512 checksum for each of them. Verify before installing:

```bash
VERSION=1.13.0
BASE=https://github.com/getopenscreen/openscreen/releases/download/v$VERSION
curl -fLO $BASE/Openscreen-Linux-$VERSION.deb
curl -fLO $BASE/latest-linux.yml

# Compare the package's SHA-512 with the checksum in the release manifest
want=$(grep -A1 "url: Openscreen-Linux-$VERSION.deb" latest-linux.yml | awk '/sha512/ {print $2}')
got=$(openssl dgst -sha512 -binary Openscreen-Linux-$VERSION.deb | base64 -w0)
[ "$want" = "$got" ] && sudo apt install ./Openscreen-Linux-$VERSION.deb
```

Other packages: `sudo dnf install ./Openscreen-Linux-*.rpm`, `sudo pacman -U Openscreen-Linux-*.pacman`, or `chmod +x Openscreen-Linux-*.AppImage` and run it (add `--no-sandbox` if it stops with a sandbox error). Nix: `nix run github:getopenscreen/openscreen`.

Recording needs `xdg-desktop-portal` and PipeWire; system audio needs PipeWire as the sound server. Click effects on Wayland work only when the user is in the `input` group — that group lets every program of that user read all input devices, so add it deliberately.

### Core Features

#### Screen Capture
- **Full screen** or **specific window** recording — there is no region capture; crop each clip in the editor instead
- **Microphone audio**, **system audio** and a **webcam** track (picture-in-picture, stacked or dual-frame layouts)
- Cursor mode: **editable overlay** (default; the cursor is recorded as data and restyled later) or **system**
- On Linux the desktop's sharing dialog chooses the source on every take

#### Zoom Effects
- **Automatic zooms** — placed on the recorded clicks (toolbar wand → Automatic zooms)
- **Manual zooms** — press `Z` at the playhead
- **Six depth presets** — 1.25×, 1.5×, 1.8×, 2.2×, 3.5×, 5×
- **Focus** — manual position, or auto-follow the cursor

#### Post-Processing
- **Motion blur**, frame shadow, padding and corner roundness
- **Background options** — wallpapers, solid colors, gradients, or custom images, with optional animation
- **Annotations** — text, arrows, images and blur masks on top of recordings
- **Speed control** — per segment (`S`): presets from 0.25× to 5×, or any value from 0.1× to 100×; **trimming** (`T`)
- **Captions** — transcribed on the machine with Whisper (one-time model download of about 264 MB), burned into the video
- **AI editing assistant** — off by default; needs your own provider key and sends the timeline and transcript to that provider

#### Export
- **Formats** — MP4 (H.264; 24, 30 or 60 fps) or GIF (15–30 fps)
- **Sizes** — 720p, 1080p or Source (never upscales)
- **Aspect ratios** — Auto, Original, 16:9, 9:16, 1:1, 4:3, 4:5, 16:10, 10:16
- Save a `.openscreen` project to keep everything editable; an exported file is flat

### Command-line interface

The CLI is the app's own executable with a subcommand. On Linux packages it is `openscreen`; on macOS use `/Applications/Openscreen.app/Contents/MacOS/Openscreen`, on Windows `Openscreen.exe` in the install folder. No window opens, but a display server must be running.

```bash
openscreen help
openscreen sources --json                         # displays, windows, microphones
openscreen record --window "Invoicely" --mic --duration 30 --project demo.openscreen --json
openscreen captions demo.openscreen --min-words 2 --max-words 7
openscreen export demo.openscreen -o demo.mp4 --quality good --auto-zoom --json
openscreen export demo.openscreen -o demo.gif --gif-fps 20 --gif-size medium
openscreen info demo.openscreen --json            # exit code 1 if the video is missing
openscreen pack demo.openscreen --out bundle/     # project + media in one folder
```

| Command | Options |
|---------|---------|
| `record` | `--display <n>`, `--window <title>`, `--mic`, `--mic-device <name>`, `--system-audio`, `--cursor <editable-overlay\|system>`, `--duration <seconds>`, `--project <file.openscreen>` |
| `export` | `-o/--out <file.mp4\|.gif>`, `--format <mp4\|gif>`, `--quality <medium\|good\|source>` (720p, 1080p, source), `--gif-fps <15\|20\|25\|30>`, `--gif-size <medium\|large\|original>`, `--auto-zoom`, `--audio <file>`, `--audio-mode <mix\|replace>`, `--audio-offset <seconds>` |
| `captions` | `--min-words <n>`, `--max-words <n>` (defaults 2 and 7) |
| `sources` | `-o <file>` writes the JSON payload to a file |

With `--json`, stdout carries one JSON object per line (`started`, `progress`, `log`, `warning`, `error`, `done`); diagnostics go to stderr. Exit codes: `0` success, `1` failure, `2` bad arguments.

Stop a recording without `--duration` with Ctrl+C, SIGTERM, or by typing `stop` and Enter. A `.openscreen` project is plain JSON: `media.screenVideoPath` plus an `editor` object with `zoomRegions`, `trimRegions`, `speedRegions`, `annotationRegions`, `aspectRatio` and more, so edits can be scripted between `record` and `export`.

## Examples

### Example 1: Recording a Product Demo

**User request:** "Record a polished product demo for our landing page."

In the app: close unrelated windows and notifications, pick the window in the recording HUD, enable the microphone, record, then in the editor run Automatic zooms, add manual zooms on key moments, choose a gradient background, trim dead time and export MP4 at 1080p.

Scripted (macOS or Windows, where `--window` selects the source):

```bash
openscreen record --window "Invoicely" --mic --duration 45 --project invoicely-demo.openscreen --json
openscreen captions invoicely-demo.openscreen --json
openscreen export invoicely-demo.openscreen -o invoicely-demo.mp4 --quality good --auto-zoom --json
```

The last line of the export output reports the file:

```json
{"event":"done","success":true,"outputPath":"/Users/dana/demos/invoicely-demo.mp4","format":"mp4","width":1920,"height":1080}
```

### Example 2: Creating Social Media Content

**User request:** "Create a short vertical video showing our new feature."

Record the feature (30–60 seconds), then reshape the project for vertical video by editing its JSON: cut the login, double the speed of the setup, add a zoom and a label.

```bash
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("dark-mode.openscreen", "utf8"));
p.editor.aspectRatio = "9:16";
p.editor.trimRegions = [{ id: "trim-login", startMs: 0, endMs: 4000 }];
p.editor.speedRegions = [{ id: "speed-setup", startMs: 4000, endMs: 12000, speed: 2 }];
p.editor.zoomRegions = [{ id: "zoom-toggle", startMs: 14000, endMs: 19000, depth: 3,
  focus: { cx: 0.5, cy: 0.4 }, focusMode: "manual", source: "manual" }];
p.editor.annotationRegions = [{ id: "label-toggle", startMs: 14000, endMs: 19000,
  type: "text", content: "Dark mode in one click", textContent: "Dark mode in one click",
  position: { x: 8, y: 6 }, size: { width: 40, height: 12 },
  style: { fontSize: 32, color: "#ffffff" }, zIndex: 1 }];
fs.writeFileSync("dark-mode.openscreen", JSON.stringify(p, null, 2));
'
openscreen info dark-mode.openscreen
openscreen export dark-mode.openscreen -o dark-mode.mp4 --quality good
```

`info` prints `Export:   mp4 / good / 9:16` and `Timeline: 1 zooms, 1 trims, 1 speed regions, 1 annotations`; the export is a 1080×1920 H.264 file at 60 fps. Zoom `depth` runs from 1 to 6 (1.25× to 5×; 3 is 1.8×) and `cx`/`cy` are fractions of the frame.

## Guidelines

- Use a clean desktop — hide dock/taskbar icons you don't need
- Move deliberately — slow, purposeful mouse movements record better and give auto-zoom clear clicks to follow
- Record in the editable cursor mode — cursor size, smoothing and click effects can then be tuned in the editor
- Use gradient backgrounds — they look professional with minimal effort
- Save the `.openscreen` project before exporting; export once for web (1080p MP4) and again for other formats from the same project
- Keep a hand-written project next to its media: the app only loads media from its recordings directory or the project file's own folder
- CLI limits: no webcam option in `record`; MP4 from the CLI is always H.264 at 60 fps; captions are burned in, with no SRT/VTT output; an export cannot be cancelled except by ending the process
- Recording needs a real desktop session. On Linux the portal dialog must be answered by a person on every take, so `--display` and `--window` do not choose the source and unattended recording is not possible there; `export` works on a headless Linux machine only with a virtual display and a Vulkan driver
- Not fully offline: the app loads annotation fonts from Google Fonts at launch, checks GitHub for updates, and downloads the Whisper model once
- Under active development — the CLI and the `.openscreen` format can change in breaking ways between releases; re-check scripts after each update
- Download only from the official repository or store listings; `openscreen.io` is a different product
