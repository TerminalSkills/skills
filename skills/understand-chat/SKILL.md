---
name: understand-chat
description: >-
  Answer questions about any codebase using an AI-generated knowledge graph. Use when: asking
  architecture questions about a project, understanding how specific features work, exploring
  codebase relationships interactively.
license: MIT
compatibility: "Claude Code, Cursor, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [codebase, knowledge-graph, ai, architecture, documentation]
---

# /understand-chat

## Overview

Answer questions about any codebase using an AI-generated knowledge graph stored at `.understand-anything/knowledge-graph.json`. The skill searches graph nodes, follows edges to find connected components, and returns answers grounded in actual file paths, function names, and architectural layers.

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

1. Check that `.understand-anything/knowledge-graph.json` exists in the current project root. If not, tell the user to run `/understand` first.

2. **Read project metadata only** — use Grep or Read with a line limit to extract just the `"project"` section from the top of the file for context (name, description, languages, frameworks).

3. **Search for relevant nodes** — use Grep to search the knowledge graph file for the user's query keywords: "$ARGUMENTS"
   - Search `"name"` fields: `grep -i "query_keyword"` in the graph file
   - Search `"summary"` fields for semantic matches
   - Search `"tags"` arrays for topic matches
   - Note the `id` values of all matching nodes

4. **Find connected edges** — for each matched node ID, Grep for that ID in the `edges` section to find:
   - What it imports or depends on (downstream)
   - What calls or imports it (upstream)
   - This gives you the 1-hop subgraph around the query

5. **Read layer context** — Grep for `"layers"` to understand which architectural layers the matched nodes belong to.

6. **Answer the query** using only the relevant subgraph:
   - Reference specific files, functions, and relationships from the graph
   - Explain which layer(s) are relevant and why
   - Be concise but thorough — link concepts to actual code locations
   - If the query doesn't match any nodes, say so and suggest related terms from the graph

## Examples

**Example 1: Understanding authentication flow**

User: `/understand-chat how does authentication work?`

The agent searches the knowledge graph for nodes matching "auth", "login", "session", and "token". It finds `file:src/auth/session.ts` (summary: "JWT session management with refresh token rotation") and `func:src/auth/middleware.ts:requireAuth` (summary: "Express middleware that validates JWT and attaches user to request"). It follows edges to discover that `func:src/api/users.ts:createUser` calls `func:src/auth/session.ts:createSession`, and that the auth layer contains 4 files. The agent responds with the complete authentication flow: request hits middleware, JWT is validated, session is refreshed if needed, and user object is attached to the request context.

**Example 2: Tracing dependencies of a service**

User: `/understand-chat what calls the payment service?`

The agent searches for nodes matching "payment" and finds `file:src/services/payment.ts` and `func:src/services/payment.ts:processCharge`. It then searches edges where `target` matches these node IDs, finding 3 upstream callers: `func:src/api/checkout.ts:handleCheckout`, `func:src/jobs/billing.ts:runMonthlyBilling`, and `func:src/webhooks/stripe.ts:handleInvoicePaid`. The agent reports all three callers with their file paths, explains that the payment service sits in the Services layer, and notes that it has both synchronous API callers and asynchronous job callers.

## Guidelines

- Always search the knowledge graph with Grep before reading the full file to minimize context usage
- Reference specific file paths and function names from the graph rather than giving generic answers
- When a query is ambiguous, search multiple related terms and present the most relevant matches
- Limit edge traversal to 1-hop to keep responses focused; suggest follow-up queries for deeper exploration
- If the knowledge graph is outdated (check `analyzedAt` and `gitCommitHash`), warn the user to regenerate it
