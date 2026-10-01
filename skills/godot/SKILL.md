---
name: godot
description: >-
  Godot is a free, open-source engine for 2D and 3D games, built around scenes
  and nodes and scripted in GDScript or C#. Use when a user asks to build a
  game in Godot 4, write GDScript for player movement, signals or state
  machines, write a Godot shader, check or test a project headless from the
  command line, or export builds for desktop, mobile and web in CI.
license: Apache-2.0
compatibility: 'Godot 4.x (checked against 4.7.2); the editor runs on Windows, macOS and Linux'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/godotengine/godot
  tags:
    - game-engine
    - gdscript
    - 2d
    - 3d
    - cross-platform
---

# Godot Engine — Open-Source Game Engine

## Overview

Godot Engine is a free and open-source game engine for 2D and 3D games, released under the MIT license with no royalties. Games are trees of nodes saved as reusable scenes, scripted in GDScript (a Python-like language) or C#, with built-in physics, animation, UI and a shader language. One editor binary is also the command-line tool: it imports assets, checks and runs scripts headless, and exports to desktop, mobile and web.

Everything here targets Godot 4. Godot 3 code does not parse in Godot 4 (`export var` became `@export var`, `yield` became `await`, `KinematicBody2D` became `CharacterBody2D`).

## Instructions

### Scene and Node System

```gdscript
# Godot's architecture: everything is a node in a tree
# Scenes = reusable node trees (like prefabs)
# Player.gd — attached to a CharacterBody2D node
extends CharacterBody2D

@export var speed: float = 200.0          # Editable in Inspector
@export var jump_force: float = -400.0
@export var gravity: float = 980.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var coyote_timer: Timer = $CoyoteTimer

var was_on_floor: bool = false

func _physics_process(delta: float) -> void:
    # Gravity
    if not is_on_floor():
        velocity.y += gravity * delta
    # Coyote time (jump briefly after leaving edge)
    if was_on_floor and not is_on_floor():
        coyote_timer.start()
    was_on_floor = is_on_floor()
    # Jump
    var can_jump = is_on_floor() or not coyote_timer.is_stopped()
    if Input.is_action_just_pressed("jump") and can_jump:
        velocity.y = jump_force
        coyote_timer.stop()
    # Horizontal movement
    var direction = Input.get_axis("move_left", "move_right")
    if direction:
        velocity.x = direction * speed
        sprite.play("run")
        sprite.flip_h = direction < 0
    else:
        velocity.x = move_toward(velocity.x, 0, speed * 0.2)
        sprite.play("idle")
    move_and_slide()
```

### Signals (Event System)

```gdscript
# Coin.gd — signals are Godot's observer pattern: decoupled communication
extends Area2D
signal collected(value: int)              # Custom signal with typed parameter

@export var value: int = 10

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        collected.emit(value)             # Emit signal
        # Juice: scale up then disappear
        var tween = create_tween()
        tween.tween_property(self, "scale", Vector2(1.5, 1.5), 0.1)
        tween.tween_property(self, "modulate:a", 0.0, 0.2)
        tween.tween_callback(queue_free)

# GameManager.gd — connects to signal
extends Node
var score: int = 0
@onready var score_label: Label = $ScoreLabel
func _ready() -> void:
    for coin in get_tree().get_nodes_in_group("coins"):
        coin.collected.connect(_on_coin_collected)

func _on_coin_collected(value: int) -> void:
    score += value
    score_label.text = "Score: %d" % score
```

### State Machine

```gdscript
# StateMachine.gd — Generic reusable state machine
extends Node
class_name StateMachine

@export var initial_state: State
var current_state: State

func _ready() -> void:
    for child in get_children():
        if child is State:
            child.state_machine = self
    current_state = initial_state
    current_state.enter()
func _physics_process(delta: float) -> void:
    current_state.physics_update(delta)
func _unhandled_input(event: InputEvent) -> void:
    current_state.handle_input(event)
func transition_to(target_state_name: String) -> void:
    var target = get_node(target_state_name)
    if target and target is State:
        current_state.exit()
        current_state = target
        current_state.enter()

# State.gd — Base state class
extends Node
class_name State

var state_machine: StateMachine
func enter() -> void: pass
func exit() -> void: pass
func handle_input(_event: InputEvent) -> void: pass
func physics_update(_delta: float) -> void: pass

# IdleState.gd
extends State
func enter() -> void:
    owner.sprite.play("idle")
func physics_update(delta: float) -> void:
    if Input.get_axis("move_left", "move_right") != 0:
        state_machine.transition_to("Run")
    if Input.is_action_just_pressed("jump") and owner.is_on_floor():
        state_machine.transition_to("Jump")
```

### Shaders

```glsl
// water_shader.gdshader — Visual shader as code
shader_type canvas_item;

uniform float wave_speed: hint_range(0.5, 5.0) = 2.0;
uniform float wave_amplitude: hint_range(0.001, 0.1) = 0.02;
uniform float wave_frequency: hint_range(1.0, 20.0) = 10.0;
uniform vec4 water_tint: source_color = vec4(0.2, 0.4, 0.8, 0.6);

void fragment() {
    vec2 uv = UV;
    // Animate UV for wave effect
    uv.x += sin(uv.y * wave_frequency + TIME * wave_speed) * wave_amplitude;
    uv.y += cos(uv.x * wave_frequency + TIME * wave_speed * 0.7) * wave_amplitude;
    vec4 tex = texture(TEXTURE, uv);
    COLOR = mix(tex, water_tint, water_tint.a);
}
```

### Command Line and Export

The editor binary is the CLI. Run it from the project folder or pass `--path`.

```bash
godot --version                                   # 4.7.2.stable.official.ed1daf0bf
godot --path . --editor                           # open the editor on this project
godot --headless --path . --import                # import assets and register class_name types, then quit
godot --headless --path . --check-only --script res://scripts/player.gd   # parse only; exit 1 on errors
godot --headless --path . --script res://tools/print_version.gd -- --build=42

godot --headless --path . --export-release "Linux" build/linux/coin-runner.x86_64
godot --headless --path . --export-debug "Web" build/web/index.html
godot --headless --path . --export-pack "Linux" build/coin-runner.pck     # game data only
```

- `--script` runs a file that extends `SceneTree` or `MainLoop`; call `quit(code)` to set the exit status. Arguments after `--` reach the script through `OS.get_cmdline_user_args()`.
- Export needs an `export_presets.cfg` in the project root (create presets in **Project > Export**); the quoted name must match a preset.
- Export also needs export templates of the exact editor version, installed through **Editor > Manage Export Templates** or unpacked into `~/.local/share/godot/export_templates/4.7.2.stable/` on Linux. `--export-pack` works without them.
- The output path is relative to the project, and its directory must already exist.
- Targets: Windows, macOS, Linux, Android, iOS and Web (WebAssembly). Consoles (Switch, PlayStation, Xbox) go through third-party porting companies.

## Installation

```bash
flatpak install flathub org.godotengine.Godot     # Linux; then `flatpak run org.godotengine.Godot` stands in for `godot`
brew install --cask godot                         # macOS
winget install GodotEngine.GodotEngine            # Windows
scoop bucket add extras && scoop install godot    # Windows (Scoop)
```

Or download the editor from https://godotengine.org/download — a single executable, no installer. For CI, pin a release and verify its checksum as in Example 2.

## Examples

### Example 1: Check scripts and run a logic test without opening a window

**User request:** "Before I push, check that my GDScript parses and run a quick test that picking up two coins gives the right score."

```gdscript
# tests/smoke_test.gd — run with --script, so it extends SceneTree
extends SceneTree

var score := 0

func _init() -> void:
	var coin: Area2D = load("res://scripts/coin.gd").new()   # Coin.gd from the Signals section
	coin.value = 25
	root.add_child(coin)
	coin.collected.connect(func(value: int) -> void: score += value)
	coin.collected.emit(coin.value)
	coin.collected.emit(coin.value)
	if score != 50:
		printerr("FAIL: expected score 50, got %d" % score)
		quit(1)
		return
	print("PASS: score is %d after two coins" % score)
	quit(0)
```

```bash
godot --headless --path . --import
godot --headless --path . --check-only --script res://scripts/player.gd
godot --headless --path . --script res://tests/smoke_test.gd
# PASS: score is 50 after two coins
```

The last command exits 0, or 1 when the assertion fails. A type error makes `--check-only` exit 1 and name the file and line: `SCRIPT ERROR: Parse Error: Cannot assign a value of type "String" as "int". at: GDScript::reload (res://scripts/enemy.gd:4)`.

### Example 2: Export Linux and Web builds in GitHub Actions

**User request:** "Build Linux and Web versions of the game on every push to main." The committed `export_presets.cfg` has presets named `Linux` and `Web`.

```yaml
# .github/workflows/export.yml
on:
  push:
    branches: [main]
jobs:
  export:
    runs-on: ubuntu-latest
    env:
      GODOT_RELEASE: https://github.com/godotengine/godot/releases/download/4.7.2-stable
    steps:
      - uses: actions/checkout@v4
      - name: Install Godot and export templates
        run: |
          curl -fsSLO "$GODOT_RELEASE/Godot_v4.7.2-stable_linux.x86_64.zip"
          curl -fsSLO "$GODOT_RELEASE/Godot_v4.7.2-stable_export_templates.tpz"
          curl -fsSLO "$GODOT_RELEASE/SHA512-SUMS.txt"
          sha512sum --ignore-missing -c SHA512-SUMS.txt
          unzip -q Godot_v4.7.2-stable_linux.x86_64.zip
          sudo install -m 755 Godot_v4.7.2-stable_linux.x86_64 /usr/local/bin/godot
          mkdir -p ~/.local/share/godot/export_templates/4.7.2.stable
          unzip -q -j Godot_v4.7.2-stable_export_templates.tpz 'templates/*' \
            -d ~/.local/share/godot/export_templates/4.7.2.stable
      - name: Export
        run: |
          mkdir -p build/linux build/web
          godot --headless --path . --import
          godot --headless --path . --export-release "Linux" build/linux/coin-runner.x86_64
          godot --headless --path . --export-release "Web" build/web/index.html
      - uses: actions/upload-artifact@v4
        with: { name: coin-runner, path: build/ }
```

The job produces `build/linux/coin-runner.x86_64` with `coin-runner.pck` next to it, and `build/web/` with `index.html`, `index.js`, `index.wasm` and `index.pck`. Without the templates the export stops with `No export template found at the expected path` and exit code 1.

## Guidelines

1. **Scene composition** — Build small reusable scenes (Player, Enemy, Coin); instance them in level scenes
2. **Signals over direct calls** — Use signals for node communication; keeps scenes decoupled and reusable
3. **Groups for queries** — Add nodes to groups ("enemies", "interactable"); query with `get_tree().get_nodes_in_group()`
4. **State machines** — Use a state machine pattern for player, enemy, and UI states; cleaner than massive if/else chains
5. **@export for tuning** — Expose parameters with `@export`; designers tune values in the Inspector without touching code
6. **Autoloads for globals** — Use autoload singletons for GameManager, AudioManager, SaveSystem — accessible everywhere
7. **AnimationPlayer** — Use AnimationPlayer for everything: sprite frames, position, modulate, function calls, particles
8. **GDScript for gameplay** — GDScript is fast enough for 99% of game logic; use C++ via GDExtension only for performance-critical systems
9. **Import before headless work** — On a fresh checkout there is no `.godot/` folder, so `class_name` types are unknown and scripts fail with `Could not find base class`. Run `godot --headless --path . --import` first
10. **Version control** — Ignore `.godot/` (a cache); commit `project.godot`, `export_presets.cfg` and the `*.uid` files Godot writes next to scripts. Keep `export_credentials.cfg` (keystore passwords, encryption keys) out of the repository
11. **Match template and editor versions exactly** — The editor only looks in the template folder named after its own version (`4.7.2.stable`); pin one version in CI
12. **Pick the renderer for the target** — Forward+ (desktop, most features) and Mobile run on Vulkan, Direct3D 12 or Metal; Compatibility runs on OpenGL, suits old or low-end hardware and is the only renderer on the web
13. **Web builds** — Serve the exported files from a web server. An export with threads enabled also needs the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers; C# projects cannot be exported to the web in Godot 4
14. **Projects run code in the editor** — `@tool` scripts, editor plugins and GDExtensions execute when a project is opened; `--recovery-mode` starts the editor with them disabled
