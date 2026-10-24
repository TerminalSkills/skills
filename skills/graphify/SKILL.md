---
name: graphify
description: >-
  Turns a folder of code, docs, PDFs and images into a knowledge graph that coding agents can query from the command line instead of re-reading files. Use when a user asks to map a codebase, build a graph of a repo plus its docs, find what depends on a function, trace the path between two concepts, cut the tokens an agent spends exploring a project, or keep a graph updated on every commit. Covers the graphify CLI, graph.json queries, git hooks and agent integration.
license: Apache-2.0
compatibility: "Python 3.10+. PyPI package graphifyy, CLI graphify. Code-only graphs need no API key; docs, papers and images need an LLM backend (Gemini, Claude, OpenAI, DeepSeek, Kimi or Ollama)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "knowledge-graph, codebase, agents, code-navigation, documentation"
  repository: https://github.com/Graphify-Labs/graphify
---

# graphify — a queryable knowledge graph of your code and docs

## Overview

graphify scans a directory and writes `graphify-out/graph.json`: nodes for files, classes, functions, concepts and documents, and typed edges between them (`calls`, `imports_from`, `contains`, `inherits`, and others). Code is parsed locally with tree-sitter, so a code-only graph is free and deterministic. Documents, PDFs and images go through an LLM to pull out concepts and relationships. Every edge is tagged `EXTRACTED` (found in the source), `INFERRED` (guessed by a model) or `AMBIGUOUS`, so an agent can tell facts from guesses.

An agent then answers structure questions with `graphify query`, `path`, `explain` and `affected`, which return a small subgraph, instead of grepping and reading many files. The gain grows with corpus size; on a handful of files the whole project fits in context anyway.

This skill is for the graphify CLI. For chat-style code understanding inside the editor, see the existing `understand-*` skills.

## Instructions

### Install

The PyPI package is named `graphifyy` (two y); the command is `graphify`.

```bash
pipx install graphifyy        # recommended: isolated, puts graphify on PATH
# or: pip install graphifyy   # inside a virtual environment
graphify --help
```

To teach a coding agent about the tool, `graphify install --platform claude` copies the skill into the agent's config (other values include `codex`, `gemini`, `cursor`, `opencode`). This edits the user's agent configuration, so run it only when the user asks. Project-level variants such as `graphify claude install` (adds a section to `CLAUDE.md` and a hook) are removed with the matching `uninstall`.

### Build a graph

```bash
graphify extract . --code-only      # AST only: no API key, no network
graphify cluster-only .             # name communities, write GRAPH_REPORT.md and graph.html
```

`extract` writes `graphify-out/graph.json` plus a cache under `graphify-out/cache/`. Re-runs only reprocess changed files.

For docs, PDFs and images, choose an LLM backend. It is read from whichever provider key is set in the environment, or pass it explicitly:

```bash
graphify extract . --backend ollama --max-concurrency 1        # local model, nothing leaves the machine
graphify extract . --backend gemini --mode deep                # more INFERRED edges
graphify extract ./docs --backend openai --out ./graphs/docs   # OPENAI_BASE_URL + OPENAI_MODEL reach any OpenAI-compatible server
```

Backends are `gemini`, `kimi`, `claude`, `openai`, `deepseek` and `ollama`. Without `--code-only`, document content is sent to the chosen provider: do not run it on confidential files with a hosted backend. Other flags that matter: `--no-gitignore` (index files that git ignores), `--token-budget`, `--api-timeout`, and `--postgres DSN` or `--cargo` to add a database schema or crate dependencies.

Put a `.graphifyignore` in the root to exclude folders (generated code, `node_modules`, vendored data).

### Query the graph

All of these read `graphify-out/graph.json` by default; use `--graph` for another file.

```bash
graphify query "how is the invoice total computed" --budget 1500
graphify query "refund" --seed Invoice --dfs      # start at a node, go deep
graphify path ".total()" "vat_rate()"          # shortest path between two nodes
graphify explain "vat_rate"                       # a node and its neighbours
graphify affected "vat_rate" --depth 2            # what breaks if this changes
graphify god-nodes --top 10                       # most connected hubs
```

`query`, `path` and `explain` exit 0 with an answer, 3 when the name is ambiguous (candidates are listed, pick one and retry), and 4 when nothing matches. `--budget N` caps output at N tokens (default 2000), which keeps an agent's context small.

### Keep it current

```bash
graphify update .            # re-extract changed code files, no LLM needed
graphify hook install        # git hooks rebuild the graph on commit, checkout, merge, rewrite
graphify hook status
graphify watch .             # rebuild on code changes while you work
```

`hook install` also registers a merge driver so two branches that changed `graph.json` merge instead of conflicting. After a refactor that deletes a lot of code, `update` refuses to shrink the graph; add `--force` once you have checked that is intended.

### Export and combine

```bash
graphify export html          # interactive graph.html
graphify export wiki          # markdown articles an agent can browse from index.md
graphify export obsidian --dir ./vault
graphify export graphml       # Gephi, yEd
graphify merge-graphs service-a/graphify-out/graph.json service-b/graphify-out/graph.json --out merged.json
```

`graphify benchmark graphify-out/graph.json` prints the token reduction against reading the raw corpus.

## Examples

### Example 1: who is affected by changing the VAT logic

Request: "We are changing `vat_rate`. What else depends on it?"

```bash
cd billing-service
graphify extract . --code-only
graphify affected "vat_rate" --depth 2
```

Output:

```text
Affected nodes for vat_rate()
Depth: 2
- .total() [calls] billing/invoice.py:L9
- invoice.py [imports] billing/invoice.py:L1
```

The agent opens only `billing/invoice.py` around line 9, rather than searching the whole repository, and adds the new country case there.

### Example 2: map a repo plus its design docs, locally

Request: "Build a graph of this repo and the docs folder, but nothing may leave the laptop."

```bash
pipx install graphifyy
cd payments-platform
echo "node_modules/" >> .graphifyignore
graphify extract . --backend ollama --max-concurrency 1
graphify cluster-only . --backend ollama
graphify god-nodes --top 5
graphify query "where does idempotency get enforced" --budget 1200
graphify hook install
```

The agent reports the five hub nodes from `god-nodes`, answers the idempotency question from the returned subgraph and the cited files, and notes which edges were `INFERRED` from the docs so the user can confirm them. From then on each commit refreshes the graph.

## Guidelines

- Start with `--code-only`. Add an LLM backend only when documents or images matter, and say which provider will see the files.
- Treat `INFERRED` and `AMBIGUOUS` edges as hints. Confirm them in the source before acting on them.
- `graphify-out/` can be large and is regenerable: add it to `.gitignore` unless the team deliberately shares `graph.json`. The cache is keyed by file hash.
- Name lookups are fuzzy. On exit code 3, retry with the exact node label or `--seed` with a file path.
- A graph is a map, not the code. Read the files it points to before editing.
- Do not use it for a repo small enough to read in one pass, or for runtime behavior: it models static structure only.
- Do not run `graphify install`, `hook install` or any `* install` command without the user's request: they change agent config or git hooks.
