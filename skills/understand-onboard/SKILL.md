---
name: understand-onboard
description: >-
  Generate a comprehensive onboarding guide for new developers joining a project, based on
  the codebase knowledge graph. Use when: onboarding new team members, creating developer
  documentation, ramping up on a new project.
license: MIT
compatibility: "Claude Code, Cursor, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [onboarding, documentation, knowledge-graph, developer-experience, team]
---

# /understand-onboard

## Overview

Generate a comprehensive onboarding guide for new developers by reading the codebase knowledge graph. The skill extracts project metadata, architectural layers, guided tour steps, and complexity hotspots to produce a structured markdown document that helps new team members understand the codebase in hours instead of weeks.

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

2. **Read project metadata** — use Grep or Read with a line limit to extract the `"project"` section (name, description, languages, frameworks).

3. **Read layers** — Grep for `"layers"` to get the full layers array. These define the architecture and will structure the guide.

4. **Read the tour** — Grep for `"tour"` to get the guided walkthrough steps. These provide the recommended learning path.

5. **Read file-level nodes only** — use Grep to find nodes with `"type": "file"` in the knowledge graph. Skip function-level and class-level nodes to keep the guide high-level. Extract each file node's `name`, `filePath`, `summary`, and `complexity`.

6. **Identify complexity hotspots** — from the file-level nodes, find those with the highest `complexity` values. These are areas new developers should approach carefully.

7. **Generate the onboarding guide** with these sections:
   - **Project Overview**: name, languages, frameworks, description (from project metadata)
   - **Architecture Layers**: each layer's name, description, and key files (from layers + file nodes)
   - **Key Concepts**: important patterns and design decisions (from node summaries and tags)
   - **Guided Tour**: step-by-step walkthrough (from the tour section)
   - **File Map**: what each key file does (from file-level nodes, organized by layer)
   - **Complexity Hotspots**: areas to approach carefully (from complexity values)

8. Format as clean markdown
9. Offer to save the guide to `docs/ONBOARDING.md` in the project
10. Suggest the user commit it to the repo for the team

## Examples

**Example 1: Generating an onboarding guide for a SaaS project**

User: `/understand-onboard`

The agent reads the knowledge graph and finds: project "my-saas-app" (TypeScript, Next.js, tRPC, Prisma), 5 architectural layers (UI, API Gateway, Services, Data, Infrastructure), 47 file-level nodes, and a 6-step guided tour. It identifies 3 complexity hotspots: `src/billing/subscription.ts` (complexity: 18), `src/sync/conflict-resolver.ts` (complexity: 15), and `src/auth/session.ts` (complexity: 12). The agent generates a structured onboarding guide with Project Overview, Architecture Layers (with key files per layer), Guided Tour (starting from the app entry point through auth, data models, and API), File Map (organized by layer), and Complexity Hotspots (with warnings about the billing state machine). It offers to save the guide to `docs/ONBOARDING.md`.

**Example 2: Generating a guide for a Python microservices project**

User: `/understand-onboard`

The agent reads the knowledge graph for "order-service" (Python, FastAPI, SQLAlchemy, Redis), finds 3 layers (API, Domain, Infrastructure), 23 file-level nodes, and a 4-step tour. Complexity hotspots include `src/domain/order_state_machine.py` (complexity: 16) and `src/infrastructure/event_bus.py` (complexity: 11). The guide covers the FastAPI router structure, domain-driven design patterns used in the service, the event-driven architecture with Redis pub/sub, and warns new developers about the order state machine's 9 possible transitions.

## Guidelines

- Only use file-level nodes for the guide; function and class details make it too granular for onboarding
- Structure the guide around architectural layers since this gives new developers the mental model they need
- Always include the guided tour from the knowledge graph as it provides a curated learning path
- Flag files with complexity scores above 10 as hotspots that new developers should approach carefully
- Suggest committing the generated guide to the repo so the whole team benefits
