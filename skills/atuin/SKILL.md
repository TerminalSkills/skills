---
name: atuin
description: >-
  Atuin replaces your shell history file with a searchable SQLite database that
  records directory, exit code, duration and host for every command, and can sync
  it end-to-end encrypted between machines. Use when a user asks to "search shell
  history", "replace Ctrl+R", "sync history across machines", "find the command I
  ran in this directory", "import bash/zsh history", "see my most used commands"
  or "self-host Atuin".
license: Apache-2.0
compatibility: "bash (needs ble.sh 0.4+ or bash-preexec), zsh, fish, nushell, xonsh or PowerShell. Linux, macOS, Windows."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: productivity
  tags: ["shell", "history", "sync", "search", "terminal"]
  repository: https://github.com/atuinsh/atuin
---

# Atuin

## Overview

Atuin hooks into your shell, stores each command with its working directory, exit code, duration, session and host in a local database, and replaces Ctrl+R (and optionally the Up arrow) with an interactive search over it. Optional sync copies history between machines, encrypted client-side so the server only sees ciphertext; you can use the hosted server at `api.atuin.sh` or run your own. Your original shell history file keeps being written, so installing Atuin loses nothing.

## Instructions

### 1. Install

```bash
brew install atuin            # macOS / Linuxbrew
pacman -S atuin               # Arch
cargo install atuin --locked  # from source (needs a current Rust toolchain)
winget install -e Atuinsh.Atuin   # Windows
```

The project also documents an installer script at setup.atuin.sh; if you use a script, download and read it first rather than piping it into a shell.

### 2. Enable the shell integration

Add one line to the shell's startup file, then open a new terminal:

```bash
eval "$(atuin init zsh)"            # ~/.zshrc
eval "$(atuin init bash)"           # ~/.bashrc (requires ble.sh or bash-preexec loaded BEFORE this line)
atuin init fish | source            # ~/.config/fish/config.fish
```

Useful options: `atuin init zsh --disable-up-arrow` keeps Up as the shell default; `--disable-ctrl-r` keeps the default Ctrl+R.

### 3. Import existing history

```bash
atuin import auto        # detects the current shell; or: atuin import zsh | bash | fish
```

### 4. Search

Ctrl+R opens the interactive UI; Tab/Enter behaviour follows `enter_accept`. From scripts or an agent use the non-interactive command (a prefix search by default; `*` and `%` are wildcards):

```bash
atuin search docker
atuin search --cwd ~/code/billing-api --exit 0 "make"      # only successes in one directory
atuin search --after "2026-09-01" --before "2026-09-30" deploy
atuin search --exclude-exit 0 --limit 10 "npm test"        # recent failures
atuin search --format "{time} {exit} {command}" --limit 20 kubectl
atuin search --delete "AWS_SECRET"                         # remove matching entries
```

Other flags: `--exclude-cwd`, `--human`, `--reverse`, `--offset`, `--interactive`. In the UI, Ctrl+R again cycles the filter (global, host, session, directory, workspace).

### 5. Stats

```bash
atuin stats              # all time: most used commands, totals, unique count
atuin stats week         # also: today, month, year, or a date like 2026-09-01 or "last friday"
```

### 6. Sync

```bash
atuin register -u mira.kowalski -e mira@kowalski.dev   # prompts for a password
atuin key                                              # shows the encryption key: store it in a password manager
atuin sync                                             # manual sync; auto_sync runs it in the background

# on a second machine
atuin login -u mira.kowalski                           # prompts for password and the key
atuin sync -f                                          # full re-sync if entries look missing
```

### 7. Configure

`~/.config/atuin/config.toml` (created on first run; keys are top-level, no `[settings]` table):

```toml
dialect = "us"
auto_sync = true
sync_frequency = "5m"
search_mode = "fuzzy"             # prefix | fulltext | fuzzy | daemon-fuzzy
filter_mode = "global"            # global | host | session | session-preload | directory | workspace
filter_mode_shell_up_key_binding = "directory"   # Up arrow stays project-local
style = "compact"                 # auto | full | compact
inline_height = 20
enter_accept = false              # Enter edits the command instead of running it
history_filter = ["^export .*TOKEN", "^psql .*password"]
secrets_filter = true             # on by default: skips commands containing known secret patterns
```

### 8. Self-host

Run the server image `ghcr.io/atuinsh/atuin at the current release tag (for example 18.23.0)` with command `start`, backed by PostgreSQL, port 8888. Required environment: `ATUIN_DB_URI`, `ATUIN_HOST=0.0.0.0`, and `ATUIN_OPEN_REGISTRATION=true` only until accounts exist. Then set `sync_address = "https://atuin.northwind-labs.net"` in each client's config **before** registering. Put it behind TLS.

## Examples

### Example 1: Find last week's command in one project

**User prompt:** "What was the docker compose command I used in the billing-api folder that worked?"

```bash
cd ~/code/billing-api
atuin search --cwd "$PWD" --exit 0 --after "last week" --format "{time}  {command}" "docker compose"
```

Result: a list such as `2026-09-28 14:02:11  docker compose -f compose.prod.yml up -d --build`, newest matches included, failed runs excluded.

### Example 2: Move history to a new laptop

**User prompt:** "I got a new MacBook, I want my shell history there."

On the old machine: `atuin sync` then `atuin key` (copy the key). On the new one: `brew install atuin`, add `eval "$(atuin init zsh)"` to `~/.zshrc`, open a new shell, `atuin login -u mira.kowalski`, paste the password and key, `atuin sync`. `atuin stats` then shows the full history count from both machines.

## Guidelines

- The encryption key cannot be recovered; losing it means losing synced history. Never paste it into chats or commit it.
- Atuin records every command, including inline secrets. Add `history_filter` patterns for your own token formats, keep `secrets_filter` on, and use `atuin search --delete` to purge a leaked entry; rotate the secret anyway.
- On bash, load ble.sh or bash-preexec first; without them history capture is incomplete.
- Set `sync_address` before `register` when self-hosting, or you create an account on the hosted server.
- `filter_mode = "directory"` suits project work; keep `global` for general recall.
- Not for hiding commands from other users or auditing: it is a convenience history, not a tamper-proof log.
