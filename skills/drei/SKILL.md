---
name: drei
description: >-
  Drei (@react-three/drei) is the helper library for React Three Fiber with
  ready-made 3D components: orbit controls, environment lighting, text, HTML
  overlays, model and texture loaders, instancing and performance tools. Use
  when someone asks to "add OrbitControls", "load a GLTF model in React Three
  Fiber", "add an HDR environment", "put HTML labels in a 3D scene", "render 3D
  text", or "speed up a three.js scene in React".
license: Apache-2.0
compatibility: 'React 19, @react-three/fiber 9, three r159 or newer (drei 10)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: design
  repository: https://github.com/pmndrs/drei
  tags: "3d, react, threejs, r3f, helpers"
---

# Drei — Essential Helpers for React Three Fiber

## Overview

Drei is the companion library of React Three Fiber (R3F). It adds controls, environment and lighting helpers, text, HTML in 3D, loaders and performance utilities as components and hooks, so you skip the Three.js plumbing. Checked against `@react-three/drei` 10.7.9 and `@react-three/fiber` 9.8.2: drei 10 needs React 19 and fiber 9; for React 18 and fiber 8 stay on drei 9.

## Instructions

### Install

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

Every drei component must render inside a fiber `<Canvas>`. Components that load files (`useGLTF`, `useTexture`, `Environment`, `Text`) suspend, so wrap the scene in `<Suspense>`.

```tsx
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";

function Sneaker() {
  const { scene } = useGLTF("/models/sneaker.glb");
  return <primitive object={scene} />;
}

export default function Viewer() {
  return (
    <Canvas camera={{ position: [0, 1, 4], fov: 45 }}>
      <Suspense fallback={null}>
        <Sneaker />
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls makeDefault enablePan={false} />
    </Canvas>
  );
}
```

### Components by task

#### Controls

```tsx
import { OrbitControls, MapControls, FlyControls, ScrollControls } from "@react-three/drei";

// Orbit around an object (product viewer)
<OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} />

// Map-style controls (top-down, pan + zoom)
<MapControls enableRotate={false} />

// Fly through scene (game, architectural viz)
<FlyControls movementSpeed={5} rollSpeed={0.5} />

// Scroll-linked animation (landing pages)
<ScrollControls pages={3} damping={0.25}>
  <SceneContent />   {/* useScroll() inside to read scroll position */}
</ScrollControls>
```

#### Environment and Lighting

```tsx
import { Environment, Lightformer, Sky, Stars, Stage } from "@react-three/drei";

// HDR environment map (realistic reflections)
<Environment preset="sunset" />
<Environment files="/hdri/warehouse.hdr" />

// Custom studio lighting
<Environment>
  <Lightformer position={[0, 5, 0]} scale={10} intensity={2} />
  <Lightformer position={[5, 0, 0]} scale={5} color="blue" />
</Environment>

// Quick product staging (auto lighting + shadows)
<Stage environment="city" intensity={0.5} shadows adjustCamera>
  <Model />
</Stage>

// Procedural sky
<Sky sunPosition={[100, 10, 100]} turbidity={8} />
<Stars radius={100} depth={50} count={5000} />
```

#### Text and HTML

```tsx
import { Text, Text3D, Html, Billboard } from "@react-three/drei";

// 2D text in 3D space (SDF rendering, crisp at any distance)
<Text fontSize={0.5} color="white" anchorX="center" font="/fonts/Inter.woff">  {/* .woff/.ttf/.otf; woff2 is not supported */}
  Hello World
</Text>

// Extruded 3D text (needs a typeface.js JSON font, not a .woff/.ttf)
<Text3D font="/fonts/Inter_Bold.json" size={1} height={0.2} bevelEnabled bevelSize={0.02}>
  3D TEXT
  <meshStandardMaterial color="gold" metalness={0.8} />
</Text3D>

// HTML DOM elements in 3D space
<Html position={[0, 2, 0]} center distanceFactor={5} occlude>
  <div className="bg-white p-4 rounded-lg shadow">
    <h3>Product Info</h3>
    <button onClick={handleBuy}>Buy Now</button>
  </div>
</Html>

// Always face camera
<Billboard><Text>Always visible</Text></Billboard>
```

#### Loaders and Assets

```tsx
import { useGLTF, useTexture, useVideoTexture, useFBX, Preload } from "@react-three/drei";

// GLTF model
const { scene, nodes, materials } = useGLTF("/model.glb");

// Textures (cached; suspends until loaded)
const [colorMap, normalMap, roughnessMap] = useTexture([
  "/textures/color.jpg",
  "/textures/normal.jpg",
  "/textures/roughness.jpg",
]);

// Video as texture (for screens, billboards)
const videoTexture = useVideoTexture("/video/demo.mp4");

// Preload everything inside the Canvas's Suspense boundary
<Preload all />

// Optional: start fetching a model before the component mounts
useGLTF.preload("/model.glb");
```

#### Shapes and Helpers

```tsx
import {
  RoundedBox, Sphere, Torus, Line, QuadraticBezierLine,
  Float, MeshWobbleMaterial, MeshDistortMaterial, ContactShadows,
  Grid, GizmoHelper, GizmoViewport,
} from "@react-three/drei";

// Pre-built geometries
<RoundedBox args={[1, 1, 1]} radius={0.1} smoothness={4}>
  <meshStandardMaterial color="blue" />
</RoundedBox>

// Animated materials
<Sphere args={[1, 64, 64]}>
  <MeshDistortMaterial color="#8B5CF6" speed={2} distort={0.3} />
</Sphere>

// Floating animation
<Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
  <Model />
</Float>

// Ground shadows (no shadow plane needed)
<ContactShadows position={[0, -1, 0]} opacity={0.5} blur={2} />

// Debug grid
<Grid infiniteGrid fadeDistance={30} cellColor="#6f6f6f" />
```

#### Performance

```tsx
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor, Instances, Instance, Detailed } from "@react-three/drei";

// Auto-adjust quality: PerformanceMonitor reports, you lower the Canvas dpr
const [dpr, setDpr] = useState(1.5)
<Canvas dpr={dpr}>
  <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
  <AdaptiveDpr pixelated />   {/* lowers dpr while the camera moves */}
</Canvas>

// LOD (Level of Detail)
<Detailed distances={[0, 20, 50]}>
  <HighPolyModel />    {/* Close */}
  <MedPolyModel />     {/* Medium */}
  <LowPolyModel />     {/* Far */}
</Detailed>

// GPU instancing for 1000s of objects
<Instances limit={1000}>
  <boxGeometry />
  <meshStandardMaterial />
  {positions.map((pos, i) => <Instance key={i} position={pos} />)}  {/* limit must be >= number of instances */}
</Instances>
```

## Examples

### Example 1: Product viewer
**User:** "Show our sneaker.glb in a React page that people can rotate, with soft lighting and a shadow under it."

Use the `Viewer` above and wrap the model in `<Stage environment="city" intensity={0.5} shadows adjustCamera>`, which adds lighting, a contact shadow and camera framing. `OrbitControls` with `makeDefault` handles rotation; `enablePan={false}` keeps the product centered. Run `npx tsc --noEmit` to confirm the imports resolve; at runtime the model appears centered with a soft ground shadow.

### Example 2: Labels and many objects in one scene
**User:** "Put clickable price tags over 500 boxes in a warehouse scene and keep it at 60 fps."

Render the boxes with one `<Instances limit={500}>` and 500 `<Instance>` children (one draw call). Add a single `<Html>` tag only for the hovered or selected box rather than 500 DOM overlays, and add `<PerformanceMonitor>` plus `<AdaptiveDpr pixelated />` to lower resolution when the frame rate drops.

## Guidelines

- Presets (`<Environment preset="sunset" />`) download their HDR from a public CDN at runtime, and `useGLTF` fetches the Draco decoder from `gstatic.com` unless you configure your own. For offline, privacy-restricted or production-critical sites, self-host an HDR and pass `files="/hdri/warehouse.hdr"`, and call `useGLTF.setDecoderPath("/draco/")`.
- Always add an `<Environment>`; PBR materials look flat without one.
- `Html` creates real DOM nodes: fine for a few labels, wasteful for hundreds. `occlude` hides them behind meshes.
- Use `<Instances>` for many copies of one geometry; `limit` must be at least the instance count.
- `ContactShadows` is much cheaper than real shadow maps; use it to ground objects.
- Put `<Preload all />` inside the Suspense boundary so assets load before first render.
- Import from `@react-three/drei`, not its internal paths; React Native projects use `@react-three/drei/native`.
- Do not mix drei 10 with React 18; install a matching pair or you get peer-dependency errors.
