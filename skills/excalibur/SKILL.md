---
name: excalibur
category: Game Development
tags: [game-engine, typescript, 2d, ecs, browser-game, webgl]
version: 1.0.0
author: terminal-skills
---

# Excalibur.js — TypeScript-First 2D Game Engine

You are an expert in Excalibur.js, the TypeScript-first 2D game engine built for the web. You help developers build browser games using Excalibur's Actor system, Scene management, Tiled integration, physics, animation, sound, and input handling — with first-class TypeScript support, excellent documentation, and a focus on developer experience over raw performance.

## Core Capabilities

### Game Setup

```typescript
// src/main.ts — Excalibur game
import { Engine, DisplayMode, Color } from "excalibur";
import { LevelOne } from "./scenes/LevelOne";
import { loader } from "./resources";

const game = new Engine({
  width: 800,
  height: 600,
  displayMode: DisplayMode.FitScreen,
  backgroundColor: Color.fromHex("#1a1a2e"),
  pixelArt: true,                         // Crisp rendering
  pixelRatio: 2,
  fixedUpdateFps: 60,                     // Deterministic physics
});

game.addScene("level-one", new LevelOne());
game.start(loader).then(() => {           // Preload assets
  game.goToScene("level-one");
});
```

### Actors and Components

```typescript
// src/actors/Player.ts
import { Actor, Color, vec, Keys, CollisionType, Animation, SpriteSheet } from "excalibur";
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
      collisionType: CollisionType.Active, // Moves and collides
      color: Color.Green,
    });
  }

  onInitialize(engine: Engine) {
    // Sprite sheet animations
    const spriteSheet = SpriteSheet.fromImageSource({
      image: Resources.HeroSheet,
      grid: { rows: 4, columns: 6, spriteWidth: 16, spriteHeight: 24 },
    });

    const idle = Animation.fromSpriteSheet(spriteSheet, [0, 1, 2, 3], 200);
    const run = Animation.fromSpriteSheet(spriteSheet, [6, 7, 8, 9, 10, 11], 100);
    const jump = Animation.fromSpriteSheet(spriteSheet, [12, 13], 150);

    this.graphics.add("idle", idle);
    this.graphics.add("run", run);
    this.graphics.add("jump", jump);
    this.graphics.use("idle");

    // Ground detection
    this.on("postcollision", (evt) => {
      if (evt.side === "Bottom") this.isGrounded = true;
    });
  }

  onPreUpdate(engine: Engine, delta: number) {
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
    } else if (moving) {
      this.graphics.use("run");
    } else {
      this.graphics.use("idle");
    }
  }

  takeDamage(amount: number) {
    this.health -= amount;
    // Flash red
    this.actions.blink(100, 100, 5);
    if (this.health <= 0) {
      this.scene?.engine.goToScene("game-over");
    }
  }
}
```

### Scenes and Tiled Maps

```typescript
// src/scenes/LevelOne.ts
import { Scene, Engine, TileMap, vec } from "excalibur";
import { TiledResource } from "@excaliburjs/plugin-tiled";
import { Player } from "../actors/Player";
import { Coin } from "../actors/Coin";

export class LevelOne extends Scene {
  private tiledMap!: TiledResource;

  onInitialize(engine: Engine) {
    this.tiledMap = new TiledResource("/maps/level-1.tmx");

    // Add tilemap to scene
    this.tiledMap.addToScene(this);

    // Get spawn point from Tiled object layer
    const spawnPoint = this.tiledMap.getObjectsByName("PlayerSpawn")[0];
    const player = new Player(spawnPoint.x, spawnPoint.y);
    this.add(player);

    // Camera follows player
    this.camera.strategy.elasticToActor(player, 0.8, 0.9);
    this.camera.zoom = 2;

    // Spawn coins from object layer
    this.tiledMap.getObjectsByType("coin").forEach((obj) => {
      this.add(new Coin(obj.x, obj.y));
    });
  }
}
```

## Installation

```bash
npm install excalibur
npm install @excaliburjs/plugin-tiled      # Tiled map support
```

## Best Practices

1. **TypeScript always** — Excalibur is built in TypeScript; use it for full autocompletion and type safety
2. **Actor lifecycle** — Override `onInitialize`, `onPreUpdate`, `onPostUpdate` instead of constructor for game logic
3. **Collision types** — Use `Active` for moving entities, `Fixed` for static platforms, `Passive` for triggers/sensors
4. **Scene transitions** — `engine.goToScene("name", { sceneActivationData })` to pass data between scenes
5. **Tiled plugin** — Use the official Tiled plugin for level design; supports tile layers, object layers, and custom properties
6. **Actions API** — Chain animations: `actor.actions.moveTo(100, 100, 200).delay(500).fade(0, 1000)` for cutscenes and effects
7. **Event system** — Use typed events (`on("precollision")`, `on("kill")`) for clean game logic
8. **Resource loading** — Define all assets in a loader; Excalibur shows a loading screen automatically
