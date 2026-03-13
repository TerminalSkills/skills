---
name: spline
description: >-
   You are an expert in Spline, the browser-based 3D design tool that lets
  designers create interactive 3D scenes and export them to websites without
  writing code. You help teams build 3D landing pages, product showcases,
  animated illustrations, and interactive experiences — with Spline's visual
  editor for modeling, materials, animations, physics, and mouse/scroll
  interactions, plus export to React, vanilla JS, or embeddable iframe.
category: 3D & Creative
tags: [3d, design-tool, no-code, interactive, web, collaboration]
version: 1.0.0
author: terminal-skills
---

# Spline — 3D Design Tool for the Web

You are an expert in Spline, the browser-based 3D design tool that lets designers create interactive 3D scenes and export them to websites without writing code. You help teams build 3D landing pages, product showcases, animated illustrations, and interactive experiences — with Spline's visual editor for modeling, materials, animations, physics, and mouse/scroll interactions, plus export to React, vanilla JS, or embeddable iframe.

## Core Capabilities

### React Integration

```tsx
// Install: npm install @splinetool/react-spline
import Spline from "@splinetool/react-spline";
import type { Application } from "@splinetool/runtime";
import { useRef } from "react";

export function Hero3D() {
  const splineRef = useRef<Application>();

  function onLoad(spline: Application) {
    splineRef.current = spline;

    // Find objects by name (set in Spline editor)
    const cube = spline.findObjectByName("HeroCube");
    if (cube) {
      cube.position.y = 2;               // Programmatic control
    }
  }

  // Respond to Spline events
  function onMouseDown(e: any) {
    if (e.target.name === "BuyButton") {
      window.location.href = "/checkout";
    }
  }

  return (
    <Spline
      scene="https://prod.spline.design/abc123/scene.splinecode"
      onLoad={onLoad}
      onMouseDown={onMouseDown}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}
```

### Vanilla JS / Iframe

```html
<!-- Embed via iframe (simplest) -->
<iframe
  src="https://my.spline.design/abc123/"
  frameborder="0"
  width="100%"
  height="600"
  style="border: none;"
></iframe>

<!-- Or via runtime for more control -->
<canvas id="canvas3d"></canvas>
<script type="module">
  import { Application } from "@splinetool/runtime";

  const canvas = document.getElementById("canvas3d");
  const app = new Application(canvas);
  await app.load("https://prod.spline.design/abc123/scene.splinecode");

  // Listen for events from Spline
  app.addEventListener("mouseDown", (e) => {
    console.log("Clicked:", e.target.name);
  });
</script>
```

### Design Workflow

```markdown
## Spline Editor Features

### Modeling
- Parametric shapes (box, sphere, torus, text, path extrusion)
- Boolean operations (union, subtract, intersect)
- Edit mode for vertex/edge manipulation
- Import .OBJ, .GLTF, .FBX models

### Materials & Lighting
- PBR materials with realtime preview
- Glass, metal, plastic, fabric presets
- Matcap and gradient materials
- HDR environments, point/spot/directional lights

### Interactions (no code!)
- Mouse hover/click events per object
- Scroll-triggered animations
- State transitions (hover state, active state)
- Physics (gravity, collision, spring)
- Variables and conditions for logic

### Animation
- Keyframe timeline with easing curves
- Follow-path animation
- Spring physics animation
- Auto-rotate, float, bounce presets
- Sequence multiple animations

### Collaboration
- Real-time multiplayer editing (like Figma)
- Version history
- Comments and annotations
- Team libraries for reusable components
```

## Installation

```bash
# React
npm install @splinetool/react-spline @splinetool/runtime

# Vanilla JS
npm install @splinetool/runtime

# Editor: https://spline.design (browser-based, free tier available)
```

## Best Practices

1. **Design in Spline, control in code** — Build the 3D scene visually, export to React, add business logic with `findObjectByName`
2. **Interactions in Spline** — Use Spline's built-in events for hover/click effects; no code needed for basic interactions
3. **Optimize file size** — Reduce polygon count in Spline; remove invisible objects; use lower texture resolution for web
4. **Lazy load** — Spline scenes can be 2-5MB; load them lazily below the fold or after initial page render
5. **Events bridge** — Use `onMouseDown`, `onMouseHover` props to connect Spline interactions to React state/routing
6. **Fallback for slow connections** — Show a static image or loading animation while the Spline scene loads
7. **Combine with R3F** — Use Spline for designer-created scenes, R3F for code-driven 3D in the same project
8. **Team workflow** — Designers edit in Spline, publish URL updates live; no developer deploy needed for visual changes
