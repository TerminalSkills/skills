---
name: semantic-release
description: >-
  Automates versioning and publishing: reads commit messages, picks the next semantic version, writes release notes and a changelog, tags the commit, publishes to npm and creates the GitHub release. Use when a user asks to automate npm publishing, set up semantic-release in GitHub Actions, generate a CHANGELOG, or stop bumping versions by hand.
license: Apache-2.0
compatibility: 'Node.js ^22.14 or >=24.10 on the release job (semantic-release 25), a Git repository on GitHub/GitLab, any CI'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "semantic-release, versioning, changelog, npm, ci-cd"
  repository: https://github.com/semantic-release/semantic-release
---

# semantic-release

## Overview
semantic-release runs in CI after every push to a release branch. It reads the commits since the last tag, decides the bump (major, minor, patch or none), generates release notes, tags the commit, publishes the package and creates the GitHub release. Version 25 requires Node `^22.14.0 || >=24.10.0` for the process that runs it; the code you publish can target any Node. The default branches are `main`, `master`, `next`, `next-major`, `beta`, `alpha` and maintenance branches like `1.x`.

## Instructions

### Step 1: Install
`@semantic-release/commit-analyzer`, `release-notes-generator`, `npm` and `github` are bundled with `semantic-release` and are the default plugins. Install only what you add:
```bash
npm install -D semantic-release @semantic-release/changelog @semantic-release/git
```

### Step 2: Configure
Plugin order matters: `changelog` must come before `npm` and `git`, and `git` after `npm`, so the release commit contains the new files.
```json
{
  "branches": ["main", { "name": "beta", "prerelease": true }],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/git", { "assets": ["CHANGELOG.md", "package.json"] }],
    "@semantic-release/github"
  ]
}
```
Save as `.releaserc.json`. Keep `"version": "0.0.0-development"` in `package.json`; the plugin writes the real version during the release. The git plugin commits as `chore(release): 1.4.0 [skip ci]` and pushes it.

### Step 3: Run it in CI
Trusted publishing (OIDC) needs no `NPM_TOKEN`: on npmjs.com add your repository and the workflow file name as a Trusted Publisher for the package, then give the job `id-token: write`. Provenance is attached automatically.
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write        # tags, release commit, GitHub release
      issues: write          # comments on released issues
      pull-requests: write
      id-token: write        # npm trusted publishing + provenance
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
      - run: npm ci
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
Do not set `registry-url` in `setup-node`: the `.npmrc` it writes conflicts with semantic-release's npm auth (`EINVALIDNPMTOKEN`). If you still publish with a classic token, add `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` to `env`. Pin the actions to the versions you use today.

### Step 4: Commit format
The default is the Angular convention:

| Commit | Release |
|---|---|
| `fix(parser): handle empty input` | patch |
| `perf(cache): avoid double read` | patch |
| `feat(cli): add --json flag` | minor |
| any type with a `BREAKING CHANGE: ...` footer | major |
| `docs:`, `chore:`, `refactor:` | none |

Enforce the format with commitlint and a commit-msg hook (husky or lefthook).

### Step 5: Preview locally
```bash
npx semantic-release --dry-run --no-ci
```
It prints the next version and notes without tagging or publishing. Locally it needs a pushed branch and the same plugins installed; `--no-ci` skips the CI-environment check.

## Examples

### Example 1: Ship the first 1.0.0 from a new library
Request: "Set up automatic npm releases for @northwind/date-utils."
After installing and adding the files above, merge `feat: add parseISODuration` to `main`. The run logs `The release type for the commit is minor`, `the next release version is 1.0.0`, creates tag `v1.0.0`, publishes, and pushes `chore(release): 1.0.0 [skip ci]` with `CHANGELOG.md` updated. The first release is always `1.0.0`; to start from an older line, tag the last commit `v0.9.0` first.

### Example 2: Beta channel for a risky change
Request: "Publish pre-releases from the next-gen branch."
Add `{ "name": "next-gen", "prerelease": "beta", "channel": "beta" }` to `branches` (without `channel` the dist-tag is the branch name, `next-gen`). Pushing a commit with a `BREAKING CHANGE:` footer there, when `1.x` is the stable line, publishes `2.0.0-beta.1` under the `beta` dist-tag, so `npm install pkg` still gets the stable version; `npm install pkg@beta` gets the pre-release.

## Guidelines
- `fetch-depth: 0` is mandatory: a shallow clone has no tags and semantic-release will think nothing was ever released.
- The built-in `GITHUB_TOKEN` cannot push the release commit to a protected branch; either skip `@semantic-release/git` (keep the version out of `package.json`, which is the recommended approach) or use a deploy key or app token.
- Releases cannot be undone: a published npm version is permanent. Use `--dry-run` before changing configuration.
- A squash-merge uses the PR title as the commit message, so enforce the format on PR titles.
- For monorepos use a dedicated tool (for example `multi-semantic-release`) rather than this single-package setup.
- Do not use for packages that need human review before each release.
