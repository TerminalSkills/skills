---
name: codegraph
description: >-
  CodeGraph indexes a source tree into a local SQLite knowledge graph of symbols, calls and imports, and serves it to coding agents over MCP and a CLI. Use it when an agent burns tool calls on grep and file reads to understand a codebase, or when you need callers, callees, blast radius or affected tests for a symbol. Covers install, `codegraph init`, query/explore/impact/affected commands, MCP registration, exclusions and troubleshooting. Triggers: "index my repo for the agent", "who calls this function", "what breaks if I change this", "codegraph".
license: Apache-2.0
compatibility: "Node.js and npm for the npm install (the tool bundles its own runtime, so Node is otherwise not required); macOS, Linux or Windows"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "code-graph, mcp, code-intelligence, impact-analysis, agents"
  repository: https://github.com/colbymchenry/codegraph
---
# CodeGraph — a local code knowledge graph for coding agents

## Overview

CodeGraph parses a project with tree-sitter, stores every symbol (functions, classes, methods) and relationship (calls, imports, extends, implements) in `.codegraph/codegraph.db` inside the project, and answers structural questions from that index instead of from repeated grep and file reads. Everything runs locally: no API keys, no network service. A file watcher keeps the index current while an agent works.

It has two faces:

- an MCP server (`codegraph serve --mcp`) that agents launch themselves; by default it exposes one tool, `codegraph_explore`, which returns the relevant source, call paths and a blast-radius summary in a single call;
- a CLI (`codegraph query`, `callers`, `callees`, `impact`, `affected`, ...) that a person, a script, or an agent without MCP can call directly.

It supports about 30 languages including TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C/C++, Swift, Kotlin and Dart. It is a code-structure index, not a documentation generator or a visual explorer.

## Instructions

### Install

Lead with the package manager. The package is `@colbymchenry/codegraph` (binary `codegraph`):

```bash
npm install -g @colbymchenry/codegraph
codegraph version
```

The project also publishes a standalone installer (`install.sh` / `install.ps1` in the repository root) for machines without Node. If you use it, download the file, read it, then run it as a separate step; do not pipe it into a shell.

Upgrade with `codegraph upgrade` (add `--check` to only look, or pass a version to pin it). Remove with `codegraph uninstall` (`--keep-cli` keeps the binary).

### Index a project

Run once per project, from its root:

```bash
cd ~/work/storefront
codegraph init
```

`init` creates `.codegraph/` and builds the whole graph in one step; it refuses a home folder or filesystem root unless you pass `--force`; `--yes` skips every prompt for scripts and CI. Afterwards:

```bash
codegraph status          # file, node and edge counts, DB size, journal mode
codegraph sync            # incremental update (normally the watcher does this)
codegraph index --force   # full re-index if the graph looks wrong
codegraph uninit          # delete the graph for this project
```

`.codegraph/` is generated data: add it to `.gitignore` unless the team decides otherwise.

### Query the graph from the CLI

```bash
codegraph query checkout --limit 5          # find symbols by name (--kind, --json)
codegraph explore "how is the order total computed"   # source + call paths in one shot
codegraph node total                        # one symbol's source plus its callers
codegraph callers total                     # who calls it
codegraph callees checkout                  # what it calls
codegraph impact total --depth 3            # everything affected by changing it
codegraph files --max-depth 2               # project structure (--format, --filter, --json)
```

`explore` prints the same payload the MCP tool returns. `--json` on `query`, `callers`, `callees`, `impact` and `files` gives machine-readable output.

### Find the tests a change affects

`affected` follows imports transitively from changed files to test files:

```bash
codegraph affected src/cart.ts src/order.ts
git diff --name-only HEAD | codegraph affected --stdin --quiet
codegraph affected src/auth.ts --filter "e2e/*" --depth 5
```

`--quiet` prints only paths, so the result can be handed to a test runner (`npx vitest run $(...)`).

### Connect an agent over MCP

The documented route is the installer, run in a terminal where you are happy for it to edit agent configuration:

```bash
codegraph install                       # interactive: choose agents and global/local scope
codegraph install --yes --init          # non-interactive, then index the current project
codegraph install --target=claude,codex --location=local --yes
```

It detects Claude Code, Cursor, Codex CLI, opencode, Hermes Agent, Gemini CLI, Antigravity IDE, Kiro and GitHub Copilot, writes each one's MCP entry plus a short marked instructions section, and for Claude Code also adds an auto-allow permission (`mcp__codegraph__*`) and a `UserPromptSubmit` hook running `codegraph prompt-hook`. With `--location=local` for Claude Code the files are `.mcp.json`, `.claude/settings.json` and `.claude/CLAUDE.md` inside the project; the global location edits files in your home directory. `codegraph uninstall` reverses all of it. Restart the agent afterwards; it uses CodeGraph automatically in any project that has a `.codegraph/` directory.

To see what would be written without touching any file:

```bash
codegraph install --print-config claude
codegraph install --print-config codex
```

For Claude Code the printed entry (the global location is `~/.claude.json`; the local one is the project's `.mcp.json`) is:

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"],
      "alwaysLoad": true
    }
  }
}
```

and for Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.codegraph]
command = "codegraph"
args = ["serve", "--mcp"]
```

The installer does not index anything. A single global install serves every project; run `codegraph init` in each one. The MCP tools accept a `projectPath`, so one session can query a second indexed repo.

### Control what is indexed

Zero config is the default. Out of the box CodeGraph skips dependency and build directories (`node_modules`, `vendor`, `dist`, `target`, `.venv`, ...), anything in `.gitignore`, and files over 1 MB. To change that, edit `.gitignore` (a `!vendor/` negation pulls a skipped directory back in), or create `codegraph.json` in the project root:

```json
{
  "exclude": ["static/vendor-theme/", "**/generated/**"],
  "include": ["Tools/"]
}
```

`exclude` removes committed directories that `.gitignore` cannot; `include` force-adds gitignored source. The README also documents a `deprioritize` list for directories that should stay searchable but not outrank real code.

## Examples

### Example 1: Index a service and ask what a change touches

Request: "Before I rename `calculateShipping` in the orders service, show me everything that depends on it."

```bash
cd ~/work/orders-service
codegraph init --yes
codegraph callers calculateShipping --limit 20
codegraph impact calculateShipping --depth 3 --json > shipping-impact.json
git diff --name-only HEAD | codegraph affected --stdin --quiet
```

Result: `init` prints the file, node and edge counts it indexed. `callers` lists each calling function with its file and line. `impact` reports the affected symbols grouped by file, and `affected` prints only the test files reachable from the diff, which the agent then runs instead of the whole suite. In a two-file sample (`cart.ts` exporting `total`, `order.ts` calling it) `impact total` listed three affected symbols across both files.

### Example 2: Give Claude Code a code graph without changing config blindly

Request: "Set up CodeGraph for my agent, but show me what it changes first."

```bash
npm install -g @colbymchenry/codegraph
codegraph install --print-config claude
codegraph install --target=claude --location=local --yes --init
codegraph status
```

Result: the first install prints the JSON entry above and the file it belongs in. The second writes that entry for this project only, adds the auto-allow permission, a prompt hook and a marked instructions section under `.claude/`, and builds the index. `status` confirms files and nodes were indexed and `Journal: wal`. After restarting Claude Code, a question such as "how does a request reach the database?" is answered with one `codegraph_explore` call.

### Example 3: Run only the tests a pull request can break in CI

Request: "Make CI run just the tests affected by the PR."

```bash
npm install -g @colbymchenry/codegraph
codegraph init --yes
AFFECTED=$(git diff --name-only origin/main...HEAD | codegraph affected --stdin --quiet)
if [ -n "$AFFECTED" ]; then npx vitest run $AFFECTED; else echo "no affected tests"; fi
```

Result: only test files that import (transitively, up to depth 5 by default) a changed source file are run. If the changed code has no tests in the graph, the script prints a message instead of running everything, so decide per repo whether that should fail the build.

## Guidelines

- `codegraph install` edits real agent configuration files and instruction files. Use `--print-config` first, prefer `--location=local` when experimenting, and never run it from an unattended script on a shared machine.
- The graph is static analysis. It follows imports, calls and framework routes it recognizes; dynamic behavior it cannot resolve (reflection, string-built calls) will be missing. Treat an empty `callers` result as "none found", not proof.
- Default MCP surface is the single `codegraph_explore` tool. Other tools (`codegraph_node`, `codegraph_search`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_files`, `codegraph_status`) exist but are unlisted; re-enable with the `CODEGRAPH_MCP_TOOLS` environment variable (for example `explore,node,callers`) or use the CLI equivalents.
- The watcher debounces for 2 seconds (`CODEGRAPH_WATCH_DEBOUNCE_MS`, clamped to 100 ms - 60 s). Right after an edit a response may carry a staleness banner naming the pending file; read that file directly or run `codegraph sync`.
- Only one live MCP writer per project. If auto-sync stops with two `serve --mcp` processes, let the shared daemon handle them or set `CODEGRAPH_NO_DAEMON=1` for a single process. `codegraph unlock` removes a stale lock blocking indexing.
- Keep the project on a local disk. If `codegraph status` shows a journal mode other than `wal` (network shares, WSL2 `/mnt`), reads can block on writes. For `Transport closed` errors under WSL2 on a Windows drive, set `CODEGRAPH_NO_DAEMON=1` or move the project into the Linux filesystem.
- Returned source is read from disk at call time and arrives as one dense block that stays in the context window. In long sessions on small context windows, budget for that.
- Anonymous usage telemetry is on by default (no code, paths or names, per the project's notice). Turn it off with `codegraph telemetry off` or `CODEGRAPH_TELEMETRY=0`.
- Not the right tool for: generating architecture documentation or diagrams, searching prose and PDFs, or one-off questions about a three-file script where reading the files is cheaper than indexing.
