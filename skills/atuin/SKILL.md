---
name: atuin
category: Developer Tools
tags: [shell, history, sync, search, terminal, productivity, rust]
version: 1.0.0
author: terminal-skills
---

# Atuin — Magical Shell History

You are an expert in Atuin, the Rust-based shell history tool that replaces your shell's built-in history with a searchable, syncable, context-aware database. You help developers set up fuzzy search across shell history, sync history across machines, filter by directory/host/session, and analyze command usage — turning shell history from a flat text file into a powerful productivity tool.

## Core Capabilities

### Setup and Usage

```bash
# Install
curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh

# Import existing history
atuin import auto                         # Detects bash/zsh/fish

# Interactive search (Ctrl+R replacement)
# Press Ctrl+R → fuzzy search across all history
# Filter modes:
#   - Global: all history across all machines
#   - Host: only current machine
#   - Session: only current terminal session
#   - Directory: only commands run in current directory

# Sync across machines
atuin register -u username -e email -p password
atuin sync                                # E2E encrypted sync
atuin login -u username -p password       # On another machine
atuin sync                                # History from all machines!

# Search
atuin search "docker"                     # Full-text search
atuin search --after "2026-03-01" "deploy"
atuin search --cwd /project "git"         # Only in this directory
atuin search --exit 0 "make"              # Only successful commands

# Stats
atuin stats                               # Most used commands, frequency
atuin stats --count 20                    # Top 20 commands
```

### Configuration

```toml
# ~/.config/atuin/config.toml
[settings]
dialect = "us"
auto_sync = true
update_check = true
sync_frequency = "5m"
search_mode = "fuzzy"                     # fuzzy | prefix | fulltext | skim
filter_mode = "global"                    # global | host | session | directory
style = "compact"                         # compact | full
inline_height = 40
show_preview = true
show_help = true
exit_mode = "return-original"

# Key bindings
[keys]
scroll_exits = false

# Sync settings
[sync]
records = true                            # Sync all history records
```

### ZSH/Bash/Fish Integration

```bash
# Add to ~/.zshrc
eval "$(atuin init zsh)"

# Or ~/.bashrc
eval "$(atuin init bash)"

# Or ~/.config/fish/config.fish
atuin init fish | source

# Now Ctrl+R opens Atuin's interactive search instead of default
```

## Installation

```bash
# macOS
brew install atuin

# Linux
curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh

# Cargo
cargo install atuin
```

## Best Practices

1. **Fuzzy search** — Set `search_mode = "fuzzy"`; find commands even with typos or partial recall
2. **Directory filtering** — Use `filter_mode = "directory"` to see only commands relevant to current project
3. **Sync across machines** — Register for E2E encrypted sync; history follows you to any machine
4. **Exit code filtering** — Search `--exit 0` for successful commands; avoid repeating failed attempts
5. **Stats for optimization** — Run `atuin stats` to identify frequent commands worth aliasing
6. **Import history** — Run `atuin import auto` immediately after install; don't lose existing history
7. **Session mode** — Use session filter when debugging; see exactly what you ran in this terminal
8. **Self-hosted** — Deploy your own Atuin server for teams; `docker run ghcr.io/atuinsh/atuin`
