---
name: code-simplification
description: >-
  Simplifies code for clarity without changing behavior. Use when refactoring
  for readability, when code works but is harder to maintain than it should be,
  or when reviewing code that has accumulated unnecessary complexity.
  Covers the five principles, simplification process, and language-specific guidance.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["refactoring", "simplification", "code-quality"]
---

# Code Simplification

## Overview

Simplify code by reducing complexity while preserving exact behavior. The goal is not fewer lines — it's code that is easier to read, understand, modify, and debug. Every simplification must pass: "Would a new team member understand this faster than the original?"

## Instructions

### The Five Principles

**1. Preserve Behavior Exactly.** Don't change what the code does — only how it expresses it. All inputs, outputs, side effects, error behavior, and edge cases must remain identical.

**2. Follow Project Conventions.** Simplification means making code more consistent with the codebase, not imposing external preferences. Read CLAUDE.md/project conventions first.

**3. Prefer Clarity Over Cleverness.**

```typescript
// UNCLEAR: Dense ternary chain
const label = isNew ? 'New' : isUpdated ? 'Updated' : isArchived ? 'Archived' : 'Active';

// CLEAR: Readable mapping
function getStatusLabel(item: Item): string {
  if (item.isNew) return 'New';
  if (item.isUpdated) return 'Updated';
  if (item.isArchived) return 'Archived';
  return 'Active';
}
```

**4. Maintain Balance.** Watch for over-simplification: inlining too aggressively, combining unrelated logic, removing abstractions that exist for testability, optimizing for line count.

**5. Scope to What Changed.** Default to simplifying recently modified code. Avoid drive-by refactors of unrelated code.

### The Simplification Process

**Step 1: Understand Before Touching (Chesterton's Fence)**

Before changing anything, answer:
- What is this code's responsibility?
- What calls it? What does it call?
- What are the edge cases and error paths?
- Are there tests defining expected behavior?
- Why might it have been written this way?

**Step 2: Identify Opportunities**

| Pattern | Simplification |
|---------|----------------|
| Deep nesting (3+ levels) | Guard clauses or helper functions |
| Long functions (50+ lines) | Split into focused functions |
| Nested ternaries | if/else chains or lookup objects |
| Boolean parameter flags | Options objects or separate functions |
| Generic names (`data`, `temp`) | Descriptive names (`userProfile`) |
| Duplicated logic | Shared function |
| Dead code | Remove after confirming |
| Over-engineered patterns | Direct simple approach |

**Step 3: Apply Changes Incrementally**

One simplification at a time. Run tests after each change. Submit refactoring separately from features.

```
FOR EACH SIMPLIFICATION:
1. Make the change
2. Run the test suite
3. If tests pass → commit
4. If tests fail → revert and reconsider
```

**The Rule of 500:** If a refactoring touches 500+ lines, use automation (codemods, AST transforms) instead of manual edits.

**Step 4: Verify**

Compare before and after: Is the simplified version genuinely easier to understand? Is the diff clean? Would a teammate approve?

## Examples

### TypeScript / JavaScript

```typescript
// SIMPLIFY: Unnecessary async wrapper
// Before
async function getUser(id: string): Promise<User> {
  return await userService.findById(id);
}
// After
function getUser(id: string): Promise<User> {
  return userService.findById(id);
}

// SIMPLIFY: Redundant boolean return
// Before
function isValid(input: string): boolean {
  if (input.length > 0 && input.length < 100) { return true; }
  return false;
}
// After
function isValid(input: string): boolean {
  return input.length > 0 && input.length < 100;
}
```

### Python

```python
# SIMPLIFY: Nested conditionals with early return
# Before
def process(data):
    if data is not None:
        if data.is_valid():
            if data.has_permission():
                return do_work(data)
            else:
                raise PermissionError("No permission")
        else:
            raise ValueError("Invalid data")
    else:
        raise TypeError("Data is None")

# After
def process(data):
    if data is None:
        raise TypeError("Data is None")
    if not data.is_valid():
        raise ValueError("Invalid data")
    if not data.has_permission():
        raise PermissionError("No permission")
    return do_work(data)
```

## Guidelines

### Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It's working, no need to touch it" | Hard-to-read code is hard to fix when it breaks |
| "Fewer lines is always simpler" | A 1-line nested ternary isn't simpler than 5-line if/else |
| "I'll refactor while adding this feature" | Separate refactoring from feature work for clean reviews |

### Red Flags

- Simplification that requires modifying tests (you likely changed behavior)
- "Simplified" code that is longer and harder to follow
- Removing error handling for "cleanliness"
- Simplifying code you don't fully understand
- Batching many simplifications into one large commit

### Verification

- [ ] All existing tests pass without modification
- [ ] Build succeeds with no new warnings
- [ ] Each simplification is a reviewable, incremental change
- [ ] Simplified code follows project conventions
- [ ] No error handling was removed or weakened
- [ ] No dead code was left behind
