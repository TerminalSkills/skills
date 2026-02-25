---
title: Set Up a Developer Experience Pipeline
slug: set-up-developer-experience-pipeline
description: >-
  Automate code quality, commit standards, versioning, and releases for a
  TypeScript monorepo using Nx for builds, commitlint and Husky for commit
  standards, semantic-release for automated publishing, and Dev Containers
  for reproducible environments.
skills:
  - nx
  - commitlint
  - husky
  - semantic-release
  - devcontainers
category: development
tags:
  - monorepo
  - dx
  - automation
  - ci-cd
  - code-quality
---

# Set Up a Developer Experience Pipeline

Leo leads a platform team at a 40-person fintech company. Three product teams share UI components, API clients, and utility libraries — but there's no consistency. Each team has different linting rules, manual versioning, and "it works on my machine" problems. New engineers take a full day to set up their environment. Leo decides to fix developer experience from the ground up.

## Step 1: Monorepo with Nx

The company has five repos that constantly depend on each other. Leo consolidates them into a single Nx monorepo. The key benefit isn't just organization — it's Nx's computation cache. When a developer runs tests, Nx only tests what actually changed. In CI, this cuts pipeline time from 45 minutes to 8 minutes.

```bash
# Initialize Nx workspace
npx create-nx-workspace@latest fintech-platform --preset=ts
cd fintech-platform

# Create the shared libraries and apps
nx g @nx/react:app dashboard
nx g @nx/react:app admin-portal
nx g @nx/node:app api-gateway
nx g @nx/js:lib shared-types
nx g @nx/react:lib ui-components
nx g @nx/js:lib api-client
```

```json
// nx.json — Workspace-wide build configuration
{
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "cache": true,
      "inputs": ["production", "^production"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default"]
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": ["default", "!{projectRoot}/**/*.spec.ts", "!{projectRoot}/test/**/*"],
    "sharedGlobals": ["{workspaceRoot}/tsconfig.base.json"]
  }
}
```

The dependency graph means building `dashboard` automatically builds `shared-types` and `ui-components` first. But if only `api-gateway` changed in a PR, `nx affected` skips the frontend entirely.

## Step 2: Git Hooks and Commit Standards

Leo adds Husky for Git hooks and commitlint for message standards. Every commit now follows Conventional Commits format, which enables automated changelogs and semantic versioning later.

```bash
# Install Git hooks tooling
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

```javascript
// commitlint.config.js — Enforce conventional commit format
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'build', 'ci', 'chore',
    ]],
    'scope-enum': [2, 'always', [
      'dashboard', 'admin', 'api', 'shared-types',
      'ui', 'api-client', 'deps', 'release',
    ]],
    'subject-max-length': [2, 'always', 72],
  },
}
```

```bash
# .husky/commit-msg — Validate commit message format
npx --no -- commitlint --edit "$1"
```

```bash
# .husky/pre-commit — Lint and format only staged files
npx lint-staged
```

```json
// package.json (partial) — lint-staged runs per file type
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
    "*.{css,scss}": ["prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

Now a developer can't commit `"fixed stuff"` — they must write `"fix(api): handle null response in user endpoint"`. This seems strict, but it pays off immediately when generating changelogs.

## Step 3: Dev Containers for Zero-Setup Onboarding

Leo creates a Dev Container config so new engineers go from clone to coding in under 5 minutes, regardless of their OS.

```json
// .devcontainer/devcontainer.json — One-click development environment
{
  "name": "Fintech Platform",
  "dockerComposeFile": "docker-compose.yml",
  "service": "workspace",
  "workspaceFolder": "/workspace",
  "forwardPorts": [3000, 3001, 4000, 5432, 6379],
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/node:1": { "version": "20" }
  },
  "postCreateCommand": "npm install && npx prisma generate",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "nrwl.angular-console",
        "prisma.prisma"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
        "typescript.preferences.importModuleSpecifier": "non-relative"
      }
    }
  }
}
```

```yaml
# .devcontainer/docker-compose.yml — Workspace with local services
services:
  workspace:
    image: mcr.microsoft.com/devcontainers/typescript-node:20
    volumes:
      - ../:/workspace:cached
    command: sleep infinity
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: fintech_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

A new engineer on any OS — Windows, macOS, Linux — opens the repo in VS Code, clicks "Reopen in Container," and gets Node.js 20, PostgreSQL, Redis, all extensions, and correct settings. No "follow the wiki" setup guides that are always outdated.

## Step 4: Automated Releases

With conventional commits in place, semantic-release can now determine version bumps automatically. A `feat` commit triggers a minor bump, `fix` triggers a patch, and `BREAKING CHANGE` triggers a major.

```json
// packages/ui-components/.releaserc.json — Per-package release config
{
  "branches": ["main"],
  "tagFormat": "ui-components-v${version}",
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "preset": "conventionalcommits",
      "releaseRules": [
        { "type": "feat", "scope": "ui", "release": "minor" },
        { "type": "fix", "scope": "ui", "release": "patch" },
        { "type": "perf", "scope": "ui", "release": "patch" }
      ]
    }],
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", "package.json"],
      "message": "chore(release): ui-components v${nextRelease.version}"
    }]
  ]
}
```

## Results

After two weeks of migration, Leo's team sees the impact. New engineer onboarding dropped from a full day to 15 minutes (Dev Container). CI pipeline time went from 45 minutes to 8 minutes (Nx caching). Zero "it works on my machine" issues. Changelogs generate automatically from commits — no more release meetings to figure out what changed. The three product teams now share components and types seamlessly through the monorepo, and version conflicts are a thing of the past.
