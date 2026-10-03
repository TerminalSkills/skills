---
name: mise
description: >-
  Manages per-project tool versions (Node.js, Python, Go, Rust, Ruby and hundreds more), environment variables and tasks from one mise.toml file, as a single binary that replaces nvm, pyenv, rbenv and asdf. Use when a user asks to pin Node.js/Python/Go versions per project, replace nvm/pyenv/asdf, share tool requirements with a team or CI, lock resolved versions, or define project tasks.
license: Apache-2.0
compatibility: "Linux (glibc 2.18+ or musl), macOS, Windows, WSL. Installs from Homebrew, apt, dnf, pacman, apk, Scoop, winget, cargo or a release binary."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - mise
    - version-manager
    - asdf
    - nvm
    - polyglot
  repository: https://github.com/jdx/mise
---

# mise

## Overview

mise (pronounced "meez", formerly rtx) is one command-line tool for three jobs: install and switch language and CLI tool versions per project (replacing nvm, pyenv, rbenv and asdf), set project environment variables, and run named tasks (replacing many Makefile and `package.json` script uses). Everything for a project lives in `mise.toml`. Releases are date-versioned (checked against 2026.10). It is written in Rust and ships as a single binary.

## Instructions

### Step 1: Install

Prefer your system package manager, so mise updates with everything else:

```bash
brew install mise                                   # macOS, Linux
sudo apt install -y extrepo && sudo extrepo enable mise \
  && sudo apt update && sudo apt install -y mise    # Debian 11+, Ubuntu 22.04+
sudo dnf copr enable jdxcode/mise && sudo dnf install mise   # Fedora 41+
sudo pacman -S mise                                 # Arch
apk add mise                                        # Alpine
scoop install mise                                  # Windows (or: winget install jdx.mise)
cargo binstall mise                                 # any platform with Rust
```

The official installer (`mise.run`) also exists, but do not pipe it into a shell: the docs describe downloading `install.sh.sig` and checking it with `gpg` against the release key first. Check with `mise --version`.

### Step 2: Try a tool without changing anything

```bash
mise exec node@24 -- node --version     # downloads Node.js 24 if needed, runs the command
```

### Step 3: Set up a project

```bash
cd ~/work/orders-api
mise use node@24 python@3.12           # installs both and writes them to mise.toml
```

```toml
# mise.toml
[tools]
node = "24"            # "24" means the newest 24.x, not an exact pin
python = "3.12"
go = "1.24"

[env]
DATABASE_URL = "postgresql://localhost:5432/orders"
NODE_ENV = "development"

[tasks.dev]
description = "Start the API in watch mode"
run = "npm run dev"

[tasks.test]
description = "Run unit tests"
depends = ["lint"]
run = ["npm test", "./scripts/test-e2e.sh"]   # an array runs in series

[tasks.lint]
run = "npm run lint"
```

```bash
mise install            # install everything declared (what a teammate runs after cloning)
mise run test           # runs lint first, then the test commands
mise tasks ls           # list tasks
mise ls --current       # which versions are active here
mise config ls          # which config files are in effect
```

`mise use --global node@24` writes a personal default to the global config instead. Project config overrides global.

### Step 4: Activate in your shell (optional)

Activation puts the selected tools on `PATH` whenever you `cd`. Add the line once, then restart the shell:

```bash
echo 'eval "$(mise activate bash)"' >> ~/.bashrc    # zsh: mise activate zsh >> ~/.zshrc
mise doctor                                          # verify the setup
```

For installs made with the standalone binary, use the full path `~/.local/bin/mise` inside the line. Editors and IDEs that do not read shell config can use shims (`mise activate --shims`). Without any activation, `mise exec -- cmd` and `mise run task` still load the project environment, which is the right choice in CI and scripts.

### Step 5: Lock versions for the team

```bash
mise lock               # record resolved versions and checksums in mise.lock
mise install --locked   # install exactly what the lockfile says
mise lock --bump node   # move one tool forward within its range
```

Commit `mise.toml` and `mise.lock`. Keep `package-lock.json` or `uv.lock` too; mise locks tools, not application dependencies.

### File tasks and existing version files

A script in `mise-tasks/` (or `.mise/tasks/`), made executable with `chmod +x`, becomes a task named after the file; metadata goes in comments such as `#MISE description="Build the CLI"`.

`.tool-versions` (asdf format) is read as before. Idiomatic files such as `.node-version`, `.python-version` and `.nvmrc` are off by default and enabled per tool:

```bash
mise settings add idiomatic_version_file_enable_tools node
mise settings add idiomatic_version_file_enable_tools python
```

## Examples

### Example 1: Replace nvm in an existing Node.js repository

Request: "This repo has an .nvmrc with 22; switch us from nvm to mise."

```bash
brew install mise
cd ~/work/storefront
mise use node@22          # writes [tools] node = "22" to mise.toml
mise exec -- node --version
```

Output ends with a `v22.x.y` line, and `mise.toml` appears in the repo. Remove the nvm lines from the shell rc file, add the `mise activate` line from step 4, and commit `mise.toml`. Teammates run `mise install` once.

### Example 2: A reproducible CI job

Request: "CI should use the same Go and Node versions as local development."

```bash
mise lock
git add mise.toml mise.lock && git commit -m "Pin tool versions"
```

In the pipeline, after installing mise from the runner's package manager:

```bash
mise install --locked
mise run test
```

`mise run` installs missing tools and loads `[env]` before running each task, so the job needs no separate setup steps. If `mise install --locked` fails with a missing entry, run `mise lock` locally and commit the updated file.

## Guidelines

- Review a project's `mise.toml` before trusting it: tasks, hooks and some `[env]` directives execute code. `mise trust` marks a reviewed config as trusted; in normal mode `mise install`, `exec` and `run` trust the active config automatically, while paranoid mode requires explicit trust.
- Put mise flags before the task name (`mise run --silent build`); flags after it go to the task.
- `node = "24"` follows new 24.x releases; use an exact version or `mise.lock` when builds must be reproducible.
- Keep mise itself current. Upstream registries change, and old releases lose working tool sources. `mise self-update` works for standalone installs; package-manager installs update through the package manager.
- Remove nvm, pyenv and asdf hooks from your shell rc file after switching, so two version managers do not compete for `PATH`.
- Tasks replace simple Makefile or `package.json` scripts, but for a large build graph a dedicated build tool is still the better choice.
