---
name: request-refactor-plan
description: >-
  Produces a refactor plan and files it as a GitHub issue for review: interviews the user about the pain and the constraints, checks every claim against the code, weighs alternatives, pins down behaviour that must not change, and lays the work out as a sequence of small commits that each keep the build and tests passing. Use when the user says "plan this refactor", "write a refactoring RFC", "I want to restructure this module safely", "break this refactor into small steps", or "open an issue proposing a refactor".
license: Apache-2.0
compatibility: "A Git repository with a runnable test suite; GitHub CLI (gh) authenticated for filing the issue, or the plan can be saved as a Markdown file instead. Works in Claude Code, Codex, Gemini CLI and Cursor."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["refactoring", "technical-design", "github-issues", "incremental-delivery", "code-quality"]
---

# Request Refactor Plan

## Overview

A refactor changes the structure of code without changing what it does, and it goes wrong in predictable ways: the goal is vague, behaviour shifts unnoticed, or the work lands as one unreviewable diff. This skill prevents all three before any code moves. It turns a developer's "this module is a mess" into a written request that reviewers can approve or reject: evidence for the problem, the chosen approach and the ones rejected, the behaviour that is frozen, the tests that guard it, and an ordered list of commits small enough to review and revert one at a time. The result is filed as a GitHub issue.

## Instructions

### 1. Interview

Ask in one message, and skip what the user has already said:

1. What hurts today, and what does it cost? (bugs of a recurring kind, time to make a typical change, onboarding, incidents)
2. Why now? What upcoming work does this unblock?
3. What must stay exactly as it is? (public API, stored data, output formats, performance)
4. What is the constraint? (deadline, release cadence, who reviews, code other teams own)
5. What solution do you have in mind, and what have you already ruled out?

### 2. Check the claims against the code

Read the area before believing either the complaint or the proposed cure. Collect numbers the issue can cite:

```bash
wc -l src/orders/order-service.ts
grep -rl "order-service" src --exclude='*.test.ts' | wc -l      # files that depend on it
git log --since="12 months ago" --format= --name-only -- src/orders \
  | grep . | sort | uniq -c | sort -rn | head -5               # most-changed files
npx vitest run src/orders --coverage                           # the project's own test command
```

Note who calls the code, what it calls, where state is shared, and which behaviour is covered by tests. If the evidence does not support the complaint (the file is large but rarely changes and rarely breaks), say so; "leave it alone" is a valid outcome.

### 3. Weigh the options

Lay out at least three, with what each costs and what it leaves unsolved: do nothing; the smallest change that removes the stated pain; the structural change the user proposed; a rewrite, if anyone is considering one. Recommend one. Prefer the option that removes the pain soonest and can be stopped halfway with the code still better than before.

### 4. Fix the scope and the invariants

Write down what is in scope, what is explicitly out, and the observable behaviour that must be identical before and after: responses, persisted data, emitted events, error messages others depend on, timing budgets. A refactor ships no behaviour change. Bugs found along the way are recorded and fixed in separate commits or separate issues, so that a reviewer can trust that a structural commit is only structural.

### 5. Build the safety net first

Compare the invariants with existing tests. Where behaviour is unguarded, the first commits of the plan add tests, written against the code as it behaves today (characterization tests), through the public interface so they survive the restructuring. For output-heavy code, pin representative inputs and their current outputs. If the user declines to add tests, record that as an accepted risk in the issue.

### 6. Choose how the change is rolled in

| Situation | Technique |
|-----------|-----------|
| Reshaping code inside one module | Small in-place steps: extract, move, rename, inline, one per commit |
| Changing a signature, schema or API that has many users | Parallel change: add the new form beside the old (expand), move callers over (migrate), delete the old (contract) |
| Swapping a library or an internal component | Branch by abstraction: put an interface in front of the old one, build the new one behind it, switch, remove |
| Replacing a subsystem | Strangler fig: route one slice of traffic or one use case at a time to the new code |
| A risky runtime difference | A flag that selects old or new path, removed in the final commits |

### 7. Write the commit sequence

Rules for every commit in the plan:

- The build and the whole test suite pass after it; it can be deployed alone.
- It does one kind of thing. Moves and renames are separate from edits, so the diff of a move is empty of logic and history stays traceable.
- It can be reverted without reverting its successors, or the plan says which commits form a unit.

Usual order: tests that pin behaviour → preparatory tidying that makes the change easy → introduce the new structure unused → move callers in batches → delete the old structure → clean up names and docs. For each commit give an imperative title, what changes, and how it is verified. Mark **checkpoints**, after which work could stop with the codebase better off, and any **point of no return**, such as a destructive migration, with what has to be true before crossing it.

### 8. Review, then file

Show the user the full draft and ask specifically: is the frozen behaviour complete, is any commit too big, where would they stop if time ran out. After approval, file it:

```bash
tmp=$(mktemp -d)   # save the approved plan as $tmp/refactor-plan.md
gh label list --search refactor --json name --jq '.[].name'
gh issue create --title "Refactor plan: extract pricing from OrderService" \
  --body-file "$tmp/refactor-plan.md" --label refactor
```

Pass `--label` only if the first command shows the label exists; ask before creating one. Without GitHub, save the same text as `docs/refactors/2026-10-extract-pricing.md`. Report the issue URL and stop: carrying out the plan is a separate request.

Issue sections, in this order: Summary · Why now · Current state (with the numbers) · Goals and non-goals · Behaviour that must not change · Approach and alternatives rejected · Safety net · Commit plan · Risks and rollback · Open questions · Done when.

## Examples

### Example 1: untangling pricing from an order service

Sanna Lindqvist maintains `tallyhouse/storefront-api`. Her complaint: every new discount type takes a week because pricing is woven through `OrderService`. The check confirms it: the file is 1,412 lines, 23 files import it, it had 61 commits in twelve months, and 9 of the last 14 bug fixes touched discount arithmetic. Tests cover checkout end to end but exercise only 4 of 11 discount combinations. Issue filed:

```markdown
## Summary
Move price calculation out of `OrderService` into a `pricing` module of pure functions, without
changing any computed total. Fourteen commits, each deployable.

## Why now
Tiered discounts are scheduled for November. In the current structure that is one more branch in
a 190-line method that already caused 9 of our last 14 order bugs.

## Current state
`OrderService` (1,412 lines, imported by 23 files) mixes persistence, payment calls and pricing.
`calculateTotals()` reads the order, the customer and the clock directly, so it can only be
tested through a database.

## Goals and non-goals
Goal: totals computed by functions that take data and return data. Non-goals: changing rounding,
adding tiered discounts, touching payment or persistence code.

## Behaviour that must not change
Line totals, discount amounts, tax and grand total for every order; the order of discount
application; half-up rounding to cents; the text of the `DISCOUNT_NOT_APPLICABLE` error.

## Approach and alternatives rejected
In-place extraction in small steps. Rejected: rewriting pricing beside the old code and switching
(two implementations to keep equal for weeks); leaving it and adding tiers in place (the cost
grows with each discount type).

## Safety net
Commits 1–2 add a table-driven test of 40 real, anonymized orders with their current totals,
run through the public `OrderService.quote()`.

## Commit plan
1. Add fixture of 40 orders with expected totals; test `quote()` against it. Verify: suite green.
2. Add cases for the 7 untested discount combinations, asserting today's results as they are.
3. Pass the clock into `calculateTotals()` as a parameter instead of reading it. No logic change.
4. Pass customer tier as a parameter instead of loading it inside the method.
5. Extract `lineSubtotal()` as a private function. Verify: fixture test green.
6. Extract `applyDiscounts()`, keeping the order of application.
7. Extract `taxFor()`.
   **Checkpoint: pricing is readable and unit-testable in place.**
8. Create `src/pricing/` and move the three functions there unchanged (move-only commit).
9. Add direct unit tests for `src/pricing/` using the same fixture.
10. Point `OrderService.quote()` at the module.
11. Point `OrderService.place()` at the module.
12. Point the invoice job and the cart preview at the module.
13. Delete the private copies and `calculateTotals()`. Verify: no references remain (`grep -r`).
    **Checkpoint: single implementation.**
14. Rename leftovers, update `docs/architecture/orders.md`.

## Risks and rollback
Rounding drift is the main risk; the fixture test catches a one-cent change. Every commit can be
reverted alone except 8–13, which revert in reverse order. No data changes, no point of no return.

## Open questions
Two fixture orders have totals that look wrong (stacked discount above 100%). Recorded as #482;
this refactor keeps the current result.

## Done when
`OrderService` contains no arithmetic, `src/pricing/` has no imports from persistence or payment
code, and the 40-order fixture passes unchanged.
```

### Example 2: changing a stored representation with parallel change

Farid Haddad's Django service `kestrel-pay/ledger` stores `Payment.amount` as a float of euros; totals occasionally differ by a cent. He wants integer cents. The interview establishes that the JSON API must keep returning `amount` as a decimal string and that deploys go out daily. The plan uses expand, migrate, contract, and marks where it stops being reversible:

```markdown
## Commit plan
1. Add tests pinning the API's `amount` output for 12 known payments, including 0.10 and 19.99.
2. Add nullable `amount_cents` (integer) column. Nothing reads it.
3. Write both fields on every create and update.
4. Backfill `amount_cents` in batches of 5,000 with a management command; log any row where
   `round(amount * 100)` and a Decimal conversion disagree.
   **Checkpoint: both representations present and equal. Verify: the command's mismatch count is 0.**
5. Switch readers to `amount_cents`, one module per commit: reports, exports, API serializer.
6. Make `amount_cents` non-null.
7. Stop writing `amount`.
8. **Point of no return:** drop the `amount` column. Not before one full week in production after
   commit 7 and a verified database backup.

## Risks and rollback
Commits 1–7 are reversible by reverting. After commit 8 the float values exist only in backups.
```

## Guidelines

- **No evidence, no refactor.** If step 2 cannot show a cost, propose stopping. Disliking how code looks is not a reason reviewers can evaluate.
- **Never mix a behaviour change into the plan.** If the real aim is a behaviour change, plan the structural part first and the behaviour change as a separate, later piece of work.
- **A commit list that says "refactor X" is not a plan.** Each entry names what moves and how it is checked. If a step cannot be described that concretely, more reading is needed.
- **Keep the plan robust to drift.** Name modules, public functions and tables; avoid line numbers and long code excerpts, which are wrong by the time the issue is read.
- **Long-lived branches defeat the purpose.** Each commit, or small group, should merge to the main branch as it is done. If that is impossible, choose a technique from step 6 that makes it possible.
- **Destructive steps are last and gated.** Dropping columns, deleting endpoints or removing old code paths waits until the new path has run in production; the gate is written in the plan.
- **Do not start the refactor.** The deliverable is the issue. Changing code before reviewers have agreed removes the point of asking.
- **When not to use it.** A rename or an extraction that fits in one small pull request needs no plan. A rewrite in another language or framework is a migration project and needs a design document with staffing and timeline, not a commit list.
