---
name: lefthook
description: >-
  Fast Git hooks manager written in Go. Use when a user asks to set up Git hooks without Node.js dependency, run parallel pre-commit checks, or find a faster alternative to Husky.
license: Apache-2.0
compatibility: 'Any Git repository, any language; installs via npm, Homebrew, Go, gem or pipx'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/evilmartians/lefthook
  tags:
    - lefthook
    - git-hooks
    - pre-commit
    - lint
    - go
---

# Lefthook

## Overview
Lefthook is a fast, polyglot Git hooks manager distributed as a single Go binary (current major version: 2.x). It does not need Node.js — you can install it with npm, Homebrew, Go, RubyGems or pipx — and it runs hook tasks in parallel, filters files by glob, and reads its settings from a YAML file in the repository root.

## Instructions

### Step 1: Install
```bash
# Node projects: dev dependency (the package downloads the right binary)
npm install --save-dev lefthook
# pnpm: pnpm add -D lefthook  (then allow its build script, see Guidelines)

# Any project
brew install lefthook
go install github.com/evilmartians/lefthook/v2@latest
gem install lefthook
pipx install lefthook
```

Write the config (Step 2), then install the hooks into `.git/hooks`:
```bash
npx lefthook install      # or: lefthook install
```
If `lefthook.yml` does not exist yet, `lefthook install` creates an empty one.

### Step 2: Configure
Config lives in `lefthook.yml` (also accepted: `.lefthook.yml`, `.config/lefthook.yml`, and `.yaml`, `.toml`, `.json`, `.jsonc` variants — keep only one file per project). The current format is a `jobs` list under each hook; the older `commands` map still works.

```yaml
# lefthook.yml — Git hooks configuration
pre-commit:
  parallel: true
  jobs:
    - name: lint
      glob: "*.{ts,tsx,js,jsx}"
      run: npx eslint --fix {staged_files}
      stage_fixed: true
    - name: format
      glob: "*.{ts,tsx,js,jsx,css,md,json}"
      run: npx prettier --write {staged_files}
      stage_fixed: true
    - name: typecheck
      run: npx tsc --noEmit

pre-push:
  jobs:
    - name: test
      run: npm test

commit-msg:
  jobs:
    - name: commitlint
      run: npx commitlint --edit {1}
```

Parallel jobs that rewrite the same files can race; if lint and format both modify files, drop `parallel: true` and list them in order (see Example 2).

### Step 3: Check and run
```bash
npx lefthook validate           # check the config for errors
npx lefthook run pre-commit     # run a hook by hand, without committing
npx lefthook dump               # print the final merged config
LEFTHOOK=0 git commit -m "wip"  # skip hooks once (LEFTHOOK_VERBOSE=1 for detail)
```

## Examples

### Example 1: Replace Husky in a Node project
**Request:** "Move our repo from Husky + lint-staged to lefthook."

```bash
npm uninstall husky lint-staged
npm install --save-dev lefthook
```
Delete the `.husky/` folder and the `lint-staged` block from `package.json`, add the `lefthook.yml` from Step 2, then run `npx lefthook install`. Check it with `npx lefthook run pre-commit`: it lists each job with its result, and exits non-zero if any job fails.

### Example 2: Python and Go monorepo without Node
**Request:** "Add pre-commit checks for our Python API and Go worker, but only on changed files."

```yaml
# lefthook.yml
pre-commit:
  jobs:
    - name: ruff
      root: "api/"
      glob: "*.py"
      run: ruff check --fix {staged_files}
      stage_fixed: true
    - name: gofmt
      root: "worker/"
      glob: "*.go"
      run: gofmt -l -w {staged_files}
      stage_fixed: true
```
```bash
brew install lefthook && lefthook install
```
Committing a change that touches only `worker/*.go` runs only the `gofmt` job; the `ruff` job is skipped because no file matches its glob.

## Guidelines
- `{staged_files}` expands to the files staged for the commit, `{push_files}` to the files in the push, `{all_files}` to every tracked file, and `{1}` to the hook's first argument (the commit-message file in `commit-msg`). Use `glob` and `root` to narrow them; no lint-staged needed.
- `stage_fixed: true` re-adds files a formatter changed, so fixes land in the same commit.
- Hooks are installed per clone. With the npm package, installing dependencies runs `lefthook install` for you; with pnpm you must allow the build script (add `lefthook` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`), otherwise no hooks are installed. With other install methods, tell contributors to run `lefthook install`.
- Personal overrides go in `lefthook-local.yml` (add it to `.gitignore`); it can also be used without a main config.
- `lefthook run` and `lefthook validate` need a Git repository; outside one they exit with "not a git repository".
- Keep pre-commit fast (lint and format on changed files); put slow test suites on `pre-push` or in CI, because `LEFTHOOK=0` and `git commit --no-verify` can bypass local hooks.
