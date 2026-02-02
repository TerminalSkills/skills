---
name: remotion-video-toolkit
description: >-
  Programmatic video creation with React using Remotion. Use when a user asks
  to create videos with code, generate personalized videos, build animated
  data visualizations, add TikTok-style captions, render video
  programmatically, or automate video production. Supports CLI rendering,
  AWS Lambda, and Google Cloud Run deployment.
license: Apache-2.0
compatibility: "Requires Node.js 18+ with Remotion and React"
metadata:
  author: terminal-skills
  version: "1.0.0"
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
npm start  # Opens the Remotion Studio at http://localhost:3000
```

Project structure:
```
my-video/
  src/
    Root.tsx          # Register all compositions
    MyComposition.tsx # Your video component
  remotion.config.ts  # Render settings
```

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

```tsx
import { AbsoluteFill, useCurrentFrame, Sequence } from "remotion";

interface CaptionWord {
  text: string;
  startFrame: number;
  durationInFrames: number;
}

const captions: CaptionWord[] = [
  { text: "This", startFrame: 0, durationInFrames: 15 },
  { text: "is", startFrame: 15, durationInFrames: 10 },
  { text: "amazing!", startFrame: 25, durationInFrames: 20 },
];

export const CaptionOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  const activeWord = captions.find(
    (c) => frame >= c.startFrame && frame < c.startFrame + c.durationInFrames
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
      {activeWord && (
        <div style={{
          fontSize: 64,
          fontWeight: "bold",
          color: "white",
          textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: "8px 24px",
          borderRadius: 12,
        }}>
          {activeWord.text}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

### Task D: Render videos

```bash
# Render locally via CLI
npx remotion render MyVideo out/video.mp4

# Render with custom props
npx remotion render MyVideo out/video.mp4 --props='{"title":"Custom Title"}'

# Render a still frame (for thumbnails)
npx remotion still MyVideo out/thumbnail.png --frame=45

# Render with specific codec and quality
npx remotion render MyVideo out/video.mp4 --codec=h264 --crf=18
```

For batch rendering at scale:

```bash
# Render on AWS Lambda
npx remotion lambda render MyVideo --props='{"title":"Video 1"}'

# Render on Google Cloud Run
npx remotion cloudrun render MyVideo --props='{"title":"Video 1"}'
```

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
                transition: "height 0.3s",
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

Combine the CaptionOverlay with an `OffthreadVideo` source:
```tsx
import { OffthreadVideo } from "remotion";
<AbsoluteFill>
  <OffthreadVideo src="https://example.com/clip.mp4" />
  <CaptionOverlay />
</AbsoluteFill>
```

## Guidelines

- Use `useCurrentFrame()` and `interpolate()` for all animations; avoid CSS transitions.
- Keep compositions pure: pass all dynamic data as props for easy batch rendering.
- Use `<Sequence>` to organize sections of your video timeline.
- Prefer `<OffthreadVideo>` over `<Video>` for better performance with video sources.
- Set `crf` (Constant Rate Factor) between 16-20 for good quality-to-size ratio.
- For Lambda rendering, keep compositions under 120 seconds to avoid timeout issues.
- Test in Remotion Studio before rendering to catch layout issues early.
- Use `staticFile()` to reference assets in the `public/` folder.
