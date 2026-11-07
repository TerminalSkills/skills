---
title: Build an AI-Powered Codebase Knowledge Graph
slug: build-codebase-knowledge-graph
description: >-
  Create a knowledge graph of your codebase with the open-source Understand-Anything plugin, then query, visualize and share it so new developers can learn the architecture without interrupting seniors.
skills:
  - understand-chat
  - understand-dashboard
  - understand-onboard
  - understand-diff
  - graphify
  - codegraph
category: development
tags: [knowledge-graph, codebase, architecture, documentation, onboarding]
---

# Build an AI-Powered Codebase Knowledge Graph

## The Problem

Your codebase has 200,000+ lines of code. New developers take weeks to onboard. Senior devs are constantly interrupted to explain "how X works." Architecture docs go stale the moment they're written. You need a system that understands your code and can answer questions about it automatically.

## The Solution

Use the open-source [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) plugin (MIT licence) through the understand-* skills. Its `/understand` command parses the project with tree-sitter, has your coding agent describe every file, and saves one JSON file, the knowledge graph, with files, functions, classes, relationships, architectural layers and a guided tour. The other commands read that file: chat with the codebase, open a visual dashboard, check what a change affects, generate an onboarding guide. Commit the graph and teammates can use it without running the analysis again.

## Step-by-Step Walkthrough

### 1. Install the plugin and analyze the project

In Claude Code:

```text
/plugin marketplace add Egonex-AI/Understand-Anything
/plugin install understand-anything
/understand
```

For Codex, Gemini CLI and other hosts, clone the repository, read `install.sh`, and run it with the host id (for example `./install.sh codex`); the `understand-chat` skill lists the accepted ids. Building a graph needs Node.js 22+, pnpm 10+ and Python 3.

The graph is saved to `.ua/knowledge-graph.json` (a project that already has a `.understand-anything/` directory keeps using that one). The first run reads the whole codebase with your agent's model and can use a lot of tokens on a large project; later runs only re-analyze changed files. For a big monorepo, scope the run, for example `/understand src/frontend`.

### 2. Chat with your codebase

```text
/understand-chat how does authentication work?
/understand-chat what calls the payment service?
/understand-chat which files are most critical to the API layer?
```

The skill searches the graph for matching nodes, follows edges to connected code, and should confirm in the source before it names a behavior. The graph is an index: summaries and most call edges were written by a model, so ask for file paths and line numbers and check the ones that matter.

### 3. Open the visual dashboard

```text
/understand-dashboard
```

This serves a local dashboard on `127.0.0.1` (port 5173 by default) and prints a URL with an access token. It shows architectural layers, search, a node info panel with source preview, a guided tour, a path finder between two nodes and a filter by complexity. The token changes on every start; keep the full URL. To view the graph without an agent, the `understand-dashboard` skill shows how to run the standalone viewer from the GitHub release after verifying its checksum.

### 4. Share the graph and keep it fresh

The project README recommends committing the data directory so teammates skip the analysis, except for local scratch files:

```gitignore
.ua/intermediate/
.ua/diff-overlay.json
```

Keep it current with `/understand --auto-update`. This writes `autoUpdate: true` to `.ua/config.json` and uses a post-commit hook to patch the graph incrementally. In Claude Code it reacts to commits the agent makes; commits made elsewhere leave the graph behind until the next `/understand`. For graphs over 10 MB, track `.ua/*.json` with git-lfs.

### 5. Use the graph in onboarding and review

```text
/understand-onboard
/understand-diff
```

`/understand-onboard` generates an onboarding guide from the graph; `/understand-diff` shows which parts of the system your uncommitted changes or a pull request touch, and writes the overlay the dashboard displays with the `D` key.

## Real-World Example

A team maintains a TypeScript monorepo (Next.js, tRPC, Prisma) of about 200k lines. A tech lead runs `/understand`, reviews the layers it found, and commits `.ua/`. A new developer clones the repo and runs `/understand-chat how does billing work?`. The answer traces the flow from the checkout route through the payment service to the Stripe integration, citing `path:lines` for each step. The developer checks those files, walks the guided tour in the dashboard, and arrives at the first planning meeting already knowing which module owns subscription state.

## Related Skills

- [understand-chat](../skills/understand-chat/SKILL.md) -- Ask questions about the codebase, and install the plugin
- [understand-dashboard](../skills/understand-dashboard/SKILL.md) -- Visual graph explorer
- [understand-onboard](../skills/understand-onboard/SKILL.md) -- Generate onboarding guides
- [understand-diff](../skills/understand-diff/SKILL.md) -- Analyze PRs with graph context
- [graphify](../skills/graphify/SKILL.md) -- choose it when the corpus mixes code with docs, PDFs and screenshots, or when agents should query a persistent `graph.json` from the command line instead of chatting through a dashboard
- [codegraph](/skills/codegraph) — choose it when the goal is for coding agents to query callers, callees and blast radius from a local MCP/CLI index instead of reading a generated graph or dashboard
