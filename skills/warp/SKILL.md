---
name: warp
description: Warp is a terminal with command blocks and a built-in coding agent. Use this skill to write Warp Workflows (parameterized commands), share them through Warp Drive, set up themes, tab configs or launch configurations, and use blocks, notebooks and agent mode. Trigger words are warp terminal, warp workflow, warp drive, warp theme, launch configuration.
license: Apache-2.0
compatibility: macOS, Windows or Linux desktop; Warp account for Warp Drive sync and agents
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/warpdotdev/warp
  category: development
  tags:
  - terminal
  - cli
  - workflows
  - automation
  - ai
---

# Warp — Modern Terminal & Workflow Automation

## Overview

Warp is a terminal for macOS, Windows and Linux. Each command and its output form a Block you can select, copy and search on its own, and the input is a real text editor. Warp also ships a built-in agent (in the app, as the `warp` CLI, and as cloud agents) and runs third-party CLI agents such as Claude Code and Codex. The app is open source (AGPL v3, `warpdotdev/warp`). This skill covers the parts you configure with files: Workflows, Warp Drive, themes, tab configs and launch configurations. Checked against docs.warp.dev in October 2026; the `workflows` file format below is the legacy YAML format, which Warp says remains supported.

## Instructions

### Install

```bash
brew install --cask warp      # macOS
```

On Windows and Linux use the installer or package from warp.dev (the quickstart also lists WinGet and apt).

### Workflows

A workflow is a named command with `{{argument}}` placeholders. Argument names may use letters, digits, hyphens and underscores and cannot start with a digit. Create them in Warp Drive (cloud-synced, shareable with a team) or as YAML files; on macOS local YAML files go in `~/.warp/workflows/`. Open the workflow search with Ctrl+Shift+R. The community collection is at commands.dev (repo `warpdotdev/workflows`).

YAML fields: `name`, `command`, `description`, `arguments` (each with `name`, `description`, `default_value`), `tags`, `shells` (empty means all), `source_url`, `author`, `author_url`. The file format has no conditionals, so write one workflow per operation.

```yaml
# ~/.warp/workflows/deploy-service.yaml
name: Deploy Service
description: Build, push and roll out a service, then roll back if the health check fails
author: Platform Team
tags: [deploy, docker, kubernetes]
command: |-
  docker build -t {{registry}}/{{service_name}}:{{version}} . &&
  docker push {{registry}}/{{service_name}}:{{version}} &&
  kubectl set image deployment/{{service_name}} {{service_name}}={{registry}}/{{service_name}}:{{version}} -n {{namespace}} &&
  kubectl rollout status deployment/{{service_name}} -n {{namespace}} --timeout=300s ||
  (kubectl rollout undo deployment/{{service_name}} -n {{namespace}}; exit 1)
arguments:
  - name: service_name
    description: Deployment and image name
    default_value: billing-api
  - name: registry
    description: Container registry path
    default_value: ghcr.io/northwind-labs
  - name: version
    description: Image tag
    default_value: 2.14.0
  - name: namespace
    description: Kubernetes namespace
    default_value: production
```

```yaml
# ~/.warp/workflows/pg-backup.yaml
name: Postgres Backup
description: Dump a database in compressed custom format with a timestamped file name
tags: [database, postgres, backup]
command: |-
  pg_dump -h {{host}} -U {{user}} -d {{db_name}} --format=custom --compress=9 -f "backup_{{db_name}}_$(date +%Y%m%d_%H%M%S).dump"
arguments:
  - name: host
    description: Database host
    default_value: localhost
  - name: user
    description: Database role
    default_value: postgres
  - name: db_name
    description: Database to dump
    default_value: orders
```

```yaml
# ~/.warp/workflows/git-prune-merged.yaml
name: Delete Merged Local Branches
description: Fetch with prune, list branches merged into the base branch, delete them after confirmation
tags: [git, cleanup]
command: |-
  git fetch --prune &&
  git branch --merged {{base_branch}} | grep -v -e "{{base_branch}}" -e "^\*" &&
  read -p "Delete these branches? (y/n) " confirm &&
  [ "$confirm" = "y" ] && git branch --merged {{base_branch}} | grep -v -e "{{base_branch}}" -e "^\*" | xargs -r git branch -d
arguments:
  - name: base_branch
    description: Branch to compare against
    default_value: main
```

### Warp Drive

Warp Drive is the synced space for workflows, notebooks and other saved items; a team shares them there so nobody re-types a deploy command. Items created in the UI live in the cloud and need a Warp account. Treat Drive items as shared: never put tokens in a default value; read secrets from environment variables in the command.

### Notebooks

Notebooks are runnable documents in Warp Drive: Markdown plus shell code blocks. Run a block with Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux); `{{name}}` placeholders become arguments. Good for runbooks.

```markdown
# Database Maintenance Runbook

## 1. Check connections
`psql -c "SELECT count(*) FROM pg_stat_activity;"`

## 2. Vacuum a large table
`psql -c "VACUUM (VERBOSE, ANALYZE) {{table_name}};"`
```

### Custom Themes

Theme files are YAML. Directories: macOS `~/.warp/themes/`, Windows `%APPDATA%\warp\Warp\data\themes\`, Linux `${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/themes/`. Colors must be hex strings. `details` is `darker` or `lighter`; `cursor` is optional. Ready-made themes: `github.com/warpdotdev/themes`.

```yaml
# ~/.warp/themes/midnight-dev.yaml
name: Midnight Dev
accent: "#7c3aed"
background: "#0f172a"
foreground: "#e2e8f0"
details: darker
terminal_colors:
  normal:
    black: "#1e293b"
    red: "#ef4444"
    green: "#22c55e"
    yellow: "#eab308"
    blue: "#3b82f6"
    magenta: "#a855f7"
    cyan: "#06b6d4"
    white: "#f1f5f9"
  bright:
    black: "#475569"
    red: "#f87171"
    green: "#4ade80"
    yellow: "#facc15"
    blue: "#60a5fa"
    magenta: "#c084fc"
    cyan: "#22d3ee"
    white: "#f8fafc"
```

### Tab Configs

Tab Configs are the current way to open a saved tab layout; Warp marks Launch Configurations as legacy. They are TOML files in `~/.warp/tab_configs/` (macOS), `%APPDATA%\warp\Warp\data\tab_configs\` (Windows) or `${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/tab_configs/` (Linux). Create one from the `+` menu in the tab bar, by right-clicking a tab and choosing Save as new config, or by hand:

```toml
# ~/.warp/tab_configs/api-dev.toml
name = "API Dev"

[[panes]]
id = "main"
type = "terminal"
directory = "~/projects/billing-api"
commands = ["npm run dev"]
```

### Launch Configurations (legacy)

YAML files in `~/.warp/launch_configurations/` (macOS), `$env:APPDATA\warp\Warp\data\launch_configurations\` (Windows) or `${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/launch_configurations/` (Linux). `cwd` must be an absolute path: with `~` the file does not appear in the list.

```yaml
---
name: Full Stack Dev
windows:
  - tabs:
      - title: API
        layout:
          cwd: /Users/maria/projects/billing-api
        color: blue
        commands:
          - exec: npm run dev
      - title: Frontend
        layout:
          cwd: /Users/maria/projects/storefront
        commands:
          - exec: npm run dev
```

### Blocks, Agent and Editor

- Select recent blocks with Cmd+Up/Down (macOS) or Ctrl+Up/Down (Windows/Linux); add Shift to extend the selection. Failed commands show a red background; a sticky header keeps the command visible in long output.
- Shift+Enter inserts a newline in the input editor.
- Ctrl+Shift+Enter opens agent mode for natural-language requests. Outside the app, run `warp` for the Warp Agent CLI.

## Examples

### Example 1: Share a deploy command with the team

**User request:** "Turn our docker build, push and kubectl rollout into something the whole team can run."

Save the `Deploy Service` workflow above in Warp Drive (or in `~/.warp/workflows/` for local use). Press Ctrl+Shift+R, pick it, and Warp shows fields prefilled with `billing-api`, `ghcr.io/northwind-labs`, `2.14.0` and `production`; change the version and press Enter. The rollout status line prints `deployment "billing-api" successfully rolled out`, or the rollback runs.

### Example 2: Open the dev environment in one click

**User request:** "I want API and frontend dev servers in separate tabs when I start work."

Create two `[[panes]]` tab configs, or the launch configuration above with absolute `cwd` paths. It then appears under the `+` menu (tab configs) or the launch configuration palette, and each tab starts in its directory with `npm run dev` running.

## Guidelines

- Parameterize everything that changes between environments; give every argument a description and a realistic default.
- Keep destructive steps behind a confirmation (`read -p`) and never default an argument to a production target for a destructive operation.
- Use unique, consistent tags (`deploy`, `database`, `git`) for search.
- Warp's file locations differ per OS and between Stable and Preview builds; check the docs path for your platform before debugging a "missing" theme or config.
- Use Warp Drive for team items; keep a copy of important workflows in your repo.
- Command text typed in agent mode and Drive content may be synced or sent to model providers; do not paste secrets.
- Warp needs a desktop GUI; it is not for headless servers.
