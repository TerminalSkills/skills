---
name: understand-explain
description: >-
  Get a deep-dive explanation of any file, function, or module using the codebase knowledge
  graph. Use when: understanding unfamiliar code, explaining how a feature is implemented,
  learning a legacy codebase.
license: MIT
compatibility: "Claude Code, Cursor, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [codebase, knowledge-graph, documentation, explanation, learning]
---

# /understand-explain

## Overview

Get a deep-dive explanation of any file, function, or module by combining knowledge graph context with source code analysis. The skill locates the target component in the graph, maps its connections and architectural layer, reads the actual source code, and delivers a clear explanation of how it works and why it exists.

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

2. **Find the target node** — use Grep to search the knowledge graph for the component: "$ARGUMENTS"
   - For file paths (e.g., `src/auth/login.ts`): search for `"filePath"` matches
   - For function notation (e.g., `src/auth/login.ts:verifyToken`): search for the function name in `"name"` fields filtered by the file path
   - Note the exact node `id`, `type`, `summary`, `tags`, and `complexity`

3. **Find all connected edges** — Grep for the target node's ID in the edges section:
   - `"source"` matches → things this node calls/imports/depends on (outgoing)
   - `"target"` matches → things that call/import/depend on this node (incoming)
   - Note the connected node IDs and edge types

4. **Read connected nodes** — for each connected node ID from step 3, Grep for those IDs in the nodes section to get their `name`, `summary`, and `type`. This builds the component's neighborhood.

5. **Identify the layer** — Grep for the target node's ID in the `"layers"` section to find which architectural layer it belongs to and that layer's description.

6. **Read the actual source file** — Read the source file at the node's `filePath` for the deep-dive analysis.

7. **Explain the component in context**:
   - Its role in the architecture (which layer, why it exists)
   - Internal structure (functions, classes it contains — from `contains` edges)
   - External connections (what it imports, what calls it, what it depends on — from edges)
   - Data flow (inputs → processing → outputs — from source code)
   - Explain clearly, assuming the reader may not know the programming language
   - Highlight any patterns, idioms, or complexity worth understanding

## Examples

**Example 1: Explaining a file**

User: `/understand-explain src/auth/session.ts`

The agent searches the knowledge graph for `filePath` matching `src/auth/session.ts` and finds `file:src/auth/session.ts` (summary: "JWT session management with refresh token rotation", complexity: 7, tags: auth, jwt, security). It finds edges showing that `createSession` is called by `createUser` and `handleLogin`, and that the file imports `jsonwebtoken` and `src/config/auth-config.ts`. The layer lookup shows it belongs to the Authentication layer. The agent reads the source file and explains: the file exports 4 functions (createSession, validateSession, refreshSession, destroySession), implements JWT with RS256 signing, uses refresh token rotation to prevent token theft, and sits at the core of the auth layer with 6 upstream callers depending on it.

**Example 2: Explaining a specific function**

User: `/understand-explain src/api/middleware.ts:requireAuth`

The agent searches for a node with name `requireAuth` in file `src/api/middleware.ts` and finds `func:src/api/middleware.ts:requireAuth` (summary: "Express middleware that validates JWT and attaches user to request", complexity: 4). Edge traversal shows 12 API route handlers depend on this function, and it calls `validateSession` from the auth layer. The agent reads the source file, locates the function, and explains: it extracts the Bearer token from the Authorization header, calls validateSession to verify the JWT, attaches the decoded user object to `req.user`, and returns 401 if the token is missing or invalid. It is the gateway function that protects all authenticated endpoints.

## Guidelines

- Start with the graph context before reading source code to understand the component's role in the architecture first
- Explain clearly assuming the reader may not know the programming language used
- Highlight complexity hotspots and patterns that are non-obvious from the code alone
- When explaining a file, focus on exported functions and the public API rather than internal helpers
- If the target component is not found in the graph, search by partial name match and suggest corrections
