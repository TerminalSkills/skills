---
name: starship
category: Developer Tools
tags: [shell-prompt, terminal, customization, cross-shell, rust, productivity]
version: 1.0.0
author: terminal-skills
---

# Starship — Cross-Shell Prompt

You are an expert in Starship, the minimal, blazing-fast, and infinitely customizable prompt for any shell. You help developers configure Starship to display relevant context (git branch, language versions, cloud context, execution time) with beautiful formatting and zero lag.

## Core Capabilities

### Installation and Setup

```bash
# Install Starship
curl -sS https://starship.rs/install.sh | sh

# Add to shell
# Zsh:
echo 'eval "$(starship init zsh)"' >> ~/.zshrc
# Bash:
echo 'eval "$(starship init bash)"' >> ~/.bashrc
# Fish:
echo 'starship init fish | source' >> ~/.config/fish/config.fish
```

### Configuration

```toml
# ~/.config/starship.toml — Full prompt configuration

# General settings
format = """
$username$hostname$directory$git_branch$git_status$git_metrics\
$nodejs$python$rust$golang$docker_context$kubernetes\
$cmd_duration$line_break$character"""

# Don't add a blank line between prompts
add_newline = false

# Prompt character (shows error status)
[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
vimcmd_symbol = "[❮](bold purple)"    # Vim normal mode indicator

# Directory — show truncated path
[directory]
truncation_length = 3
truncation_symbol = "…/"
home_symbol = "~"
style = "bold cyan"
# Repo root gets special treatment
repo_root_style = "bold cyan"
repo_root_format = "[$before_root_path]($before_repo_root_style)[$repo_root]($repo_root_style)[$path]($style) "

# Git branch
[git_branch]
format = "[$symbol$branch(:$remote_branch)]($style) "
symbol = " "
style = "bold purple"
truncation_length = 20

# Git status — show changed/staged/untracked counts
[git_status]
format = '([\[$all_status$ahead_behind\]]($style) )'
style = "bold red"
conflicted = "⚡${count}"
ahead = "⬆${count}"
behind = "⬇${count}"
diverged = "⬆${ahead_count}⬇${behind_count}"
untracked = "?${count}"
stashed = "📦${count}"
modified = "!${count}"
staged = "+${count}"
deleted = "✘${count}"

# Git metrics — lines added/removed
[git_metrics]
disabled = false
format = "([+$added]($added_style) )([-$deleted]($deleted_style) )"
added_style = "bold green"
deleted_style = "bold red"

# Node.js version
[nodejs]
format = "[$symbol($version)]($style) "
symbol = " "
style = "bold green"
detect_files = ["package.json", ".nvmrc"]

# Python version and virtualenv
[python]
format = '[$symbol${pyenv_prefix}(${version})(\($virtualenv\))]($style) '
symbol = "🐍 "
style = "bold yellow"

# Rust version
[rust]
format = "[$symbol($version)]($style) "
symbol = "🦀 "
style = "bold red"

# Go version
[golang]
format = "[$symbol($version)]($style) "
symbol = " "
style = "bold cyan"

# Docker context
[docker_context]
format = "[$symbol$context]($style) "
symbol = "🐳 "
style = "bold blue"
only_with_files = true
detect_files = ["docker-compose.yml", "Dockerfile"]

# Kubernetes context
[kubernetes]
disabled = false
format = '[$symbol$context(\($namespace\))]($style) '
symbol = "☸ "
style = "bold blue"
# Only show for specific contexts
[kubernetes.context_aliases]
"arn:aws:eks:*:*:cluster/prod-*" = "PROD"
"arn:aws:eks:*:*:cluster/staging-*" = "staging"

# Command execution time (show if > 2 seconds)
[cmd_duration]
min_time = 2_000                # Show for commands > 2s
format = "[$duration]($style) "
style = "bold yellow"
show_notifications = true       # Desktop notification for long commands
min_time_to_notify = 30_000     # Notify if > 30 seconds

# Cloud context
[aws]
format = '[$symbol($profile)(\($region\))]($style) '
symbol = "☁️ "
style = "bold orange"
[aws.profile_aliases]
prod = "⚠️ PROD"

[gcloud]
format = '[$symbol$account(@$domain)(\($project\))]($style) '
symbol = "☁️ "

# Username and hostname (for SSH sessions)
[username]
show_always = false             # Only show in SSH sessions
format = "[$user]($style)@"
style_user = "bold blue"

[hostname]
ssh_only = true
format = "[$hostname]($style) "
style = "bold green"

# Custom module — show when in a specific directory
[custom.project]
command = "cat .project-name 2>/dev/null"
when = "test -f .project-name"
format = "[🏗 $output]($style) "
style = "bold white"

# Package version from package.json
[package]
format = "[$symbol$version]($style) "
symbol = "📦 "
style = "bold 208"              # Orange
```

### Preset Configurations

```bash
# Apply a built-in preset
starship preset nerd-font-symbols -o ~/.config/starship.toml
starship preset tokyo-night -o ~/.config/starship.toml
starship preset gruvbox-rainbow -o ~/.config/starship.toml
starship preset pastel-powerline -o ~/.config/starship.toml

# List all presets
starship preset --list
```

### Minimal Configuration for Speed

```toml
# ~/.config/starship.toml — Minimal, fast prompt
format = "$directory$git_branch$git_status$character"
add_newline = false

[character]
success_symbol = "[❯](green)"
error_symbol = "[❯](red)"

[directory]
truncation_length = 2

[git_branch]
format = "[$branch]($style) "
style = "purple"

[git_status]
format = '[$all_status]($style)'
style = "red"
```

## Best Practices

1. **Start minimal, add modules** — Begin with a minimal config; add modules as you need context (don't show everything)
2. **Disable unused modules** — Starship scans for language files by default; disable modules you don't use with `disabled = true`
3. **Use Nerd Fonts** — Install a Nerd Font for proper icons; without it, use text fallbacks
4. **Truncate directory paths** — `truncation_length = 3` keeps the prompt short; show the full path in your terminal title instead
5. **Notification for long commands** — `show_notifications = true` with `min_time_to_notify = 30_000` alerts you when builds finish
6. **Cloud context aliases** — Alias long AWS/GCP profile names to short labels; highlight prod with ⚠️
7. **Git metrics for awareness** — Seeing +/- line counts helps gauge how big your uncommitted changes are
8. **Custom modules for projects** — Use `[custom.*]` modules to show project-specific context (sprint, environment, feature flag)
