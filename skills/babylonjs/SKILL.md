---
name: babylonjs
description: >-
  Babylon.js is an open-source 3D engine for the browser that renders with
  WebGL or WebGPU and includes a scene graph, PBR materials, glTF loading,
  Havok physics, a GUI layer and WebXR. Use when a user asks to build a 3D
  scene, game, product configurator or VR/AR experience with Babylon.js, load a
  glTF/GLB model, add physics or in-scene UI, switch to WebGPU, or shrink a
  Babylon.js bundle.
license: Apache-2.0
compatibility: "Babylon.js 9 (@babylonjs/* ES module packages) with a bundler such as Vite; WebGL2 or WebGPU browser; Havok needs WebAssembly SIMD"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: design
  repository: https://github.com/BabylonJS/Babylon.js
  tags:
    - 3d
    - game-engine
    - webgl
    - webgpu
    - physics
---

# Babylon.js — Professional 3D Engine for the Web

## Overview

Babylon.js is a complete 3D engine written in TypeScript: scene graph, cameras, lights, PBR materials, animation, particles, glTF and other loaders, Havok physics, a 2D/3D GUI and WebXR, running on WebGL or WebGPU. In a bundled app use the `@babylonjs/*` ES module packages (core, loaders, gui and materials share one version number, currently 9.x; `@babylonjs/havok` is versioned separately); the `babylonjs` UMD package is for pages without a bundler, and the CDN scripts are for playgrounds and quick experiments.

## Instructions

### Installation

```bash
npm install @babylonjs/core @babylonjs/loaders @babylonjs/gui
npm install @babylonjs/havok                # Physics (optional)
npm install @babylonjs/materials            # Advanced materials (optional)
npm install --save-dev @babylonjs/inspector # Debug inspector (optional)
```

The page needs a canvas: `<canvas id="renderCanvas" style="width:100%;height:100%"></canvas>`.

### Scene Setup

```typescript
// src/main.ts — Babylon.js scene
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, MeshBuilder, PBRMaterial, Color3, Color4,
} from "@babylonjs/core";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { adaptToDeviceRatio: true });   // 2nd argument: antialiasing

const scene = new Scene(engine);
scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

// Camera (orbit around target)
const camera = new ArcRotateCamera("camera", Math.PI / 4, Math.PI / 3, 10, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3;              // Min zoom
camera.upperRadiusLimit = 20;             // Max zoom

// Lighting
const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
light.intensity = 0.7;

// PBR Material
const material = new PBRMaterial("pbr", scene);
material.albedoColor = new Color3(0.8, 0.2, 0.3);
material.metallic = 0.3;
material.roughness = 0.4;

// Mesh
const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2, segments: 32 }, scene);
sphere.material = material;

// Render loop
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
```

### Loading 3D Models

```typescript
import { ImportMeshAsync, LoadAssetContainerAsync } from "@babylonjs/core";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

registerBuiltInLoaders();                 // once at startup; each loader is downloaded on first use

// Load a glTF/GLB model: the URL comes first, the scene second
const result = await ImportMeshAsync("/models/product.glb", scene);
const model = result.meshes[0];           // "__root__" node that parents the glTF content
model.scaling = new Vector3(0.5, 0.5, 0.5);

// Access specific meshes by name
const body = scene.getMeshByName("Body");
if (body?.material instanceof PBRMaterial) {
  body.material.albedoColor = new Color3(1, 0, 0);   // Red
}

// Load without showing, then add (and later remove) everything in one call
const container = await LoadAssetContainerAsync("/models/showroom.glb", scene);
container.addAllToScene();
```

`SceneLoader.ImportMeshAsync("", "/models/", "product.glb", scene)` from older tutorials still works but is deprecated in favour of these module-level functions.

### Physics (Havok)

```typescript
import { HavokPlugin, PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

// Initialize Havok (downloads and compiles HavokPhysics.wasm)
const havok = await HavokPhysics();
scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

// Add physics to meshes
const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);  // mass 0 = static

const ball = MeshBuilder.CreateSphere("ball", { diameter: 1 }, scene);
ball.position.y = 10;
new PhysicsAggregate(ball, PhysicsShapeType.SPHERE, {
  mass: 1,
  restitution: 0.7,                      // Bounciness
}, scene);
```

### GUI (2D UI in 3D)

```typescript
import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

// Full-screen UI overlay
const ui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

const panel = new StackPanel();
panel.width = "220px";
panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
panel.paddingTop = "20px";
panel.paddingLeft = "20px";
ui.addControl(panel);

const button = Button.CreateSimpleButton("btn", "Change Color");
button.width = "200px";
button.height = "40px";
button.color = "white";
button.background = "#6366f1";
button.onPointerClickObservable.add(() => {
  material.albedoColor = Color3.Random();
});
panel.addControl(button);

// Label that follows a mesh on screen
const label = new Rectangle("label");
label.width = "140px";
label.height = "32px";
label.thickness = 0;
label.background = "#000000aa";
ui.addControl(label);                    // must be added to the texture before linking
label.linkWithMesh(sphere);
label.linkOffsetY = -80;

const text = new TextBlock("labelText", "Trail Runner 2");
text.color = "white";
text.fontSize = 16;
label.addControl(text);
```

### WebXR (VR/AR)

```typescript
// VR: adds an "enter VR" button, teleportation on the floor meshes and controller pointers
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
});

// AR instead of VR
const xrAR = await scene.createDefaultXRExperienceAsync({
  uiOptions: { sessionMode: "immersive-ar", referenceSpaceType: "local-floor" },
  optionalFeatures: true,
});
```

### WebGPU and the Inspector

```typescript
import { Engine, WebGPUEngine } from "@babylonjs/core";

// WebGPU must be initialized asynchronously; fall back to WebGL where it is missing
const engine = (await WebGPUEngine.IsSupportedAsync)
  ? await WebGPUEngine.CreateAsync(canvas, { adaptToDeviceRatio: true })
  : new Engine(canvas, true);

if (import.meta.env.DEV) {                 // Vite dev server only: scene explorer, properties, stats
  const { ShowInspector } = await import("@babylonjs/inspector");   // a static import would ship it to production
  ShowInspector(scene);
}
```

## Examples

### Example 1: A product viewer with Vite

**User request:** "Show our shoe model in the browser so people can orbit around it and change its color."

```bash
npm install @babylonjs/core @babylonjs/loaders @babylonjs/gui
npm install --save-dev vite typescript
```

Put the canvas in `index.html` with `<script type="module" src="/src/main.ts"></script>`, copy the model to `public/models/product.glb`, and assemble `src/main.ts` from the Scene Setup, Loading 3D Models and GUI blocks above — without the demo sphere and the `showroom.glb` lines (a failed load rejects the top-level `await`, so the GUI code never runs), with the button setting `body.material.albedoColor` and the label linked to `model`. Then `npx vite` serves it and `npx vite build` produces the deployable files (two of about 1,100 output lines, because the dynamic imports split the engine into many chunks):

```
dist/assets/glTFLoader.pure-CG7fbjTQ.js      69.17 kB │ gzip:  18.79 kB
dist/assets/index-8MhFnHTx.js             4,063.46 kB │ gzip: 874.64 kB
✓ built in 684ms
```

The glTF loader is a separate chunk that is fetched only when the first model loads; the scene shows the model on a dark background, dragging orbits the camera, and the button assigns a random albedo color to the `Body` mesh.

### Example 2: Shrink the bundle

**User request:** "Our Babylon.js bundle is several megabytes. Can you cut it down?"

Importing from the package root pulls in the whole engine because many modules have side effects. Import each class from its own module instead (folders start with an upper-case letter, files with a lower-case one):

```typescript
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";

const sphere = CreateSphere("sphere", { diameter: 2, segments: 32 }, scene);   // instead of MeshBuilder.CreateSphere
```

For the Scene Setup block above, the entry chunk of the Vite build goes from 6,676 kB (1,475 kB gzip) to 967 kB (236 kB gzip). Features added through module augmentation need their own side-effect import, for example `import "@babylonjs/core/Physics/physicsEngineComponent.js"` for `scene.enablePhysics` and `import "@babylonjs/core/Helpers/sceneHelpers.js"` for `scene.createDefaultXRExperienceAsync`.

## Guidelines

1. **PBR materials** — use `PBRMaterial` for realistic rendering; set metallic/roughness and give the scene an environment texture (`scene.environmentTexture`), because PBR reflections come from it.
2. **Asset loading** — call `registerBuiltInLoaders()` once, then `ImportMeshAsync(url, scene)`; without a registered loader a `.glb` cannot be read. Compress large models with Draco or Meshopt.
3. **Havok physics** — Havok is the recommended engine (Physics V2); the Ammo, Cannon and Oimo plugins are deprecated. It needs WebAssembly SIMD (not available on iOS before 16.4), and in Node the wasm must be passed in: `HavokPhysics({ wasmBinary })`.
4. **Inspector** — keep `@babylonjs/inspector` out of production bundles (it brings React and Fluent UI): load it with a dynamic `import()` behind a dev check, because a guarded static import is not tree-shaken; the older `scene.debugLayer.show()` call still works once `@babylonjs/core/Debug/debugLayer.js` and `@babylonjs/inspector` are imported.
5. **Node Material Editor** — build custom shaders visually at nme.babylonjs.com instead of writing GLSL/WGSL; `npx -y @babylonjs/mcp-servers nme` starts an MCP server for that editor (`gui`, `nge` and `npe` do the same for the GUI, geometry and particle editors).
6. **GUI for UI** — Babylon GUI draws buttons, panels and sliders inside the canvas, as a fullscreen overlay or on a mesh (`AdvancedDynamicTexture.CreateForMesh`); labels that track an object use `linkWithMesh`. For forms and long text use regular HTML over the canvas.
7. **WebGPU** — `new WebGPUEngine(canvas)` is unusable until `await engine.initAsync()` (or use `WebGPUEngine.CreateAsync`); always keep the WebGL fallback.
8. **XR** — WebXR only runs on HTTPS (or localhost) and must start from a user gesture, which the default enter-XR button provides. XR on a WebGPU engine is experimental and needs `{ xrCompatible: true }` at engine creation; use the WebGL engine for XR otherwise.
9. **Clean up** — in single-page apps call `scene.dispose()` and `engine.dispose()` when the view unmounts, or WebGL contexts and listeners leak.
10. **CDN scripts are not for production** — the Babylon team asks that `cdn.babylonjs.com` be used for learning and experiments only; bundle or self-host for a live site.
11. **When not to use** — to only display a model with orbit controls, the `@babylonjs/viewer` package is enough; for a 2D game or chart a 3D engine is overhead.
