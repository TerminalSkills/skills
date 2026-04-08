---
name: using-agent-skills
description: >-
  Meta-skill for discovering and invoking the right agent skill for any task.
  Use when starting a session, when unsure which skill applies, or when you need
  to understand the development lifecycle and how skills chain together.
  Covers skill discovery, core operating behaviors, and failure modes to avoid.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["agent-skills", "meta", "workflow"]
---

# Using Agent Skills

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task.

## Instructions

### Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    ├── Vague idea/need refinement? ──→ idea-refine
    ├── New project/feature/change? ──→ spec-driven-development
    ├── Have a spec, need tasks? ──────→ planning-and-task-breakdown
    ├── Implementing code? ────────────→ incremental-implementation
    │   ├── UI work? ─────────────────→ frontend-ui-engineering
    │   ├── API work? ────────────────→ api-and-interface-design
    │   └── Need better context? ─────→ context-engineering
    ├── Writing/running tests? ────────→ test-driven-development
    ├── Something broke? ──────────────→ debugging-and-error-recovery
    ├── Reviewing code? ───────────────→ code-review-and-quality
    ├── Committing/branching? ─────────→ git-workflow-and-versioning
    ├── Writing docs/ADRs? ───────────→ documentation-and-adrs
    └── Deploying/launching? ─────────→ shipping-and-launch
```

### Core Operating Behaviors

**1. Surface Assumptions** — Before implementing anything non-trivial:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
→ Correct me now or I'll proceed with these.
```

**2. Manage Confusion Actively** — When encountering inconsistencies:
1. STOP — don't proceed with a guess
2. Name the specific confusion
3. Present the tradeoff or ask the clarifying question
4. Wait for resolution

**3. Push Back When Warranted** — Point out issues directly, explain concrete downsides, propose alternatives. Sycophancy is a failure mode.

**4. Enforce Simplicity** — Before finishing any implementation, ask:
- Can this be done in fewer lines?
- Are these abstractions earning their complexity?
- Would a staff engineer say "why didn't you just..."?

**5. Maintain Scope Discipline** — Touch only what you're asked to touch. Don't "clean up" adjacent code, remove comments you don't understand, or add unspecified features.

**6. Verify, Don't Assume** — A task is not complete until verification passes. "Seems right" is never sufficient — there must be evidence.

### Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.
2. **Skills are workflows, not suggestions.** Follow the steps in order.
3. **Multiple skills can apply.** Chain them in sequence.
4. **When in doubt, start with a spec.**

### Lifecycle Sequence

For a complete feature, the typical sequence:

```
1. idea-refine                 → Refine vague ideas
2. spec-driven-development     → Define what we're building
3. planning-and-task-breakdown → Break into verifiable chunks
4. context-engineering         → Load the right context
5. incremental-implementation  → Build slice by slice
6. test-driven-development     → Prove each slice works
7. code-review-and-quality     → Review before merge
8. documentation-and-adrs      → Document decisions
9. shipping-and-launch         → Deploy safely
```

Not every task needs every skill. A bug fix might only need: debugging → testing → review.

## Examples

### Quick Reference

| Phase | Skill | Summary |
|-------|-------|---------|
| Define | idea-refine | Divergent and convergent thinking |
| Define | spec-driven-development | Requirements before code |
| Plan | planning-and-task-breakdown | Small, verifiable tasks |
| Build | incremental-implementation | Thin vertical slices |
| Build | context-engineering | Right context at right time |
| Verify | test-driven-development | Failing test first |
| Review | code-review-and-quality | Five-axis quality review |
| Ship | git-workflow-and-versioning | Atomic commits, clean history |
| Ship | documentation-and-adrs | Document the why |

## Guidelines

### Failure Modes to Avoid

1. Making wrong assumptions without checking
2. Plowing ahead when confused
3. Not surfacing inconsistencies you notice
4. Being sycophantic to approaches with clear problems
5. Overcomplicating code and APIs
6. Modifying code orthogonal to the task
7. Removing things you don't fully understand
8. Building without a spec because "it's obvious"
9. Skipping verification because "it looks right"

### Red Flags

- Starting implementation without checking for applicable skills
- Skipping verification steps within a skill
- Silently guessing when requirements are ambiguous
- No spec exists for non-trivial work
- Agent output doesn't match project conventions
