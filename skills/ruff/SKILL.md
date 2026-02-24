---
name: ruff
description: >-
  Lint and format Python with Ruff. Use when a user asks to set up Python
  linting, replace flake8/black/isort, configure code quality rules, or
  speed up Python code formatting.
license: Apache-2.0
compatibility: 'Python 3.7+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - ruff
    - linting
    - formatting
    - python
    - code-quality
---

# Ruff

## Overview

Ruff is an extremely fast Python linter and formatter written in Rust. It replaces flake8, black, isort, pyupgrade, pydocstyle, and dozens more tools — running 10-100x faster. One tool for all Python code quality.

## Instructions

### Step 1: Setup

```bash
pip install ruff
```

### Step 2: Configuration

```toml
# pyproject.toml — Ruff configuration
[tool.ruff]
target-version = "py311"
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort (import sorting)
    "B",    # flake8-bugbear
    "C4",   # flake8-comprehensions
    "UP",   # pyupgrade
    "SIM",  # flake8-simplify
    "TCH",  # flake8-type-checking
    "RUF",  # ruff-specific rules
]
ignore = [
    "E501",   # line too long (handled by formatter)
]
fixable = ["ALL"]

[tool.ruff.lint.isort]
known-first-party = ["my_app"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true
```

### Step 3: Use

```bash
# Lint
ruff check .                   # check all files
ruff check . --fix             # auto-fix issues
ruff check . --fix --unsafe-fixes  # include risky auto-fixes

# Format
ruff format .                  # format all files
ruff format --check .          # check without modifying (CI)

# Watch mode
ruff check --watch .
```

### Step 4: Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```

### Step 5: CI Integration

```yaml
# .github/workflows/lint.yml
- name: Lint with Ruff
  run: |
    ruff check . --output-format=github
    ruff format --check .
```

## Guidelines

- Ruff replaces flake8, black, isort, pyupgrade in a single tool — remove the old ones.
- Start with a broad rule set (`select = ["E", "W", "F", "I", "B", "UP"]`) and expand.
- `ruff check --fix` auto-fixes most issues — safe to run in pre-commit hooks.
- Ruff processes the entire CPython codebase in under 200ms — linting is no longer a bottleneck.
- Use `ruff format` as a drop-in replacement for black — same output, 100x faster.
