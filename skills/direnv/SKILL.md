---
name: direnv
description: >-
  direnv loads and unloads environment variables automatically when you enter and leave a directory, using a per-project .envrc file. Use when a user asks to manage env vars per project, auto-switch configs, avoid manually sourcing .env files, set up .envrc, use dotenv with direnv, or pick a Python or Node version per directory.
license: Apache-2.0
compatibility: 'Linux, macOS, WSL; bash, zsh, fish, tcsh, elvish, nushell, PowerShell'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/direnv/direnv
  tags:
    - direnv
    - environment
    - dotenv
    - shell
    - config
---

# direnv

## Overview

direnv is a single static binary that hooks into your shell. When the current directory (or a parent) contains an `.envrc` file that you have approved, direnv runs it in a bash subprocess, captures the exported variables and applies them to your shell; when you leave the directory, they are unloaded. `.envrc` is plain bash plus a standard library of helpers (`dotenv`, `PATH_add`, `layout`, `use`, `source_up`, `watch_file`). Latest release at the time of writing: v2.37.1.

## Instructions

### Step 1: Install and hook into the shell

```bash
brew install direnv          # macOS / Linuxbrew
sudo apt install direnv      # Debian, Ubuntu
sudo dnf install direnv      # Fedora
nix profile install nixpkgs#direnv   # Nix
```

Then add the hook to the end of your shell's startup file (after anything that changes the prompt, such as starship or oh-my-posh) and open a new shell:

```bash
eval "$(direnv hook bash)"      # ~/.bashrc
eval "$(direnv hook zsh)"       # ~/.zshrc
direnv hook fish | source       # ~/.config/fish/config.fish
```

Other shells (tcsh, elvish, nushell, PowerShell, murex) are covered in the direnv hook docs. Without the hook nothing happens when you `cd`.

### Step 2: Write an .envrc and approve it

```bash
# ~/code/billing-api/.envrc
export NODE_ENV=development
export DATABASE_URL="postgresql://billing:billing@localhost:5432/billing_dev"
dotenv_if_exists .env.local     # secrets live here, not in .envrc
env_vars_required STRIPE_API_KEY   # log an error if it is missing or empty
PATH_add bin
PATH_add node_modules/.bin
```

```bash
direnv allow          # approve this exact file; required the first time and after every edit
direnv status         # shows the loaded .envrc and whether it is allowed
direnv reload         # re-run without leaving the directory
direnv deny           # revoke approval
```

Unapproved or changed `.envrc` files are blocked with an `is blocked. Run direnv allow` message, which is the main security feature: a cloned repository cannot run code in your shell until you allow it. Read an `.envrc` before allowing it.

### Step 3: Per-project toolchains

The standard library provides these (check `direnv stdlib` for the version you have):

```bash
layout python3        # creates and activates a virtualenv in .direnv/python-<version>
layout node           # adds node_modules/.bin to PATH
layout ruby           # sets GEM_HOME inside .direnv/
layout go             # sets GOPATH inside .direnv/ and adds ./bin to PATH
use node              # reads .nvmrc / .node-version; needs NODE_VERSIONS pointing at a folder of installed Node versions
use nix               # or: use flake
```

`use nvm`, `use asdf` and similar are not in the standard library. Define them in `~/.config/direnv/direnvrc` (a `use_<name>` function) or use `use node`, `use nix` or `use flake`. Add `watch_file` for any file whose change should trigger a reload (for example `watch_file .tool-versions`).

### Step 4: Share and layer configuration

```bash
# repo-root/.envrc (committed, contains no secrets)
export COMPOSE_PROJECT_NAME=billing
source_env_if_exists .envrc.local    # personal overrides, gitignored

# repo-root/services/worker/.envrc
source_up                             # inherit the parent .envrc first
export QUEUE_NAME=invoices
```

Global settings go in `~/.config/direnv/direnv.toml` (`[global]` keys such as `warn_timeout`, `hide_env_diff`, `load_dotenv`; `[whitelist]` with `prefix` to pre-approve trusted directories).

## Examples

### Example 1: Node project with a local database and secret key

**User request:** "Every time I cd into billing-api I want DATABASE_URL set and my Stripe test key loaded, without committing the key."

Create `.envrc` (commit it) and `.env.local` (gitignore it):

```bash
# .envrc
export DATABASE_URL="postgresql://billing:billing@localhost:5432/billing_dev"
dotenv_if_exists .env.local
env_vars_required STRIPE_API_KEY
PATH_add node_modules/.bin
```

```bash
echo ".env.local" >> .gitignore
echo 'STRIPE_API_KEY=sk_test_replace_me' > .env.local
direnv allow
```

Result: `cd billing-api` prints `direnv: loading ~/code/billing-api/.envrc` and `direnv export: +DATABASE_URL +STRIPE_API_KEY ~PATH`; `cd ..` prints `direnv: unloading` and the variables are gone.

### Example 2: Isolated Python environment per repository

**User request:** "Make a virtualenv that activates automatically when I enter the ml-pipeline folder."

```bash
cd ~/code/ml-pipeline
printf 'layout python3\nwatch_file requirements.txt\n' > .envrc
direnv allow
pip install -r requirements.txt     # installs into .direnv/python-3.12.x
```

Result: `which python` points into `~/code/ml-pipeline/.direnv/python-<version>/bin`, and leaving the folder restores the global interpreter. Add `.direnv/` to `.gitignore`.

## Guidelines

- Keep secrets out of a committed `.envrc`: load them from a gitignored file with `dotenv_if_exists`, or from a secret manager command run at load time. If an `.envrc` holds secrets, gitignore it and commit an `.envrc.example` instead.
- Always run `direnv allow` only after reading the file; the approval is tied to the file's path and content, so every edit needs a new `direnv allow`.
- `.envrc` variables are exported only to your interactive shell and its children; they are not seen by cron, systemd or IDE launchers started elsewhere. Use `direnv exec <dir> <command>` to run a command with a directory's environment.
- Aliases and shell functions cannot be exported from `.envrc`; put scripts in a `bin/` folder and use `PATH_add bin`.
- A slow `.envrc` slows every prompt; cache expensive work or raise `warn_timeout` instead of hiding the warning.
- Add `strict_env` at the top of an `.envrc` to fail fast on unset variables and failing commands.
- direnv does not replace container or CI configuration; use real environment variables or a secret store there.
