---
title: Set Up a Developer Experience Pipeline
slug: set-up-developer-experience-pipeline
description: >-
  Automate code quality, commit standards, versioning, and releases for a
  TypeScript monorepo using Nx for builds, commitlint and Husky for commit
  standards, Nx Release for automated versioning and publishing, and Dev Containers
  for reproducible environments.
skills:
  - nx
  - commitlint
  - husky
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

The company has five repos that constantly depend on each other. Leo consolidates them into a single Nx monorepo. The key benefit isn't just organization — it's Nx's computation cache: a task whose inputs have not changed is replayed from the cache, and `nx affected` runs only the projects a change touches.

```bash
# Initialize an npm-workspaces monorepo (Nx 23+, Node.js 20+)
npx create-nx-workspace@latest fintech-platform --preset=ts --nxCloud=skip --no-interactive --packageManager=npm
cd fintech-platform

# Plugins for the project types we need
npx nx add @nx/react
npx nx add @nx/node

# Apps and shared libraries (the first argument is the project directory)
npx nx g @nx/react:app apps/dashboard --bundler=vite --unitTestRunner=vitest --linter=eslint --e2eTestRunner=none
npx nx g @nx/node:app apps/api-gateway --framework=none --unitTestRunner=none --linter=eslint --e2eTestRunner=none
npx nx g @nx/js:lib packages/shared-types --bundler=tsc --unitTestRunner=none --linter=none
npx nx g @nx/react:lib packages/ui-components --bundler=vite --publishable --importPath=@fintech/ui-components --unitTestRunner=none --linter=none
```

The `@nx/*` plugins infer `build`, `test`, `lint` and `typecheck` targets from each project's tsconfig, Vite and ESLint files, so no `project.json` is needed. `nx.json` only has to say how those targets depend on each other and what counts as an input:

```json
{
  "namedInputs": {
    "production": ["default", "!{projectRoot}/**/*.spec.ts", "!{projectRoot}/test/**/*"]
  },
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true, "inputs": ["production", "^production"] },
    "lint": { "cache": true }
  }
}
```

Building `dashboard` now builds the libraries it imports first. In a pull request, `npx nx affected -t lint test build --base=origin/main` skips everything the change did not touch (it needs a full git checkout, `fetch-depth: 0` in GitHub Actions). Leo's team measured CI dropping from 45 minutes to 8 after the move; your numbers depend on how much of the graph a typical change touches.

## Step 2: Git Hooks and Commit Standards

Leo adds Husky for Git hooks and commitlint for message standards. Every commit now follows Conventional Commits format, which release tooling reads later to pick version numbers. commitlint v21 needs Node.js 22.12 or newer.

```bash
# Install Git hooks tooling (Husky 9)
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

```javascript
// commitlint.config.mjs — Enforce conventional commit format
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', [
      'dashboard', 'api', 'shared-types',
      'ui', 'deps', 'release',
    ]],
    'header-max-length': [2, 'always', 72],
  },
}
```

The preset already allows `build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test`, so the config only adds a mandatory scope and a shorter header limit. Husky 9 hook files are plain commands, with no shebang or `husky.sh` line:

```bash
# .husky/commit-msg — Validate commit message format
npx --no -- commitlint --edit "$1"
```

```bash
# .husky/pre-commit — Lint and format only staged files
npx lint-staged
```

`husky init` writes `npm test` into `.husky/pre-commit` and `"prepare": "husky"` into `package.json`; the file above replaces that content, and the `prepare` script installs the hooks for each teammate on `npm install`.

```jsonc
// package.json (partial) — lint-staged runs per file type
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
    "*.{css,scss}": ["prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

Now a developer can't commit `"fixed stuff"` — commitlint answers `subject may not be empty`, `type may not be empty` and `scope may not be empty` — they must write `"fix(api): handle null response in user endpoint"`. Hooks can be skipped with `--no-verify`, so run the same check in CI (`npx commitlint --from <base-sha> --to <head-sha>`).

## Step 3: Dev Containers for Zero-Setup Onboarding

Leo creates a Dev Container config so new engineers go from clone to coding without a setup guide, regardless of their OS. The dev container itself is the Node 24 image, so no separate Node feature is needed.

```jsonc
// .devcontainer/devcontainer.json — One-click development environment
{
  "name": "Fintech Platform",
  "dockerComposeFile": "docker-compose.yml",
  "service": "workspace",
  "workspaceFolder": "/workspace",
  "forwardPorts": [3000, 4000, "postgres:5432", "redis:6379"],
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:4": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm ci",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "nrwl.angular-console"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" }
      }
    }
  }
}
```

```yaml
# .devcontainer/docker-compose.yml — Workspace with local services
services:
  workspace:
    image: mcr.microsoft.com/devcontainers/typescript-node:24
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
  redis:
    image: redis:8-alpine
volumes:
  pgdata:
```

The database and cache are reachable from the workspace container at `postgres:5432` and `redis:6379`; the `"postgres:5432"` entries in `forwardPorts` forward them to the developer's machine through VS Code, so nothing is published on the host's network interfaces. Pin Node to a version that is still supported (`typescript-node` has `22`, `24` and `26` variants; Node 20 is end-of-life) and keep it in step with the `engines` field of the repo.

A new engineer on any OS opens the repo in VS Code, runs "Dev Containers: Reopen in Container", and gets Node.js 24, PostgreSQL, Redis, the extensions and the settings. The same file works with the standalone CLI for CI: `npm install -g @devcontainers/cli`, then `devcontainer up --workspace-folder .` and `devcontainer exec --workspace-folder . npm test`.

## Step 4: Automated Releases

With conventional commits in place, release tooling can derive version bumps from the history: `feat` gives a minor bump, `fix` a patch, and a `BREAKING CHANGE:` footer or `!` a major. semantic-release assumes one package per repository and reads every commit, so for a monorepo with independently versioned libraries Leo uses the release command built into Nx, which attributes each commit to the projects whose files it touched.

```jsonc
// nx.json (partial) — release only the published library, versioned independently
{
  "release": {
    "projects": ["@fintech/ui-components"],
    "projectsRelationship": "independent",
    "version": { "conventionalCommits": true },
    "changelog": { "projectChangelogs": true }
  }
}
```

```console
$ npx nx release --first-release --dry-run
@fintech/ui-components 📄 Resolved the specifier as "patch" using git history and the conventional commits standard
@fintech/ui-components ❓ Applied semver relative bump "patch", derived from conventional commits data, to get new version 0.0.2
CREATE packages/ui-components/CHANGELOG.md [dry-run]
```

`--dry-run` previews the new version, the changelog entry and the git commit and tag without writing anything. Drop `--first-release` once the first tag exists; a real run then versions, writes `CHANGELOG.md`, commits, tags and publishes to the npm registry. Run it from a CI job on `main` with registry credentials stored as CI secrets. Tags look like `@fintech/ui-components@0.0.2`. For a single-package repository, semantic-release is the simpler choice.

## Results

After two weeks of migration, Leo's team reports onboarding down from a full day to about 15 minutes with the Dev Container, CI from 45 minutes to 8 with Nx caching, and no "it works on my machine" tickets. Changelogs are generated from commits instead of reconstructed in a release meeting, and the three product teams share components and types through one repository. These are the example team's own figures.

## Related Skills

- [nx](/skills/nx): monorepo build graph, caching, affected commands and Nx Release
- [commitlint](/skills/commitlint): commit message rules enforced in the hook and in CI
- [husky](/skills/husky): the `commit-msg` and `pre-commit` hooks
- [devcontainers](/skills/devcontainers): the reproducible Node 24 dev environment
