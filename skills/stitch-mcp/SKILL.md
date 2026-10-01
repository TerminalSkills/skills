---
name: stitch-mcp
description: >-
  Connects a coding agent to Google Stitch through the stitch-mcp CLI and MCP proxy, so the agent
  can read a screen's HTML and screenshot and rebuild it in the project's own framework. Use when
  a user says "implement this Stitch screen", "hook Stitch up to Claude Code / Cursor / Codex",
  "add the Stitch MCP server", "turn my Stitch project into a site", "preview my Stitch screens
  locally", or when Stitch tools fail with authentication or permission errors. Covers choosing
  API key or OAuth, proxy or direct HTTP, per-client configuration, the non-interactive flags an
  agent can run, the tool inputs and outputs, and how to diagnose a broken setup.
license: Apache-2.0
compatibility: "Node.js 18+ with npx; a Google Stitch account and either a Stitch API key or a Google Cloud project; any MCP client"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: design
  tags: [stitch, mcp, design-to-code, google, ui]
  repository: https://github.com/davideast/stitch-mcp
---

# Stitch MCP

## Overview

Google Stitch generates UI screens from prompts and stores each one as an HTML document plus a
screenshot. `stitch-mcp` (npm package `@_davideast/stitch-mcp`, an independent open-source
project) is the bridge to a codebase. It does three jobs: it registers Stitch as an MCP server in
a coding agent, it adds helper tools that hand the agent a screen's markup in a single call, and
it can preview screens or export them as an Astro project. Facts below were checked against
version 0.9.0; run any command with `--help` if a flag is rejected.

The agent's real work starts after the fetch: Stitch output is one static HTML page per screen,
and the job is to translate it into components that fit the repository it lands in.

## Instructions

### 1. Establish the starting point

Ask or look up, in this order:

- Which MCP client is in use (Claude Code, Cursor, VS Code, Codex, OpenCode, Gemini CLI,
  Antigravity) and whether a `stitch` server is already registered.
- Whether the user has a Stitch API key. Without one the setup goes through Google Cloud OAuth,
  which needs a browser and a billing-enabled project.
- The Stitch project and the screens to implement. A project ID is a long number such as
  `7302915846120394175`; a screen ID is 32 hex characters. Display names are not accepted.
- The target stack, read from the repository: framework, styling system, existing components and
  design tokens. Never assume React and Tailwind.

### 2. Choose authentication

| Mode | How it is supplied | Choose it when |
|------|--------------------|----------------|
| API key | `STITCH_API_KEY` in the environment, a `.env` file, or the MCP server's `env` block | Default. Works headless, in CI and over SSH; nothing to refresh |
| OAuth via the wizard | `init` downloads its own gcloud SDK into `~/.stitch-mcp/` and signs in | The user has no key but owns a Google Cloud project |
| OAuth via existing gcloud | `STITCH_USE_SYSTEM_GCLOUD=1` plus the three commands below | gcloud is already installed and signed in |

Existing-gcloud route, to be run by the user because it opens a browser:

```bash
gcloud auth application-default login
gcloud config set project orchard-design-prod
gcloud beta services mcp enable stitch.googleapis.com --project=orchard-design-prod
```

With no key present the CLI assumes OAuth. In a check run, `doctor` on a clean machine fetched
roughly 500 MB of gcloud SDK into `~/.stitch-mcp/` before reporting anything, so export the key
first when the key route is intended.

### 3. Choose the connection

| | Proxy over stdio | Direct HTTP |
|---|---|---|
| What the client starts | `npx @_davideast/stitch-mcp proxy` as a child process | Nothing; it calls `https://stitch.googleapis.com/mcp` |
| Tools the agent sees | Stitch's own tools plus the four helpers in step 6 | Stitch's own tools only |
| OAuth token lifetime | Renewed for you by the proxy | One hour, then replaced by hand |
| Fits | Interactive design-to-code sessions | Pipelines and sandboxes that cannot spawn processes |

Pick the proxy unless there is a concrete reason not to: without `get_screen_code` the agent must
call `get_screen`, find the download URL and fetch the markup itself.

### 4. Register the server

Claude Code, proxy with an API key taken from the shell environment:

```bash
claude mcp add stitch -e STITCH_API_KEY="$STITCH_API_KEY" -- npx @_davideast/stitch-mcp proxy
```

Claude Code, direct HTTP (`-s user` writes to `~/.claude.json`, `-s project` to `./.mcp.json`):

```bash
claude mcp add stitch --transport http https://stitch.googleapis.com/mcp \
  --header "X-Goog-Api-Key: $STITCH_API_KEY" -s user
```

Cursor (`.cursor/mcp.json`) and Antigravity share one shape. This variant uses OAuth, so the file
carries no secret and is safe to commit:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"],
      "env": { "STITCH_PROJECT_ID": "orchard-design-prod" }
    }
  }
}
```

For the API-key route the `env` block holds `STITCH_API_KEY` instead; keep that file out of
version control or use the client's own environment interpolation.

Differences in other clients:

- VS Code (`.vscode/mcp.json`): the top-level key is `servers`, and each entry needs
  `"type": "stdio"` (or `"type": "http"` with `url` and `headers`).
- Codex (`~/.codex/config.toml`): a `[mcp_servers.stitch]` table with `command = "npx"` and
  `args = ["@_davideast/stitch-mcp", "proxy"]`; variables go under `[mcp_servers.stitch.env]`.
- OpenCode (`opencode.json`): `"mcp": { "stitch": { "type": "local", "command": ["npx",
  "@_davideast/stitch-mcp", "proxy"], "environment": { } } }`.
- Antigravity, direct mode only: the field is `serverUrl`, not `url`.
- Gemini CLI: `gemini extensions install https://github.com/gemini-cli-extensions/stitch`.

`npx @_davideast/stitch-mcp init` writes the same configuration through prompts. It accepts
`-c, --client` (`claude-code`, `cursor`, `vscode`, `codex`, `opencode`, `gemini-cli`,
`antigravity`) and `-t, --transport` (`stdio` or `http`) to skip two of them, but it remains a
wizard: hand it to the user instead of running it from an agent shell.

Restart the client after any change to its MCP configuration.

### 5. Verify before relying on it

```bash
npx @_davideast/stitch-mcp doctor --verbose   # add --json for machine-readable results
npx @_davideast/stitch-mcp tool               # lists every tool the CLI can reach
```

`doctor` checks, depending on the mode: key present, key accepted by the API, gcloud at 400.0.0
or newer, user signed in, application default credentials, active project, API reachable. If the
`tool` listing includes `build_site`, the helper tools are available.

### 6. Find the screens and fetch them

Several commands open a terminal UI and will hang in an agent shell: `init`, `screens`, `view`,
and `site` without `--routes` or one of its JSON flags. Use these instead:

```bash
npx @_davideast/stitch-mcp tool list_projects -o json
npx @_davideast/stitch-mcp site -p 7302915846120394175 --list-screens
npx @_davideast/stitch-mcp tool get_screen_code -o json \
  -d '{"projectId":"7302915846120394175","screenId":"c41f0a9e7d2b4c6385a1f09b3e7d5a12"}'
```

`site --list-screens` prints `{ success, projectId, screens: [{ screenId, title, suggestedRoute,
hasHtml }] }`. A screen with `hasHtml: false` has no markup to fetch yet.

| Tool | Source | Input | What comes back |
|------|--------|-------|-----------------|
| `list_projects`, `get_project` | Stitch | none / `name` (`projects/ID`) | Projects the account can open |
| `list_screens`, `get_screen` | Stitch | `projectId` / `name` (`projects/ID/screens/SCREEN_ID`) | Metadata and download URLs, not markup |
| `generate_screen_from_text`, `edit_screens`, `generate_variants` | Stitch | prompt-driven | New or changed screens in the project |
| `get_screen_code` | proxy | `projectId`, `screenId` | `{ screenId, projectId, htmlContent }` |
| `get_screen_image` | proxy | `projectId`, `screenId` | `{ screenId, projectId, imageContent }`, the screenshot as base64 |
| `build_site` | proxy | `projectId`, `routes[]` of `{ screenId, route }` | `{ success, pages: [{ screenId, route, title, html }], message }` |
| `list_tools` | proxy | none | Names, descriptions and input schemas |

`tool NAME -s` prints the input schema of any tool. `-f, --data-file` reads the JSON body from a
file, and `-o` takes `json`, `pretty` (default) or `raw`.

### 7. Turn the markup into project code

1. Fetch `get_screen_code` and `get_screen_image` for each screen. The HTML carries exact colours,
   spacing and font stacks; the image shows what the result should look like.
2. Inventory what repeats across screens (navigation, footer, buttons, cards) before writing any
   file, and map each to an existing component or a new shared one.
3. Map raw values onto the project's tokens. A hex colour that matches a theme variable becomes
   the variable; a one-off value stays literal and is listed in the hand-off note.
4. Rebuild the structure with semantic elements, real links and form controls, and the project's
   data layer in place of hard-coded sample content.
5. Compare the running page with the screenshot at the design's width, then at a phone width, and
   report every deliberate deviation.

The generating tools, `create_project`, `delete_project` and the design-system tools change the
user's Stitch account. Call them only when the user asks for that, never as a side effect of
implementing a design.

### 8. Preview or export without an agent

| Command | Purpose | Flags worth knowing |
|---------|---------|---------------------|
| `serve -p ID` | Local Vite server, one URL per screen under `/screens/` | `--list-screens` prints paths as JSON; `--json` starts headless and prints JSON once the server is ready |
| `site -p ID` | Writes an Astro project from a screen-to-route map | `-o DIR` output folder; `-r JSON` supplies the map and skips the UI; `-e` prints the map as `build_site` input |
| `upload -p ID -f FILE` | Adds a PNG, JPG, WEBP or HTML file as a new screen | `--title` |
| `proxy` | The MCP server itself | `--debug` logs to `/tmp/stitch-proxy-debug.log` |
| `logout` | Revokes the OAuth sign-in | `--force`, `--clear-config` (asks the user first: it deletes the bundled gcloud configuration) |

The Astro output contains `src/layouts/Layout.astro`, one file per route in `src/pages/`, and
downloaded assets in `public/assets/`; it starts with `npm install && npm run dev` on port 4321.

## Examples

### Example 1: Implement one Stitch screen in an existing Next.js app

Ilse Brandt maintains a booking app (Next.js App Router, Tailwind with tokens in
`tailwind.config.ts`). She uses Claude Code, has a Stitch API key in her shell profile, and asks:
"implement the Pricing screen from my Stitch project."

```bash
claude mcp add stitch -e STITCH_API_KEY="$STITCH_API_KEY" -- npx @_davideast/stitch-mcp proxy
npx @_davideast/stitch-mcp site -p 7302915846120394175 --list-screens
```

The listing shows `{"screenId":"c41f0a9e7d2b4c6385a1f09b3e7d5a12","title":"Pricing",
"suggestedRoute":"/pricing","hasHtml":true}`. After a client restart the agent calls
`get_screen_code` and `get_screen_image` with those IDs, then reports:

```text
Screen: Pricing (c41f0a9e…5a12) -> app/pricing/page.tsx
Reused:   components/SiteHeader.tsx, components/Button.tsx (variant "primary")
Created:  components/pricing/PlanCard.tsx, components/pricing/BillingToggle.tsx
Tokens:   #1F6F5C -> colors.brand.600; 24px card gap -> gap-6; 44px heading kept as text-[44px]
Changed on purpose: plan prices read from lib/plans.ts instead of the sample figures
Checked:  1440px and 390px against the screenshot; toggle is keyboard-operable
```

### Example 2: Export three screens as an Astro site from a headless shell

Tomasz Wrona works over SSH on a build host and wants a static marketing site from a Stitch
project with no terminal UI involved. The key is already exported in the session.

```bash
npx @_davideast/stitch-mcp site -p 5518204776390142068 --list-screens > screens.json
npx @_davideast/stitch-mcp site -p 5518204776390142068 -o ./harbour-site -r '[
  {"screenId":"0b7e3c915ad84f2e9c6d1a8f4e2b7c30","route":"/"},
  {"screenId":"9a2d6f1c4b8e47a3b5c0e7d19f3a6b48","route":"/services"},
  {"screenId":"e5c81b07d3f24a69a1b4c92d6e0f7a15","route":"/contact"}
]'
cd harbour-site && npm install && npm run build
```

Result: `src/pages/index.astro`, `services.astro` and `contact.astro` wrapped in the shared
layout, with images and fonts under `public/assets/`. The agent then replaces the duplicated
header and footer markup in the three pages with one Astro component each, and notes that two
routes may not share a path and that an unknown screen ID aborts the build with the missing IDs
listed.

## Guidelines

- A "Permission Denied" response under OAuth usually means one of three things: billing is off,
  the Stitch API is not enabled on the project, or the account lacks the Owner or Editor role.
  `doctor --verbose` shows the HTTP error.
- Two gcloud installations are a common trap. The bundled one keeps credentials in
  `~/.stitch-mcp/config/`; signing in with the system gcloud does nothing for it unless
  `STITCH_USE_SYSTEM_GCLOUD=1` is set.
- Other variables the CLI reads: `STITCH_ACCESS_TOKEN` (a token obtained elsewhere),
  `STITCH_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT` (project override), `STITCH_HOST` (alternative
  endpoint).
- On WSL, SSH and containers the OAuth link is printed instead of opened; the user copies it into
  a browser. An API key avoids the problem entirely.
- `snapshot` renders the CLI's own terminal screens from a data file for its developers. It does
  not save or version Stitch designs; keep fetched HTML in the repository if a record is needed.
- Treat fetched HTML as a design reference. Pasting it into a page verbatim brings inline styles,
  remote font and image URLs, and no accessibility work.
- Pin the package (`@_davideast/stitch-mcp@0.9.0`) in shared configuration so every teammate and
  the CI run the same tool set; the project is experimental and not affiliated with Google.
- For the visual polish pass after implementation, pair this with the `impeccable` and
  `frontend-design` skills.
- Not the right tool when the design lives in Figma or as a static mock-up image, or when the
  user wants a design generated but not implemented: in the last case Stitch's web UI is enough.
