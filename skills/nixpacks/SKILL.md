---
name: nixpacks
description: Expert guidance for Nixpacks, the build system created by Railway that automatically detects your application's language and framework, installs dependencies, and produces optimized Docker images — all without writing a Dockerfile. Helps developers configure Nixpacks for custom build steps, multi-language projects, and CI/CD integration.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - buildpacks
  - docker
  - deployment
  - ci-cd
  - nix
---

# Nixpacks — App Source to Docker Image


## Overview


Nixpacks, the build system created by Railway that automatically detects your application's language and framework, installs dependencies, and produces optimized Docker images — all without writing a Dockerfile. Helps developers configure Nixpacks for custom build steps, multi-language projects, and CI/CD integration.


## Instructions

### Basic Usage

Build any application into a Docker image:

```bash
# Install Nixpacks
curl -sSL https://nixpacks.com/install.sh | bash

# Build an image (auto-detects language and framework)
nixpacks build ./my-node-app -n my-app
# Detects: Node.js + Next.js → installs Node, npm ci, npm run build

nixpacks build ./my-python-api -n my-api
# Detects: Python + FastAPI → installs Python, pip install, uvicorn start

nixpacks build ./my-rust-service -n my-service
# Detects: Rust + Cargo → installs Rust, cargo build --release

# Run the built image
docker run -p 3000:3000 my-app

# Generate a Dockerfile without building (inspect what Nixpacks would do)
nixpacks plan ./my-node-app
# Shows: detected providers, install/build/start commands, Nix packages

# Generate Dockerfile for manual editing
nixpacks build ./my-node-app --out . --name my-app
# Creates .nixpacks/Dockerfile that you can customize
```

### Configuration

Override auto-detected settings:

```toml
# nixpacks.toml — Custom build configuration
[phases.setup]
# Additional system packages (via Nix)
nixPkgs = ["ffmpeg", "imagemagick", "poppler_utils"]
aptPkgs = ["libvips-dev"]          # Debian packages (fallback)

[phases.install]
cmds = ["npm ci --production=false"]  # Override install command

[phases.build]
cmds = [
  "npx prisma generate",            # Generate Prisma client
  "npm run build",                   # Build the application
]

[start]
cmd = "node dist/server.js"          # Override start command

# Environment variables available during build
[variables]
NODE_ENV = "production"
NEXT_TELEMETRY_DISABLED = "1"
```

```toml
# nixpacks.toml — Python project with system dependencies
[phases.setup]
nixPkgs = ["postgresql"]            # For psycopg2 compilation
pythonVersion = "3.12"

[phases.install]
cmds = ["pip install -r requirements.txt"]

[phases.build]
cmds = [
  "python manage.py collectstatic --noinput",
  "python manage.py migrate --check",
]

[start]
cmd = "gunicorn myapp.wsgi:application --bind 0.0.0.0:$PORT --workers 4"
```

### Multi-Language Projects

Handle monorepos and multi-language apps:

```toml
# nixpacks.toml — Monorepo with frontend + backend
[phases.setup]
nixPkgs = ["nodejs-20_x", "python312"]

[phases.install]
cmds = [
  "cd frontend && npm ci",
  "cd backend && pip install -r requirements.txt",
]

[phases.build]
cmds = [
  "cd frontend && npm run build",
  "cp -r frontend/dist backend/static",
  "cd backend && python manage.py collectstatic --noinput",
]

[start]
cmd = "cd backend && gunicorn app:app --bind 0.0.0.0:$PORT"
```

### CI/CD Integration

Use Nixpacks in GitHub Actions:

```yaml
# .github/workflows/deploy.yml — Build and push with Nixpacks
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Nixpacks
        run: curl -sSL https://nixpacks.com/install.sh | bash

      - name: Build image
        run: |
          nixpacks build . \
            --name ghcr.io/${{ github.repository }}:${{ github.sha }} \
            --env NODE_ENV=production

      - name: Login to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Push image
        run: |
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
          docker tag ghcr.io/${{ github.repository }}:${{ github.sha }} ghcr.io/${{ github.repository }}:latest
          docker push ghcr.io/${{ github.repository }}:latest
```

### Supported Languages

```markdown
## Auto-Detected Languages and Frameworks
| Language   | Detection File         | Frameworks                           |
|-----------|------------------------|--------------------------------------|
| Node.js   | package.json           | Next.js, Nuxt, Remix, Express, Nest |
| Python    | requirements.txt/pyproject.toml | Django, Flask, FastAPI, Streamlit |
| Rust      | Cargo.toml             | Actix, Axum, Rocket                  |
| Go        | go.mod                 | Gin, Echo, Fiber, net/http           |
| Ruby      | Gemfile                | Rails, Sinatra                       |
| PHP       | composer.json          | Laravel, Symfony                     |
| Java      | pom.xml/build.gradle   | Spring Boot, Quarkus                 |
| Elixir    | mix.exs                | Phoenix                              |
| Haskell   | stack.yaml             | -                                    |
| Zig       | build.zig              | -                                    |
| Crystal   | shard.yml              | -                                    |
| Dart      | pubspec.yaml           | -                                    |
| Swift     | Package.swift          | Vapor                                |
| .NET      | *.csproj               | ASP.NET                              |
| Static    | index.html             | -                                    |
```


## Examples


### Example 1: Setting up Nixpacks for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Nixpacks for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Install Nixpacks`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting configuration issues

**User request:**

```
Nixpacks is showing errors in our configuration. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Nixpacks issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Start without config** — Try `nixpacks build .` first; auto-detection handles most projects correctly
2. **Use nixpacks.toml for system deps** — Need FFmpeg, ImageMagick, or native libraries? Add them to `nixPkgs`
3. **Pin language versions** — Specify `pythonVersion = "3.12"` or use `.nvmrc`/`.python-version` files
4. **Check the plan first** — Run `nixpacks plan .` to see what Nixpacks will do before building
5. **Cache layers** — Nixpacks caches install and build phases; put dependency files (package.json) before source code
6. **Generate Dockerfile for debugging** — Use `--out .` to get the generated Dockerfile; inspect and customize if needed
7. **Environment variables in build** — Use `[variables]` in nixpacks.toml for build-time vars; runtime vars come from your platform
8. **Nix packages over apt** — Prefer `nixPkgs` over `aptPkgs`; Nix packages are more reproducible and better cached
