---
name: spline
description: >-
  Spline is a browser-based 3D design tool for building interactive scenes and
  publishing them to the web as an embed, a web component, or React, Next.js
  and vanilla JavaScript code. Use when a user asks to add a Spline scene to a
  site, embed a 3D hero or product showcase, control a Spline scene from code
  with @splinetool/react-spline or @splinetool/runtime, use the spline-viewer
  component, react to clicks on 3D objects, or make a Spline embed load
  faster.
license: Apache-2.0
compatibility: "Scenes are authored in the Spline editor (browser or desktop app). Embedding needs a browser with WebGL or WebGPU; @splinetool/react-spline needs React, and its /next entry needs Next.js 14.2+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["3d", "design-tool", "no-code", "interactive", "web"]
---

# Spline — 3D Design Tool for the Web

## Overview

Spline is a browser-based 3D design tool that lets designers create interactive 3D scenes and export them to websites without writing code. Teams use it for 3D landing pages, product showcases, animated illustrations, and interactive experiences: the scene is built in Spline's visual editor (modeling, materials, animation, physics, events), then exported as a hosted URL, a `spline-viewer` web component, or code for React, Next.js and vanilla JS. This skill covers the code side: embedding an exported scene and controlling it at runtime.

## Instructions

### Pick the export

In the editor press **Export** and choose one of the web options. Each produces a URL to copy; after changing the scene, update the export so the URL serves the new version.

| Export | What you get | Use it when |
|--------|--------------|-------------|
| Public URL | `https://my.spline.design/...` page, embeddable in an iframe | Sharing a link, or tools that only accept iframes |
| Viewer | `spline-viewer` web component | Any site or builder; needed for page-wide scroll, follow and look-at events |
| Code → React / Next.js | `scene.splinecode` URL for `@splinetool/react-spline` | The app must read or change objects, variables and events |
| Code → Vanilla JS | `scene.splinecode` URL for `@splinetool/runtime` | Same control without React |

Animations and events only work in the Vanilla JS and React code exports, not in the Three.js or react-three-fiber ones.

### React Integration

```tsx
// Install: npm install @splinetool/react-spline @splinetool/runtime
import Spline from "@splinetool/react-spline";
import type { Application, SplineEvent } from "@splinetool/runtime";
import { useRef } from "react";

export function Hero3D() {
  const splineRef = useRef<Application | null>(null);

  function onLoad(spline: Application) {
    splineRef.current = spline;

    // Find objects by name (set in Spline editor)
    const cube = spline.findObjectByName("HeroCube");
    if (cube) {
      cube.position.y = 2;               // Programmatic control
    }
  }

  // Fires only for objects that have a Mouse Down event in Spline's Events panel
  function onSplineMouseDown(e: SplineEvent) {
    if (e.target.name === "BuyButton") {
      window.location.href = "/checkout";
    }
  }

  return (
    <Spline
      scene="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"
      onLoad={onLoad}
      onSplineMouseDown={onSplineMouseDown}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}
```

Spline event props are `onSplineMouseDown`, `onSplineMouseUp`, `onSplineMouseHover`, `onSplineKeyDown`, `onSplineKeyUp`, `onSplineStart`, `onSplineLookAt`, `onSplineFollow` and `onSplineScroll`. A plain `onMouseDown` is an ordinary DOM handler on the wrapper `div` and knows nothing about 3D objects.

In Next.js, export as **Next.js** and import from `@splinetool/react-spline/next` instead: it is a server component that renders a blurred placeholder until the scene loads.

### Viewer, iframe and vanilla runtime

```html
<!-- Web component: no build step, lazy-loads when it scrolls into view -->
<script type="module" src="https://cdn.spline.design/@splinetool/viewer@2.0.64/build/spline-viewer.js"></script>
<spline-viewer
  url="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"
  loading-anim-type="spinner-small-dark"
  events-target="global"
></spline-viewer>

<!-- Public URL in an iframe (simplest, events stay inside the frame) -->
<iframe
  src="https://my.spline.design/splinereactlogocopycopy-eaa074bf6b2cc82d870c96e262a625ae/"
  width="100%" height="600" style="border: none;"
></iframe>
```

Viewer attributes: `url`, `width`, `height`, `background`, `renderer` (`auto`, `webgpu`, `webgl`), `loading` (`auto`, `lazy`, `eager`), `loading-anim-type`, `unloadable`, `events-target` (`local`, `global`), `hint`. It dispatches `load-start`, `load-complete`, `viewport-intersection`, `context-loss` and `unload` events.

```js
// main.js — bundled with Vite, webpack, etc. (npm install @splinetool/runtime)
import { Application } from "@splinetool/runtime";

const canvas = document.getElementById("canvas3d");   // <canvas id="canvas3d"></canvas>
const app = new Application(canvas);
await app.load("https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode");

// Listen for events from Spline
app.addEventListener("mouseDown", (e) => {
  console.log("Clicked:", e.target.name);
});
```

### Runtime API

`onLoad` in React and `new Application(canvas)` give the same object:

| Call | Purpose |
|------|---------|
| `findObjectByName(name)`, `findObjectById(uuid)`, `getAllObjects()` | Get objects; each has `position`, `rotation`, `scale`, `visible`, `color`, `state`, `show()`, `hide()`, `emitEvent()` |
| `emitEvent(eventName, nameOrUuid)`, `emitEventReverse(...)` | Run an event defined in the editor: `mouseDown`, `mouseUp`, `mouseHover`, `keyDown`, `keyUp`, `start`, `lookAt`, `follow`, `scroll` |
| `setVariable(name, value)`, `setVariables({...})`, `getVariable(name)`, `getVariables()` | Read and write scene variables |
| `addEventListener(eventName, cb)`, `removeEventListener(eventName, cb)` | Subscribe to Spline events |
| `setZoom(n)`, `setBackgroundColor(css)`, `setSize(w, h)` | Camera zoom, background, canvas size |
| `stop()`, `play()`, `dispose()` | Pause, resume, and free the runtime |

### Design Workflow

What the editor offers, so requests can be routed to the designer or to code:

- **Modeling** — parametric shapes, text, pen tool and extrusion, 3D paths, boolean operations (union, subtract, intersect), subdivision editing of vertices, edges and faces, sculpting. Imports OBJ, FBX (with animation and rigs), STL, GLTF and GLB.
- **Materials and lighting** — layered materials (color, gradient, image, video, noise, matcap, glass, fresnel and more), PBR materials, a material library, HDRi environments, point, spot and directional lights.
- **Interactions without code** — events such as Start, Mouse Down/Up/Hover, Key Down/Up, Scroll, Look At, Follow, Drag and Drop, Collision and Variable Change trigger actions such as state transitions, sounds, links, camera switches, conditionals and API requests. Physics covers gravity and collisions.
- **Animation** — state-based transitions with easing, plus a keyframe timeline.
- **Collaboration** — real-time multiplayer editing, comments, version history, team libraries.
- **Other exports** — native embeds for iOS and Android, GLTF/GLB, USDZ, STL, image, video.

Spline's desktop app (macOS, Windows) also bundles an MCP server that lets Claude Code, Cursor and other agents edit an open scene; it registers itself when the app is first opened and does not work from the browser.

## Examples

### Example 1: Add a lazy-loaded 3D product viewer that the page can control

**User request:** "Put our Trailrunner sneaker scene on the product page. The 'Spin' button should play the rotation, and the colour buttons should switch the colorway."

```tsx
import { lazy, Suspense, useRef } from "react";
import type { Application } from "@splinetool/runtime";

const Spline = lazy(() => import("@splinetool/react-spline"));

export function ProductShowcase() {
  const app = useRef<Application | null>(null);
  const poster = <img src="/img/sneaker-poster.webp" alt="Trailrunner 2 sneaker" />;

  return (
    <section>
      <Suspense fallback={poster}>
        <Spline
          scene="/scenes/trailrunner.splinecode"
          onLoad={(spline) => {
            app.current = spline;
            spline.setVariable("colorway", "forest");
          }}
        >
          {poster}
        </Spline>
      </Suspense>
      <button type="button" onClick={() => app.current?.emitEvent("mouseDown", "RotateTrigger")}>
        Spin the shoe
      </button>
      <button type="button" onClick={() => app.current?.setVariable("colorway", "sand")}>
        Sand colorway
      </button>
    </section>
  );
}
```

**Result:** the page shows the poster until the scene is ready: the `Suspense` fallback covers the download of the Spline bundle, and `<Spline>` renders its children (the same image) while the self-hosted `.splinecode` file loads, then swaps in the canvas. "Spin the shoe" runs the Mouse Down event the designer attached to the `RotateTrigger` object, and the colour button changes the `colorway` variable that the scene's Variable Change event listens to. Both names must exist in the scene for the calls to have any effect.

### Example 2: Embed a scene on a static page and hide the skeleton when it is ready

**User request:** "Our marketing site is plain HTML. Embed the Spline hero and fade out the placeholder once it has loaded."

```html
<script type="module" src="https://cdn.spline.design/@splinetool/viewer@2.0.64/build/spline-viewer.js"></script>

<div class="hero">
  <img id="hero-poster" src="/img/hero-poster.webp" alt="Abstract 3D shapes">
  <spline-viewer id="hero-scene" loading="eager"
    url="https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode"></spline-viewer>
</div>

<script>
  const viewer = document.getElementById("hero-scene");
  viewer.addEventListener("load-complete", (e) => {
    console.log("Spline scene ready:", e.detail.url);
    document.getElementById("hero-poster").classList.add("is-hidden");
  });
</script>
```

**Result:** the viewer fires `load-start`, then `load-complete` with the scene URL in `e.detail.url`, and the poster is hidden. `loading="eager"` starts the download immediately because the hero is above the fold; leave the default for scenes further down the page.

## Guidelines

1. **Design in Spline, control in code** — Build the 3D scene visually, export to React, add business logic with `findObjectByName`, `emitEvent` and variables
2. **Interactions in Spline** — Use Spline's built-in events for hover/click effects; code can only listen to or trigger events that were set up in the editor
3. **Names are the contract** — Object, event and variable names come from the designer's file. Agree on them, and guard against `findObjectByName` returning `undefined`
4. **Optimize the scene** — Use the Performance panel in the Export dialog: fewer polygons, objects, lights and textures, components for repeated objects, and geometry and image compression in Play Settings
5. **Lazy load** — The dual-engine viewer script alone is about 3.5 MB (roughly 1.1 MB compressed); load scenes below the fold lazily, or use `spline-viewer.webgl.js` when the scene was exported for WebGL only
6. **Fallback for slow connections** — Show a static image or loading animation while the Spline scene loads
7. **Self-host to avoid CORS problems** — Download the `.splinecode` file from the code export panel and serve it from your own origin; only `.splinecode` files load at runtime, `.spline` files are for the editor
8. **Pin versions** — Pin the viewer script and the npm packages; `@splinetool/runtime` ships new builds often and now picks WebGPU where available, falling back to WebGL
9. **Plan limits** — The free plan shows a Spline logo on web exports; removing it needs a paid plan, and the fully self-contained Self-Hosted export is Enterprise only
10. **Team workflow** — Designers edit in Spline and update the export; the hosted URL then serves the new scene without a developer deploy, so review changes before promoting them
