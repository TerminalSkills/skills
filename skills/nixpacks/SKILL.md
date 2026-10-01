---
name: nixpacks
description: >-
  Nixpacks builds a container image from an application's source directory
  without a Dockerfile: it detects the language, installs dependencies from Nix
  and produces an OCI image with Docker. The project is in maintenance mode and
  its maintainers recommend Railpack for new work. Use when a user asks to
  build an image with Nixpacks, write or fix a nixpacks.toml, debug a Nixpacks
  build on Railway, Coolify or Dokploy, pin a Node or Python version for
  Nixpacks, add system packages such as ffmpeg to a Nixpacks build, or decide
  whether to move from Nixpacks to Railpack.
license: Apache-2.0
compatibility: Docker with BuildKit to build images; plan and Dockerfile generation work without Docker
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/railwayapp/nixpacks
  tags:
  - buildpacks
  - docker
  - deployment
  - ci-cd
  - nix
---

# Nixpacks — App Source to Docker Image

## Overview

Nixpacks takes a source directory and produces an OCI image: a provider detects the language, proposes Nix packages plus install, build and start commands, and Nixpacks generates a Dockerfile and builds it with Docker BuildKit. It was created by Railway and is still offered as a builder by self-hosted platforms such as Coolify and Dokploy.

**Status: maintenance mode.** Since September 2025 the README states that Nixpacks is not under active development and recommends [Railpack](https://github.com/railwayapp/railpack) as the replacement. The last release is v1.41.0 (October 2025). Existing builds keep working, but language versions are frozen at what that release knows (Node up to 24, Python up to 3.13, Go up to 1.23). Use this skill to maintain existing Nixpacks builds; for a new project start with Railpack or a Dockerfile.

## Instructions

### Install

```bash
brew install nixpacks        # macOS
cargo install nixpacks       # any platform with a Rust toolchain
scoop install nixpacks       # Windows (the Scoop bucket still ships 1.39.0, which lacks Node 24)

nixpacks --version           # nixpacks 1.41.0 from Homebrew, cargo or the .deb
```

On Debian or Ubuntu install the `.deb` from the release page and check it against the SHA-256 that GitHub shows next to the asset:

```bash
curl -fsSLO https://github.com/railwayapp/nixpacks/releases/download/v1.41.0/nixpacks-v1.41.0-amd64.deb
echo "995aa2e3cc2986d069e2f7dc19e111d005c48b98bc90eaccec97f001267d8437  nixpacks-v1.41.0-amd64.deb" | sha256sum --check
sudo dpkg -i nixpacks-v1.41.0-amd64.deb
```

### Inspect before building

```bash
nixpacks detect ./invoice-api                 # prints the matched providers, e.g. "node"
nixpacks plan ./invoice-api --format toml     # full build plan; JSON is the default format
nixpacks build ./invoice-api --out ./nixpacks-out
# writes ./nixpacks-out/.nixpacks/Dockerfile and does not call Docker
```

`plan` and `build --out` do not need Docker, so they are the fastest way to see what a platform will run.

### Build and run

```bash
nixpacks build ./invoice-api --name invoice-api
docker run --rm -p 3000:3000 -e PORT=3000 invoice-api
```

Useful `build` flags (`plan` accepts the first four rows too):

| Flag | Purpose |
|------|---------|
| `-i, --install-cmd`, `-b, --build-cmd`, `-s, --start-cmd` | Override one phase command |
| `-p, --pkgs`, `-a, --apt`, `--libs` | Add Nix packages, apt packages, Nix libraries |
| `-e, --env KEY=value` | Set a variable; `--env KEY` copies it from the current shell |
| `-c, --config` | Path to a config file other than `nixpacks.toml` |
| `-n, --name`, `-t, --tag`, `-l, --label` | Image name, extra tags, labels |
| `--platform linux/arm64` | Target platform |
| `--no-cache`, `--cache-key`, `--cache-from`, `--inline-cache` | Cache control |

### nixpacks.toml

Put `nixpacks.toml` (or `nixpacks.json`) in the app root. It is merged over the provider's plan; precedence is provider, then file, then environment variables, then CLI flags.

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["...", "ffmpeg"]          # "..." keeps the provider's packages
aptPkgs = ["...", "libvips-dev"]

[phases.build]
cmds = ["npx prisma generate", "..."]   # run before the provider's build command

[start]
cmd = "node dist/server.js"

[variables]
NEXT_TELEMETRY_DISABLED = "1"
```

An array without `"..."` **replaces** the provider's value. `nixPkgs = ["ffmpeg"]` on a Node app removes `nodejs` from the image and the build then fails at `npm ci`.

Keys available in any `[phases.<name>]` table: `cmds`, `nixPkgs`, `nixLibs`, `aptPkgs`, `nixOverlays`, `nixpkgsArchive`, `dependsOn`, `cacheDirectories`, `onlyIncludeFiles`, `paths`. Top-level keys: `providers`, `buildImage`, `[variables]`, `[staticAssets]`. `[start]` takes `cmd`, `runImage`, `onlyIncludeFiles`. Unknown keys are ignored without a warning, so a typo silently does nothing.

Extra phases are allowed and ordered with `dependsOn`: define `[phases.lint]` with `cmds = ["npm run lint"]` and `dependsOn = ["install"]`, then add `dependsOn = ["...", "lint"]` under `[phases.build]`.

### Pin language versions

There is no version key in `nixpacks.toml`. Versions come from project files or from provider variables:

| Provider | Default | Set it with |
|----------|---------|-------------|
| Node | 18 | `engines.node` in `package.json`, `.nvmrc`, or `NIXPACKS_NODE_VERSION` (major only: 16, 18, 20, 22, 24; any other major, including 23, silently falls back to 18) |
| Python | 3.11 | `.python-version`, `runtime.txt`, `.tool-versions`, or `NIXPACKS_PYTHON_VERSION` (2.7, 3.8–3.13) |
| Go | 1.22 | the `go` line in `go.mod` (1.18–1.23) |
| Java | JDK 17 | `NIXPACKS_JDK_VERSION` (8, 11, 17, 19, 20, 21) |
| PHP | 8.3 | the `php` constraint in `composer.json` (8.1–8.4) |

Provider variables must reach Nixpacks as build variables: pass `--env NIXPACKS_NODE_VERSION=22` on the CLI, put them in `[variables]`, or set them as service variables on the hosting platform. Exporting them in the shell is not enough.

```bash
nixpacks plan ./invoice-api --format toml --env NIXPACKS_NODE_VERSION=22 | grep nodejs
#     'nodejs_22',
```

### More than one language

Only one provider is auto-detected: a repository with both `package.json` and `requirements.txt` is built as Node and the Python dependencies are never installed. Add the second provider explicitly:

```toml
# nixpacks.toml — Node app that also runs a Python report script at build time
providers = ["...", "python"]

[phases.build]
cmds = ["...", "python scripts/build_reports.py"]

[start]
cmd = "node server.js"
```

The second provider's phases appear in the plan as `python:setup` and `python:install`. Only one process starts: a `Procfile` (`web:` first, then `worker:`) or `[start].cmd` decides which. A `release:` line in the Procfile becomes an extra phase that runs after the build.

### Detection

| Provider | Detected by |
|----------|-------------|
| Node | `package.json` (npm, Yarn, pnpm or Bun chosen from `packageManager` or the lockfile) |
| Python | `main.py`, `requirements.txt`, `pyproject.toml` or `Pipfile` |
| Go | `main.go` or `go.mod` |
| Rust | `Cargo.toml` |
| Ruby | `Gemfile` |
| PHP | `composer.json` or `index.php` |
| Java | `pom.xml` (and other `pom.*` variants) or `gradlew` |
| Static files | `Staticfile`, `index.html`, or a `public/`, `dist/` or `index/` directory — served by NGINX |

Elixir (`mix.exs`), Deno (`deno.json`), C# (`*.csproj`), Clojure, COBOL, Crystal, Dart, F#, Gleam, Haskell, Scala, Scheme, Swift and Zig also have providers.

### Environment variables

| Variable | Effect |
|----------|--------|
| `NIXPACKS_INSTALL_CMD`, `NIXPACKS_BUILD_CMD`, `NIXPACKS_START_CMD` | Override a phase command |
| `NIXPACKS_PKGS`, `NIXPACKS_APT_PKGS`, `NIXPACKS_LIBS` | Extra packages |
| `NIXPACKS_INSTALL_CACHE_DIRS`, `NIXPACKS_BUILD_CACHE_DIRS` | Extra cached directories |
| `NIXPACKS_NO_CACHE` | Disable the build cache |
| `NIXPACKS_CONFIG_FILE` | Config file path relative to the app root |
| `NIXPACKS_DEBIAN` | Use the Debian base image (for OpenSSL 1.1) |

This is how builds are configured on Railway, Coolify and Dokploy, where the CLI flags are not exposed: set these as service variables or commit a `nixpacks.toml`.

### GitHub Actions

```yaml
# .github/workflows/image.yml
name: Build image
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Install Nixpacks 1.41.0
        run: |
          curl -fsSLO https://github.com/railwayapp/nixpacks/releases/download/v1.41.0/nixpacks-v1.41.0-amd64.deb
          echo "995aa2e3cc2986d069e2f7dc19e111d005c48b98bc90eaccec97f001267d8437  nixpacks-v1.41.0-amd64.deb" | sha256sum --check
          sudo dpkg -i nixpacks-v1.41.0-amd64.deb

      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build and push
        run: |
          nixpacks build . --name ghcr.io/${{ github.repository }}:${{ github.sha }}
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
```

`github.repository` must be lowercase for GHCR. For multi-architecture images run one build per `--platform` and join them with `docker manifest`.

### Moving to Railpack

Railpack is a separate tool with its own CLI and config, not a drop-in upgrade: it builds through BuildKit directly (`BUILDKIT_HOST` must point at a BuildKit instance), is configured with `railpack.json` and `RAILPACK_*` variables, and installs language runtimes with Mise instead of Nix. `nixpacks.toml` is not read by Railpack. Its documentation is at https://railpack.com.

## Examples

### Example 1: Add ffmpeg to a Node service that deploys with Nixpacks

**User request:** "My Express API on Coolify uses Nixpacks. It needs ffmpeg and Node 22, and the build should run `prisma generate` first."

Add `"engines": { "node": "22" }` to `package.json`, then create the config:

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["...", "ffmpeg"]

[phases.build]
cmds = ["npx prisma generate", "..."]

[start]
cmd = "node dist/server.js"
```

Check the result locally before pushing:

```bash
nixpacks plan . --format toml
```

The relevant part of the output:

```toml
[phases.build]
dependsOn = ['install']
cmds = [
    'npx prisma generate',
    'npm run build',
]

[phases.setup]
nixPkgs = [
    'nodejs_22',
    'npm-9_x',
    'openssl',
    'ffmpeg',
]
```

`nodejs_22` and `ffmpeg` are both listed, so the config is correct (`openssl` is added by the Node provider whenever `package.json` or the lockfile mentions `prisma`). Commit `nixpacks.toml` and `package.json`; Coolify picks the file up on the next deploy.

### Example 2: A Django build that picks the wrong Python version

**User request:** "Nixpacks builds my Django app with Python 3.11 but I need 3.12. I put pythonVersion in nixpacks.toml and nothing changed."

`pythonVersion` is not a Nixpacks key, and unknown keys are ignored. Remove it and pin the version with a file the Python provider reads:

```bash
echo "3.12" > .python-version
nixpacks plan . --format toml | grep -A4 'phases.setup'
```

```toml
[phases.setup]
nixPkgs = [
    'python312',
    'postgresql_16.dev',
    'gcc',
```

The plan now shows `python312` (`postgresql_16.dev` is added automatically because `psycopg2` is in `requirements.txt`). The detected start command is `python manage.py migrate && gunicorn reports.wsgi`; override it only to add options such as a worker count:

```toml
# nixpacks.toml
[start]
cmd = "python manage.py migrate && gunicorn reports.wsgi:application --bind 0.0.0.0:$PORT --workers 4"
```

## Guidelines

- Say plainly that Nixpacks is in maintenance mode when a user is choosing a build tool. Recommend it only for keeping an existing build working; new projects should use Railpack or a Dockerfile.
- Run `nixpacks plan . --format toml` after every config change. It is instant, needs no Docker, and shows exactly which packages and commands will run.
- Always include `"..."` when adding to `nixPkgs`, `aptPkgs`, `nixLibs`, `cmds` or `providers`. Leaving it out is the most common cause of "command not found" in a Nixpacks build.
- Pin the Node version. The default is still Node 18, which is past end of life.
- Do not pass secrets with `--env` or `[variables]`: every variable becomes an `ENV` line in the generated Dockerfile and stays in the final image. Give secrets to the container at run time.
- Images are large — a ten-line Node server builds to roughly 950 MB — because the build image and the Nix store ship in the result. Set `[start].runImage` with `onlyIncludeFiles` to copy only the built artifact into a smaller runtime image; this works best for static binaries (Go, Rust).
- Cached directories (`~/.npm`, `~/.cache/pip`, `node_modules/.cache`) are restored for the install and build phases and never appear in the final image. The cache key is a hash of the app's absolute path; use `--cache-key` in CI where the path changes.
- Prefer `nixPkgs` over `aptPkgs` when the package exists at https://search.nixos.org/packages. Use `nixLibs` for shared libraries that must be on `LD_LIBRARY_PATH`.
- Install from a package manager or a checksum-verified release asset rather than the install script on nixpacks.com.
