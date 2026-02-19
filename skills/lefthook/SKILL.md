---
name: lefthook
description: >-
  Fast Git hooks manager written in Go. Use when a user asks to set up Git hooks without Node.js dependency, run parallel pre-commit checks, or find a faster alternative to Husky.
license: Apache-2.0
compatibility: 'Any Git repository, any language'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - lefthook
    - git-hooks
    - pre-commit
    - lint
    - go
---

# Lefthook

## Overview
Lefthook is a fast, polyglot Git hooks manager. Unlike Husky, it doesn't require Node.js — works with any language. Runs hooks in parallel, supports glob patterns, and configures via YAML.

## Instructions

### Step 1: Install
```bash
npm install -D lefthook
npx lefthook install
# Or: brew install lefthook
```

### Step 2: Configure
```yaml
# lefthook.yml — Git hooks configuration
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx,js,jsx}"
      run: npx eslint --fix {staged_files}
    format:
      glob: "*.{ts,tsx,js,jsx,css,md,json}"
      run: npx prettier --write {staged_files}
    typecheck:
      run: npx tsc --noEmit

pre-push:
  commands:
    test:
      run: npm test

commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
```

## Guidelines
- Lefthook runs commands in parallel by default — faster than sequential Husky hooks.
- {staged_files} placeholder only passes staged files — no need for lint-staged.
- Works in polyglot repos (Go, Python, Ruby) without Node.js dependency.
