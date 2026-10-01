---
name: understand-diff
description: >-
  Works out what a branch, pull request or uncommitted change touches and who
  depends on it, using the knowledge graph built by the Understand-Anything
  plugin, then writes the overlay file its dashboard highlights. Use when
  someone says "what does this diff affect", "review the impact of this PR",
  "what could this change break", "which tests should I run for this branch",
  "run /understand-diff", "show the blast radius", or wants a risk note on a
  change before review or merge.
license: Apache-2.0
compatibility: "A git repository analysed with Understand-Anything 2.9+ (a knowledge-graph.json in .ua/ or .understand-anything/); git 2.30+, Node.js 18+ and jq 1.6+ on the machine"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["code-review", "impact-analysis", "git-diff", "knowledge-graph", "understand-anything"]
  repository: https://github.com/Egonex-AI/Understand-Anything
---

# /understand-diff: Impact of a Change with Understand-Anything

## Overview

Understand-Anything is an open-source plugin for coding agents. Its `/understand` command analyses a repository and stores a knowledge graph as JSON; `/understand-diff` lays a set of changes over that graph. A plain diff shows which lines moved. The graph adds what a reviewer usually has to reconstruct by hand: which functions those lines belong to, which routes, jobs, tables, tests and documents are wired to them, and which architectural layers the change crosses.

This skill does that job in a checkable way. It maps the diff to graph nodes by line number, walks one relationship outward, turns the result into a short impact note with a risk level, and saves `diff-overlay.json` so the dashboard can colour the changed and affected nodes.

What it relies on in the graph file:

| Part | Used for |
|---|---|
| `project.gitCommitHash`, `project.analyzedAt` | deciding whether the graph still describes the code under review |
| `nodes[]`: `id`, `type`, `filePath`, `lineRange`, `complexity`, `summary` | mapping changed lines to files, functions, classes, tables, pipelines |
| `edges[]`: `source`, `target`, `type` | finding what leans on a changed node |
| `layers[]`: `name`, `nodeIds` | telling a local change from one that crosses a boundary |

No graph yet: install the plugin (`/plugin marketplace add Egonex-AI/Understand-Anything`, then `/plugin install understand-anything` in Claude Code) and run `/understand` once. The `understand-chat` skill has the full installation and analysis notes.

## Instructions

### 1. Pin down the two ends of the comparison

Ask only what the request leaves open: which change (working tree, current branch, a named branch, a pull request number) and against which base. Then resolve both to commits:

```bash
G=.ua/knowledge-graph.json
[ -d .understand-anything ] && G=.understand-anything/knowledge-graph.json
BASE=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD || echo origin/main)
FORK=$(git merge-base "$BASE" HEAD)
SHA=$(jq -r '.project.gitCommitHash' "$G")
```

`FORK` is the commit where the branch left the base. Comparing against it, and not against the tip of the base, keeps other people's merged work out of the result. For a GitHub pull request that is not checked out, `git fetch origin pull/482/head` and use `FETCH_HEAD` in place of `HEAD` here and as a second commit in the next command.

A missing graph file ends the job with one sentence: the project needs `/understand` first. Inside a git worktree the graph is kept in the main checkout, so look there before giving up.

### 2. Capture the diff with zero context

```bash
git -c core.quotePath=false diff -U0 --no-color --no-ext-diff --no-renames \
  --src-prefix=a/ --dst-prefix=b/ "$FORK" \
  -- . ':(exclude).ua' ':(exclude).understand-anything' > /tmp/ua-change.diff
git ls-files --others --exclude-standard > /tmp/ua-untracked.txt
```

With a single commit argument git compares that commit with the working tree, so committed, staged and unstaged edits all land in one diff. `-U0` makes every hunk header state exactly which old lines were replaced. `--no-renames` reports a moved file as a deletion plus an addition, which is what the graph needs: the old path is the one it knows. Brand-new files that were never added to git appear only in the second list.

### 3. Check that graph line numbers and diff line numbers agree

The graph's `lineRange` values describe the files as they were at `SHA`. The diff's old-side numbers describe them at `FORK`. They line up when the changed files did not move between those two commits:

```bash
git rev-parse --verify --quiet "$SHA^{commit}" >/dev/null &&
  git diff --name-only "$SHA" "$FORK" -- $(grep -h '^+++ b/\|^--- a/' /tmp/ua-change.diff | cut -c7- | sort -u)
```

| Result | Meaning | Action |
|---|---|---|
| no output | ranges and hunks match | continue |
| some files listed | those files changed on the base after the analysis | pass them to the script as whole-file arguments, and say so in the note |
| `SHA` does not resolve | shallow clone or rewritten history | pass every changed file as a whole-file argument; label the result "file level only" |
| most of the diff is listed, or the graph is months old | the graph describes a different codebase | recommend `/understand` on the base branch first (incremental runs re-analyse only changed files) |

### 4. Map the change onto the graph

Save this as `ua-impact.mjs` outside the repository or in a scratch folder. It reads the diff on standard input; arguments are the graph, a label for the base, then any whole-file paths (untracked files and the drifted files from step 3).

```javascript
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const [graphPath, baseName, ...wholeFiles] = process.argv.slice(2);
const g = JSON.parse(readFileSync(graphPath, "utf8"));
// Old-side line ranges per file, taken from the hunk headers.
const hunks = new Map(wholeFiles.map((p) => [p, []]));
let cur = null, header = false;
for (const line of readFileSync(0, "utf8").split("\n")) {
  let m;
  if (line.startsWith("diff --git ")) { cur = []; header = true; }
  else if (header && (m = /^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line))) hunks.set(m[1], hunks.get(m[1]) ?? cur);
  else if (cur && (m = /^@@ -(\d+)(?:,(\d+))? /.exec(line))) {
    header = false;
    const start = +m[1], len = m[2] === undefined ? 1 : +m[2];
    cur.push(len ? [start, start + len - 1] : [start + 0.5, start + 0.5]); // len 0: lines inserted after `start`
  }
}
// A node that has a lineRange is changed only when a hunk lands inside it.
const touched = (n) => !n.lineRange || wholeFiles.includes(n.filePath) ||
  hunks.get(n.filePath).some(([a, b]) => a <= n.lineRange[1] && b >= n.lineRange[0]);
const changed = g.nodes.filter((n) => hunks.has(n.filePath) && touched(n));
const changedIds = new Set(changed.map((n) => n.id));
const known = new Set(g.nodes.map((n) => n.filePath));
// One hop out. Most edges read "source relies on target"; these few run the other way.
const SKIP = new Set(["contains", "exports", "related", "similar_to"]);
const FROM_SOURCE = new Set(["tested_by", "configures", "deploys", "provisions", "serves",
  "triggers", "migrates", "defines_schema", "routes", "publishes"]);
const affected = new Map();
for (const e of g.edges) {
  if (SKIP.has(e.type)) continue;
  const [cause, hit] = FROM_SOURCE.has(e.type) ? [e.source, e.target] : [e.target, e.source];
  if (!changedIds.has(cause) || changedIds.has(hit)) continue;
  affected.set(hit, [...(affected.get(hit) ?? []), `${e.type} ${cause}`]);
}
// Layers list file-level nodes, so a function takes the layer of its file.
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const layerOfPath = new Map();
for (const l of g.layers) for (const id of l.nodeIds) if (byId.get(id)?.filePath) layerOfPath.set(byId.get(id).filePath, l.name);
const layer = (id) => layerOfPath.get(byId.get(id)?.filePath) ?? "(no layer)";
const testEdges = g.edges.filter((e) => e.type === "tested_by");
const covered = new Set(testEdges.map((e) => byId.get(e.source)?.filePath));
const testFiles = new Set(testEdges.map((e) => byId.get(e.target)?.filePath));
const untested = [...new Set(changed.filter((n) => ["file", "function", "class"].includes(n.type)).map((n) => n.filePath))]
  .filter((p) => !covered.has(p) && !testFiles.has(p));
console.log(`graph ${g.project.gitCommitHash.slice(0, 7)} (${g.project.analyzedAt.slice(0, 10)}), base ${baseName}`);
console.log(`\nCHANGED (${changed.length})`);
for (const n of changed) console.log(`  ${n.id}  [${n.complexity}]  ${layer(n.id)}`);
console.log(`\nAFFECTED (${affected.size})`);
for (const [id, why] of affected) console.log(`  ${id}  ${layer(id)}  <- ${why.join("; ")}`);
console.log(`\nLAYERS  changed: ${[...new Set(changed.map((n) => layer(n.id)))].join(", ")}\n        affected: ${[...new Set([...affected.keys()].map(layer))].join(", ")}`);
console.log(`\nNO tested_by EDGE: ${untested.join(", ") || "none"}`);
console.log(`NOT IN GRAPH: ${[...hunks.keys()].filter((p) => !known.has(p)).join(", ") || "none"}`);
writeFileSync(join(dirname(graphPath), "diff-overlay.json"), JSON.stringify({
  version: "1.0.0", baseBranch: baseName, generatedAt: new Date().toISOString(),
  changedFiles: [...hunks.keys()], changedNodeIds: [...changedIds], affectedNodeIds: [...affected.keys()],
}, null, 2) + "\n");
```

```bash
node ua-impact.mjs "$G" "$BASE" $(cat /tmp/ua-untracked.txt) < /tmp/ua-change.diff
```

### 5. Read past the first hop where it matters

The script stops one relationship away on purpose: two hops on a real project is most of the project. Go further by hand in three cases.

- An affected node is itself a function with callers (`jq -r --arg id "$ID" '.edges[] | select(.target == $id) | "\(.type) <- \(.source)"' "$G"`). Follow it until the chain reaches a route, job or command, because that is where a user would notice.
- A changed file is listed under `NOT IN GRAPH`. Open it and search the source for its importers; a new file is only reachable through files that are in the diff too.
- The diff changes a signature, an exported name or a table column. Search the source for the name (`git grep -n "bookSlot("`): the graph only has nodes for exported or substantial symbols and no edges for dynamic calls.

Then read the changed hunks themselves next to the summaries of the affected nodes. The graph tells where to look; whether the change is actually wrong for a caller is a judgement made in the code.

### 6. Grade the risk

Take the highest level whose row matches, and state which signal decided it.

| Level | Any of these |
|---|---|
| High | a changed code node is `complex` and its file appears under `NO tested_by EDGE`; a `table`, `schema`, `service`, `resource` or `pipeline` node changed; affected nodes sit in three or more layers; the diff changes something the graph cannot see and step 5 found callers by search |
| Medium | affected nodes sit in a layer other than the changed one; a changed node is `complex` or `moderate` but tested; more than five affected code nodes; files had to be passed as whole-file arguments |
| Low | everything changed and affected is in one layer, the nodes are `simple`, and a linked test exists or the change is to documents only |

`complexity` is a three-step label written by the analysing model, not a measured value, so it can raise the level and should never be the only reason to lower it.

### 7. Write the impact note

Plain text, in this order. Example 1 shows a complete one.

| Block | Content |
|---|---|
| Heading line | branch and base, the graph's short hash and date, and either "matches the base" or the freshness caveat from step 3 |
| `Risk:` | the level and the one signal that decided it |
| `Changed` | one row per touched symbol or file: path with line, name, what the hunk does (from reading it, not from the summary) |
| `Reaches` | one row per affected node worth a reviewer's time: path, how it is connected, what to check there |
| `Tests` | `run:` the test files linked by `tested_by` or importing a changed file; `missing:` changed files with no linked test |
| `Outside the graph` | new files, files the graph does not cover, callers found only by search |
| `Review first` | the one or two places most likely to be wrong, as questions |

Finish by telling the user that `diff-overlay.json` was written next to the graph and that the dashboard (`/understand-dashboard`, then `D` to toggle) shows the same sets as Changed and Affected with everything else faded. The dashboard loads the file with the page, so an open tab needs a reload, and it ignores an overlay whose `changedNodeIds` is empty.

## Examples

### Example 1: A branch that touches the booking rules

`clinic-booking` is a Fastify API with a 25-node graph. Branch `waitlist-notify` edits one line in `overlaps` (`src/lib/time.ts:7`), adds a call inside `bookSlot` (`src/services/scheduler.ts`, after line 29) and creates `src/services/waitlist.ts`. Step 3 prints nothing. The script prints:

```text
graph 7c41e0d (2026-09-28), base origin/main

CHANGED (4)
  file:src/services/scheduler.ts  [complex]  Booking Rules
  file:src/lib/time.ts  [simple]  Booking Rules
  function:src/services/scheduler.ts:bookSlot  [complex]  Booking Rules
  function:src/lib/time.ts:overlaps  [simple]  Booking Rules

AFFECTED (6)
  file:src/routes/slots.ts  HTTP API  <- imports file:src/services/scheduler.ts
  file:src/routes/appointments.ts  HTTP API  <- imports file:src/services/scheduler.ts; calls function:src/services/scheduler.ts:bookSlot
  file:src/services/reminders.ts  Booking Rules  <- imports file:src/lib/time.ts
  file:tests/scheduler.test.ts  Project Files  <- imports file:src/services/scheduler.ts; tested_by file:src/services/scheduler.ts
  function:src/services/scheduler.ts:findFreeSlots  Booking Rules  <- calls function:src/lib/time.ts:overlaps
  document:docs/booking-rules.md  Project Files  <- documents file:src/services/scheduler.ts

LAYERS  changed: Booking Rules
        affected: HTTP API, Booking Rules, Project Files

NO tested_by EDGE: src/lib/time.ts
NOT IN GRAPH: src/services/waitlist.ts
```

`findFreeSlots` was not edited (lines 12-21, no hunk), yet it is affected through `overlaps`, and it has a caller of its own: the `/slots` route. The note:

```text
Impact of waitlist-notify against origin/main   (graph 7c41e0d, 2026-09-28; matches the base)
Risk: High because affected nodes sit in three layers and the comparison in overlaps changed with no test linked to src/lib/time.ts

Changed
  src/lib/time.ts:7             overlaps   `<` became `<=`: intervals that only share an endpoint now count as overlapping
  src/services/scheduler.ts:30  bookSlot   awaits notifyWaitlist after the reminder is queued
  src/services/waitlist.ts      (new)      notifyWaitlist; body is a stub
Reaches
  src/services/scheduler.ts findFreeSlots   calls overlaps      back-to-back times: with 09:00-09:30 booked, the 08:30 and 09:30 slots vanish too
  src/routes/slots.ts                       GET /slots          returns fewer slots; tests/scheduler.test.ts expects 19 and would get 17
  src/routes/appointments.ts                POST /appointments  a waitlist failure now fails a booking that was already inserted
  docs/booking-rules.md                     documents the rule  says a slot is free when nothing overlaps; wording still fits only if endpoints may touch
Tests
  run: tests/scheduler.test.ts
  missing: src/lib/time.ts, src/services/waitlist.ts
Outside the graph
  src/services/waitlist.ts is new; its only importer is scheduler.ts, which is in the diff
Review first
  1. Is the `<=` in overlaps intended? It changes availability for every practitioner, not just the waitlist feature.
```

### Example 2: A migration and a CI change, no application code

The diff adds a `cancelled_at` column to the `appointments` table in `src/db/schema.sql` and moves the workflow to Node.js 24.

```text
CHANGED (2)
  pipeline:.github/workflows/ci.yml  [simple]  Project Files
  table:src/db/schema.sql:appointments  [moderate]  Data Access

AFFECTED (4)
  function:src/db/appointments-repo.ts:findByDay  Data Access  <- reads_from table:src/db/schema.sql:appointments
  function:src/db/appointments-repo.ts:insertAppointment  Data Access  <- writes_to table:src/db/schema.sql:appointments
  function:src/db/appointments-repo.ts:markCancelled  Data Access  <- writes_to table:src/db/schema.sql:appointments
  file:tests/scheduler.test.ts  Project Files  <- triggers pipeline:.github/workflows/ci.yml
```

Risk is High on the table rule alone. The useful finding comes from reading the three functions the graph pointed at: `markCancelled` sets `status` and nothing else, so the new column would stay empty. The note says so, lists `findByDay` as unaffected in behaviour (`select *` picks the column up, the row mapper ignores it), and adds that `package.json` and the workflow should agree on the Node.js version.

### Example 3: The graph is too old to trust

Step 3 lists 41 of the 47 changed files, and the graph is dated five months back. The agent does not produce a risk level from it. It reports the file-level picture only (every changed file passed as a whole-file argument), marks the note "file level only, graph predates the base by 212 commits", and proposes running `/understand` on the base branch before the review, with the warning that it uses the session's model on every changed file.

## Guidelines

- Never treat "nothing affected" as "safe". No edge exists for dynamic dispatch, dependency injection, reflection, string-keyed routes, SQL written as text, or code excluded through `.understandignore`.
- Edges of type `calls`, and all summaries, were written by a model during analysis. Import edges come from the parser. Confirm any call chain that carries a High verdict in the source.
- Keep the overlay honest: `changedNodeIds` holds what the diff touches, `affectedNodeIds` what depends on it. Do not add nodes to make the picture look fuller, and do not commit the overlay; it describes one branch at one moment.
- Paths with spaces break the unquoted `$(cat ...)` expansions above. For such a repository pass the whole-file paths as a quoted array.
- Analysing a subdirectory of a monorepo puts the graph inside that subdirectory, with paths relative to it. Run every command from there, and expect files outside it under `NOT IN GRAPH`.
- A formatting-only or generated-file diff (lockfiles, snapshots) will light up many nodes without meaning. Leave such files out of the pathspec and say that they were left out.
- Skip this skill for a one-file change in a repository small enough to read, for a repository that is not a git checkout, and for knowledge or design graphs (`"kind": "knowledge"` or `"design"` in the graph file), which have no code relationships to walk.
