---
name: understand-chat
description: >-
  Answers questions about a codebase from the knowledge graph built by the
  open-source Understand-Anything plugin, and covers installing the plugin and
  producing that graph. Use when someone asks "how does checkout work in this
  repo", "what calls this function", "where is rate limiting handled", "what
  depends on this module", "run /understand-chat", "set up Understand-Anything",
  or wants an architecture question answered with file paths and line numbers
  instead of guesses.
license: Apache-2.0
compatibility: "Understand-Anything 2.9+ on Claude Code, Codex, Cursor, Gemini CLI or another supported host; Node.js 22+ and pnpm 10+ plus Python 3 to build a graph; jq 1.6+ and git for the queries"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["knowledge-graph", "codebase-analysis", "code-search", "architecture", "understand-anything"]
  repository: https://github.com/Egonex-AI/Understand-Anything
---

# /understand-chat: Codebase Questions with Understand-Anything

## Overview

Understand-Anything is an MIT-licensed plugin for coding agents (2.9.7 on its main branch when this was written). Its `/understand` command parses a project with tree-sitter, has the host model describe every file, and saves one JSON file, the knowledge graph. The other commands read that file: `/understand-chat` answers a free-form question, `/understand-dashboard` draws the graph, `/understand-diff`, `/understand-explain` and `/understand-onboard` cover change impact, deep dives and newcomer guides.

This skill is the question-answering job done carefully: locate or build the graph, query it as data, follow the relationships, then confirm in the source before saying anything specific. It also holds the installation steps for the whole command family.

The graph lives at `.ua/knowledge-graph.json`. Projects analysed before the directory was renamed keep `.understand-anything/`, and when that older directory exists every tool uses it. What the file holds:

| Key | Contents |
|---|---|
| `project` | `gitCommitHash` and `analyzedAt` (the commit and time of analysis), `name`, `description`, `languages`, `frameworks` |
| `nodes` | one entry per file, function, class, config, document, table, endpoint and so on: `id`, `type`, `name`, `summary`, `tags`, `complexity` (`simple`, `moderate` or `complex`), usually `filePath`, for functions and classes `lineRange` |
| `edges` | `source` and `target` node ids, a `type` such as `imports`, `calls`, `contains`, `tested_by`, `configures`, `documents`, and a `weight` between 0 and 1 |
| `layers` | named architectural groups, each listing its members in `nodeIds` |
| `tour` | ordered walkthrough steps (`order`, `title`, `description`, `nodeIds`) |

Node ids start with the type: `file:src/server.ts`, `function:src/lib/money.ts:toCents`, `class:src/services/label-service.ts:LabelService`, `config:package.json`.

## Instructions

### 1. Install the plugin (once per machine)

Claude Code, from inside a session:

```text
/plugin marketplace add Egonex-AI/Understand-Anything
/plugin install understand-anything
```

Other hosts use the installer script in the repository. Clone it, read it, then run it with the host's id:

```bash
git clone https://github.com/Egonex-AI/Understand-Anything.git ~/.understand-anything/repo
less ~/.understand-anything/repo/install.sh
~/.understand-anything/repo/install.sh codex
```

Accepted ids: `gemini`, `codex`, `opencode`, `pi`, `openclaw`, `antigravity`, `vibe`, `vscode`, `hermes`, `cline`, `kimi`, `trae`, `nanobot`, `kiro`. The script symlinks the plugin's skills into that host's skills folder and links the plugin itself at `~/.understand-anything-plugin`; restart the host afterwards. `install.sh --update` pulls a newer version, `install.sh --uninstall codex` removes the links. Cursor and VS Code with Copilot pick the plugin up from an opened clone, and Copilot CLI takes `copilot plugin install Egonex-AI/Understand-Anything:understand-anything-plugin`.

The project README also shows a one-liner that streams the installer from the network straight into a shell. Do not use it: the clone above gives the same result with a script that can be inspected first.

Codex calls skills with a dollar sign (`$understand-chat`), most other hosts with a slash. In Claude Code the fully qualified form is `/understand-anything:understand-chat`.

### 2. Find the graph, or build it

```bash
G=.ua/knowledge-graph.json
[ -d .understand-anything ] && G=.understand-anything/knowledge-graph.json
jq '{project: (.project | {name, gitCommitHash, analyzedAt}), nodes: (.nodes | length),
     edges: (.edges | length), layers: [.layers[].name], tourSteps: (.tour | length)}' "$G"
```

Run this from the repository root. Inside a git worktree, look in the main checkout as well, because `/understand` writes there on purpose. The data directory is meant to be committed, so a fresh clone may already contain a graph.

No file means the project has not been analysed. Tell the user what the analysis costs before starting it: the first `/understand` reads the whole codebase with the host's model, can use a large number of tokens, and above 100 files stops to suggest a narrower scope. Later runs re-analyse only files whose structure changed.

| Invocation | Effect |
|---|---|
| `/understand` | full analysis the first time, incremental afterwards |
| `/understand services/billing` | analyse one subdirectory of a large monorepo; the graph is then written inside that subdirectory |
| `/understand --exclude "fixtures/*,docs/*"` | skip paths, on top of the `.understandignore` file in the data directory |
| `/understand --language ja` | write summaries and tour text in another language |
| `/understand --full` | rebuild from scratch |
| `/understand --auto-update` | refresh the graph after commits the agent makes in Claude Code |

Building needs Node.js 22+, pnpm 10+ and Python 3 (called as `python`) on the machine; the plugin compiles its core package on first use.

### 3. Check that the graph still matches the code

```bash
SHA=$(jq -r '.project.gitCommitHash // empty' "$G")
git cat-file -e "${SHA}^{commit}" 2>/dev/null &&
  git diff --name-only "$SHA" HEAD -- . ':(exclude).ua' ':(exclude).understand-anything'
git status --porcelain -- . ':(exclude).ua' ':(exclude).understand-anything'
```

Empty output from both commands means the graph describes the working tree. If files are listed, compare them with the area the question is about. Unrelated drift needs one sentence in the answer. Drift in the files you are about to cite means reading those files directly and offering an incremental `/understand`. A hash that git cannot resolve (shallow clone, rewritten history) gets a plain "freshness unknown" note, not a refusal.

### 4. Turn the question into a query

| Question | First query |
|---|---|
| "How does X work?" | score nodes for X and its synonyms, then walk `calls` and `imports` outward from the best hits |
| "What uses X?", "what breaks if X changes?" | edges whose `target` is X or the file containing X |
| "Where is X?" | match on `name` and `filePath` only |
| "How does a request get from A to B?" | shortest directed path between the two ids |
| "Give me the big picture" | `layers` with their descriptions, then `tour` in `order` |
| "What is risky or untested?" | nodes with `complexity` `complex`; files that appear in no `tested_by` edge |

Pick three to six search terms from the question, including the words the codebase is likely to use ("billing" for "payments", "guard" for "permissions"), and rank the hits. A name match outweighs a tag match, which outweighs a word in a summary:

```bash
jq -r --arg q 'quote|pric|carrier' '
  [ .nodes[]
    | { id, complexity,
        score: ( (if (.name | test($q; "i")) then 3 else 0 end)
               + (if (.tags | join(" ") | test($q; "i")) then 2 else 0 end)
               + (if (.summary | test($q; "i")) then 1 else 0 end) ) }
    | select(.score > 0) ]
  | sort_by(-.score) | .[:8][] | "\(.score)  \(.id)  [\(.complexity)]"' "$G"
```

Nothing found: list the vocabulary the graph does have with `jq -r '[.nodes[].tags[]] | unique | join(", ")' "$G"`, retry with the nearest terms, and if it is still empty say the graph has no node for the topic and fall back to searching the source.

### 5. Follow the relationships

```bash
ID='function:src/services/rate-engine.ts:quoteParcel'
jq -r --arg id "$ID" '
  .edges[] | select(.source == $id or .target == $id)
  | if .source == $id then "\(.type) -> \(.target)" else "\(.type) <- \(.source)" end' "$G"
```

Read every edge as "source does this to target". `imports`, `calls`, `depends_on`, `inherits` and `implements` point from the dependent to the thing it relies on, so the arrows coming into a node are the code that would notice a change. `contains` and `exports` point from a file to its own members and are not dependencies. `tested_by` runs from production code to its test. `configures`, `documents`, `deploys`, `migrates` and `defines_schema` start at the non-code file.

Function nodes rarely carry `imports` edges; those sit on the file node. Query both the symbol and its file before concluding that nothing uses it.

For a route between two nodes, save this as `ua-path.mjs` and run `node ua-path.mjs "$G" file:src/server.ts table:src/db/schema.sql:zones`:

```javascript
import { readFileSync } from "node:fs";
const [file, from, to] = process.argv.slice(2);
const { edges } = JSON.parse(readFileSync(file, "utf8"));
const next = new Map();
for (const e of edges) {
  if (e.type === "contains" || e.type === "exports") continue;
  if (!next.has(e.source)) next.set(e.source, []);
  next.get(e.source).push(e);
}
const seen = new Map([[from, null]]);
const queue = [from];
while (queue.length && !seen.has(to)) {
  const id = queue.shift();
  for (const e of next.get(id) ?? []) {
    if (!seen.has(e.target)) { seen.set(e.target, e); queue.push(e.target); }
  }
}
if (!seen.has(to)) { console.log("no directed path"); process.exit(1); }
const hops = [];
for (let e = seen.get(to); e; e = seen.get(e.source)) hops.unshift(`${e.source} --${e.type}--> ${e.target}`);
console.log(hops.join("\n"));
```

### 6. Confirm in the source

The graph is an index, not evidence. Import edges come from the parser. Summaries, tags, layers and most `calls` edges were written by a model. Before the answer names a behaviour, open the code:

```bash
jq -r --arg id "$ID" '.nodes[] | select(.id == $id) | "\(.filePath) \(.lineRange // [] | join("-"))"' "$G"
sed -n '12,18p' src/services/rate-engine.ts
```

For "what uses X" questions, also search the source for the symbol (`grep -rn "toCents" src tests`). The graph only creates nodes for exported or substantial functions, so small private helpers and some callers are missing from it.

### 7. Write the answer

1. The answer in two to four sentences.
2. The trail: each step as `path:lines`, one line on what happens there.
3. Layer names, when they help the reader place the code.
4. Limits: graph commit and date, any drift from step 3, anything that came from a summary and was not checked in code.
5. One or two follow-up questions the graph can answer next.

## Examples

### Example 1: "How is a shipping quote priced?"

Project `parcel-desk`, an Express API. The ranking query from step 4 returns `function:src/services/rate-engine.ts:quoteParcel` with score 6, then `file:src/routes/quotes.ts` with 4. The neighbour query on the function prints:

```text
contains <- file:src/services/rate-engine.ts
exports <- file:src/services/rate-engine.ts
calls -> function:src/db/zones.ts:findZone
calls -> function:src/lib/money.ts:toCents
calls -> function:src/lib/money.ts:addSurcharge
calls <- function:src/services/rate-engine.ts:cheapest
calls <- file:src/routes/quotes.ts
```

After reading lines 12-18 of the file, the reply is:

> A quote is computed in `quoteParcel` (`src/services/rate-engine.ts:12-18`, layer "Pricing and Booking"). For each of the two carriers it adds the carrier's base fee to its per-kilogram rate times the parcel weight, converts that to integer cents with `toCents`, raises it by the zone's surcharge percentage with `addSurcharge` (both in `src/lib/money.ts`), and returns the list sorted cheapest first.
>
> - `src/routes/quotes.ts`: `POST /quotes` validates the body and calls `quoteParcel`.
> - `src/db/zones.ts` `findZone`: looks the surcharge up by the first two characters of each postcode; an unknown pair means no surcharge.
> - `cheapest` in the same file takes the first element, which label booking relies on.
>
> Graph built at commit 3f9c2ab on 2026-10-01; no files changed since. Next: "what happens when a label is booked?", "which code reads the zones table?"

### Example 2: "What breaks if I change the rounding in toCents?"

Neighbours of `function:src/lib/money.ts:toCents` show one caller, `quoteParcel`. Neighbours of the file node add `imports <- file:src/services/rate-engine.ts`, `imports <- file:tests/rate-engine.test.ts` and `tested_by -> file:tests/rate-engine.test.ts`. A source search finds a second call the graph has no edge for: the test asserts `toCents(4.205)` equals 421.

> One production caller: `quoteParcel` (`src/services/rate-engine.ts:15`), so every quote and every booked label price moves with the rounding. `tests/rate-engine.test.ts:4` pins the current behaviour and will fail if half-cents stop rounding up. Nothing else imports `src/lib/money.ts`. The test call came from searching the source; the graph links the test to the file but not to the function.

### Example 3: No graph in the repository

`jq` reports that `.ua/knowledge-graph.json` does not exist and there is no `.understand-anything/` directory. The agent does not start an analysis on its own. It reports that the project has 1,240 tracked files, that a first `/understand` will read all of them with the session's model, and offers three options: analyse only `services/billing`, where the question points; analyse everything; or answer this one question by reading the source directly.

## Guidelines

- Query the JSON with `jq` or a script. Text search over a pretty-printed graph returns lines without the object they belong to, and reading a multi-megabyte graph whole wastes context for no gain.
- Never present a summary as verified behaviour. Quote code you opened; label the rest as taken from the graph.
- A missing edge is not proof of absence. Dynamic dispatch, dependency injection, reflection, string-keyed routes and calls from files excluded by `.understandignore` leave no edge.
- `complexity` is the analysing model's three-level judgement, not a measured metric. Treat it as a hint about where to read carefully.
- Stay within one or two hops from the hits. A wider walk on a large graph pulls in most of the project and blurs the answer.
- Summaries and tags are in the language chosen at analysis time (`outputLanguage` in the data directory's `config.json`). Search in that language.
- `/understand --auto-update` works through Claude Code hooks: it reacts to commits made by the agent in a session and to session start. Commits made elsewhere leave the graph behind until the next run.
- The graph stores relative paths and summaries of the code. Check that the repository's owners are comfortable with that before committing it to a public project.
- For questions about business processes use the plugin's `/understand-domain`, and for a Markdown wiki `/understand-knowledge`; they write their own graphs. For a one-line lookup in a small repository, searching the source directly is faster than any graph.
