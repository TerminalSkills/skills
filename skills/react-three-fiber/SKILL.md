---
name: react-three-fiber
description: >-
  You are an expert in React Three Fiber (R3F), the React renderer for
  Three.js that lets developers build 3D scenes using JSX components. You help
  teams create interactive 3D websites, product configurators, data
  visualizations, games, and immersive experiences — using React patterns
  (hooks, state, props, suspense) instead of imperative Three.js code, with
  full access to the Three.js ecosystem.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: 3D & Creative
  tags:
    - 3d
    - webgl
    - react
    - threejs
    - declarative
    - interactive
    - r3f
---

# React Three Fiber — Declarative Three.js for React

You are an expert in React Three Fiber (R3F), the React renderer for Three.js that lets developers build 3D scenes using JSX components. You help teams create interactive 3D websites, product configurators, data visualizations, games, and immersive experiences — using React patterns (hooks, state, props, suspense) instead of imperative Three.js code, with full access to the Three.js ecosystem.

## Core Capabilities

### Canvas and Scene Setup

```tsx
import { Canvas } from "@react-three/fiber";

function App() {
  return (
    <Canvas
      camera={{ position: [0, 2, 5], fov: 50 }}
      dpr={[1, 2]}                        // Adaptive pixel ratio
      gl={{ antialias: true, alpha: true }}
      shadows                             // Enable shadow maps
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} castShadow />
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#444" />
      </mesh>
    </Canvas>
  );
}
```

### Hooks

```tsx
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function SpinningBox() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport, camera } = useThree();   // Access Three.js internals

  // Runs every frame (60fps game loop)
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta;    // Frame-rate independent
      // Hover effect: follow mouse
      meshRef.current.position.x = THREE.MathUtils.lerp(
        meshRef.current.position.x,
        (state.pointer.x * viewport.width) / 2,
        0.1,
      );
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  );
}
```

### Loading 3D Models

```tsx
import { useGLTF, useAnimations } from "@react-three/drei";
import { useEffect } from "react";

function Character({ animation = "idle" }) {
  const { scene, animations } = useGLTF("/models/character.glb");
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    actions[animation]?.reset().fadeIn(0.3).play();
    return () => { actions[animation]?.fadeOut(0.3); };
  }, [animation, actions]);

  return <primitive object={scene} scale={1.5} />;
}

useGLTF.preload("/models/character.glb");
```

### Events and Interaction

```tsx
function InteractiveBox() {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  return (
    <mesh
      scale={clicked ? 1.5 : 1}
      onClick={() => setClicked(!clicked)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry />
      <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
    </mesh>
  );
}
// R3F raycasts pointer events automatically — same API as DOM events
```

## Installation

```bash
npm install three @react-three/fiber
npm install @react-three/drei           # Essential helpers
npm install @react-three/postprocessing # Visual effects
```

## Best Practices

1. **Everything is a component** — Meshes, lights, cameras, groups are all JSX; compose scenes like React UIs
2. **useFrame for animation** — Never use `requestAnimationFrame`; `useFrame` integrates with R3F's render loop
3. **Drei for shortcuts** — Use `@react-three/drei` for OrbitControls, Environment, Text, Html, loaders; saves weeks of work
4. **Suspense for loading** — Wrap `<Canvas>` children in `<Suspense fallback={...}>` for loading states
5. **GLTF for models** — Use `.glb` format; compress with Draco (`npx gltfjsx model.glb --draco`); preload with `useGLTF.preload`
6. **Adaptive performance** — Use `<AdaptiveDpr>` and `<PerformanceMonitor>` from Drei; degrade quality on slow devices
7. **Pointer events** — R3F raycasts automatically; `onClick`, `onPointerOver` work like DOM events on any mesh
8. **Instances for performance** — Use `<Instances>` or `<InstancedMesh>` for 100+ identical objects (trees, particles, stars)
