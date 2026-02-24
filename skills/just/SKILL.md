---
name: just
description: >-
  Run project commands with just (a modern make alternative). Use when a user asks to define project commands, replace Makefile, create a command runner, or standardize dev scripts.
license: Apache-2.0
compatibility: 'Any OS, any language'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - just
    - command-runner
    - makefile
    - tasks
    - automation
---

# just

## Overview
just is a command runner — like make but without the build system baggage. Define commands in a justfile, run with just <command>.

## Instructions

### Step 1: Install
```bash
brew install just
```

### Step 2: Justfile
```makefile
# justfile — Project commands
set dotenv-load

default: dev

dev:
    npm run dev

test *args:
    npm test {{args}}

build:
    npm run build

db-reset: && db-migrate db-seed
    npx prisma migrate reset --force

db-migrate:
    npx prisma migrate deploy

db-seed:
    npx prisma db seed

deploy env="staging":
    echo "Deploying to {{env}}..."
    npx vercel deploy

up:
    docker compose up -d

down:
    docker compose down

logs service="app":
    docker compose logs -f {{service}}
```

## Guidelines
- Unlike make, just doesn't track file dependencies — purely a command runner.
- Supports arguments with defaults: deploy env="staging".
- just --list shows all available commands.
