---
name: tdd
description: >-
  Guides building a feature or fixing a bug test-first with the red-green-refactor cycle: agree a list of behaviours, write one failing test, make it pass with the least code, tidy up while green, repeat. Covers reproducing bugs with a failing test, pinning down untested legacy code before changing it, and choosing what to replace with test doubles. Use when the user says "use TDD", "write the test first", "red-green-refactor", "test-drive this function", "add a regression test before fixing", or asks how to add tests while building.
license: Apache-2.0
compatibility: "Any language with a test runner the agent can execute from a terminal (examples use the Node.js 22.18+ built-in runner and pytest 9). Works in Claude Code, Codex, Gemini CLI and Cursor."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["tdd", "testing", "red-green-refactor", "unit-tests", "regression-tests"]
---

# Test-Driven Development

## Overview

Test-driven development is a way of writing code in very short loops: state one behaviour as an automated test, watch it fail, write just enough code to pass, then improve the design while the tests protect you. For an agent the discipline matters more than for a person, because the failing test is evidence that the test can fail at all and the passing run is evidence the change works; neither can be claimed without running something. This skill sets out the loop, what to show the user at each step, and how to apply it to new features, bug fixes and code that has no tests yet.

## Instructions

### 1. Learn how tests run in this project

Before writing anything, find the runner, where tests live, how they are named, and the command for a single test. Read `package.json`, `pyproject.toml`, `Makefile` or the CI workflow; copy the project's own command instead of inventing one. Then run the whole suite once. If it is already failing, tell the user before going further: a red baseline hides whether your new test fails for the right reason.

| Runner | Whole suite | One test by name |
|--------|-------------|------------------|
| Node.js built-in | `node --test` | `node --test --test-name-pattern="leftover cents"` |
| Vitest | `npx vitest run` | `npx vitest run -t "leftover cents"` |
| Jest | `npx jest` | `npx jest -t "leftover cents"` |
| pytest | `pytest -q` | `pytest -q -k "31st"` or `pytest "tests/test_schedule.py::test_december_rolls_over"` |
| Go | `go test ./...` | `go test -run 'TestSplitBill' ./...` |
| Cargo | `cargo test` | `cargo test split_bill` |

### 2. Agree the interface and write a test list

Settle with the user what the caller sees: function or endpoint name, inputs, outputs, errors. Then write a short list of behaviours in plain language, one line each, ordered from the central case outward: main scenario, variations, boundaries, failures. The list is about what the code does for its caller, not how it will be built. Show it to the user; it is the cheapest place to catch a misunderstanding. New cases that occur to you mid-loop are added to the list, not implemented on the spot.

### 3. Red: one failing test

Turn the top item into one test. Name it as a sentence about behaviour. Arrange, act, assert; one reason to fail. Call the code the way a real caller would, through its public interface. Run it and read the failure:

- It must fail because the behaviour is missing: an assertion mismatch, or at the very start a missing module or function.
- If it fails for another reason (syntax error, wrong import path, broken fixture), fix the test until the failure is the expected one.
- If it passes straight away, do not move on. Either the behaviour already exists (keep the test as a guard and take the next item) or the test cannot fail (prove it can by breaking the code on purpose, then restore it).

### 4. Green: the least code that passes

Write only what this test demands and run the entire suite, not just the new test. A hard-coded or naive answer is acceptable when the next test will force the general one; do not add branches, parameters or error handling that no test asks for. Never reach green by weakening the test: deleting an assertion, loosening a comparison, or pasting the actual output into the expected value without checking it against the requirement.

### 5. Refactor: improve the design while green

With every test passing, look at both the production code and the tests: unclear names, duplication, a function doing two jobs, setup repeated across tests. Change one thing, run the suite, repeat. Add no behaviour in this step; if tidying reveals a missing case, put it on the list. Skipping this step is the most common way the practice decays into a pile of passing but tangled code.

### 6. Repeat, and commit on green

Take the next item. Commit whenever the suite is green and the code is tidy, so any later step can be undone cheaply. Stop when the list is empty, and say so.

### 7. Bug fixes start with a reproduction

Write a test that fails in the way the bug report describes, at the lowest level that shows the defect. Run it and confirm the failure matches the report. Fix the code, see the test pass, and keep the test. Then ask what neighbouring inputs share the cause and add those cases.

### 8. Changing code that has no tests

Do not test-drive a change into untested code blind. First write characterization tests: call the existing code with representative inputs and assert whatever it does today, even where that looks odd. They are the baseline. If the code cannot be called from a test because it reaches for a database, the clock or the network, make the smallest change that lets a test supply those (pass them in as parameters), then proceed with the normal loop.

### 9. What to replace with a test double

Use the real collaborator whenever it is fast and deterministic. Substitute only at the edges of the system: network services, payment and email providers, the clock, randomness, and sometimes the filesystem or database. Prefer a fake (a simple working stand-in, such as an in-memory repository) or a stub (canned answers) over a mock that asserts which calls were made; tests that verify call sequences break whenever the internals are rearranged, even though behaviour is unchanged. Time and randomness are passed in, never patched globally.

### 10. Report each cycle

After each loop tell the user, in two or three lines: the behaviour, the failure seen (the key line of output), and the result after the change (count of passing tests). At the end list the behaviours covered, anything left on the list, and the command that runs the suite.

## Examples

### Example 1: a new function, three cycles (Node.js built-in runner, TypeScript)

The user wants `splitBill(totalCents, people)` for a bill-splitting app. Agreed list: (1) an evenly divisible bill gives equal shares; (2) leftover cents go to the first payers so the shares add up to the bill; (3) zero people is refused. Node 22.18 and later run `.ts` test files directly, without type-checking them; imports must include the `.ts` extension.

Cycle 1, red. `test/split-bill.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBill } from "../src/split-bill.ts";

test("splits an evenly divisible bill into equal shares", () => {
  assert.deepEqual(splitBill(9000, 3), [3000, 3000, 3000]);
});
```

`node --test` fails with `ERR_MODULE_NOT_FOUND ... src/split-bill.ts`: the expected failure for a function that does not exist. Green, with the simplest thing that works:

```ts
export function splitBill(totalCents: number, people: number): number[] {
  return Array(people).fill(totalCents / people);
}
```

Cycle 2, red. The next test asserts `splitBill(10000, 3)` equals `[3334, 3333, 3333]`:

```text
✔ splits an evenly divisible bill into equal shares
✖ hands leftover cents to the first payers so shares add up to the bill
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  +   3333.3333333333335,
  -   3334,
ℹ pass 1
ℹ fail 1
```

The naive division is now shown to be wrong. Green: floor the base share and hand out the remainder with a loop. Cycle 3, red: `assert.throws(() => splitBill(5000, 0), /at least one person/)` fails with `Missing expected exception`, because zero people currently yields an empty list. Green: add the guard. With three tests passing, refactor: the loop becomes one expression, and the suite is run again.

```ts
export function splitBill(totalCents: number, people: number): number[] {
  if (people < 1) {
    throw new RangeError("a bill needs at least one person to pay it");
  }
  const base = Math.floor(totalCents / people);
  const leftover = totalCents % people;
  return Array.from({ length: people }, (_, i) => base + (i < leftover ? 1 : 0));
}
```

```text
✔ splits an evenly divisible bill into equal shares
✔ hands leftover cents to the first payers so shares add up to the bill
✔ refuses to split between zero people
ℹ pass 3
ℹ fail 0
```

While writing the guard a new case came up (a negative total). It goes on the list for the user to decide, not into the code.

### Example 2: a bug fix that starts with a failing test (pytest)

Report: "Customers who subscribed on January 31 get a server error at renewal." The function:

```python
def next_billing_date(current: date) -> date:
    if current.month == 12:
        return current.replace(year=current.year + 1, month=1)
    return current.replace(month=current.month + 1)
```

The suite is green (1 passed). Reproduce first, in `tests/test_schedule.py`:

```python
def test_subscription_started_on_the_31st_renews_on_the_last_day_of_a_short_month():
    assert next_billing_date(date(2026, 1, 31)) == date(2026, 2, 28)
```

```text
>       return current.replace(month=current.month + 1)
E       ValueError: day is out of range for month
1 failed, 1 passed in 0.01s
```

The failure is the reported one. Fix by clamping the day to the length of the target month:

```python
from calendar import monthrange
from datetime import date


def next_billing_date(current: date) -> date:
    year, month = (current.year + 1, 1) if current.month == 12 else (current.year, current.month + 1)
    last_day = monthrange(year, month)[1]
    return date(year, month, min(current.day, last_day))
```

`pytest -q` reports `2 passed`. Neighbouring cases with the same cause are added and pass without further changes: January 31, 2028 gives February 29 (leap year), and December 31, 2026 gives January 31, 2027. Final run: `4 passed in 0.01s`. Report to the user: the cause (month incremented without checking the day exists), the four behaviours now pinned, and one question the fix raises: after a clamped February, should March bill on the 28th or return to the 31st? The function sees only the previous date, so that is a product decision for the list, not something to guess.

## Guidelines

- **One test at a time.** Writing the whole list as tests up front means designing against guesses; each test should be informed by the code the previous one produced.
- **Run it; do not predict it.** State a result only after the command has been executed in this session, and show the line that proves it.
- **A test that has never failed proves nothing.** If you did not see red, you do not know the test checks anything.
- **Test behaviour through the public interface.** Tests that reach into private functions or internal state break on every restructuring and make refactoring look dangerous when it is not.
- **Keep the loop fast.** Run the single test or file while iterating and the full suite before each commit. If the suite takes minutes, tell the user; a slow loop is the usual reason the practice gets abandoned.
- **Keep tests deterministic.** No dependence on today's date, time zone, test order, network or shared state. A test that fails one run in twenty is a defect to fix, not to retry.
- **Snapshots are not a substitute for assertions** on new behaviour: a snapshot records whatever the code did, so it cannot fail first for the right reason.
- **Coverage is a by-product.** Do not add tests without assertions or for trivial accessors to raise a percentage.
- **Limits.** Visual layout, exploratory spikes and throwaway scripts are poorly served by test-first work; build the spike, then test-drive the version that will be kept. Concurrency and performance need dedicated tests beyond this loop.
- **When the user did not ask for TDD,** do not impose the full ceremony on a one-line fix; still add the regression test for a bug.
