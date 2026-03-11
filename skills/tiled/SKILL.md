---
name: tiled
category: Game Development
tags: [level-editor, tilemap, game-design, 2d, map-editor, phaser, godot]
version: 1.0.0
author: terminal-skills
---

# Tiled — 2D Level Editor for Game Maps

You are an expert in Tiled, the free and open-source 2D level editor for creating tilemaps, placing objects, and designing game worlds. You help game developers design levels with tile layers, object layers for spawn points and triggers, terrain brushes for auto-tiling, animated tiles, and custom properties — exporting to JSON or TMX for use in Phaser, Godot, Unity, PixiJS, and other engines.

## Core Capabilities

### Tilemap Structure

```markdown
## Tiled Map Anatomy

A Tiled map consists of:
- **Tilesets**: Sprite sheets cut into tiles (16×16, 32×32, etc.)
- **Tile layers**: Grid of tile IDs for rendering (ground, walls, decorations)
- **Object layers**: Free-form shapes for game logic (spawn points, triggers, paths)
- **Image layers**: Full images (parallax backgrounds, overlays)
- **Group layers**: Organize layers into folders

## Layer ordering (bottom to top):
1. Background (sky, distant mountains)
2. Ground (floor tiles, terrain)
3. Decoration-below (grass, flowers behind player)
4. Collision (invisible wall tiles)
5. Decoration-above (tree canopies, roofs over player)
6. Objects (spawn points, items, triggers)
```

### Tileset Configuration

```json
// tileset.tsj — Tiled tileset file
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
      "properties": [
        { "name": "walkable", "type": "bool", "value": true }
      ]
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

### Object Layers for Game Logic

```json
// Objects in a Tiled map — exported as JSON
{
  "name": "GameObjects",
  "type": "objectgroup",
  "objects": [
    {
      "name": "PlayerSpawn",
      "type": "spawn",
      "x": 160,
      "y": 240,
      "properties": [
        { "name": "facing", "type": "string", "value": "right" }
      ]
    },
    {
      "name": "Chest",
      "type": "loot",
      "x": 320,
      "y": 112,
      "properties": [
        { "name": "lootTable", "type": "string", "value": "common" },
        { "name": "locked", "type": "bool", "value": true }
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
    },
    {
      "name": "PatrolPath",
      "type": "path",
      "polyline": [
        { "x": 0, "y": 0 },
        { "x": 96, "y": 0 },
        { "x": 96, "y": 64 },
        { "x": 0, "y": 64 }
      ]
    }
  ]
}
```

### Loading in Phaser

```typescript
// Load Tiled map in Phaser
export class GameScene extends Phaser.Scene {
  create() {
    const map = this.make.tilemap({ key: "level-1" });
    const tileset = map.addTilesetImage("dungeon", "dungeon-tiles")!;

    // Create layers in order
    map.createLayer("Background", tileset);
    const ground = map.createLayer("Ground", tileset)!;
    const walls = map.createLayer("Walls", tileset)!;
    const decorAbove = map.createLayer("DecorationAbove", tileset);

    // Collision from tile properties
    walls.setCollisionByProperty({ collides: true });

    // Read object layer for spawn points
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

    // Decoration layer renders above player
    decorAbove?.setDepth(10);
  }
}
```

### Auto-Tiling (Terrain)

```markdown
## Terrain Brushes

Tiled's terrain system auto-selects the correct tile variant based on neighbors:
- Paint with "grass" terrain brush
- Tiled automatically picks corner, edge, and interior tiles
- Supports Wang tiles (blob/corner) for complex terrain transitions

## Setup:
1. Open tileset in Tiled
2. View → Terrain Sets
3. Mark tiles as corners/edges of each terrain type
4. Paint with terrain brush — Tiled handles tile selection

## Common terrain patterns:
- 16-tile minimal (corners + edges)
- 47-tile blob (all neighbor combinations)
- 15-tile Wang corner set
```

## Installation

```bash
# Download from https://www.mapeditor.org/
# Available for Windows, macOS, Linux
# Also available on Steam and itch.io

# Export formats: JSON (.tmj), TMX (.tmx), CSV, Lua
# Most game engines prefer JSON export
```

## Best Practices

1. **Consistent tile size** — 16×16 for pixel art, 32×32 or 48×48 for HD; match your art pipeline
2. **Separate collision layer** — Don't mix visual tiles with collision; use a dedicated invisible collision layer
3. **Object layers for logic** — Spawn points, triggers, loot, paths belong in object layers with custom properties
4. **Custom properties** — Attach metadata to tiles and objects (damage, lootTable, dialogId); read in engine
5. **Terrain brushes** — Set up terrains for any tile transition (grass/dirt, water/land); saves hours of manual placement
6. **Layer groups** — Organize complex maps into groups (Background, Gameplay, Foreground, Debug)
7. **Tile animations** — Define animations in tileset (torches, water, flags); Phaser plays them automatically
8. **Export as JSON** — JSON is supported by all major engines and is easy to parse in custom engines
