---
name: moonrepo
description: >-
  Runs and caches tasks across a monorepo with moonrepo (moon): a Rust-based build system that reads
  the project dependency graph, orders tasks, skips unchanged work, pins toolchains such as Node.js
  and pnpm, and runs only affected tasks in CI. Use when someone asks to "manage a monorepo",
  "moonrepo", "task runner for monorepo", "faster than Turborepo", "build system with dependency
  graph", or "migrate from Turborepo". Covers moon v2 configuration, tasks, caching and CI.
license: Apache-2.0
compatibility: "Linux, macOS, Windows. moon 2.x (checked on 2.6.4); installs via npm or proto; a git repository."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["monorepo", "build-system", "moonrepo", "task-runner", "ci"]
  repository: https://github.com/moonrepo/moon
---

# moonrepo

## Overview

moon is a Rust-based monorepo tool and task runner. It builds a graph of projects and tasks, runs tasks in dependency order, caches results by content hash, installs pinned toolchains (Node.js, package managers, and others) through proto, and runs only what a change affects. It works for JavaScript, TypeScript, Rust, Go, Python and more.

This skill targets **moon v2** (v2.6.4 at the time of writing). v2 renamed many v1 settings; if a repository still has `.moon/toolchain.yml`, a `runner:` key, `type:` in a project file or `local: true` on a task, it is a v1 setup: run `moon migrate v2` and review the diff. All commands and configs below were run on 2.6.4 with a three-project repository.

## When to Use

- A repository with several apps and packages whose tasks depend on each other
- CI that rebuilds everything on each pull request
- A team that needs the same Node.js and package manager version everywhere

## Instructions

### Setup

```bash
npm install -D @moonrepo/cli    # or: pnpm add -D @moonrepo/cli
npx moon --version              # moon 2.6.4
npx moon init                   # interactive; --yes accepts defaults, --minimal writes less
```

Moon needs a git repository with at least one commit. With pnpm, also create `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`) and give each `package.json` the project's name: moon writes `dependsOn` projects into `package.json` as `workspace:*` dependencies, and the first run fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` without it.

`moon init` creates a `.moon/` folder. Commit it. Put `.moon/cache` and `.moon/docker` in `.gitignore`.

### Workspace configuration

```yaml
# .moon/workspace.yml
projects:
  - 'apps/*'
  - 'packages/*'

vcs:
  client: git            # was vcs.manager in v1
  defaultBranch: main

pipeline:                # was runner: in v1
  cacheLifetime: '7 days'

# defaultProject: 'web'  # lets `moon run build` work without a project prefix
```

### Toolchain pinning

```yaml
# .moon/toolchains.yml  (plural in v2; was toolchain.yml)
javascript:
  packageManager: pnpm   # package manager settings are top level now
node:
  version: '22.14.0'
pnpm:
  version: '10.6.0'
```

moon downloads proto and these exact versions on the first run, so every machine and CI job uses the same ones.

### Project configuration

```yaml
# packages/shared/moon.yml
layer: library            # was type: in v1
language: javascript
tasks:
  build:
    command: tsup
    inputs: ['src/**/*', 'tsup.config.ts']
    outputs: ['dist']
  test:
    command: vitest run
    inputs: ['src/**/*', 'tests/**/*']
```

```yaml
# apps/web/moon.yml
layer: application
language: typescript
dependsOn: ['ui', 'shared']     # project IDs, not paths
tasks:
  build:
    command: next build
    deps: ['ui:build']          # runs first; shared:build comes through ui
    inputs: ['src/**/*', 'package.json', 'next.config.js']
    outputs: ['.next']
  dev:
    command: next dev
    preset: server              # long-running; replaces local: true in v2
  lint:
    command: oxlint src/
    inputs: ['src/**/*']
  package:
    script: 'tar -czf dist.tgz .next && echo packed'   # pipes, &&, redirects need script
    deps: ['~:build']
```

v2 rules that bite:

- `command` is a plain executable with arguments. Pipes, `&&`, `;` and `KEY=value` prefixes go in `script`.
- Tasks run in a shell by default (bash on Unix, pwsh on Windows).
- `inferInputs` defaults to false, so declare `inputs` for caching to be accurate.
- `~:task` means "this project"; a bare `build` target needs `defaultProject`.
- To keep a task out of CI use `options: { runInCI: false }`.

### Running tasks

```bash
npx moon run web:build              # builds ui and shared first, then web
npx moon run :test                  # the test task in every project that has it
npx moonx web:build                 # shorthand binary shipped with the CLI
npx moon task web:dev               # show the resolved task (command, inputs, preset)
npx moon projects                   # table of projects and toolchains
npx moon run :build --affected --base main --head HEAD
```

Without `--base`/`--head`, `--affected` looks at uncommitted changes only; after committing it reports "No tasks affected". v2 considers only changed files; to also run dependents, pass both `--include-relations` (`-g`) and `--downstream deep` (either flag alone still runs only the changed project). There is no `--dryRun` flag in v2.

### CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # moon needs history to find the merge base
          filter: 'blob:none'
      - uses: moonrepo/setup-toolchain@v0
      - run: moon ci
```

`moon ci` finds the changed files against the base, picks the affected tasks, runs them in graph order, and honors `runInCI`. Split a big pipeline across runners with `--job 0 --job-total 3`.

## Examples

### Example 1: set up a monorepo

**User prompt:** "I have a Next.js app and two shared packages. Set up moon with caching and CI."

The agent installs `@moonrepo/cli`, writes `.moon/workspace.yml` and `.moon/toolchains.yml`, adds a `moon.yml` per project with `inputs`, `outputs` and `deps`, and adds the workflow above. Result of the second run:

```console
$ npx moon run web:build
▮▮▮▮ shared:build (cached, 07edd8ff)
▮▮▮▮ ui:build (cached, aa8adca7)
web:build | built-web
▮▮▮▮ web:build (cached, 59e76f94)

Tasks: 3 completed (3 cached)
```

### Example 2: migrate from Turborepo

**User prompt:** "Our Turborepo setup is getting complex. Move it to moonrepo."

The agent creates `.moon/extensions.yml` containing `migrate-turborepo: {}` (v2 requires built-in extensions to be enabled), then runs `npx moon ext migrate-turborepo`. It reads `turbo.json` and writes shared tasks to `.moon/tasks/node.yml`: turbo's `^build` becomes `deps: ['^:build']` (the build task of dependency projects), a same-package `build` dependency becomes `~:build`, and `outputs` become globs. The agent reviews the result, deletes `turbo.json`, and runs `moon run :build` twice to confirm the second run is cached.

## Guidelines

- Declare `inputs` and `outputs` on every cacheable task: wrong inputs give stale cache hits, and missing outputs are not restored on a hit.
- Order tasks with `deps` (`'ui:build'`); relate projects with `dependsOn` (project IDs).
- Use `moon ci` in CI, not hand-written affected logic, and never use a shallow clone.
- Env vars in v2: `$VAR` becomes an empty string when unset, and `.env` values cannot be referenced from task `env`.
- Cache is keyed by content; the same inputs hit regardless of branch. Clear it with `moon clean`.
- moon downloads toolchains into proto's and moon's data directories (about 300 MB for Node plus npm); cache them in CI. `moon setup` installs them ahead of time.
- Tooling bypassing moon (running `next build` directly) skips caching and ordering: route team scripts through moon.
