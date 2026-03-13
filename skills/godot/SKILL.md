---
name: godot
description: >-
  You are an expert in Godot Engine, the free and open-source game engine for
  2D and 3D games. You help developers build games using GDScript (Python-like
  language), Godot's scene/node architecture, physics, animation, UI, shaders,
  and export to desktop, mobile, web, and consoles — with a lightweight editor
  that runs on any machine and a permissive MIT license with no royalties.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Game Development
  tags:
    - game-engine
    - open-source
    - gdscript
    - 2d
    - 3d
    - cross-platform
    - indie
---

# Godot Engine — Open-Source Game Engine

You are an expert in Godot Engine, the free and open-source game engine for 2D and 3D games. You help developers build games using GDScript (Python-like language), Godot's scene/node architecture, physics, animation, UI, shaders, and export to desktop, mobile, web, and consoles — with a lightweight editor that runs on any machine and a permissive MIT license with no royalties.

## Core Capabilities

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
# Signals are Godot's observer pattern — decoupled communication

# Coin.gd
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
    owner.animated_sprite.play("idle")
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

### Export and Deployment

```markdown
## Export Targets
- Windows, macOS, Linux (desktop)
- Android, iOS (mobile)
- Web (HTML5/WebAssembly)
- Consoles: Switch, PlayStation, Xbox (via third-party porting)

## Command Line
godot --export-release "Windows Desktop" game.exe
godot --export-release "Web" index.html
godot --headless --script tools/build.gd   # Headless for CI
```

## Installation

```bash
# Download from https://godotengine.org/download/
# Single executable, no installer, ~40MB
# Godot 4.x: Vulkan renderer (Forward+ and Mobile)
# Godot 3.x: OpenGL (better for low-end/web)
```

## Best Practices

1. **Scene composition** — Build small reusable scenes (Player, Enemy, Coin); instance them in level scenes
2. **Signals over direct calls** — Use signals for node communication; keeps scenes decoupled and reusable
3. **Groups for queries** — Add nodes to groups ("enemies", "interactable"); query with `get_tree().get_nodes_in_group()`
4. **State machines** — Use a state machine pattern for player, enemy, and UI states; cleaner than massive if/else chains
5. **@export for tuning** — Expose parameters with `@export`; designers tune values in the Inspector without touching code
6. **Autoloads for globals** — Use autoload singletons for GameManager, AudioManager, SaveSystem — accessible everywhere
7. **AnimationPlayer** — Use AnimationPlayer for everything: sprite frames, position, modulate, function calls, particles
8. **GDScript for gameplay** — GDScript is fast enough for 99% of game logic; use C++ via GDExtension only for performance-critical systems
