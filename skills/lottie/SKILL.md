---
name: lottie
description: >-
  Play After Effects animations on web and mobile with Lottie — load JSON
  animation files, control playback, listen to events, and integrate animations
  into React, Vue, or vanilla JS apps. Use when tasks involve adding motion
  graphics, animated icons, loading indicators, or micro-interactions exported
  from After Effects or other animation tools.
license: Apache-2.0
compatibility: "Browser or React Native"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["lottie", "animation", "after-effects", "motion", "micro-interactions"]
---

# Lottie

Render After Effects animations exported as JSON. Lightweight, scalable, and interactive.

## Setup

```bash
# Install lottie-web for vanilla JS/TS projects.
npm install lottie-web
```

## Basic Playback

```typescript
// src/lottie/player.ts — Load and play a Lottie animation in a DOM container.
// The animation JSON is typically exported from After Effects via Bodymovin.
import lottie, { AnimationItem } from "lottie-web";

export function playAnimation(
  container: HTMLElement,
  animationData: object
): AnimationItem {
  return lottie.loadAnimation({
    container,
    renderer: "svg", // "canvas" or "html" also available
    loop: true,
    autoplay: true,
    animationData,
  });
}

// Load from URL instead of inline data
export function playFromUrl(container: HTMLElement, path: string): AnimationItem {
  return lottie.loadAnimation({
    container,
    renderer: "svg",
    loop: true,
    autoplay: true,
    path, // URL to the JSON file
  });
}
```

## Playback Controls

```typescript
// src/lottie/controls.ts — Control animation playback: play, pause, seek, speed.
import type { AnimationItem } from "lottie-web";

export function setupControls(anim: AnimationItem) {
  // Play / Pause
  anim.play();
  anim.pause();
  anim.stop();

  // Go to specific frame (frame 30, and play)
  anim.goToAndPlay(30, true);

  // Go to specific frame and stop
  anim.goToAndStop(0, true);

  // Playback speed (2x)
  anim.setSpeed(2);

  // Play direction (-1 = reverse)
  anim.setDirection(-1);

  // Play only a segment (frames 10-50)
  anim.playSegments([10, 50], true);
}
```

## Event Handling

```typescript
// src/lottie/events.ts — Listen to animation lifecycle events for triggering
// UI updates, chaining animations, or tracking analytics.
import type { AnimationItem } from "lottie-web";

export function attachEvents(anim: AnimationItem) {
  anim.addEventListener("complete", () => {
    console.log("Animation completed");
  });

  anim.addEventListener("loopComplete", () => {
    console.log("Loop finished");
  });

  anim.addEventListener("enterFrame", (e) => {
    // Fires every frame — use sparingly
    const progress = (e as any).currentTime / anim.totalFrames;
    document.getElementById("progress")!.style.width = `${progress * 100}%`;
  });

  anim.addEventListener("DOMLoaded", () => {
    console.log("Animation DOM elements ready");
  });
}
```

## React Integration

```tsx
// src/components/LottiePlayer.tsx — React component wrapping lottie-web.
// Handles cleanup on unmount and exposes ref for external control.
import { useEffect, useRef } from "react";
import lottie, { AnimationItem } from "lottie-web";

interface Props {
  animationData: object;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

export function LottiePlayer({ animationData, loop = true, autoplay = true, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    animRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop,
      autoplay,
      animationData,
    });

    return () => {
      animRef.current?.destroy();
    };
  }, [animationData, loop, autoplay]);

  return <div ref={containerRef} className={className} />;
}
```

## Dynamic Color Updates

```typescript
// src/lottie/theme.ts — Modify colors inside a Lottie JSON before rendering.
// Useful for theming animations to match brand colors at runtime.
export function recolorAnimation(
  animationData: any,
  colorMap: Record<string, [number, number, number]>
): any {
  const data = JSON.parse(JSON.stringify(animationData));

  function walkShapes(shapes: any[]) {
    for (const shape of shapes) {
      if (shape.ty === "fl" && shape.c?.k) {
        const hex = rgbToHex(shape.c.k[0], shape.c.k[1], shape.c.k[2]);
        if (colorMap[hex]) {
          const [r, g, b] = colorMap[hex];
          shape.c.k = [r, g, b, 1];
        }
      }
      if (shape.it) walkShapes(shape.it);
    }
  }

  for (const layer of data.layers || []) {
    if (layer.shapes) walkShapes(layer.shapes);
  }

  return data;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
```
