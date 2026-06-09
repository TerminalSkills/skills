---
title: "Automate Product Launch Videos from HTML in CI"
slug: automate-product-videos-from-html
description: "Turn versioned HTML compositions into deterministic MP4 launch videos with HyperFrames, render them in CI on every release, and post-process the output with FFmpeg — no editor, no manual export, no per-render fees."
skills: [hyperframes, ffmpeg]
category: content
tags: [video, html, ffmpeg, ci-cd, automation, launch]
---

# Automate Product Launch Videos from HTML in CI

Every release needs a video — a 15-second launch clip for social, an animated changelog, a feature teaser. Today that means opening After Effects or a web editor, hand-animating the new copy, exporting, and uploading. It takes a designer an afternoon, it can't be diffed in a pull request, and the output drifts every time someone re-exports. You want video to be **code**: edit an HTML file, open a PR, and have CI render the exact same MP4 every time.

## The Persona

You're a founder/engineer at a SaaS shipping weekly. Marketing wants a launch video for each release, but there's no designer on call and no budget for one per release. You already write release notes in markdown and ship from GitHub Actions. Your goal: make a "launch video" a checked-in artifact that regenerates deterministically whenever the copy changes.

## What You'll Build

- **An HTML composition** — the video defined as a plain `index.html` with `data-*` timing, versioned in git
- **A local preview loop** — iterate on copy and animation with live reload
- **A deterministic render** — same input → byte-identical MP4, so PRs produce reviewable diffs
- **A CI render job** — GitHub Actions renders the MP4 on every tagged release
- **An FFmpeg post step** — derive a square social cut, a GIF preview, and a poster thumbnail from the master render

## The Solution

HyperFrames renders HTML + CSS + seekable animations to MP4 by seeking each frame in headless Chrome and encoding with FFmpeg — so the result is deterministic and CI-friendly (the CLI is non-interactive by default). FFmpeg then reshapes the single master render into every aspect ratio and format you need. The video lives next to your code, reviewed like any other change.

## Step-by-Step Walkthrough

### 1. Scaffold the project

```bash
npx hyperframes init launch-video
cd launch-video
```

### 2. Author the composition

Edit `index.html` — the stage declares the canvas; each element declares when it appears (`data-start`) and for how long (`data-duration`), in seconds. Bind animation progress to the timeline so seeks reproduce exactly.

```html
<div id="stage" data-composition-id="release-2-4"
     data-start="0" data-width="1920" data-height="1080">
  <video data-start="0" data-duration="8" src="assets/screencast.mp4"></video>
  <h1 id="headline" data-start="1" data-duration="5">v2.4 — Realtime Collaboration</h1>
  <p  id="sub"      data-start="2" data-duration="4">Comment, mention, resolve — live.</p>
  <audio data-start="0" data-duration="8" data-volume="0.7" src="assets/bed.wav"></audio>

  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.from("#headline", { y: 60, opacity: 0, duration: 1 })
      .from("#sub", { opacity: 0, duration: 1 }, "-=0.5");
    window.__seek = (t) => tl.seek(t);   // engine calls this per frame
  </script>
</div>
```

### 3. Preview while editing

```bash
npx hyperframes preview     # live reload — tune copy and timing
npx hyperframes inspect     # confirm: release-2-4, 8s, 1920x1080
```

### 4. Pull in a catalog block (optional)

Don't hand-roll a transition or a stat counter — install a maintained, seekable one:

```bash
npx hyperframes add flash-through-white
npx hyperframes add data-chart
```

### 5. Lint, then render

```bash
npx hyperframes lint        # catch timing/structure errors cheaply
npx hyperframes render      # → out/release-2-4.mp4 (deterministic)
```

### 6. Post-process with FFmpeg

Derive every delivery format from the one master render:

```bash
# 1:1 square cut for Instagram/X, center-cropped
ffmpeg -i out/release-2-4.mp4 -vf "crop=1080:1080:420:0" -c:a copy out/release-2-4-square.mp4

# Lightweight looping GIF preview for the changelog page
ffmpeg -i out/release-2-4.mp4 -vf "fps=12,scale=640:-1:flags=lanczos" out/release-2-4.gif

# Poster frame at t=2s for the email thumbnail
ffmpeg -ss 2 -i out/release-2-4.mp4 -frames:v 1 out/release-2-4-poster.jpg
```

### 7. Render on every release in CI

```yaml
# .github/workflows/launch-video.yml
name: Render launch video
on:
  push:
    tags: ["v*"]
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - run: sudo apt-get update && sudo apt-get install -y ffmpeg
      - working-directory: launch-video
        run: |
          npx hyperframes lint
          npx hyperframes render
          ffmpeg -i out/release-2-4.mp4 -vf "crop=1080:1080:420:0" -c:a copy out/square.mp4
      - uses: actions/upload-artifact@v4
        with:
          name: launch-video
          path: launch-video/out/*.mp4
```

Because the render is deterministic, the artifact only changes when the composition changes — so a reviewer can trust the diff, and re-running the job never produces a subtly different file.

## Real-World Example

A 4-person dev tools startup ships `v2.4` with realtime collaboration. The PM edits two lines of copy in `index.html` and bumps `data-composition-id` to `release-2-4`, then opens a PR. CI lints and renders `release-2-4.mp4` (1920×1080, 8s) plus a 1080×1080 square cut and a poster JPG, and attaches them as build artifacts. The reviewer scrubs the preview, approves, and tags `v2.4`. The video pipeline runs unattended — total human time was the two-line copy edit, versus the half-day an editor-based export used to take, and the same tag always reproduces the same MP4.

## Related Skills

- **[hyperframes](/skills/hyperframes)** — render deterministic MP4 video from HTML, CSS, and seekable animations (GSAP, Lottie, Three.js, WAAPI)
- **[ffmpeg](/skills/ffmpeg)** — transcode, crop, and reshape the master render into every aspect ratio, GIF, and poster frame you ship
