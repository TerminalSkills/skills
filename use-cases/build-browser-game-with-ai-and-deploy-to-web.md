---
title: Build a Browser Game with AI and Deploy to the Web
slug: build-browser-game-with-ai-and-deploy-to-web
description: Build a complete browser-based game using Phaser for the game engine, PixiJS for high-performance 2D rendering, and Tiled for level design — creating a roguelike dungeon crawler with procedural generation, combat system, and leaderboard that runs at 60fps on mobile browsers.
skills: [phaser, pixijs, tiled]
category: Game Development
tags: [game-dev, browser-game, html5, 2d, roguelike, creative-coding]
---

# Build a Browser Game with AI and Deploy to the Web

Kai is a frontend developer who wants to build and monetize a browser game. The target: a roguelike dungeon crawler with procedural level generation, pixel art, and a global leaderboard. The game must run on mobile browsers at 60fps (no app store needed), be playable in under 30 seconds from first click, and have enough depth to keep players coming back.

Kai uses Phaser as the main game framework, PixiJS for custom shader effects, and Tiled for designing handcrafted boss rooms that mix with procedurally generated floors.

## Step 1: Game Setup with Phaser

Phaser provides the game loop, physics, input handling, sprite management, and scene system. Kai sets up a TypeScript project with Vite for instant hot reloading during development.

```typescript
// src/main.ts — Game entry point
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { DungeonScene } from "./scenes/DungeonScene";
import { UIScene } from "./scenes/UIScene";
import { GameOverScene } from "./scenes/GameOverScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,                      // WebGL with Canvas fallback
  width: 480,
  height: 320,
  pixelArt: true,                         // Crisp pixel art scaling
  scale: {
    mode: Phaser.Scale.FIT,               // Fit to screen, maintain ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },           // Top-down: no gravity
      debug: import.meta.env.DEV,         // Show hitboxes in dev
    },
  },
  scene: [BootScene, DungeonScene, UIScene, GameOverScene],
};

new Phaser.Game(config);
```

```typescript
// src/scenes/DungeonScene.ts — Main game scene
import Phaser from "phaser";
import { DungeonGenerator } from "../systems/DungeonGenerator";
import { Player } from "../entities/Player";
import { EnemyManager } from "../systems/EnemyManager";

export class DungeonScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: EnemyManager;
  private dungeon!: DungeonGenerator;
  private floor: number = 1;

  constructor() {
    super("DungeonScene");
  }

  create() {
    // Generate procedural dungeon
    this.dungeon = new DungeonGenerator({
      width: 50,                          // 50 tiles wide
      height: 50,                         // 50 tiles tall
      roomMinSize: 5,
      roomMaxSize: 12,
      maxRooms: 15,
      corridorWidth: 2,
    });

    const map = this.dungeon.generate(this.floor);

    // Create tilemap from generated data
    const tilemap = this.make.tilemap({
      data: map.tiles,
      tileWidth: 16,
      tileHeight: 16,
    });
    const tileset = tilemap.addTilesetImage("dungeon-tiles");
    const groundLayer = tilemap.createLayer(0, tileset!, 0, 0);
    groundLayer!.setCollisionByExclusion([0, 1, 2]);  // Wall tiles collide

    // Spawn player at the starting room
    const startRoom = map.rooms[0];
    this.player = new Player(
      this,
      startRoom.centerX * 16,
      startRoom.centerY * 16,
    );

    // Spawn enemies in other rooms
    this.enemies = new EnemyManager(this);
    map.rooms.slice(1).forEach((room) => {
      const enemyCount = Phaser.Math.Between(1, 3 + this.floor);
      this.enemies.spawnInRoom(room, enemyCount, this.floor);
    });

    // Camera follows player
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(2);

    // Collisions
    this.physics.add.collider(this.player.sprite, groundLayer!);
    this.physics.add.collider(this.enemies.group, groundLayer!);
    this.physics.add.overlap(
      this.player.attackHitbox,
      this.enemies.group,
      this.handleAttackHit.bind(this),
    );
  }

  update(time: number, delta: number) {
    this.player.update(delta);
    this.enemies.update(delta, this.player.sprite);
  }

  private handleAttackHit(
    _hitbox: Phaser.GameObjects.GameObject,
    enemy: Phaser.GameObjects.GameObject,
  ) {
    const damage = this.player.getAttackDamage();
    (enemy as any).takeDamage(damage);

    // Screen shake on hit for game feel
    this.cameras.main.shake(50, 0.005);

    // Floating damage number
    this.showDamageNumber(enemy.body!.position, damage);
  }
}
```

## Step 2: Procedural Dungeon Generation

The dungeon generator creates unique layouts every run using BSP (Binary Space Partition) with guaranteed connectivity between rooms.

```typescript
// src/systems/DungeonGenerator.ts — Procedural level generation
interface Room {
  x: number; y: number;
  width: number; height: number;
  centerX: number; centerY: number;
  type: "normal" | "treasure" | "boss";
}

interface DungeonConfig {
  width: number;
  height: number;
  roomMinSize: number;
  roomMaxSize: number;
  maxRooms: number;
  corridorWidth: number;
}

export class DungeonGenerator {
  private config: DungeonConfig;

  constructor(config: DungeonConfig) {
    this.config = config;
  }

  generate(floor: number): { tiles: number[][]; rooms: Room[] } {
    const tiles = this.createEmptyGrid();   // Fill with wall tiles
    const rooms: Room[] = [];

    // Generate rooms using BSP
    for (let i = 0; i < this.config.maxRooms; i++) {
      const width = Phaser.Math.Between(this.config.roomMinSize, this.config.roomMaxSize);
      const height = Phaser.Math.Between(this.config.roomMinSize, this.config.roomMaxSize);
      const x = Phaser.Math.Between(1, this.config.width - width - 1);
      const y = Phaser.Math.Between(1, this.config.height - height - 1);

      const room: Room = {
        x, y, width, height,
        centerX: Math.floor(x + width / 2),
        centerY: Math.floor(y + height / 2),
        type: i === this.config.maxRooms - 1 ? "boss" : "normal",
      };

      // Check overlap with existing rooms
      if (!rooms.some(r => this.roomsOverlap(r, room, 2))) {
        this.carveRoom(tiles, room);
        if (rooms.length > 0) {
          // Connect to previous room with L-shaped corridor
          this.carveCorridor(tiles, rooms[rooms.length - 1], room);
        }
        rooms.push(room);
      }
    }

    // Mark treasure rooms (every 3rd room after the first)
    rooms.forEach((room, i) => {
      if (i > 0 && i % 3 === 0 && room.type !== "boss") {
        room.type = "treasure";
      }
    });

    // Difficulty scales with floor
    return { tiles, rooms };
  }

  // ... helper methods for carving, corridor generation, overlap detection
}
```

## Step 3: Mobile Controls and Performance

The game needs to run at 60fps on mid-range phones. Kai adds virtual joystick controls and optimizes rendering.

```typescript
// src/systems/MobileControls.ts — Touch input for mobile
export class MobileControls {
  private joystick: VirtualJoystick;
  private attackButton: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    if (!scene.sys.game.device.input.touch) return;

    // Virtual joystick (left thumb)
    this.joystick = new VirtualJoystick(scene, {
      x: 80,
      y: scene.cameras.main.height - 80,
      radius: 50,
      base: scene.add.circle(0, 0, 50, 0x000000, 0.3),
      thumb: scene.add.circle(0, 0, 25, 0xffffff, 0.5),
    });

    // Attack button (right thumb)
    this.attackButton = scene.add.circle(
      scene.cameras.main.width - 80,
      scene.cameras.main.height - 80,
      40, 0xff4444, 0.5
    ).setInteractive().setScrollFactor(0).setDepth(100);

    this.attackButton.on("pointerdown", () => {
      scene.events.emit("attack");
    });
  }

  getDirection(): { x: number; y: number } {
    if (!this.joystick) return { x: 0, y: 0 };
    return {
      x: this.joystick.forceX,
      y: this.joystick.forceY,
    };
  }
}
```

## Results

Kai ships the game in 2 weeks of evenings and weekends. The game runs at 60fps on iPhone 12 and Android mid-range devices. Players average 12 minutes per session with a 34% day-1 retention rate.

- **Playable in browser**: No downloads, no app store, instant play from a URL
- **Procedural content**: Every run is unique; 15 room types × infinite floor combinations
- **Performance**: 60fps on mobile browsers with 200+ sprites on screen
- **Monetization**: Optional ad-free mode ($2.99) + cosmetic unlocks; $340/month after 2 months
- **Tech stack cost**: $0 (Phaser is free, hosted on Vercel free tier, leaderboard on Supabase free tier)
