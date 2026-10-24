---
title: Build an Interactive 3D Website with React Three Fiber
slug: build-interactive-3d-website-with-react-three-fiber
description: Create an immersive 3D product landing page using React Three Fiber for declarative Three.js scenes, Drei for pre-built helpers, and Spline for designer-friendly 3D editing — building a sneaker configurator where users rotate, zoom and recolor a model in real time, with adaptive quality for phones.
skills: [react-three-fiber, drei, spline]
category: design
tags: [3d, webgl, react, threejs, product-configurator, interactive, creative-coding]
---

# Build an Interactive 3D Website with React Three Fiber

Priya is a frontend developer at a sneaker brand. The marketing team wants a landing page where customers can rotate a 3D shoe, change colors, and see it from every angle. The page needs to load fast, stay smooth on mid-range phones, and be maintainable by a React team that has never touched WebGL.

Priya uses React Three Fiber (R3F) to write Three.js as React components, Drei for ready-made helpers (controls, environment maps, text, loaders), and Spline for a hero scene the marketing team can edit without code.

## Setup

R3F 9 requires React 19 and Drei 10 pairs with it. On React 18, install `@react-three/fiber@8` and `@react-three/drei@9` instead. The examples below were type-checked against R3F 9.8, Drei 10.7 and three 0.186.

```bash
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install -D @types/three
```

## Step 1: 3D scene with React Three Fiber

Every mesh, light and material is a React component with props, state and hooks. `shadows` on the `Canvas` is what makes `castShadow` do anything, and Drei's `Loader` is a DOM overlay, so it lives outside the `Canvas`.

```tsx
// src/ProductScene.tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Float, PerformanceMonitor, Loader } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Suspense, useState } from "react";
import { SneakerModel, type MaterialName } from "./SneakerModel";

interface ProductSceneProps {
  selectedColor: string; // hex color from the UI
  selectedMaterial: MaterialName;
}

export function ProductScene({ selectedColor, selectedMaterial }: ProductSceneProps) {
  const [dpr, setDpr] = useState(1.5);

  return (
    <>
      <Canvas shadows camera={{ position: [0, 2, 5], fov: 45 }} dpr={dpr} style={{ height: "100vh" }}>
        {/* Lowers pixel ratio when the frame rate drops, raises it when there is headroom */}
        <PerformanceMonitor onChange={({ factor }) => setDpr(Math.round((0.5 + 1.5 * factor) * 10) / 10)} />
        <Environment preset="studio" />
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />

        <Suspense fallback={null}>
          <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
            <SneakerModel color={selectedColor} material={selectedMaterial} />
          </Float>
          <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={10} blur={2.5} />
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={8}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2}
          autoRotate
          autoRotateSpeed={0.5}
        />

        <EffectComposer>
          <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.025} intensity={0.5} />
          <Vignette offset={0.3} darkness={0.5} />
        </EffectComposer>
      </Canvas>
      <Loader />
    </>
  );
}
```

The model component eases the material toward the chosen color inside `useFrame`, so the transition is independent of frame rate. `"Body"` is the material name the 3D artist gave the upper in this particular file; open the GLB in a viewer (or log `materials`) and use your own names.

```tsx
// src/SneakerModel.tsx
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

export type MaterialName = "leather" | "mesh" | "suede";

const presets = {
  leather: { roughness: 0.4, metalness: 0.1, clearcoat: 0.8 },
  mesh: { roughness: 0.8, metalness: 0.0, clearcoat: 0.0 },
  suede: { roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
};

export function SneakerModel({ color, material }: { color: string; material: MaterialName }) {
  const { scene, materials } = useGLTF("/models/sneaker.glb");
  const body = materials["Body"] as THREE.MeshPhysicalMaterial;
  const target = useMemo(() => new THREE.Color(color), [color]);
  const preset = presets[material];

  useFrame((_, delta) => {
    body.color.lerp(target, 1 - Math.exp(-8 * delta));
    body.roughness = preset.roughness;
    body.metalness = preset.metalness;
    body.clearcoat = preset.clearcoat;
  });

  return <primitive object={scene} scale={1.5} />;
}

useGLTF.preload("/models/sneaker.glb");
```

## Step 2: Annotations with Drei

`Html` pins DOM elements to a point in 3D space, and `Text` renders SDF text that faces the camera inside a `Billboard`. Put the component inside the `Canvas`.

```tsx
// src/ProductAnnotations.tsx
import { Html, Text, Billboard } from "@react-three/drei";

export function ProductAnnotations() {
  return (
    <>
      <Html position={[1.2, 0.5, 0]} distanceFactor={5} occlude>
        <div className="rounded-lg bg-black/80 px-3 py-1.5 text-sm text-white backdrop-blur">
          <span className="font-bold">Foam midsole</span>
        </div>
      </Html>
      <Billboard position={[-1.5, 1.5, 0]}>
        <Text fontSize={0.15} color="#ffffff" anchorX="center" anchorY="middle" font="/fonts/Inter-Bold.woff">
          Recycled mesh
        </Text>
      </Billboard>
    </>
  );
}
```

Only claim things the brand can back up in labels like these; the text above is placeholder copy.

## Step 3: Designer-editable hero with Spline

The marketing team builds the hero in Spline's browser editor (camera, lights, animation, hover and click events). In the editor, **Export → Code → React** gives a `scene.splinecode` URL. After the team changes the scene they update the export, and the same URL serves the new version without a developer deploy, so review changes before promoting them.

```bash
npm install @splinetool/react-spline @splinetool/runtime
```

```tsx
// src/SplineHero.tsx
import Spline from "@splinetool/react-spline";
import type { Application } from "@splinetool/runtime";

export function SplineHero() {
  function onLoad(spline: Application) {
    // Object names are the ones set in the Spline editor
    const shoe = spline.findObjectByName("Sneaker");
    if (shoe) shoe.visible = true;
  }
  return (
    <Spline scene={process.env.NEXT_PUBLIC_SPLINE_SCENE_URL!} onLoad={onLoad} style={{ width: "100%", height: "100vh" }} />
  );
}
```

Keep the scene URL in an environment variable so staging and production can point at different exports. Spline events only exist in the React and vanilla JS code exports, not in the Three.js export.

## Step 4: Keep the model small

Most of the load time is the GLB and its textures. glTF Transform compresses geometry (Draco or Meshopt) and textures (KTX2 or WebP) in one command:

```bash
npx @gltf-transform/cli optimize sneaker.glb public/models/sneaker.glb \
  --compress draco --texture-compress webp
```

`useGLTF` loads the Draco decoder automatically. Measure on a real mid-range phone with the browser's performance panel rather than trusting a desktop frame rate; the `PerformanceMonitor` in Step 1 handles the rest by trading pixel ratio for smoothness.

## Result

Priya ships one page with two 3D layers: a Spline hero the marketing team owns, and an R3F configurator the engineers own. Color and material changes ease in smoothly, the canvas lowers its pixel ratio on slow devices, and the compressed GLB loads behind a progress indicator. Track load time, frame rate on target phones and add-to-cart rate yourself before and after launch; the right numbers are the ones from your own analytics.

## Related Skills

- [react-three-fiber](../skills/react-three-fiber/SKILL.md) - declarative Three.js scenes, hooks and performance rules
- [drei](../skills/drei/SKILL.md) - controls, environments, loaders, text and HTML helpers
- [spline](../skills/spline/SKILL.md) - embedding and controlling scenes designed in Spline
