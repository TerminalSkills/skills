---
name: gitnexus
description: >-
  GitNexus indexes a codebase into a local knowledge graph of symbols, calls,
  imports, clusters and execution flows, and serves it to AI coding agents
  through an MCP server and a CLI. Use when a user asks to index a repo with
  GitNexus, set up the GitNexus MCP server for Claude Code, Cursor or Codex,
  check what breaks before changing a function (impact, blast radius), see how
  a feature flows through the code, review the impact of uncommitted changes,
  run Cypher queries on a code graph, or explore a repository in the GitNexus
  web UI.
license: MIT
compatibility: "Node.js 22.18+ or 24.11+. Linux, macOS or Windows. An MCP-capable agent (Claude Code, Cursor, Codex, OpenCode, Windsurf) for the MCP tools."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/abhigyanpatwari/GitNexus
  tags: [knowledge-graph, code-analysis, graph-rag, mcp, ai-agents]
  use-cases:
    - "Index a repository and give an AI agent MCP tools for impact analysis"
    - "Find every caller and execution flow affected before changing a function"
    - "Query a codebase's call graph with Cypher from the terminal"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# GitNexus

## Overview

GitNexus parses a repository with Tree-sitter, resolves imports and calls across files, groups symbols into clusters, traces execution flows from entry points, and stores the result in an embedded graph database inside the repo (`.gitnexus/`). Agents query that graph through an MCP server (`gitnexus mcp`); people query it with the same commands on the CLI. Indexing and queries run locally. A browser UI at gitnexus.vercel.app can explore small repos in WebAssembly or connect to a local `gitnexus serve`. This skill follows GitNexus 1.6.12.

## Instructions

### Install and index a repository

```bash
npm install -g gitnexus          # or run each command as: npx gitnexus@latest ...
cd ~/code/checkout-service
gitnexus analyze                 # index the repo that contains the current directory
gitnexus list                    # all indexed repos (registry in ~/.gitnexus/registry.json)
gitnexus status                  # freshness of this repo's index (needs a Git repository)
```

`analyze` writes more than the index. By default it also creates or updates a GitNexus section in `AGENTS.md` and `CLAUDE.md` and installs six skills under `.claude/skills/gitnexus-*`. Control that with flags:

```bash
gitnexus analyze --index-only        # index only: no AGENTS.md, CLAUDE.md or skills
gitnexus analyze --skip-agents-md    # keep your own AGENTS.md / CLAUDE.md untouched
gitnexus analyze --skip-skills       # do not install the standard skills
gitnexus analyze --force             # full rebuild instead of an incremental update
gitnexus analyze --embeddings        # add semantic vectors (off by default, slower)
gitnexus analyze --skip-git          # index a folder that is not a Git repository
gitnexus analyze --watch             # keep the index current while you edit (Git repos only)
```

Recurring options can live in a committed `.gitnexusrc` JSON file at the repo root, for example `{ "skipSkills": true, "defaultBranch": "develop" }`; CLI flags override it. Files are skipped according to `.gitignore` and `.gitnexusignore`, and anything over 512 KB is skipped unless `--max-file-size` raises the limit.

### Connect an agent over MCP

```bash
gitnexus setup                       # detect installed editors; write their MCP config, skills and hooks
gitnexus setup -c cursor,codex       # only the listed agents

# Or register the server by hand
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
codex mcp add gitnexus -- npx -y gitnexus@latest mcp
```

For Cursor, add the same server to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gitnexus": { "command": "npx", "args": ["-y", "gitnexus@latest", "mcp"] }
  }
}
```

One server process serves every indexed repo. The tools an agent gets in 1.6.12:

| Tool | Purpose |
| --- | --- |
| `list_repos` | Indexed repositories |
| `query` | Hybrid search that returns execution flows related to a concept |
| `context` | One symbol with its callers, callees and the flows it takes part in |
| `impact` | Blast radius of changing a symbol, grouped by depth, with a risk level |
| `trace` | Shortest call path between two symbols |
| `detect_changes` | Maps the current Git diff to changed symbols and affected flows |
| `rename` | Coordinated multi-file rename; call it with `dry_run: true` first |
| `cypher` | Raw Cypher against the graph |
| `check` | Structural checks such as circular imports |
| `route_map`, `tool_map`, `shape_check`, `api_impact` | API routes, their consumers and response shapes |
| `explain`, `pdg_query` | Taint findings and statement-level dependence (index built with `--pdg`) |
| `group_list`, `group_sync` | Cross-repository groups |

Set `GITNEXUS_MCP_READ_ONLY=1` in the server's environment to hide `cypher`, `rename` and the group tools.

### Query from the terminal

The CLI mirrors the MCP tools and prints JSON:

```bash
gitnexus query "checkout total"                         # flows related to a concept
gitnexus context OrderService                           # callers, callees, methods, flows
gitnexus impact calculateTotal                          # who breaks if this changes (upstream)
gitnexus impact calculateTotal --direction downstream   # what it depends on
gitnexus impact subtotal --file src/pricing.ts          # disambiguate a common name
gitnexus trace handleCheckout applyDiscount             # shortest call path
gitnexus detect-changes --scope all                     # staged + unstaged diff -> affected flows
gitnexus detect-changes --scope compare --base-ref main # branch vs main
gitnexus check --cycles                                 # non-zero exit on circular imports
gitnexus cypher "MATCH (f:Function) RETURN f.name, f.filePath LIMIT 5"
```

Add `-r checkout-service` (name or path) when more than one repository is indexed.

### Web UI and wiki

```bash
gitnexus serve                       # HTTP API on http://127.0.0.1:4747 for the web UI
gitnexus wiki --provider openai --model gpt-4o   # LLM-written docs; reads OPENAI_API_KEY
```

With `gitnexus serve` running, gitnexus.vercel.app connects to the local server and shows the repos you already indexed. Without it the page indexes an uploaded repo in the browser, which is limited by browser memory (about 5,000 files).

### Remove

```bash
gitnexus clean          # show which index would be deleted for this repo; --force deletes it
gitnexus uninstall      # preview removal of MCP entries, skills and hooks; --force applies it
```

## Examples

### Example 1: What breaks if I change this function?

**User request:** "Index this repo and tell me what depends on `calculateTotal` before I change its signature."

```bash
cd ~/code/checkout-service
gitnexus analyze --index-only
gitnexus impact calculateTotal --summary-only
```

```text
  Repository indexed successfully (7.1s)
  28 nodes | 47 edges | 4 clusters | 2 flows

{
  "target": { "id": "Function:src/pricing.ts:calculateTotal", "type": "Function", "filePath": "src/pricing.ts" },
  "direction": "upstream",
  "impactedCount": 2,
  "risk": "LOW",
  "summary": { "direct": 1, "processes_affected": 1, "modules_affected": 1 },
  "byDepthCounts": { "1": 1, "2": 1 },
  "affected_processes": [ { "name": "handleCheckout", "filePath": "src/api.ts", "earliest_broken_step": 1 } ]
}
```

The JSON is trimmed to its main fields. Depth 1 is the direct caller (`OrderService.placeOrder`), depth 2 the route handler that reaches it. Drop `--summary-only` to list each symbol with its file. An agent connected over MCP gets the same data from `impact({target: "calculateTotal", direction: "upstream"})`.

### Example 2: How does a request reach this code?

**User request:** "Show me how the checkout handler ends up in the discount logic, and who else calls `calculateTotal`."

```bash
gitnexus trace handleCheckout applyDiscount
gitnexus cypher "MATCH (a)-[r:CodeRelation {type: 'CALLS'}]->(b:Function {name: 'calculateTotal'}) RETURN a.name, a.filePath"
```

```text
{ "status": "ok", "hopCount": 3,
  "hops": [ { "name": "handleCheckout", "filePath": "src/api.ts", "startLine": 4 },
            { "name": "placeOrder", "filePath": "src/orders.ts", "startLine": 5 },
            { "name": "calculateTotal", "filePath": "src/pricing.ts", "startLine": 10 },
            { "name": "applyDiscount", "filePath": "src/pricing.ts", "startLine": 6 } ] }

{ "markdown": "| a.name | a.filePath |\n| --- | --- |\n| placeOrder | src/orders.ts |", "row_count": 1 }
```

All relationships are `CodeRelation` edges with a `type` property, such as `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `HAS_METHOD`, `MEMBER_OF` (symbol to cluster) and `STEP_IN_PROCESS` (symbol to execution flow). The MCP resource `gitnexus://repo/checkout-service/schema` lists the full schema.

## Guidelines

1. **License** — GitNexus is published under PolyForm Noncommercial 1.0.0. Commercial use needs a license from the maintainers (Akon Labs); check before adding it to a company workflow.
2. **`analyze` edits the repo** — it rewrites the GitNexus block in `AGENTS.md` and `CLAUDE.md` and adds `.claude/skills/`. Use `--index-only` in CI and in repos where those files are maintained by hand. `.gitnexus/` ignores itself, so the index is never committed.
3. **A stale index gives wrong answers** — re-run `gitnexus analyze` after pulling or committing, or keep `gitnexus analyze --watch` running. `gitnexus status` shows whether the index matches the current commit.
4. **Empty impact is not proof** — dynamic dispatch, reflection and cross-language calls may not resolve. A result with `risk: UNKNOWN` or zero callers should be confirmed with a text search before deleting or renaming.
5. **Keep the servers on loopback** — `gitnexus serve` and `gitnexus mcp --http` bind to 127.0.0.1. Binding `mcp --http` to another interface requires `--auth-token` or `GITNEXUS_MCP_AUTH_TOKEN`; anyone who reaches the API can read every indexed repo.
6. **Limit what agents can do** — `rename` edits files and `cypher` can run any query. Use `GITNEXUS_MCP_READ_ONLY=1`, and `GITNEXUS_MCP_ALLOWED_REPOS` to expose only named repositories.
7. **Install problems** — on npm 11 `npx gitnexus` can crash with `Cannot destructure property 'package' of 'node.target'`; install globally instead. A global install also starts the MCP server faster than `npx`. Without a C++ toolchain, set `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` before installing (Dart, Proto, Swift, Kotlin and Zig files are then not parsed).
8. **Wiki sends code to an LLM** — unlike indexing and querying, `gitnexus wiki` sends repository content to the LLM provider you configure, and `--api-key` saves the key in `~/.gitnexus/config.json`. Prefer `GITNEXUS_API_KEY` or `OPENAI_API_KEY` in the environment.
9. **When not to use it** — for a small project that fits in the agent's context, plain search is enough; the graph pays off on large or unfamiliar codebases and before risky refactors.
