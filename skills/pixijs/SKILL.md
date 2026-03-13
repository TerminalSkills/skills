---
name: pixijs
description: >-
   You are an expert in PixiJS, the fastest 2D rendering engine for the web.
  You help developers build games, interactive visualizations, animated ads,
  creative coding projects, and rich UI effects using PixiJS's WebGL-first
  renderer with automatic Canvas fallback — handling sprites, text, filters,
  masks, blend modes, and custom shaders at 60fps with hundreds of thousands
  of objects.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Game Development
  tags:
    - 2d-rendering
    - webgl
    - canvas
    - graphics
    - animation
    - interactive
    - creative-coding
---

# PixiJS — High-Performance 2D WebGL Renderer

You are an expert in PixiJS, the fastest 2D rendering engine for the web. You help developers build games, interactive visualizations, animated ads, creative coding projects, and rich UI effects using PixiJS's WebGL-first renderer with automatic Canvas fallback — handling sprites, text, filters, masks, blend modes, and custom shaders at 60fps with hundreds of thousands of objects.

## Core Capabilities

### Application Setup

```typescript
// src/main.ts — PixiJS 8 application
import { Application, Sprite, Text, Container, Assets } from "pixi.js";

const app = new Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1a1a2e,
  antialias: false,                       // Crisp pixel art
  resolution: window.devicePixelRatio,    // Retina support
});
document.body.appendChild(app.canvas);

// Load assets
await Assets.load([
  { alias: "hero", src: "/sprites/hero.png" },
  { alias: "tileset", src: "/sprites/tileset.png" },
  { alias: "particle", src: "/sprites/particle.png" },
]);

// Create sprite
const hero = Sprite.from("hero");
hero.anchor.set(0.5);                    // Center anchor for rotation
hero.position.set(400, 300);
app.stage.addChild(hero);

// Game loop
app.ticker.add((ticker) => {
  hero.rotation += 0.01 * ticker.deltaTime;
});
```

### Containers and Scene Graph

```typescript
// Hierarchical scene graph
const world = new Container();
const uiLayer = new Container();
const particleLayer = new Container();

app.stage.addChild(world);
app.stage.addChild(particleLayer);
app.stage.addChild(uiLayer);            // UI always on top

// Sort children by Y position (depth sorting for top-down games)
world.sortableChildren = true;
entities.forEach((entity) => {
  entity.zIndex = entity.y;
});
```

### Filters and Shaders

```typescript
import { BlurFilter, ColorMatrixFilter, DisplacementFilter } from "pixi.js";

// Built-in filters
const blur = new BlurFilter({ strength: 4 });
const grayscale = new ColorMatrixFilter();
grayscale.desaturate();

background.filters = [blur];              // Depth-of-field effect
deadEnemy.filters = [grayscale];          // Desaturate on death

// Displacement map for water/heat effects
const displacementSprite = Sprite.from("displacement-map");
displacementSprite.texture.source.addressMode = "repeat";
const displacement = new DisplacementFilter({
  sprite: displacementSprite,
  scale: 20,
});
waterLayer.filters = [displacement];

// Animate displacement for flowing water
app.ticker.add((ticker) => {
  displacementSprite.x += 0.5 * ticker.deltaTime;
  displacementSprite.y += 0.3 * ticker.deltaTime;
});
```

### Spritesheet Animation

```typescript
import { AnimatedSprite, Spritesheet, Assets } from "pixi.js";

// Load spritesheet
const sheet = await Assets.load("/sprites/hero.json");

// Create animated sprite
const heroAnim = new AnimatedSprite(sheet.animations["walk"]);
heroAnim.animationSpeed = 0.15;
heroAnim.play();
app.stage.addChild(heroAnim);

// Switch animations
function setAnimation(name: string) {
  heroAnim.textures = sheet.animations[name];
  heroAnim.play();
}
// setAnimation("idle"), setAnimation("attack"), setAnimation("die")
```

### Text and Graphics

```typescript
import { Text, TextStyle, Graphics } from "pixi.js";

// Styled text
const style = new TextStyle({
  fontFamily: "Press Start 2P",          // Pixel font
  fontSize: 24,
  fill: ["#ffffff", "#00ff88"],          // Gradient fill
  stroke: { color: "#000000", width: 4 },
  dropShadow: { color: "#000000", distance: 2 },
});
const scoreText = new Text({ text: "Score: 0", style });

// Procedural graphics
const healthBar = new Graphics();
healthBar.rect(0, 0, 200, 20).fill(0x333333);  // Background
healthBar.rect(2, 2, 196 * hp, 16).fill(0x00ff00);  // Fill

// Minimap
const minimap = new Graphics();
minimap.circle(playerX / 10, playerY / 10, 3).fill(0x00ff00);
rooms.forEach(r => minimap.rect(r.x / 10, r.y / 10, r.w / 10, r.h / 10).stroke(0x666666));
```

## Installation

```bash
npm install pixi.js
# PixiJS 8 (latest): WebGPU + WebGL, tree-shakeable
```

## Best Practices

1. **Use containers for layers** — Separate world, UI, particles, debug into containers; set `sortableChildren` for depth sorting
2. **Sprite batching** — Sprites using the same texture atlas are batched automatically; keep atlases under 4096×4096
3. **Object pooling** — Pre-create sprites and reuse them; PixiJS allocation is fast but GC pauses are not
4. **ParticleContainer** — Use `ParticleContainer` for thousands of simple sprites (no filters, no children); 10x faster than Container
5. **Filters sparingly** — Each filter triggers a render texture pass; use 1-2 filters on large containers, not per-sprite
6. **Asset loading** — Use `Assets.load` with aliases; supports spritesheets, bitmap fonts, JSON, and audio
7. **Resolution** — Set `resolution: devicePixelRatio` for sharp rendering on retina screens
8. **Destroy properly** — Call `sprite.destroy(true)` to free GPU texture; prevents memory leaks in long-running apps
