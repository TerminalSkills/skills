---
name: lottie
description: >-
  Lottie plays vector animations exported from After Effects and other motion
  tools as JSON, rendered in the browser by the lottie-web player. Use when
  tasks involve adding motion graphics, animated icons, loading indicators, or
  micro-interactions to a web app: loading JSON or .lottie animation files,
  controlling playback, listening to events, recoloring at runtime, or
  integrating animations into React, Vue, or vanilla JS.
license: Apache-2.0
compatibility: "Browsers (lottie-web 5.x); the React example needs React 18+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/airbnb/lottie-web
  tags: ["lottie", "animation", "after-effects", "motion", "micro-interactions"]
---

# Lottie

## Overview

Render After Effects animations exported as JSON. Lightweight, scalable, and interactive. `lottie-web` (Airbnb, current release 5.13.0) parses the JSON produced by the Bodymovin exporter and draws it as SVG, canvas or HTML, with an API for playback control and events. Compressed `.lottie` archives need the separate dotLottie player covered at the end of the instructions.

## Instructions

### Setup

```bash
# Install lottie-web for vanilla JS/TS projects.
npm install lottie-web
```

The default import bundles all three renderers plus the expression engine (about 77 KB gzipped). When an animation uses no After Effects expressions, import the light SVG-only build instead (about 47 KB gzipped, no `eval`):

```typescript
import lottie from "lottie-web/build/player/lottie_light";
```

### Basic Playback

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

`animationData` and `path` are mutually exclusive. The rendered SVG is sized to 100% of the container, so set the container's dimensions in CSS.

### Playback Controls

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

The second argument of `goToAndPlay` / `goToAndStop` selects frames; when it is `false` or omitted the value is a time in milliseconds. `anim.getDuration()` returns seconds, `anim.getDuration(true)` frames.

### Event Handling

```typescript
// src/lottie/events.ts — Listen to animation lifecycle events for triggering
// UI updates, chaining animations, or tracking analytics.
import type { AnimationItem } from "lottie-web";

export function attachEvents(anim: AnimationItem) {
  anim.addEventListener("complete", () => {
    console.log("Animation completed"); // not fired while loop is true
  });

  anim.addEventListener("loopComplete", () => {
    console.log("Loop finished");
  });

  anim.addEventListener("enterFrame", (e) => {
    // Fires every frame — use sparingly
    const progress = e.currentTime / e.totalTime;
    document.getElementById("progress")!.style.width = `${progress * 100}%`;
  });

  anim.addEventListener("DOMLoaded", () => {
    console.log("Animation DOM elements ready");
  });

  anim.addEventListener("data_failed", () => {
    console.error("Animation JSON could not be loaded from `path`");
  });
}
```

`addEventListener` returns a function that removes the listener.

### React Integration

```tsx
// src/components/LottiePlayer.tsx — React component wrapping lottie-web.
// Destroys the animation on unmount and reloads it when a prop changes.
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

### Dynamic Color Updates

```typescript
// src/lottie/theme.ts — Swap solid fill and stroke colors in a Lottie JSON before rendering.
// Useful for theming animations to match brand colors at runtime.
type RGB = [number, number, number]; // 0–1 floats, as stored in the file

export function recolorAnimation(animationData: any, colorMap: Record<string, RGB>): any {
  const data = structuredClone(animationData);

  const walkShapes = (shapes: any[]) => {
    for (const shape of shapes) {
      const isPaint = shape.ty === "fl" || shape.ty === "st"; // fill or stroke
      if (isPaint && shape.c?.a !== 1 && Array.isArray(shape.c?.k)) { // a === 1 means keyframed
        const next = colorMap[rgbToHex(shape.c.k[0], shape.c.k[1], shape.c.k[2])];
        if (next) shape.c.k = [...next, 1];
      }
      if (shape.it) walkShapes(shape.it); // groups nest their items in `it`
    }
  };
  const walkLayers = (layers: any[] = []) => {
    for (const layer of layers) if (layer.shapes) walkShapes(layer.shapes);
  };

  walkLayers(data.layers);
  for (const asset of data.assets ?? []) walkLayers(asset.layers); // precompositions
  return data;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
```

### dotLottie Files

A `.lottie` file is a ZIP archive holding one or more animations and their assets. lottie-web cannot read it; use the LottieFiles player (`npm install @lottiefiles/dotlottie-web`, or `@lottiefiles/dotlottie-react` for React), which draws on a canvas through a WebAssembly renderer and also accepts plain JSON:

```typescript
// src/lottie/dotlottie.ts — Play a .lottie file on a <canvas>.
import { DotLottie } from "@lottiefiles/dotlottie-web";

export const hero = new DotLottie({
  canvas: document.querySelector<HTMLCanvasElement>("#hero-animation")!,
  src: "/animations/hero.lottie",
  autoplay: true,
  loop: true,
});

hero.addEventListener("loadError", () => console.error("hero.lottie failed to load"));
// hero.pause(); hero.setSpeed(1.5); hero.setFrame(24); hero.destroy();
```

## Examples

### Example 1: Loading indicator while a form submits

User: "Show our loader animation while the order is being submitted."

```html
<div id="order-loader" style="width:96px;height:96px" role="img" aria-label="Submitting order"></div>
```

```typescript
import lottie from "lottie-web/build/player/lottie_light";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = lottie.loadAnimation({
  container: document.getElementById("order-loader")!,
  renderer: "svg",
  loop: true,
  autoplay: !reduceMotion,
  path: "/animations/order-loader.json",
});

export async function submitOrder(form: HTMLFormElement) {
  try {
    await fetch("/api/orders", { method: "POST", body: new FormData(form) });
  } finally {
    loader.destroy(); // removes the SVG and stops the render loop
  }
}
```

A 96 px SVG loops inside the div until the request settles. With reduced motion enabled the first frame is drawn as a still image and nothing moves.

### Example 2: Play a success checkmark once, in the brand color

User: "After payment, play the checkmark animation one time and make it our green instead of blue."

```tsx
import checkmark from "./animations/checkmark.json";
import { LottiePlayer } from "./components/LottiePlayer";
import { recolorAnimation } from "./lottie/theme";

// Recolor once at module scope: a new object on every render would restart the animation
const brandCheck = recolorAnimation(checkmark, { "#3399ff": [0.13, 0.77, 0.37] });

export function PaymentSuccess() {
  return <LottiePlayer animationData={brandCheck} loop={false} className="h-24 w-24" />;
}
```

Every solid `#3399ff` fill and stroke renders as `rgb(33,196,94)`, the animation plays through once, fires `complete`, and rests on its last frame.

## Guidelines

- **Always destroy.** Call `anim.destroy()` when the element leaves the page (React cleanup, route change); otherwise the animation keeps its DOM nodes and frame loop alive.
- **Keep `animationData` stable in React.** The effect above reloads whenever the object identity changes, so import the JSON or memoize it. If an animation with repeaters is loaded several times from the same object, pass a deep clone to each `loadAnimation` call.
- **Pick the renderer deliberately.** `svg` is the default and stays sharp at any size; `canvas` draws into one element instead of creating a DOM node per shape, which helps with very complex animations; `html` is rarely needed.
- **Respect reduced motion** with `prefers-reduced-motion`, and label the container (`role="img"`, `aria-label`) or set `rendererSettings: { title, description }` for the SVG renderer.
- **Expressions run through `eval`.** The full build evaluates After Effects expressions stored in the JSON, which requires `unsafe-eval` under a strict Content-Security-Policy and means animation files from untrusted sources can run code. Use the light build for third-party files.
- **Tests in jsdom fail on import** with "Cannot set properties of null (setting 'fillStyle')" because jsdom has no canvas. Stub `HTMLCanvasElement.prototype.getContext` in the test setup or mock the `lottie-web` module.
- **Server rendering.** Importing lottie-web on the server is safe since 5.13.0, but `loadAnimation` needs a DOM: call it in `useEffect`, `onMounted` or a client-only component.
- **Export limits.** Image sequences, video and audio layers are not supported; large masks and huge shapes hurt frame rate. Raster images are exported to an `images/` folder next to the JSON; when loading through `animationData`, set `assetsPath` to that folder's URL. Serve the JSON gzipped.
- **dotLottie loads its WASM from a CDN** (jsDelivr) at runtime by default. For offline apps or a strict CSP, host the file yourself and call `DotLottie.setWasmUrl()` before creating a player.
- **React wrappers.** `lottie-react` (v3: `import { Lottie } from "lottie-react"`, `<Lottie src="/hero.json" autoplay loop />`) and `@lottiefiles/dotlottie-react` (`<DotLottieReact src="/hero.lottie" autoplay loop />`) save writing the component above.
- **When not to use Lottie.** Simple hovers and transitions are cheaper in CSS; long video-like sequences are smaller as video.
