---
title: Build a Browser Game with AI and Deploy to the Web
slug: build-browser-game-with-ai-and-deploy-to-web
description: Build a roguelike dungeon crawler for the browser with Phaser 4 for the game, PixiJS 8 for an ember overlay, and Tiled for a handcrafted boss room, then ship it as static files with a small leaderboard service.
skills: [phaser, pixijs, tiled]
category: development
tags: [game-dev, browser-game, html5, 2d, roguelike, creative-coding]
---

# Build a Browser Game with AI and Deploy to the Web

## The Problem

Kai is a frontend developer who wants to publish a browser game: a roguelike dungeon crawler with procedurally generated floors, a handcrafted boss room, and a leaderboard. It has to be playable from a URL on a phone with no install, so controls must work with one finger and the whole thing has to ship as static files.

Most of the time goes to glue: a bundler setup, a tilemap pipeline, touch input, and finding out which tutorial code still works. Phaser 4 and PixiJS 8 both changed their APIs, so older examples fail in small ways (for example, `setTintFill()` no longer exists in Phaser 4).

## The Solution

Three skills split the work. **phaser** covers the game loop, Arcade physics, tilemaps and the Phaser 4 changes. **tiled** covers authoring the boss room as a `.tmj` map with a `collides` tile property. **pixijs** covers a separate PixiJS canvas layered over the game for ambient embers, drawn as one batch of particles. The result builds with Vite into a folder of static files; only the leaderboard needs a server.

## Step-by-Step Walkthrough

### Step 1: Scaffold the project

```bash
npm create vite@latest crypt-runner -- --template vanilla-ts
cd crypt-runner && npm install phaser pixi.js
```

This was checked with `phaser@4.2.1`, `pixi.js@8.22.0` and `vite@8.3.5`. In `vite.config.ts` set `base: "./"` so the build works from any path on a static host. The game config is small:

```typescript
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { DungeonScene } from "./scenes/DungeonScene";
import { startEmbers } from "./embers";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 480,
  height: 320,
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: import.meta.env.DEV } },
  scene: [BootScene, DungeonScene],
});
startEmbers(document.getElementById("embers")!);
```

`index.html` holds two layers: `<div id="game">` for Phaser and `<div id="embers">` (position fixed, `pointer-events: none`) for PixiJS.

### Step 2: Generate the floors

Rooms are placed at random, rejected if they come within two tiles of another room, and each new room is joined to the previous one by an L-shaped corridor, so every room is reachable.

```typescript
export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }
export const WALL = 1, FLOOR = 0;

export function generate(width = 50, height = 50, maxRooms = 15, rnd: (a: number, b: number) => number) {
  const tiles = Array.from({ length: height }, () => Array<number>(width).fill(WALL));
  const rooms: Room[] = [];
  for (let i = 0; i < maxRooms * 3 && rooms.length < maxRooms; i++) {
    const w = rnd(5, 12), h = rnd(5, 12);
    const x = rnd(1, width - w - 1), y = rnd(1, height - h - 1);
    const room: Room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
    // keep a 2-tile gap between rooms
    if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) tiles[ty][tx] = FLOOR;
    const prev = rooms[rooms.length - 1];
    if (prev) carve(tiles, prev, room);
    rooms.push(room);
  }
  return { tiles, rooms };
}

// L-shaped corridor, 2 tiles wide; every room is joined to the previous one, so the map is connected
function carve(tiles: number[][], a: Room, b: Room) {
  const dig = (x: number, y: number) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[y + dy][x + dx] = FLOOR; };
  for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) dig(x, a.cy);
  for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) dig(b.cx, y);
}
```

### Step 3: Build the scene

On floors 1 and 2 the scene turns the generated grid into a tilemap. On the boss floor it loads a map designed in Tiled instead. In both cases the player, enemies and colliders are created the same way.

```typescript
  create() {
    let layer: Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer, spawn: { x: number; y: number }, spots: { x: number; y: number }[];
    if (this.floor === BOSS_FLOOR) {
      // Hand-built boss room designed in Tiled; the "Walls" layer tiles carry a `collides` property
      const map = this.make.tilemap({ key: "boss" });
      const ts = map.addTilesetImage("dungeon", "tiles")!;
      map.createLayer("Floor", ts)!;
      layer = map.createLayer("Walls", ts)!;
      layer.setCollisionByProperty({ collides: true });
      const pts = map.getObjectLayer("Objects")!.objects;
      const at = (n: string) => pts.find(o => o.name === n)!;
      spawn = { x: at("player").x!, y: at("player").y! };
      spots = [{ x: at("boss").x!, y: at("boss").y! }];
      this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    } else {
      const { tiles, rooms } = generate(50, 50, 15, Phaser.Math.Between);
      const map = this.make.tilemap({ data: tiles, tileWidth: TS, tileHeight: TS });
      layer = map.createLayer(0, map.addTilesetImage("tiles", "tiles", TS, TS)!, 0, 0)!;
      layer.setCollision(1);                       // tile index 1 = wall
      spawn = { x: rooms[0].cx * TS, y: rooms[0].cy * TS };
      spots = rooms.slice(1).flatMap(r => Array.from({ length: Phaser.Math.Between(1, 2 + this.floor) },
        () => ({ x: Phaser.Math.Between(r.x + 1, r.x + r.w - 2) * TS, y: Phaser.Math.Between(r.y + 1, r.y + r.h - 2) * TS })));
      this.physics.world.setBounds(0, 0, 50 * TS, 50 * TS);
    }
  // ... then create the player, enemies, colliders and camera
```

Notes from the Phaser 4 typings: `createLayer` returns `TilemapLayer | TilemapGPULayer`, so type the variable as that union. Tile tinting uses `setTintMode(Phaser.TintModes.FILL).setTint(color)`, not `setTintFill()`.

### Step 4: Design the boss room in Tiled

Create a 20x12 map with 16 px tiles, a tileset with two tiles (floor, wall), and set a custom boolean property `collides` on the wall tile. Add tile layers `Floor` and `Walls` and an object layer `Objects` with point objects named `player` and `boss`. Export as JSON (`.tmj`) into `public/maps/` and load it in the boot scene:

```typescript
this.load.tilemapTiledJSON("boss", "maps/boss.tmj");
```

The scene reads spawn points from the `Objects` layer and calls `setCollisionByProperty({ collides: true })`, as in Step 3. Level changes never touch the code.

### Step 5: One-finger controls and auto-attack

Instead of a joystick plugin, the player walks toward the pointer while it is held, and attacks the nearest enemy automatically. Keyboard arrows work too.

```typescript
    // Auto-attack the nearest enemy within 28 px: no attack button needed on a phone
    const alive = this.enemies.getChildren() as Enemy[];
    for (const e of alive) this.physics.moveToObject(e, this.player, 50);
    const near = alive.find(e => Phaser.Math.Distance.BetweenPoints(e, this.player) < 28);
    if (near && time - this.lastSwing > 400) {
      this.lastSwing = time; near.hp -= 1; this.cameras.main.shake(50, 0.005);
      near.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
      this.time.delayedCall(60, () => near.active && near.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      if (near.hp <= 0) { near.destroy(); this.score += this.floor === BOSS_FLOOR ? 500 : 10; }
    }
```

Set `this.input.addPointer(2)` if you later add a second on-screen control.

### Step 6: Add the PixiJS ember overlay

PixiJS 8 starts with `await app.init()`, exposes the canvas as `app.canvas`, and draws large particle sets with `ParticleContainer`. A transparent second canvas above the game keeps the two renderers independent.

```typescript
import { Application, Particle, ParticleContainer, Texture, Graphics } from "pixi.js";

// A second canvas above Phaser: PixiJS draws 3,000 drifting embers in one batched call.
export async function startEmbers(host: HTMLElement) {
  const app = new Application();
  await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: false });
  host.appendChild(app.canvas);

  const dot = new Graphics().circle(0, 0, 2).fill(0xff8a3d);
  const texture: Texture = app.renderer.generateTexture(dot);
  const layer = new ParticleContainer({ dynamicProperties: { position: true } });
  const parts: Particle[] = [];
  for (let i = 0; i < 3000; i++) {
    const p = new Particle({ texture, x: Math.random() * app.screen.width, y: Math.random() * app.screen.height, alpha: 0.15 + Math.random() * 0.35 });
    parts.push(p); layer.addParticle(p);
  }
  app.stage.addChild(layer);
  app.ticker.add((t) => {
    for (const p of parts) {
      p.y -= 0.4 * t.deltaTime;
      p.x += Math.sin((p.y + p.x) * 0.01) * 0.2 * t.deltaTime;
      if (p.y < -4) { p.y = app.screen.height + 4; p.x = Math.random() * app.screen.width; }
    }
  });
}
```

Call `startEmbers(document.getElementById("embers")!)` once from `main.ts`. PixiJS needs WebGL or WebGPU, and so does Phaser 4's default renderer, so very old devices will not run the game.

### Step 7: A leaderboard service

The static game posts the score when a run ends. This dependency-free Node service validates the input, keeps the top 100, binds to 127.0.0.1 and allows one origin. For production, set `ALLOWED_ORIGIN` to the game's URL and put the service behind a reverse proxy with HTTPS. Add rate limiting there, because a client-submitted score can always be forged.

```javascript
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = "scores.json", ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://127.0.0.1:4173";
let scores = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url !== "/scores") return res.writeHead(404).end();
  if (req.method === "GET") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(scores.slice(0, 20)));
  if (req.method !== "POST") return res.writeHead(405).end();
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1024) req.destroy(); });
  req.on("end", () => {
    try {
      const { name, score } = JSON.parse(body);
      if (typeof name !== "string" || !name.trim() || name.length > 16 || !Number.isInteger(score) || score < 0 || score > 100000) throw 0;
      scores = [...scores, { name: name.trim(), score }].sort((a, b) => b.score - a.score).slice(0, 100);
      writeFileSync(FILE, JSON.stringify(scores));
      res.writeHead(201).end();
    } catch { res.writeHead(400).end(); }
  });
}).listen(3300, "127.0.0.1");
```

The client reads the service URL from `VITE_SCORES_URL` at build time.

### Step 8: Build and deploy

```bash
VITE_SCORES_URL=https://scores.example.com npm run build   # type-checks with tsc, then writes dist/
npm run preview                                            # serves dist/ on 127.0.0.1:4173
```

`dist/` is plain static files (HTML, one JS bundle, `maps/boss.tmj`). Upload it to any static host, such as GitHub Pages, Cloudflare Pages or Netlify, or serve it from Nginx or Caddy. The first-load bundle is dominated by Phaser, so check the size in the Vite build output and test on a real phone. Run the score service on any Node host and point `VITE_SCORES_URL` at it.

## Real-World Example

Kai builds the game over a few evenings with the three skills loaded. Floors 1 and 2 are generated; floor 3 is a boss room that Kai redraws in Tiled twice without touching TypeScript. During development, `?floor=3` in the URL jumps straight to the boss room.

Checks that were run on this build: `tsc --noEmit` passes, `vite build` succeeds, the game loads on floors 1 and 3 with no console errors, and the score service accepts a valid score (201) and rejects a negative one (400). Kai then profiles frame rate on two real phones before announcing the game, since that depends on the device and the sprite count.

## Related Skills

- [phaser](../skills/phaser/) -- Game loop, Arcade physics, tilemaps, and the Phaser 3 to 4 changes
- [pixijs](../skills/pixijs/) -- PixiJS 8 setup, particles and filters
- [tiled](../skills/tiled/) -- Level design and loading Tiled maps in a game engine
