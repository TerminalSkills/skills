---
name: devcontainers
description: >-
  Define reproducible development environments with Dev Containers. Use when a user asks to standardize dev environments, set up VS Code remote containers, create reproducible dev setups, or onboard developers faster.
license: Apache-2.0
compatibility: 'VS Code, GitHub Codespaces'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - devcontainers
    - docker
    - vscode
    - codespaces
    - reproducible
---

# Dev Containers

## Overview
Dev Containers define reproducible development environments in Docker. Open a repo in VS Code or GitHub Codespaces and get the exact same environment — tools, extensions, settings pre-installed.

## Instructions

### Step 1: Basic Config
```json
// .devcontainer/devcontainer.json — Dev environment definition
{
  "name": "My Project",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
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

## Guidelines
- New developer: clone → open in VS Code → "Reopen in Container" → ready.
- Features marketplace adds tools without custom Dockerfiles.
- Works with GitHub Codespaces — same config, cloud-hosted.
