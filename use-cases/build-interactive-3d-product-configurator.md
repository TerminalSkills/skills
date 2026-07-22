---
title: Build an Interactive 3D Product Configurator
slug: build-interactive-3d-product-configurator
description: Build a real-time 3D product configurator using Three.js (React Three Fiber) where customers customize colors, materials, and components of a product — with smooth animations and a "share your design" feature.
skills:
  - threejs
  - framer-motion
  - nextjs
  - tailwindcss
category: development
tags:
  - 3d
  - ecommerce
  - interactive
  - webgl
  - product
---

# Build an Interactive 3D Product Configurator

Leo runs a direct-to-consumer sneaker brand. Static product photos limit sales — customers can't visualize how a custom colorway looks before ordering. Returns on custom orders run 22% because "it looked different on screen." He wants an interactive 3D configurator where customers rotate the shoe, pick colors for each panel, choose materials (leather, suede, mesh), and see the result in real-time — the same experience Nike offers, but for a small brand.

## Step 1 — Set Up the 3D Scene with React Three Fiber

React Three Fiber makes Three.js declarative. The scene, camera, lights, and model are React components with props, state, and hooks — familiar to any React developer.

```tsx
// src/components/configurator/scene.tsx — 3D scene setup.
// React Three Fiber handles the WebGL context, render loop, and disposal.
// drei provides convenient abstractions over common Three.js patterns.

"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, ContactShadows, PresentationControls } from "@react-three/drei";
import { Suspense } from "react";
import { ShoeModel } from "./shoe-model";
import { LoadingSpinner } from "./loading-spinner";
import type { ShoeConfig } from "@/lib/types";

interface SceneProps {
  config: ShoeConfig;
  onPartHover: (part: string | null) => void;
  onPartClick: (part: string) => void;
}

export function ConfiguratorScene({ config, onPartHover, onPartClick }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.8, 2.5], fov: 35 }}
      gl={{
        antialias: true,
        toneMapping: 3,          // ACESFilmicToneMapping for realistic colors
        toneMappingExposure: 1.2,
      }}
      dpr={[1, 2]}               // Limit pixel ratio for mobile performance
    >
      {/* Studio lighting: HDRI environment for realistic reflections */}
      <Environment
        preset="studio"
        environmentIntensity={0.8}
      />

      {/* Soft directional light for shadows */}
      <directionalLight
        position={[5, 5, 5]}
        intensity={0.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      {/* Ground contact shadow — soft, no hard edges */}
      <ContactShadows
        position={[0, -0.5, 0]}
        opacity={0.4}
        scale={5}
        blur={2.5}
      />

      {/* Presentation controls: drag to rotate, spring back on release */}
      <PresentationControls
        global
        rotation={[0.1, 0.4, 0]}
        polar={[-0.2, 0.3]}       // Limit vertical rotation
        azimuth={[-Infinity, Infinity]}
        speed={1.5}
        zoom={0.8}
      >
        <Suspense fallback={<LoadingSpinner />}>
          <ShoeModel
            config={config}
            onPartHover={onPartHover}
            onPartClick={onPartClick}
          />
        </Suspense>
      </PresentationControls>
    </Canvas>
  );
}
```

## Step 2 — Load and Configure the 3D Model

The shoe model is a glTF file with named mesh groups for each customizable panel. The configurator maps color and material selections to Three.js materials in real-time.

```tsx
// src/components/configurator/shoe-model.tsx — Interactive shoe model.
// Each mesh group in the glTF corresponds to a customizable panel.
// Hovering highlights the panel, clicking selects it for color/material changes.

"use client";

import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ShoeConfig, ShoePart } from "@/lib/types";

// Preload the model for instant display
useGLTF.preload("/models/sneaker.glb");

interface ShoeModelProps {
  config: ShoeConfig;
  onPartHover: (part: string | null) => void;
  onPartClick: (part: string) => void;
}

const PART_NAMES: ShoePart[] = [
  "upper", "sole", "laces", "tongue", "heel", "swoosh", "toecap"
];

// Material presets
const MATERIAL_PRESETS = {
  leather: { roughness: 0.6, metalness: 0.0, clearcoat: 0.3 },
  suede: { roughness: 0.95, metalness: 0.0, clearcoat: 0.0 },
  mesh: { roughness: 0.7, metalness: 0.1, clearcoat: 0.0 },
  patent: { roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1 },
};

export function ShoeModel({ config, onPartHover, onPartClick }: ShoeModelProps) {
  const { scene } = useGLTF("/models/sneaker.glb");
  const groupRef = useRef<THREE.Group>(null);

  // Create materials for each part based on config
  const materials = useMemo(() => {
    const mats: Record<string, THREE.MeshPhysicalMaterial> = {};

    for (const part of PART_NAMES) {
      const partConfig = config.parts[part];
      const preset = MATERIAL_PRESETS[partConfig.material as keyof typeof MATERIAL_PRESETS]
        || MATERIAL_PRESETS.leather;

      mats[part] = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(partConfig.color),
        ...preset,
      });
    }

    return mats;
  }, [config]);

  // Apply materials to model meshes
  useMemo(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const partName = child.name.toLowerCase().replace(/[_-]/g, "");
        const matchedPart = PART_NAMES.find((p) =>
          partName.includes(p)
        );

        if (matchedPart && materials[matchedPart]) {
          child.material = materials[matchedPart];
          child.castShadow = true;
          child.receiveShadow = true;
          // Store part name for raycasting
          child.userData.part = matchedPart;
        }
      }
    });
  }, [scene, materials]);

  // Subtle idle rotation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.3) * 0.05;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.3, 0]} scale={1.2}>
      <primitive
        object={scene}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          const part = e.object.userData.part;
          if (part) {
            document.body.style.cursor = "pointer";
            onPartHover(part);
          }
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
          onPartHover(null);
        }}
        onClick={(e: any) => {
          e.stopPropagation();
          const part = e.object.userData.part;
          if (part) onPartClick(part);
        }}
      />
    </group>
  );
}
```

## Step 3 — Build the Configuration Panel

```tsx
// src/components/configurator/config-panel.tsx — Color and material picker.
// Framer Motion handles the panel animations: slide-in, expand/collapse,
// and color swatch hover effects.

"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ShoeConfig, ShoePart } from "@/lib/types";

const COLORS = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#f5f5f5" },
  { name: "Red", hex: "#dc2626" },
  { name: "Navy", hex: "#1e3a5f" },
  { name: "Forest", hex: "#166534" },
  { name: "Sand", hex: "#d4a574" },
  { name: "Lavender", hex: "#a78bfa" },
  { name: "Coral", hex: "#f87171" },
];

const MATERIALS = [
  { name: "Leather", value: "leather", icon: "🐄" },
  { name: "Suede", value: "suede", icon: "🫧" },
  { name: "Mesh", value: "mesh", icon: "🕸️" },
  { name: "Patent", value: "patent", icon: "✨" },
];

interface ConfigPanelProps {
  config: ShoeConfig;
  selectedPart: ShoePart | null;
  hoveredPart: string | null;
  onUpdatePart: (part: ShoePart, update: { color?: string; material?: string }) => void;
}

export function ConfigPanel({ config, selectedPart, hoveredPart, onUpdatePart }: ConfigPanelProps) {
  const activePart = selectedPart || hoveredPart;

  return (
    <div className="w-80 space-y-6 p-6">
      <h2 className="text-xl font-bold">Customize Your Shoe</h2>

      {/* Part selector */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-500">
          {activePart
            ? `Editing: ${activePart.charAt(0).toUpperCase() + activePart.slice(1)}`
            : "Click a part on the shoe to customize"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {selectedPart && (
          <motion.div
            key={selectedPart}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Color picker */}
            <div>
              <p className="mb-3 text-sm font-medium">Color</p>
              <div className="grid grid-cols-4 gap-3">
                {COLORS.map((color) => (
                  <motion.button
                    key={color.hex}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onUpdatePart(selectedPart, { color: color.hex })}
                    className="relative h-10 w-10 rounded-full border-2 transition-colors"
                    style={{
                      backgroundColor: color.hex,
                      borderColor:
                        config.parts[selectedPart].color === color.hex
                          ? "#3b82f6"
                          : "transparent",
                    }}
                    title={color.name}
                  >
                    {config.parts[selectedPart].color === color.hex && (
                      <motion.div
                        layoutId="color-indicator"
                        className="absolute inset-0 rounded-full ring-2 ring-blue-500 ring-offset-2"
                      />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Material picker */}
            <div>
              <p className="mb-3 text-sm font-medium">Material</p>
              <div className="grid grid-cols-2 gap-2">
                {MATERIALS.map((material) => (
                  <motion.button
                    key={material.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onUpdatePart(selectedPart, { material: material.value })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      config.parts[selectedPart].material === material.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-lg">{material.icon}</span>
                    <p className="mt-1 text-sm font-medium">{material.name}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Price and CTA */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">$189.00</span>
          <span className="text-sm text-gray-500">Free shipping</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-4 w-full rounded-lg bg-black py-3 font-medium text-white hover:bg-gray-800"
        >
          Add to Cart
        </motion.button>
      </div>
    </div>
  );
}
```

## Step 4 — Add Share and Screenshot Features

```typescript
// src/lib/share.ts — Generate shareable links and screenshots.
// Config is encoded in the URL, so shared links reconstruct the exact design.

import type { ShoeConfig } from "./types";

// Encode config as URL-safe base64 — the entire design fits in a URL parameter
export function encodeConfig(config: ShoeConfig): string {
  const json = JSON.stringify(config);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function decodeConfig(encoded: string): ShoeConfig | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Generate share URL
export function getShareUrl(config: ShoeConfig): string {
  const encoded = encodeConfig(config);
  return `${window.location.origin}/configure?design=${encoded}`;
}

// Capture screenshot from the WebGL canvas
export async function captureScreenshot(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob!),
      "image/png",
      1.0
    );
  });
}
```

## Results

Leo launched the configurator as a replacement for the static product gallery. After the first month:

- **Return rate: 22% → 8%** — customers see exactly what they're ordering in 3D. The interactive experience eliminates the "looked different on screen" problem.
- **Average time on product page: 45 seconds → 3.5 minutes** — customers spend time experimenting with color combinations. The configurator is engaging enough that users share designs on social media.
- **Conversion rate: 2.8% → 4.1%** — the configurator creates a sense of ownership before purchase. Users who interact with the 3D model are 47% more likely to buy than those who only view photos.
- **Social shares: 340 designs shared** in the first month via the share URL feature. Each shared link brings the recipient directly to the same custom design — a free acquisition channel.
- **Performance: 60fps on iPhone 12+, 30fps on older Android** — `dpr={[1, 2]}` limits pixel ratio on high-DPI screens, and the optimized glTF model loads in 1.2 seconds on 4G.
- **Development time: 2 weeks** from scratch, including the 3D model prep. React Three Fiber's declarative API meant the team (2 frontend devs, no 3D specialists) could build it with React skills they already had.
