---
name: phaser
category: Game Development
tags: [game-engine, html5, browser-game, 2d, arcade-physics, webgl, canvas]
version: 1.0.0
author: terminal-skills
---

# Phaser — HTML5 Game Framework for Browser Games

You are an expert in Phaser, the fast and feature-rich HTML5 game framework for making 2D games that run in web browsers and mobile devices. You help developers build arcade games, puzzle games, RPGs, platformers, and roguelikes using Phaser's scene system, physics engines (Arcade and Matter.js), sprite animations, tilemaps, tweens, particle effects, and input handling — with TypeScript support and Vite for modern development workflow.

## Core Capabilities

### Game Configuration

```typescript
// src/main.ts — Phaser game entry point
import Phaser from "phaser";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,                      // WebGL → Canvas fallback
  width: 800,
  height: 600,
  pixelArt: true,                         // No anti-aliasing on sprites
  roundPixels: true,                      // Snap to pixel grid
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

### Scene System

```typescript
// src/scenes/GameScene.ts — Main game loop
export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.Group;
  private score: number = 0;

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
    const cursors = this.input.keyboard!.createCursorKeys();

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
    const particles = this.add.particles(coin.body!.position.x, coin.body!.position.y, "sparkle", {
      speed: 100,
      lifespan: 300,
      quantity: 8,
      scale: { start: 0.5, end: 0 },
      emitting: false,
    });
    particles.explode();
  }
}
```

### Physics, Tweens, and Effects

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

## Installation

```bash
# New project with Vite
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install phaser
npm run dev
```

## Best Practices

1. **Scene system** — Use separate scenes for menu, game, HUD, pause, game-over; HUD as parallel scene overlay
2. **Arcade physics for simple games** — AABB collision is fast and sufficient for most 2D games; Matter.js only when you need complex shapes
3. **Tilemap integration** — Design levels in Tiled, export as JSON, load with `this.make.tilemap`; use object layers for spawn points
4. **Object pooling** — Use `this.physics.add.group({ maxSize: 50 })` for bullets, particles, enemies; recycle instead of create/destroy
5. **Pixel art** — Set `pixelArt: true` and `roundPixels: true` in config; prevents blurry scaling on retina displays
6. **Mobile input** — Add virtual joystick for touch; Phaser has built-in pointer events for multi-touch
7. **Texture atlases** — Pack sprites into atlases (TexturePacker); reduces draw calls from 200+ to 5-10
8. **Camera** — Use `startFollow` with lerp values (0.05-0.1) for smooth camera; set bounds to tilemap size
