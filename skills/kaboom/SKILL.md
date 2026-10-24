---
name: kaboom
description: >-
  Build 2D browser games in JavaScript with Kaboom.js, whose maintained
  successor is KAPLAY. Offers an entity-component system, built-in physics,
  sprite animation, scenes and ASCII-map levels. Use when a user asks for a
  quick browser game, a game-jam prototype, a platformer or a Kaboom/Kaplay
  project, or wants to migrate a Kaboom game to KAPLAY.
license: Apache-2.0
compatibility: Node.js 18+ and a bundler (Vite), or a script tag in a browser
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/kaplayjs/kaplay
  tags:
    - game-engine
    - browser-game
    - 2d
    - kaplay
    - javascript
---

# Kaboom (Kaplay)

## Overview

Kaboom.js is no longer maintained: the `kaboom` npm package (3000.1.17) is deprecated in favour of KAPLAY, built by the same community. Write new code against `kaplay` (3001.0.19 at the time of checking). KAPLAY keeps the Kaboom API, so Kaboom tutorials mostly work after changing the import. Games are built from entities assembled out of components (`sprite()`, `pos()`, `area()`, `body()`), grouped into scenes.

## Instructions

### Installation

```bash
npm create vite@latest coin-grabber -- --template vanilla
cd coin-grabber && npm install kaplay
```

For a quick page without a bundler, load a pinned build: `<script src="https://unpkg.com/kaplay@3001.0.12/dist/kaplay.js"></script>` and call `kaplay()`. Migrating from Kaboom: replace `import kaboom from "kaboom"` with `import kaplay from "kaplay"` and `kaboom()` with `kaplay()`. Serve sprites and sounds from the project's `public/` folder (paths like `/sprites/hero.png`).

### Game setup

```javascript
// main.js — a coin-collecting platformer
import kaplay from "kaplay";

const k = kaplay({
  width: 640,
  height: 480,
  background: [20, 20, 40],
  scale: 2,                               // Pixel art scaling
  crisp: true,                            // No anti-aliasing
});
k.setGravity(1600);                       // body() entities only fall once gravity is set

// Load assets
k.loadSprite("hero", "/sprites/hero.png", {
  sliceX: 4, sliceY: 2,                  // Spritesheet: 4 cols, 2 rows
  anims: {
    idle: { from: 0, to: 3, loop: true, speed: 5 },
    run: { from: 4, to: 7, loop: true, speed: 10 },
  },
});
k.loadSprite("coin", "/sprites/coin.png");
k.loadSound("collect", "/sounds/collect.wav");

// Game scene
k.scene("game", () => {
  // Player — components define behavior
  const player = k.add([
    k.sprite("hero", { anim: "idle" }),
    k.pos(100, 200),
    k.area(),                             // Collision hitbox
    k.body(),                             // Physics body (gravity)
    k.health(3),                          // HP system
    k.anchor("bot"),                      // Anchor at bottom
    "player",                             // Tag for queries
  ]);

  // Platform
  k.add([
    k.rect(640, 40),
    k.pos(0, 440),
    k.area(),
    k.body({ isStatic: true }),
    k.color(100, 100, 100),
  ]);

  // Spawn coins
  for (let i = 0; i < 5; i++) {
    k.add([
      k.sprite("coin"),
      k.pos(k.rand(50, 590), k.rand(200, 400)),
      k.area(),
      "coin",
    ]);
  }

  // Movement
  // play() restarts the animation, so call it only when the animation changes
  const run = () => { if (player.getCurAnim()?.name !== "run") player.play("run"); };
  k.onKeyDown("left", () => { player.move(-200, 0); run(); });
  k.onKeyDown("right", () => { player.move(200, 0); run(); });
  k.onKeyRelease(["left", "right"], () => player.play("idle"));
  k.onKeyPress("space", () => { if (player.isGrounded()) player.jump(400); });

  let score = 0;
  const scoreText = k.add([k.text("Score: 0", { size: 16 }), k.pos(10, 10), k.fixed()]);

  // Collect coins
  player.onCollide("coin", (coin) => {
    k.destroy(coin);
    k.play("collect");
    score += 10;
    scoreText.text = `Score: ${score}`;
  });
});

k.go("game");
```

### Components

```javascript
// Custom components — extend any entity
function patrol(speed = 100, distance = 200) {
  let startX = 0;
  let dir = 1;
  return {
    id: "patrol",
    add() { startX = this.pos.x; },
    update() {
      this.move(speed * dir, 0);
      if (Math.abs(this.pos.x - startX) > distance) dir *= -1;
    },
  };
}

// Use the custom component (load a "slime" sprite first, as with "hero" above)
const enemy = k.add([
  k.sprite("slime"),
  k.pos(300, 400),
  k.area(),
  k.body(),
  k.health(2),
  patrol(80, 150),                        // Custom patrol behavior
  "enemy",
]);
```

### Levels and timers

`k.addLevel(["   $  ", "======"], { tileWidth: 32, tileHeight: 32, tiles: { "=": () => [k.rect(32, 32), k.area(), k.body({ isStatic: true })], "$": () => [k.circle(8), k.area(), "coin"] } })` builds a level from an ASCII map. `k.wait(2, fn)` runs once, `k.loop(1, fn)` repeats.

## Examples

### Example 1: Coin-grabber prototype
**User prompt:** "Make me a small browser platformer where I collect coins with the arrow keys and space to jump."

The agent scaffolds the Vite project, installs `kaplay`, puts `hero.png`, `coin.png` and `collect.wav` in `public/`, and writes the game from the setup section into `main.js`. `npm run dev` serves it on `http://localhost:5173`; the hero falls onto the platform, runs with the arrows, jumps with space, and each coin adds 10 to the score text.

### Example 2: Migrate a Kaboom game
**User prompt:** "My game still uses the kaboom package, switch it to Kaplay."

The agent runs `npm uninstall kaboom && npm install kaplay`, changes the import and the `kaboom({...})` call to `kaplay({...})`, then runs the dev server and fixes anything the console reports. Most component calls are unchanged.

## Guidelines

1. Compose entities from components (`body()`, `area()`, `health()`, custom); do not subclass.
2. Tag entities (`"enemy"`, `"coin"`) and find them with `k.get("enemy")`.
3. Use `k.scene()` for menu, game, pause and game-over, and `k.go("scene")` to switch.
4. `body()` needs `k.setGravity(...)` to fall; `body({ isStatic: true })` is for platforms; `isGrounded()` gates jumps.
5. `kaplay()` also puts every function on the global scope by default; pass `global: false` and use `k.` (as above) to avoid clashes.
6. Kaboom/KAPLAY suits prototypes and game jams; for a large production game consider Phaser or Godot.
7. Pin the version in production; the `next` tag is a 4000 alpha and may change the API.
