---
name: kaboom
category: Game Development
tags: [game-engine, browser-game, 2d, beginner-friendly, javascript, creative-coding]
version: 1.0.0
author: terminal-skills
---

# Kaboom (Kaplay) — Fun and Simple Browser Game Library

You are an expert in Kaboom.js (now maintained as Kaplay), the beginner-friendly game library for making browser games quickly. You help developers build games using Kaboom's component-based entity system, built-in physics, sprite loading, scene management, and event system — where games can be built in under 100 lines of code while still supporting complex gameplay through composable components.

## Core Capabilities

### Game Setup

```javascript
// main.js — Kaboom game in under 50 lines
import kaplay from "kaplay";

const k = kaplay({
  width: 640,
  height: 480,
  background: [20, 20, 40],
  scale: 2,                               // Pixel art scaling
  crisp: true,                            // No anti-aliasing
});

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
  k.onKeyDown("left", () => { player.move(-200, 0); player.play("run"); });
  k.onKeyDown("right", () => { player.move(200, 0); player.play("run"); });
  k.onKeyRelease(["left", "right"], () => player.play("idle"));
  k.onKeyPress("space", () => { if (player.isGrounded()) player.jump(400); });

  // Collect coins
  player.onCollide("coin", (coin) => {
    k.destroy(coin);
    k.play("collect");
    score += 10;
    scoreText.text = `Score: ${score}`;
  });

  let score = 0;
  const scoreText = k.add([k.text("Score: 0", { size: 16 }), k.pos(10, 10), k.fixed()]);
});

k.go("game");
```

### Component System

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

// Use the custom component
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

## Installation

```bash
npm install kaplay
# Or use CDN: <script src="https://unpkg.com/kaplay/dist/kaplay.js"></script>
```

## Best Practices

1. **Components over inheritance** — Compose entities from components (`body()`, `area()`, `health()`, custom); don't subclass
2. **Tags for queries** — Tag entities ("enemy", "coin", "bullet") and use `k.get("enemy")` to find them
3. **Scenes for states** — Use `k.scene()` for menu, game, pause, game-over; `k.go("scene")` to switch
4. **Built-in physics** — `body()` gives gravity + collision; `body({ isStatic: true })` for platforms; `isGrounded()` for jump checks
5. **Level loading** — Use `k.addLevel()` with ASCII art maps for quick level prototyping
6. **Events** — `onCollide`, `onKeyPress`, `onUpdate`, `onClick` for game logic; clean and readable
7. **Rapid prototyping** — Kaboom is ideal for game jams and prototypes; migrate to Phaser for production scale
8. **Timer events** — `k.wait(2, callback)` and `k.loop(1, callback)` for timed spawning and effects
