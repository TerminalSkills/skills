---
name: just
description: >-
  just is a command runner that saves project commands in a justfile and runs them with `just <recipe>`, like make without the build-system baggage. Use when a user asks to define project commands, replace a Makefile, create a command runner, standardize dev scripts, add recipe arguments, load .env files, or split recipes into modules.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows; single Rust binary, any language'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "just, command-runner, makefile, tasks, automation"
  repository: https://github.com/casey/just
---

# just

## Overview
just is a command runner: recipes live in a file called `justfile` and run with `just <recipe>`. It does not track file timestamps like make, so there are no phony targets, no tab-vs-space tricks beyond consistent indentation, and recipes can take arguments. just searches the current directory and its parents for the justfile, and runs recipes from the justfile's directory. The latest release at the time of writing is 1.59.0 (October 2026).

## Instructions

### Step 1: Install
Use a package manager:
```bash
brew install just          # macOS / Linux
cargo install just         # any platform with Rust
sudo apt install just      # Debian 13+ / Ubuntu 24.04+
winget install Casey.Just  # Windows
```
Or download a release archive from https://github.com/casey/just/releases and check it against the `SHA256SUMS` file published with the release before unpacking. Check the install with `just --version`. `just --init` writes a starter justfile; `just --completions bash` (also zsh, fish) prints shell completions.

### Step 2: Write a justfile
```makefile
# justfile: project commands
set dotenv-load
set shell := ["bash", "-euo", "pipefail", "-c"]

registry := "ghcr.io/northwind"
version := `git describe --tags --always`
stage := env("DEPLOY_STAGE", "staging")

default:
    @{{ just_executable() }} --list

# Run the test suite; extra words are forwarded
test *args:
    npm test -- {{ args }}

dev:
    npm run dev

[confirm("Wipe and re-seed the local database?")]
db-reset: && db-migrate db-seed
    npx prisma migrate reset --force --skip-seed

db-migrate:
    npx prisma migrate deploy

db-seed:
    npx prisma db seed

# Build and push the image tagged with the current git version
image tag=version:
    docker build -t {{ registry }}/web:{{ tag }} .
    docker push {{ registry }}/web:{{ tag }}

deploy env=stage: (image version)
    echo "Deploying {{ version }} to {{ env }}"
    npx vercel deploy --target {{ env }}

[group('docker')]
up:
    docker compose up -d

[group('docker')]
logs service="app":
    docker compose logs -f {{ service }}
```
Notes on the syntax:
- Indent recipe lines consistently with spaces or tabs; mixing them is an error.
- `name arg="default"` gives an argument a default; `*args` takes zero or more words, `+args` one or more.
- `a: b c` runs dependencies first; `a: && b c` runs `b` and `c` after `a`; `(image version)` passes an argument to a dependency.
- `` `cmd` `` in an assignment captures command output; `env("NAME", "fallback")` reads an environment variable.
- A line starting with `@` (or a recipe named `@name:`) is not echoed before it runs.
- `set dotenv-load` loads `.env` from the justfile directory (or a parent) into the recipe environment.
- Each recipe line runs in its own shell. For multi-line scripts put `#!/usr/bin/env bash` as the first line of the recipe body, or mark it `[script]`.

### Step 3: Run it
```bash
just                     # first recipe (here: default, which lists recipes)
just test --watch        # arguments after the recipe name
just deploy production   # override the default
just --list              # recipes with doc comments; --unsorted keeps file order
just --show deploy       # print one recipe
just --dry-run deploy    # print commands without running
just --fmt               # reformat the justfile in place; --check only reports
just --choose            # pick a recipe interactively (needs fzf or a chooser)
just -f ops/justfile -d .   # explicit justfile and working directory
```

### Step 4: Attributes, modules and platforms
```makefile
mod docs                      # loads docs.just, docs/justfile or docs/mod.just
alias t := test

[linux]
open:
    xdg-open http://localhost:3000

[macos]
open:
    open http://localhost:3000

[working-directory: 'frontend']
build:
    npm run build

[private]
_clean-cache:
    rm -rf .cache
```
Run module recipes with `just docs build` or `just docs::build`. Recipes whose names start with `_` and recipes marked `[private]` are hidden from `--list`. `[confirm]` asks before running (answer `y`); `--yes` (or `JUST_YES=true`) skips the prompt, and `--dry-run` still asks, so a script or CI job that runs a confirmed recipe needs `--yes` or the process waits for input. `[parallel]` on a recipe runs its dependencies concurrently.

## Examples

### Example 1: Replace a Makefile in a Node project
Request: "Move our Makefile targets into something simpler and add a test recipe that takes flags."

Create the justfile with `dev`, `build` and `test *args:` recipes as above, then:
```console
$ just test --coverage
npm test -- --coverage
 PASS  src/cart.test.ts
$ just --list
Available recipes:
    build
    dev
    test *args # Run the test suite; extra words are forwarded
```
just prints each command before running it; prefix a line with `@` to silence it.

### Example 2: Deploy with a confirmation and a default environment
Request: "Make `just deploy` default to staging, and ask before touching production."

```makefile
[confirm("Deploy to production?")]
deploy-prod: (deploy "production")

deploy env="staging":
    ./scripts/deploy.sh {{ env }}
```
```console
$ just deploy
./scripts/deploy.sh staging
$ just deploy-prod
Deploy to production? y
./scripts/deploy.sh production
```

## Guidelines
- just is a command runner, not a build system: it never skips a recipe because files are up to date. Keep make, Ninja or Bazel for incremental builds.
- Call the same justfile from `default` with `@{{ just_executable() }} --list` rather than a bare `just`, so a recipe still works when just is not on `PATH` under that name.
- Interpolate arguments with `{{ arg }}` only inside shell-safe contexts; for untrusted values use `"{{ quote(arg) }}"` or `set positional-arguments` and `"$1"`.
- Put `set dotenv-load` only where a `.env` file exists and is gitignored; a recipe sees its variables as environment variables, not just just variables.
- Windows needs a shell: `set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]`, or use `[script]` recipes with an explicit interpreter.
- 1.59.0 requires Unicode (UTF-8) paths; non-Unicode file names now raise an error.
- Backtick assignments are evaluated whenever any recipe runs, so a failing one (for example `git describe` outside a repository) breaks every recipe; `--list` does not evaluate them.
- Run `just --fmt --check` in CI to keep the file formatted.
