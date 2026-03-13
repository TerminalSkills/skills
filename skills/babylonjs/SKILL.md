---
name: babylonjs
description: >-
   You are an expert in Babylon.js, the powerful open-source 3D engine for web
  browsers with WebGL and WebGPU support. You help developers build games,
  product configurators, architectural visualizations, VR/AR experiences, and
  interactive 3D applications — using Babylon's scene graph, PBR materials,
  Havok physics, particle systems, GUI, animation, and XR support for
  production-grade 3D on the web.
category: 3D & Creative
tags: [3d, game-engine, webgl, webgpu, physics, xr, interactive]
version: 1.0.0
author: terminal-skills
---

# Babylon.js — Professional 3D Engine for the Web

You are an expert in Babylon.js, the powerful open-source 3D engine for web browsers with WebGL and WebGPU support. You help developers build games, product configurators, architectural visualizations, VR/AR experiences, and interactive 3D applications — using Babylon's scene graph, PBR materials, Havok physics, particle systems, GUI, animation, and XR support for production-grade 3D on the web.

## Core Capabilities

### Scene Setup

```typescript
// src/main.ts — Babylon.js scene
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, MeshBuilder, PBRMaterial, Color3,
} from "@babylonjs/core";
import "@babylonjs/loaders";              // GLTF/GLB loader

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, {
  adaptToDeviceRatio: true,
  antialias: true,
});

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
import { SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

// Load GLTF model
const result = await SceneLoader.ImportMeshAsync("", "/models/", "product.glb", scene);
const model = result.meshes[0];
model.scaling = new Vector3(0.5, 0.5, 0.5);
model.position = new Vector3(0, 0, 0);

// Access specific meshes by name
const body = scene.getMeshByName("Body");
if (body && body.material) {
  (body.material as PBRMaterial).albedoColor = new Color3(1, 0, 0);  // Red
}
```

### Physics (Havok)

```typescript
import { HavokPlugin } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

// Initialize Havok physics
const havok = await HavokPhysics();
const physicsPlugin = new HavokPlugin(true, havok);
scene.enablePhysics(new Vector3(0, -9.81, 0), physicsPlugin);

// Add physics to meshes
const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);  // Static

const ball = MeshBuilder.CreateSphere("ball", { diameter: 1 }, scene);
ball.position.y = 10;
new PhysicsAggregate(ball, PhysicsShapeType.SPHERE, {
  mass: 1,
  restitution: 0.7,                      // Bounciness
}, scene);
```

### GUI (2D UI in 3D)

```typescript
import { AdvancedDynamicTexture, Button, TextBlock, StackPanel } from "@babylonjs/gui";

// Full-screen UI overlay
const ui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

const panel = new StackPanel();
panel.width = "220px";
panel.horizontalAlignment = 0;           // Left
panel.verticalAlignment = 0;             // Top
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

// 3D-attached UI (label following a mesh)
const label = AdvancedDynamicTexture.CreateForMesh(sphere);
const text = new TextBlock();
text.text = "Product Name";
text.color = "white";
text.fontSize = 24;
label.addControl(text);
```

### WebXR (VR/AR)

```typescript
// Enable VR with one line
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
  uiOptions: { sessionMode: "immersive-vr" },
});

// AR mode
const xrAR = await scene.createDefaultXRExperienceAsync({
  uiOptions: { sessionMode: "immersive-ar" },
});
```

## Installation

```bash
npm install @babylonjs/core @babylonjs/loaders @babylonjs/gui
npm install @babylonjs/havok                # Physics (optional)
npm install @babylonjs/materials            # Advanced materials (optional)
```

## Best Practices

1. **PBR materials** — Use PBRMaterial for realistic rendering; set metallic/roughness and add environment texture for reflections
2. **Asset loading** — Use `SceneLoader.ImportMeshAsync` for GLTF; compress with Draco for smaller files
3. **Havok physics** — Babylon uses Havok (same as AAA games); fast and accurate for interactive simulations
4. **Inspector** — Press F12 → `scene.debugLayer.show()` for the built-in inspector; invaluable for debugging
5. **Node Material Editor** — Use the visual shader editor (NME) for custom materials without writing GLSL
6. **GUI for UI** — Use Babylon.GUI for buttons, panels, sliders; works in both 2D overlay and 3D-attached modes
7. **WebGPU ready** — Babylon supports WebGPU; use `new WebGPUEngine(canvas)` for next-gen performance
8. **XR from day one** — If your project might go VR/AR, Babylon's XR module is the most mature on the web
