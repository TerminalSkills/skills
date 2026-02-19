---
title: Build a 2D Browser Game with Phaser
slug: build-2d-browser-game-with-phaser
description: Build a polished 2D platformer game that runs in the browser — with physics, animations, level design in Tiled, and deployment to itch.io — playable instantly via URL on desktop and mobile.
skills:
  - phaser
  - tailwindcss
category: Game Development
tags:
  - gamedev
  - browser-game
  - 2d
  - html5
  - javascript
---

# Build a 2D Browser Game with Phaser

Yuki is an indie game developer who wants to build a platformer for a game jam. The constraint: the game must be playable in a browser with no download. She has 48 hours to build a game with tight controls, hand-designed levels, enemy AI, and a score system — all running at 60fps on mobile browsers.

## Step 1 — Set Up the Game with Scenes

Phaser games are organized into scenes: a boot scene for loading assets, a menu scene, the main game scene, and a game over scene. Each scene has its own lifecycle and state.

```typescript
// src/main.ts — Game configuration and entry point.
// Creates a Phaser game with Arcade physics (fast, good enough for platformers).
// Scale mode FIT ensures the game fills the screen on any device.

import Phaser from "phaser";
import { BootScene } from "./scenes/boot";
import { MenuScene } from "./scenes/menu";
import { GameScene } from "./scenes/game";
import { GameOverScene } from "./scenes/game-over";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,               // WebGL with Canvas fallback
  width: 480,                      // Game resolution (not screen resolution)
  height: 270,                     // 16:9 at low res for pixel art
  pixelArt: true,                  // Disable antialiasing for crisp pixels
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 800 },  // Downward gravity
      debug: false,                // Set true during development to see hitboxes
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,        // Scale game to fill container
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

new Phaser.Game(config);
```

## Step 2 — Build the Player Controller

The player needs responsive controls with variable jump height (tap for small jump, hold for high jump), coyote time (brief window to jump after leaving a ledge), and wall sliding.

```typescript
// src/entities/player.ts — Player character with tight platformer controls.
// Coyote time and jump buffering make the game feel responsive
// even when the player's timing is slightly off.

import Phaser from "phaser";

const SPEED = 160;
const JUMP_VELOCITY = -280;        // Negative = upward in Phaser
const COYOTE_TIME = 80;            // ms after leaving ground where jump still works
const JUMP_BUFFER_TIME = 100;      // ms before landing where jump input is remembered
const WALL_SLIDE_SPEED = 40;       // Slow descent when sliding on wall

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private jumpKey: Phaser.Input.Keyboard.Key;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private isJumping = false;
  private facing: "left" | "right" = "right";
  private isDead = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, "player");
    this.sprite.setSize(12, 14);     // Hitbox smaller than sprite (forgiving collisions)
    this.sprite.setOffset(2, 2);
    this.sprite.setCollideWorldBounds(true);

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.jumpKey = scene.input.keyboard!.addKey("SPACE");

    this.setupAnimations(scene);
  }

  update(delta: number) {
    if (this.isDead) return;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;
    const onWall = body.blocked.left || body.blocked.right;

    // --- Horizontal Movement ---
    if (this.cursors.left.isDown) {
      body.setVelocityX(-SPEED);
      this.facing = "left";
      this.sprite.setFlipX(true);
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(SPEED);
      this.facing = "right";
      this.sprite.setFlipX(false);
    } else {
      // Decelerate (not instant stop — feels better)
      body.setVelocityX(body.velocity.x * 0.85);
    }

    // --- Coyote Time ---
    // Track how long since the player was last on the ground.
    // If they walk off a ledge, they can still jump for COYOTE_TIME ms.
    if (onGround) {
      this.coyoteTimer = COYOTE_TIME;
      this.isJumping = false;
    } else {
      this.coyoteTimer -= delta;
    }

    // --- Jump Buffer ---
    // If the player presses jump slightly before landing,
    // remember the input and execute it when they touch ground.
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jumpBufferTimer = JUMP_BUFFER_TIME;
    } else {
      this.jumpBufferTimer -= delta;
    }

    // --- Execute Jump ---
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      body.setVelocityY(JUMP_VELOCITY);
      this.isJumping = true;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
    }

    // --- Variable Jump Height ---
    // If the player releases jump early, cut upward velocity
    // for a shorter hop. Hold for full height.
    if (this.isJumping && !this.jumpKey.isDown && body.velocity.y < -100) {
      body.setVelocityY(body.velocity.y * 0.5);
    }

    // --- Wall Slide ---
    if (onWall && !onGround && body.velocity.y > 0) {
      body.setVelocityY(WALL_SLIDE_SPEED);
      this.sprite.play("wall_slide", true);
      return;
    }

    // --- Animations ---
    if (!onGround) {
      this.sprite.play(body.velocity.y < 0 ? "jump" : "fall", true);
    } else if (Math.abs(body.velocity.x) > 10) {
      this.sprite.play("run", true);
    } else {
      this.sprite.play("idle", true);
    }
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.sprite.play("die");
    this.sprite.body!.enable = false;

    // Dramatic death bounce
    this.sprite.setVelocityY(-200);
  }

  private setupAnimations(scene: Phaser.Scene) {
    scene.anims.create({
      key: "idle",
      frames: scene.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    scene.anims.create({
      key: "run",
      frames: scene.anims.generateFrameNumbers("player", { start: 4, end: 9 }),
      frameRate: 10,
      repeat: -1,
    });
    scene.anims.create({
      key: "jump",
      frames: [{ key: "player", frame: 10 }],
    });
    scene.anims.create({
      key: "fall",
      frames: [{ key: "player", frame: 11 }],
    });
    scene.anims.create({
      key: "wall_slide",
      frames: [{ key: "player", frame: 12 }],
    });
    scene.anims.create({
      key: "die",
      frames: scene.anims.generateFrameNumbers("player", { start: 13, end: 16 }),
      frameRate: 8,
      repeat: 0,
    });
  }
}
```

## Step 3 — Load Levels from Tiled

```typescript
// src/scenes/game.ts — Main game scene.
// Loads levels designed in Tiled (free tilemap editor).
// Tiled exports JSON, Phaser loads it with tileset and object layers.

import Phaser from "phaser";
import { Player } from "../entities/player";
import { Enemy } from "../entities/enemy";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private currentLevel = 1;

  constructor() {
    super("game");
  }

  create() {
    // Load tilemap exported from Tiled
    const map = this.make.tilemap({ key: `level${this.currentLevel}` });
    const tileset = map.addTilesetImage("terrain", "terrain_tiles")!;

    // Create layers (defined in Tiled)
    const bgLayer = map.createLayer("background", tileset)!;
    const groundLayer = map.createLayer("ground", tileset)!;
    const decorLayer = map.createLayer("decoration", tileset)!;

    // Set collision on ground tiles (property set in Tiled)
    groundLayer.setCollisionByProperty({ collides: true });

    // Set world bounds to map size
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Spawn player from Tiled object layer
    const spawnPoint = map.findObject("objects", (obj) => obj.name === "spawn");
    this.player = new Player(this, spawnPoint!.x!, spawnPoint!.y!);

    // Camera follows player with deadzone (slight delay for game feel)
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Spawn enemies from Tiled object layer
    this.enemies = this.physics.add.group();
    const enemyObjects = map.filterObjects("objects", (obj) => obj.name === "enemy");
    enemyObjects.forEach((obj) => {
      const enemy = new Enemy(this, obj.x!, obj.y!, obj.properties?.[0]?.value || "patrol");
      this.enemies.add(enemy.sprite);
    });

    // Spawn coins
    this.coins = this.physics.add.group();
    const coinObjects = map.filterObjects("objects", (obj) => obj.name === "coin");
    coinObjects.forEach((obj) => {
      const coin = this.coins.create(obj.x!, obj.y!, "coin") as Phaser.Physics.Arcade.Sprite;
      coin.play("coin_spin");
      coin.body!.setAllowGravity(false);  // Coins float in the air
    });

    // Collisions
    this.physics.add.collider(this.player.sprite, groundLayer);
    this.physics.add.collider(this.enemies, groundLayer);

    // Player collects coins
    this.physics.add.overlap(this.player.sprite, this.coins, (_, coin) => {
      (coin as Phaser.Physics.Arcade.Sprite).destroy();
      this.score += 10;
      this.scoreText.setText(`Score: ${this.score}`);
      this.sound.play("coin_collect");
      // Juice: screen shake and particle burst
      this.cameras.main.shake(50, 0.002);
    });

    // Player hits enemy (from above = kill, from side = die)
    this.physics.add.overlap(this.player.sprite, this.enemies, (player, enemy) => {
      const playerBody = (player as Phaser.Physics.Arcade.Sprite).body!;
      const enemyBody = (enemy as Phaser.Physics.Arcade.Sprite).body!;

      if (playerBody.velocity.y > 0 && playerBody.y < enemyBody.y) {
        // Stomped enemy from above
        (enemy as Phaser.Physics.Arcade.Sprite).destroy();
        playerBody.setVelocityY(-200);  // Bounce off enemy
        this.score += 50;
        this.scoreText.setText(`Score: ${this.score}`);
      } else {
        // Hit from side — player dies
        this.player.die();
        this.time.delayedCall(1500, () => {
          this.scene.start("game-over", { score: this.score });
        });
      }
    });

    // HUD
    this.scoreText = this.add.text(8, 8, "Score: 0", {
      fontSize: "8px",
      fontFamily: "monospace",
      color: "#ffffff",
    }).setScrollFactor(0);  // Fixed to camera, doesn't scroll with world
  }

  update(_time: number, delta: number) {
    this.player.update(delta);
  }
}
```

## Step 4 — Add Mobile Touch Controls

```typescript
// src/ui/touch-controls.ts — Virtual touch controls for mobile.
// Renders transparent buttons over the game canvas.
// Uses Phaser's built-in pointer events — no external library needed.

import Phaser from "phaser";

export class TouchControls {
  private leftBtn: Phaser.GameObjects.Zone;
  private rightBtn: Phaser.GameObjects.Zone;
  private jumpBtn: Phaser.GameObjects.Zone;

  // Expose state for the player controller to read
  isLeftDown = false;
  isRightDown = false;
  isJumpDown = false;
  justJumped = false;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.cameras.main;

    // Left side of screen: left/right movement zones
    this.leftBtn = scene.add.zone(0, height - 60, width * 0.25, 60)
      .setOrigin(0, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(100);

    this.rightBtn = scene.add.zone(width * 0.25, height - 60, width * 0.25, 60)
      .setOrigin(0, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(100);

    // Right side of screen: jump zone (entire right half)
    this.jumpBtn = scene.add.zone(width * 0.5, 0, width * 0.5, height)
      .setOrigin(0, 0)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(100);

    // Touch event handlers
    this.leftBtn.on("pointerdown", () => { this.isLeftDown = true; });
    this.leftBtn.on("pointerup", () => { this.isLeftDown = false; });
    this.leftBtn.on("pointerout", () => { this.isLeftDown = false; });

    this.rightBtn.on("pointerdown", () => { this.isRightDown = true; });
    this.rightBtn.on("pointerup", () => { this.isRightDown = false; });
    this.rightBtn.on("pointerout", () => { this.isRightDown = false; });

    this.jumpBtn.on("pointerdown", () => {
      this.isJumpDown = true;
      this.justJumped = true;
    });
    this.jumpBtn.on("pointerup", () => { this.isJumpDown = false; });

    // Visual hints (semi-transparent)
    if (scene.sys.game.device.input.touch) {
      const gfx = scene.add.graphics().setScrollFactor(0).setDepth(99).setAlpha(0.15);
      gfx.fillStyle(0xffffff);
      gfx.fillTriangle(20, height - 30, 40, height - 50, 40, height - 10);   // Left arrow
      gfx.fillTriangle(width * 0.25 + 40, height - 30, width * 0.25 + 20, height - 50, width * 0.25 + 20, height - 10); // Right arrow
      gfx.fillCircle(width - 40, height - 40, 20);  // Jump circle
    }
  }

  consumeJump(): boolean {
    if (this.justJumped) {
      this.justJumped = false;
      return true;
    }
    return false;
  }
}
```

## Results

Yuki submitted her game to the jam and published it on itch.io. Within the first week:

- **Playable in under 2 seconds** — Phaser + pixel art assets total 1.8MB. Players click the itch.io link and play immediately. No download, no install, no app store approval.
- **Smooth 60fps on iPhone SE** — Arcade physics is optimized for 2D. The 480×270 resolution with pixel-perfect scaling means the GPU has very little work to do.
- **Controls feel great** — coyote time (80ms) and jump buffering (100ms) make the game forgiving without being floaty. Playtesters consistently said "the controls feel like Celeste" — the highest compliment for a platformer.
- **3 levels designed in Tiled in 4 hours** — visual level editor with drag-and-drop tiles. Enemy spawn points, coin placement, and collision zones are all Tiled objects — no coordinates in code.
- **Mobile plays well** — the touch zones are large and forgiving. 38% of players on itch.io played on mobile. The right-half-of-screen jump zone means players don't need to hit a tiny button.
- **Game jam result: Top 20 out of 340 entries** — judges noted the tight controls and polish. The web-native distribution meant all judges could play instantly without downloading anything.
