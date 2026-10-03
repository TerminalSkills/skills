---
name: pixijs
description: >-
  Renders fast 2D graphics in the browser with PixiJS 8, a WebGL and WebGPU engine for sprites, text, filters, masks and particles. Use when a user asks to build a 2D game, an interactive visualization, an animated banner, a sprite animation from a spritesheet, a particle effect, or to speed up a canvas scene with thousands of objects.
license: Apache-2.0
compatibility: 'PixiJS 8.x (pixi.js on npm), any modern browser with WebGL2 or WebGPU; Node.js 20+ for the build tooling.'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - 2d-rendering
    - webgl
    - graphics
    - animation
    - game-development
  repository: https://github.com/pixijs/pixijs
---

# PixiJS — High-Performance 2D WebGL Renderer

## Overview

PixiJS is a 2D rendering library for the web. It draws a scene graph of sprites, text, vector graphics and meshes on the GPU with WebGL (default) or WebGPU, batches draw calls automatically, and adds an asset loader, a ticker, a pointer-event system and filters. It is a renderer, not a full game engine: physics, audio and game logic come from other libraries.

This skill targets PixiJS 8 (current: 8.22). The v8 API differs from v7: the application is created with `new Application()` then `await app.init(...)`, shapes use `rect().fill()`, and `ParticleContainer` holds lightweight `Particle` objects. There is no 2D-canvas fallback renderer; the `CanvasRenderer` is listed as "coming soon", so a device needs WebGL or WebGPU.

## Instructions

### Install and set up

```bash
npm create pixi.js@latest      # scaffold a project (Vite template recommended)
npm install pixi.js            # or add to an existing project
```

```typescript
// src/main.ts
import { Application, Assets, Sprite } from 'pixi.js'

(async () => {                  // wrap in a function: top-level await breaks some Vite production builds
  const app = new Application()
  await app.init({
    background: '#1a1a2e',
    resizeTo: window,
    antialias: false,                         // crisp pixel art
    resolution: window.devicePixelRatio,
    autoDensity: true,                        // keeps CSS size correct on retina screens
  })
  document.body.appendChild(app.canvas)       // v8: app.canvas, not app.view

  await Assets.load([
    { alias: 'hero', src: '/sprites/hero.png' },
    { alias: 'tileset', src: '/sprites/tileset.png' },
  ])

  const hero = Sprite.from('hero')            // works for an alias that is already loaded
  hero.anchor.set(0.5)
  hero.position.set(app.screen.width / 2, app.screen.height / 2)
  app.stage.addChild(hero)

  app.ticker.add((ticker) => {
    hero.rotation += 0.01 * ticker.deltaTime  // v8 passes the Ticker, not a number
  })
})()
```

`preference: 'webgpu'` in `init` asks for the WebGPU renderer; the docs call it experimental and recommend WebGL for production.

### Containers and layers

```typescript
import { Container } from 'pixi.js'

const world = new Container()
const effects = new Container()
const hud = new Container()
app.stage.addChild(world, effects, hud)       // later children draw on top

world.sortableChildren = true                 // depth sort by zIndex
app.ticker.add(() => enemies.forEach((e) => { e.zIndex = e.y }))
```

### Filters

```typescript
import { BlurFilter, ColorMatrixFilter, DisplacementFilter, Sprite } from 'pixi.js'

background.filters = [new BlurFilter({ strength: 4 })]
const grayscale = new ColorMatrixFilter()
grayscale.desaturate()
deadEnemy.filters = [grayscale]

const map = Sprite.from('displacement-map')
map.texture.source.style.addressMode = 'repeat'
waterLayer.filters = [new DisplacementFilter({ sprite: map, scale: 20 })]
app.stage.addChild(map)                        // the map sprite must be on the stage to be sampled
```

Release a filter's memory with `container.filters = null`. Blend filters such as `HardMixBlend` need `import 'pixi.js/advanced-blend-modes'`. More effects live in the separate `pixi-filters` package.

### Spritesheet animation

```typescript
import { AnimatedSprite, Assets } from 'pixi.js'

const sheet = await Assets.load('/sprites/hero.json')   // TexturePacker or AssetPack JSON
const walk = new AnimatedSprite(sheet.animations['walk'])
walk.animationSpeed = 0.15
walk.play()
app.stage.addChild(walk)

walk.textures = sheet.animations['attack']               // switch clips
walk.play()
```

### Text and Graphics

```typescript
import { Assets, FillGradient, Graphics, Text } from 'pixi.js'

await Assets.load({ src: '/fonts/press-start-2p.woff2', data: { family: 'Press Start 2P' } })

const scoreText = new Text({
  text: 'Score: 0',
  style: {
    fontFamily: 'Press Start 2P',
    fontSize: 24,
    fill: new FillGradient({ type: 'linear', colorStops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#00ff88' }] }),
    stroke: { color: '#000000', width: 4 },
    dropShadow: { color: '#000000', distance: 2 },
  },
})

const healthBar = new Graphics()
healthBar.rect(0, 0, 200, 20).fill(0x333333)
healthBar.rect(2, 2, 196 * hp, 16).fill(0x00ff00)   // v8: shape first, then fill()/stroke()
```

Gradients are `FillGradient` objects in v8; an array of colours as `fill` was v7 syntax. Changing `text.text` re-rasterizes the text, so for a score that changes every frame use `BitmapText`.

### Many objects: ParticleContainer

```typescript
import { Particle, ParticleContainer, Texture } from 'pixi.js'

const sparks = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, vertex: false, color: false } })
for (let i = 0; i < 50_000; i++) {
  sparks.addParticle(new Particle({ texture: Texture.from('particle'), x: Math.random() * 800, y: Math.random() * 600 }))
}
app.stage.addChild(sparks)
```

Particles have no children, events or filters; use `addParticle`/`removeParticle` instead of `addChild`. Properties not listed as dynamic are uploaded only when you call `sparks.update()`. The API is marked experimental.

## Examples

### Example 1: Animated hero in a platformer

**User prompt:** "Load hero.json and make the character walk, then switch to attack when I press space."

Load the sheet with `Assets.load('/sprites/hero.json')`, create an `AnimatedSprite` from `sheet.animations['walk']`, call `play()`, and on `keydown` for `Space` set `textures` to `sheet.animations['attack']`, `loop = false`, then `play()` and restore `walk` in `onComplete`. Result: the sprite loops the walk cycle and plays a single attack animation on each key press.

### Example 2: Rain of 100,000 particles

**User prompt:** "My falling-snow effect with 20,000 Sprites runs at 20 fps. Make it smooth."

Replace the `Sprite` objects with `Particle` objects in one `ParticleContainer` with `dynamicProperties: { position: true }`, and in the ticker update each `particle.y += speed * ticker.deltaTime`, wrapping at the bottom. Result: one batched draw call; 100,000 flakes stay at the display refresh rate on a typical laptop.

## Guidelines

- Always `await app.init()` before touching `app.canvas`, `app.stage` or `app.screen`.
- Keep layers in separate containers; draw order inside a container is child order unless `sortableChildren` is on.
- Spritesheets batch best: sprites that share a texture atlas draw together, and mixing sprite, graphics and text objects alternately breaks batches.
- Filters, masks and blend modes cost render passes. Use few, and prefer rectangle masks (scissor) over sprite masks.
- Textures are garbage-collected after about 3600 idle frames; call `destroy()` on objects you remove. `sprite.destroy(true)` also destroys the texture, which breaks other sprites that share it, so use `sprite.destroy()` for shared textures and `Assets.unload(alias)` to free an asset.
- Pool objects that appear and disappear often (bullets, particles) instead of creating them every frame.
- For a plain static page or a simple chart, SVG or Canvas 2D is lighter than PixiJS.
- Using React? Use the `@pixi/react` package instead of mixing imperative setup into components.
