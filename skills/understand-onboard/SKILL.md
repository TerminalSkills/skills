---
name: understand-onboard
description: >-
  Writes an onboarding guide for someone joining a codebase, built from the
  knowledge graph of the Understand-Anything plugin and checked against the
  repository: how to run the project, a map of its layers, a reading route,
  the files everything depends on and the risky ones. Use when someone says
  "write an onboarding guide for this repo", "a new developer starts Monday",
  "run /understand-onboard", "help me get up to speed on this project",
  "document the architecture for new hires", or wants docs/UA_ONBOARDING.md
  created or refreshed.
license: Apache-2.0
compatibility: "A repository analysed with Understand-Anything 2.9+ (a knowledge-graph.json in .ua/ or .understand-anything/); Node.js 18+, jq 1.6+ and git on the machine"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["onboarding", "developer-documentation", "knowledge-graph", "architecture", "understand-anything"]
  repository: https://github.com/Egonex-AI/Understand-Anything
---

# /understand-onboard: Onboarding Guide from an Understand-Anything Graph

## Overview

Understand-Anything is an open-source plugin for coding agents. Its `/understand` command analyses a repository and saves a knowledge graph as JSON: every file with a summary, the relationships between them, a grouping into architectural layers and an ordered tour. `/understand-onboard` turns that graph into a document a newcomer can follow.

A graph dump is not an onboarding guide. A person who starts on Monday needs to get the project running, know which five files matter, read them in a sensible order and learn where not to make a first change. This skill generates the factual skeleton from the graph with a script, then adds what the graph does not contain (setup commands, first tasks, team conventions) from the repository itself, and verifies every path and command before the file is saved.

Graph content the guide is built from:

| In the graph | Becomes in the guide |
|---|---|
| `project`: `name`, `description`, `languages`, `frameworks`, `gitCommitHash`, `analyzedAt` | the opening paragraph and the provenance line |
| `layers[]`: `name`, `description`, `nodeIds` | the map, one table per layer |
| `tour[]`: `order`, `title`, `description`, `nodeIds`, `languageLesson` | the reading route |
| `nodes[]`: `type`, `filePath`, `summary`, `complexity`, `tags` | table rows, the risk list, the vocabulary |
| `edges[]`: `imports`, `calls`, `tested_by` and others | entry points, the most depended-on files, missing tests |

If the project has no graph, install the plugin (Claude Code: `/plugin marketplace add Egonex-AI/Understand-Anything`, then `/plugin install understand-anything`) and run `/understand`; the `understand-chat` skill covers other hosts and the analysis options.

## Instructions

### 1. Find out who the guide is for

Ask at most three questions, and skip any the request already answers:

1. Who is joining: role and familiarity with the stack (backend developer who knows TypeScript, data analyst new to the language, contractor for one feature).
2. What they will work on first, if known. The guide then leads with that area.
3. Where the guide should live. The plugin's own command proposes `docs/UA_ONBOARDING.md`; use that unless the team has a docs convention.

Look for what already exists before writing anything: `ls README* CONTRIBUTING* docs/ 2>/dev/null`. An existing setup section is linked, not copied, and an existing onboarding file is updated in place.

### 2. Check the graph and its age

```bash
G=.ua/knowledge-graph.json
[ -d .understand-anything ] && G=.understand-anything/knowledge-graph.json
jq -r '"\(.project.name): \(.nodes | length) nodes, \(.layers | length) layers, \(.tour | length) tour steps, kind \(.kind // "codebase")"' "$G"
SHA=$(jq -r '.project.gitCommitHash' "$G")
git rev-parse --verify --quiet "$SHA^{commit}" >/dev/null &&
  git diff --name-only "$SHA" HEAD -- . ':(exclude).ua' ':(exclude).understand-anything' | wc -l
```

| Finding | Decision |
|---|---|
| no graph file | stop; the project needs `/understand` first (in a git worktree, look in the main checkout) |
| `kind` is `knowledge` or `design` | wrong input: this guide needs a codebase graph |
| zero layers or zero tour steps | the analysis did not finish; ask for `/understand --full` |
| 0 changed files | proceed |
| a few changed files, none in the map's key files | proceed and put the count in the provenance line |
| many changed files, or new top-level folders | ask for an incremental `/understand` first; a guide that sends a newcomer to deleted files costs more than it saves |
| the hash does not resolve | proceed, and rely on step 5 to catch dead paths |

### 3. Generate the skeleton

Save as `ua-onboard.mjs` in a scratch folder. The second argument limits the rows per layer (default 10), keeping the most depended-on files.

```javascript
import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync(process.argv[2], "utf8"));
const perLayer = Number(process.argv[3] ?? 10);
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const path = (id) => byId.get(id)?.filePath;
const TOP = new Set(["file", "config", "document", "service", "pipeline", "table", "schema", "resource", "endpoint"]);
const row = (...cells) => `| ${cells.map((c) => String(c).replace(/\|/g, "\\|").replace(/\s+/g, " ")).join(" | ")} |`;

// Usage counted per file, so that function-level edges roll up to the file they live in.
const USES = new Set(["imports", "calls", "depends_on", "inherits", "implements", "reads_from", "writes_to"]);
const usedBy = new Map(), usesOthers = new Set();
for (const e of g.edges) {
  const from = path(e.source), to = path(e.target);
  if (!USES.has(e.type) || !from || !to || from === to) continue;
  usedBy.set(to, (usedBy.get(to) ?? new Set()).add(from));
  usesOthers.add(from);
}
const fanIn = (f) => usedBy.get(f)?.size ?? 0;
const testEdges = g.edges.filter((e) => e.type === "tested_by");
const tests = new Set(testEdges.map((e) => path(e.target)));
const covered = new Set(testEdges.map((e) => path(e.source)));
const p = g.project, out = [];
out.push(`# Getting started with ${p.name}`, "", p.description, "", `Stack: ${[...p.languages, ...p.frameworks].join(", ")}.`,
  "", "## Run it on day one", "", "(to be filled in step 4)", "", "## The map", "");
for (const l of g.layers) {
  const members = l.nodeIds.map((id) => byId.get(id)).filter((n) => n && TOP.has(n.type))
    .sort((a, b) => fanIn(b.filePath) - fanIn(a.filePath));
  out.push(`### ${l.name}`, "", l.description, "", row("Path", "What it does", "Complexity"), row("---", "---", "---"));
  for (const n of members.slice(0, perLayer))
    out.push(row(`\`${n.filePath ?? n.name}\`${n.lineRange ? ` (${n.name})` : ""}`, n.summary, n.complexity));
  if (members.length > perLayer) out.push("", `Plus ${members.length - perLayer} less connected files.`);
  out.push("");
}
out.push("## Reading route", "");
for (const s of [...g.tour].sort((a, b) => a.order - b.order)) {
  const files = [...new Set(s.nodeIds.map(path).filter(Boolean))].map((f) => `\`${f}\``).join(", ");
  out.push(`${s.order}. **${s.title}**. ${s.description} Open: ${files}.${s.languageLesson ? ` Language note: ${s.languageLesson}` : ""}`);
}
out.push("", "## Where execution starts", "");
for (const n of g.nodes.filter((n) => n.type === "file" && !tests.has(n.filePath) && usesOthers.has(n.filePath) && !fanIn(n.filePath)))
  out.push(`- \`${n.filePath}\`: ${n.summary}`);
out.push("", "## Files the rest leans on", "", row("Path", "Used by", "Linked test"), row("---", "---", "---"));
for (const [f, users] of [...usedBy].sort((a, b) => b[1].size - a[1].size).slice(0, 8))
  out.push(row(`\`${f}\``, `${users.size} file(s)`, covered.has(f) ? "yes" : "none"));
out.push("", "## Handle with care", "");
for (const n of g.nodes.filter((n) => n.complexity === "complex"))
  out.push(`- \`${n.filePath}\`${n.lineRange ? ` lines ${n.lineRange.join("-")}` : ""} (${n.type} ${n.name}): ${n.summary}${covered.has(n.filePath) ? "" : " No test is linked to this file."}`);
const tags = new Map();
for (const n of g.nodes) for (const t of n.tags) if (t !== "tested") tags.set(t, (tags.get(t) ?? 0) + 1);
out.push("", "## Vocabulary", "", [...tags].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `${t} (${c})`).join(", "),
  "", "---", `Generated from the knowledge graph of commit ${p.gitCommitHash.slice(0, 7)}, analysed ${p.analyzedAt.slice(0, 10)}.`);
console.log(out.join("\n"));
```

```bash
mkdir -p docs && node ua-onboard.mjs "$G" 10 > docs/UA_ONBOARDING.md
```

What each generated section means, and how far to trust it:

| Section | Derived from | Caveat |
|---|---|---|
| The map | layers, file-level nodes ordered by how many files use them | layer names and assignments are the analysing model's reading of the project |
| Reading route | the tour, in `order` | written for a general reader; reorder for the newcomer's first task |
| Where execution starts | code files that use others and are used by none | also lists dead code and scripts; confirm each against the manifest's start command |
| Files the rest leans on | incoming `imports`, `calls` and similar edges, counted per file | a change here is felt widely; a good place to read, a bad place for a first pull request |
| Handle with care | nodes whose `complexity` is `complex`, plus the absence of a `tested_by` edge | `complexity` is a three-level label, not a measurement |
| Vocabulary | most frequent `tags` | a word list only; the definitions are written in step 4 |

### 4. Add what the graph does not know

Fill these from the repository, reading the files and not guessing:

- **Run it on day one.** Take the commands from the manifest and the CI workflow, which is the one place where the setup is proven to work: `jq -r '.scripts | to_entries[] | "\(.key)\t\(.value)"' package.json`, or the targets of a Makefile, `pyproject.toml`, `Cargo.toml`. Give them in the order install, configure, migrate, start, test, each with what success looks like (a port, a passing count). Name the environment variables the code reads and where a newcomer gets their values. Never copy values out of `.env` files.
- **First week.** Three to five concrete steps, tied to the route: run the tests; follow one request from the entry point to the database with a debugger or log lines; make a small change in a `simple`, tested file.
- **First tasks.** Two or three starter changes. Good candidates are files with a linked test, low fan-in and `simple` complexity. Bad candidates are everything under "Handle with care".
- **Vocabulary.** Turn the tag list into six to ten definitions in the team's words, each naming the file where the concept lives.
- **People and process**, only if the user provides them: who reviews what, branch and release rules, where questions go. Leave the section out when there is nothing to put in it.

Then edit the generated parts for the reader from step 1: move the layer they will work in to the top, cut rows a newcomer will not open in the first month, and rewrite summaries that read like file listings.

### 5. Verify before saving

```bash
D=docs/UA_ONBOARDING.md
grep -o '`[^` ]*[/.][^` ]*`' "$D" | tr -d '`' | sort -u | while read -r f; do [ -e "$f" ] || echo "missing: $f"; done
wc -l "$D"
```

- Every reported path is either a typo, a file removed since the analysis, or a code identifier containing a dot. Fix or remove the first two.
- Every command in "Run it on day one" exists in the manifest. Run the read-only ones (the test suite, a build) if the user agrees; do not run migrations or anything that writes to a shared service.
- Each "Where execution starts" entry matches a start command, a registered route, a job or a CLI definition. Delete the rest.
- The guide fits in one sitting: 120 to 250 lines for a typical service. Longer means the map tables need a lower row limit.
- No secrets, internal hostnames or personal data appear in the text.

### 6. Hand it over

Report the file path, its length, which sections came from the graph and which from the repository, anything that could not be verified, and the graph commit it is based on. Suggest committing the guide, and name the refresh rule: regenerate after an `/understand` run that follows a structural change (new layer, moved folders, a replaced framework), and rerun the path check from step 5 in between. Mention `/understand-dashboard` as the companion for the first day: its Start Tour button walks the same route visually.

## Examples

### Example 1: A backend developer joins `clinic-booking`

Request: "Tomás starts Monday on the booking API, he knows TypeScript but not Fastify. Write him an onboarding guide." Step 2 prints `clinic-booking: 25 nodes, 4 layers, 4 tour steps, kind codebase` and 0 changed files. The script produces 90 lines, among them:

```markdown
## Where execution starts

- `src/server.ts`: Creates the Fastify app, registers the slot and appointment routes and listens on the configured port.

## Files the rest leans on

| Path | Used by | Linked test |
| --- | --- | --- |
| `src/config.ts` | 4 file(s) | none |
| `src/services/scheduler.ts` | 3 file(s) | yes |
| `src/lib/time.ts` | 2 file(s) | none |
| `src/db/appointments-repo.ts` | 2 file(s) | none |

## Handle with care

- `src/services/scheduler.ts` (file scheduler.ts): Core booking rules: computes free slots, books one with a conflict check, cancels a booking.
- `src/services/scheduler.ts` lines 23-31 (function bookSlot): Re-checks availability, inserts the appointment and queues its reminder.
```

The agent then writes the parts the graph cannot supply. `package.json` has three scripts (`dev`, `test`, `migrate`), and the CI workflow runs `npm ci` and `npm test` on Node.js 22, so the first section becomes:

```markdown
## Run it on day one

1. `npm ci` (Node.js 22, the version CI uses)
2. Set `DATABASE_URL` to a local PostgreSQL database; `src/config.ts` falls back to `postgres://localhost:5432/clinic`
3. `npm run migrate` creates the two tables from `src/db/schema.sql`
4. `npm run dev` starts the API on port 4010; `curl "http://127.0.0.1:4010/slots?practitioner=9b2f6c1e-4d7a-4e0b-8a53-1c2d3e4f5a6b&day=2026-10-05"` returns a `slots` array
5. `npm test` runs one Vitest file; it mocks the database, so it passes without PostgreSQL

## First tasks

- Add a test for `overlaps` in `src/lib/time.ts`: small, pure, used by two files and currently has no test.
- Not yet: anything in `bookSlot`. It checks availability and inserts without a transaction; ask before changing it.
```

Because Tomás is new to Fastify, the tour's language note on route generics stays in step 2 of the reading route. The path check prints nothing. The final file is 128 lines.

### Example 2: A large monorepo and a stale graph

`freightline` has 1,900 files; the graph in `services/dispatch/.ua/` covers that one service and step 2 counts 37 files changed since the analysis, including a new `src/pricing/` folder. The agent does not generate anything yet. It explains that the map would miss the pricing module, asks for an incremental `/understand services/dispatch`, and after that run generates the skeleton from inside `services/dispatch` with a row limit of 6 per layer. The result names nine layers; the agent orders them by the newcomer's assignment (routing first) and moves the four infrastructure layers to a closing "you will not need these in month one" list.

### Example 3: The reader is not a developer

A product manager wants to understand how the system is put together. The developer guide is the wrong artefact. The agent writes one page from `project.description`, the layer names with their descriptions, and the tour titles, with no file tables and no setup, and points to the dashboard's Overview mode, which hides functions and classes.

## Guidelines

- Do not publish the skeleton unedited. Its summaries were written by a model during analysis; read the ones that make it into the guide against the files they describe, at least for the entry points and the "Handle with care" list.
- "No test is linked" means the graph has no `tested_by` edge from that file. Tests that reach code indirectly, or live outside the analysed folder, are not counted. Phrase it as a prompt to check, not as a coverage figure.
- File counts in "Used by" ignore dynamic wiring: dependency injection, plugin registries, routes resolved by file name. A framework-heavy project will show its most central files as barely used.
- Summaries and tour text are in the language chosen at analysis time (`/understand --language`). Generate the guide in the same language, or have the graph rebuilt in the one the team reads.
- Keep the guide short enough to be read on the first morning, and link to deeper material (`/understand-explain` for a specific file, existing architecture documents) instead of inlining it.
- A committed guide goes stale silently. The provenance line at the bottom is there so a reader can see how old the picture is; do not delete it.
- Do not use this skill to document a public API for outside users, to write a README, or for a repository of a few files, where a paragraph in the README does the job.
