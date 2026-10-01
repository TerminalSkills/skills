---
name: rust
description: >-
  Rust is a compiled, memory-safe systems programming language whose toolchain
  (rustup, rustc, Cargo, Clippy, rustfmt) builds, tests, lints and packages
  code. Use this skill to install or pin a Rust toolchain, start a crate or a
  multi-crate Cargo workspace, add dependencies, fix borrow-checker errors,
  design error handling with Result, gate CI on clippy and fmt, migrate to the
  2024 edition, or ship an optimized release binary. Triggers: "set up Rust",
  "cargo new", "cargo workspace", "fix this borrow checker error", "clippy
  warnings", "migrate to edition 2024", "pin the Rust version", "build a Rust
  CLI".
license: Apache-2.0
compatibility: "Linux, macOS or Windows; rustup with a stable toolchain (examples verified on Rust 1.98.1); edition 2024 needs Rust 1.85+; a C linker (cc on Linux, Xcode CLT on macOS, MSVC build tools on Windows)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["rust", "cargo", "rustup", "clippy", "systems-programming"]
  repository: https://github.com/rust-lang/rust
---
# Rust — Memory-Safe Systems Language and Cargo Toolchain

## Overview

Rust compiles to native code with no garbage collector; the borrow checker enforces memory and thread safety at compile time. Day-to-day work goes through a small set of tools: `rustup` installs and switches toolchains, `cargo` creates, builds, tests and publishes packages (crates), `clippy` lints, and `rustfmt` formats. Stable releases ship every six weeks; language-level breaking changes are opt-in through editions (2015, 2018, 2021, 2024), set per crate in `Cargo.toml`.

This skill covers the language and toolchain. For web servers use the `axum` or `rocket` skills, for async runtimes `tokio`, for desktop apps `tauri`, for WebAssembly `wasm`.

## Instructions

### Install the toolchain with rustup

```bash
# Install rustup, not a distro rustc package; Debian 13+/Ubuntu 24.04+, Arch and Homebrew ship it
sudo apt install rustup            # or: sudo pacman -S rustup / brew install rustup
rustup default stable
```

On Fedora the DNF package provides only `rustup-init`; run it once to create the proxies and install a toolchain. Homebrew's rustup does not put `rustc`/`cargo` on `PATH`; add `$(brew --prefix rustup)/bin`. Without a package manager, download the installer binary from the official domain and run it as a separate step (on Windows, run `rustup-init.exe` from https://rustup.rs):

```bash
URL=https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
curl --proto '=https' --tlsv1.2 -sSfo rustup-init $URL
curl --proto '=https' --tlsv1.2 -sSf $URL.sha256 | sha256sum -c -   # must print "./rustup-init: OK"
chmod +x rustup-init
./rustup-init -y --profile minimal -c clippy -c rustfmt
```

rustup puts the proxies (`rustc`, `cargo`, `rustup`) in `~/.cargo/bin`, which must be on `PATH`; toolchains are stored under `~/.rustup/toolchains`. Useful commands:

```bash
rustup update                          # update every installed toolchain and rustup
rustup component add clippy rustfmt    # lint + format tools for the active toolchain
rustup target add wasm32-unknown-unknown aarch64-unknown-linux-gnu
rustc --explain E0382                  # long-form explanation of any error code
```

### Pin the toolchain per project

When half a team is on an old rustc and CI keeps breaking, commit a `rust-toolchain.toml` at the repo root so every developer and CI job uses the same compiler:

```toml
[toolchain]
channel = "1.98.1"
components = ["clippy", "rustfmt"]
```

`rustup show active-toolchain` then prints `1.98.1-x86_64-unknown-linux-gnu (overridden by '.../rust-toolchain.toml')`. rustup downloads the pinned toolchain the first time any `cargo` command runs in the repo, so CI needs only rustup itself. If auto-install is off (`RUSTUP_AUTO_INSTALL=0` or `rustup set auto-install disable`), run `rustup toolchain install` in the repo; with no argument it installs what the file names. `channel` accepts `stable`, `beta`, `nightly`, `nightly-2026-09-01`, or a version such as `1.85` / `1.98.1`. Separately, declare the minimum supported version (MSRV) in `Cargo.toml` with `rust-version = "1.85"`.

### Create and build a crate

```bash
cargo new invoice-sync            # binary crate: src/main.rs, edition = "2024"
cd invoice-sync
cargo check                       # fast type-check, no codegen — use while editing
cargo build                       # debug build -> target/debug/invoice-sync
cargo run -- --since 2026-09-01   # args after -- go to your program
cargo build --release             # optimized -> target/release/invoice-sync
```

### Manage dependencies

```bash
cargo add serde --features derive      # edits Cargo.toml [dependencies]
cargo add --dev pretty_assertions      # test-only dependency
cargo remove --dev pretty_assertions   # --dev needed: plain remove only looks in [dependencies]
cargo update                           # refresh Cargo.lock within semver ranges
cargo tree --depth 1                   # see what pulled in what
```

Commit `Cargo.lock` for binaries and workspaces. Install Rust-written CLIs with `cargo install --locked ripgrep` so the published lockfile is honored.

### Organize a multi-crate workspace

A virtual workspace root has only a `[workspace]` table. Shared metadata, dependency versions and lints are declared once and inherited:

```toml
[workspace]
resolver = "3"                     # required in a virtual workspace; MSRV-aware resolution
members = []                       # `cargo new crates/<name>` appends each crate

[workspace.package]
edition = "2024"
rust-version = "1.85"

[workspace.dependencies]
thiserror = "2"

[workspace.lints.clippy]
unwrap_used = "warn"

[profile.release]
lto = true
codegen-units = 1
```

Running `cargo new --lib crates/logparse` inside the root appends the crate to `members` and writes `edition.workspace = true` plus `[lints] workspace = true` (the opt-in to the shared lint table). `cargo add thiserror -p logparse` then writes `thiserror.workspace = true`. Path dependencies between members: `cargo add --path crates/logparse -p logscan-cli`.

### Handle errors with Result

Return `Result<T, E>` and propagate with `?`; reserve `panic!`/`unwrap()` for true bugs. Common split: a typed error enum (often via `thiserror`) in libraries, `anyhow::Result` with `.context()` in binaries. Library, `crates/logparse/src/lib.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("line {line}: expected `LEVEL service: message`")]
    Malformed { line: usize },
    #[error("line {line}: unknown level `{level}`")]
    UnknownLevel { line: usize, level: String },
}

/// Returns `(level, service)` for a line such as `ERROR billing: card declined`.
/// ```
/// assert_eq!(logparse::parse_line("WARN checkout: slow", 1).unwrap(), ("WARN", "checkout"));
/// ```
pub fn parse_line(raw: &str, line: usize) -> Result<(&str, &str), ParseError> {
    let (level, rest) = raw.split_once(' ').ok_or(ParseError::Malformed { line })?;
    let (service, _message) = rest.split_once(": ").ok_or(ParseError::Malformed { line })?;
    match level {
        "INFO" | "WARN" | "ERROR" => Ok((level, service)),
        _ => Err(ParseError::UnknownLevel { line, level: level.to_string() }),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn unknown_level() {
        let err = super::parse_line("DEBUG billing: retry", 7).map_err(|e| e.to_string());
        assert_eq!(err, Err("line 7: unknown level `DEBUG`".to_string()));
    }
}
```

Binary, `crates/logscan-cli/src/main.rs`, counting ERROR lines per service. A `main` that returns `Err` prints `Error: ...` and exits with status 1:

```rust
use anyhow::{Context, Result};
use std::collections::BTreeMap;

fn main() -> Result<()> {
    let path = std::env::args().nth(1).context("usage: logscan-cli FILE")?;
    let text = std::fs::read_to_string(&path).with_context(|| format!("reading {path}"))?;
    let mut errors: BTreeMap<&str, usize> = BTreeMap::new();
    for (i, raw) in text.lines().enumerate() {
        let (level, service) = logparse::parse_line(raw, i + 1)?;
        if level == "ERROR" {
            *errors.entry(service).or_default() += 1;
        }
    }
    for (service, count) in &errors {
        println!("{service:<12} {count}");
    }
    Ok(())
}
```

### Test, lint and format

Unit tests sit next to the code in a `#[cfg(test)] mod tests`, integration tests in `tests/`, and code blocks in `///` doc comments run as doctests. The first, third and fourth commands below are the usual CI gate:

```bash
cargo test --workspace                     # unit + integration + doctests
cargo test -p logparse unknown             # filter by crate and test-name substring
cargo fmt --all -- --check                 # fail if anything is unformatted
cargo clippy --workspace --all-targets -- -D warnings
```

### Migrate to a newer edition

```bash
cargo update
cargo fix --edition        # rewrites code that would break under the next edition
# then set edition = "2024" in Cargo.toml (or [workspace.package])
cargo build && cargo test
cargo fmt
```

`cargo fix` refuses to run on a dirty git tree; commit first. It cannot fix everything: macros, doctests and generated code may need manual edits.

## Examples

### Example 1: Scaffold a log-scanning workspace with CI checks

**User:** "Set up a Rust workspace with a parsing library and a CLI that counts ERROR lines per service in our app.log. Make clippy and fmt pass."

```bash
mkdir logscan && cd logscan
# write the [workspace] Cargo.toml from "Organize a multi-crate workspace"
cargo new --lib crates/logparse
cargo new crates/logscan-cli
cargo add thiserror -p logparse
cargo add anyhow -p logscan-cli
cargo add --path crates/logparse -p logscan-cli
# write lib.rs and main.rs from "Handle errors with Result"
cargo fmt --all                     # rewraps the two long lines in parse_line
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release
./target/release/logscan-cli app.log
```

Result, with a five-line `app.log`:

```text
$ cat app.log
INFO api: started on :8080
ERROR billing: card declined for invoice 4471
ERROR billing: Stripe timeout after 30s
WARN checkout: slow response 2.4s
ERROR checkout: 502 from upstream
$ ./target/release/logscan-cli app.log
billing      2
checkout     1
```

`cargo test` passes the `unknown_level` unit test and the `parse_line` doctest; clippy is clean. A file whose first line is `NOTICE api: cache warmed` makes the CLI print ``Error: line 1: unknown level `NOTICE` `` and exit with status 1.

### Example 2: Fix a "borrow of moved value" error

**User:** "cargo build fails with E0382 in main.rs, recipients was moved."

```rust
fn notify(recipients: Vec<String>) -> usize {
    recipients.len()
}

fn main() {
    let recipients = vec!["ops@lindqvist-freight.se".to_string(), "oncall@lindqvist-freight.se".to_string()];
    let sent = notify(recipients);                      // ownership moves here
    println!("sent {sent} alerts to {}", recipients.join(", ")); // E0382
}
```

The compiler reports `error[E0382]: borrow of moved value: recipients` and suggests cloning. Cloning works but copies the vector; the function only reads, so borrow a slice instead:

```rust
fn notify(recipients: &[String]) -> usize {
    recipients.len()
}

fn main() {
    let recipients = vec!["ops@lindqvist-freight.se".to_string(), "oncall@lindqvist-freight.se".to_string()];
    let sent = notify(&recipients);
    println!("sent {sent} alerts to {}", recipients.join(", "));
}
```

`cargo run` prints `sent 2 alerts to ops@lindqvist-freight.se, oncall@lindqvist-freight.se` and `cargo clippy -- -D warnings` is clean.

## Guidelines

- Run `cargo check` in the edit loop; full builds and `--release` are much slower. Put build output on a fast disk — `target/` grows to several GB.
- Prefer borrowing (`&T`, `&str`, `&[T]`) in function parameters; take ownership only when the function stores or consumes the value. Reach for `.clone()` last.
- Avoid `unwrap()`/`expect()` in library and request-handling code; the `clippy::unwrap_used` lint (shown above) enforces this.
- `unsafe` blocks turn off compile-time guarantees; keep them small, document the invariant in a `// SAFETY:` comment, and never use them to silence the borrow checker.
- A new stable release lands every six weeks and may add Clippy lints, so `-D warnings` can start failing on `rustup update`; pinning the toolchain avoids surprise CI breaks.
- Before adding a crate, check its downloads, maintenance and license on crates.io; every dependency runs `build.rs` scripts and proc-macros with your user's permissions at build time.
- Rust is a poor fit for quick throwaway scripts or when the team must ship a CRUD prototype this week — compile times and the learning curve are real costs.