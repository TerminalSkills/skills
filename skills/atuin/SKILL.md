---
name: atuin
description: Expert guidance for Atuin, the tool that replaces your shell history with a SQLite database providing encrypted sync across machines, full-text search, and contextual history filtering. Helps developers install, configure, and get the most out of Atuin for shell history management and productivity.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - shell-history
  - terminal
  - sync
  - search
  - productivity
---

# Atuin — Magical Shell History


## Overview


Atuin, the tool that replaces your shell history with a SQLite database providing encrypted sync across machines, full-text search, and contextual history filtering. Helps developers install, configure, and get the most out of Atuin for shell history management and productivity.


## Instructions

### Installation and Setup

```bash
# Install Atuin
curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh

# Add to shell (bash/zsh/fish)
# For zsh:
echo 'eval "$(atuin init zsh)"' >> ~/.zshrc

# For bash:
echo 'eval "$(atuin init bash)"' >> ~/.bashrc

# For fish:
echo 'atuin init fish | source' >> ~/.config/fish/config.fish

# Register for cross-machine sync (optional)
atuin register -u your-username -e your@email.com
atuin login -u your-username
atuin sync
```

### Configuration

```toml
# ~/.config/atuin/config.toml — Full configuration
[settings]
## Search settings
search_mode = "fuzzy"            # "prefix" | "fulltext" | "fuzzy" | "skim"
filter_mode = "global"           # "global" | "host" | "session" | "directory"
filter_mode_shell_up_key_binding = "host"  # Up arrow searches current host only

## Display
style = "compact"                # "auto" | "compact" | "full"
inline_height = 20               # Number of results to show
show_preview = true              # Show command preview
show_help = true                 # Show keybinding help

## History settings
history_filter = [
  "^echo \\$\\(",               # Filter out variable echoes
  "^(export|set) .*=.*[Kk][Ee][Yy]",  # Filter commands containing keys
  "^(export|set) .*TOKEN",      # Filter token exports
]
secrets_filter = true            # Auto-detect and filter secrets

## Sync settings
auto_sync = true                 # Sync after every command
sync_frequency = "5m"            # Sync interval when idle
sync_address = "https://api.atuin.sh"  # Atuin server (or self-hosted)

## Storage
db_path = "~/.local/share/atuin/history.db"

## Key bindings
# Ctrl+R → Atuin search (default)
# Up arrow → filtered history (default)
```

### Search and Filtering

```bash
# Interactive search (Ctrl+R)
# Type to fuzzy search through all history

# Search with filters
atuin search "docker"                          # Full-text search
atuin search --after "2026-01-01" "deploy"     # After a date
atuin search --before "yesterday" "npm"        # Before a date
atuin search --cwd /home/user/project "git"    # In specific directory
atuin search --host "prod-server" "systemctl"  # On specific host
atuin search --exit 0 "make build"             # Only successful commands
atuin search --exit 1 "pytest"                 # Only failed commands

# Statistics
atuin stats                                    # Most used commands
atuin stats --count 20                         # Top 20 commands

# History management
atuin history list --cmd-only                  # Just commands, no metadata
atuin history list --format "{time} {command}" # Custom format
atuin history last                             # Show last command
atuin history last --cmd-only                  # Just the last command string
```

### Self-Hosted Server

Run your own Atuin sync server:

```bash
# Docker Compose for self-hosted Atuin server
# docker-compose.yml
```

```yaml
version: "3"
services:
  atuin:
    image: ghcr.io/atuinsh/atuin:latest
    command: server start
    ports:
      - "8888:8888"
    environment:
      ATUIN_HOST: "0.0.0.0"
      ATUIN_PORT: "8888"
      ATUIN_OPEN_REGISTRATION: "true"
      ATUIN_DB_URI: "postgres://atuin:password@db/atuin"
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: atuin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: atuin
    volumes:
      - atuin-db:/var/lib/postgresql/data

volumes:
  atuin-db:
```

```bash
# Point client to self-hosted server
# In ~/.config/atuin/config.toml:
# sync_address = "https://atuin.yourdomain.com"

# Register on self-hosted server
atuin register -u admin -e admin@yourdomain.com
```

### Import Existing History

```bash
# Import from existing shell history
atuin import auto                 # Auto-detect shell and import
atuin import zsh                  # Import zsh history
atuin import bash                 # Import bash history
atuin import fish                 # Import fish history

# Check import results
atuin stats
atuin history list --limit 5
```


## Examples


### Example 1: Setting up Atuin with a custom configuration

**User request:**

```
I just installed Atuin. Help me configure it for my TypeScript + React workflow with my preferred keybindings.
```

The agent creates the configuration file with TypeScript-aware settings, configures relevant plugins/extensions for React development, sets up keyboard shortcuts matching the user's preferences, and verifies the setup works correctly.

### Example 2: Extending Atuin with custom functionality

**User request:**

```
I want to add a custom configuration to Atuin. How do I build one?
```

The agent scaffolds the extension/plugin project, implements the core functionality following Atuin's API patterns, adds configuration options, and provides testing instructions to verify it works end-to-end.


## Guidelines

1. **Use fuzzy search mode** — `search_mode = "fuzzy"` is most flexible; finds commands even with typos
2. **Filter sensitive data** — Configure `history_filter` to exclude commands containing tokens, passwords, or API keys
3. **Enable `secrets_filter`** — Auto-detects and filters potential secrets from history
4. **Directory-aware history** — Set `filter_mode_shell_up_key_binding = "directory"` so Up arrow shows commands run in the current directory
5. **Self-host for teams** — Run a private Atuin server for team-wide command sharing without sending data to the cloud
6. **Import early** — Run `atuin import auto` right after installation to preserve existing history
7. **Use exit code filtering** — `atuin search --exit 0` finds only commands that succeeded; great for finding the right command syntax
8. **Sync across machines** — Register an account and enable `auto_sync` to have your history available on every machine
