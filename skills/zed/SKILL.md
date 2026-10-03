---
name: zed
description: >-
  Zed is a fast, GPU-accelerated code editor written in Rust, with built-in
  AI agent and edit predictions, real-time collaboration, Vim mode and
  WebAssembly extensions. Use when the user wants to install or configure Zed,
  edit settings.json or keymap.json, set formatters per language, connect an
  AI provider such as Anthropic or Ollama, share a project with teammates, or
  write a Zed extension.
license: Apache-2.0
compatibility: "macOS, Linux (Vulkan-capable GPU recommended) or Windows; extension development needs Rust via rustup"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/zed-industries/zed
  tags:
  - editor
  - ide
  - collaboration
  - rust
  - performance
---

# Zed — High-Performance Code Editor

## Overview

Zed is an open-source editor built in Rust. Everything is configured with two JSON files that accept comments: `settings.json` and `keymap.json` (open them with the `zed: open settings file` and `zed: open keymap` commands; they live in `~/.config/zed/`). Per-project overrides go in `.zed/settings.json`.

Names changed over the last year, so older blog posts and models get these wrong:

- the AI chat panel is the **Agent Panel** and its settings key is `agent` (not `assistant`); `/file`-style slash commands are replaced by `@`-mentions of files, symbols, threads and images;
- AI code completions are **Edit Prediction**, configured under `edit_predictions` (not `inline_completions`), toggled with `editor::ToggleEditPrediction`;
- `theme` accepts a name or `{ "mode": "system", "light": ..., "dark": ... }`;
- `format_on_save` is `"on"`, `"off"`, `"modifications"` or `"modifications_if_available"`, and the default is `"off"`;
- `"disable_ai": true` switches every AI feature off.

Check any key against the default settings file (`zed: open default settings`) before using it.

## Instructions

### Install

```bash
brew install --cask zed                  # macOS (zed@preview for the preview channel)
winget install -e --id ZedIndustries.Zed # Windows
sudo pacman -S zed                       # Arch / Manjaro
sudo dnf install zed                     # Fedora
nix-shell -p zed-editor                  # Nix
```

Other distributions (Solus, Parabola, Flathub, conda-forge and more) package Zed too. Release tarballs on GitHub (`zed-linux-x86_64.tar.gz`, `zed-linux-aarch64.tar.gz`) ship without a checksum file, so prefer a package; the vendor's install script exists but is a download-and-run step you cannot verify. Linux needs glibc 2.31+ (x86_64) or 2.35+ (ARM) and works best with a Vulkan GPU. Open a project from a shell with `zed .`.

### Settings

```jsonc
// ~/.config/zed/settings.json
{
  "theme": { "mode": "system", "light": "One Light", "dark": "One Dark" },
  "ui_font_size": 16,
  "buffer_font_size": 14,
  "buffer_font_family": "JetBrains Mono",
  "buffer_line_height": { "custom": 1.6 },
  "vim_mode": true,
  "vim": { "use_system_clipboard": "always", "use_smartcase_find": true },
  "tab_size": 2,
  "format_on_save": "on",
  "autosave": { "after_delay": { "milliseconds": 1000 } },
  "soft_wrap": "editor_width",
  "git": { "inline_blame": { "enabled": true, "delay_ms": 500 }, "git_gutter": "tracked_files" },
  "terminal": { "shell": { "program": "zsh" }, "font_size": 13, "copy_on_select": true },
  "edit_predictions": { "disabled_globs": ["**/.env*", "**/*.pem", "**/*.key"] },
  "languages": {
    "TypeScript": {
      "formatter": { "external": { "command": "prettier", "arguments": ["--stdin-filepath", "{buffer_path}"] } }
    },
    "Python": {
      "tab_size": 4,
      "formatter": { "language_server": { "name": "ruff" } }
    },
    "Rust": { "tab_size": 4, "formatter": "language_server" }
  }
}
```

Notes: `formatter` also takes `"auto"` (default: Prettier integration, else language server), `"prettier"`, `{ "code_action": "source.fixAll.eslint" }` or an array of steps. When `autosave` is set to a delay, `format_on_save` is ignored. `edit_predictions.disabled_globs` already excludes `.env`, keys and certificates by default; writing `"..."` as an entry keeps the defaults and adds yours.

### Key bindings

`keymap.json` is an array of context blocks. Use `cmd-` on macOS and `ctrl-` on Linux and Windows.

```jsonc
[
  {
    "context": "Workspace",
    "bindings": {
      "ctrl-shift-a": "agent::ToggleFocus",
      "ctrl-alt-e": "editor::ToggleEditPrediction"
    }
  },
  {
    "context": "Editor",
    "bindings": {
      "ctrl-l": "assistant::InlineAssist"
    }
  },
  {
    "context": "VimControl && !menu",
    "bindings": {
      "space f": "file_finder::Toggle",
      "space g": "pane::DeploySearch",
      "space e": "project_panel::ToggleFocus"
    }
  }
]
```

Defaults worth knowing (Linux; macOS uses cmd): `ctrl-p` file finder, `ctrl-shift-p` command palette, `ctrl-t` project symbols, `ctrl-b` toggle left dock, `ctrl-enter` inline assist, `ctrl-shift-l` select all matches. Open the keymap editor with the `zed: open keymap` command to see the live list and conflicts before overriding.

### AI

- Sign in to Zed, or add your own provider in Agent Settings (`agent: open settings`). Zed also reads `ANTHROPIC_API_KEY` and the other provider variables from its process environment; keep keys out of `settings.json`.
- Pick the default model and tune it:

```jsonc
{
  "agent": {
    "default_model": { "provider": "anthropic", "model": "claude-sonnet-4-5", "enable_thinking": false },
    "model_parameters": [{ "provider": "anthropic", "model": "claude-sonnet-4-5", "temperature": 0.2 }],
    "commit_message_instructions": "Use Conventional Commits: <type>(<scope>): <description>."
  },
  "language_models": {
    "anthropic": { "available_models": [{ "name": "claude-sonnet-4-latest", "display_name": "Sonnet 4 thinking", "max_tokens": 200000, "mode": { "type": "thinking", "budget_tokens": 4096 } }] }
  }
}
```

- Select code and press the inline-assist binding to rewrite it in place; type `@` in the Agent Panel to attach files, symbols, images or earlier threads. Review the agent's edits with `agent::Keep` / `agent::Reject`.
- Tool use, MCP servers and external agents are configured in the same panel; local models work through the Ollama or OpenAI-compatible providers.

### Collaboration

Open the Collaboration Panel (`collab_panel::ToggleFocus`, signing in required). Join or create a **channel**, open a project, and press **Share** in the title bar; collaborators appear with cursors and can follow each other by clicking an avatar. Sharing exposes the project's files to those people, so only invite people you trust.

### Extensions

An extension is a Git repository with an `extension.toml` (top-level keys, no `[extension]` table). Rust code is only needed for language servers, MCP servers and debuggers; it compiles to WebAssembly (`wasm32-wasip2`).

```toml
# extension.toml
id = "gleam-lsp"
name = "Gleam LSP"
version = "0.1.0"
schema_version = 1
authors = ["Dana Whitfield"]
description = "Gleam language server"
repository = "https://github.com/northwind-traders/zed-gleam-lsp"

[language_servers.gleam]
name = "Gleam LSP"
languages = ["Gleam"]
```

```rust
// src/lib.rs, with crate-type = ["cdylib"] and zed_extension_api in Cargo.toml
use zed_extension_api::{self as zed, Result};

struct GleamExtension;

impl zed::Extension for GleamExtension {
    fn new() -> Self { GleamExtension }

    fn language_server_command(
        &mut self,
        _id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let path = worktree.which("gleam").ok_or("gleam is not on PATH")?;
        Ok(zed::Command { command: path, args: vec!["lsp".into()], env: Default::default() })
    }
}

zed::register_extension!(GleamExtension);
```

Test with **Install Dev Extension** (`zed: install dev extension`) and read the log with `zed: open log`; `zed --foreground` shows extension stdout. Grammars are declared as `[grammars.<name>]` with `repository` and `rev` (a commit SHA).

## Examples

### "Set Zed up for TypeScript and React with Vim keys and Prettier"

Add to `settings.json`: `"vim_mode": true`, `"format_on_save": "on"`, and under `languages` the `TypeScript` and `TSX` entries with the Prettier `external` formatter shown above. Result: saving a `.tsx` file runs Prettier through stdin; `zed: open log` shows any formatter error.

### "Use my local Ollama model for the agent and turn off completions for secrets"

Run `ollama pull qwen2.5-coder` and `ollama serve`; Zed discovers pulled models on its own, so pick the model in the agent's model dropdown. Zed asks Ollama for a 4096-token context by default, so raise it:

```jsonc
{ "language_models": { "ollama": { "api_url": "http://localhost:11434", "context_window": 16384 } } }
```

Keep `edit_predictions.disabled_globs` as in the sample. Result: agent threads run against the local server and `.env` or `.pem` files never get predictions.

## Guidelines

- Validate keys against `zed: open default settings`; the default file is the source of truth for names and values.
- Keep API keys in the environment or Zed's credential store, never in a settings file that is committed.
- Extension APIs are versioned: use the current `zed_extension_api` from crates.io and check its compatible Zed versions.
- Shared projects give collaborators file access; unshare when the session ends.
