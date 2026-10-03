---
name: tiled
description: >-
  Tiled is a free, open-source 2D level editor for building tilemaps,
  placing game objects, and designing levels, exporting to JSON (.tmj) or
  TMX (.tmx) for engines like Phaser, Godot, and Unity. Use when a user wants
  to design a tile-based game level, set up tile and object layers, build
  auto-tiling terrain brushes, animate tiles, attach custom properties to
  tiles or objects, or load a Tiled map into a game engine.
license: Apache-2.0
compatibility: "Tiled 1.10+ desktop editor (Windows/macOS/Linux); maps load into Phaser, Godot, Unity, PixiJS, or a custom engine"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - tiled
    - level-editor
    - tilemap
    - game-development
    - phaser
  repository: https://github.com/mapeditor/tiled
---

# Tiled — 2D Level Editor for Game Maps

## Overview

Tiled is a standalone desktop editor for building 2D tile-based maps: tile layers for rendering (ground, walls, decoration), object layers for free-form game logic (spawn points, triggers, paths), image layers for full backgrounds, and group layers for organizing all of these. It exports to its own JSON (`.tmj`) and XML (`.tmx`) formats, plus tileset companions (`.tsj`/`.tsx`), which any game engine's Tiled loader (Phaser, Godot's TileMap importer, Unity via a plugin, PixiJS) can read directly — Tiled itself has no runtime, it only authors the data.

## Instructions

### Install

Download the editor for Windows, macOS, or Linux from https://www.mapeditor.org/download.html, or install it from Steam or itch.io. There is no package-manager install for the desktop app on most platforms (Flathub ships a Linux build: `flatpak install flathub org.mapeditor.Tiled`).

### Map anatomy and layer order

A Tiled map is a stack of layers, bottom to top:

1. Background (sky, distant mountains)
2. Ground (floor tiles, terrain)
3. Decoration-below (grass, flowers behind the player)
4. Collision (invisible wall tiles, usually with a `collides` custom property)
5. Decoration-above (tree canopies, roofs over the player)
6. Objects (spawn points, items, triggers — on an object layer, not a tile layer)

### Tileset with custom properties and animation

```jsonc
// dungeon.tsj — Tiled tileset, JSON format
{
  "name": "dungeon",
  "tilewidth": 16,
  "tileheight": 16,
  "image": "dungeon-tileset.png",
  "imagewidth": 256,
  "imageheight": 256,
  "tilecount": 256,
  "columns": 16,
  "tiles": [
    {
      "id": 0,
      "type": "floor",
      "properties": [{ "name": "walkable", "type": "bool", "value": true }]
    },
    {
      "id": 16,
      "type": "wall",
      "properties": [
        { "name": "collides", "type": "bool", "value": true },
        { "name": "destructible", "type": "bool", "value": false }
      ]
    },
    {
      "id": 48,
      "type": "animated-torch",
      "animation": [
        { "tileid": 48, "duration": 200 },
        { "tileid": 49, "duration": 200 },
        { "tileid": 50, "duration": 200 },
        { "tileid": 51, "duration": 200 }
      ]
    }
  ]
}
```

### Auto-tiling with terrain sets

Tiled's terrain system auto-selects the right tile variant based on its neighbors:

1. Open the tileset (Edit Tileset)
2. On the tileset editor's toolbar, open Terrain Sets and add a new set — **Corner**, **Edge**, or **Mixed** (Corner and Edge need 16 tiles for a 2-terrain set; Mixed needs up to 256, though the common 47-tile "blob" layout covers the same ground with fewer tiles)
3. Mark each tile as the corner/edge it represents for its terrain type
4. Paint with the terrain brush — Tiled fills in the correct tile automatically at every transition

### Loading in Phaser

```typescript
export class GameScene extends Phaser.Scene {
  create() {
    const map = this.make.tilemap({ key: "level-1" });
    const tileset = map.addTilesetImage("dungeon", "dungeon-tiles")!;

    const ground = map.createLayer("Ground", tileset)!;
    const walls = map.createLayer("Walls", tileset)!;
    const decorAbove = map.createLayer("DecorationAbove", tileset);

    // Collision from the tileset's custom property, not a hardcoded tile ID list
    walls.setCollisionByProperty({ collides: true });

    const objects = map.getObjectLayer("GameObjects")!;
    objects.objects.forEach((obj) => {
      switch (obj.type) {
        case "spawn":
          this.spawnPlayer(obj.x!, obj.y!);
          break;
        case "loot":
          this.createChest(obj.x!, obj.y!, obj.properties);
          break;
        case "trigger":
          this.createTriggerZone(obj);
          break;
      }
    });

    decorAbove?.setDepth(10);
  }
}
```

## Examples

### Example 1: "Lay out a dungeon level with collision and a locked chest"

The agent creates tile layers (`Ground`, `Walls`, `DecorationAbove`), marks wall tiles with a `collides` boolean property in the tileset, and adds an object layer `GameObjects` with a `Chest` object carrying `lootTable: "common"` and `locked: true` custom properties:

```json
{
  "name": "GameObjects",
  "type": "objectgroup",
  "objects": [
    {
      "name": "Chest",
      "type": "loot",
      "x": 320,
      "y": 112,
      "properties": [
        { "name": "lootTable", "type": "string", "value": "common" },
        { "name": "locked", "type": "bool", "value": true }
      ]
    }
  ]
}
```

The game engine reads `obj.properties.lootTable` and `obj.properties.locked` at runtime to decide what the chest drops and whether it needs a key.

### Example 2: "Give an enemy a patrol route and a boss arena trigger"

The agent adds a `polyline`-type object for the patrol path and a rectangular trigger zone object with custom properties identifying which boss to spawn:

```json
{
  "objects": [
    {
      "name": "PatrolPath",
      "type": "path",
      "polyline": [
        { "x": 0, "y": 0 },
        { "x": 96, "y": 0 },
        { "x": 96, "y": 64 },
        { "x": 0, "y": 64 }
      ]
    },
    {
      "name": "BossZone",
      "type": "trigger",
      "x": 400,
      "y": 64,
      "width": 128,
      "height": 128,
      "properties": [
        { "name": "bossId", "type": "string", "value": "skeleton-king" },
        { "name": "oneShot", "type": "bool", "value": true }
      ]
    }
  ]
}
```

The engine walks the enemy along `PatrolPath`'s points and spawns `skeleton-king` once when the player enters `BossZone`, gating the trigger with `oneShot` so it doesn't refire.

## Guidelines

- Keep a dedicated, invisible collision layer separate from visual tiles — mixing them makes both art and hitboxes harder to edit.
- Put game logic (spawn points, triggers, loot, paths) on object layers with custom properties, not encoded as magic tile IDs on a tile layer.
- Match tile size to the art pipeline (16×16 for pixel art is common; 32×32 or 48×48 for higher-resolution art) — mixing tile sizes inside one tileset is not supported.
- Export JSON (`.tmj`) rather than TMX (`.tmx`) unless the target engine specifically wants XML — JSON is easier to parse in a custom loader and is what most engine importers expect by default.
- Terrain/auto-tiling setup has a real cost in tiles drawn up front (up to 256 for a full Mixed set); the 47-tile blob layout is the usual practical compromise over a full Mixed set.
- Tiled is an authoring tool only — it has no runtime of its own, so a map export is only useful once the target engine's Tiled loader (Phaser's `Tilemaps`, Godot's TileMap import, a Unity plugin, etc.) is in place.
