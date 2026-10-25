---
name: changesets
description: >-
  Changesets manages versions and changelogs for JavaScript/TypeScript packages and monorepos with small markdown files committed alongside code changes. Use when automating semantic versioning, generating changelogs from PRs,
  coordinating multi-package releases, or publishing to npm. Trigger words: changesets,
  versioning, changelog, npm publish, monorepo release, semver.
license: Apache-2.0
compatibility: "@changesets/cli 3.x: Node.js ^22.11 || ^24 || >=26; npm >= 10.9, pnpm >= 10 or Yarn >= 4.5 (Yarn Classic is no longer supported)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/changesets/changesets
  category: development
  tags: "changesets, versioning, changelog, monorepo, npm"
---

# Changesets

## Overview

Changesets is a versioning and changelog management tool for JavaScript/TypeScript monorepos. Developers add changeset files describing their changes, then CI consumes them to bump package versions, generate changelogs, and publish to npm with coordinated releases across interdependent packages.

## Instructions

- Install and initialize: `npm install -D @changesets/cli`, then `npx changeset init` (interactive; it asks whether to use the GitHub changelog integration) which creates `.changeset/config.json`. Set `"access": "public"` for public npm packages, `"baseBranch"` to your default branch, and for GitHub links in changelogs install `@changesets/changelog-github` and set `"changelog": ["@changesets/changelog-github", { "repo": "acme-corp/design-system" }]`.
- Add a change: `npx changeset` (pick packages, bump type, summary) writes a file such as `.changeset/swift-things-double.md`; commit it with the PR. Non-interactive form for scripts and agents: `npx changeset -m "Add retry option to the core client" --minor @acme/core` (also `--major`/`--patch`, comma-separated package lists, `--empty` for PRs that need no release).
- Version: `npx changeset version` consumes pending changesets, bumps `package.json` versions, rewrites changelogs, and patch-bumps internal dependents. Since v3 it exits with code 1 when there are no changesets, so a pipeline step fails instead of silently doing nothing.
- Publish: `npx changeset publish` publishes packages whose version is not on the registry yet and creates git tags (`--no-git-tag` to skip them, `--tag beta` for a dist-tag). Since v3 you can also split it: `changeset pack --out-dir ./tarballs` writes tarballs and `changeset publish --from-pack-dir ./tarballs` publishes them. `changeset status --since=main` lists what would be released and fails in CI when required changesets are missing.
- Automation: `changesets/action@v2` (the line compatible with CLI v3) opens or updates a "Version Packages" pull request and publishes when it is merged. Inputs are `publish-script` (the command that builds and publishes), `version-script`, `commit-message` and `github-token`; the job needs `contents: write` and `pull-requests: write` (plus `id-token: write` for npm trusted publishing), and the repository setting "Allow GitHub Actions to create and approve pull requests" must be on.
- Keeping packages in step: `fixed` groups always get the same version and are bumped together whenever one of them changes; `linked` groups share a version number only for the packages released together in a given release.
- Snapshots and pre-releases: `npx changeset version --snapshot preview` sets versions to `0.0.0-preview-<timestamp>`; publish them with `changeset publish --tag preview` so `latest` is untouched. For `-next.N` releases use `npx changeset pre enter next`, run version/publish as usual, and finish with `npx changeset pre exit`.

## Examples

### Example 1: Set up automated releases for a monorepo

**User request:** "Configure Changesets for automated versioning and publishing in my Turborepo monorepo"

```bash
npm install -D @changesets/cli @changesets/changelog-github
npx changeset init
```

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
  id-token: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - uses: changesets/action@v2
        with:
          publish-script: npm run release   # "release": "turbo build && changeset publish"
```

**Result:** every merge to `main` with pending changesets updates a "Version Packages" PR; merging that PR publishes the packages to npm and tags them.

### Example 2: Coordinate a breaking change across packages

**User request:** "Release a major version of @acme/core and make sure dependents are updated"

```console
$ npx changeset -m "Rename client options" --major @acme/core
$ npx changeset version
$ grep version packages/*/package.json
packages/cli/package.json:{"name":"@acme/cli","version":"1.0.1","dependencies":{"@acme/core":"^2.0.0"}}
packages/core/package.json:{"name":"@acme/core","version":"2.0.0"}
```

**Result:** core goes to 2.0.0, `@acme/cli` is patch-bumped to 1.0.1 with its dependency range moved to `^2.0.0`, and both changelogs list the change. If `@acme/cli` should also change its public API, add its own changeset with the right bump type.

## Guidelines

- Require a changeset on every PR that changes a published package; enforce it with `changeset status --since=main` in CI.
- Write summaries for users of the package ("Fixed button hover state"), not for maintainers ("Refactored CSS modules").
- A CI job that runs `changeset version` fails when nothing is pending (v3); guard it with `changeset status` or let `changesets/action` decide.
- Never publish a snapshot without `--tag`, or it can land on `latest`.
- Private packages are neither versioned nor tagged by default; set `privatePackages` to `true` in the config to opt in.
- `.changeset/config.json` lives in the repo root and is committed; the `format` option (`"auto"` by default, `false` to disable) controls how changesets and changelogs are formatted.
