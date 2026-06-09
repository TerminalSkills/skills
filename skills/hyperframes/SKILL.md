---
name: hyperframes
description: >-
  Generate deterministic MP4 videos from HTML, CSS, media, and seekable animations using
  HeyGen's HyperFrames framework. Use when someone asks to "render HTML to video", "make a
  video with HyperFrames", "create a programmatic video", "turn an animation into MP4",
  "build a launch/product video from HTML", "render GSAP/Lottie/Three.js to video", or set up
  an agent-driven video pipeline. Covers init/preview/render/add/lint/inspect commands,
  data-* timing attributes, animation adapters, and the component catalog.
license: Apache-2.0
compatibility: "Node.js 22+, FFmpeg, headless Chrome (Chromium). macOS, Linux, Windows."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: ["video", "html", "ffmpeg", "animation", "rendering"]
---

# HyperFrames

## Overview

HyperFrames is an open-source (Apache-2.0) framework from HeyGen that turns HTML, CSS, media,
and animations into **deterministic** MP4 videos — identical input always produces identical
output. It parses HTML compositions annotated with `data-*` timing attributes, drives headless
Chrome to seek and capture each frame, and encodes the result with FFmpeg. There is no build
step, no React requirement, and no per-render fee. It is designed to be agent-friendly: the CLI
is non-interactive by default, so it slots cleanly into automated content pipelines.

Use this skill to scaffold projects, author HTML compositions, preview them with live reload,
and render frame-accurate video — including animations driven by GSAP, CSS, Lottie, Three.js,
Anime.js, or the Web Animations API.

## Instructions

### Prerequisites

Confirm the environment before starting:
- **Node.js 22+** (`node --version`)
- **FFmpeg** on PATH (`ffmpeg -version`)
- Headless Chrome/Chromium is downloaded by the engine on first run.

### Scaffolding a project

```bash
npx hyperframes init my-video    # scaffold a project (creates index.html + package.json)
cd my-video
```

For agent-managed setup inside an existing AI-agent workspace, the skill can be installed with
`npx skills add heygen-com/hyperframes`.

### Authoring a composition

Compositions are plain `index.html` files. A root stage element declares the canvas and
composition id; child elements declare when they appear and how long they last via `data-*`
attributes. Time values are in **seconds**.

| Attribute | Purpose |
|-----------|---------|
| `data-composition-id` | Names the composition (target for render/inspect) |
| `data-start` | When the element enters the timeline (seconds) |
| `data-duration` | How long the element stays on the timeline (seconds) |
| `data-width` / `data-height` | Canvas dimensions in pixels (on the stage element) |
| `data-track-index` | Layer/track ordering for stacked audio or video |
| `data-volume` | Audio level, `0.0`–`1.0` |

### Previewing and rendering

```bash
npx hyperframes preview          # browser preview with live reload while authoring
npx hyperframes render           # seek every frame in headless Chrome, encode to MP4 via FFmpeg
npx hyperframes lint             # validate composition structure before rendering
npx hyperframes inspect          # print composition metadata (duration, tracks, dimensions)
```

Resolution comes from `data-width`/`data-height` on the stage; frame rate, output path, and
codec are render parameters (check `npx hyperframes render --help` for the exact flags in your
installed version, as flag names evolve). Because output is deterministic, re-rendering
unchanged input is safe to cache.

### Using the component catalog

Pre-built blocks (transitions, overlays, captions, animated charts, maps, effects) install into
the project:

```bash
npx hyperframes add flash-through-white   # a transition
npx hyperframes add data-chart            # an animated chart block
npx hyperframes add instagram-follow      # a social overlay
```

Browse the full catalog at `hyperframes.heygen.com/catalog`, then `add` blocks by name.

### Animations

Any **seekable, frame-accurate** animation works because the engine seeks each timeline position
deterministically rather than recording in real time. Supported adapters: **GSAP**, **CSS
animations**, **Lottie**, **Three.js**, **Anime.js**, **WAAPI**, and custom frame adapters.
Avoid time-based randomness or `Date.now()`/wall-clock driven motion — bind animation progress to
the composition timeline so seeks are reproducible.

### Agent / CI pipelines

The CLI is non-interactive, so a typical automated flow is: generate/template the HTML →
`hyperframes lint` → `hyperframes render` → collect the MP4. For scale, the
`@hyperframes/aws-lambda` package enables distributed rendering across Lambda.

## Examples

### Example 1: Render a product-launch composition

`index.html`:

```html
<div id="stage" data-composition-id="launch"
     data-start="0" data-width="1920" data-height="1080">
  <video data-start="0" data-duration="6" src="intro.mp4"></video>
  <h1 id="title" data-start="1" data-duration="4">Launch day</h1>
  <audio data-start="0" data-duration="6" data-volume="0.8" src="music.wav"></audio>
</div>
```

```bash
npx hyperframes inspect            # confirms: launch, 6s, 1920x1080
npx hyperframes lint               # validate before spending render time
npx hyperframes render             # produces a 1080p MP4
```

### Example 2: A seekable GSAP title animation

```html
<div id="stage" data-composition-id="title-card"
     data-start="0" data-width="1080" data-height="1080">
  <h1 id="headline" data-start="0" data-duration="3">Q3 Results</h1>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    // Bind progress to the timeline (paused tween the engine seeks), not real time.
    const tl = gsap.timeline({ paused: true });
    tl.from("#headline", { y: 80, opacity: 0, duration: 1 })
      .to("#headline", { scale: 1.05, duration: 2 });
    window.__seek = (t) => tl.seek(t);   // engine calls this per frame
  </script>
</div>
```

```bash
npx hyperframes preview            # iterate live, then:
npx hyperframes render
```

## Guidelines

- **Determinism first.** Bind all motion to the composition timeline. Avoid `Math.random()`,
  `Date.now()`, real-time loops, or network calls during render — they break reproducibility.
- **Lint before you render.** `hyperframes lint` catches structural/timing mistakes cheaply;
  rendering is the expensive step.
- **Set canvas on the stage.** `data-width`/`data-height` live on the root composition element;
  child timing (`data-start`/`data-duration`) lives on each element, in seconds.
- **Verify the toolchain.** Most failures trace back to missing FFmpeg or Node < 22, or a
  Chromium download blocked by a firewall.
- **Use `--help` for exact flags.** `render`/`add` options vary by version; confirm fps/output/
  codec flags against the installed CLI rather than assuming.
- **Prefer catalog blocks.** `hyperframes add` pulls maintained, seekable components instead of
  hand-rolling transitions and charts.
- **Scale with Lambda.** For batch/large jobs, render via `@hyperframes/aws-lambda` rather than
  one long local job.
- **Keep media local and committed.** Reference assets by stable paths; remote fetches during
  render undermine determinism and reproducibility.
