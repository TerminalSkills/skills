---
name: husky
description: >-
  Runs scripts on Git hooks from a project's repository with Husky, so linters, formatters, tests and commit-message checks run before every commit or push. Use when a user asks to run linters before commit, validate commit messages, run tests before push, set up Git hooks for a team, or skip Husky hooks in CI.
license: Apache-2.0
compatibility: 'Any Git repository with Node.js 18 or newer (Husky 9). lint-staged 17 needs Node.js 22.22.1 or newer; lint-staged 16 needs 20.17 or newer.'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - husky
    - git-hooks
    - pre-commit
    - lint
    - ci
  repository: https://github.com/typicode/husky
---

# Husky

## Overview
Husky points Git at a `.husky/` folder of plain shell scripts that live in the repository, so every contributor gets the same hooks after `npm install`. Typical uses: run linters and formatters on staged files before a commit, validate commit messages, run tests before a push. The current release is Husky 9.1 (the latest at the time of writing, 9.1.7).

## Instructions

### Step 1: Install and initialize
```bash
npm install --save-dev husky lint-staged
npx husky init
```
`npx husky init` creates `.husky/pre-commit` (containing `npm test`) and adds `"prepare": "husky"` to `package.json`. The `prepare` script runs on every `npm install`, which is what activates the hooks for each teammate. Other package managers: `pnpm add --save-dev husky` then `pnpm exec husky init`; `bun add --dev husky` then `bunx husky init`.

Husky 9 hook files are plain commands: no shebang, no `. "$(dirname -- "$0")/_/husky.sh"` line, and no `npx` is needed in front of locally installed tools. If you migrate a v8 project, delete those two old lines and replace `"prepare": "husky install"` with `"prepare": "husky"`.

### Step 2: Pre-commit hook
```bash
# .husky/pre-commit
lint-staged
```

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,md,json}": ["prettier --write"]
  }
}
```
lint-staged passes only the staged files to each command and re-stages what the commands fixed.

### Step 3: Commit-message and pre-push hooks
```bash
# .husky/commit-msg  ($1 is the path of the file holding the message)
npx --no -- commitlint --edit $1
```

```bash
# .husky/pre-push
npm test
```
Any non-zero exit code aborts the Git operation.

### Step 4: Skip or disable hooks
```bash
git commit -m "wip: spike new parser" -n    # skip pre-commit and commit-msg for one commit
HUSKY=0 git push                            # disable Husky for one command
```
In CI or Docker, set `HUSKY=0` as an environment variable so `npm ci` does not install hooks. To disable for all projects (for example in a Git GUI), put `export HUSKY=0` in `~/.config/husky/init.sh`.

## Examples

### Example 1: "Run ESLint and Prettier on staged files before every commit"
```bash
npm install --save-dev husky lint-staged eslint prettier
npx husky init
echo "lint-staged" > .husky/pre-commit
```
Add the `lint-staged` block from Step 2 to `package.json`. Then stage a file with a lint error and run `git commit -m "feat: add invoice export"`: ESLint prints the error, the commit is aborted, and nothing is created. Fix the file, stage it again, and the commit goes through.

### Example 2: "The package.json is in frontend/ but the Git root is one level up"
```json
{
  "scripts": {
    "prepare": "cd .. && husky frontend/.husky"
  }
}
```
```bash
# frontend/.husky/pre-commit
cd frontend && npm test
```
Husky is told to use `frontend/.husky` as the hooks folder. Because Git runs hooks from the repository root, each hook changes into `frontend` first.

### Example 3: "My hook cannot find node (nvm)"
Git GUIs and some terminals do not load your shell profile. Put the version-manager setup in `~/.config/husky/init.sh`, which Husky sources before every hook:
```bash
# ~/.config/husky/init.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

## Guidelines
- Hooks are installed by the `prepare` script, so `npm install --ignore-scripts` leaves a clone without hooks. Never rely on hooks alone for enforcement: run the same checks in CI.
- Keep `pre-commit` fast (staged files only); put the full test suite in `pre-push` or CI.
- To try a hook without committing, temporarily add `exit 1` as its last line.
- For a hook written in another language, make the hook a one-liner such as `node .husky/pre-commit.js`.
- lint-staged 17 requires Node.js 22.22.1+; on older Node pin `lint-staged@16`.
- Husky does not modify `.git/hooks`: it sets `core.hooksPath` to `.husky/_`. If hooks silently do nothing, check `git config core.hooksPath` and that `prepare` ran.
- Hooks are not a security boundary: anyone can bypass them with `-n`.
