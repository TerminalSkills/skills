---
name: drei
description: >-
   You are an expert in @react-three/drei, the companion library for React
  Three Fiber that provides 100+ ready-made components and hooks for common 3D
  patterns. You help developers add orbit controls, environment maps, text
  rendering, HTML overlays, loaders, performance utilities, shaders, and
  abstractions — eliminating boilerplate and letting teams focus on creative
  work instead of Three.js plumbing.
category: 3D & Creative
tags: [3d, react, threejs, helpers, controls, abstractions, r3f]
version: 1.0.0
author: terminal-skills
---

# Drei — Essential Helpers for React Three Fiber

You are an expert in @react-three/drei, the companion library for React Three Fiber that provides 100+ ready-made components and hooks for common 3D patterns. You help developers add orbit controls, environment maps, text rendering, HTML overlays, loaders, performance utilities, shaders, and abstractions — eliminating boilerplate and letting teams focus on creative work instead of Three.js plumbing.

## Core Capabilities

### Controls

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

### Environment and Lighting

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

### Text and HTML

```tsx
import { Text, Text3D, Html, Billboard } from "@react-three/drei";

// 2D text in 3D space (SDF rendering, crisp at any distance)
<Text fontSize={0.5} color="white" anchorX="center" font="/fonts/Inter.woff">
  Hello World
</Text>

// Extruded 3D text (geometry)
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

### Loaders and Assets

```tsx
import { useGLTF, useTexture, useVideoTexture, useFBX, Preload } from "@react-three/drei";

// GLTF model
const { scene, nodes, materials } = useGLTF("/model.glb");

// Textures (with auto-disposal)
const [colorMap, normalMap, roughnessMap] = useTexture([
  "/textures/color.jpg",
  "/textures/normal.jpg",
  "/textures/roughness.jpg",
]);

// Video as texture (for screens, billboards)
const videoTexture = useVideoTexture("/video/demo.mp4");

// Preload all assets inside Canvas
<Preload all />
```

### Shapes and Helpers

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

### Performance

```tsx
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor, Instances, Detailed } from "@react-three/drei";

// Auto-adjust quality
<AdaptiveDpr pixelated />
<PerformanceMonitor onDecline={() => setDpr(0.5)} onIncline={() => setDpr(1)} />

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
  {positions.map((pos, i) => <Instance key={i} position={pos} />)}
</Instances>
```

## Installation

```bash
npm install @react-three/drei
# Peer dependency: @react-three/fiber three
```

## Best Practices

1. **Stage for quick setup** — Use `<Stage>` to get instant professional lighting and shadows for product shots
2. **Environment for reflections** — Always add `<Environment>`; PBR materials look flat without it
3. **Html for UI in 3D** — Use `<Html>` for tooltips, labels, buttons; `occlude` hides them behind 3D objects
4. **Float for motion** — Wrap any object in `<Float>` for gentle floating animation; great for hero sections
5. **ContactShadows** — Cheaper than real shadows; place below objects for grounding effect
6. **Instances for performance** — Use `<Instances>` for forests, particle fields, city blocks; 100x faster than individual meshes
7. **Preload assets** — Add `<Preload all />` inside Canvas; assets load before scene renders
8. **ScrollControls for landing pages** — Scroll-linked 3D animations without external libraries; `useScroll()` gives normalized progress
