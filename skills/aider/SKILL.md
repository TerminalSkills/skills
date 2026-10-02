---
name: aider
description: >-
  Aider is an open-source terminal AI pair programmer that edits files in your
  git repository with an LLM and commits each change. Use when a user asks to
  run Aider, let an AI refactor or fix code from the command line, script
  Aider with --message, auto-run lint and tests after edits, or point Aider at
  Claude, GPT, Gemini, DeepSeek or a local model.
license: Apache-2.0
compatibility: "Python 3.10-3.12 (aider-install can fetch 3.12), git, an LLM API key or local model"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/Aider-AI/aider
  category: development
  tags:
    - ai-coding
    - terminal
    - code-generation
    - pair-programming
    - git
---

# Aider — AI Pair Programming in Your Terminal

## Overview

Aider runs in a git repository, sends the files you add (plus a map of the rest of the repo) to an LLM, applies the returned edits to your files, and makes a git commit for each change. It works with Claude, GPT, Gemini, DeepSeek and local models through LiteLLM. Latest release checked: 0.86.2 (February 2026).

## Instructions

### Install

```bash
python -m pip install aider-install
aider-install            # installs aider in its own environment (adds Python 3.12 if needed)

# or with uv directly
uv tool install --force --python python3.12 --with pip aider-chat@latest
```

Aider also publishes a `curl ... | sh` installer; prefer the package-manager routes above. Plain `pip install aider-chat` into a project environment works but can clash with your dependencies; it supports Python 3.10 to 3.12.

### Provide a model and key

```bash
export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY
aider --model sonnet                # built-in aliases: sonnet, opus, haiku, 4o, deepseek, r1, flash, gemini
aider --list-models claude          # search known model names
aider --model ollama_chat/qwen2.5-coder:14b   # local model via Ollama (set OLLAMA_API_BASE)
```

Keys can also live in a `.env` file in the repo root (keep it git-ignored).

### Interactive use

```bash
cd ~/work/billing-api
aider src/invoices.py tests/test_invoices.py     # files to edit, given on the command line
aider --read CONVENTIONS.md src/invoices.py      # read-only context
```

In-chat commands: `/add`, `/drop`, `/read-only`, `/ask` (discuss, no edits), `/code`, `/architect` (planner model plus editor model), `/run <cmd>` (output into chat), `/test <cmd>`, `/lint`, `/diff`, `/undo` (revert the last Aider commit), `/tokens`, `/model`, `/clear`, `/reset`, `/exit`. Switch the sticky mode with `/chat-mode ask`. A good loop is `/ask` to agree on a plan, then `/code go ahead`.

### Scripted use

```bash
aider --message "Add a deleted_at filter to list_invoices and update its test" \
      --yes-always src/invoices.py tests/test_invoices.py

aider --message-file migration-task.md --yes-always src/db/models.py
```

`--message` (`-m`) sends one instruction, applies edits and exits. `--yes-always` answers every prompt with yes: use it only in a clean branch or throwaway checkout. `--dry-run` shows edits without writing them; `--no-auto-commits` leaves changes uncommitted; `--commit` commits pending changes with a generated message.

### Lint and test after each edit

```bash
aider --lint-cmd "python: ruff check --fix" --lint-cmd "javascript: npx eslint --fix" \
      --test-cmd "pytest -x -q" --auto-test
```

Linting of edited files is on by default (`--no-auto-lint` disables it) and uses built-in linters unless `--lint-cmd` is set. `--auto-test` is off by default. Commands must print errors and exit non-zero on failure; Aider then tries to fix them. A formatter that exits non-zero when it rewrites files confuses this: wrap it in a script that runs twice.

### Configuration

```yaml
# .aider.conf.yml  (read from home dir, repo root, then current dir; later files win)
model: sonnet
auto-test: true
test-cmd: pytest -x -q
lint-cmd:
  - "python: ruff check --fix"
read:
  - CONVENTIONS.md
map-tokens: 2048
```

Every option also exists as an `AIDER_*` environment variable (for example `AIDER_MODEL`, `AIDER_AUTO_TEST`). Only OpenAI and Anthropic keys may go in the YAML file; use `.env` for the rest.

### Python scripting

```python
from aider.coders import Coder
from aider.models import Model

coder = Coder.create(main_model=Model("gpt-4o"), fnames=["src/invoices.py"])
coder.run("add type hints to every function")
```

This API is not officially supported and can change between releases; prefer the `--message` command line.

### Edit in your IDE

`aider --watch-files` watches the repo for one-line comments ending in `AI!` (make this change) or `AI?` (answer this question) and acts on them.

## Examples

### Fix a bug and prove it with tests

User: "Pagination in the orders list repeats rows when sorted by created_at. Fix it with Aider and run the tests."

```bash
git switch -c fix/orders-pagination
aider --model sonnet --test-cmd "pytest tests/test_orders.py -q" --auto-test \
      --message "list_orders repeats rows across pages when sorting by created_at. Add id as a tiebreaker sort key and add a regression test." \
      app/orders.py tests/test_orders.py
```

Result: Aider prints the diff, runs pytest, retries if it fails, and creates a commit such as `fix: add id tiebreaker to list_orders ordering`. Review with `git show`, undo with `/undo` or `git reset`.

### Plan with one model, edit with another

User: "I want the strongest model to plan a refactor and a cheap one to type it."

```bash
aider --architect --model opus --editor-model sonnet --read CONVENTIONS.md src/payments/
```

Describe the refactor at the `architect>` prompt; the architect proposes the change, and it is applied automatically unless you pass `--no-auto-accept-architect`.

## Guidelines

- Aider commits every change and by default adds a `Co-authored-by` trailer; `--no-attribute-co-authored-by` removes it, and `--attribute-author` or `--attribute-committer` mark the git author or committer name instead. Dirty files are committed first (`--no-dirty-commits` to stop that).
- Run it on a branch; `git diff main` is your review step. Never combine `--yes-always` with credentials or deploy scripts in the repo.
- Add only the files that need edits; the repo map supplies the rest. Use `/read-only` for schemas and conventions.
- Model aliases move as new models ship; run `aider --list-models` when a name is rejected.
- Each prompt sends file contents to the model provider; do not add secret files, and use a local model for private code.
- Edit formats (`--edit-format whole|diff|udiff|diff-fenced`) default per model; override only when edits fail to apply.
