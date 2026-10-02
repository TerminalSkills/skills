---
name: phaser
description: >-
  Phaser is an open-source HTML5 framework for 2D browser games, with scenes,
  Arcade and Matter.js physics, sprite animation, tilemaps, tweens, particles and
  input handling, rendered with WebGL. Use when a user asks to "make a browser
  game", "build a platformer or arcade game in JavaScript/TypeScript", "set up
  Phaser with Vite", "add a tilemap, physics or particles", or "upgrade a game from
  Phaser 3 to Phaser 4".
license: Apache-2.0
compatibility: "Node.js 18+ and a bundler such as Vite for development; runs in any modern browser."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["game-engine", "html5", "browser-game", "2d", "arcade-physics"]
  repository: https://github.com/phaserjs/phaser
---


# Phaser

## Overview

Phaser is a JavaScript/TypeScript game framework. A `Phaser.Game` runs a list of scenes (`preload`, `create`, `update`), each with its own physics world, cameras, input, tweens and timers. The current release is Phaser 4 (4.2.1, July 2026; `npm install phaser` installs it). Most Phaser 3 scene code keeps working, but v4 replaced the WebGL pipeline system, so check the migration notes below before upgrading or when copying older tutorials.

## Instructions

### 1. Create a project

```bash
npm create vite@latest star-collector -- --template vanilla-ts
cd star-collector && npm install phaser && npm run dev
```

Official starters also exist: `create-phaser` and the `phaserjs/template-vite-ts` repository. Put images, tilemap JSON and audio in `public/assets/` and load them with `this.load.setPath("assets")`.

### 2. Game configuration

```typescript
// src/main.ts — Phaser game entry point
import Phaser from "phaser";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,                      // WebGL; the Canvas renderer is deprecated in v4
  width: 800,
  height: 600,
  pixelArt: true,                         // Nearest-neighbour scaling, no smoothing
  // roundPixels defaults to false in v4; set it only if you see seams in pixel art
  scale: {
    mode: Phaser.Scale.FIT,               // Fit viewport, keep aspect ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",                    // Fast AABB physics
    arcade: {
      gravity: { x: 0, y: 300 },         // Platformer gravity
      debug: false,
    },
  },
  scene: [PreloadScene, GameScene, HUDScene],
};

new Phaser.Game(config);
```

### 3. Scenes, tilemaps, animation

```typescript
// src/scenes/GameScene.ts — Main game loop
export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("GameScene");
  }

  create() {
    // Tilemap from Tiled editor
    const map = this.make.tilemap({ key: "level-1" });
    const tileset = map.addTilesetImage("terrain", "terrain-tiles")!;
    const ground = map.createLayer("Ground", tileset)!;
    ground.setCollisionByProperty({ collides: true });

    // Player with animations
    this.player = this.physics.add.sprite(100, 200, "hero");
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.1);

    this.anims.create({
      key: "run",
      frames: this.anims.generateFrameNumbers("hero", { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,                         // Loop forever
    });
    this.anims.create({
      key: "idle",
      frames: [{ key: "hero", frame: 6 }],
    });
    this.cursors = this.input.keyboard!.createCursorKeys();   // create once, not in update()

    // Collisions
    this.physics.add.collider(this.player, ground);

    // Coins from object layer in Tiled
    const coinObjects = map.getObjectLayer("Coins")!.objects;
    this.coins = this.physics.add.group();
    coinObjects.forEach((obj) => {
      const coin = this.coins.create(obj.x!, obj.y!, "coin");
      coin.setScale(0.5);
      coin.body.setAllowGravity(false);
    });

    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Launch HUD as parallel scene
    this.scene.launch("HUDScene");
  }

  update() {
    const cursors = this.cursors;

    if (cursors.left.isDown) {
      this.player.setVelocityX(-160);
      this.player.anims.play("run", true);
      this.player.setFlipX(true);
    } else if (cursors.right.isDown) {
      this.player.setVelocityX(160);
      this.player.anims.play("run", true);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
      this.player.anims.play("idle", true);
    }

    // Jump (only when touching ground)
    if (cursors.up.isDown && this.player.body!.blocked.down) {
      this.player.setVelocityY(-330);
    }
  }

  private collectCoin(
    _player: Phaser.GameObjects.GameObject,
    coin: Phaser.GameObjects.GameObject,
  ) {
    (coin as Phaser.Physics.Arcade.Sprite).disableBody(true, true);
    this.score += 10;
    this.events.emit("score-changed", this.score);

    // Particle burst effect
    const { x, y } = coin.body!.position;
    const particles = this.add.particles(x, y, "sparkle", {
      speed: 100,
      lifespan: 300,
      scale: { start: 0.5, end: 0 },
      emitting: false,
    });
    particles.explode(8);
    this.time.delayedCall(400, () => particles.destroy());   // emitters are game objects: clean up
  }
}
```

### 4. Physics, tweens, effects

```typescript
// Arcade physics — fast, axis-aligned
this.physics.add.collider(player, enemies, onHit);
this.physics.add.overlap(bullet, enemies, onBulletHit);
player.setVelocity(200, -300);
player.setBounce(0.2);
player.setDrag(100);

// Matter.js physics — complex shapes, joints, sensors
const ball = this.matter.add.circle(400, 200, 20, { restitution: 0.8 });
const constraint = this.matter.add.constraint(anchor, ball, 100, 0.1);

// Tweens — smooth animations
this.tweens.add({
  targets: sprite,
  y: sprite.y - 50,
  alpha: 0,
  duration: 500,
  ease: "Power2",
  onComplete: () => sprite.destroy(),
});

// Screen shake
this.cameras.main.shake(200, 0.01);

// Time events
this.time.addEvent({
  delay: 2000,
  callback: spawnEnemy,
  loop: true,
});
```

### 5. Phaser 3 to 4 migration notes

Per the official v4 migration guide:

- **Renderer**: custom WebGL pipelines are gone, replaced by render nodes; Canvas is deprecated; `Mesh`, `Plane`, `Camera3D`, `Layer3D` and `Create.GenerateTexture` are removed.
- **Filters** replace FX and masks: no `preFX`/`postFX`, `BitmapMask` is replaced by the `Mask` filter.
- **Removed or changed APIs**: `Phaser.Geom.Point` (use `Vector2`), `Phaser.Struct.Set`/`Map` (use native `Set`/`Map`), `setTintFill()` (use `setTintMode(Phaser.TintModes.FILL)`), `Math.PI2` (use `Math.TAU`; `TAU` now equals 2 PI), and `DynamicTexture`/`RenderTexture` need an explicit `render()` call.
- **Defaults**: `roundPixels` is now false. Particle emitters (`this.add.particles(x, y, key, config)`), Arcade and Matter physics, tilemaps, tweens and scenes work as in 3.60+.

## Examples

### Example 1: Coin-collecting platformer prototype

**User request:** "Make a small platformer in the browser where I run, jump and collect coins, with Phaser and TypeScript."

Scaffold with Vite as above, then add `PreloadScene` (loads `hero` spritesheet, `coin`, `terrain-tiles`, `level-1` Tiled JSON), `GameScene` as shown (Arcade gravity 300, `setCollisionByProperty({ collides: true })`, overlap with coins) and `HUDScene` listening to `score-changed`. `npm run dev` serves it at http://localhost:5173; the hero runs at 160 px/s, jumps only when `body.blocked.down`, and the score text updates on each coin.

### Example 2: Fix a Phaser 3 tutorial that breaks on v4

**User request:** "I copied a shooter tutorial and `new Phaser.Struct.Set()` and `setTintFill()` throw errors after installing phaser."

Replace `Phaser.Struct.Set` with `new Set()` (`add`, `has`, `delete`, `forEach`) and `sprite.setTintFill(0xffffff)` with `sprite.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff)`. Run `npm ls phaser` to confirm 4.x; if the tutorial needs v3 internals, pin `npm install phaser@3.90` rather than patching around them.

## Guidelines

1. **One scene per concern**: menu, game, HUD (launched in parallel with `this.scene.launch`), pause, game over.
2. **Arcade physics first**: AABB collisions are enough for most 2D games; use Matter.js only for polygons, joints or realistic stacking.
3. **Tiled for levels**: export JSON, load with `this.make.tilemap`, use object layers for spawn points.
4. **Pool objects**: `this.physics.add.group({ maxSize: 50 })` and reuse bullets and enemies; destroy particle emitters you no longer need.
5. **Input in `create()`**: build `createCursorKeys()` and key objects once, read them in `update()`.
6. **Texture atlases** (TexturePacker, Free Texture Packer) cut draw calls and load time.
7. **Mobile**: set `scale.mode = Phaser.Scale.FIT`, use pointer events for touch and add on-screen buttons; the default is single touch plus mouse, add `this.input.addPointer(2)` for multi-touch.
8. **Browsers block audio until a user gesture**: start music after the first click or key press.
9. **Serve over HTTP**: loading assets from `file://` fails; use the Vite dev server.
