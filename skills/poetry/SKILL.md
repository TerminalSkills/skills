---
name: poetry
description: >-
  Manage Python projects with Poetry. Use when a user asks to manage Python
  dependencies, create virtual environments, publish packages to PyPI,
  handle dependency resolution, or set up a Python project structure.
license: Apache-2.0
compatibility: 'Python 3.9+ (Poetry 2.x)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - poetry
    - python
    - dependencies
    - packaging
    - virtual-environment
  repository: https://github.com/python-poetry/poetry
---

# Poetry

## Overview

Poetry is a Python dependency manager and build tool. It handles virtual environments, dependency resolution (with a lock file), project scaffolding, and PyPI publishing — a modern replacement for pip + setuptools + virtualenv. Since Poetry 2.0, project metadata follows the PEP 621 standard (`[project]` in `pyproject.toml`); `[tool.poetry]` is now reserved for Poetry-specific behavior like dependency groups and the lock file.

## Instructions

### Step 1: New Project

```bash
# Install Poetry into its own isolated environment, not your project's
pipx install poetry

# Create new project
poetry new my-api
cd my-api

# Or init in existing directory
poetry init
```

### Step 2: Manage Dependencies

```bash
# Add dependencies
poetry add fastapi uvicorn sqlalchemy
poetry add pydantic-settings

# Add dev dependencies to a named group
poetry add --group dev pytest pytest-asyncio pytest-cov ruff mypy

# Remove
poetry remove requests

# Update
poetry update                  # update all within constraints
poetry update fastapi          # update specific package
poetry lock                    # regenerate lock file without installing
```

### Step 3: pyproject.toml

```toml
# pyproject.toml — PEP 621 project metadata lives under [project];
# [tool.poetry] holds dependency groups and other Poetry-specific config.
[project]
name = "project-tracker-api"
version = "1.0.0"
description = "Project management API"
readme = "README.md"
requires-python = ">=3.11"
authors = [{ name = "Platform Team", email = "platform@projecttracker.dev" }]
dependencies = [
    "fastapi (>=0.110,<0.111)",
    "uvicorn[standard] (>=0.27,<0.28)",
    "sqlalchemy (>=2.0,<3.0)",
    "pydantic-settings (>=2.0,<3.0)",
]

[project.scripts]
serve = "project_tracker.main:start"
migrate = "project_tracker.db:run_migrations"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
pytest-asyncio = "^0.23"
pytest-cov = "^4.1"
ruff = "^0.3"
mypy = "^1.8"

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[build-system]
requires = ["poetry-core>=2.0"]
build-backend = "poetry.core.masonry.api"
```

### Step 4: Use

```bash
# Poetry no longer ships a `shell` command by default (removed in Poetry 2.0).
# Activate the virtualenv:
eval $(poetry env activate)         # Bash/Zsh
# or install the old behavior back: poetry self add poetry-plugin-shell && poetry shell

# Run without activating
poetry run python main.py
poetry run pytest
poetry run serve              # custom script from pyproject.toml

# Export for Docker (requires the export plugin, not built into core Poetry)
poetry self add poetry-plugin-export
poetry export -f requirements.txt -o requirements.txt --without-hashes

# Build and publish to PyPI
poetry build
poetry publish
```

## Examples

### Example 1: "Set up a new FastAPI project with Poetry and a dev dependency group"

```bash
poetry new project-tracker-api --name project_tracker
cd project-tracker-api
poetry add fastapi "uvicorn[standard]" sqlalchemy pydantic-settings
poetry add --group dev pytest pytest-asyncio ruff mypy
poetry install
```

Result: `pyproject.toml` gets a `[project]` dependencies list and a `[tool.poetry.group.dev.dependencies]` table, `poetry.lock` is generated, and `.venv` (or Poetry's cache-managed env) has every package installed, dev group included.

### Example 2: "Build a slim Docker image without installing Poetry in the container"

```dockerfile
FROM python:3.12-slim AS export
RUN pip install --no-cache-dir poetry poetry-plugin-export
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt -o requirements.txt --without-hashes

FROM python:3.12-slim
WORKDIR /app
COPY --from=export /app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "project_tracker.main:app", "--host", "0.0.0.0"]
```

Result: the final image installs plain `pip` dependencies from the exported `requirements.txt` and never includes Poetry itself or the lock-resolution machinery.

## Guidelines

- Always commit `poetry.lock` — it resolves every transitive dependency and makes installs reproducible across machines.
- `poetry export` and `poetry shell` are both plugins now, not core commands — `poetry self add poetry-plugin-export` / `poetry-plugin-shell` before using them, or use `poetry run` / `eval $(poetry env activate)` instead of `shell`.
- New metadata (`name`, `version`, `dependencies`, `authors`) belongs in `[project]` per PEP 621; reserve `[tool.poetry]` for dependency groups and Poetry-only settings. Older `[tool.poetry.dependencies]`-only projects still work but won't get new PEP 621-only tooling support.
- Group dev/test/docs dependencies with `--group <name>` — groups other than the implicit main group are excluded by `poetry install --only main`.
- Alternative: `uv` (from Astral, makers of Ruff) — a much faster dependency resolver and installer with its own project/lock-file format; consider it for large monorepos or CI where install time dominates, but it is a separate tool, not a drop-in Poetry replacement.
