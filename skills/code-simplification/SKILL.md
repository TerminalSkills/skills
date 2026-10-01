---
name: code-simplification
description: >-
  Makes working code easier to read and change without altering what it does, and proves the
  behaviour stayed the same. Use when someone says "simplify this", "clean up this function",
  "this file is a mess", "reduce the complexity", "refactor for readability", "tidy my diff
  before the PR", or when a linter reports high cyclomatic complexity or deep nesting. Covers
  pinning current behaviour with characterization tests, measuring complexity, choosing a
  named refactoring, applying it in small verified steps, and reporting suspected bugs found
  on the way instead of fixing them silently.
license: Apache-2.0
compatibility: "Any language with a test runner. Examples use Python 3.10+ (pytest, ruff, vulture) and TypeScript on Node.js 22.18+ (node:test, ESLint 9+, knip, ast-grep)."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["refactoring", "code-quality", "complexity", "readability", "testing"]
---

# Code Simplification

## Overview

Simplifying means rewriting how code is expressed while every caller, test and user sees the same results: the same return values and types, the same errors, the same side effects in the same order. The work is a loop: pin down what the code does today, find what makes it hard to follow, apply one named refactoring, re-check, repeat.

"Simpler" means a reader has less to keep in their head: fewer branches per function, shallower nesting, fewer parameters, no names that only pass a value along, no code that never runs. Line count is not the measure. The deliverable is a set of small changes plus a report with numbers before and after and a list of everything that looked like a bug and was deliberately left as it was.

## Instructions

### 1. Settle the scope and the safety net

Look these up in the repository first (package scripts, Makefile, `pyproject.toml`, CI workflow, `CLAUDE.md` or `AGENTS.md`):

- the test, type-check and lint commands, and the lint configuration already in force
- every caller of the code in question (language server references or a text search), and whether the name is part of a public surface: `exports` in `package.json`, `__all__`, an HTTP route, a CLI flag
- the files in the current diff, when the request is "tidy what I just wrote"

Ask the user only what the repository cannot answer:

1. Is the target this function, this file, or the whole module? (Default: the named function, or the lines of the current diff. Do not widen it on your own.)
2. May exported names and signatures change? (Default: no.)
3. Is any current behaviour already known to be wrong? Known bugs get reported, not preserved by accident or fixed in passing.

### 2. Pin the current behaviour

Run tests, type check and lint once and write down the result. If that baseline is red, stop and say so: with failures already present you cannot tell your breakage from the old one.

Then check that the lines you will touch are executed by a test:

```bash
python -m pytest tests/test_delivery.py --cov=shop.delivery --cov-report=term-missing   # needs pytest-cov
node --test --experimental-test-coverage "src/*.test.ts"
```

Where coverage is missing, write characterization tests before changing anything: tests that record what the code does now, right or wrong. Choose inputs on both sides of every boundary in the code, at least one invalid input, and the value types callers really pass (a form field arrives as a string). Assert on the value, its type, and for failures the exception class and message.

For a pure function the strongest net is a differential test: keep the old implementation beside the new one while you work and compare both over a grid of inputs (Example 1). For code with side effects, assert on the sequence of calls made to the existing fakes or mocks. If there is nothing to observe, shrink the scope to the parts that can be checked and say what was left out.

### 3. Find what makes the code hard to follow

Measure without editing the project's lint configuration:

```bash
# Python: cyclomatic complexity over 10, more than 12 branches, 50 statements, 5 arguments (ruff defaults)
ruff check --select C901,PLR0912,PLR0915,PLR0913 shop/
# Python: unused imports and variables, commented-out code, unreferenced functions
ruff check --select F401,F841,ERA001 shop/
vulture shop/ --min-confidence 60
# JavaScript / TypeScript: the same measures (ESLint's own defaults are 20, 4, 3 and 50)
npx eslint src --rule 'complexity: ["warn", 10]' --rule 'max-depth: ["warn", 3]' \
  --rule 'max-params: ["warn", 3]' --rule 'max-lines-per-function: ["warn", 50]'
# JavaScript / TypeScript: unused files, exports and dependencies
npx knip
```

Numbers point at candidates; reading decides. Match what you see to a refactoring from the standard catalog and check the exception before applying it:

| What you see | Refactoring | Leave it when |
|---|---|---|
| Pyramid of `if`/`else` that validates input | Replace Nested Conditional with Guard Clauses | cleanup must run at a single exit and there is no `finally`, `defer` or context manager |
| The same branch shape repeated per category | Replace the branches with a lookup table | categories differ in logic, not only in values |
| One function doing several jobs in a row | Extract Function, Split Phase | the pieces share so much local state that each would take four or more parameters |
| Boolean or mode argument choosing between two behaviours | Remove Flag Argument | callers compute the flag at run time |
| Parameter that has the same value at every call site | Inline the constant, drop the parameter | the function is public |
| Class, interface or wrapper with one implementation that only forwards | Inline Function, Inline Class, Remove Middle Man | tests or a confirmed second implementation use the seam |
| Shared helper full of `if kind == ...` | Inline it into its callers, then extract only what is truly common | |
| Two copies of the same logic | Extract Function | they merely look alike and change for different reasons |
| Unreferenced, commented-out or flag-disabled code | Remove Dead Code | it is reached by reflection, a string name, a framework convention or configuration |
| Dense one-liner: nested ternary, stacked comprehension | Extract Variable, or expand into statements | |
| Vague or reused name (`data`, `tmp`, `flag`) | Rename Variable, Split Variable | |

### 4. Change one thing at a time

- Apply a single refactoring, run the tests for the touched module, then move on. Run the whole suite before handing over.
- When a test fails, undo that step instead of patching forward. Either the rewrite was wrong or you found a behaviour you did not know about; decide which before trying again.
- Never edit the expectation of an existing test to make it pass. A test changes only when a signature was changed with the user's agreement, and then only the call, not the expected result.
- Keep these changes apart from behaviour changes. If the user wants commits, use one per step with a message such as `refactor(delivery): replace zone branches with rate table`.
- For the same edit in many places use a syntax-aware tool. `ast-grep run --pattern 'buildDocument($JOB, "receipt", true)' --rewrite 'buildReceipt($JOB)' --lang ts src/` prints the diff; adding `--update-all` applies it. `ruff check --fix` applies only the fixes it marks safe; `--unsafe-fixes` is named that way because those can change behaviour, and the `== True` rewrite in Example 1 is one of them.

### 5. Check equivalence where it usually breaks

| Rewrite that looks harmless | What actually changes |
|---|---|
| `x == True` to `if x` | truthy values that are not equal to `True` (`"on"`, `2`, a non-empty list) now take the branch |
| `a ? a : b` or `a \|\| b` to `a ?? b` | `0`, `""` and `false` no longer fall back to `b` |
| Validation moved below an early return or short-circuit | invalid input stops raising |
| `return await p` to `return p` inside `try`/`catch` | a rejection is no longer caught there |
| Loop to `map`/`filter`/`any`/`all` or a generator | early exit, per-item side effects, laziness |
| Two loops merged, or one split | order of side effects |
| Arithmetic reordered or a factor pulled out | floating-point result differs in the last digit |
| Exception type or message tidied | callers that match on it |
| In-place mutation swapped for a copy, or the reverse | callers that hold a reference |

Finish by re-running the full baseline (same test count, same type-check and lint result), comparing public signatures with the starting point, and removing scaffolding: the old copy and the differential test go, characterization tests that assert on real values stay.

### 6. Report

```markdown
## Simplification report: shop/delivery.py

| Measure | Before | After |
|---|---|---|
| Cyclomatic complexity (worst function) | 17 | 3 |
| Branches (worst function) | 25 | 2 |

Steps: 1) rate table for zone and weight, 2) extracted `ships_free`, 3) removed the `free` temp.
Verified: 2,352 input combinations give identical value, type and error; the existing test passes unchanged.
Behaviour questions, not changed: 1) express orders from the web form are not charged the surcharge.
Not done: `shop/returns.py` repeats the same weight bands; outside the requested scope.
```

## Examples

### Example 1: Nested pricing rules in Python

Request: "Simplify `delivery_fee` in `shop/delivery.py`, it's unreadable." The function is 43 lines of nested `if`/`else`, one copy of the weight bands per zone, and ends like this:

```python
    if free == True:
        fee = 0
    if express == True:
        fee = fee + 5.0
    return round(fee, 2)
```

`ruff check --select C901,PLR0912 shop/delivery.py` reports ``C901 `delivery_fee` is too complex (17 > 10)`` and `PLR0912 Too many branches (25 > 12)`. Only one test exists, so the agent copies the function to `delivery_old.py` and writes a differential test:

```python
GRID = itertools.product(
    [0, 0.5, 2, 2.01, 10, 10.5, 40],            # weight_kg, both sides of each band
    ["local", "national", "islands", "mars"],   # zone, including an unknown one
    [False, True, 0, 1, "on", "", None],        # express, as callers may pass it
    [0, 34.99, 35, 59.99, 60, 250],             # subtotal, both sides of each threshold
    [False, True],                              # is_member
)

def outcome(fn, args):
    try:
        value = fn(*args)
        return ("ok", type(value).__name__, value)
    except Exception as err:
        return ("raised", type(err).__name__, str(err))

@pytest.mark.parametrize("args", list(GRID))
def test_same_outcome(args):
    assert outcome(delivery_fee, args) == outcome(delivery_fee_old, args)
```

The first rewrite fails 546 of 2,352 cases, in two groups. With `express="on"` the new code charged 9.5 where the old charged 4.5, because `if express:` replaced `express == True`. With `zone="mars"` and a qualifying subtotal the new code returned 0 where the old raised `ValueError`, because the free-shipping check now ran before the zone was validated. Both are undone, and the final version passes all 2,352:

```python
RATES = {  # fee per zone for parcels up to 2 kg, up to 10 kg, and heavier
    "local": (4.5, 7.0, 12.0),
    "national": (6.9, 11.5, 19.0),
    "islands": (14.0, 22.0, 35.0),
}
EXPRESS_SURCHARGE = 5.0

def base_fee(weight_kg, zone):
    if zone not in RATES:
        raise ValueError("unknown zone")
    light, medium, heavy = RATES[zone]
    if weight_kg <= 2:
        return light
    return medium if weight_kg <= 10 else heavy

def ships_free(zone, subtotal, is_member):
    return zone != "islands" and subtotal >= (35 if is_member else 60)

def delivery_fee(weight_kg, zone, express, subtotal, is_member):
    fee = base_fee(weight_kg, zone)  # first, so an unknown zone still raises
    if ships_free(zone, subtotal, is_member):
        fee = 0
    if express == True:  # noqa: E712  the web form sends "on", which is not charged today
        fee += EXPRESS_SURCHARGE
    return round(fee, 2)
```

Complexity drops from 17 to 3 and branches from 25 to 2. The report carries the finding the grid exposed: the checkout form passes `"on"`, so express orders placed on the web are not charged the surcharge. That is a pricing decision for the owner, kept out of this change.

### Example 2: A flag argument and dead code in TypeScript

Request: "Tidy `src/documents.ts` before I open the PR." It exports one function with a mode switch:

```typescript
export function buildDocument(job: Job, mode: "invoice" | "receipt", includeTax: boolean, dueDays?: number): string
```

A search finds two callers, both in `src/billing.ts`: `buildDocument(job, "invoice", true, net30 ? 30 : undefined)` and `buildDocument(job, "receipt", true)`. So `includeTax` is `true` everywhere and `mode` is a literal at each call. `npx knip` adds:

```text
Unused files (1)
src/pdf-old.ts
Unused exports (1)
legacyTotal  function  src/documents.ts:29:17
```

A search for `pdf-old` and `legacyTotal` as strings in source, configuration and `package.json` finds nothing, so both are removed. The function is split along the flag, with the shared part extracted:

```typescript
const lineTotal = (l: Line) => l.price * l.qty;

function body(job: Job): string[] {
  const total = job.lines.reduce((sum, l) => sum + lineTotal(l), 0) * (1 + job.taxRate);
  const rows = job.lines.map((l) => `${l.name} x${l.qty}  ${lineTotal(l).toFixed(2)}`);
  return [...rows, `Total ${total.toFixed(2)}`];
}

export function buildInvoice(job: Job, dueDays?: number): string {
  // `||`, not `??`: a caller passing 0 gets the 14-day default today
  return [`INVOICE ${job.id}`, ...body(job), `Due in ${dueDays || 14} days`].join("\n");
}

export function buildReceipt(job: Job): string {
  return [`RECEIPT ${job.id}`, ...body(job), `Paid on ${job.paidAt}`].join("\n");
}
```

A `node:test` file compares the output of old and new for three jobs (one with no lines, one with awkward decimals) and `dueDays` of `undefined`, 0, 7 and 30. Writing `dueDays ?? 14` fails it with `'Due in 0 days'` against `'Due in 14 days'`, which is why the `||` stays. Result: parameters 4 to 2 and 1, complexity 6 to 2, one file and one export deleted. The report asks whether `Paid on undefined` for an unpaid job is intended.

## Guidelines

- Preserve first, question second. A simplification that fixes a bug is a behaviour change: report it and let the user decide whether it ships separately.
- Equivalence is demonstrated only for the inputs you ran. Say what the tests cover and what they do not: timing, concurrency, and anything behind a network call or a clock.
- Stop when the next step no longer removes something a reader must hold in mind. Three clear lines beat one clever line, and an early `return` beats a result variable carried through five branches.
- Follow the conventions already in the codebase over personal taste, and do not bring in a new library or pattern to make code "cleaner".
- Extracting a function costs a name and a jump. Extract when the name says something the code does not; inline when the body is as clear as the name.
- Keep comments that explain why. Delete only those that restate the line below them, and fix those the change made untrue.
- Check performance when a rewrite changes the shape of the work: a lookup inside a loop, a list copied on every call, a generator turned into a list. For code tuned against a benchmark, re-run that benchmark.
- Dead-code tools report candidates. Confirm each with a text search for the name as a string, and check entry points, plugin registries and templates before deleting.
- Not the right tool: code with no tests and no observable output that the user will not let you pin; generated or vendored files; a module scheduled for deletion; lines another branch is rewriting right now.
