---
name: improve-codebase-architecture
description: >-
  Surveys a real repository for structural problems and turns the findings into a staged plan:
  measures churn, size, import cycles, coupling and co-change, finds shallow modules (wrappers
  that hide nothing) and tangled clusters, ranks a few candidates on evidence, designs the new
  boundary and proposes the change as small reversible steps guarded by a CI rule. Use when
  someone says "improve the architecture", "where should we refactor", "this codebase is a
  mess", "find the worst modules", "untangle these dependencies", "too many tiny files",
  "make this easier to test", or asks for a refactoring roadmap.
license: Apache-2.0
compatibility: "Any git repository. Commands are given for JavaScript/TypeScript on Node.js 22.12+ (madge 8, dependency-cruiser 18, knip 6) and Python 3.10+ (grimp, radon 6, import-linter 2); the method carries over to other languages with their own dependency tools."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["architecture", "refactoring", "dependency-analysis", "technical-debt", "modularity"]
---

# Improve Codebase Architecture

## Overview

Architecture work fails in two ways: opinions without evidence, and plans too large to ship. This skill replaces both with a procedure: measure the repository, name a handful of candidates with the numbers that support them, let the user choose, design the new boundary, and deliver it as steps that each keep the build green. Two kinds of problem repay the effort most:

- **Shallow module**: its interface is nearly as large as what it does. Pass-through wrappers, one-function files and layers that only forward mean a reader opens five files to follow one idea and a caller gains nothing.
- **Tangled cluster**: modules that cannot be understood, tested or changed apart. Import cycles, files in different folders that always change together, and modules that import half the codebase.

The output is an evidence table, three to five candidate cards, and one proposal with a staged plan. Code changes only after the user approves a step.

## Instructions

### 1. Set the scope

Ask what hurts (slow changes, repeat bugs in one area, tests that need heavy mocking, onboarding), which paths are off limits (generated, vendored, about to be deleted), how much change the team can take per week, and where proposals live (a docs folder or the issue tracker). Then read the README, any architecture notes, the CI config and the test command, and run the tests. A red baseline makes every later step unverifiable, so report it and stop if they fail.

### 2. Measure

Keep measurement output outside the repository: `export ARCH=$(mktemp -d)`.

**Hotspots, any language.** Commits in the last year multiplied by current length; columns are score, commits, lines, file. Run from the repository root and replace `src` with the source root.

```bash
git log --no-merges --since=12.months --name-only --pretty=format: -- src | grep . | sort | uniq -c | sort -rn > "$ARCH/churn.txt"
while read -r n f; do [ -f "$f" ] && echo "$((n * $(wc -l < "$f"))) $n $(wc -l < "$f") $f"; done < "$ARCH/churn.txt" | sort -rn | head -15
```

**Co-change, any language.** Save as `$ARCH/cochange.py`; it lists file pairs from different folders that keep landing in the same commit.

```python
"""git log --no-merges --since=12.months --name-only --pretty=format:'@%h' -- src | python3 "$ARCH/cochange.py" 5"""
import collections, itertools, sys

min_shared = int(sys.argv[1]) if len(sys.argv) > 1 else 5
commits, files = [], None
for line in sys.stdin:
    line = line.strip()
    if line.startswith("@"):
        files = set()
        commits.append(files)
    elif line and files is not None:
        files.add(line)
changes, together = collections.Counter(), collections.Counter()
for files in commits:
    if len(files) > 30:  # sweeping commits (renames, formatting) say nothing about coupling
        continue
    changes.update(files)
    together.update(itertools.combinations(sorted(files), 2))
for (a, b), n in together.most_common():
    if n >= min_shared and a.rsplit("/", 1)[0] != b.rsplit("/", 1)[0]:
        print(f"{n:4} commits  {n / min(changes[a], changes[b]):4.0%} of the rarer file  {a}  <->  {b}")
```

**Dependencies, JavaScript and TypeScript.**

```bash
npx madge --circular --extensions ts,tsx src                       # import cycles
npx madge --json --extensions ts,tsx --exclude '\.test\.tsx?$' src > "$ARCH/deps.json"
npm install --prefix "$ARCH" dependency-cruiser typescript@6       # outside the repository, with a TypeScript it can load
"$ARCH/node_modules/.bin/depcruise" src --no-config --do-not-follow node_modules --metrics --output-type metrics   # Ca, Ce, instability per folder and module
npx knip --files --exports                                         # files and exports nothing uses
grep -rcE "(vi|jest)\.mock\(" src --include='*.test.ts' | sort -t: -k2 -rn | head   # mocks per test file
```

Save this as `$ARCH/shape.cjs` and run `node "$ARCH/shape.cjs" src` for per-file size, exports, importers (fanIn) and imports (fanOut):

```js
const fs = require('fs'), path = require('path')
const root = process.argv[2] || 'src', deps = require(path.join(process.env.ARCH, 'deps.json'))
const fanIn = {}
for (const targets of Object.values(deps)) for (const t of targets) fanIn[t] = (fanIn[t] || 0) + 1
const rows = Object.keys(deps).map((file) => {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const loc = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length
  return { file, loc, exports: (text.match(/^export\s/gm) || []).length, fanIn: fanIn[file] || 0, fanOut: deps[file].length }
})
const show = (title, list) => { console.log('\n' + title); console.table(list.slice(0, 10)) }
show('Most outgoing imports', [...rows].sort((a, b) => b.fanOut - a.fanOut))
show('One importer and under 40 lines', rows.filter((r) => r.fanIn === 1 && r.loc < 40).sort((a, b) => a.loc - b.loc))
show('Fewer than 8 lines per export', rows.filter((r) => r.exports >= 5 && r.loc / r.exports < 8))
```

**Dependencies, Python.** `pip install grimp radon import-linter` in the project's virtualenv, then `radon cc src -s -n C` for functions of cyclomatic complexity 11 and above, and for coupling (replace `clinic` with the top-level package):

```python
import grimp
graph = grimp.build_graph("clinic")
for m in sorted(graph.modules, key=lambda m: -len(graph.find_modules_directly_imported_by(m)))[:15]:
    out, into = graph.find_modules_directly_imported_by(m), graph.find_modules_that_directly_import(m)
    print(f"{m:40} fan-out {len(out):2}  fan-in {len(into):2}")
```

### 3. Turn numbers into suspects, then read them

| Signal (starting thresholds) | Source | What it suggests |
|---|---|---|
| Import cycle | madge | the files in the loop are one module split in the wrong place |
| Pair in different folders sharing 5+ commits and 50%+ of the rarer file's changes | cochange.py | one decision lives in two places |
| Fan-out of 15 or more, or the top 5% | shape script, grimp | a module that knows too much |
| Top 10 by commits times lines | hotspot loop | where leaving things alone costs most |
| One importer and under 40 lines | shape script | shallow: could it merge into its only caller? |
| Fewer than 8 lines per export | shape script | interface almost as big as the body |
| Function bodies that are one call with the same arguments | reading | a layer that only forwards |
| The same three calls in the same order at many call sites | grep | callers are doing the module's job |
| A unit test that replaces four or more modules | mock count | the boundary is in the wrong place |

Numbers nominate; reading decides. Open every suspect. These are not problems: index files that only re-export, type-only files, generated code, files a framework requires (routes, migrations), and thin adapters that sit deliberately at the edge of one external system.

### 4. Write candidate cards and rank them

One card per candidate, at most five:

```markdown
### C1. Pricing rules are split between orders and invoices
Kind: tangled cluster
Evidence: cycle orders/pricing.ts > invoices/totals.ts; 31 shared commits (57%); both in the hotspot top 5
Cost today: every discount change edits both files; four of the last nine billing bugs were totals that disagreed
Target: one pricing module with a single entry point that orders and invoices both call
Blast radius: 2 files move, 11 importers change, no schema change
Risk: medium, it is money. Behaviour is pinned by tests before anything moves
Effort: 5 pull requests
```

Score = independent signals (1 to 3) × relevance to the stated pain (1 to 3) ÷ effort (1 up to two pull requests, 2 up to five, 3 beyond). Show the table and let the user pick one or two. Do not design before they pick.

### 5. Design the new boundary

Write the target as declarations: the entry points, their types, and the list of what moves inside. It is good enough when callers need to know less than before, dependencies point one way, and the module can be tested through its entry point with at most one fake for real I/O. For a shallow chain decide the merge direction: fold the forwarding layer into its caller when the caller owns the decision, into its callee when the callee does.

### 6. Stage the change

Each step is one pull request that passes the tests and can be reverted alone.

1. **Pin behaviour.** Add tests through the future entry point that record what the code does today, including odd results. Report suspected bugs; do not fix them in the same step.
2. **Add the entry point as a facade** over the existing code. No caller changes.
3. **Move callers in batches**, one folder at a time, while the old paths still work.
4. **Move the implementation behind the facade** and delete the old paths. Re-run the cycle check here.
5. **Lock it in** with a dependency rule in CI, and re-measure.

For step 5, add dependency-cruiser to the project (`npm install --save-dev dependency-cruiser`) and a `.dependency-cruiser.cjs`; `npx depcruise src --config .dependency-cruiser.cjs` exits with the number of errors, so CI fails on any violation:

```js
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'pricing-through-its-entry-point', severity: 'error',
      from: { pathNot: '^src/pricing/' },
      to: { path: '^src/pricing/', pathNot: '^src/pricing/index\\.ts$' } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' } },
}
```

Existing violations elsewhere need not block the rule: `--baseline` writes them to `.dependency-cruiser-known-violations.json` and `--ignore-known` then fails only on new ones. In Python the same job is an import-linter contract (`layers`, `forbidden` or `independence`) checked by `lint-imports`.

### 7. Write the proposal

Save it where the scope step said (for example `docs/architecture/2026-10-pricing-module.md`), with these sections: problem and evidence table; target boundary as declarations; the steps as a table of pull request, change and proof; what is deliberately not being done; the numbers to re-measure afterwards. Ask before opening issues or pull requests.

## Examples

### Example 1: a tangled cluster in a TypeScript backend

Northbay Couriers runs an Express service of 412 files and 38,400 lines. The stated pain: "every pricing change breaks invoices". Tests pass. Measurements:

```text
61596 87 708 src/orders/order.service.ts            hotspots: score commits lines file
35224 68 518 src/orders/pricing.ts
22302 54 413 src/invoices/totals.ts

✖ Found 3 circular dependencies!
1) orders/pricing.ts > invoices/totals.ts
2) orders/order.service.ts > shipments/label.ts > orders/order.repo.ts
3) auth/session.ts > users/user.service.ts

  31 commits   57% of the rarer file  src/invoices/totals.ts  <->  src/orders/pricing.ts
  12 commits   29% of the rarer file  src/orders/order.service.ts  <->  src/shipments/label.ts
```

Seven files had one importer and under 40 lines; reading them showed five index files and two real wrappers.

| # | Candidate | Kind | Signals | Pain | Effort | Score |
|---|---|---|---|---|---|---|
| C1 | Pricing rules split between `orders/pricing.ts` and `invoices/totals.ts` | tangled | 3: cycle, co-change, two hotspots | 3 | 2 | 4.5 |
| C2 | `order.service.ts` also prints labels and queries the database (fan-out 23) | tangled | 3: cycle, top hotspot, fan-out | 2 | 3 | 2.0 |
| C3 | `shipments/carrier.facade.ts` forwards six calls unchanged | shallow | 2: one importer, 3 lines per export | 1 | 1 | 2.0 |
| C4 | `auth/session.ts` and `users/user.service.ts` import each other | tangled | 1: cycle | 1 | 1 | 1.0 |

The user picks C1. Target boundary, in `src/pricing/index.ts`, the only file other folders may import:

```ts
export type Quote = { lines: QuoteLine[]; subtotal: Money; discount: Money; tax: Money; total: Money }
export function quote(order: OrderDraft, at: Date): Quote
```

| PR | Change | Proof |
|---|---|---|
| 1 | Tests run 40 recorded orders through today's order price and invoice total and compare with a saved snapshot | green on main; 2 orders where the two disagree are reported, not fixed |
| 2 | `quote()` added, delegating to the existing functions | no caller touched, tests green |
| 3 | The 7 importers in `orders/` call `quote()` | tests green |
| 4 | The 4 importers in `invoices/` call `quote()`; rule code moves into `src/pricing/`; `invoices/totals.ts` deleted | `madge --circular` reports 2 cycles, not 3 |
| 5 | The dependency rule from step 6 runs in CI with the two older cycles baselined | `depcruise --ignore-known` exits 0 |

To re-measure after three months: commits that touch both orders and invoices (31 before), and billing bugs caused by disagreeing totals.

### Example 2: a forwarding layer in a Python service

A dental clinic's booking API is layered `app.api > app.services > app.managers > app.repositories`. The pain: "adding a field means editing four files". The grimp script shows all 14 modules in `app.managers` with fan-in 1 and fan-out 1, and reading them shows 31 of 36 functions consist of one call to a repository method with the same arguments. Nine service test files patch a manager.

Card: shallow layer, 3 signals, pain 3, effort 2, score 4.5. Design: remove `app.managers`; the five functions with real logic move into the service that calls them, since the services own those decisions. Plan: three pull requests by domain (appointments, patients, billing), each moving functions, updating imports and deleting the emptied manager files, with the existing API tests as the safety net; a fourth adds the guard:

```ini
[importlinter]
root_package = app

[importlinter:contract:layers]
name = api above services above repositories
type = layers
layers =
    app.api
    app.services
    app.repositories
```

`lint-imports` then prints `Contracts: 1 kept, 0 broken.` Result: 14 files and one hop removed, and a new field touches three files.

## Guidelines

- Thresholds are starting points. In a repository of 60 files a fan-out of 15 is everything; in one of 6,000 it is ordinary. Compare modules with their neighbours, not with the table.
- madge counts `import type` edges, so type-only loops appear as cycles. Add `{"detectiveOptions":{"ts":{"skipTypeImports":true}}}` to `.madgerc` to see runtime cycles only; dependency-cruiser ignores type-only imports by default.
- dependency-cruiser reads TypeScript only through a `typescript` package installed beside it, versions 2 to 6 as of 18.5. Run as `npx -p dependency-cruiser depcruise`, or in a project on TypeScript 7, it finds none, reports `0 modules, 0 dependencies cruised` and exits 0, so a guard set up that way never fails. Check the cruised count, and where the project's TypeScript is too new use the `$ARCH` install from step 2. A bare `npx depcruise` with no local install fetches an unrelated placeholder package.
- knip loads the project's own config files, so run it after the dependencies are installed; otherwise it fails to read them and reports far too much as unused. Treat its list as leads, never as a delete list.
- History-based signals need history: after a squash import or in a young repository, rely on the dependency graph and on reading.
- Co-change inside one folder is normal and is filtered out. A pair across folders is only a finding when the commits were about one concern; check a few commit messages.
- Small files are not the problem; files that add a hop without hiding a decision are. Merging two modules that change for different reasons creates a tangle.
- Never combine a structural move with a behaviour change in one pull request. If pinning tests reveal a bug, record it and keep the behaviour until the move is finished.
- Stop when the tests are red, when the user cannot name a pain, or when the top candidate scores under 2: a report saying "no change is worth its cost right now" is a valid result.
- Not for renaming, formatting or style clean-ups, and not for choosing a framework or splitting into services. Those are different decisions with different evidence.
