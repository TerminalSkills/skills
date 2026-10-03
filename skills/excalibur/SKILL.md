---
name: excalibur
description: >-
  Excalibur.js is a TypeScript-first 2D game engine for the browser with actors, scenes, collision physics, animation, sound, input and a Tiled map plugin. Use when the user wants to build or debug a browser game with Excalibur, load Tiled maps, animate sprite sheets, handle keyboard or pointer input, or manage scenes and cameras.
license: Apache-2.0
compatibility: 'Node.js 22+ for tooling, any modern browser (WebGL), TypeScript 5+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/excaliburjs/Excalibur
  tags:
    - game-engine
    - typescript
    - 2d
    - browser-game
    - webgl
---

# Excalibur.js — TypeScript-First 2D Game Engine

## Overview

Excalibur is a free, BSD-2-Clause 2D game engine written in TypeScript for browser games. It models a game as an `Engine` running `Scene`s that hold `Actor`s (entities with graphics, collision and actions) and offers a built-in loader, camera, collision and physics, animations, sound, input, and a separate Tiled plugin. This skill targets 0.32.x (`excalibur` and `@excaliburjs/plugin-tiled` 0.32.0 were the latest on npm when checked). The engine is pre-1.0 and breaks APIs between minor versions, so pin the version and read the changelog when upgrading; code written for 0.2x will not compile unchanged.

## Instructions

### Step 1: Install and scaffold

```bash
npm create vite@latest sky-runner -- --template vanilla-ts
cd sky-runner
npm install excalibur
npm install --save-exact @excaliburjs/plugin-tiled   # its peer range is excalibur ~0.32.0, keep both on the same minor
npm run dev
```

Put images and maps in `public/` (for example `public/images/hero.png`, `public/maps/level-1.tmx`) so `/images/hero.png` URLs resolve.

### Step 2: Resources and loader

Every asset, including a Tiled map, must be added to the `Loader` and loaded before use:

```typescript
// src/resources.ts
import { ImageSource, Loader } from "excalibur";
import { TiledResource } from "@excaliburjs/plugin-tiled";

export const Resources = {
  HeroSheet: new ImageSource("/images/hero.png"),
  LevelOne: new TiledResource("/maps/level-1.tmx"),
};

export const loader = new Loader(Object.values(Resources));
```

### Step 3: Engine setup

```typescript
// src/main.ts
import { Engine, DisplayMode, Color } from "excalibur";
import { LevelOne } from "./scenes/LevelOne";
import { loader } from "./resources";

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen,
  backgroundColor: Color.fromHex("#1a1a2e"),
  pixelArt: true,          // crisp pixels, no smoothing
  pixelRatio: 2,
  fixedUpdateFps: 60,      // fixed-step updates for deterministic physics
});

game.addScene("level-one", new LevelOne());
game.start(loader).then(() => game.goToScene("level-one"));
```

### Step 4: Actors, animation and input

```typescript
// src/actors/Player.ts
import { Actor, Animation, CollisionType, Color, Engine, Keys, Side, SpriteSheet, vec } from "excalibur";
import { Resources } from "../resources";

export class Player extends Actor {
  private speed = 200;
  private jumpForce = -400;
  private health = 3;
  private isGrounded = false;

  constructor(x: number, y: number) {
    super({
      pos: vec(x, y),
      width: 16,
      height: 24,
      collisionType: CollisionType.Active,   // moves and collides
      color: Color.Green,
    });
  }

  onInitialize(engine: Engine) {
    const sheet = SpriteSheet.fromImageSource({
      image: Resources.HeroSheet,
      grid: { rows: 4, columns: 6, spriteWidth: 16, spriteHeight: 24 },
    });
    this.graphics.add("idle", Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 200));
    this.graphics.add("run", Animation.fromSpriteSheet(sheet, [6, 7, 8, 9, 10, 11], 100));
    this.graphics.add("jump", Animation.fromSpriteSheet(sheet, [12, 13], 150));
    this.graphics.use("idle");

    this.on("postcollision", (evt) => {
      if (evt.side === Side.Bottom) this.isGrounded = true;
    });
  }

  onPreUpdate(engine: Engine, elapsedMs: number) {
    const kb = engine.input.keyboard;
    let moving = false;
    if (kb.isHeld(Keys.ArrowLeft)) {
      this.vel.x = -this.speed;
      this.graphics.flipHorizontal = true;
      moving = true;
    } else if (kb.isHeld(Keys.ArrowRight)) {
      this.vel.x = this.speed;
      this.graphics.flipHorizontal = false;
      moving = true;
    } else {
      this.vel.x = 0;
    }

    if (kb.wasPressed(Keys.Space) && this.isGrounded) {
      this.vel.y = this.jumpForce;
      this.isGrounded = false;
      this.graphics.use("jump");
    } else if (this.isGrounded) {
      this.graphics.use(moving ? "run" : "idle");
    }
  }

  takeDamage(amount: number) {
    this.health -= amount;
    this.actions.blink(100, 100, 5);
    if (this.health <= 0) this.scene?.engine.goToScene("game-over");
  }
}
```

Since 0.31 update hooks and events receive `elapsedMs` (milliseconds), not `delta`, and collision events refer to colliders: reach the other entity with `evt.other.owner`.

### Step 5: Scenes, Tiled maps, camera

```typescript
// src/scenes/LevelOne.ts
import { Scene } from "excalibur";
import { Resources } from "../resources";
import { Player } from "../actors/Player";
import { Coin } from "../actors/Coin";

export class LevelOne extends Scene {
  onActivate() {
    const map = Resources.LevelOne;          // already loaded by the Loader
    map.addToScene(this);                    // tile layers, colliders, camera wiring

    const spawn = map.getObjectsByName("PlayerSpawn")[0];
    const player = new Player(spawn.x, spawn.y);
    this.add(player);

    map.getObjectsByClassName("coin").forEach((obj) => this.add(new Coin(obj.x, obj.y)));

    this.camera.strategy.elasticToActor(player, 0.8, 0.9);
    this.camera.zoom = 2;
  }
}
```

Tiled renamed an object's "type" to "class", so the plugin queries are `getObjectsByClassName`, `getObjectsByName` and `getObjectsByProperty`. Look up spawn points defensively: `getObjectsByName` returns an empty array if the name is wrong.

### Step 6: Collision and triggers

```typescript
// src/actors/Coin.ts
import { Actor, CollisionType, Color, vec } from "excalibur";
import { Player } from "./Player";

export class Coin extends Actor {
  constructor(x: number, y: number) {
    super({ pos: vec(x, y), width: 8, height: 8, collisionType: CollisionType.Passive, color: Color.Yellow });
  }
  onInitialize() {
    this.on("collisionstart", (evt) => {
      if (evt.other.owner instanceof Player) this.kill();
    });
  }
}
```

Collision types: `Active` (moves, collides), `Fixed` (static ground), `Passive` (reports overlaps, no physical response), `PreventCollision`.

## Examples

### Example 1: "Start a new platformer project and get a green square moving"

```bash
npm create vite@latest sky-runner -- --template vanilla-ts
cd sky-runner && npm install excalibur && npm run dev
```

Then add Step 3's `main.ts` and `Player` without the sprite sheet code. Result: Vite serves `http://localhost:5173`, the canvas fills the window, and a green 16x24 actor moves with the arrow keys.

### Example 2: "Load my Tiled level and make coins disappear when the hero touches them"

Add `LevelOne: new TiledResource("/maps/level-1.tmx")` to the loader, mark coin objects in Tiled with class `coin`, and use the `LevelOne` scene and `Coin` actor above. Result: the map renders, the camera follows the player, and each coin removes itself on contact. Type-check with `npx tsc --noEmit`; a missing asset shows up as a failed request in the browser console and the loader screen stays up.

## Guidelines

- Put game logic in `onInitialize`, `onPreUpdate` and `onPostUpdate`, not the constructor; the engine and scene are not available yet in the constructor.
- Load every asset through the `Loader`; calling `addToScene` on a Tiled map that has not been loaded fails.
- Keep `excalibur` and `@excaliburjs/plugin-tiled` on the same minor version; mismatches fail at install or runtime.
- Excalibur is pre-1.0: removed or changed APIs appear in each minor release (for example `Timer` takes only an options object, `Vector.normalize()` of a zero vector returns `(0,0)`). Search the CHANGELOG on GitHub before copying older tutorial code.
- Use `engine.goToScene("name", { sceneActivationData })` to pass data between scenes.
- Chain effects with the Actions API: `actor.actions.moveTo(vec(100, 100), 200).delay(500).fade(0, 1000)`.
- For heavy 3D, huge particle counts or a full editor workflow, a larger engine (Phaser, Godot web export) may fit better.
