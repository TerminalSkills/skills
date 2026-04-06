---
name: incremental-implementation
description: >-
  Delivers changes incrementally in thin vertical slices. Use when implementing
  any feature or change that touches more than one file, when you're about to
  write a large amount of code at once, or when a task feels too big to land
  in one step. Each increment leaves the system in a working, testable state.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["incremental", "implementation", "workflow"]
---

# Incremental Implementation

## Overview

Build in thin vertical slices — implement one piece, test it, verify it, then expand. Avoid implementing an entire feature in one pass. Each increment should leave the system in a working, testable state. This is the execution discipline that makes large features manageable.

## Instructions

### The Increment Cycle

For each slice:

1. **Implement** the smallest complete piece of functionality
2. **Test** — run the test suite (or write a test if none exists)
3. **Verify** — confirm the slice works (tests pass, build succeeds)
4. **Commit** — save progress with a descriptive message
5. **Move to the next slice**

### Slicing Strategies

**Vertical Slices (Preferred)** — Build one complete path through the stack:

```
Slice 1: Create a task (DB + API + basic UI)  → User can create a task
Slice 2: List tasks (query + API + UI)         → User can see their tasks
Slice 3: Edit a task (update + API + UI)       → User can modify tasks
Slice 4: Delete a task (delete + API + UI)     → Full CRUD complete
```

**Contract-First Slicing** — When backend and frontend develop in parallel:

```
Slice 0: Define API contract (types, interfaces, OpenAPI spec)
Slice 1a: Backend against the contract + API tests
Slice 1b: Frontend against mock data matching the contract
Slice 2: Integrate and test end-to-end
```

**Risk-First Slicing** — Tackle the riskiest piece first:

```
Slice 1: Prove the WebSocket connection works (highest risk)
Slice 2: Build real-time updates on the proven connection
Slice 3: Add offline support and reconnection
```

### Implementation Rules

**Simplicity First:** Before writing code, ask "What is the simplest thing that could work?"

```
✗ Generic EventBus with middleware pipeline for one notification
✓ Simple function call

✗ Abstract factory pattern for two similar components
✓ Two straightforward components with shared utilities

✗ Config-driven form builder for three forms
✓ Three form components
```

**Scope Discipline:** Touch only what the task requires. Don't "clean up" adjacent code, refactor unrelated imports, or add features not in the spec.

```
NOTICED BUT NOT TOUCHING:
- src/utils/format.ts has an unused import (unrelated to this task)
- The auth middleware could use better error messages (separate task)
→ Want me to create tasks for these?
```

**One Thing at a Time:** Each increment changes one logical thing. Don't mix a new component, a refactor, and a build config change in one commit.

**Keep It Compilable:** After each increment, the project must build and existing tests must pass.

**Feature Flags for Incomplete Features:**

```typescript
const ENABLE_TASK_SHARING = process.env.FEATURE_TASK_SHARING === 'true';
if (ENABLE_TASK_SHARING) {
  // New sharing UI — merged but not exposed
}
```

**Rollback-Friendly:** Each increment should be independently revertable. Prefer additive changes; keep modifications minimal and focused.

## Examples

### Directing an Agent

```
"Let's implement Task 3 from the plan.

Start with just the database schema change and the API endpoint.
Don't touch the UI yet — we'll do that in the next increment.

After implementing, run `npm test` and `npm run build` to verify
nothing is broken."
```

### Increment Checklist

After each increment:
- [ ] The change does one thing and does it completely
- [ ] All existing tests still pass (`npm test`)
- [ ] The build succeeds (`npm run build`)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] The new functionality works as expected
- [ ] The change is committed with a descriptive message

## Guidelines

### Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll test it all at the end" | Bugs compound. A bug in Slice 1 makes Slices 2-5 wrong |
| "It's faster to do it all at once" | Feels faster until something breaks in 500 changed lines |
| "These changes are too small to commit separately" | Small commits are free. Large commits hide bugs |
| "This refactor is small enough to include" | Refactors mixed with features make both harder to review |

### Red Flags

- More than 100 lines written without running tests
- Multiple unrelated changes in a single increment
- "Let me just quickly add this too" scope expansion
- Build or tests broken between increments
- Building abstractions before the third use case demands it
- Touching files outside the task scope "while I'm here"

### Verification

After completing all increments:
- [ ] Each increment was individually tested and committed
- [ ] The full test suite passes
- [ ] The build is clean
- [ ] The feature works end-to-end as specified
- [ ] No uncommitted changes remain
