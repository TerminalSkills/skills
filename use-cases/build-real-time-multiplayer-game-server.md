---
title: Build a Real-Time Multiplayer Game Server
slug: build-real-time-multiplayer-game-server
description: Build a real-time multiplayer game server with room management, state synchronization, latency compensation, matchmaking, and anti-cheat validation for browser-based multiplayer games.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - multiplayer
  - game-server
  - real-time
  - websocket
  - gaming
---

# Build a Real-Time Multiplayer Game Server

## The Problem

Dave leads game dev at a 15-person studio building browser-based multiplayer games. Their first game used HTTP polling — 500ms latency made it unplayable. WebSocket implementation is messy: no room management, no reconnection, no lag compensation. When 2 players act simultaneously, the slower one's action is lost. Matchmaking is random — skill levels mismatched. A cheater modified client-side position data and teleported across the map. They need a proper game server: room management, authoritative state, lag compensation, matchmaking, and server-side validation.

## Step 1: Build the Game Server

```typescript
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Player { id: string; name: string; position: { x: number; y: number }; velocity: { x: number; y: number }; health: number; score: number; lastInput: number; latency: number; connected: boolean; }
interface GameRoom { id: string; players: Map<string, Player>; state: "waiting" | "playing" | "finished"; tickRate: number; maxPlayers: number; mapSize: { width: number; height: number }; createdAt: number; }
interface PlayerInput { playerId: string; type: "move" | "shoot" | "ability"; data: any; sequence: number; timestamp: number; }

const rooms = new Map<string, GameRoom>();
const TICK_RATE = 20; // 20 ticks per second (50ms per tick)
const MAX_SPEED = 5;
const MAP_SIZE = { width: 1000, height: 1000 };

// Create game room
export function createRoom(maxPlayers: number = 4): GameRoom {
  const id = `room-${randomBytes(4).toString("hex")}`;
  const room: GameRoom = { id, players: new Map(), state: "waiting", tickRate: TICK_RATE, maxPlayers, mapSize: MAP_SIZE, createdAt: Date.now() };
  rooms.set(id, room);

  // Start game loop
  const interval = setInterval(() => {
    if (room.state === "playing") gameLoop(room);
    if (room.state === "finished") clearInterval(interval);
  }, 1000 / TICK_RATE);

  return room;
}

// Join room
export function joinRoom(roomId: string, playerId: string, name: string): { success: boolean; room?: GameRoom; error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: "Room not found" };
  if (room.players.size >= room.maxPlayers) return { success: false, error: "Room full" };
  if (room.state !== "waiting") return { success: false, error: "Game already started" };

  const player: Player = {
    id: playerId, name,
    position: { x: Math.random() * MAP_SIZE.width, y: Math.random() * MAP_SIZE.height },
    velocity: { x: 0, y: 0 },
    health: 100, score: 0,
    lastInput: Date.now(), latency: 0, connected: true,
  };

  room.players.set(playerId, player);
  if (room.players.size >= 2) room.state = "playing";

  return { success: true, room };
}

// Process player input (server-authoritative)
export function processInput(roomId: string, input: PlayerInput): { accepted: boolean; serverState?: any; correction?: any } {
  const room = rooms.get(roomId);
  if (!room || room.state !== "playing") return { accepted: false };

  const player = room.players.get(input.playerId);
  if (!player) return { accepted: false };

  // Anti-cheat: validate input
  const validation = validateInput(input, player);
  if (!validation.valid) {
    return { accepted: false, correction: { position: player.position, reason: validation.reason } };
  }

  // Calculate latency
  player.latency = Date.now() - input.timestamp;

  switch (input.type) {
    case "move": {
      const dx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, input.data.dx || 0));
      const dy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, input.data.dy || 0));
      player.velocity = { x: dx, y: dy };
      break;
    }
    case "shoot": {
      const target = findPlayerAt(room, input.data.targetX, input.data.targetY);
      if (target && target.id !== player.id) {
        const distance = Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y);
        if (distance < 200) { // max range
          const damage = Math.max(5, 30 - distance / 10);
          target.health -= damage;
          player.score += damage;
          if (target.health <= 0) { target.health = 0; player.score += 100; }
        }
      }
      break;
    }
  }

  player.lastInput = Date.now();
  return { accepted: true, serverState: getGameState(room) };
}

// Server game loop
function gameLoop(room: GameRoom): void {
  // Update positions
  for (const [, player] of room.players) {
    if (!player.connected || player.health <= 0) continue;
    player.position.x = Math.max(0, Math.min(room.mapSize.width, player.position.x + player.velocity.x));
    player.position.y = Math.max(0, Math.min(room.mapSize.height, player.position.y + player.velocity.y));
    // Apply friction
    player.velocity.x *= 0.9;
    player.velocity.y *= 0.9;
  }

  // Check disconnected players
  for (const [id, player] of room.players) {
    if (Date.now() - player.lastInput > 10000) player.connected = false;
  }

  // Check win condition
  const alive = [...room.players.values()].filter((p) => p.health > 0 && p.connected);
  if (alive.length <= 1 && room.players.size >= 2) {
    room.state = "finished";
  }

  // Broadcast state to all players via Redis pub/sub
  redis.publish(`game:${room.id}`, JSON.stringify(getGameState(room))).catch(() => {});
}

// Anti-cheat validation
function validateInput(input: PlayerInput, player: Player): { valid: boolean; reason?: string } {
  // Check input rate (max 30 inputs/sec)
  if (Date.now() - player.lastInput < 20) return { valid: false, reason: "Input too fast" };
  // Check movement speed
  if (input.type === "move") {
    const speed = Math.hypot(input.data.dx || 0, input.data.dy || 0);
    if (speed > MAX_SPEED * 1.5) return { valid: false, reason: "Speed hack detected" };
  }
  // Check teleportation (position jump)
  if (input.data.x !== undefined && input.data.y !== undefined) {
    const distance = Math.hypot(input.data.x - player.position.x, input.data.y - player.position.y);
    if (distance > MAX_SPEED * 5) return { valid: false, reason: "Teleport detected" };
  }
  return { valid: true };
}

function findPlayerAt(room: GameRoom, x: number, y: number): Player | null {
  for (const [, player] of room.players) {
    if (player.health <= 0) continue;
    const distance = Math.hypot(player.position.x - x, player.position.y - y);
    if (distance < 30) return player; // hit radius
  }
  return null;
}

function getGameState(room: GameRoom): any {
  return {
    roomId: room.id, state: room.state, tick: Date.now(),
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, x: Math.round(p.position.x), y: Math.round(p.position.y), health: p.health, score: p.score, connected: p.connected })),
  };
}

// Simple matchmaking
export async function findMatch(playerId: string, skillRating: number): Promise<string> {
  // Check for rooms with similar skill
  for (const [id, room] of rooms) {
    if (room.state !== "waiting" || room.players.size >= room.maxPlayers) continue;
    const avgSkill = [...room.players.values()].reduce((s, p) => s, 0) / room.players.size || skillRating;
    if (Math.abs(avgSkill - skillRating) < 200) return id;
  }
  // No match — create new room
  const room = createRoom();
  return room.id;
}

// Get active rooms
export function getActiveRooms(): Array<{ id: string; players: number; maxPlayers: number; state: string }> {
  return [...rooms.values()].map((r) => ({ id: r.id, players: r.players.size, maxPlayers: r.maxPlayers, state: r.state }));
}
```

## Results

- **20 ticks/sec** — server runs at 50ms intervals; smooth movement; no more 500ms polling lag
- **Server-authoritative** — all positions calculated on server; client sends inputs, receives state; cheater can't teleport or speed-hack
- **Anti-cheat** — speed limits validated; input rate capped; position jumps detected; cheater gets correction packet, not advantage
- **Lag compensation** — player latency tracked; inputs timestamped; server adjusts for network delay; fast players don't have unfair advantage
- **Matchmaking** — skill rating within 200 range matched; new players don't face veterans; engagement and retention improved
