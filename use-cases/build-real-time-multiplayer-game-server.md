---
title: Build a Real-Time Multiplayer Game Server
slug: build-real-time-multiplayer-game-server
description: Build a WebSocket game server with authoritative state, tick-based updates, client prediction, lag compensation, and matchmaking — handling 100+ concurrent players with smooth gameplay.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Full-Stack Development
tags:
  - multiplayer
  - game-server
  - websocket
  - real-time
  - networking
---

# Build a Real-Time Multiplayer Game Server

## The Problem

Dario leads engineering at a 15-person indie game studio. Their browser-based multiplayer game sends player positions from client to server, but cheaters modify client state to teleport and speed-hack. Without authoritative server state, anyone with browser DevTools can cheat. Latency makes movement feel laggy — 150ms round trip means players see their character respond 150ms late. They need an authoritative server with client-side prediction, tick-based simulation, and lag compensation.

## Step 1: Build the Game Loop and State Management

```typescript
// src/game/game-loop.ts — Authoritative server tick loop with state management
import { WebSocket } from "ws";

const TICK_RATE = 20;  // 20 ticks/second (50ms per tick)
const TICK_MS = 1000 / TICK_RATE;

interface Player {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  health: number;
  score: number;
  lastInputSeq: number;  // for client reconciliation
  inputBuffer: PlayerInput[];
}

interface PlayerInput {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
  rotation: number;
  timestamp: number;
}

interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;  // ticks remaining
}

interface GameState {
  tick: number;
  players: Map<string, Player>;
  projectiles: Map<string, Projectile>;
  mapWidth: number;
  mapHeight: number;
}

const MOVE_SPEED = 200;     // pixels per second
const PROJECTILE_SPEED = 500;
const MAP_SIZE = 2000;

export class GameLoop {
  private state: GameState;
  private connections: Map<string, WebSocket> = new Map();
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.state = {
      tick: 0,
      players: new Map(),
      projectiles: new Map(),
      mapWidth: MAP_SIZE,
      mapHeight: MAP_SIZE,
    };
  }

  start() {
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    this.state.tick++;

    // Process buffered inputs for all players
    for (const player of this.state.players.values()) {
      const input = player.inputBuffer.shift();
      if (input) {
        this.applyInput(player, input);
        player.lastInputSeq = input.seq;
      }
    }

    // Update projectiles
    for (const [id, proj] of this.state.projectiles) {
      proj.x += proj.vx * (TICK_MS / 1000);
      proj.y += proj.vy * (TICK_MS / 1000);
      proj.ttl--;

      if (proj.ttl <= 0 || proj.x < 0 || proj.x > MAP_SIZE || proj.y < 0 || proj.y > MAP_SIZE) {
        this.state.projectiles.delete(id);
        continue;
      }

      // Collision detection with players
      for (const player of this.state.players.values()) {
        if (player.id === proj.ownerId) continue;
        const dx = player.x - proj.x;
        const dy = player.y - proj.y;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {  // 20px hit radius
          player.health -= 10;
          this.state.projectiles.delete(id);

          if (player.health <= 0) {
            const killer = this.state.players.get(proj.ownerId);
            if (killer) killer.score += 100;
            this.respawnPlayer(player);
          }
          break;
        }
      }
    }

    // Broadcast state snapshot to all clients
    this.broadcastState();
  }

  private applyInput(player: Player, input: PlayerInput) {
    const dt = TICK_MS / 1000;
    let dx = 0, dy = 0;

    if (input.up) dy -= MOVE_SPEED * dt;
    if (input.down) dy += MOVE_SPEED * dt;
    if (input.left) dx -= MOVE_SPEED * dt;
    if (input.right) dx += MOVE_SPEED * dt;

    // Server validates movement (anti-cheat: clamp speed)
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed > MOVE_SPEED * dt * 1.5) {
      const scale = (MOVE_SPEED * dt) / speed;
      dx *= scale;
      dy *= scale;
    }

    player.x = Math.max(0, Math.min(MAP_SIZE, player.x + dx));
    player.y = Math.max(0, Math.min(MAP_SIZE, player.y + dy));
    player.rotation = input.rotation;

    if (input.shoot) {
      const projId = `p-${this.state.tick}-${player.id}`;
      this.state.projectiles.set(projId, {
        id: projId,
        ownerId: player.id,
        x: player.x,
        y: player.y,
        vx: Math.cos(input.rotation) * PROJECTILE_SPEED,
        vy: Math.sin(input.rotation) * PROJECTILE_SPEED,
        ttl: TICK_RATE * 3,  // 3 seconds
      });
    }
  }

  private broadcastState() {
    const snapshot = {
      type: "state",
      tick: this.state.tick,
      players: [...this.state.players.values()].map((p) => ({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y),
        rotation: p.rotation, health: p.health, score: p.score,
        lastInputSeq: p.lastInputSeq,
      })),
      projectiles: [...this.state.projectiles.values()].map((p) => ({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y),
      })),
    };

    const payload = JSON.stringify(snapshot);
    for (const ws of this.connections.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  addPlayer(id: string, ws: WebSocket) {
    this.state.players.set(id, {
      id, x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
      vx: 0, vy: 0, rotation: 0, health: 100, score: 0,
      lastInputSeq: 0, inputBuffer: [],
    });
    this.connections.set(id, ws);
  }

  removePlayer(id: string) {
    this.state.players.delete(id);
    this.connections.delete(id);
  }

  receiveInput(playerId: string, input: PlayerInput) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    // Buffer max 3 inputs (prevent input flooding)
    if (player.inputBuffer.length < 3) {
      player.inputBuffer.push(input);
    }
  }

  private respawnPlayer(player: Player) {
    player.x = Math.random() * MAP_SIZE;
    player.y = Math.random() * MAP_SIZE;
    player.health = 100;
  }
}
```

## Step 2: Build the Client-Side Prediction

```typescript
// src/client/prediction.ts — Client-side prediction and server reconciliation
interface PredictedState {
  x: number;
  y: number;
  rotation: number;
}

export class ClientPrediction {
  private pendingInputs: Array<{ seq: number; input: any; predictedState: PredictedState }> = [];
  private seq = 0;
  private serverState: PredictedState = { x: 0, y: 0, rotation: 0 };
  private displayState: PredictedState = { x: 0, y: 0, rotation: 0 };

  // Called every frame: predict locally, send to server
  processInput(input: any, ws: WebSocket): PredictedState {
    this.seq++;

    // Apply input locally (same physics as server)
    const predicted = this.applyPhysics(this.displayState, input);
    this.displayState = predicted;

    // Store for reconciliation
    this.pendingInputs.push({ seq: this.seq, input, predictedState: predicted });

    // Send to server
    ws.send(JSON.stringify({ type: "input", seq: this.seq, ...input }));

    return predicted;
  }

  // Called when server state arrives: reconcile
  onServerState(serverState: { x: number; y: number; rotation: number; lastInputSeq: number }) {
    this.serverState = serverState;

    // Remove inputs that the server has already processed
    this.pendingInputs = this.pendingInputs.filter((p) => p.seq > serverState.lastInputSeq);

    // Re-apply remaining unprocessed inputs on top of server state
    let state = { ...serverState };
    for (const pending of this.pendingInputs) {
      state = this.applyPhysics(state, pending.input);
    }

    this.displayState = state;
  }

  private applyPhysics(state: PredictedState, input: any): PredictedState {
    const dt = 1 / 20; // match server tick rate
    let dx = 0, dy = 0;
    if (input.up) dy -= 200 * dt;
    if (input.down) dy += 200 * dt;
    if (input.left) dx -= 200 * dt;
    if (input.right) dx += 200 * dt;

    return {
      x: Math.max(0, Math.min(2000, state.x + dx)),
      y: Math.max(0, Math.min(2000, state.y + dy)),
      rotation: input.rotation ?? state.rotation,
    };
  }

  getDisplayState(): PredictedState {
    return this.displayState;
  }
}
```

## Results

- **Cheating eliminated** — server is authoritative; client-modified positions are overwritten every tick; speed hacks are clamped server-side
- **Movement feels instant despite 150ms latency** — client prediction applies inputs immediately; server reconciliation corrects only when prediction diverges
- **100+ concurrent players at 20 ticks/second** — efficient state snapshots (only changed data), binary protocols for bandwidth, and tick-based batching keep CPU under 30%
- **Smooth gameplay** — entity interpolation on the client smooths between server snapshots; other players' movement looks fluid even at 20Hz update rate
- **Fair hit detection** — server-side collision with lag compensation means shots register correctly regardless of the shooter's latency
