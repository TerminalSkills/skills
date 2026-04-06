---
name: documentation-and-adrs
description: >-
  Records architectural decisions and documentation. Use when making architectural
  decisions, changing public APIs, shipping features, or when you need to record
  context that future engineers and agents will need to understand the codebase.
  Covers ADRs, inline docs, API docs, READMEs, and changelogs.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["documentation", "adr", "architecture"]
---

# Documentation and ADRs

## Overview

Document decisions, not just code. The most valuable documentation captures the *why* — the context, constraints, and trade-offs that led to a decision. Code shows *what* was built; documentation explains *why it was built this way* and *what alternatives were considered*.

## Instructions

### Architecture Decision Records (ADRs)

Write an ADR when:
- Choosing a framework, library, or major dependency
- Designing a data model or database schema
- Selecting an authentication or API architecture strategy
- Any decision that would be expensive to reverse

Store ADRs in `docs/decisions/` with sequential numbering:

```markdown
# ADR-001: Use PostgreSQL for primary database

## Status
Accepted | Superseded by ADR-XXX | Deprecated

## Date
2025-01-15

## Context
[Key requirements and constraints that drove the decision]

## Decision
[What was decided and why]

## Alternatives Considered
[Each alternative with pros, cons, and reason for rejection]

## Consequences
[What follows from this decision]
```

**ADR Lifecycle:** `PROPOSED → ACCEPTED → (SUPERSEDED or DEPRECATED)`

Don't delete old ADRs — they capture historical context. When a decision changes, write a new ADR that references and supersedes the old one.

### Inline Documentation

Comment the *why*, not the *what*:

```typescript
// BAD: Restates the code
// Increment counter by 1
counter += 1;

// GOOD: Explains non-obvious intent
// Rate limit uses a sliding window to prevent burst attacks at window edges
if (now - windowStart > WINDOW_SIZE_MS) {
  counter = 0;
  windowStart = now;
}
```

Don't leave TODO comments for things you should just do now. Don't leave commented-out code — git has history.

### API Documentation

For public APIs, document with types:

```typescript
/**
 * Creates a new task.
 * @param input - Task creation data (title required, description optional)
 * @returns The created task with server-generated ID and timestamps
 * @throws {ValidationError} If title is empty or exceeds 200 characters
 * @throws {AuthenticationError} If the user is not authenticated
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {}
```

### README Structure

Every project should cover:
- One-paragraph description
- Quick Start (clone, install, env, run)
- Commands table (dev, test, build, lint)
- Architecture overview with links to ADRs
- Contributing guidelines

### Changelog Maintenance

```markdown
## [1.2.0] - 2025-01-20
### Added
- Task sharing: users can share tasks with team members (#123)
### Fixed
- Duplicate tasks appearing when rapidly clicking create button (#125)
### Changed
- Task list now loads 50 items per page (was 20) (#126)
```

## Examples

### When to Document vs When NOT to

**Document:**
- Making a significant architectural decision
- Choosing between competing approaches
- Adding or changing a public API
- Known gotchas that could trap future developers or agents

**Don't document:**
- Obvious code that's self-explanatory
- Throwaway prototypes
- Comments that restate what the code says

### Document Known Gotchas

```typescript
/**
 * IMPORTANT: Must be called before the first render.
 * If called after hydration, causes a flash of unstyled content
 * because the theme context isn't available during SSR.
 * See ADR-003 for the full design rationale.
 */
export function initializeTheme(theme: Theme): void {}
```

## Guidelines

### Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The code is self-documenting" | Code shows what, not why or what was rejected |
| "We'll write docs when the API stabilizes" | APIs stabilize faster when you document them |
| "Nobody reads docs" | Agents do. Future engineers do. Your future self does |
| "ADRs are overhead" | A 10-min ADR prevents a 2-hour re-debate six months later |

### Red Flags

- Architectural decisions with no written rationale
- Public APIs with no documentation or types
- README that doesn't explain how to run the project
- No ADRs in a project with significant architectural choices

### Verification

After documenting:
- [ ] ADRs exist for all significant architectural decisions
- [ ] README covers quick start, commands, and architecture overview
- [ ] API functions have parameter and return type documentation
- [ ] Known gotchas are documented inline where they matter
- [ ] No commented-out code remains
