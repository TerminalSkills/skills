---
name: dagger
description: >-
  Write CI/CD pipelines as code with Dagger — portable, cacheable, container-based
  pipelines that run locally and in any CI system. Use when someone asks to
  "write CI pipeline in TypeScript", "portable CI/CD", "run GitHub Actions
  locally", "Dagger pipeline", "CI as code", "containerized build pipeline",
  or "test my CI locally before pushing". Covers Dagger SDK (TypeScript/Python),
  pipeline composition, caching, secrets, and multi-stage builds.
license: Apache-2.0
compatibility: "Docker required. Dagger CLI. TypeScript/Python/Go SDK."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["ci-cd", "containers", "pipelines", "dagger", "docker"]
---

# Dagger

## Overview

Dagger lets you write CI/CD pipelines in TypeScript, Python, or Go instead of YAML. Pipelines run in containers, are fully cacheable, and work identically on your laptop and in GitHub Actions/GitLab CI/Jenkins. No more "works in CI but not locally" — test your entire pipeline before pushing.

## When to Use

- Tired of debugging YAML-based CI configs by pushing commits
- Need to run the exact same pipeline locally and in CI
- Complex build pipelines that benefit from TypeScript/Python logic (conditionals, loops)
- Want container-level caching for build steps
- Multi-language monorepo where different projects need different pipelines

## Instructions

### Setup

```bash
# Install Dagger CLI (macOS/Linux)
brew install dagger/tap/dagger

# Initialize in your project
dagger init --sdk=typescript
```

### Basic Pipeline

```typescript
// dagger/src/index.ts — CI pipeline for a Node.js project
/**
 * Dagger pipeline that builds, tests, and creates a Docker image.
 * Runs identically on your laptop and in any CI system.
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger";

@object()
class Ci {
  /**
   * Run the full CI pipeline: install → lint → test → build.
   */
  @func()
  async ci(source: Directory): Promise<string> {
    const node = this.base(source);

    // Run steps in sequence (each cached independently)
    await this.lint(source);
    await this.test(source);
    const built = await this.build(source);

    return "✅ CI passed";
  }

  /**
   * Base container with dependencies installed.
   * Cached — only re-runs if package.json changes.
   */
  @func()
  base(source: Directory): Container {
    return dag
      .container()
      .from("node:20-slim")
      .withDirectory("/app", source)
      .withWorkdir("/app")
      // Cache node_modules across runs
      .withMountedCache("/app/node_modules", dag.cacheVolume("node-modules"))
      .withExec(["npm", "ci"]);
  }

  @func()
  async lint(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["npm", "run", "lint"])
      .stdout();
  }

  @func()
  async test(source: Directory): Promise<string> {
    return this.base(source)
      .withExec(["npm", "run", "test", "--", "--run"])
      .stdout();
  }

  @func()
  async build(source: Directory): Promise<Directory> {
    return this.base(source)
      .withExec(["npm", "run", "build"])
      .directory("/app/dist");
  }

  /**
   * Build and push a Docker image.
   */
  @func()
  async publish(source: Directory, registry: string, tag: string): Promise<string> {
    const built = await this.build(source);

    const image = dag
      .container()
      .from("node:20-slim")
      .withDirectory("/app", built)
      .withWorkdir("/app")
      .withEntrypoint(["node", "index.js"]);

    const ref = await image.publish(`${registry}:${tag}`);
    return `📦 Published: ${ref}`;
  }
}
```

### Run Locally

```bash
# Run the full CI pipeline on your local code
dagger call ci --source=.

# Just run tests
dagger call test --source=.

# Build and publish Docker image
dagger call publish --source=. --registry=ghcr.io/myorg/myapp --tag=latest
```

### Pipeline with Services (Database)

```typescript
// dagger/src/index.ts — Pipeline with Postgres for integration tests
@object()
class Ci {
  @func()
  async integrationTest(source: Directory): Promise<string> {
    // Start a Postgres service container
    const db = dag
      .container()
      .from("postgres:16")
      .withEnvVariable("POSTGRES_PASSWORD", "test")
      .withEnvVariable("POSTGRES_DB", "testdb")
      .withExposedPort(5432)
      .asService();

    // Run tests with database available
    return this.base(source)
      .withServiceBinding("db", db)
      .withEnvVariable("DATABASE_URL", "postgresql://postgres:test@db:5432/testdb")
      .withExec(["npm", "run", "db:migrate"])
      .withExec(["npm", "run", "test:integration"])
      .stdout();
  }
}
```

### Secrets

```typescript
// Handle secrets safely — never baked into container layers
@func()
async deploy(source: Directory, apiKey: Secret): Promise<string> {
  return this.base(source)
    .withSecretVariable("API_KEY", apiKey)  // Mounted as env var, not in layer
    .withExec(["npm", "run", "deploy"])
    .stdout();
}
```

### GitHub Actions Integration

```yaml
# .github/workflows/ci.yml — Run Dagger pipeline in GitHub Actions
name: CI
on: [push, pull_request]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dagger/dagger-for-github@v7
        with:
          verb: call
          args: ci --source=.
```

## Examples

### Example 1: Monorepo CI pipeline

**User prompt:** "I have a monorepo with a Next.js frontend and a Python backend. Set up a CI pipeline that tests both."

The agent will create a Dagger pipeline with separate functions for frontend (Node.js container, npm test) and backend (Python container, pytest), both running from the same pipeline with shared caching.

### Example 2: Replace GitHub Actions with Dagger

**User prompt:** "My GitHub Actions workflow is 200 lines of YAML and I can't test it locally. Convert it to Dagger."

The agent will translate each YAML step into a Dagger function, add caching for dependencies, and show how to run the same pipeline locally with `dagger call`.

## Guidelines

- **Run locally first** — `dagger call` on your laptop before pushing to CI
- **Cache aggressively** — `withMountedCache` for node_modules, pip cache, build artifacts
- **Secrets via `Secret` type** — never pass secrets as plain strings or env vars in Dockerfiles
- **Services for databases** — `asService()` + `withServiceBinding()` for Postgres/Redis in tests
- **Each `@func()` is independently callable** — design for composability
- **Container layers are cached** — order operations so rarely-changing steps come first
- **Dagger Cloud for team caching** — share build cache across CI runners
- **Use `withExec` for each command** — separate steps for better cache granularity
