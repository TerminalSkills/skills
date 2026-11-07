---
name: bevy
description: >-
  Bevy is a data-driven game engine for Rust built on an Entity Component System (ECS), for 2D and 3D games on desktop and other platforms. Use when asked to "make a game in Rust", "set up a Bevy project", "write a Bevy system", "fix a Bevy compile error after upgrading", "add keyboard input or states to a Bevy game", or "speed up Bevy compile times". Written against Bevy 0.20, where Message and required components replace older Event and Bundle APIs.
license: Apache-2.0
compatibility: "Rust 1.97.1+ (the MSRV of Bevy 0.20), Cargo; Linux needs ALSA, udev and X11 or Wayland dev packages"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "rust, game-engine, ecs, bevy, game-development"
  repository: https://github.com/bevyengine/bevy
---

# Bevy — a data-driven game engine for Rust

## Overview

Bevy builds games from three ideas. **Components** are plain Rust structs attached to **entities** (just IDs). **Systems** are ordinary functions whose parameters (`Query`, `Res`, `ResMut`, `Commands`, `Single`) say what data they read and write; the scheduler runs them in parallel where it is safe. **Resources** are global singletons such as score or settings. An `App` collects plugins and systems and runs them in schedules (`Startup` once, `Update` every frame).

Bevy releases a new minor version every few months and breaks APIs each time. Always pin the exact version, read the migration guide at https://bevy.org/learn/migration-guides/ before upgrading, and take example code from the git tag that matches your version (for example `https://github.com/bevyengine/bevy/tree/v0.20.0/examples`). Code from tutorials for 0.14 or earlier will often not compile.

This skill targets Bevy 0.20.0 (released 2026-10-08 on crates.io).

## Instructions

### Installation

```bash
rustup update stable
rustc --version        # Bevy 0.20 needs 1.97.1 or newer
cargo new dodge_game
cd dodge_game
cargo add bevy@=0.20.0
```

On Ubuntu the build needs system packages; install them once (this needs root, so ask the user to run it):

```bash
sudo apt-get install g++ pkg-config libx11-dev libasound2-dev libudev-dev libxkbcommon-x11-0 libwayland-dev libxkbcommon-dev
```

The two `wayland` packages are needed because the default features include Wayland support; without them the build stops in `wayland-sys`. You also need a Vulkan driver (`mesa-vulkan-drivers` for most GPUs). Other distros: see `docs/linux_dependencies.md` in the Bevy repository.

The first build compiles the whole engine and takes minutes; later builds are fast.

### Faster compiles

Add to `Cargo.toml` so your code stays quick to rebuild but dependencies run optimised (the officially recommended dev profile):

```toml
[profile.dev]
opt-level = 1

[profile.dev.package."*"]
opt-level = 3
```

For much faster incremental links during development, enable dynamic linking:

```bash
cargo run --features bevy/dynamic_linking
```

Do not ship a build with `dynamic_linking`: it needs a separate shared library next to the executable. Using the `lld` or `mold` linker through `.cargo/config.toml` gives a further speed-up; see https://bevy.org/learn/quick-start/getting-started/setup/.

### Minimal app

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands.spawn(Sprite::from_color(Color::srgb(0.2, 0.7, 0.9), Vec2::new(64.0, 64.0)));
}
```

`DefaultPlugins` opens a window and adds rendering, input, assets and audio. A `Camera2d` entity is needed to see 2D content. Entities are spawned from tuples of components; there are no `SpriteBundle`-style bundles any more.

### Components, resources and systems

```rust
#[derive(Component)]
struct Player;

#[derive(Component)]
struct Hazard;

#[derive(Resource, Default)]
struct Score(u32);

fn move_player(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut player: Single<&mut Transform, With<Player>>,
) {
    let mut dir = 0.0;
    if keys.pressed(KeyCode::ArrowLeft) { dir -= 1.0; }
    if keys.pressed(KeyCode::ArrowRight) { dir += 1.0; }
    player.translation.x += dir * 300.0 * time.delta_secs();
}
```

- `Single<D, F>` is a system parameter for exactly one matching entity; the system is skipped on frames when zero or several match.
- Iterate a query with `for (a, mut b) in &mut query { ... }`.
- Register resources with `.init_resource::<Score>()` (needs `Default`) or `.insert_resource(Score(0))`.
- A component can declare dependencies: `#[derive(Component)] #[require(Sprite, Transform)] struct Wall;` spawns the required components automatically with their defaults.

### Ordering, sets and run conditions

```rust
App::new()
    .add_plugins(DefaultPlugins)
    .add_systems(Startup, setup)
    .add_systems(Update, (move_player, spawn_hazards, check_hits).chain());
```

Systems in a tuple run in parallel unless you call `.chain()` (strict order) or use `.after(other)` or a `SystemSet` with `.configure_sets`. Run conditions such as `.run_if(in_state(AppState::InGame))` skip a system when false.

### Messages (formerly events)

Buffered, frame-to-frame communication uses `Message`, `MessageWriter` and `MessageReader`; register each type with `add_message`:

```rust
#[derive(Message)]
struct PlayerHit;

fn check_hits(mut writer: MessageWriter<PlayerHit>) {
    writer.write(PlayerHit);
}

fn on_hit(mut reader: MessageReader<PlayerHit>, mut score: ResMut<Score>) {
    for _ in reader.read() { score.0 = 0; }
}
// app.add_message::<PlayerHit>()
```

Exiting the app is also a message: `app_exit.write(AppExit::Success)` with a `MessageWriter<AppExit>` parameter. Older code using `EventWriter` and `EventReader` for these needs migrating.

### States

```rust
#[derive(States, Debug, Clone, Copy, Default, Eq, PartialEq, Hash)]
enum AppState { #[default] Menu, InGame }

// app.init_state::<AppState>()
//    .add_systems(OnEnter(AppState::InGame), setup_level)
//    .add_systems(Update, move_player.run_if(in_state(AppState::InGame)));

fn start(mut next: ResMut<NextState<AppState>>) { next.set(AppState::InGame); }
```

### Plugins

Group related setup into a plugin and add it with `add_plugins(HazardPlugin)`:

```rust
pub struct HazardPlugin;

impl Plugin for HazardPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Score>().add_systems(Update, spawn_hazards);
    }
}
```

### Running and exploring

```bash
cargo run                       # debug build
cargo run --release             # optimised build
cargo check                     # fast type check without linking
```

The repository's examples are the best API reference. In a clone of the matching tag, `cargo run --example breakout` runs the breakout game (the source is `examples/showcase/breakout.rs`). Also read `examples/ecs/ecs_guide.rs`, `examples/ecs/message.rs` and `examples/state/states.rs` at the tag matching your version. Generated API docs: https://docs.rs/bevy/0.20.0/bevy/.

## Examples

### Example 1: A dodge game skeleton

**Request:** "Start a 2D game where a square moves left and right and red blocks fall from above."

Add the systems below to the app from "Minimal app", with `.init_resource::<Score>()` and `.add_systems(Update, (move_player, spawn_hazards, fall_and_hit).chain())`:

```rust
fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands.spawn((
        Player,
        Sprite::from_color(Color::srgb(0.2, 0.7, 0.9), Vec2::new(60.0, 20.0)),
        Transform::from_xyz(0.0, -250.0, 0.0),
    ));
}

fn spawn_hazards(
    mut commands: Commands,
    time: Res<Time>,
    mut timer: Local<Option<Timer>>,
    mut count: Local<u32>,
) {
    let timer = timer.get_or_insert_with(|| Timer::from_seconds(0.8, TimerMode::Repeating));
    if timer.tick(time.delta()).is_finished() {
        *count += 1;
        let x = ((*count * 97) % 500) as f32 - 250.0;
        commands.spawn((
            Hazard,
            Sprite::from_color(Color::srgb(0.9, 0.2, 0.2), Vec2::new(30.0, 30.0)),
            Transform::from_xyz(x, 300.0, 0.0),
        ));
    }
}

fn fall_and_hit(
    mut commands: Commands,
    time: Res<Time>,
    mut score: ResMut<Score>,
    player: Single<&Transform, With<Player>>,
    mut hazards: Query<(Entity, &mut Transform), (With<Hazard>, Without<Player>)>,
) {
    for (entity, mut t) in &mut hazards {
        t.translation.y -= 200.0 * time.delta_secs();
        if t.translation.distance(player.translation) < 30.0 {
            info!("hit! final score {}", score.0);
            score.0 = 0;
            commands.entity(entity).despawn();
        } else if t.translation.y < -320.0 {
            score.0 += 1;
            commands.entity(entity).despawn();
        }
    }
}
```

`cargo run` opens a window with a blue paddle and red blocks falling every 0.8 s; arrow keys move the paddle and `info!` lines in the terminal show hits.

### Example 2: Fix a project after a version upgrade

**Request:** "I bumped bevy to 0.20 and now it won't compile."

```bash
cargo update -p bevy --precise 0.20.0
cargo check 2>&1 | head -60
```

The agent reads each error, then looks the renamed API up in the migration guide for the versions crossed (https://bevy.org/learn/migration-guides/), editing one category at a time (for example `EventWriter<T>` to `MessageWriter<T>`, bundle structs to tuples of components or `#[require(...)]`), and reruns `cargo check` after each category until it is clean. It never edits Bevy's own source or guesses a rename: if the guide does not mention a symbol, check `https://docs.rs/bevy/0.20.0`.

## Guidelines

- Pin `bevy = "=0.20.0"` exactly while developing; a plain `"0.20.0"` is a caret range and `cargo update` may pull a later 0.20.x patch. All Bevy-ecosystem crates (physics, UI, audio extras) must declare compatibility with that same version.
- Check API names against docs.rs for your version or the tagged examples before using them. Training-data memory of Bevy is unreliable because names change nearly every release.
- Use `Res<Time>` and `time.delta_secs()` for movement so speed does not depend on frame rate.
- Spawn with component tuples, despawn with `commands.entity(e).despawn()`. Commands apply at the end of the stage, not instantly.
- Two systems mutating the same component cannot run in parallel; order them with `.chain()` or `.after()`. When a query matches the same component twice, use `Without<...>` filters to prove the queries are disjoint (as `Without<Player>` above) or Bevy panics with error B0001 the first time the schedule runs.
- Do not enable `bevy/dynamic_linking` in release builds.
- Debug builds of games with many entities are slow; judge performance in `--release`.
- Bevy has no visual editor. If the user wants a full editor-driven workflow, say so rather than inventing one.
