---
name: zed
category: Developer Tools
tags: [editor, ide, collaboration, rust, performance, ai]
version: 1.0.0
author: terminal-skills
---

# Zed — High-Performance Code Editor

You are an expert in Zed, the high-performance code editor built in Rust with native collaboration, AI integration, and GPU-accelerated rendering. You help developers configure Zed, create custom extensions, set up collaborative editing sessions, and integrate AI assistants for productive coding.

## Core Capabilities

### Configuration

Customize Zed through its JSON settings:

```jsonc
// ~/.config/zed/settings.json — Main configuration file
{
  // Editor appearance and behavior
  "theme": "One Dark",
  "ui_font_size": 14,
  "buffer_font_size": 14,
  "buffer_font_family": "JetBrains Mono",
  "buffer_line_height": { "custom": 1.6 },

  // Vim mode (built-in, no extension needed)
  "vim_mode": true,
  "vim": {
    "use_system_clipboard": "always",
    "use_smartcase_find": true
  },

  // Tab and indentation
  "tab_size": 2,
  "hard_tabs": false,
  "format_on_save": "on",
  "formatter": "language_server",

  // Git integration
  "git": {
    "inline_blame": { "enabled": true, "delay_ms": 500 },
    "git_gutter": "tracked_files"
  },

  // AI Assistant configuration
  "assistant": {
    "enabled": true,
    "default_model": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "version": "2"     // Use Assistant v2 panel
  },

  // Inline completions (code suggestions)
  "inline_completions": {
    "disabled_globs": [".env", "*.pem", "*.key"]
  },

  // Language-specific settings
  "languages": {
    "TypeScript": {
      "tab_size": 2,
      "formatter": { "external": { "command": "prettier", "arguments": ["--stdin-filepath", "{buffer_path}"] } }
    },
    "Python": {
      "tab_size": 4,
      "formatter": { "external": { "command": "ruff", "arguments": ["format", "--stdin-filename", "{buffer_path}"] } }
    },
    "Rust": {
      "tab_size": 4,
      "formatter": "language_server"
    }
  },

  // Terminal
  "terminal": {
    "shell": { "program": "zsh" },
    "font_size": 13,
    "line_height": { "custom": 1.4 },
    "copy_on_select": true
  },

  // File tree
  "project_panel": {
    "auto_reveal_entries": true,
    "auto_fold_dirs": true,
    "file_icons": true
  },

  // Performance
  "autosave": { "after_delay": { "milliseconds": 1000 } },
  "soft_wrap": "editor_width"
}
```

### Key Bindings

Configure custom keyboard shortcuts:

```jsonc
// ~/.config/zed/keymap.json — Custom keybindings
[
  // Quick file switching (like VS Code Cmd+P)
  {
    "context": "Workspace",
    "bindings": {
      "cmd-p": "file_finder::Toggle",
      "cmd-shift-p": "command_palette::Toggle",
      "cmd-shift-f": "project_search::ToggleFocus",
      "cmd-b": "workspace::ToggleLeftDock",
      "cmd-j": "terminal_panel::ToggleFocus",
      // Custom: open AI assistant panel
      "cmd-shift-a": "assistant::ToggleFocus",
      // Custom: toggle inline AI completions
      "cmd-shift-i": "editor::ToggleInlineCompletions"
    }
  },
  // Editor-specific bindings
  {
    "context": "Editor",
    "bindings": {
      "cmd-d": "editor::SelectNext",                    // Multi-cursor select next match
      "cmd-shift-l": "editor::SelectAllMatches",        // Select all occurrences
      "alt-up": "editor::MoveLineUp",
      "alt-down": "editor::MoveLineDown",
      "cmd-shift-k": "editor::DeleteLine",
      "cmd-/": "editor::ToggleComments",
      // Quick AI actions
      "ctrl-l": "assistant::InlineAssist"               // Inline AI edit at cursor
    }
  },
  // Vim-specific overrides
  {
    "context": "VimControl",
    "bindings": {
      "space f": "file_finder::Toggle",
      "space g": "project_search::ToggleFocus",
      "space e": "project_panel::ToggleFocus",
      "space a": "assistant::ToggleFocus",
      "space t": "terminal_panel::ToggleFocus"
    }
  }
]
```

### Collaborative Editing

Set up real-time pair programming sessions:

```markdown
## How Collaboration Works in Zed

1. **Start a session**: Click "Share" in the title bar or run `collaboration::ShareProject`
2. **Share the link**: Copy the invite link and send to teammates
3. **Real-time editing**: All participants see each other's cursors and edits instantly
4. **Follow mode**: Click a collaborator's avatar to follow their cursor (see what they see)
5. **Voice chat**: Built-in voice channels — no need for a separate call

### Collaboration Features
- **Shared terminal**: Collaborators can see your terminal output
- **Shared diagnostics**: LSP errors and warnings are visible to all participants
- **Conflict-free**: Uses CRDT (similar to Yjs) for concurrent edit resolution
- **Low latency**: Edits propagate in <50ms on good connections
```

### AI Assistant Usage

Leverage Zed's integrated AI for coding tasks:

```markdown
## AI Workflows in Zed

### Inline Assist (Ctrl+L)
Select code → Ctrl+L → type instruction:
- "Add error handling to this function"
- "Refactor to use async/await"
- "Add TypeScript types"
- "Write a unit test for this"

### Assistant Panel (Cmd+Shift+A)
Full conversation with AI, with context from your codebase:
- Drag files into the panel to add them as context
- Use `/file` to reference specific files
- Use `/tab` to include all open tabs as context
- Ask architectural questions about your codebase

### Slash Commands in Assistant
- `/file path/to/file.ts` — Include file content as context
- `/tab` — Include all open editor tabs
- `/diagnostics` — Include current LSP errors/warnings
- `/selection` — Include currently selected code
- `/terminal` — Include recent terminal output
```

### Extension Development

Build custom extensions for Zed:

```rust
// extensions/my-extension/src/lib.rs — Zed extension in Rust (WASM)
use zed_extension_api::{self as zed, Result};

struct MyExtension;

impl zed::Extension for MyExtension {
    fn new() -> Self { MyExtension }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Configure a custom language server
        Ok(zed::Command {
            command: "my-lsp-binary".to_string(),
            args: vec!["--stdio".to_string()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(MyExtension);
```

```toml
# extensions/my-extension/extension.toml — Extension manifest
[extension]
id = "my-extension"
name = "My Extension"
version = "0.1.0"
schema_version = 1
authors = ["Your Name"]
description = "Custom language support for Zed"
repository = "https://github.com/you/zed-my-extension"

[grammars.my-language]
repository = "https://github.com/tree-sitter/tree-sitter-my-language"
commit = "abc123"

[language_servers.my-lsp]
language = "MyLanguage"
```

## Installation

```bash
# macOS (official)
brew install --cask zed

# Linux
curl -f https://zed.dev/install.sh | sh

# Build from source
git clone https://github.com/zed-industries/zed.git
cd zed
cargo build --release
```

## Best Practices

1. **Use Vim mode** — Zed's Vim emulation is excellent and first-class; combine with Zed-specific keybindings for best productivity
2. **Configure per-language formatting** — Set formatters per language (Prettier for JS, Ruff for Python, rustfmt for Rust)
3. **AI context matters** — Drag relevant files into the assistant panel; more context = better AI responses
4. **Inline assist for quick edits** — Select code + Ctrl+L is faster than copy-pasting into a chat
5. **Use follow mode in pairing** — Click a collaborator's avatar to see exactly what they see; great for code reviews
6. **Autosave with delay** — 1000ms delay avoids constant disk writes while keeping files saved
7. **Extensions are WASM** — Write extensions in Rust compiled to WebAssembly; they run in a sandbox for security
8. **Keyboard-first design** — Learn `Cmd+P` (files), `Cmd+Shift+P` (commands), `Cmd+T` (symbols) for fast navigation
