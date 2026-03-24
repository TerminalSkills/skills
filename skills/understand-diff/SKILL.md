---
name: understand-diff
description: >-
  Analyze git diffs and PRs using the codebase knowledge graph to understand impact and risk.
  Use when: reviewing pull requests, understanding what a diff actually changes, assessing
  risk of a code change.
license: MIT
compatibility: "Claude Code, Cursor, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [git, diff, code-review, knowledge-graph, impact-analysis]
---

# /understand-diff

## Overview

Analyze git diffs and pull requests using the codebase knowledge graph to understand the true impact and risk of code changes. The skill maps changed files to graph nodes, follows edges to find affected components, identifies cross-layer concerns, and produces a structured risk assessment.

## Graph Structure Reference

The knowledge graph JSON has this structure:
- `project` — {name, description, languages, frameworks, analyzedAt, gitCommitHash}
- `nodes[]` — each has {id, type, name, filePath, summary, tags[], complexity, languageNotes?}
  - Node types: file, function, class, module, concept
  - IDs: `file:path`, `func:path:name`, `class:path:name`
- `edges[]` — each has {source, target, type, direction, weight}
  - Key types: imports, contains, calls, depends_on
- `layers[]` — each has {id, name, description, nodeIds[]}
- `tour[]` — each has {order, title, description, nodeIds[]}

## How to Read Efficiently

1. Use Grep to search within the JSON for relevant entries BEFORE reading the full file
2. Only read sections you need — don't dump the entire graph into context
3. Node names and summaries are the most useful fields for understanding
4. Edges tell you how components connect — follow imports and calls for dependency chains

## Instructions

1. Check that `.understand-anything/knowledge-graph.json` exists. If not, tell the user to run `/understand` first.

2. **Get the changed files list** (do NOT read the graph yet):
   - If on a branch with uncommitted changes: `git diff --name-only`
   - If on a feature branch: `git diff main...HEAD --name-only` (or the base branch)
   - If the user specifies a PR number: get the diff from that PR

3. **Read project metadata only** — use Grep or Read with a line limit to extract just the `"project"` section for context.

4. **Find nodes for changed files** — for each changed file path, use Grep to search the knowledge graph for:
   - Nodes with matching `"filePath"` values (e.g., `grep "changed/file/path"`)
   - This finds file nodes AND function/class nodes defined in those files
   - Note the `id` values of all matched nodes

5. **Find connected edges (1-hop)** — for each matched node ID, Grep for that ID in the edges to find:
   - What imports or depends on the changed nodes (upstream callers)
   - What the changed nodes import or call (downstream dependencies)
   - These are the "affected components" — things that might break or need updating

6. **Identify affected layers** — Grep for the matched node IDs in the `"layers"` section to determine which architectural layers are touched.

7. **Provide structured analysis**:
   - **Changed Components**: What was directly modified (with summaries from matched nodes)
   - **Affected Components**: What might be impacted (from 1-hop edges)
   - **Affected Layers**: Which architectural layers are touched and cross-layer concerns
   - **Risk Assessment**: Based on node `complexity` values, number of cross-layer edges, and blast radius (number of affected components)
   - Suggest what to review carefully and any potential issues

8. **Write diff overlay for dashboard** — after producing the analysis, write the diff data to `.understand-anything/diff-overlay.json` so the dashboard can visualize changed and affected components. The file contains:
   ```json
   {
     "version": "1.0.0",
     "baseBranch": "<the base branch used>",
     "generatedAt": "<ISO timestamp>",
     "changedFiles": ["<list of changed file paths>"],
     "changedNodeIds": ["<node IDs from step 4>"],
     "affectedNodeIds": ["<node IDs from step 5, excluding changedNodeIds>"]
   }
   ```
   After writing, tell the user they can run `/understand-anything:understand-dashboard` to see the diff overlay visually.

## Examples

**Example 1: Analyzing a feature branch diff**

User: `/understand-diff`

The agent runs `git diff main...HEAD --name-only` and finds 3 changed files: `src/auth/session.ts`, `src/auth/middleware.ts`, and `src/api/users.ts`. It searches the knowledge graph for these file paths and finds 5 matching nodes (3 file nodes plus 2 function nodes). Following edges reveals 8 affected components: the checkout flow, billing service, and admin panel all depend on the auth middleware. The agent reports: Changed Components (3 files in the Auth layer), Affected Components (8 upstream callers across 3 layers), Risk Assessment (HIGH -- auth middleware change affects 8 callers, complexity score 12). It writes `diff-overlay.json` and suggests running the dashboard to visualize the blast radius.

**Example 2: Reviewing a PR with targeted changes**

User: `/understand-diff` (with uncommitted changes to `src/services/payment.ts`)

The agent runs `git diff --name-only` and finds 1 changed file. It locates `file:src/services/payment.ts` in the graph (complexity: 14, tags: billing, stripe, payments). Edge traversal shows 2 upstream callers (`handleCheckout`, `runMonthlyBilling`) and 1 downstream dependency (`stripe-client`). The agent reports: Changed Components (1 file, Services layer), Affected Components (2 callers in API and Jobs layers), Risk Assessment (MEDIUM -- high-complexity file but limited blast radius). It writes the diff overlay and notes that the billing job should be tested since it calls the changed payment service.

## Guidelines

- Always get the changed files list before reading the knowledge graph to minimize unnecessary reads
- Focus the risk assessment on cross-layer edges, which indicate changes with broader architectural impact
- Include node complexity scores in the risk assessment since high-complexity files are more likely to have subtle bugs
- Write `diff-overlay.json` after every analysis so the dashboard can visualize results
- When changed files are not found in the graph, warn that the knowledge graph may be outdated and suggest regenerating it
