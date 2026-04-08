---
name: context-engineering
description: >-
  Optimizes agent context setup for maximum output quality. Use when starting a
  new session, when agent output quality degrades, when switching between tasks,
  or when configuring rules files and context for AI-assisted development.
  Covers the context hierarchy, packing strategies, and confusion management.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["context", "prompt-engineering", "ai-workflow"]
---

# Context Engineering

## Overview

Feed agents the right information at the right time. Context is the single biggest lever for agent output quality — too little and the agent hallucinates, too much and it loses focus. Context engineering is the practice of deliberately curating what the agent sees, when it sees it, and how it's structured.

## Instructions

### The Context Hierarchy

Structure context from most persistent to most transient:

```
1. Rules Files (CLAUDE.md, etc.)   ← Always loaded, project-wide
2. Spec / Architecture Docs        ← Loaded per feature/session
3. Relevant Source Files            ← Loaded per task
4. Error Output / Test Results      ← Loaded per iteration
5. Conversation History             ← Accumulates, compacts
```

### Level 1: Rules Files

Create a rules file that persists across sessions — highest-leverage context:

```markdown
# Project: [Name]
## Tech Stack
- React 18, TypeScript 5, Vite, Tailwind CSS 4
## Commands
- Build: `npm run build` | Test: `npm test` | Dev: `npm run dev`
## Code Conventions
- Functional components with hooks (no class components)
- Named exports (no default exports)
- Colocate tests: `Button.tsx` → `Button.test.tsx`
## Boundaries
- Never commit .env files or secrets
- Ask before modifying database schema
- Always run tests before committing
```

Equivalent files: `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, `AGENTS.md`

### Level 2: Specs and Architecture

Load relevant spec sections when starting a feature. Don't load the entire spec if only one section applies.

**Effective:** "Here's the authentication section of our spec"
**Wasteful:** "Here's our entire 5000-word spec" (when only working on auth)

### Level 3: Relevant Source Files

Before editing, read the files. Before implementing a pattern, find an existing example.

**Pre-task context loading:**
1. Read the file(s) you'll modify
2. Read related test files
3. Find one example of a similar pattern in the codebase
4. Read type definitions or interfaces involved

### Level 4: Error Output

Feed specific errors, not entire logs:

**Effective:** "Test failed: `TypeError: Cannot read property 'id' of undefined at UserService.ts:42`"
**Wasteful:** Pasting 500-line test output when one test failed

### Level 5: Conversation Management

- Start fresh sessions when switching major features
- Summarize progress when context gets long
- Compact deliberately before critical work

### Context Packing Strategies

**The Selective Include** — only what's relevant:

```
TASK: Add email validation to the registration endpoint
RELEVANT FILES:
- src/routes/auth.ts (endpoint to modify)
- src/lib/validation.ts (existing validation utilities)
- tests/routes/auth.test.ts (tests to extend)
PATTERN TO FOLLOW:
- See phone validation in src/lib/validation.ts:45-60
CONSTRAINT:
- Must use existing ValidationError class
```

**The Hierarchical Summary** — for large projects, maintain a project map:

```markdown
## Authentication (src/auth/)
Key files: auth.routes.ts, auth.service.ts, auth.middleware.ts
Pattern: All routes use authMiddleware, errors use AuthError class

## Tasks (src/tasks/)
Key files: task.routes.ts, task.service.ts, task.socket.ts
Pattern: Optimistic updates via WebSocket
```

### Confusion Management

**When context conflicts:**
```
CONFUSION:
Spec says "Use REST for all endpoints" but existing code uses GraphQL
for user queries (src/graphql/user.ts).
Options:
A) Follow the spec — add REST endpoint
B) Follow existing patterns — use GraphQL, update spec
C) Ask — this seems intentional
→ Which approach?
```

**When requirements are incomplete:** Check existing code for precedent. If none, stop and ask. Don't invent requirements.

## Examples

### The Inline Planning Pattern

For multi-step tasks, emit a lightweight plan before executing:

```
PLAN:
1. Add Zod schema for task creation
2. Wire schema into POST /api/tasks route handler
3. Add test for validation error response
→ Executing unless you redirect.
```

This catches wrong directions before you've built on them.

## Guidelines

### Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Context starvation | Load rules file + relevant source before each task |
| Context flooding (>5000 lines) | Include only what's relevant, aim for <2000 lines |
| Stale context | Start fresh sessions when context drifts |
| Missing examples | Include one example of the pattern to follow |
| Implicit knowledge | Write it in rules files — unwritten rules don't exist |
| Silent confusion | Surface ambiguity explicitly |

### Red Flags

- Agent output doesn't match project conventions
- Agent invents APIs or imports that don't exist
- Agent re-implements existing utilities
- Agent quality degrades as conversation gets longer
- No rules file exists in the project

### Verification

- [ ] Rules file covers tech stack, commands, conventions, boundaries
- [ ] Agent output follows the patterns in the rules file
- [ ] Agent references actual project files (not hallucinated ones)
- [ ] Context is refreshed when switching between major tasks
