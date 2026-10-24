---
title: Adopt Python Type Checking in CI with ty
slug: adopt-python-type-checking-in-ci-with-ty
description: Add a fast type checker to an existing untyped Python service and make CI block new type errors without forcing the team to fix hundreds of old ones first.
skills:
  - ty
  - uv
  - ruff
  - github-actions
category: development
tags:
  - python
  - type-checking
  - ci-cd
  - static-analysis
  - technical-debt
---

## The Problem

Mei Tanaka maintains `billing-service`, a 14,000-line FastAPI service that grew without a type checker. Twice this quarter a production error came from a value that could be `None`: a lookup helper returned `Customer | None` and a caller used `.email` on it. Code review did not catch either one. She wants type errors found before merge, but she has seen what happens when a strict checker is switched on in an old code base: 300 failures, a red CI for two weeks, and the team turns the job off.

## The Solution

Add ty, Astral's Python type checker, as a pinned dev dependency. Run it once to see the real size of the problem, write an ignore comment on every existing error so the baseline passes, and then run it in CI with annotations on pull requests. From then on, new code must be type-clean and old errors are visible, countable debt. uv manages the dependency, Ruff stays the linter and formatter, and GitHub Actions runs the check.

## Step-by-Step Walkthrough

### 1. Install ty as a dev dependency and look at the damage

The prompt to the agent: "Add ty to billing-service and tell me how many type errors we have today, grouped by rule."

```bash
cd billing-service
uv add --dev ty
uv run ty --version
uv run ty check --exit-zero --output-format concise > /tmp/ty-before.txt
tail -1 /tmp/ty-before.txt
grep -o "error\[[a-z-]*\]" /tmp/ty-before.txt | sort | uniq -c | sort -rn
```

The agent reports the total (for this service, 312 diagnostics) and the top rules, for example 140 `unresolved-attribute`, 90 `invalid-argument-type` and 40 `invalid-assignment`. `--exit-zero` keeps the command from failing while the team is only measuring. If ty reports `unresolved-import` for packages that are installed, the agent reruns with `--python .venv` before trusting the numbers.

### 2. Configure the project

The prompt: "Set ty up for Python 3.12, skip generated code, and relax the rules for tests."

The agent edits `pyproject.toml`:

```toml
[tool.ty.environment]
python-version = "3.12"
root = ["./src"]

[tool.ty.src]
exclude = ["src/billing/generated/"]

[tool.ty.rules]
unused-ignore-comment = "warn"

[[tool.ty.overrides]]
include = ["tests/**"]

[tool.ty.overrides.rules]
invalid-argument-type = "ignore"
```

It then runs `uv run ty check` again and confirms the count dropped by the excluded and relaxed files.

### 3. Baseline the existing errors

The prompt: "Make the check pass today without changing behavior, so only new errors fail."

```bash
uv run ty check --add-ignore
uv run ty check
git diff --stat
```

ty writes a `# ty: ignore[rule-name]` comment on every line that currently fails and then prints `All checks passed!`. The agent opens the diff, confirms that only comments were added, and runs the test suite to be sure nothing else changed:

```bash
uv run pytest -q
uv run ruff check src
```

### 4. Add the CI job

The prompt: "Run ty on every pull request and show errors as annotations."

The agent creates `.github/workflows/typecheck.yml`:

```yaml
name: typecheck
on:
  pull_request:
  push:
    branches: [main]
jobs:
  ty:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --dev
      - run: uv run ty check --output-format github
```

A pull request that reintroduces the original bug now fails with an annotation on the exact line, for example `unresolved-attribute: Attribute 'email' is not defined on 'None' in union 'Customer | None'`.

### 5. Burn the baseline down by rule

The prompt: "Fix the 40 invalid-assignment ignores and show me what is left."

```bash
grep -rn "ty: ignore\[invalid-assignment\]" src | wc -l
```

The agent fixes those call sites (usually a wrong annotation or a missing `None` check), deletes the matching comments, and reruns `uv run ty check`. Because `unused-ignore-comment` is a warning, any ignore that is no longer needed is reported, so stale comments do not pile up. Each rule gets its own small pull request.

### 6. Turn on the editor feedback

The prompt: "How do I get these errors in VS Code?"

The agent tells Mei to install the official ty extension, which disables the Python extension's built-in language server by default. For Neovim 0.11 or newer the agent adds `vim.lsp.enable('ty')` after installing nvim-lspconfig.

## Real-World Example

Mei runs the first step on a Tuesday morning and sees 312 diagnostics, 140 of them `unresolved-attribute`, the same family as the two incidents. She does not ask the team to fix them. By lunchtime the baseline pull request is open: 312 added comments, no code changes, all 118 tests passing, and a CI job that finishes in about 6 seconds. The next day a colleague's pull request adds `customer = repo.find(email)` followed by `customer.plan`; CI fails with an annotation on that line, and the bug is fixed before review. Over the following three weeks the team removes the ignores one rule at a time and the count falls from 312 to 41.

## Related Skills

- [ty](/skills/ty) — runs the type check, holds the configuration and writes the baseline ignore comments
- [uv](/skills/uv) — adds ty as a pinned dev dependency and runs it in the project environment
- [ruff](/skills/ruff) — keeps linting and formatting separate from type checking
- [github-actions](/skills/github-actions) — runs the check on every pull request
