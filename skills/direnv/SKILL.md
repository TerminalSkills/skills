---
name: direnv
description: >-
  Auto-load environment variables per directory with direnv. Use when a user asks to manage env vars per project, auto-switch configs between projects, or avoid manual .env loading.
license: Apache-2.0
compatibility: 'Linux, macOS, WSL'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - direnv
    - environment
    - dotenv
    - shell
    - config
---

# direnv

## Overview
direnv automatically loads/unloads environment variables when you cd into a directory. No more source .env — enter the project folder and variables are set.

## Instructions

### Step 1: Install
```bash
brew install direnv
# Add to .bashrc or .zshrc:
eval "$(direnv hook bash)"
```

### Step 2: Configure
```bash
# .envrc — Auto-loaded when entering directory
export DATABASE_URL="postgresql://localhost:5432/myapp"
export API_KEY="sk-dev-key-123"
export NODE_ENV="development"
dotenv .env
PATH_add bin
PATH_add node_modules/.bin
```

```bash
direnv allow    # required first time and after changes
```

### Step 3: Per-Project Layouts
```bash
# .envrc — Use specific versions
use nvm 20
layout python3
```

## Guidelines
- Always add .envrc to .gitignore — it contains secrets.
- Use .envrc.example (committed) as template.
- direnv unloads vars when you leave the directory — no env pollution.
