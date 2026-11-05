---
name: gitdiagram
description: >-
  Shows how a public GitHub repository is built: an AI-made architecture diagram with a written explanation, the main components and their source paths, and Mermaid source. Use when the user asks "how is owner/repo structured?", wants an architecture overview of an open-source project before reading its code, needs Mermaid source for a repository, or wants to add the GitDiagram MCP server to Claude Code, Codex, Gemini CLI or Copilot CLI. Covers the hosted site, the .md endpoint, the MCP tools and self-hosting.
license: Apache-2.0
compatibility: "Internet access to gitdiagram.com for the hosted service and MCP server; self-hosting needs Bun 1.3, Node.js 22, Cloudflare R2, Upstash Redis and an OpenAI or OpenRouter API key"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "architecture-diagram, github, mermaid, mcp, code-visualization"
  repository: https://github.com/ahmedkhaleel2004/gitdiagram
---
# GitDiagram — architecture diagrams for GitHub repositories

## Overview

GitDiagram (gitdiagram.com, MIT licence) reads a GitHub repository's file tree, README and a sample of its source files, and has a model produce a diagram of the system: groups of components, how they connect, and a link from every component to its file on GitHub. The result is shown as an interactive page and is also available as Markdown and through a read-only MCP server. A separate feature turns a repository into a narrated explainer video of about a minute; watching existing videos is open to everyone, while making new ones is early access.

For an agent the useful parts are the MCP server and the Markdown endpoint: both return the architecture of a public repository as text, with Mermaid source, so the agent can answer structure questions without cloning and reading hundreds of files. The diagrams are AI-made overviews, so check specific claims against the code.

## Instructions

### Reading a diagram in a browser or by URL

Any GitHub URL works with `hub` replaced by `diagram`: `https://github.com/fastapi/fastapi` becomes `https://gitdiagram.com/fastapi/fastapi`. Add `/video` for the explainer video page if one exists (`https://gitdiagram.com/fastapi/fastapi/video`), and `.md` for the Markdown version.

```bash
curl -s https://gitdiagram.com/fastapi/fastapi.md -o fastapi-architecture.md
head -n 12 fastapi-architecture.md
```

The file starts with a title, a note on when it was last updated, links to the interactive diagram, the repository and the video, then `## Overview`, a fenced `mermaid` block (a `flowchart TD` with `subgraph` groups and `click` lines pointing to GitHub files) and a component list. A 404 means no diagram has been made yet: open `https://gitdiagram.com/owner/repo` in a browser once and wait about a minute for it to generate.

### Adding the MCP server to an agent

The server is remote, needs no key or sign-in, and lives at `https://gitdiagram.com/mcp`.

```bash
# Claude Code
claude mcp add --transport http gitdiagram https://gitdiagram.com/mcp

# Codex CLI
codex mcp add gitdiagram --url https://gitdiagram.com/mcp

# Gemini CLI
gemini extensions install https://github.com/ahmedkhaleel2004/gitdiagram

# GitHub Copilot CLI
copilot mcp add --transport http gitdiagram https://gitdiagram.com/mcp
```

Other clients (Cursor, VS Code, Windsurf, Zed, ChatGPT) take the same URL as a remote MCP server. Restart the client so the tools appear.

### The three tools

All are read-only; none starts a paid generation or touches private repositories.

- `get_repository_diagram` takes `repository`, either `owner/repo` or any github.com URL inside the repository. It returns the written explanation, the components with source paths, the connections, Mermaid source and the interactive link. If no diagram exists yet it returns a link that creates one when opened in a browser.
- `find_repository_diagrams` takes `query` (part of an `owner/repo` name) and an optional `limit` of 1 to 10. It lists stored diagrams, most-starred first, and is the way to find a project's exact owner and repo name. It searches names, not code.
- `get_explainer_video` takes `repository` and returns the video link, length and narration transcript when a video exists. It never makes one.

### What the Markdown contains

The `.md` file is the most stable thing to parse. In order: a heading `# owner/repo architecture`, a quoted note with the generation date, three links (interactive diagram, repository, video tour), `## Overview` in prose, `## Diagram (Mermaid)` with a `flowchart TD` block, and the component and connection lists. Node ids look like `node_router`, labels carry the source file in square brackets, and each `click node_x "https://github.com/..."` line gives the GitHub file for that node. To list the linked files:

```bash
grep '^click ' fastapi-architecture.md | awk '{print $3}' | tr -d '"'
```

### Explainer videos

`https://gitdiagram.com/videos` is a gallery of existing videos, and `/video` on a diagram URL opens one if it exists (MP4 download, landscape or vertical, captions burned in). The `get_explainer_video` tool returns the link and the narration transcript, which is useful when a person wants something to watch or a short spoken-style summary. Do not promise a video for a given repository: creating new ones is early access on the hosted site.

### Using the result

Ask the agent to answer from the result, not from memory: a short summary of the layers, the components with their files, and the request or data path through them. When the user needs a diagram in a document, take the `mermaid` block as is; GitHub, GitLab, Notion and most docs tools render it.

### Troubleshooting

- The tools are missing after `claude mcp add`: restart the session, then check `/mcp`. The URL must end in `/mcp`.
- `get_repository_diagram` returns a link instead of a diagram: none is stored yet. Open the link in a browser, wait about a minute, call the tool again.
- A fork or renamed repository has no diagram: use `find_repository_diagrams` to see which owner name the project is stored under (for instance `tiangolo/fastapi` and `fastapi/fastapi` both exist).
- `curl` on the `.md` URL gives 404: same cause as above. Add `-f` so scripts fail instead of saving an error page.
- Rate limit message: wait; the limit is per network and per hour.

### Self-hosting (documentation only)

The app is one Next.js project run with Bun. The setup below follows the repository's `docs/dev-setup.md`; it needs accounts that are not free-standing, so it was not run here.

```bash
git clone https://github.com/ahmedkhaleel2004/gitdiagram.git
cd gitdiagram
bun install
cp .env.example .env
bun run dev
```

In `.env`, set the storage variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `CACHE_KEY_SECRET`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, and one provider: `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=openrouter` with `OPENROUTER_API_KEY`. `GITHUB_PAT` raises GitHub API limits. The app is then on http://localhost:3000. Explainer videos stay off unless `VIDEO_EXPLAINER_ENABLED=1` and `NEXT_PUBLIC_VIDEO_EXPLAINER=1` are set together with `OPENAI_API_KEY`, `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY`.

## Examples

### Example 1: understand an open-source dependency before reading it

Request: "I have to patch something in fastapi. How is it structured?"

```bash
claude mcp add --transport http gitdiagram https://gitdiagram.com/mcp
```

Then in the session: "Use gitdiagram to explain fastapi/fastapi, then tell me which file builds the OpenAPI schema." The agent calls `get_repository_diagram` with `repository: "fastapi/fastapi"`. The answer lists the request path (client, application, middleware stack, route dispatch, dependency solving, endpoint, response encoding), a separate OpenAPI branch with `fastapi/openapi/utils.py`, and gives the link `https://gitdiagram.com/fastapi/fastapi` where each box opens its file.

### Example 2: save the Mermaid source next to your notes

Request: "Put the architecture of pallets/flask into docs/flask-architecture.md."

```bash
mkdir -p docs
curl -s -f https://gitdiagram.com/pallets/flask.md -o docs/flask-architecture.md
grep -c '^click ' docs/flask-architecture.md
```

The file holds the overview and the Mermaid block; the count shows how many components link to source files. If `curl -f` fails with 404, open `https://gitdiagram.com/pallets/flask` in a browser, wait for generation, and rerun.

### Example 3: find the right repository name

Request: "Which diagrams exist for langchain?"

The agent calls `find_repository_diagrams` with `query: "langchain"` and `limit: 5`, gets a list such as `owner/repo (stars, date): link`, and then calls `get_repository_diagram` on the one the user picks.

### Example 4: compare two projects before choosing one

Request: "We are choosing between two Python web frameworks. Compare how they are laid out."

The agent calls `find_repository_diagrams` for each name to get the exact `owner/repo`, then `get_repository_diagram` twice. It replies with one short table per project: the request path, the number of top-level component groups, where routing and dependency or middleware handling live (with file names from the result), and the date of each snapshot. It states that both come from AI-made overviews and names the two files it would read first to confirm the comparison.

## Guidelines

- The MCP server and the `.md` endpoint cover public repositories only. The website can also read private ones through "Private Repos" in its header; never paste a token into a prompt to an agent.
- Diagrams are generated by a model from a sample of the code. Treat them as a map, and confirm any claim you will rely on in the source. Check the "last updated" date at the top of the Markdown.
- The MCP server is rate limited per network (the default is 120 tool calls an hour), so do not loop over many repositories.
- Do not use it for your own private code or for a precise dependency graph; use a code-graph or static-analysis tool for that.
- Videos: asking for one that does not exist returns a message and a link, not a video.
- Cite the snapshot date and the repository name whenever you quote the diagram, so a reader can tell it from the live code.
- If the user needs a diagram they can edit by hand, take the Mermaid or component list as input to a drawing tool instead of editing the hosted one.
- The `## Components` and `## Connections` sections are plain lists, easier to quote than the Mermaid block; use the block only when a diagram is needed.
- A very large repository gets a diagram built from a bounded part of the tree and a sample of files, so some subsystems are absent. Say so when summarizing.
- Everything sent to the hosted service is public information (a repository name); the MCP server does not receive your code.
- Quote the `## Components` entry for a box together with its file path, so the reader can open the file and check it.
- Self-hosting needs paid or account-bound services (R2, Upstash, an LLM key). For occasional use, the hosted site is simpler.
