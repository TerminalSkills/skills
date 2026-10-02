---
name: ruff
description: >-
  Lint and format Python with Ruff. Use when a user asks to set up Python
  linting, replace flake8/black/isort, configure code quality rules, or
  speed up Python code formatting.
license: Apache-2.0
compatibility: "Python 3.7+ for pip install; prebuilt binary, no Rust needed"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/astral-sh/ruff
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
pip install ruff          # or: uv tool install ruff / pipx install ruff / brew install ruff
ruff --version            # checked against 0.16.10
```

For a one-off run without installing: `uvx ruff check .`. Pin the version in your project dependencies so local runs, pre-commit and CI agree.

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
    "TC",   # flake8-type-checking (named TCH in older Ruff versions)
    "RUF",  # ruff-specific rules
]
ignore = [
    "E501",   # line too long (handled by formatter)
]
fixable = ["ALL"]

[tool.ruff.lint.isort]
known-first-party = ["billing_api"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["B011"]      # allow `assert False` in tests
"__init__.py" = ["F401"]   # re-exports

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

# Inspect
ruff rule F401                 # explain one rule
ruff format --diff .           # show what the formatter would change
ruff check --select I --fix .  # only sort imports
ruff check --add-noqa .        # silence existing violations when adopting Ruff on old code
```

Without a `[tool.ruff]` section Ruff uses its own defaults (line length 88 and a small rule set). The same settings can live in `ruff.toml` (no `tool.ruff` prefix) or `.ruff.toml`. `--fix` applies only safe fixes; fixes that could change behavior are shown as hidden and need `--unsafe-fixes`, so review that diff.

### Step 4: Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.16.10
    hooks:
      - id: ruff-check
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

## Examples

### Replace flake8, isort and black in an existing project

User: "We run flake8, isort and black on our FastAPI service. Move it all to Ruff."

```bash
pip uninstall -y flake8 isort black
pip install ruff
# add the [tool.ruff] block above to pyproject.toml, delete .flake8 and setup.cfg lint sections
ruff check . --fix
ruff format .
```

The first run reports remaining violations (for example `F401 imported but unused` or `UP006 Use list instead of List`) and rewrites safe ones in place; `ruff format .` prints `N files reformatted, M files left unchanged`.

### Adopt Ruff on a legacy codebase without a giant diff

User: "Turn on Ruff in CI but don't make me fix 900 warnings today."

```bash
ruff check . --select E,F,I,B,UP --add-noqa   # adds "# noqa: F401" style comments to existing hits
ruff check .                                   # now passes, new violations still fail
```

Remove the `noqa` comments gradually as files are touched.

## Guidelines

- Ruff replaces flake8, black, isort, pyupgrade in a single tool — remove the old ones.
- Start with a broad rule set (`select = ["E", "W", "F", "I", "B", "UP"]`) and expand.
- `ruff check --fix` auto-fixes most issues — safe to run in pre-commit hooks.
- The `ruff` hook id was renamed `ruff-check` in ruff-pre-commit; the old id still works as a legacy alias.
- `ruff format` is designed to match Black closely but is not byte-identical in every case; expect a few small diffs on first run.
- Ruff does not do type checking; keep mypy or pyright for that.
- Use `ruff format` as a near drop-in replacement for black.
