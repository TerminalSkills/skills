---
title: Migrate a Python Service to Locked, Reproducible Builds with uv
slug: manage-python-projects-and-dependencies-with-uv
description: Move a requirements.txt service to a uv project with a lockfile, fast CI and a cached Docker build, for backend teams tired of drifting environments.
skills:
  - uv
  - ruff
  - github-actions
  - docker-helper
category: development
tags:
  - uv
  - python
  - lockfile
  - dependency-management
  - ci-cd
  - docker
---

## The Problem

Tomasz Wieczorek is one of four backend engineers at Kestrel Freight, a nine-person logistics startup. Their `dispatch-api` service is a FastAPI app with a `requirements.txt` that pins five top-level packages and nothing else. The 20 further packages those five pull in are resolved fresh on every install.

In August a new release of a transitive dependency landed between a green CI run and the production image build. CI passed, the deploy failed at import time, and dispatchers could not assign drivers for 40 minutes. On top of that, every CI run spends 3 minutes 40 seconds in `pip install`, and each engineer has a slightly different local environment because nobody remembers which Python version the service targets.

Tomasz wants one lockfile that laptops, CI and the Docker image all install from, and he wants the install step to stop dominating the pipeline.

## The Solution

Use **uv** to turn the repository into a project with `pyproject.toml` and `uv.lock`, **ruff** for the lint step that runs through uv, **github-actions** for a workflow that refuses a stale lockfile, and **docker-helper** for an image whose dependency layer is cached.

```bash
npx terminal-skills install uv ruff github-actions docker-helper
```

## Step-by-Step Walkthrough

### 1. Import the existing requirements

```text
Convert dispatch-api from requirements.txt to a uv project. Keep the versions we have today.
```

The agent initialises a bare project inside the existing repository, so no sample files are created, then imports both requirements files. The dev file starts with `-r requirements.txt`, which is stripped before import:

```bash
cd dispatch-api
uv init --bare --python 3.12
uv python pin 3.12
uv add -r requirements.txt
sed '/^-r /d' requirements-dev.txt | uv add --dev -r -
```

`pyproject.toml` now holds the declared dependencies and `uv.lock` pins all 30 packages, transitive ones included:

```toml
[project]
name = "dispatch-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi==0.115.6",
    "httpx==0.28.1",
    "pydantic-settings==2.7.1",
    "sqlalchemy==2.0.36",
    "uvicorn[standard]==0.34.0",
]

[dependency-groups]
dev = [
    "pytest==8.3.4",
    "ruff==0.8.6",
]
```

### 2. Make tests and lint run through uv

```text
Run the tests and the linter in the new environment.
```

```bash
uv run pytest -q
```

The first attempt fails with `ModuleNotFoundError: No module named 'app'`. A bare project is not installed into its own environment, so pytest cannot see the `app/` package. The agent adds the repository root to pytest's path in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
```

```bash
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

```text
1 passed, 1 warning in 0.12s
All checks passed!
3 files already formatted
```

### 3. Enforce the lockfile in CI

```text
Update the GitHub Actions workflow to use uv and fail if someone forgets to update the lockfile.
```

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9 # v9.0.0
        with:
          version: "0.12.21"
          enable-cache: true
      - run: uv python install
      - run: uv sync --locked --dev
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -q
```

`uv python install` reads `.python-version`, so CI uses the same interpreter as the laptops. `uv sync --locked` stops the job when `pyproject.toml` and `uv.lock` disagree.

### 4. Build the image from the same lockfile

```text
Rewrite the Dockerfile so dependencies install from uv.lock and the layer is cached.
```

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /bin/
WORKDIR /app
ENV UV_NO_DEV=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked
ENV PATH="/app/.venv/bin:$PATH"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The agent also adds `.venv` to `.dockerignore`, because a virtual environment built on a laptop does not work inside the image.

```bash
docker build -t dispatch-api:2026.09.3 .
```

### 5. Upgrade one dependency on purpose

```text
uvicorn is far behind the latest release. Upgrade only that package.
```

`requirements.txt` pinned `uvicorn[standard]==0.34.0`, so the agent first relaxes the pin, then lets uv move that one package and nothing else:

```bash
uv tree --outdated --depth 1
uv add 'uvicorn[standard]>=0.34,<1'
uv lock --upgrade-package uvicorn
uv run pytest -q
```

```text
Resolved 31 packages in 176ms
Updated uvicorn v0.34.0 -> v0.54.0
1 passed, 1 warning in 0.11s
```

Relaxing the pin alone changes nothing, because uv keeps the locked version until it is asked to upgrade. The pull request diff shows exactly which entries in `uv.lock` moved.

## Real-World Example

Tomasz did the migration in one afternoon on a branch. Steps 1 and 2 took 20 minutes, including the pytest path fix. He deleted `requirements.txt` and `requirements-dev.txt` in the same pull request so there would be one source of truth.

On the first CI run with a warm cache, the install step dropped from 3 minutes 40 seconds to 6 seconds, and the whole pipeline from 6 minutes 10 seconds to 2 minutes 35 seconds. The Docker build now reuses the dependency layer unless `uv.lock` changes, so a code-only change rebuilds in about 15 seconds.

Two weeks later a teammate added `redis` to `pyproject.toml` by hand and pushed without running `uv lock`. CI failed at `uv sync --locked` within seconds, before any test ran. That is the class of drift that caused the August outage, caught at the pull request instead of in production.

## Related Skills

- [uv](/skills/uv) — creates the project, imports the requirements files, locks all 30 packages and runs every command
- [ruff](/skills/ruff) — lint and format checks, run through `uv run` locally and in CI
- [github-actions](/skills/github-actions) — the workflow that installs uv, restores the cache and enforces the lockfile
- [docker-helper](/skills/docker-helper) — the layered Dockerfile and `.dockerignore` for a cached production image
