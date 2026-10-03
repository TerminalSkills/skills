---
name: threejs
description: >-
  Three.js is a JavaScript library for building interactive 3D graphics in the
  browser with WebGL and WebGPU. Use it for 3D product configurators, data
  visualizations, games and creative sites: scenes, cameras, lighting, glTF
  model loading, performance tuning, and React Three Fiber. Trigger words:
  threejs, three.js, 3d, webgl, webgpu, react three fiber, r3f, glb, gltf.
license: Apache-2.0
compatibility: "Modern browser with WebGL 2; bundler such as Vite for npm usage; React 19 for React Three Fiber v9"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/mrdoob/three.js
  tags: ["threejs", "3d", "webgl", "react-three-fiber", "visualization"]
---

# Three.js

## Overview

Three.js is a JavaScript library for creating interactive 3D graphics in the browser. It provides a scene graph, PBR materials, lighting, model loaders (glTF, FBX), and performance tools such as instanced rendering. React Three Fiber (R3F) is a declarative React renderer for it, with Suspense-based loading and automatic disposal.

Versions checked: `three` 0.186 (r186), `@react-three/fiber` 9.8, `@react-three/drei` 10.7. Things that differ from older tutorials:

- Install from npm and import addons from `three/addons/...` (for example `three/addons/controls/OrbitControls.js`); the old `three/examples/jsm/...` paths and `outputEncoding` / `Texture.encoding` (removed in r152, now `outputColorSpace` / `colorSpace`) are legacy.
- `THREE.Clock` is deprecated since r182; use `THREE.Timer` (`timer.update()` then `timer.getDelta()`).
- `WebGPURenderer` and node materials come from `three/webgpu`, shaders written in TSL from `three/tsl`. WebGPU renderer async methods (`renderAsync`, `computeAsync`) are deprecated since r180.
- `DRACOLoader.setDecoderConfig()` is deprecated (r185); Draco will always use WASM.
- `@react-three/fiber` 9 pairs with React 19; v8 pairs with React 18. `@react-three/drei` 10 needs R3F 9.

## Instructions

- When setting up a scene, create a `Scene`, `PerspectiveCamera` (or `OrthographicCamera`) and `WebGLRenderer`, add `OrbitControls`, and set `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. The renderer's default tone mapping is none; set `toneMapping = THREE.ACESFilmicToneMapping` yourself in vanilla code (R3F's `<Canvas>` already uses ACES Filmic and sRGB output unless `flat` is set).
- When creating objects, combine geometries (box, sphere, plane, custom `BufferGeometry`) with materials (`MeshStandardMaterial` for PBR, `MeshPhysicalMaterial` for clearcoat, transmission) and set `colorSpace = THREE.SRGBColorSpace` on colour textures only (not normal, roughness or metalness maps).
- When loading models, use `GLTFLoader` for glTF/GLB. For compressed files add `DRACOLoader` (copy the decoder from `node_modules/three/examples/jsm/libs/draco/gltf/` to your public folder and call `setDecoderPath`) and `KTX2Loader` (transcoder in `examples/jsm/libs/basis/`, call `setTranscoderPath` and `detectSupport(renderer)`). Compress with `gltf-transform` or `gltfpack` first.
- When building lighting, combine ambient, directional, point and spot lights with an HDR environment map (`RGBELoader` plus `PMREMGenerator`, or drei `<Environment>`); enable `renderer.shadowMap.enabled` and `castShadow` / `receiveShadow` only where needed.
- When animating, drive everything from `renderer.setAnimationLoop(fn)` and use the timer delta, not a fixed step.
- When optimizing, use `InstancedMesh` for 100+ identical objects, merge static geometry, use LOD, and call `dispose()` on geometries, materials and textures you remove.
- In React, use R3F with drei helpers (`OrbitControls`, `Environment`, `useGLTF`, `ContactShadows`) and `@react-three/postprocessing` for bloom or SSAO. `useGLTF` enables Draco (decoder fetched from Google's CDN) and Meshopt by default; call `useGLTF.preload(url)` and `useGLTF.setDecoderPath(...)` to self-host the decoder.

### Minimal vanilla scene

```bash
npm install three
```

```javascript
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100)
camera.position.set(2, 1.5, 3)
const controls = new OrbitControls(camera, renderer.domElement)
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2))

const draco = new DRACOLoader().setDecoderPath('/draco/')
const loader = new GLTFLoader().setDRACOLoader(draco)
loader.load('/models/sneaker.glb', (gltf) => scene.add(gltf.scene))

const timer = new THREE.Timer()
renderer.setAnimationLoop(() => {
  timer.update()
  scene.rotation.y += timer.getDelta() * 0.3
  controls.update()
  renderer.render(scene, camera)
})
```

## Examples

### Example 1: Build a 3D product configurator

**User request:** "Create a 3D product viewer where users can change colors and rotate the model"

```bash
npm install three @react-three/fiber @react-three/drei   # React 19 project
```

```tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, useGLTF } from '@react-three/drei'
import { useState } from 'react'

function Sneaker({ color }: { color: string }) {
  const { scene, materials } = useGLTF('/models/sneaker.glb') as any
  materials.body.color.set(color)
  return <primitive object={scene} />
}
useGLTF.preload('/models/sneaker.glb')

export function Configurator() {
  const [color, setColor] = useState('#e63946')
  return (
    <>
      <Canvas camera={{ position: [2, 1.5, 3], fov: 45 }}>
        <Environment preset="studio" />
        <Sneaker color={color} />
        <ContactShadows position={[0, -0.5, 0]} opacity={0.5} blur={2.5} />
        <OrbitControls makeDefault enablePan={false} />
      </Canvas>
      {['#e63946', '#1d3557', '#2a9d8f'].map((c) => (
        <button key={c} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
      ))}
    </>
  )
}
```

Result: a rotatable shoe with studio lighting and a soft shadow; clicking a swatch recolours the `body` material. Material names depend on the model; inspect them with `console.log(materials)` first.

### Example 2: Create an animated data globe

**User request:** "Visualize global data points on an interactive 3D globe"

1. Create a `SphereGeometry(1, 64, 64)` with an earth texture (`colorSpace = SRGBColorSpace`).
2. Convert latitude/longitude to a position on the sphere and set one matrix per point on an `InstancedMesh`: `mesh.setMatrixAt(i, matrix)`, then `mesh.instanceMatrix.needsUpdate = true`.
3. Draw arcs between points with `TubeGeometry` along a `QuadraticBezierCurve3` and animate a dash by updating the material's texture offset in the animation loop.
4. Use `OrbitControls` with `autoRotate = true`; user dragging pauses it.

Result: thousands of markers render in one draw call, with arcs and a globe that auto-rotates until the user takes over.

## Guidelines

- Use glTF/GLB for models; compress with Draco or Meshopt and KTX2 textures when files exceed about 1 MB.
- Do not use `Clock`, `outputEncoding` or `examples/jsm` imports in new code.
- Self-host Draco and KTX2 decoders in production rather than relying on a CDN.
- Dispose of resources you create and remove: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`; R3F disposes JSX-created objects for you.
- Colour textures are sRGB; data textures (normal, roughness, metalness, ao) are linear.
- Cap pixel ratio at 2 and test on a mid-range phone; lower shadow map size and material count for weak GPUs.
- Check the migration guide (github.com/mrdoob/three.js/wiki/Migration-Guide) when upgrading; three.js releases a new revision roughly monthly and does not follow semver.
