---
name: uv
description: >-
  Installs Python packages, creates virtual environments, locks dependencies
  and manages Python versions with one fast command-line tool that replaces
  pip, pip-tools, pipx, poetry, pyenv and virtualenv. Use when a user asks to
  set up a Python project, add or upgrade a dependency, create a lockfile,
  migrate from requirements.txt, run a script with inline dependencies,
  install a Python version, run a tool with uvx, or speed up installs in CI
  and Docker.
license: Apache-2.0
compatibility: "macOS 13+, Linux (glibc 2.17+ or musl 1.1+) or Windows 10+; no existing Python or Rust installation required"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["python", "package-manager", "lockfile", "virtual-environments", "dependency-management"]
  repository: https://github.com/astral-sh/uv
---
# uv — Fast Python package and project manager

## Overview

uv is a single binary from Astral that covers the whole Python workflow: projects with a cross-platform lockfile (`uv.lock`), single-file scripts with inline dependencies, command-line tools (`uvx`), Python interpreter installs, and a drop-in `uv pip` interface. It downloads Python itself when needed, so a machine needs nothing but uv.

## Instructions

### Installation

```bash
# Package managers
pipx install uv
brew install uv
winget install --id=astral-sh.uv -e
```

Astral also publishes a standalone installer for machines without a package manager; the installation page at https://docs.astral.sh/uv/getting-started/installation/ has the current command and checksums.

```bash
uv --version
uv self update     # standalone installer only; otherwise upgrade with the package manager
```

To pin a release, put the version in the installer URL: `https://astral.sh/uv/0.12.21/install.sh`.

### Create a project

```bash
uv init dispatch-api               # packaged app: src/dispatch_api/, uv_build backend, console script
uv init --no-package cron-jobs     # flat layout with main.py and no build system
uv init --lib geo-utils            # library with a py.typed marker
uv init --bare --python 3.12       # only pyproject.toml, in the current directory
```

`uv init` also writes `.python-version`, `README.md`, `.gitignore` and initialises git. `--bare` writes nothing but `pyproject.toml`, which makes it the right choice inside an existing repository.

### Manage dependencies

```bash
uv add 'httpx>=0.27' 'pydantic>=2.7,<3'     # runtime dependencies
uv add --dev pytest ruff                    # dev group, not shipped to production
uv add --group docs mkdocs                  # any named dependency group
uv add --optional postgres 'psycopg[binary]'   # extra: pip install dispatch-api[postgres]
uv add -r requirements.txt                  # import an existing requirements file
uv remove httpx

uv lock --upgrade-package pydantic          # bump one package within its constraints
uv lock --upgrade                           # bump everything
uv tree --outdated --depth 1                # what has a newer release
```

The first `uv add` creates `.venv/` and `uv.lock`. Every change updates `pyproject.toml`, the lockfile and the environment together.

### Run and sync

```bash
uv run pytest                        # locks and syncs if needed, then runs inside .venv
uv run python -m dispatch_api
uv run --with rich python -c "import rich"   # one extra package for this command only

uv sync                              # install everything, dev group included
uv sync --locked                     # CI: fail if uv.lock does not match pyproject.toml
uv sync --frozen --no-dev            # production: use uv.lock as-is, skip the dev group
uv sync --extra postgres
uv lock --check                      # exit non-zero when the lockfile is stale
```

No activation is needed; `uv run` finds the project environment by itself.

### Scripts with inline dependencies

```bash
uv init --script fetch-rates.py --python 3.12
uv add --script fetch-rates.py 'httpx<1' rich
uv run fetch-rates.py
uv lock --script fetch-rates.py      # writes fetch-rates.py.lock for reproducible runs
```

`uv add --script` maintains a metadata block at the top of the file:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx<1",
#     "rich>=15.0.0",
# ]
# ///
```

Add `#!/usr/bin/env -S uv run --script` as the first line and `chmod +x` the file to run it directly.

### Tools

```bash
uvx ruff check .                         # run without installing; uvx = uv tool run
uvx ruff@0.16.9 check .                  # exact version
uvx --from 'markitdown[pdf]' markitdown q3-board-report.pdf   # command name differs from the spec
uv tool install ruff                     # permanent, isolated install on PATH
uv tool upgrade --all
uv tool list
uv tool uninstall ruff
```

Installed tools land in the directory printed by `uv tool dir --bin`; uv warns when that directory is not on `PATH`.

### Python versions

```bash
uv python install 3.12 3.13
uv python list --only-installed
uv python pin 3.12              # writes .python-version
uv run --python 3.13 pytest     # one-off run on another interpreter
uv python upgrade 3.12          # latest patch release of 3.12
uv venv --python 3.12           # plain virtual environment at .venv
```

Requests accept `3.12`, `3.12.3`, `>=3.11,<3.13`, `pypy@3.10` and `3.13t` (free-threaded). uv downloads a missing interpreter automatically; pass `--no-python-downloads` to forbid that.

### pip-compatible interface

```bash
uv venv
uv pip install -r requirements.txt
uv pip compile requirements.in -o requirements.txt --universal
uv pip sync requirements.txt        # removes anything not listed
uv pip install --python .venv/bin/python 'rich>=13'
```

### CI and Docker

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
      - run: uv sync --locked --all-extras --dev
      - run: uv run pytest
```

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /bin/
WORKDIR /app
ENV UV_NO_DEV=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first, so this layer is reused until uv.lock changes
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked
ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "-m", "dispatch_api"]
```

Add `.venv` to `.dockerignore`; a host environment does not work inside the image.

## Examples

### Example 1: Move a requirements.txt service to a locked uv project

**Request:** "Our dispatch-api repo has requirements.txt and requirements-dev.txt. Move it to uv with a lockfile and make the tests run."

```bash
cd dispatch-api
uv init --bare --python 3.12
uv python pin 3.12
uv add -r requirements.txt
sed '/^-r /d' requirements-dev.txt | uv add --dev -r -
uv run python -m pytest -q
uv run ruff check .
```

**Result:** `pyproject.toml` lists the five runtime packages and a `dev` group, `uv.lock` pins 30 packages, and the checks pass. Abridged output:

```text
Initialized project `dispatch-api`
Pinned `.python-version` to `3.12`
 + uvicorn==0.34.0
 + pytest==8.3.4
 + ruff==0.8.6
1 passed, 1 warning in 0.12s
All checks passed!
```

### Example 2: A self-contained script

**Request:** "Write a disk usage report script I can copy to any server and run without setting up an environment."

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["rich>=13"]
# ///
import shutil

from rich.console import Console
from rich.table import Table

usage = shutil.disk_usage("/")
table = Table(title="Disk usage")
table.add_column("Total GB")
table.add_column("Free GB")
table.add_row(f"{usage.total / 1e9:.0f}", f"{usage.free / 1e9:.0f}")
Console().print(table)
```

```bash
chmod +x disk-report.py
./disk-report.py
```

**Result:** uv builds a cached environment with `rich` on the first run and prints the table; later runs start immediately.

```text
      Disk usage
┏━━━━━━━━━━┳━━━━━━━━━┓
┃ Total GB ┃ Free GB ┃
┡━━━━━━━━━━╇━━━━━━━━━┩
│ 3936     │ 2211    │
└──────────┴─────────┘
```

## Guidelines

- **Commit `uv.lock` and `.python-version`.** Never edit `uv.lock` by hand; change `pyproject.toml` or use `uv add`, `uv remove` and `uv lock`.
- **`--locked` or `--frozen`:** `--locked` verifies the lockfile and fails when it is stale, which suits CI. `--frozen` skips the check and installs exactly what the file says.
- **`uv sync` is exact, `uv run` is not.** `uv sync` removes packages that are not in the lockfile, including anything added with `uv pip install`. `uv run` only adds what is missing.
- **`uv pip` picks its target by discovery:** the active `VIRTUAL_ENV`, then `.venv` in the current directory or the nearest parent. Run from the wrong folder and it installs into someone else's environment. In scripts pass `--python` with the environment path.
- **Flat projects and pytest:** with `--bare` or `--no-package` the project itself is not installed, so `uv run pytest` can fail with `ModuleNotFoundError`. Use `uv run python -m pytest`, or set `pythonpath = ["."]` under `[tool.pytest.ini_options]`.
- **`uv init` defaults to a packaged `src/` layout.** Pass `--no-package` for a script-style project with `main.py`.
- **Experimental commands:** `uv format`, `uv check` and `uv audit` print a warning that they may change. Do not build pipelines on them yet.
- **Private indexes:** declare them under `[[tool.uv.index]]` and pass credentials through environment variables named after the index: for an index called `internal`, `UV_INDEX_INTERNAL_USERNAME` and `UV_INDEX_INTERNAL_PASSWORD`. Never commit them. The default `first-index` strategy protects against dependency confusion; avoid `unsafe-best-match`.
- **Supply chain:** `uv run`, `uvx` and scripts with inline metadata download and execute packages. Review the dependency list of any script from an untrusted source before running it.
- **`uv self update`** works only for installs made with the standalone installer.
- **CI cache:** run `uv cache prune --ci` before saving the cache to keep it small.
- **When NOT to use it:** uv installs from Python package indexes, git and local paths. It does not install conda packages or system libraries, so keep conda for stacks that depend on them.
