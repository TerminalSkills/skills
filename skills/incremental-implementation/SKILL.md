---
name: incremental-implementation
description: >-
  Builds a change as a sequence of small steps, each of which leaves the project building, passing its checks and safe to merge or revert on its own. Use when a user asks to implement a feature that spans several files or layers, says "do this step by step", "break this into small commits", "this is too big for one change", "migrate without downtime", "keep the build green", or when a large change is about to be written in one pass. Produces a step plan with a check for every step and a short report after each one.
license: Apache-2.0
compatibility: "Any agent that can edit files and run the project's build and test commands. Examples use git, Node.js 20+ and SQL; the method does not depend on them."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["incremental-delivery", "vertical-slices", "feature-flags", "refactoring", "workflow"]
---

# Incremental Implementation

## Overview

A large change written in one pass fails in one piece: nothing can be run until everything exists, the first error could be anywhere in a thousand lines, and the reviewer gets a diff too big to read. The alternative is to cut the work into steps that each do one thing, prove it with a command, and leave the project in a state that could be merged.

This skill covers how to find the project's checks, how to cut a change into steps using the established patterns (vertical slice, expand–migrate–contract, branch by abstraction, feature flag), what to do after every step, and how to get back to a working state when a step goes wrong.

## Instructions

### 1. Establish the baseline

1. Find the commands that define "working". The CI workflow is the authoritative list; otherwise read `package.json` scripts, `Makefile`, `justfile`, `pyproject.toml` or the README. Typically: build, type check, lint, tests.
2. Run them before touching anything, with a time limit so a hanging test cannot stall the loop (`timeout 300 npm test`). Record the result. A check that already fails is reported to the user and excluded from "green" by agreement, not fixed silently.
3. Look at the working tree. If it holds uncommitted work, ask before building on top of it.
4. Ask what the code cannot tell you: commit after every step or leave commits to the user; work on a new branch or the current one; whether unfinished work may reach the main branch behind a flag; whether a database or public API is involved and who else consumes it.

### 2. Cut the change into steps

Every step must pass five tests:

- **One purpose.** It can be described without "and".
- **Green.** All baseline checks pass after it.
- **Observable.** It adds something that can be run, called or seen, or a test that now passes.
- **Small.** Aim for about 100 changed lines and a handful of files. Several hundred lines is a signal to cut again; generated code and pure renames are the exception.
- **Revertable.** Undoing it alone does not break the steps before it.

Choose the cut by the kind of change:

| Pattern | Use it when | The first step is |
|---|---|---|
| Vertical slice | A feature crosses storage, logic and interface | The thinnest path through every layer for one case, with the rest hard-coded or absent |
| Walking skeleton | A new service or pipeline | Empty stages connected end to end and running in the real environment |
| Riskiest part first | Nobody knows whether the key piece works | A time-boxed proof of that piece alone |
| Contract first | Two sides are built in parallel | The agreed schema or types, plus a stub that returns canned data |
| Expand, migrate, contract | A column, endpoint or function signature that is in use must change | Add the new form next to the old one; nothing reads it yet |
| Branch by abstraction | A component called from many places is being replaced | Put an interface in front of the old component and route callers through it |
| Preparatory refactoring | The current structure makes the change awkward | A behaviour-preserving refactor with the tests unchanged |
| Feature flag | A step must merge before the feature is complete | The flag, off by default, with its removal listed as the last step |

Ordering rules:

- The step with the most uncertainty goes first. Learning that the plan is wrong should be cheap.
- Refactoring and behaviour change never share a step. A refactor step changes no test expectations.
- Tests travel with the code they cover, in the same step.
- A schema or data change lands before the code that needs it and is compatible with the code already running.
- Removing the old path is its own step, last, after the new path has been used for real.
- Do not cut by layer (all tables, then all endpoints, then all screens). Nothing is observable until the final step, which defeats the purpose.

### 3. Write the plan down

Show this table before starting whenever there are more than three steps, and keep it updated.

```text
| # | Step | Proves | Check | Flag |
|---|------|--------|-------|------|
```

"Proves" is the observable result in plain words. "Check" is a command, or a manual action with the expected outcome.

### 4. Run the loop for each step

1. Say which step is starting.
2. Change only what the step needs.
3. Run the checks. Use the fast ones (type check, the tests for the touched module) while working and the full set before calling the step done.
4. Exercise the result itself: call the endpoint, run the command, open the page. A passing suite proves only what the tests cover.
5. Read your own diff (`git diff --stat`, then the diff). Anything that does not belong to this step comes out.
6. Commit if that was agreed, with a message that names the step; otherwise stop and hand over.
7. Report, then revise the remaining plan with what the step taught you.

```text
Step 2 of 5 done: export route behind EXPORT_CSV
Changed: src/server.js (+9), test/export-route.test.js (+21)
Checks: npm test -> 44 passed, 0 failed · npm run lint -> clean
Tried by hand: GET /invoices/export.csv -> 404 with the flag off, 200 text/csv with EXPORT_CSV=1
Noticed, not touched: src/server.js has no handler for HEAD requests
Next: step 3, "Export" link on the invoices page
```

Useful git commands for the loop:

```bash
git status --short                                # start from a known state
git switch -c feature/invoice-csv-export          # one branch for the whole change
git add -p                                        # stage only the hunks of this step
git commit -m "Add CSV serializer for invoices"
git stash push -u -m "step 3, failed attempt"     # return to the last green state, keep the work
git revert --no-edit 4f2a9c1                      # undo one committed step
git bisect start && git bisect bad && git bisect good v0.4.0
git bisect run npm test                           # find the step that broke a check, then: git bisect reset
```

### 5. When a step goes red

- If the cause is understood and the fix is a few lines, fix it inside the step. Two attempts at most.
- Otherwise go back to the last green state (stash uncommitted work, revert a committed step) and cut the step smaller. A step that failed twice was too big or rested on a wrong assumption.
- Never start the next step on a red build, and never get to green by deleting or skipping a test, loosening an assertion or bypassing commit hooks. If a test is wrong, changing it is its own step with the reason stated.

### 6. Things noticed along the way

Unrelated bugs, dead code and tempting clean-ups go into the "Noticed, not touched" line of the report. They are not fixed in the current step. If one of them blocks the step, it becomes a separate step placed before it.

### 7. Finish

Remove what was temporary: flags, stubs, dual writes, the old code path. Each removal is a planned step with its own check. Then run every baseline check on the final state and give the user the list of steps with their commits and anything still open.

## Examples

### Example 1: a feature across layers, merged dark

Request: "Add CSV export to the invoices page of Ledgerline." Baseline: `npm test` passes (41 tests), `npm run lint` clean. The user wants a commit per step and allows unfinished work on main behind a flag.

```text
| # | Step                                         | Proves                                              | Check                             | Flag       |
|---|----------------------------------------------|-----------------------------------------------------|-----------------------------------|------------|
| 1 | toCsv(invoices) pure function                | Quoting and number format are right                 | npm test (new unit test)          | -          |
| 2 | GET /invoices/export.csv                     | The file downloads for the signed-in account        | npm test (route test) + curl      | EXPORT_CSV |
| 3 | "Export" link on the invoices page           | A user can reach it                                 | Open /invoices with the flag on   | EXPORT_CSV |
| 4 | Date-range filter passed through to export   | The export matches what the page shows              | Route test with from/to           | EXPORT_CSV |
| 5 | Remove the flag after a week in production   | Feature is on for everyone, no dead branch          | grep finds no EXPORT_CSV; npm test | removed    |
```

Step 1 has no I/O, so it is the cheapest place to settle the format:

```js
// src/invoice-csv.js
const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))
export function toCsv(invoices) {
  const rows = invoices.map((i) => [i.number, i.customer, i.issuedOn, (i.totalCents / 100).toFixed(2)])
  return [['number', 'customer', 'issued_on', 'total'], ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}
```

Step 2 adds the route and keeps it invisible until the flag is set:

```js
// src/server.js (inside the request handler)
if (req.method === 'GET' && req.url === '/invoices/export.csv' && flags.exportCsv) {
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="invoices.csv"' })
  return res.end(toCsv(invoices))
}
```

Its tests cover both states of the flag (404 when off, the exact CSV body when on), so the dark path is verified too. The report after step 2 is the one shown in section 4. Step 4 was added after step 3, when trying the link by hand showed that the export ignored the filter the page had applied: the plan changed because a step was observable.

### Example 2: changing a column that is in use

Request: "`orders.total` is a float and we get rounding errors. Move it to integer cents without downtime." The table has 2.3 million rows and two services read it.

```text
| # | Step                                                   | Proves                                   | Check                                         |
|---|--------------------------------------------------------|------------------------------------------|-----------------------------------------------|
| 1 | Expand: add nullable total_cents                       | Old code still runs against new schema   | Migration applies; full suite green           |
| 2 | Write both columns on every insert and update          | New rows carry both values               | Test: created order has total_cents           |
| 3 | Backfill old rows in batches of 5,000                  | No row is missing the new value          | Count of NULL total_cents is 0                |
| 4 | Read from total_cents in the API, then in the reports  | Every consumer uses the new column       | Mismatch count is 0; one deploy per consumer  |
| 5 | Stop writing total                                     | Nothing depends on the old column        | grep for the column name; suite green         |
| 6 | Contract: back up, then drop total                     | Schema is clean                          | Migration applies after a week without reads  |
```

```sql
-- step 1
ALTER TABLE orders ADD COLUMN total_cents INTEGER;

-- step 3, repeated per id range by a script that sleeps between batches
UPDATE orders
SET total_cents = CAST(ROUND(total * 100) AS INTEGER)
WHERE total_cents IS NULL AND id BETWEEN 1 AND 5000;

-- checks for steps 3 and 4: both must return 0
SELECT COUNT(*) FROM orders WHERE total_cents IS NULL;
SELECT COUNT(*) FROM orders WHERE total_cents <> CAST(ROUND(total * 100) AS INTEGER);

-- step 6, a separate release, after a backup
ALTER TABLE orders DROP COLUMN total;
```

Each step is deployable alone, and until step 6 every one can be rolled back without losing data. Step 6 is the only irreversible one, which is why it waits and why it is announced to the owners of both services first.

## Guidelines

- Size is a means. A step that is small but leaves the build broken, or proves nothing, is not an increment. A step that is one line but touches 400 generated files is fine.
- Steps can also be too small. If every step needs the next one to be meaningful, merge them; the unit is "one thing that can be checked", not "one file".
- A release flag is debt from the day it is added. Put its removal in the plan, and do not let two flags for unfinished features interact.
- An expand step without its contract step leaves the system worse than before: two columns, two code paths, and nobody sure which is current. Do not report the work as finished until the old form is gone or its removal is scheduled.
- Passing checks are evidence only for what they exercise. Where there are no tests around the code being changed, the first step is to add a test that pins the current behaviour.
- Do not batch verification ("I'll run the tests at the end"). The value of the method is that a failure points at the last few lines written.
- Commit, push and merge only as far as the user agreed. Small steps do not imply permission to publish them.
- Not worth the ceremony for a one-line fix, a throwaway prototype, or a purely mechanical change such as a formatter run or a rename, which is better as one commit containing nothing else.
