---
title: Build an Interactive 3D Website with React Three Fiber
slug: build-interactive-3d-website-with-react-three-fiber
description: Create an immersive 3D product landing page using React Three Fiber for declarative Three.js scenes, Drei for pre-built helpers, and Spline for designer-friendly 3D editing — building a sneaker configurator where users rotate, zoom, and customize colors in real-time with 60fps performance on mobile.
skills: [react-three-fiber, drei, spline]
category: 3D & Creative
tags: [3d, webgl, react, threejs, product-configurator, interactive, creative-coding]
---

# Build an Interactive 3D Website with React Three Fiber

Priya is a frontend developer at a sneaker brand. The marketing team wants a landing page where customers can rotate a 3D shoe, change colors, and see it from every angle — like Nike's product pages but custom-built. The page needs to load fast (under 3 seconds), run at 60fps on iPhone 13, and be maintainable by a React team that's never touched WebGL.

Priya uses React Three Fiber (R3F) to write Three.js as React components, Drei for pre-built 3D helpers (orbit controls, environment maps, text), and Spline for the initial 3D scene design that the marketing team can edit without code.

## Step 1: 3D Scene with React Three Fiber

React Three Fiber lets the team write Three.js using JSX — every mesh, light, and material is a React component with props, state, and hooks.

```tsx
// src/components/ProductScene.tsx — Main 3D scene
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Float } from "@react-three/drei";
import { Suspense, useRef, useState } from "react";
import { SneakerModel } from "./SneakerModel";
import { LoadingSpinner } from "./LoadingSpinner";

interface ProductSceneProps {
  selectedColor: string;                  // Hex color from UI
  selectedMaterial: "leather" | "mesh" | "suede";
}

export function ProductScene({ selectedColor, selectedMaterial }: ProductSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 2, 5], fov: 45 }}
      dpr={[1, 2]}                        // Adaptive resolution (1x–2x)
      gl={{ antialias: true, alpha: true }}
      style={{ height: "100vh" }}
    >
      {/* HDR environment for realistic reflections */}
      <Environment preset="studio" />

      {/* Soft ambient + directional light */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}     // Shadow quality
      />

      <Suspense fallback={<LoadingSpinner />}>
        {/* Floating animation for visual interest */}
        <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
          <SneakerModel
            color={selectedColor}
            material={selectedMaterial}
          />
        </Float>

        {/* Soft shadow on ground plane */}
        <ContactShadows
          position={[0, -1.5, 0]}
          opacity={0.4}
          scale={10}
          blur={2.5}
        />
      </Suspense>

      {/* User-controlled camera rotation */}
      <OrbitControls
        enablePan={false}                 // Lock pan (product focus)
        enableZoom={true}
        minDistance={3}                    // Don't zoom too close
        maxDistance={8}                    // Don't zoom too far
        minPolarAngle={Math.PI / 6}       // Don't go below ground
        maxPolarAngle={Math.PI / 2}       // Don't go above top
        autoRotate                        // Slow auto-rotate when idle
        autoRotateSpeed={0.5}
      />
    </Canvas>
  );
}
```

```tsx
// src/components/SneakerModel.tsx — 3D model with dynamic materials
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect } from "react";
import * as THREE from "three";

interface SneakerModelProps {
  color: string;
  material: "leather" | "mesh" | "suede";
}

// Material presets with PBR properties
const materialPresets = {
  leather: { roughness: 0.4, metalness: 0.1, clearcoat: 0.8 },
  mesh: { roughness: 0.8, metalness: 0.0, clearcoat: 0.0 },
  suede: { roughness: 0.9, metalness: 0.0, clearcoat: 0.0 },
};

export function SneakerModel({ color, material }: SneakerModelProps) {
  const { scene, nodes, materials } = useGLTF("/models/sneaker.glb");
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate color transitions smoothly
  useEffect(() => {
    const targetColor = new THREE.Color(color);
    const bodyMaterial = materials["Body"] as THREE.MeshPhysicalMaterial;

    // Lerp to new color over 300ms
    const startColor = bodyMaterial.color.clone();
    let t = 0;
    const animate = () => {
      t += 0.05;
      if (t <= 1) {
        bodyMaterial.color.lerpColors(startColor, targetColor, t);
        requestAnimationFrame(animate);
      }
    };
    animate();

    // Apply material preset
    const preset = materialPresets[material];
    bodyMaterial.roughness = preset.roughness;
    bodyMaterial.metalness = preset.metalness;
    bodyMaterial.clearcoat = preset.clearcoat;
  }, [color, material, materials]);

  return <primitive ref={meshRef} object={scene} scale={1.5} />;
}

// Preload model during page load
useGLTF.preload("/models/sneaker.glb");
```

## Step 2: Pre-Built Helpers with Drei

Drei provides 100+ ready-made components that would take days to build from scratch: text, HTML overlays in 3D space, performance monitors, loaders, and post-processing effects.

```tsx
// src/components/ProductAnnotations.tsx — HTML labels in 3D space
import { Html, Text, Billboard } from "@react-three/drei";

export function ProductAnnotations() {
  return (
    <>
      {/* HTML overlay positioned in 3D space */}
      <Html
        position={[1.2, 0.5, 0]}
        distanceFactor={5}                // Scale with distance
        occlude                           // Hide when behind objects
      >
        <div className="bg-black/80 text-white px-3 py-1.5 rounded-lg text-sm backdrop-blur">
          <span className="font-bold">AirFlex™ Sole</span>
          <p className="text-xs text-gray-300 mt-1">30% lighter than standard foam</p>
        </div>
      </Html>

      {/* 3D text that always faces camera */}
      <Billboard position={[-1.5, 1.5, 0]}>
        <Text
          fontSize={0.15}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          font="/fonts/Inter-Bold.woff"
        >
          Recycled Mesh
        </Text>
      </Billboard>
    </>
  );
}
```

```tsx
// src/components/PostProcessing.tsx — Visual effects
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";

export function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.9}
        luminanceSmoothing={0.025}
        intensity={0.5}                   // Subtle glow on bright areas
      />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  );
}
```

## Step 3: Designer-Friendly Editing with Spline

The marketing team needs to tweak the scene without writing code. Spline provides a Figma-like 3D editor that exports directly to React.

```tsx
// src/components/SplineHero.tsx — Spline scene as React component
import Spline from "@splinetool/react-spline";

export function SplineHero() {
  return (
    <Spline
      scene="https://prod.spline.design/abc123/scene.splinecode"
      onLoad={(spline) => {
        // Access Spline objects programmatically
        const shoe = spline.findObjectByName("Sneaker");
        // Respond to user interactions defined in Spline
      }}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}

// Marketing team workflow:
// 1. Open scene in Spline editor (browser-based)
// 2. Adjust camera angles, lighting, animations
// 3. Add hover/click interactions visually
// 4. Publish — changes go live without deploy
```

## Step 4: Performance Optimization

```tsx
// src/components/PerformanceWrapper.tsx — Adaptive quality
import { useThree } from "@react-three/fiber";
import { PerformanceMonitor, AdaptiveDpr } from "@react-three/drei";
import { useState } from "react";

export function PerformanceWrapper({ children }: { children: React.ReactNode }) {
  const [quality, setQuality] = useState(1);

  return (
    <>
      {/* Auto-adjust quality based on FPS */}
      <PerformanceMonitor
        onIncline={() => setQuality(Math.min(quality + 0.1, 2))}
        onDecline={() => setQuality(Math.max(quality - 0.1, 0.5))}
      />
      <AdaptiveDpr pixelated />
      {children}
    </>
  );
}
```

## Results

The landing page launches with a 92 Lighthouse performance score. Average session duration increases from 45 seconds (old static page) to 3.2 minutes. The color configurator drives 28% more "Add to Cart" clicks compared to static product images.

- **Load time**: 2.1 seconds (model compressed with Draco, textures in KTX2)
- **FPS**: 60fps on iPhone 13, 30fps minimum on iPhone 11 (adaptive quality kicks in)
- **Model size**: 1.2MB GLB → 340KB with Draco compression
- **Bounce rate**: 67% → 41% (interactive 3D keeps users engaged)
- **Conversion**: +28% add-to-cart rate vs static images
