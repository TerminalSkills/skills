---
name: dagger
description: >-
  Write CI/CD pipelines as code with Dagger — portable, cacheable, container-based
  pipelines that run locally and in any CI system. Use when someone asks to
  "write CI pipeline in TypeScript", "portable CI/CD", "run GitHub Actions
  locally", "Dagger pipeline", "CI as code", "containerized build pipeline",
  or "test my CI locally before pushing". Covers Dagger SDK (TypeScript/Python),
  pipeline composition, caching, secrets, and multi-stage builds.
license: Apache-2.0
compatibility: "A container runtime (Docker) and the Dagger CLI. Modules in TypeScript, Python, Go and other SDKs."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/dagger/dagger
  category: devops
  tags: ["ci-cd", "containers", "pipelines", "dagger", "docker"]
---

# Dagger

## Overview

Dagger lets you write CI/CD pipelines in TypeScript, Python, or Go instead of YAML. Pipelines run in containers, are fully cacheable, and work identically on your laptop and in GitHub Actions/GitLab CI/Jenkins. No more "works in CI but not locally" — test your entire pipeline before pushing.

## When to Use

- Tired of debugging YAML-based CI configs by pushing commits
- Need to run the exact same pipeline locally and in CI
- Complex build pipelines that benefit from TypeScript/Python logic (conditionals, loops)
- Want container-level caching for build steps
- Multi-language monorepo where different projects need different pipelines

## Instructions

### Setup

```bash
# macOS / Linux with Homebrew
brew install dagger/tap/dagger

# Linux without Homebrew: download the release and verify its checksum first
VER=0.21.10
curl -fsSLO https://dl.dagger.io/dagger/releases/$VER/dagger_v${VER}_linux_amd64.tar.gz
curl -fsSL https://dl.dagger.io/dagger/releases/$VER/checksums.txt | grep linux_amd64 | sha256sum -c -
tar -xzf dagger_v${VER}_linux_amd64.tar.gz dagger && mv dagger ~/.local/bin/

dagger version

# Create a module in your project (code goes to .dagger/)
dagger init --sdk=typescript --name=ci
dagger functions        # list what the module exposes
```

The CLI starts a Dagger Engine container on first use, so Docker (or another supported container runtime) must be running. Latest release checked: v0.21.10 (2026-09-30). Docs also describe a 1.0 beta line; the code below targets the 0.21 TypeScript SDK.

### Basic Pipeline

```typescript
// .dagger/src/index.ts - CI pipeline for a Node.js project
import { dag, Container, Directory, Secret, argument, check, object, func } from "@dagger.io/dagger";

@object()
export class Ci {
  /** Base container with dependencies installed; the npm cache persists between runs. */
  @func()
  base(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist"] })
    source: Directory,
  ): Container {
    return dag
      .container()
      .from("node:22-slim")
      .withDirectory("/app", source)
      .withWorkdir("/app")
      .withMountedCache("/root/.npm", dag.cacheVolume("npm-cache"))
      .withExec(["npm", "ci"]);
  }

  /** Lint, test and build; `dagger check` runs every @check function. */
  @func()
  @check()
  async lint(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist"] })
    source: Directory,
  ): Promise<void> {
    await this.base(source).withExec(["npm", "run", "lint"]).sync();
  }

  @func()
  @check()
  async test(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist"] })
    source: Directory,
  ): Promise<void> {
    await this.base(source).withExec(["npm", "test"]).sync();
  }

  @func()
  build(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist"] })
    source: Directory,
  ): Directory {
    return this.base(source).withExec(["npm", "run", "build"]).directory("/app/dist");
  }

  /** Build and push a runtime image; returns the pushed reference. */
  @func()
  async publish(
    @argument({ defaultPath: "/", ignore: ["node_modules", ".git", "dist"] })
    source: Directory,
    address: string,
  ): Promise<string> {
    return dag
      .container()
      .from("node:22-slim")
      .withDirectory("/app", this.build(source))
      .withWorkdir("/app")
      .withEntrypoint(["node", "index.js"])
      .publish(address);
  }
}
```

`defaultPath: "/"` makes the project root the default, so `--source` can be omitted. Functions with no required arguments marked `@check()` are what `dagger check` runs (check support is in the 0.21 SDK; see the quickstart if your engine is older).

### Run Locally

```bash
dagger check                # run every @check function (lint + test)
dagger check -l             # list the checks
dagger call test            # run one function
dagger call build export --path=./dist
dagger call publish --address=ghcr.io/acme-labs/storefront:1.4.2
```

Registry credentials for `publish` come from `container.withRegistryAuth(address, username, secret)`; pass the token as a `Secret` argument, not a string.

### Pipeline with Services (Database)

```typescript
@func()
async integrationTest(
  @argument({ defaultPath: "/", ignore: ["node_modules", ".git"] })
  source: Directory,
): Promise<string> {
  const db = dag
    .container()
    .from("postgres:16")
    .withEnvVariable("POSTGRES_PASSWORD", "ci-only-password")
    .withEnvVariable("POSTGRES_DB", "storefront_test")
    .withExposedPort(5432)
    .asService({ useEntrypoint: true });   // run the image's own entrypoint

  return this.base(source)
    .withServiceBinding("db", db)          // reachable as host "db"
    .withEnvVariable("DATABASE_URL", "postgresql://postgres:ci-only-password@db:5432/storefront_test")
    .withExec(["npm", "run", "db:migrate"])
    .withExec(["npm", "run", "test:integration"])
    .stdout();
}
```

### Secrets

```typescript
// The Secret type keeps values out of image layers, logs and the cache.
@func()
async deploy(source: Directory, deployToken: Secret): Promise<string> {
  return this.base(source)
    .withSecretVariable("DEPLOY_TOKEN", deployToken)
    .withExec(["npm", "run", "deploy"])
    .stdout();
}
```

```bash
export DEPLOY_TOKEN=...                       # set in your shell or CI secret store
dagger call deploy --source=. --deploy-token=env://DEPLOY_TOKEN
```

Other providers: `file://`, `cmd://`, `op://` (1Password), `vault://`, `aws+sm://`. Argument names are kebab-cased on the CLI.

### GitHub Actions Integration

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dagger/dagger-for-github@v8.4.0
        with:
          call: test
          version: "0.21.10"
          cloud-token: ${{ secrets.DAGGER_CLOUD_TOKEN }}   # optional
```

Pin `version` to the engine you developed against; the action installs that CLI.

## Examples

### Example 1: Monorepo CI pipeline

**User prompt:** "I have a monorepo with a Next.js frontend and a Python backend. Set up a CI pipeline that tests both."

The agent will create a Dagger pipeline with separate functions for frontend (Node.js container, npm test) and backend (Python container, pytest), both running from the same module; `dagger check` runs them in parallel and a second run reuses cached layers.

### Example 2: Replace GitHub Actions with Dagger

**User prompt:** "My GitHub Actions workflow is 200 lines of YAML and I can't test it locally. Convert it to Dagger."

The agent runs `dagger init --sdk=typescript --name=ci`, translates each YAML step into a function (`lint`, `test`, `build`), mounts a cache volume for the package manager, and verifies with `dagger check`; each step prints in the TUI with a pass or fail mark, and a second run is served from cache.

## Guidelines

- **Run locally first** — `dagger check` / `dagger call` on your laptop before pushing to CI
- **Cache the package-manager cache, not node_modules** — `withMountedCache("/root/.npm", ...)`; a mounted node_modules hides what `npm ci` installed
- **Secrets via `Secret` type** — pass with `env://NAME`; never as plain string arguments or `withEnvVariable`
- **Narrow the source** — `defaultPath` plus `ignore` keeps `.git` and `node_modules` out of the upload and the cache key
- **Services for databases** — `asService()` + `withServiceBinding()` for Postgres/Redis in tests
- **Each `@func()` is independently callable** — design for composability
- **Container layers are cached** — order operations so rarely-changing steps come first
- **Dagger Cloud for team caching** — share build cache across CI runners
- **Use `withExec` for each command** — separate steps for better cache granularity
