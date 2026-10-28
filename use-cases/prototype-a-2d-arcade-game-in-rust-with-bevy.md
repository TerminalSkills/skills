---
title: Prototype a 2D Arcade Game in Rust with Bevy
slug: prototype-a-2d-arcade-game-in-rust-with-bevy
description: Get a native 2D game running in Rust in one evening with Bevy's ECS, with a small player, falling hazards, a score and a menu state.
skills:
  - bevy
  - rust
category: development
tags:
  - game-development
  - rust
  - ecs
  - bevy
  - 2d
  - prototyping
---

# Prototype a 2D Arcade Game in Rust with Bevy

## The Problem

Mateusz is a backend developer who writes Rust at work and wants to build a small arcade game for a game jam next weekend. He has 14 hours. He knows ownership and traits, but not game-engine structure: where the game loop lives, how to move things at a frame-rate-independent speed, how to keep menu and gameplay apart.

Bevy is the natural choice for a Rust developer, but it changes its API in nearly every release. Tutorials from two years ago use `EventWriter`, bundle structs and other names that no longer exist, and the code an AI assistant remembers is often from those versions. Each wrong guess costs a five-minute compile.

## The Solution

The **bevy** skill pins the current release (0.20) and shows the forms that compile today: component tuples instead of bundles, `Single` for the one player entity, `Message` types for communication, `States` for menu and play. The **rust** skill covers the surrounding language and Cargo work, such as reading borrow-checker errors and setting up the dev profile. The agent checks every name against the tagged examples and docs.rs before using it.

## Step-by-Step Walkthrough

### Step 1: Create the project and pin the version

> Create a new Rust project called dodge_game with Bevy 0.20 and the recommended dev profile for fast iteration. Check that it compiles.

```bash
rustup update stable
cargo new dodge_game
cd dodge_game
cargo add bevy@=0.20.0
```

The agent appends the officially recommended profile to `Cargo.toml`:

```toml
[profile.dev]
opt-level = 1

[profile.dev.package."*"]
opt-level = 3
```

```bash
cargo run --features bevy/dynamic_linking
```

The first build compiles the engine and takes a few minutes. A window opens. If the build stops on a missing `alsa`, `udev` or `wayland` library, the agent tells Mateusz which `apt-get install` line to run instead of running `sudo` itself.

### Step 2: Spawn the player and the camera

> Add a blue paddle at the bottom of the screen that moves with the arrow keys at 300 units per second.

The agent writes a `Player` component, a `setup` system that spawns `Camera2d` and a `Sprite::from_color` entity, and a `move_player` system that takes `Single<&mut Transform, With<Player>>`, reads `ButtonInput<KeyCode>` and multiplies by `time.delta_secs()`. It registers both with `add_systems(Startup, setup)` and `add_systems(Update, move_player)`.

```bash
cargo run --features bevy/dynamic_linking
```

The paddle slides smoothly and moves at the same speed on Mateusz's 60 Hz laptop and on his 144 Hz monitor.

### Step 3: Add falling hazards and a score

> Every 0.8 seconds spawn a red block above the screen that falls at 200 units per second. Hitting the paddle resets the score, missing it adds one.

The agent adds a `Hazard` component, a repeating `Timer` kept in a `Local`, and a `Score` resource. The fall and hit system carries a `Without<Player>` filter on the hazard query, because the same system also reads the player's `Transform` and Bevy rejects overlapping queries. It despawns hazards with `commands.entity(entity).despawn()`.

```bash
cargo check
```

The agent chains the three systems with `.chain()` so spawn, move and collision happen in a fixed order each frame.

### Step 4: Split menu and play with states

> Show nothing but a Menu state until Space is pressed, then switch to InGame. Game systems should only run in InGame.

The agent derives `States` on an `AppState` enum with `#[default] Menu`, calls `init_state::<AppState>()`, sets `run_if(in_state(AppState::InGame))` on the gameplay systems, and adds a small system that calls `next.set(AppState::InGame)` when `just_pressed(KeyCode::Space)`.

### Step 5: Ship a release build

> Build an optimised version I can send to the other jam team members.

```bash
cargo build --release
ls -lh target/release/dodge_game
```

The agent reminds Mateusz that the `dynamic_linking` feature must not be used for this build, and that the `assets` folder (none yet) would need to sit next to the executable.

## Real-World Example

Mateusz had a playable loop in the first evening: a paddle, falling blocks, a score printed through `info!`, and a menu state. On the second day he added a high-score resource and a `Message` called `PlayerHit` that a sound system and a screen-shake system both read. When he upgraded from a pinned 0.19 to 0.20 on Sunday, `cargo check` listed 11 errors; the agent worked through them by category using the migration guide and the project compiled again in about 20 minutes. His team submitted a Linux release binary before the deadline.

## Related Skills

- [bevy](/skills/bevy) — engine setup, ECS systems, messages, states and the version-specific API names
- [rust](/skills/rust) — Cargo workflow, dev and release profiles, and fixing borrow-checker and trait errors in the game code
