---
name: devcontainers
description: >-
  Define reproducible development environments with Dev Containers. Use when a user asks to standardize dev environments, set up VS Code remote containers, create reproducible dev setups, or onboard developers faster.
license: Apache-2.0
compatibility: 'VS Code, GitHub Codespaces'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - devcontainers
    - docker
    - vscode
    - codespaces
    - reproducible
  repository: https://github.com/devcontainers/spec
---

# Dev Containers

## Overview
Dev Containers define reproducible development environments in Docker. Open a repo in VS Code or GitHub Codespaces and get the exact same environment — tools, extensions, settings pre-installed.

## Instructions

### Step 1: Basic Config
```jsonc
// .devcontainer/devcontainer.json — Dev environment definition
{
  "name": "My Project",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:4": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "forwardPorts": [3000, 5432],
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ],
      "settings": { "editor.formatOnSave": true }
    }
  }
}
```

### Step 2: With Database
```yaml
# .devcontainer/docker-compose.yml
services:
  app:
    image: mcr.microsoft.com/devcontainers/typescript-node:20
    volumes: [../:/workspace:cached]
    command: sleep infinity
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

## Examples

### Example 1: "Our new hires spend a day installing the right Node version, Postgres, and CLI tools before they can run the app"

Add a `.devcontainer/devcontainer.json` at the repo root using the config in Step 1 above, committing it to version control. A new hire clones the repo, opens it in VS Code, clicks "Reopen in Container" when prompted (or runs the "Dev Containers: Reopen in Container" command), and VS Code builds the image, runs `postCreateCommand` (`npm install`), and attaches with the listed extensions already installed. No local Node, Postgres, or CLI setup is needed on the host machine.

You can also build and run the same definition from the command line (CI, or without VS Code) using the standalone CLI:

```bash
npm install -g @devcontainers/cli
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm test
```

### Example 2: "Our app needs Postgres running alongside it for local development, not just the app container"

Use the Docker Compose variant in Step 2: a `.devcontainer/docker-compose.yml` with an `app` service (the dev container, kept alive with `command: sleep infinity` so VS Code can attach) and a `db` service (`postgres:16`) sharing a Docker network, plus a `.devcontainer/devcontainer.json` that points `dockerComposeFile` at it and sets `service: "app"` and `workspaceFolder: "/workspace"`. Opening the folder in VS Code starts both containers; the app connects to Postgres at host `db`, port `5432`.

## Guidelines
- New developer: clone → open in VS Code → "Reopen in Container" → ready.
- Features marketplace (`ghcr.io/devcontainers/features/*`) adds tools without custom Dockerfiles; pin a major version (e.g. `:4`) rather than `:latest` so builds stay reproducible.
- Works with GitHub Codespaces — same config, cloud-hosted; also supported by JetBrains IDEs and the standalone `devcontainer` CLI (`@devcontainers/cli`), not just VS Code.
- `postCreateCommand` runs once after the container is created; use `postStartCommand` for logic that should run every time the container starts (e.g. after a rebuild or restart).
- Keep the image/Dockerfile layer caching-friendly — install dependencies before copying source so rebuilds stay fast.
