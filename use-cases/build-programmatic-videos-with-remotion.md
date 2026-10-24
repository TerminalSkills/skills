---
title: Build Programmatic Videos with Remotion
slug: build-programmatic-videos-with-remotion
description: >-
  Create videos programmatically using React and Remotion — generate social
  media clips, product demos, personalized onboarding videos, and data-driven
  animations rendered to MP4 at scale.
skills:
  - remotion-video-toolkit
category: content
tags:
  - video
  - remotion
  - react
  - automation
  - content
---

# Build Programmatic Videos with Remotion

Nora's marketing team creates 50 social media video clips per week — same template, different text and images. A designer spends hours in After Effects for each variation. With Remotion, she builds video templates in React, feeds in data (JSON/API), and renders hundreds of personalized videos automatically. Same template, no manual editing per variation.

## Step 1: Set Up Remotion Project

```bash
npx create-video@latest my-videos
cd my-videos
npm run dev  # opens Remotion Studio, by default at http://localhost:3000
```

Pick the blank TypeScript template. Put the background images and the logo in `public/`: the code below refers to them as `bg1.jpg` and `logo.png`. Remotion is free for individuals, non-profits and for-profit companies with up to 3 employees; larger companies need a paid company license (see the Remotion license page).

## Step 2: Social Media Clip Template

Props are declared with `type`, not `interface`: Remotion requires props to be assignable to `Record<string, unknown>`, and an interface fails that check.

```tsx
// src/compositions/SocialClip.tsx
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

type SocialClipProps = {
  title: string;
  subtitle: string;
  backgroundImage: string;
  accentColor: string;
  logoUrl: string;
};

// Bare file names resolve against public/; full URLs are used as they are
const asset = (src: string) => (src.startsWith("http") ? src : staticFile(src));

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
        <Img src={asset(backgroundImage)} style={{ width, height, objectFit: "cover" }} />
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
      <Img src={asset(logoUrl)} style={{
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

The entry file calls `registerRoot`:

```ts
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
```

```tsx
// src/Root.tsx
import { Composition } from "remotion";
import { SocialClip } from "./compositions/SocialClip";

const defaultProps = {
  title: "Build apps 10x faster",
  subtitle: "with the power of AI",
  backgroundImage: "bg1.jpg",
  accentColor: "#60a5fa",
  logoUrl: "logo.png",
};

export function RemotionRoot() {
  return (
    <>
      {/* Instagram Reel / TikTok (9:16) */}
      <Composition id="SocialClip-vertical" component={SocialClip} durationInFrames={150}
        fps={30} width={1080} height={1920} defaultProps={defaultProps} />

      {/* Twitter / LinkedIn (16:9) */}
      <Composition id="SocialClip-horizontal" component={SocialClip} durationInFrames={150}
        fps={30} width={1920} height={1080} defaultProps={defaultProps} />
    </>
  );
}
```

One component, two compositions: the same template renders at 9:16 and 16:9.

## Step 4: Batch Render from Data

Run the script with a TypeScript runner, for example `npx tsx scripts/render-batch.ts`. The bundle is built once and reused for every render. Image names resolve against `public/`; pass a full `https://` URL to use a remote image.

```typescript
// scripts/render-batch.ts
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";

type VideoData = {
  id: string;
  title: string;
  subtitle: string;
  backgroundImage: string;
};

const videos: VideoData[] = [
  { id: "launch", title: "We just launched v2.0", subtitle: "50% faster, 100% better", backgroundImage: "bg1.jpg" },
  { id: "feature", title: "New: AI Code Review", subtitle: "Catch bugs before they ship", backgroundImage: "bg2.jpg" },
  { id: "stats", title: "10,000 developers", subtitle: "trust us with their code", backgroundImage: "bg3.jpg" },
];

async function main() {
  const bundled = await bundle({ entryPoint: path.resolve("./src/index.ts") });

  for (const video of videos) {
    console.log(`Rendering: ${video.id}`);

    for (const format of ["vertical", "horizontal"] as const) {
      const inputProps = { ...video, accentColor: "#60a5fa", logoUrl: "logo.png" };
      const composition = await selectComposition({
        serveUrl: bundled,
        id: `SocialClip-${format}`,
        inputProps,
      });

      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: "h264",
        outputLocation: `output/${video.id}-${format}.mp4`,
        inputProps,
      });

      console.log(`  done: ${video.id}-${format}.mp4`);
    }
  }
  console.log(`Done! Rendered ${videos.length * 2} videos`);
}

main();
```

The first render downloads a headless Chrome build into `node_modules/.remotion`. For a single clip, `npx remotion render SocialClip-vertical out.mp4 --props='{"title":"Hello"}'` does the same from the command line.

## Step 5: Data-Driven Chart Animation

Register it as another `<Composition id="AnimatedChart" component={AnimatedChart} ... />` in `Root.tsx`, with sample `data` and `title` in `defaultProps`, then render it like any other.

```tsx
// src/compositions/AnimatedChart.tsx
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type ChartProps = {
  data: { label: string; value: number; color: string }[];
  title: string;
};

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

Nora's team now renders a week of clips from one JSON array instead of editing each one by hand. Each template is a React component with props, so swapping the title, image and colors yields a new video. Remotion Studio lets designers preview and tweak animations in the browser. The batch script takes the data and outputs MP4 files for both vertical (Reels/TikTok) and horizontal (Twitter/LinkedIn) formats. Everything is TypeScript, version-controlled and reproducible.

## Related Skills

- [remotion-video-toolkit](/skills/remotion-video-toolkit)
