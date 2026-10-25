---
title: Build an AI-Powered Codebase Knowledge Graph
slug: build-codebase-knowledge-graph
description: >-
  Create a living knowledge graph of your codebase that maps files, functions, and relationships for instant architecture understanding.
skills:
  - understand-chat
  - understand-dashboard
category: development
tags: [knowledge-graph, codebase, architecture, documentation, onboarding]
---

# Build an AI-Powered Codebase Knowledge Graph

## The Problem

Your codebase has 200,000+ lines of code. New developers take weeks to onboard. Senior devs are constantly interrupted to explain "how X works." Architecture docs go stale the moment they're written. You need a system that understands your code and can answer questions about it automatically.

## The Solution

Use the understand-anything skill suite to generate a machine-readable knowledge graph of your entire codebase. The graph maps every file, function, class, and their relationships into a queryable JSON structure. Once built, developers can chat with the codebase, visualize dependencies, and get architecture answers grounded in real code paths.

## Step-by-Step Walkthrough

### 1. Analyze your project

Run the knowledge graph builder on your codebase:

```
/understand
```

This scans all source files, extracts entities (files, functions, classes), maps relationships (imports, calls, dependencies), assigns complexity scores, identifies architectural layers, and builds a guided tour. The result is saved to `.understand-anything/knowledge-graph.json`.

### 2. Chat with your codebase

Use `/understand-chat` to ask architecture questions:

```
/understand-chat how does authentication work?
/understand-chat what calls the payment service?
/understand-chat which files are most critical to the API layer?
```

The skill searches the graph for relevant nodes, follows edges to find connected components, and answers with specific file paths, function names, and architectural context.

### 3. Launch the visual dashboard

See the knowledge graph as an interactive visualization:

```
/understand-dashboard
```

This starts a local Vite server at `http://localhost:5173` with a force-directed node graph, layer views, dependency explorer, complexity heatmap, and search filtering.

### 4. Integrate into CI/CD

Keep the knowledge graph fresh by regenerating on every merge to main:

```yaml
# .github/workflows/knowledge-graph.yml
name: Update Knowledge Graph
on:
  push:
    branches: [main]
jobs:
  update-graph:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate knowledge graph
        run: npx understand-anything analyze --output .understand-anything/
      - name: Commit updated graph
        run: |
          git config user.name "github-actions[bot]"
          git add .understand-anything/knowledge-graph.json
          git commit -m "chore: update knowledge graph" || true
          git push
```

## Real-World Example

A team with a 200k-line TypeScript monorepo (Next.js, tRPC, Prisma) runs `/understand` and generates a knowledge graph with 312 nodes across 6 architectural layers. A new developer asks `/understand-chat how does billing work?` and gets a response mapping the full flow: `src/api/checkout.ts` calls `src/services/payment.ts`, which calls `src/integrations/stripe.ts`, with the subscription state machine in `src/billing/subscription.ts` (complexity: 18) managing 12 possible transitions. The developer understands the billing architecture in 5 minutes instead of spending 2 days reading code.

## Related Skills

- [understand-chat](../skills/understand-chat/SKILL.md) -- Ask questions about the codebase
- [understand-dashboard](../skills/understand-dashboard/SKILL.md) -- Visual graph explorer
- [understand-onboard](../skills/understand-onboard/SKILL.md) -- Generate onboarding guides
- [understand-diff](../skills/understand-diff/SKILL.md) -- Analyze PRs with graph context
