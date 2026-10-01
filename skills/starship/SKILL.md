---
name: starship
description: >-
  Starship is a fast cross-shell prompt written in Rust that shows git status,
  language versions, cloud and Kubernetes context, command duration and custom
  modules from one TOML file, identically in Bash, Zsh, Fish, PowerShell and
  other shells. Use when a user asks to install Starship, customize or theme
  their terminal prompt, write or debug starship.toml, add a custom module,
  find out why the prompt is slow, or use Starship as the Claude Code status line.
license: Apache-2.0
compatibility: "Starship 1.26 on Linux, macOS, Windows, BSD; Bash, Zsh, Fish, PowerShell, Nushell and others; a Nerd Font for the icon presets"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/starship/starship
  tags:
    - terminal
    - prompt
    - shell
    - customization
    - cross-shell
---

# Starship — Cross-Shell Prompt

## Overview

Starship is a single binary that renders the shell prompt. Each piece of the prompt is a *module* (`directory`, `git_branch`, `nodejs`, `kubernetes`, …) that appears only when it is relevant to the current directory. All configuration lives in `~/.config/starship.toml` (or the file named by `STARSHIP_CONFIG`), and the same file works in every supported shell.

## Instructions

### Install

```bash
brew install starship                    # macOS and Linuxbrew
apt install starship                     # Debian 13+, Ubuntu 25.04+
pacman -S starship                       # Arch, Manjaro
apk add starship                         # Alpine 3.13+
cargo install starship --locked          # any OS with a Rust toolchain
winget install --id Starship.Starship    # Windows (also: scoop install starship)

# No package for the system: take the release archive and verify its checksum
VERSION=v1.26.0
FILE=starship-x86_64-unknown-linux-musl.tar.gz
curl -fsSLO https://github.com/starship/starship/releases/download/$VERSION/$FILE
curl -fsSLO https://github.com/starship/starship/releases/download/$VERSION/$FILE.sha256
echo "$(cat $FILE.sha256)  $FILE" | sha256sum --check     # starship-x86_64-unknown-linux-musl.tar.gz: OK
mkdir -p ~/.local/bin && tar -xzf $FILE -C ~/.local/bin starship   # ~/.local/bin must be on PATH
starship --version                       # starship 1.26.0
```

### Hook It Into the Shell

```bash
echo 'eval "$(starship init bash)"' >> ~/.bashrc
echo 'eval "$(starship init zsh)"' >> ~/.zshrc
echo 'starship init fish | source' >> ~/.config/fish/config.fish
# PowerShell: add to $PROFILE ->  Invoke-Expression (&starship init powershell)
```

Put the line at the end of the file, then open a new shell.

### Configuration

```toml
# ~/.config/starship.toml
"$schema" = 'https://starship.rs/config-schema.json'

command_timeout = 500                     # ms a module may wait for an external command

# Listing modules here replaces the default order; anything not listed is hidden
format = """
$username\
$hostname\
$directory\
$git_branch\
$git_status\
$nodejs\
$python\
$rust\
$golang\
$docker_context\
$kubernetes\
$aws\
$terraform\
${custom.containers}\
$cmd_duration\
$time\
$line_break\
$character"""

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"

[directory]
truncation_length = 3
truncate_to_repo = true
style = "bold cyan"

[git_branch]
symbol = "🌿 "
style = "bold purple"

[git_status]
conflicted = "⚔️ "
ahead = "⇡${count} "
behind = "⇣${count} "
diverged = "⇕⇡${ahead_count}⇣${behind_count} "
untracked = "?${count} "
stashed = "📦 "
modified = "!${count} "
staged = "+${count} "
deleted = "✘${count} "

[nodejs]
symbol = "⬢ "
detect_files = ["package.json", ".nvmrc"]
style = "bold green"

[python]
symbol = "🐍 "
detect_extensions = ["py"]
style = "bold yellow"

[rust]
symbol = "🦀 "
style = "bold red"

[docker_context]
symbol = "🐳 "
only_with_files = true

[kubernetes]
disabled = false                          # off by default
symbol = "☸ "
detect_folders = ["k8s", "kubernetes"]    # without a detect_* option it shows everywhere

[aws]
symbol = "☁️ "
format = '[$symbol($profile )(\($region\))]($style)'

[cmd_duration]
min_time = 2000                           # show if the command took longer than 2 s
format = "took [$duration]($style) "
style = "bold yellow"

[time]
disabled = false                          # off by default
format = "🕐 [$time]($style) "
time_format = "%H:%M"

# Custom module: runs only in directories that contain a Compose file
[custom.containers]
command = "docker ps -q | wc -l | tr -d ' '"
detect_files = ["compose.yaml", "docker-compose.yml"]
symbol = "🐳 "
format = "[$symbol$output running]($style) "
style = "blue"
description = "Number of running Docker containers"
```

Format strings: `$module` inserts a module, `[text]($style)` styles text, `(...)` renders only when a variable inside it has a value. Use `$all` in `format` to mean "every module not listed explicitly".

### Inspect and Debug

```bash
# Render once with a config under test; unknown keys print [WARN]. A warning is shown only once
# per session, so pass a fresh session key when re-checking.
STARSHIP_SESSION_KEY=$(starship session) STARSHIP_CONFIG=./starship.toml starship prompt
starship explain                 # what each visible segment is
starship timings                 # how long each module took
starship print-config kubernetes # effective settings of one module (add --default for the defaults)
starship module --list           # every module name
starship toggle time             # flip `disabled` for a module in the config file
starship config command_timeout 1000   # set a key without opening the file
```

Warnings and errors are also written to `~/.cache/starship/session_*.log`.

### Presets

```bash
starship preset --list                                   # nerd-font-symbols, no-nerd-font, plain-text-symbols, tokyo-night, …
starship preset tokyo-night -o ~/.config/starship.toml   # refuses to overwrite an existing file unless -f is given
```

### Claude Code Status Line

Since 1.25 Starship can render the Claude Code status line. Add to `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "starship statusline claude-code"
  }
}
```

It uses a profile with three extra modules, configurable in `starship.toml`:

```toml
[profiles]
claude-code = "$claude_model$git_branch$claude_context$claude_cost"

[claude_context]
gauge_width = 10
```

The line then reads `🤖 Sonnet 4.5 on 🌿 main ██████▒░░░ 65% 💰 $2.42`. With the default thresholds the context gauge stays hidden below 30 % usage.

## Examples

### Example 1: Validate a new config before switching to it

**User request:** "Write me a starship.toml with git and Kubernetes context, but check it before I replace my current prompt."

Save the configuration above as `./starship.toml` in the project and render it once without touching `~/.config`:

```
$ STARSHIP_SESSION_KEY=$(starship session) STARSHIP_CONFIG=./starship.toml starship prompt
[WARN] - (starship::config): Error in 'Directory' at 'truncate_to_rep': Unknown key (Did you mean 'truncate_to_repo'?)
```

Fix the key, run it again until no `[WARN]` line appears, then check the result:

```
$ STARSHIP_CONFIG=./starship.toml starship explain
 Here's a breakdown of your prompt:
 ❯                            -  A character (usually an arrow) beside where the text is entered in your terminal
 🐳 5 running                 -  Number of running Docker containers
 checkout-web                 -  The current working directory
 on 🌿 main                   -  The active branch of the repo in your current directory
 [?3 ]                        -  Symbol representing the state of the repo
 ☸ staging-eu (payments) in   -  The current Kubernetes context name and, if set, the namespace
 via ⬢ v24.11.1               -  The currently installed version of NodeJS
 🕐 19:13                     -  The current local time
```

Then `cp starship.toml ~/.config/starship.toml`.

### Example 2: Find out why the prompt is slow

**User request:** "My prompt takes a noticeable moment to appear in this repo. What is slow?"

```
$ starship timings
 Here are the timings of modules in your prompt (>=1ms or output):
 custom.containers  -  18ms  -   "🐳 5 running "
 nodejs             -   1ms  -   "via ⬢ v24.11.1 "
 git_status         -   1ms  -   "[?3 ] "
 character          -  <1ms  -   "❯ "
 directory          -  <1ms  -   "checkout-web "
 git_branch         -  <1ms  -   "on 🌿 main "
 kubernetes         -  <1ms  -   "☸ staging-eu (payments) in "
 line_break         -  <1ms  -   "\n"
 time               -  <1ms  -   "🕐 19:13 "
```

The slowest entry is the one to deal with: narrow a custom module with `detect_files`, turn a module off with `starship toggle nodejs`, or in a very large repository set `[git_status] disabled = true`. A command that runs longer than `command_timeout` (500 ms by default) is cut off: the module is left out of that prompt and Starship warns `Executing custom command "…" timed out`; raise `command_timeout` or set `ignore_timeout = true` on that module only if the wait is acceptable.

## Guidelines

1. **Cross-shell** — the same `starship.toml` works in Bash, Zsh, Fish, PowerShell and the rest; only the init line differs.
2. **`format` replaces the default order** — a module that is configured but not listed in `format` (and not covered by `$all`) never shows. Custom modules are referenced as `${custom.name}`.
3. **Disabled by default** — `kubernetes`, `time` and a few others need `disabled = false`.
4. **Fonts** — the default symbols and most presets need a Nerd Font in the terminal; otherwise start from `starship preset no-nerd-font` or `plain-text-symbols`.
5. **Cloud context** — show the AWS profile, Kubernetes context and Terraform workspace so a command is not run against the wrong environment.
6. **Custom modules run on every prompt** — keep `command` fast, scope it with `detect_files`/`when`, and read a shared config before using it: whatever it lists under `[custom.*]` is executed in the shell.
7. **Version modules call the tool** — `nodejs`, `python` and similar run the interpreter to get its version; a slow version manager shim makes the prompt slow. `starship timings` shows it.
8. **Do not print secrets** — `env_var` and custom modules end up in screenshots and terminal recordings.
9. **When not to use** — Starship draws the prompt only; it does not provide completions, history search or syntax highlighting, and a shell framework theme should be switched off so the two do not fight over the prompt.
