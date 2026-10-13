---
name: remotion-video-toolkit
description: >-
  Programmatic video creation with React using Remotion. Use when a user asks
  to create videos with code, generate personalized videos, build animated
  data visualizations, add TikTok-style captions, render video
  programmatically, or automate video production. Supports CLI rendering,
  AWS Lambda, and Google Cloud Run deployment.
license: Apache-2.0
compatibility: "Requires a current Node.js LTS (or Bun) with the remotion packages and React; Chrome Headless Shell is downloaded on first render. Lambda needs an AWS account."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/remotion-dev/remotion
  category: automation
  tags: ["remotion", "video", "react", "animation", "rendering"]
  use-cases:
    - "Generate personalized marketing videos at scale"
    - "Create animated data visualizations as video"
    - "Add TikTok-style animated captions to videos"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Remotion Video Toolkit

## Overview

Create videos programmatically using React and Remotion. Build reusable video templates as React components, render them to MP4/WebM via CLI or cloud infrastructure, and generate personalized videos at scale. Ideal for automated social media content, animated data visualizations, and dynamic video production pipelines.

## Instructions

When a user asks to create programmatic video, determine the task:

### Task A: Set up a Remotion project

```bash
# Create a new Remotion project
npx create-video@latest my-video
cd my-video
npm run dev  # starts Remotion Studio (http://localhost:3000)
```

Project structure:
```
my-video/
  src/
    Root.tsx          # Register all compositions
    MyComposition.tsx # Your video component
  index.ts          # calls registerRoot(RemotionRoot)
  remotion.config.ts  # Render settings
```

Pick a template when prompted (Hello World is the smallest). All `remotion` and `@remotion/*` packages must be on the exact same version (no `^`), or rendering fails with a version-mismatch error. Remotion is free for individuals and for-profit companies with up to 3 employees; larger companies need a paid company license (see remotion.dev/license).

### Task B: Create a video composition

Every Remotion video is a React component that uses `useCurrentFrame()` and `useVideoConfig()`:

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface MyVideoProps {
  title: string;
  subtitle: string;
  bgColor: string;
}

export const MyVideo: React.FC<MyVideoProps> = ({ title, subtitle, bgColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animate title sliding in
  const titleY = spring({ frame, fps, from: -100, to: 0, durationInFrames: 30 });

  // Fade in subtitle after 20 frames
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ fontSize: 80, color: "white", transform: `translateY(${titleY}px)` }}>
        {title}
      </h1>
      <p style={{ fontSize: 36, color: "rgba(255,255,255,0.8)", opacity: subtitleOpacity }}>
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
```

Register the composition in `Root.tsx`:

```tsx
import { Composition } from "remotion";
import { MyVideo } from "./MyVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: "Hello World", subtitle: "Made with Remotion", bgColor: "#1a1a2e" }}
    />
  );
};
```

### Task C: Add TikTok-style animated captions

Use `@remotion/captions` (install it at the same version as `remotion`). Transcribe the audio to `Caption[]` first (for example with `@remotion/install-whisper-cpp` and its `toCaptions()`, or `@remotion/openai-whisper`), then group words into pages. Each token's `text` must keep its leading space, otherwise words merge into one page.

```tsx
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";

export const CaptionOverlay: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const { fps } = useVideoConfig();
  // fewer ms = word-by-word pages, more ms = several words per page
  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 1200,
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
      {pages.map((page) => (
        <Sequence
          key={page.startMs}
          from={Math.round((page.startMs / 1000) * fps)}
          durationInFrames={Math.max(1, Math.round((page.durationMs / 1000) * fps))}
        >
          <div style={{ fontSize: 64, fontWeight: "bold", color: "white", whiteSpace: "pre" }}>
            {page.text}
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
```

Each page also has `tokens` with `fromMs`/`toMs`, which lets you highlight the word being spoken.

### Task D: Render videos

```bash
# Render locally via CLI
npx remotion render MyVideo out/video.mp4

# Render with custom props
npx remotion render MyVideo out/video.mp4 --props='{"title":"Custom Title"}'
npx remotion render MyVideo out/video.mp4 --props=./props.json   # a JSON file also works (use this on Windows)

# Render a still frame (for thumbnails)
npx remotion still MyVideo out/thumbnail.png --frame=45

# Render with specific codec and quality
npx remotion render MyVideo out/video.mp4 --codec=h264 --crf=18
```

For rendering at scale, use AWS Lambda (needs an AWS account with the Remotion IAM policies; follow remotion.dev/docs/lambda/setup):

```bash
npx remotion lambda functions deploy
npx remotion lambda sites create src/index.ts --site-name=my-video   # prints the serve URL
npx remotion lambda render my-video MyVideo out/video.mp4 --props=./props.json
```

`lambda render` takes the serve URL (or site name) first, then the composition id, then an optional local output path. Lambda splits a video into chunks rendered in parallel, so long videos usually do not need a bigger timeout. Cloud Run support (`@remotion/cloudrun`) is in alpha and no longer actively developed; prefer Lambda or plain server-side rendering with `renderMedia()`.

### Task E: Animated data visualizations

```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

interface DataPoint { label: string; value: number; color: string; }

export const BarChart: React.FC<{ data: DataPoint[] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const maxVal = Math.max(...data.map((d) => d.value));

  return (
    <AbsoluteFill style={{ padding: 80, justifyContent: "flex-end", backgroundColor: "#0f0f23" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: "70%" }}>
        {data.map((point, i) => {
          const height = interpolate(frame, [i * 10, i * 10 + 30], [0, (point.value / maxVal) * 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: `${height}%`,
                backgroundColor: point.color,
                borderRadius: "8px 8px 0 0",
              }} />
              <p style={{ color: "white", marginTop: 12, fontSize: 24 }}>{point.label}</p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

## Examples

### Example 1: Personalized welcome video

**User request:** "Generate a welcome video for each new user with their name"

```bash
# Generate videos from a JSON list of users
for user in $(jq -r '.[] | @base64' users.json); do
  name=$(echo "$user" | base64 -d | jq -r '.name')
  npx remotion render WelcomeVideo "out/welcome_${name}.mp4" \
    --props="{\"userName\":\"${name}\"}"
done
```

### Example 2: Animated sales dashboard

**User request:** "Create a video showing our quarterly metrics animating in"

Build a composition using the BarChart component with quarterly data, render with:
```bash
npx remotion render SalesDashboard out/q4_report.mp4 \
  --props='{"quarter":"Q4","revenue":1250000,"growth":12.5}'
```

### Example 3: Social media content with captions

**User request:** "Add animated captions to a video for TikTok"

Combine the CaptionOverlay with a `<Video>` from `@remotion/media` (the recommended video component):
```tsx
import { AbsoluteFill, staticFile } from "remotion";
import { Video } from "@remotion/media";

<AbsoluteFill>
  <Video src={staticFile("clip.mp4")} />
  <CaptionOverlay captions={captions} />
</AbsoluteFill>
```

## Guidelines

- Use `useCurrentFrame()` and `interpolate()` for all animations; avoid CSS transitions.
- Keep compositions pure: pass all dynamic data as props for easy batch rendering.
- Use `<Sequence>` to organize sections of your video timeline.
- For video sources use `<Video>` from `@remotion/media`; `<OffthreadVideo>` from `remotion` still works but the docs recommend `<Video>` for new code.
- Set `--crf` (Constant Rate Factor) around 16-20 for a good quality-to-size ratio; it cannot be combined with `--video-bitrate`.
- Never use CSS transitions or `setTimeout` for animation: frames render independently, so only values derived from `useCurrentFrame()` are reproducible.
- Test in Remotion Studio before rendering to catch layout issues early.
- Use `staticFile()` to reference assets in the `public/` folder.
