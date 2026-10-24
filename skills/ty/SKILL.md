---
name: ty
description: >-
  Checks Python code for type errors with ty, Astral's fast type checker and language server written in Rust. Use when a user asks to type check a Python project, add ty to pyproject.toml or CI, silence or baseline existing type errors, set up a type-checking language server in VS Code, Neovim, Zed or PyCharm, or move from mypy or pyright. Covers ty check, configuration, rule levels, ignore comments and output formats.
license: Apache-2.0
compatibility: "Python projects targeting 3.10+ (older targets work with less accurate stdlib stubs). Install with uv, pipx or pip; the standalone binary needs no Python. ty is in beta (0.0.x versioning)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "python, type-checking, language-server, astral, static-analysis"
  repository: https://github.com/astral-sh/ty
---

# ty — fast Python type checker and language server

## Overview

ty is a static type checker for Python and a language server, made by Astral (the authors of uv and Ruff). The command line reports type errors such as calling a method on a value that may be `None`, or assigning an `int` to a `str` variable. The same binary runs as a language server for editors.

ty uses `0.0.x` versions. Its own README warns that diagnostics and behavior can change between any two releases, so pin the version in projects and CI. The commands below were run against ty 0.0.91.

## Instructions

### Install

Prefer a project dependency so every developer and CI job uses the same version:

```bash
uv add --dev ty          # project dev dependency, run with: uv run ty check
uv tool install ty@latest  # global tool
pipx install ty          # global, without uv
pip install ty           # into the active environment
uvx ty check             # one-off run, nothing installed
```

Check the install with `ty --version`. Upgrading: `uv lock --upgrade-package ty`, `uv tool upgrade ty` or `pipx upgrade ty`.

### Run a check

```bash
ty check                    # whole project, from the current directory
ty check src tests/test_cart.py   # specific files or directories
ty check --project services/billing   # run for a project in a subdirectory
ty check --watch            # re-check when files change
```

Exit code is 1 when there are errors and 0 when clean. Warnings do not fail the run unless `--error-on-warning` is set.

ty needs to see the project's virtual environment to resolve third-party imports. It finds `.venv` (and an activated environment) by itself. For any other location, pass it:

```bash
ty check --python /srv/venvs/billing        # a venv directory or interpreter
ty check --python-version 3.12              # target version for syntax and stdlib types
ty check --extra-search-path vendor/        # extra module roots
```

If ty reports `unresolved-import` for packages that are installed, the environment was not found: pass `--python`.

### Configure

Put settings in `pyproject.toml` under `[tool.ty]`, or in a `ty.toml` file (same keys without the `tool.` prefix). Command-line options win over files.

```toml
[tool.ty.environment]
python-version = "3.12"
root = ["./src"]

[tool.ty.src]
exclude = ["build/", "migrations/"]

[tool.ty.rules]
possibly-missing-attribute = "warn"
unused-ignore-comment = "warn"

[[tool.ty.overrides]]
include = ["tests/**"]

[tool.ty.overrides.rules]
invalid-assignment = "ignore"
```

- `environment.python-version`: if absent, ty reads `project.requires-python`, then the environment's Python.
- `rules`: each rule is `"error"`, `"warn"` or `"ignore"`. List names and defaults with `ty explain rule` and read one with `ty explain rule invalid-assignment`.
- `overrides`: change rules for file globs, for example looser rules in tests.
- One-off rule level on the command line: `ty check --error possibly-missing-attribute --ignore unused-ignore-comment`.

### Suppress diagnostics

Add a comment on the offending line, naming the rule:

```python
price = find(items, "A1").price_cents  # ty: ignore[unresolved-attribute]
```

To baseline a legacy code base, let ty write the comments for every current error, then review the diff:

```bash
ty check --add-ignore
```

After that `ty check` passes, and new errors fail. Enable `unused-ignore-comment = "warn"` so stale ignores are reported once the code is fixed. `# type: ignore` comments are also honored.

### Output formats for CI

```bash
ty check --output-format concise     # one line per diagnostic
ty check --output-format github      # GitHub Actions annotations
ty check --output-format gitlab      # GitLab Code Quality JSON
ty check --output-format junit       # JUnit XML
ty check --exit-zero                 # report only, never fail (for a trial period)
```

A GitHub Actions step, using uv:

```yaml
- uses: astral-sh/setup-uv@v6
- run: uv sync --dev
- run: uv run ty check --output-format github
```

### Editor integration

The language server is `ty server`; editors start it themselves.

- VS Code: install the official ty extension from the Marketplace. It turns off the Python extension's own language server (`python.languageServer = "None"`). To use ty only for diagnostics next to Pylance, set `"python.languageServer": "Pylance"` and `"ty.disableLanguageServices": true`.
- Neovim 0.11+: `vim.lsp.enable('ty')` (config from nvim-lspconfig). Optional settings go through `vim.lsp.config('ty', { settings = { ty = {} } })`.
- Zed: ty is built in; list `"ty"` and `"ruff"` under `languages.Python.language_servers` to use it instead of basedpyright.
- PyCharm 2025.3+: Settings, Python, Tools, ty, tick Enable.
- Emacs 29+ with Eglot: map `python-base-mode` to `("ty" "server")`.
- Any other LSP client: run `ty server` over stdio.

### Coming from mypy or pyright

ty is gradual: unannotated code is treated leniently, so a first run on an untyped code base is usually quieter than strict mypy. It reads `pyproject.toml` itself and does not read `mypy.ini`, `[tool.mypy]` or `pyrightconfig.json`, so rules must be re-expressed in `[tool.ty]`. Its documentation has a "Coming from mypy, pyright" page and a typing FAQ; consult them when a diagnostic differs from the old tool, since ty's type system is still being completed. Run the old checker and ty side by side until the diagnostics you care about agree.

## Examples

### Example 1: first run on a small shop service

Request: "Type check the cart module and tell me what is wrong."

`src/shop/cart.py` ends with:

```python
price = find([Item("A1", 500)], "A1").price_cents
label: str = total([Item("A1", 500)])
```

where `find` returns `Item | None` and `total` returns `int`. Command:

```bash
ty check --output-format concise
```

Result:

```text
src/shop/cart.py:21:9: error[unresolved-attribute] Attribute `price_cents` is not defined on `None` in union `Item | None`
src/shop/cart.py:22:14: error[invalid-assignment] Object of type `int` is not assignable to `str`
Found 2 diagnostics
```

The agent fixes the first by handling `None` (`item = find(...)`, `if item is None: raise LookupError(...)`) and the second by changing the annotation to `int`, then reruns `ty check` until it prints `All checks passed!`.

### Example 2: adopt ty on a legacy service without a big-bang fix

Request: "Add ty to billing-service CI but do not block every PR on 300 old errors."

```bash
cd billing-service
uv add --dev ty
uv run ty check --exit-zero --output-format concise | tail -1   # Found 312 diagnostics
uv run ty check --add-ignore                                    # Added 312 ignore comments
uv run ty check                                                 # All checks passed!
git diff --stat
```

Then the agent adds `[tool.ty.rules] unused-ignore-comment = "warn"` to `pyproject.toml`, adds the CI step from the section above, and opens a pull request that lists the ignore comments as technical debt to burn down by rule, for example `grep -rn "ty: ignore\[invalid-argument-type\]" src | wc -l`.

## Guidelines

- Pin ty in the project (`uv add --dev ty`) and read release notes when upgrading: new versions can add or change diagnostics.
- Treat ty as a beta tool. If it disagrees with a mature checker on a construct, check the typing FAQ before rewriting code, and do not put its output on a required check until the team accepts that.
- Never fix a diagnostic by adding `# ty: ignore` without reading it. Use `--add-ignore` only deliberately, for a baseline, and review the diff.
- Third-party imports unresolved? The cause is nearly always a missing `--python` or an environment that is not installed, not a ty bug.
- `ty check` reads files only; it does not run your code or tests.
- Do not pipe an installer into a shell. If the standalone installer is needed, download it from astral.sh to a file, read it, then run it.
- Do not use it for non-Python code, and it does not replace a linter or formatter: use Ruff for those.
