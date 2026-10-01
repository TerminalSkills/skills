---
name: understand-explain
description: >-
  Explains one file, function, class, table or folder of a codebase in depth,
  starting from the knowledge graph built by the Understand-Anything plugin and
  confirming every statement in the source. Use when someone says "explain this
  file", "how does this function work", "walk me through the scheduler module",
  "what is this class for and who uses it", "run /understand-explain
  src/services/scheduler.ts", "I inherited this code, what does it do", or needs
  a written deep dive on a specific part of a project.
license: Apache-2.0
compatibility: "A repository analysed with Understand-Anything 2.9+ (a knowledge-graph.json in .ua/ or .understand-anything/); jq 1.6+, git and standard shell tools (sed, nl, grep)"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["code-explanation", "knowledge-graph", "codebase-analysis", "legacy-code", "understand-anything"]
  repository: https://github.com/Egonex-AI/Understand-Anything
---

# /understand-explain: Deep Dive on a File or Function with Understand-Anything

## Overview

Understand-Anything is an open-source plugin for coding agents. `/understand` analyses a repository once and saves a knowledge graph as JSON; `/understand-explain` takes one target, such as `src/services/scheduler.ts` or `src/services/scheduler.ts:bookSlot`, and explains it.

Reading a file tells what its lines do. It does not tell why the file exists, which requests end up in it, what it is allowed to assume about its inputs, or what would break if it changed. The graph holds exactly that surrounding picture: the node's summary and tags, its architectural layer, the tour step that introduces it, and every relationship in and out. This skill pulls that picture in one query, then reads the code and writes an explanation in which the context comes from the graph and every statement about behaviour comes from a line that was opened.

Graph fields it reads:

| Field | Role in the explanation |
|---|---|
| `nodes[]`: `id`, `type`, `name`, `filePath`, `lineRange`, `summary`, `tags`, `complexity`, `languageNotes` | finding the target and its exact lines; a first hypothesis of its purpose |
| `edges[]`: `source`, `target`, `type` | what the target relies on and what uses it |
| `layers[]`: `name`, `description`, `nodeIds` | where it sits in the architecture |
| `tour[]`: `order`, `title`, `nodeIds`, `languageLesson` | whether the analysis considered it part of the main story |
| `project.gitCommitHash` | whether the graph still matches the file |

No graph in the project: install the plugin (in Claude Code, `/plugin marketplace add Egonex-AI/Understand-Anything` and `/plugin install understand-anything`) and run `/understand`. Installation on other hosts and the analysis options are covered in the `understand-chat` skill.

## Instructions

### 1. Settle the target and the reader

The target comes from the request. Accept any of these forms:

| Given | Meaning |
|---|---|
| `src/lib/time.ts` | a file |
| `src/lib/time.ts:overlaps` | a function or class inside a file |
| `overlaps` or `SlotTakenError` | a bare name, to be looked up |
| `src/db/` | everything under a folder |
| "the booking logic", "whatever sends reminders" | a description; turn it into names first by matching `tags` and `summary` |

Decide who is reading, because it changes the depth and the vocabulary. If the request does not say, assume the second row.

| Reader | Write |
|---|---|
| Knows programming, not this language | the standard explanation plus a plain reading of each idiom; use `languageNotes` when the node has it |
| Engineer new to this codebase | purpose, position, walkthrough, contracts, dependants, risks |
| Maintainer or reviewer about to change it | the same, plus invariants, failure modes, the tests that pin behaviour and the places that must change together |

### 2. Find the node

```bash
G=.ua/knowledge-graph.json
[ -d .understand-anything ] && G=.understand-anything/knowledge-graph.json
T='src/services/scheduler.ts:bookSlot'
jq -r --arg t "${T%/}" '
  ($t | split(":")) as $parts
  | .nodes[]
  | select(.filePath == $t or .name == $t
           or (($parts | length) == 2 and .filePath == $parts[0] and .name == $parts[1])
           or ((.filePath // "") | startswith($t + "/")))
  | [.id, .complexity, (.lineRange // [] | join("-"))] | @tsv' "$G"
```

Run it from the directory that holds the data folder (the repository root, or the analysed subdirectory of a monorepo). What comes back decides the next move:

- One line for a `path:name` target, or a file line followed by its members for a path: continue with the first id.
- Several unrelated ids for a bare name: show them and ask which one, or pick the one in the file the conversation is about and say so.
- A folder: the file-level ids under it. Explain the folder as a unit (step 6 has the shape) and offer a deep dive on its most connected file.
- Nothing: check the spelling against `jq -r '.nodes[].filePath // empty' "$G" | sort -u | grep -i scheduler`. A file that exists on disk but has no node is new, generated, or excluded by `.understandignore`. Explain it from source alone and state that the graph had no context for it.

### 3. Pull the dossier

Save this filter as `ua-dossier.jq`. It prints the target, its layer and tour steps, the symbols it contains, and its relationships in both directions. For a file it treats the file and its members as one unit, so calls made by its functions count as the file's own.

```jq
(.nodes | map({key: .id, value: .}) | from_entries) as $n
| $n[$id] as $me
| ([$id] + [.edges[] | select(.type == "contains" and .source == $id) | .target]) as $scope
| def inside: . as $x | $scope | index($x) != null;
  def links(f; g): [.edges[] | select(.type != "contains" and .type != "exports")
    | select((f | inside) and (g | inside | not)) | "  \(.type)  \(g)  -- \($n[g].summary)"] | unique[];
  "TARGET   \($me.id)  [\($me.complexity)]  \($me.filePath // "-") \($me.lineRange // [] | join("-"))",
  "SUMMARY  \($me.summary)",
  "TAGS     \($me.tags | join(", "))" + (if $me.languageNotes then "\nNOTES    \($me.languageNotes)" else "" end),
  (.layers[] | select(any(.nodeIds[]; $n[.].filePath == $me.filePath)) | "LAYER    \(.name): \(.description)"),
  (.tour[] | select(any(.nodeIds[]; inside)) | "TOUR     step \(.order): \(.title)"),
  "MEMBERS", ($scope[1:][] | "  \(.)  lines \($n[.].lineRange // [] | join("-"))  [\($n[.].complexity)]"),
  "RELIES ON", links(.source; .target),
  "USED BY", links(.target; .source)
```

```bash
jq -r --arg id 'function:src/services/scheduler.ts:bookSlot' -f ua-dossier.jq "$G"
```

Reading the two relationship lists: `RELIES ON` is every edge that starts at the target, `USED BY` every edge that ends at it. For `imports`, `calls`, `reads_from` and `writes_to` those headings are literally true. A `tested_by` line under `RELIES ON` names the test that covers the target, and a `documents` or `configures` line under `USED BY` names the document or config file that refers to it.

A function with an empty `USED BY` list is not necessarily unused. Import edges are recorded between files, so run the dossier for the file node as well before saying anything about callers.

### 4. Make sure the lines are still the lines

```bash
SHA=$(jq -r '.project.gitCommitHash' "$G"); FILE=src/services/scheduler.ts
git rev-parse --verify --quiet "$SHA^{commit}" >/dev/null && git diff --stat "$SHA" -- "$FILE"
git status --porcelain -- "$FILE"
```

No output means the file is as analysed, and `lineRange` can be trusted. If the file changed, find the symbol again with `grep -n "function bookSlot" "$FILE"` and treat the summary as a description of an older version. If the hash does not resolve, say that freshness could not be checked and rely on the source.

### 5. Read the code, numbered

```bash
nl -ba src/services/scheduler.ts | sed -n '23,31p'
```

Line numbers in the output are what the explanation cites. Read in this order, and stop when the reader's question is answered:

1. The target itself, completely. For a file over about 400 lines, read the exported symbols first, using the `MEMBERS` ranges, then the helpers they call.
2. The signature and the first lines of each `RELIES ON` callee, enough to know what it returns and what it can throw.
3. One real call site from `USED BY`, to see which arguments arrive in practice and how errors are handled by the caller.
4. The linked test, if any. Tests state the intended behaviour more plainly than comments do.

While reading, note three things the graph cannot know: what the code assumes without checking, what it changes outside itself (database, files, network, shared state), and what happens on the failure paths.

### 6. Write the explanation

For a function, class or single file, use these labelled blocks in this order (Example 1 shows one filled in):

| Label | Content |
|---|---|
| first line | the name, then one sentence saying what it is for in the project's own terms |
| `Where it sits` | layer, path with line range, and the entry point or caller it is reached from |
| `What it does` | numbered steps, each ending with the line or lines it describes |
| `Contract` | inputs and what they must satisfy, the return value, the errors it can raise |
| `Side effects` | writes, messages sent, state changed; or "none" |
| `Leans on` | each callee with what the target gets from it |
| `Leaned on by` | each caller with what it expects back |
| `Watch out` | unchecked assumptions, races and edge cases, with line numbers |
| `Tests` | the test file and the behaviour it pins, or "no test is linked to this file" |
| `Basis` | the graph's short hash and date, and the files and line ranges read in source |

For a folder, replace the walkthrough with a table of its files (path, role in one line, complexity), followed by how data moves between them, the folder's entry points from outside (the `USED BY` lines whose source is outside the folder), and the single file to read first.

Order matters: purpose before mechanics, mechanics before caveats. Keep quoted code to the lines being discussed. Name things as the code names them, and define a project term the first time it appears.

### 7. Check the result before sending

- Every sentence about behaviour points at a line that was read in step 5. Anything taken only from a summary is marked "according to the analysis".
- The summary and the code agree. Where they do not, the code wins, and the mismatch is reported: it usually means the graph is stale or the summary overstated.
- Each caller and callee named in the text exists in the source today (`grep -n "bookSlot" -r src tests`).
- The explanation answers what the user asked, not only what the template lists. "Why does this exist?" needs history or a design reason; if neither the code nor the documents give one, say that it is not recorded.

## Examples

### Example 1: `/understand-explain src/services/scheduler.ts:bookSlot`

Project `clinic-booking`, a Fastify booking API. Step 2 returns `function:src/services/scheduler.ts:bookSlot	complex	23-31`. The dossier:

```text
TARGET   function:src/services/scheduler.ts:bookSlot  [complex]  src/services/scheduler.ts 23-31
SUMMARY  Re-checks availability, inserts the appointment and queues its reminder.
TAGS     booking, write-path
LAYER    Booking Rules: Scheduling logic and reminders; the only place where availability is decided.
TOUR     step 3: Booking an appointment
MEMBERS
RELIES ON
  calls  function:src/db/appointments-repo.ts:insertAppointment  -- Inserts an appointment row and returns it.
  calls  function:src/services/reminders.ts:queueReminder  -- Schedules a reminder message ahead of the appointment start.
  calls  function:src/services/scheduler.ts:findFreeSlots  -- Walks the day in slot-sized steps and keeps the ones no booked appointment overlaps.
USED BY
  calls  file:src/routes/appointments.ts  -- POST /appointments books a slot (409 when taken); DELETE /appointments/:id cancels.
```

Step 4 prints nothing. After reading lines 23-31, the three callees and the route, the reply is:

```text
bookSlot: turns "this patient wants this start time with this practitioner" into a stored appointment, or refuses.

Where it sits   Booking Rules layer; src/services/scheduler.ts:23-31; reached from POST /appointments (src/routes/appointments.ts:13)
What it does    1. Cuts the calendar day out of the start time as a UTC date string (line 24)
                2. Recomputes that day's free slots for the practitioner (line 25)
                3. Looks for a free slot starting at exactly the requested millisecond (line 26)
                4. Throws SlotTakenError when there is none (line 27)
                5. Inserts the appointment using the slot's own start and end, never the caller's (line 28)
                6. Queues the reminder and returns the stored row (lines 29-30)
Contract        takes a practitioner id, a patient e-mail and a Date; returns the Appointment with its database id;
                fails with SlotTakenError, or whatever the database driver throws
Side effects    one row in appointments; one entry in the in-memory reminder queue
Leans on        findFreeSlots: the list of open intervals; insertAppointment: the write; queueReminder: the reminder time
Leaned on by    the POST /appointments handler, which maps SlotTakenError to HTTP 409 (line 16) and rethrows the rest
Watch out       lines 25-28 check and then insert with no transaction and no unique constraint in schema.sql, so two
                simultaneous requests for one slot can both succeed; a start time that is not on a 30-minute boundary
                is reported as "taken"; the reminder queue lives in process memory and is lost on restart
Tests           tests/scheduler.test.ts covers findFreeSlots only; nothing exercises bookSlot
Basis           graph 7c41e0d of 2026-09-28; read scheduler.ts 1-35, appointments.ts 10-19, reminders.ts 7-15, schema.sql in source
```

The graph called the function "complex" and summarised it as a re-check plus insert. The race between the check and the insert appears nowhere in the graph; it came from reading lines 25-28 next to the table definition.

### Example 2: A database table as the target

Request: "explain the appointments table and who touches it". Step 2 with `T=appointments` returns `table:src/db/schema.sql:appointments	moderate	6-13`. Its dossier has an empty `RELIES ON` and:

```text
USED BY
  reads_from  function:src/db/appointments-repo.ts:findByDay  -- Booked appointments of one practitioner on one day.
  writes_to  function:src/db/appointments-repo.ts:insertAppointment  -- Inserts an appointment row and returns it.
  writes_to  function:src/db/appointments-repo.ts:markCancelled  -- Sets status to cancelled for a booked appointment.
```

The explanation lists the six columns from `schema.sql:6-13`, states that all access goes through one repository file (confirmed with `grep -rn "appointments" src`, which finds no other SQL), describes the life of a row (inserted as `booked`, flipped to `cancelled`, never deleted), and flags that `status` is free text with no check constraint while the TypeScript type allows only two values.

### Example 3: The target is not in the graph

`/understand-explain src/services/waitlist.ts` returns no line. The file exists and was created two days after the graph's `analyzedAt`. The agent explains it from source, finds its importer with `grep -rn "waitlist" src`, labels the answer "explained from source only; this file is newer than the knowledge graph", and offers an incremental `/understand` so that the next question about it has context.

## Guidelines

- The graph is the map and the source is the territory. Summaries, tags, `complexity`, layer assignments and most `calls` edges were written by a model at analysis time; only what is read in step 5 is evidence.
- Do not paste the dossier as the answer. It is working material, and its summaries repeat what the analysis guessed.
- Small private helpers have no node: the analysis keeps exported or substantial symbols. Explain a helper as part of the function that calls it.
- A missing edge does not prove independence. Dynamic dispatch, dependency injection, framework conventions (routes registered by file name, decorators), reflection and SQL in strings leave no trace in the graph.
- Summaries are stored in the language chosen at analysis (`outputLanguage` in the data folder's `config.json`). Match descriptions against that language, and answer in the language the user writes in.
- Keep to one target per explanation. A request for "the whole backend" is an onboarding guide or an architecture overview, not a deep dive; propose a layer or a folder to start with.
- Never read `.env` files, key stores or other secrets to explain configuration. Describe which variables the code reads and where they are consumed.
- Skip the graph for a twenty-line script or a file the user has open and only wants a single line clarified. Reading it directly is faster and just as accurate.
