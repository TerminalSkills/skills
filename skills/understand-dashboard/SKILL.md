---
name: understand-dashboard
description: >-
  Opens the Understand-Anything dashboard for a project's knowledge graph and
  explains how to read it: layers, search, guided tour, path finder, diff
  overlay and exports. Use when someone says "open the dashboard", "show me the
  architecture of this repo", "run /understand-dashboard", "visualize the
  knowledge graph", "view the graph without Claude Code", "the dashboard asks
  for an access token", or needs the viewer on a remote machine or a busy port.
license: Apache-2.0
compatibility: "A project with a graph from Understand-Anything 2.9+; Node.js 18+ for the standalone viewer, Node.js 22+ and pnpm 10+ for the dev server; a desktop browser; curl, jq and sha256sum for the checks"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["knowledge-graph", "visualization", "dashboard", "architecture", "understand-anything"]
  repository: https://github.com/Egonex-AI/Understand-Anything
---

# /understand-dashboard: View a Codebase Knowledge Graph

## Overview

Understand-Anything is an open-source plugin whose `/understand` command analyses a repository and saves a knowledge graph (files, functions, classes, their relationships, architectural layers and a guided tour) as JSON inside the project. The dashboard is the visual reader for that file: a React application served from the developer's own machine, read-only, bound to `127.0.0.1` and protected by a random access token printed at startup.

This skill covers getting it on screen and then using it: which of the three ways to serve it fits the situation, how to hand the user a link that works, what each control answers, and how to shut it down. It does not build the graph. If the plugin is missing, install it in Claude Code with `/plugin marketplace add Egonex-AI/Understand-Anything` followed by `/plugin install understand-anything`; on other hosts clone the repository and run its `install.sh` with the host id (for example `codex`). The companion `understand-chat` skill has the complete installation and analysis notes.

Files the dashboard reads from the data directory (`.ua/`, or `.understand-anything/` when that older directory exists):

| File | Required | Effect when present |
|---|---|---|
| `knowledge-graph.json` | yes | everything on screen |
| `meta.json` | no | a colour theme saved with the analysis |
| `config.json` | no | interface language (`outputLanguage`) |
| `diff-overlay.json` | no | change-impact highlighting, written by `/understand-diff` |
| `domain-graph.json` | no | a Domain / Structural switch, written by `/understand-domain` |

## Instructions

### 1. Establish the project and the graph

Take the project directory from the request, or use the current one, and confirm there is something to show:

```bash
PROJECT=$(cd "${1:-.}" && pwd -P)
DATA="$PROJECT/.ua"; [ -d "$PROJECT/.understand-anything" ] && DATA="$PROJECT/.understand-anything"
jq -r '"\(.project.name): \(.nodes | length) nodes, \(.edges | length) edges, \(.layers | length) layers, \(.tour | length) tour steps"' \
  "$DATA/knowledge-graph.json"
```

If the file is missing, stop and say the project needs `/understand` first (inside a git worktree the graph is written to the main checkout, so look there). Keep the printed counts: they are the reference for step 7.

### 2. Choose how to serve it

| Situation | Route |
|---|---|
| The host has the plugin and the user typed the command | let `/understand-dashboard` run; it accepts an optional project path |
| No agent plugin, a teammate, CI artefact review, or the plugin command failed | standalone viewer from the release tarball (step 3) |
| Working on the dashboard itself, or the newest unreleased interface is wanted | dev server from the plugin checkout (step 4) |

What the plugin command does: it first tries to run the viewer tarball attached to the GitHub release that matches the installed plugin version, and when that download fails it installs dependencies with pnpm, builds the core package and starts a Vite dev server. On 2026-10-01 the main branch was at 2.9.7 while the newest release carrying a viewer asset was v2.9.0, so the version-matched download returned 404 and the command went down the slower pnpm path. If that path fails for lack of pnpm or Node.js 22, use step 3.

### 3. Standalone viewer

Download the tarball, compare its SHA-256 with the digest GitHub publishes for the asset, unpack it and run it with Node.js. Nothing is installed and no build runs:

```bash
TAG=v2.9.0
REPO=Egonex-AI/Understand-Anything
mkdir -p ~/.cache/ua-viewer && cd ~/.cache/ua-viewer
curl -fsSLO "https://github.com/$REPO/releases/download/$TAG/understand-anything-viewer.tgz"
curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$TAG" |
  jq -r '.assets[] | select(.name == "understand-anything-viewer.tgz") | .digest'
sha256sum understand-anything-viewer.tgz
tar -xzf understand-anything-viewer.tgz
```

The two hashes must be identical before `tar` runs (for v2.9.0 the digest is `sha256:a8626ff3ad90041e807bfdb8994eefdd986e891593c4759d08222667e5405330`). On macOS use `shasum -a 256`. Then start it in the background and keep its output and process id:

```bash
RUN=${TMPDIR:-/tmp}/ua-viewer; mkdir -p "$RUN"
node ~/.cache/ua-viewer/package/bin/viewer.mjs "$PROJECT" --no-open > "$RUN/log" 2>&1 &
echo $! > "$RUN/pid"
```

Options: `--port 5180` picks a port (default 5173; without the flag the viewer moves to the next free port, with the flag a busy port is an error; `--port 0` lets the system choose), `--no-open` stops it launching a browser. Leave `--no-open` out on a desktop where the user wants the tab opened for them.

### 4. Dev server from the plugin checkout

The plugin directory is `~/.understand-anything-plugin` after `install.sh`, or the version folder under `~/.claude/plugins/cache/understand-anything/understand-anything/` in Claude Code.

```bash
cd ~/.understand-anything-plugin
pnpm install --frozen-lockfile
pnpm --filter @understand-anything/core build
BROWSER=none GRAPH_DIR="$PROJECT" pnpm --filter @understand-anything/dashboard dev
```

`GRAPH_DIR` is the project root, not the data directory. `BROWSER=none` keeps Vite from opening a tab; drop it on a desktop.

### 5. Hand over a working link

Both servers print one line to copy:

```text
  🔑  Dashboard URL: http://127.0.0.1:5173/?token=81d8908db82b61607effab1eb23862c0
```

Extract it with `grep -o 'http://127.0.0.1:[0-9]*/?token=[0-9a-f]*' "$RUN/log"` and give the user the whole URL including the token. Three details matter:

- The page stores the token in the tab's session storage and removes it from the address bar. A URL copied from the browser later has no token, and a new tab or another browser shows an "Access Token Required" form. Paste the token from the terminal there.
- A new token is generated on every start. Set `UNDERSTAND_ACCESS_TOKEN` in the environment before launching to keep one stable for bookmarks.
- The server listens on the loopback interface only. To view a graph that lives on a remote machine, forward the port (`ssh -N -L 5173:127.0.0.1:5173 devbox`) and open the same URL locally. Do not expose the port on a public interface: the dashboard can display source files.

### 6. Read the screen

| Control | Where | Use it to |
|---|---|---|
| Layer cards | first screen | see the architecture as a handful of groups with file counts; click a card to enter it, Esc or the breadcrumb to come back |
| Overview / Learn / Deep Dive | top left | Overview hides functions and classes for a non-technical reader; Learn (the default) keeps the tour panel in the sidebar; Deep Dive shows every node type, with project statistics in the idle sidebar |
| Files / +Classes, then fn | top bar | choose how much detail the structural graph draws; function nodes slow large graphs down |
| Code, Config, Docs, Infra, Data chips | top bar | hide or show whole node categories |
| Search (`/`) | below the top bar | fuzzy match over names, summaries and tags; the Fuzzy and Semantic buttons currently run the same engine |
| A node | click | Info sidebar: summary, tags, connections with relationship labels, and "Open code" for a source preview |
| Start Tour (arrow keys) | sidebar | walk the ordered steps the analysis prepared; the best first ten minutes for a newcomer |
| Path (`P`) | top right | shortest chain of relationships between two chosen nodes, ignoring edge direction |
| Filter (`F`) | top right | narrow by node type, complexity, layer or edge category |
| Diff (`D`) | top bar | highlight Changed and Affected nodes from `diff-overlay.json` and fade the rest; greyed out when no overlay exists |
| Export (`E`) | top right | PNG or SVG of the canvas, or the filtered graph as JSON |
| `?` | anywhere | the full shortcut list |

The source preview only serves files that are nodes in the graph, up to 1 MB, text only. A first-time visitor gets a five-step introduction overlay; "Don't show again" dismisses it for good. Newer builds add a banner when the graph's commit is behind the checkout; the v2.9.0 viewer does not check.

### 7. Verify, report, stop

```bash
URL=$(grep -o 'http://127.0.0.1:[0-9]*/?token=[0-9a-f]*' "$RUN/log")
curl -s "${URL%%/?token=*}/knowledge-graph.json?token=${URL##*token=}" | jq '.nodes | length'
curl -s -o /dev/null -w '%{http_code}\n' "${URL%%/?token=*}/knowledge-graph.json"
```

The first request must print the node count from step 1 and the second must print 403. Then tell the user the URL, which project and data directory it shows, the graph's analysis date, where to start (layer cards, then the tour), and how it will be stopped. When they are done:

```bash
kill "$(cat "$RUN/pid")" && rm -r "$RUN"
```

## Examples

### Example 1: Open the graph of the current project

Request: "open the dashboard for this repo". Step 1 prints `parcel-desk: 26 nodes, 48 edges, 4 layers, 4 tour steps`. No pnpm on the machine, so the agent uses the verified viewer from step 3 and reports:

```text
Dashboard: http://127.0.0.1:5173/?token=81d8908db82b61607effab1eb23862c0
Showing:   ~/work/parcel-desk/.ua/knowledge-graph.json (26 nodes, analysed 2026-10-01)
Start with the four layer cards: HTTP API, Pricing and Booking, Data Access, Project Files.
Then press "Start Tour" in the sidebar for the 4-step walkthrough.
Keep the token: a new tab without it shows an access form.
The viewer runs in the background (pid 971221); say "stop the dashboard" when finished.
```

### Example 2: Review a change on a remote build box

Marta works over SSH on `devbox` and has just run `/understand-diff` on her branch. Port 5173 there is taken by another Vite server.

```bash
node ~/.cache/ua-viewer/package/bin/viewer.mjs ~/src/ledger-api --no-open --port 5180
```

The agent gives her two things: the command for her laptop, `ssh -N -L 5180:127.0.0.1:5180 devbox`, and the printed URL on port 5180. In the browser the bar reads `Diff ON`, `Changed (6)`, `Affected (6)`; everything else is faded. She presses `D` to compare with the plain graph and `P` to trace how a changed function reaches the HTTP layer.

### Example 3: "It asks me for an access token"

The user bookmarked `http://127.0.0.1:5173/` yesterday. The viewer was restarted since, so the old token is gone and the bookmark never contained one. The agent reads the current URL from the log, sends it, and for a lasting bookmark restarts the viewer with `UNDERSTAND_ACCESS_TOKEN` set to a value from the user's password manager.

## Guidelines

- Always pass the project root, never the `.ua` folder, to the viewer and to `GRAPH_DIR`.
- When both `.understand-anything/` and `.ua/` exist, the older directory wins. A graph that looks out of date may simply be the wrong one of the two.
- Do not run the viewer tarball straight from a URL with `npx`: that executes code nobody checked. Pointing `npx` at the downloaded file fails as well (npm 11 tries to execute the archive); unpack it and use `node`.
- The overlay and the graph are read when the page loads. After a new `/understand` or `/understand-diff`, reload the tab.
- The dashboard shows what the analysis wrote. Summaries and layer assignments are model output, so treat a surprising picture as a prompt to read the code, not as a finding.
- Very large graphs are heavy at function level. Stay on Files, enter one layer at a time, and use Search to jump.
- A banner counting auto-corrected, dropped or fatal items means entries in the graph file failed validation when the page loaded. With dropped or fatal items, re-run `/understand` instead of trusting a partial picture.
- This is the wrong tool for a quick factual question ("what calls this function?"). Query the JSON directly, and keep the dashboard for orientation, walkthroughs and reviews with other people.
- Stop servers you started, by process id, and remove the run folder. Do not kill other processes that happen to hold port 5173.
