---
name: next-ai-draw-io
description: >-
  Lets an AI agent draw and edit draw.io diagrams on a live browser canvas that the person can also edit by hand, with versions, undo and export to .drawio, .png and .svg. Use when the user asks to "draw the architecture of this repo", "make a draw.io diagram", "edit this .drawio file", "export a diagram as PNG or SVG", or to add the drawio MCP server (@next-ai-drawio/mcp-server) to Claude Code, Codex, Cursor or VS Code. Also covers self-hosting the Next AI Draw.io web app.
license: Apache-2.0
compatibility: "Node.js 18+ for the MCP server (npx); a desktop browser for the preview; the self-hosted web app needs Node.js or Docker and an LLM provider key"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: "drawio, diagrams, mcp, architecture-diagram, flowchart"
  repository: https://github.com/DayuanJiang/next-ai-draw-io
---
# Next AI Draw.io — draw and edit draw.io diagrams with an AI

## Overview

Next AI Draw.io (Apache-2.0) comes in three forms: a web app (demo at next-ai-drawio.jiang.jp, or self-hosted) where you chat to draw, a desktop app for Windows, macOS and Linux, and an MCP server for coding agents. The MCP server is the one an agent uses. It is published on npm as `@next-ai-drawio/mcp-server` (install this scoped package, not the unscoped `next-ai-draw-io` one). It starts a local preview page with the real draw.io editor; the agent writes draw.io XML through tools, and the person watches the diagram appear, moves shapes, selects some and says "make these blue". The agent reads those hand edits back before changing the diagram again.

The agent uses its own model and its own file access, so the MCP server needs no API key. A model key is only needed for the web app and desktop app, which have their own chat.

## Instructions

### Install the MCP server

Claude Code:

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex CLI:

```bash
codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex asks before every tool that changes the diagram, and `codex exec` without full access fails with "MCP tool call requires approval". To allow the drawio tools, add to `~/.codex/config.toml`:

```toml
[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"
```

Cursor (`~/.cursor/mcp.json`), Claude Desktop (`claude_desktop_config.json`), Cline and most others:

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

VS Code uses `.vscode/mcp.json` with a `servers` key and `"type": "stdio"` in the entry. Restart the client; in Claude Code, `/mcp` lists `drawio` when it is connected.

### The tools

Sixteen tools, confirmed from the 0.4.11 package:

- `start_session` opens the preview and returns the drawing rules and a URL such as `http://localhost:6002/shell/?mcp=mcp-...`. Optional `session_id` continues a saved diagram. Always call it first; "No active session" means it was skipped.
- `create_new_diagram` takes `xml` (the `mxCell` elements of one page, a bare `<mxGraphModel>`, or a full `<mxfile>`) and replaces the whole document. The previous state stays in version history.
- `edit_diagram` takes `operations`, each `{operation: "add" | "update" | "delete", cell_id, new_xml}`, applied all or nothing. It is rejected, with the current XML, if the person edited in the browser since the agent last looked.
- `get_diagram` returns the current XML including hand edits; `get_selection` returns the shapes the person selected.
- `get_shape_library` (for example `aws4`) returns icon style names; call it before using AWS, Azure, GCP, Kubernetes or Cisco icons. `get_drawing_guide` repeats the drawing rules.
- `screenshot_diagram` (or `screenshot: true` on a create or edit) returns a PNG so the agent can check for overlaps.
- `export_diagram` takes an absolute `path`; the extension picks the format: `.drawio`, `.png`, `.svg` or `.drawio.svg` (an image that draw.io can open again). `transparent: true` removes the PNG's white background.
- `load_diagram` opens an existing `.drawio` or `.drawio.svg` by `path` or raw `xml`. To change a file, load it, edit, then export to the same path; never hand-edit the XML file.
- `list_saved_diagrams`, `restore_version`, `list_pages`, `add_page`, `rename_page`, `delete_page` cover history and multi-page diagrams.

The preview needs a browser tab open on the URL; screenshots and PNG/SVG export are rendered by that tab, so keep it visible.

### What the agent sends

`create_new_diagram` accepts only the `mxCell` elements of one page; the server wraps them in the file structure and adds the two root cells. Cells are siblings (never nested), ids are unique per page and start at "2", `parent` is used only for shapes inside a container, and XML comments are not allowed. A style used by several cells is defined once with `<mxStyle name="..." value="..."/>` before the cells. A minimal two-box flow looks like this:

```xml
<mxCell id="2" value="API" style="rounded=1;" x="40" y="40" w="120" h="60"/>
<mxCell id="3" value="Postgres" style="shape=cylinder3;" x="240" y="40" w="100" h="80"/>
<mxCell id="4" value="reads and writes" style="endArrow=classic;" edge="1" source="2" target="3"/>
```

`edit_diagram` then changes single cells by id, for example `{"operations": [{"operation": "delete", "cell_id": "4"}]}`. A drawing that uses real cloud icons should fetch the library first with `get_shape_library` so the style names are correct, not guessed.

### Working from files and documents

The agent draws from whatever it can read: a repository, an `architecture.md`, an OpenAPI file or an existing `.drawio`. Ask for one diagram type per request (architecture, sequence, ER, flowchart, BPMN, Kubernetes), name the elements you want, and say which page they go on. For a long diagram, ask it to draw the skeleton first and refine after a `screenshot_diagram`.

### Configuration

Set variables in the client's `env` block for the server. Useful ones: `PORT` (default 6002; the next free port up to 6020 is used if taken), `DRAWIO_DATA_DIR` (default `~/.next-ai-drawio`, `off` disables saving), `BROWSER=none` (do not auto-open the preview; the URL is still returned), `DRAWIO_DARK` (`1`, `0` or `auto`), `DRAWIO_AUTO_SCREENSHOT=true` (attach a screenshot to every change, 2 to 10 seconds each).

Every change is saved to `~/.next-ai-drawio/` as one `.drawio` file per session with the last 20 versions; the newest 50 diagrams are kept. House style goes in `~/.next-ai-drawio/instructions.md` (first 5000 characters, read on every call).

The server listens on 127.0.0.1 and protects its `/api` with a token only the preview page has.

### Self-hosting the web app (documentation only)

This was not run here because it needs a model provider key.

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
cp env.example .env.local
npm install
npm run dev
```

Open http://localhost:6002. In `.env.local` set `AI_PROVIDER` (default `bedrock`; others include `openai`, `anthropic`, `google`, `azure`, `ollama`, `openrouter`, `deepseek` and `custom` for any OpenAI-compatible URL), `AI_MODEL`, and the provider's key, for example `OPENAI_API_KEY`. Several comma-separated model ids in `AI_MODEL` appear in the model picker. `ACCESS_CODE_LIST` gates access; `ADMIN_PASSWORD` enables `/admin`.

With Docker, bind to the loopback address:

```bash
docker run -d -p 127.0.0.1:3000:3000 \
  -e AI_PROVIDER=openai -e AI_MODEL=gpt-4o -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

The app is then on http://localhost:3000. A capable model matters: the output is long, strictly formatted XML, and small models produce broken diagrams.

## Examples

### Example 1: draw a repository's architecture for a design doc

Request: "Read this repo and draw its architecture, then save it as docs/architecture.drawio.svg."

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

In a new session the agent reads the code with its own tools, calls `start_session`, opens the preview, and calls `create_new_diagram` with the services, queues and databases as `mxCell` shapes (a large diagram is built in parts). It then calls `screenshot_diagram`, fixes any overlaps with `edit_diagram`, and finally `export_diagram` with `path: "/home/dana/shop/docs/architecture.drawio.svg"`. The file renders in a README and opens in draw.io for further edits.

### Example 2: change a diagram by hand, then by agent

Request: "Open diagrams/system.drawio and add a queue between the API and the worker."

The agent calls `start_session`, then `load_diagram` with `path: "/home/dana/shop/diagrams/system.drawio"`, then `get_diagram` to learn cell ids. After the person selects the worker box in the preview and says "put the queue before this", the agent calls `get_selection`, then `edit_diagram` with an `add` operation for the queue and `update` operations for the edges. It ends with `export_diagram` to the same path.

### Example 3: send a PNG to a ticket

Request: "Export the current diagram as a transparent PNG."

The agent calls `export_diagram` with `path: "/home/dana/shop/out/flow.png"` and `transparent: true`. If it times out, bring the preview tab to the front: background tabs render slowly.

## Guidelines

- Use a strong model. Small local models often produce invalid XML; `edit_diagram` fails as a whole and reports every failing operation.
- Stay within the canvas: shapes belong in roughly x 0 to 800 and y 0 to 600 per page; use `add_page` for more.
- Do not rewrite the autosaved `.drawio` file by hand; change diagrams only with the tools.
- The preview is a normal browser page. It will not render inside VS Code Simple Browser or Cursor's browser (the page refuses framing); open the URL in a regular browser.
- Pointing `DRAWIO_BASE_URL` at another draw.io loses the outlines, Ctrl+Z for AI changes and `get_selection`.
- Draw.io's own `@drawio/mcp` and the hosted `mcp.draw.io` are alternatives when no hand-editing round trip is needed. For diagrams generated from text in a repository, a Mermaid renderer is lighter.
- The public demo site has a usage limit; do not send confidential diagrams to it. Self-host or use the MCP server, which keeps everything on the local machine apart from what the agent's own model sees.
