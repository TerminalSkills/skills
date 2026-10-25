---
name: hyperframes
description: >-
  Generate deterministic MP4 videos from HTML, CSS, media, and seekable animations using
  HeyGen's HyperFrames framework. Use when someone asks to "render HTML to video", "make a
  video with HyperFrames", "create a programmatic video", "turn an animation into MP4",
  "build a launch/product video from HTML", "render GSAP/Lottie/Three.js to video", or set up
  an agent-driven video pipeline. Covers init/preview/render/add/lint/check commands,
  data-* timing attributes, animation adapters, and the component catalog.
license: Apache-2.0
compatibility: "Node.js 22+, FFmpeg, headless Chrome (Chromium). macOS, Linux, Windows."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  repository: https://github.com/heygen-com/hyperframes
  tags: "video, html, ffmpeg, animation, rendering"
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
| `data-composition-id` | Names the composition (target for render/check) |
| `data-start` | When the element enters the timeline (seconds) |
| `data-duration` | How long the element stays on the timeline (seconds) |
| `data-width` / `data-height` | Canvas dimensions in pixels (on the stage element) |
| `data-track-index` | Studio display lane (not a timing constraint) for stacked audio or video |
| `class="clip"` | Put on timed visible elements; the framework owns their visibility, so never tween `display`/`visibility`/`autoAlpha` on a `.clip` (animate a child) |
| `data-volume` | Audio level, `0.0`–`1.0` |

### Previewing and rendering

```bash
npx hyperframes preview          # opens Studio: a timeline editor with live reload
npx hyperframes render           # seek every frame in headless Chrome, encode to MP4 via FFmpeg
npx hyperframes lint             # validate composition structure before rendering
npx hyperframes check            # lint, then one browser pass auditing runtime errors,
                                  # failed requests, layout overflow, and contrast
npx hyperframes doctor           # verify Node/FFmpeg/Chromium toolchain
```

`inspect`/`validate` from earlier releases are deprecated aliases for `check`; use `check`.

Resolution comes from `data-width`/`data-height` on the stage. Render parameters include
`--output out.mp4` and `--quality draft|looks|delivery` (fast iteration / first real encode /
final delivery); `--docker --strict` gives a reproducible container render. Check
`npx hyperframes render --help` for the full flag list in your installed version.
Every `<audio>` needs an `id`, or the mixer ignores it and the render is silent. Because output is deterministic, re-rendering
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
`hyperframes check` (it reruns lint first) → `hyperframes render` → collect the MP4. For scale,
`npx hyperframes lambda render <project> --width 1920 --height 1080 --wait` (package
`@hyperframes/aws-lambda`) renders across AWS Lambda, and `npx hyperframes cloud render` uses
HeyGen-hosted rendering.

## Examples

### Example 1: Render a product-launch composition

`index.html`:

```html
<div id="stage" data-composition-id="launch"
     data-start="0" data-width="1920" data-height="1080">
  <video class="clip" data-start="0" data-duration="6" data-track-index="0" src="intro.mp4"></video>
  <h1 id="title" class="clip" data-start="1" data-duration="4" data-track-index="1">Launch day</h1>
  <audio id="music" data-start="0" data-duration="6" data-track-index="2" data-volume="0.8" src="music.wav"></audio>
</div>
```

```bash
npx hyperframes check              # lint, then a browser pass for runtime errors, layout, contrast
npx hyperframes render             # produces a 1080p MP4
```

### Example 2: A seekable GSAP title animation

```html
<div id="stage" data-composition-id="title-card"
     data-start="0" data-width="1080" data-height="1080">
  <h1 id="headline" class="clip" data-start="0" data-duration="3">Q3 Results</h1>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    // One paused timeline, registered under the root data-composition-id; the engine seeks it.
    const tl = gsap.timeline({ paused: true });
    tl.from("#headline", { y: 80, opacity: 0, duration: 1 })
      .to("#headline", { scale: 1.05, duration: 2 });
    window.__timelines = window.__timelines || {};
    window.__timelines["title-card"] = tl;
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
- **Check before you render.** `hyperframes lint` catches structural/timing mistakes, and
  `hyperframes check` (which reruns lint, then does one seek pass for runtime errors, failed
  requests, layout overflow, and contrast) is the final gate — rendering is the expensive step.
- **Set canvas on the stage.** `data-width`/`data-height` live on the root composition element;
  child timing (`data-start`/`data-duration`) lives on each element, in seconds.
- **Verify the toolchain.** Run `npx hyperframes doctor` first — most failures trace back to
  missing FFmpeg, Node < 22, or a Chromium download blocked by a firewall.
- **Use `--help` for exact flags.** `render`/`add` options vary by version; confirm fps/output/
  codec flags against the installed CLI rather than assuming.
- **Prefer catalog blocks.** `hyperframes add` pulls maintained, seekable components instead of
  hand-rolling transitions and charts.
- **Scale with Lambda.** For batch/large jobs, render via `@hyperframes/aws-lambda` rather than
  one long local job.
- **Keep media local and committed.** Reference assets by stable paths; remote fetches during
  render undermine determinism and reproducibility.
