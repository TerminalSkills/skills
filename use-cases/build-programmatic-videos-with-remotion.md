---
title: Build Programmatic Videos with Remotion
slug: build-programmatic-videos-with-remotion
description: >-
  Create videos programmatically using React and Remotion — generate social
  media clips, product demos, personalized onboarding videos, and data-driven
  animations rendered to MP4 at scale.
skills:
  - remotion-video-toolkit
  - tailwindcss
  - ffmpeg
category: media
tags:
  - video
  - remotion
  - react
  - automation
  - content
---

# Build Programmatic Videos with Remotion

Nora's marketing team creates 50 social media video clips per week — same template, different text and images. A designer spends hours in After Effects for each variation. With Remotion, she builds video templates in React, feeds in data (JSON/API), and renders hundreds of personalized videos automatically. Same quality, 100x faster.

## Step 1: Set Up Remotion Project

```bash
npx create-video@latest my-videos
cd my-videos
npm start  # Opens Remotion Studio at localhost:3000
```

## Step 2: Social Media Clip Template

```tsx
// src/compositions/SocialClip.tsx
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Audio } from "remotion";

interface SocialClipProps {
  title: string;
  subtitle: string;
  backgroundImage: string;
  accentColor: string;
  logoUrl: string;
}

export function SocialClip({ title, subtitle, backgroundImage, accentColor, logoUrl }: SocialClipProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Title slides in from bottom with spring physics
  const titleY = spring({ frame, fps, from: 60, to: 0, config: { damping: 12 } });
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  // Subtitle fades in after title
  const subtitleOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });

  // Background zoom effect
  const bgScale = interpolate(frame, [0, 150], [1, 1.1]);

  // Exit animation (last 20 frames)
  const exitOpacity = interpolate(frame, [130, 150], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill>
      {/* Background with slow zoom */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})` }}>
        <Img src={backgroundImage} style={{ width, height, objectFit: "cover" }} />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.5)", opacity: exitOpacity }} />

      {/* Content */}
      <AbsoluteFill style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        opacity: exitOpacity,
      }}>
        <div style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          textAlign: "center",
        }}>
          <h1 style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.2,
            textShadow: "0 2px 20px rgba(0,0,0,0.3)",
          }}>
            {title}
          </h1>
        </div>

        <p style={{
          fontSize: 28,
          color: accentColor,
          marginTop: 20,
          opacity: subtitleOpacity,
          fontWeight: 600,
        }}>
          {subtitle}
        </p>
      </AbsoluteFill>

      {/* Logo watermark */}
      <Img src={logoUrl} style={{
        position: "absolute",
        bottom: 30,
        right: 30,
        width: 80,
        opacity: 0.8,
      }} />
    </AbsoluteFill>
  );
}
```

## Step 3: Register Compositions

```tsx
// src/Root.tsx
import { Composition } from "remotion";
import { SocialClip } from "./compositions/SocialClip";
import { ProductDemo } from "./compositions/ProductDemo";

export function RemotionRoot() {
  return (
    <>
      {/* Instagram Reel / TikTok (9:16) */}
      <Composition
        id="SocialClip-vertical"
        component={SocialClip}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "Build apps 10x faster",
          subtitle: "with the power of AI",
          backgroundImage: "https://images.unsplash.com/photo-abc",
          accentColor: "#60a5fa",
          logoUrl: "/logo.png",
        }}
      />

      {/* Twitter / LinkedIn (16:9) */}
      <Composition
        id="SocialClip-horizontal"
        component={SocialClip}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Build apps 10x faster",
          subtitle: "with the power of AI",
          backgroundImage: "https://images.unsplash.com/photo-abc",
          accentColor: "#60a5fa",
          logoUrl: "/logo.png",
        }}
      />
    </>
  );
}
```

## Step 4: Batch Render from Data

```typescript
// scripts/render-batch.ts
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";

interface VideoData {
  id: string;
  title: string;
  subtitle: string;
  backgroundImage: string;
}

const videos: VideoData[] = [
  { id: "launch", title: "We just launched v2.0", subtitle: "50% faster, 100% better", backgroundImage: "/bg1.jpg" },
  { id: "feature", title: "New: AI Code Review", subtitle: "Catch bugs before they ship", backgroundImage: "/bg2.jpg" },
  { id: "stats", title: "10,000 developers", subtitle: "trust us with their code", backgroundImage: "/bg3.jpg" },
];

async function main() {
  console.log("Bundling...");
  const bundled = await bundle({ entryPoint: path.resolve("./src/index.ts") });

  for (const video of videos) {
    console.log(`Rendering: ${video.id}`);

    for (const format of ["vertical", "horizontal"] as const) {
      const compositionId = `SocialClip-${format}`;
      const composition = await selectComposition({
        serveUrl: bundled,
        id: compositionId,
        inputProps: {
          ...video,
          accentColor: "#60a5fa",
          logoUrl: "https://myapp.com/logo.png",
        },
      });

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: "h264",
        outputLocation: `output/${video.id}-${format}.mp4`,
        inputProps: {
          ...video,
          accentColor: "#60a5fa",
          logoUrl: "https://myapp.com/logo.png",
        },
      });

      console.log(`  ✅ ${video.id}-${format}.mp4`);
    }
  }
  console.log("Done! Rendered", videos.length * 2, "videos");
}

main();
```

## Step 5: Data-Driven Chart Animation

```tsx
// src/compositions/AnimatedChart.tsx
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface ChartProps {
  data: { label: string; value: number; color: string }[];
  title: string;
}

export function AnimatedChart({ data, title }: ChartProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a", padding: 80, justifyContent: "center" }}>
      <h2 style={{ color: "white", fontSize: 48, fontWeight: 700, marginBottom: 40 }}>{title}</h2>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, height: 400 }}>
        {data.map((item, i) => {
          const barDelay = i * 5;
          const barHeight = interpolate(
            frame,
            [barDelay, barDelay + 30],
            [0, (item.value / maxValue) * 100],
            { extrapolateRight: "clamp" }
          );

          const labelOpacity = interpolate(frame, [barDelay + 15, barDelay + 25], [0, 1], {
            extrapolateRight: "clamp",
          });

          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <span style={{ color: "white", fontSize: 24, fontWeight: 700, opacity: labelOpacity, marginBottom: 8 }}>
                {item.value}%
              </span>
              <div style={{
                width: "100%",
                height: `${barHeight}%`,
                backgroundColor: item.color,
                borderRadius: "8px 8px 0 0",
                minHeight: 4,
              }} />
              <span style={{ color: "#94a3b8", fontSize: 16, marginTop: 12 }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
```

## Summary

Nora's team now generates 50 video clips in 10 minutes instead of 50 hours. Each template is a React component with props — swap the title, image, and colors to get a new video. Remotion Studio lets designers preview and tweak animations in the browser. The batch render script takes a JSON array and outputs MP4 files for both vertical (Reels/TikTok) and horizontal (Twitter/LinkedIn) formats. Data-driven charts animate automatically from raw numbers. The videos look professional because they use spring physics, easing curves, and cinematic transitions — all defined in TypeScript, version-controlled, and reproducible.
