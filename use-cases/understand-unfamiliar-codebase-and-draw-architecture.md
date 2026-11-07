---
title: Understand an Unfamiliar Codebase and Draw Its Architecture
slug: understand-unfamiliar-codebase-and-draw-architecture
description: Get an architecture map of an unfamiliar open-source repository in minutes, then draw an editable diagram of your own system for a design review.
skills:
  - gitdiagram
  - next-ai-draw-io
category: development
tags:
  - architecture-diagram
  - drawio
  - mermaid
  - mcp
  - design-review
---

# Understand an Unfamiliar Codebase and Draw Its Architecture

## The Problem

Priya Nair is a backend engineer at a 14-person logistics startup. Two things landed on her in the same week. First, the team wants to extend FastAPI's dependency handling for a custom auth layer, and nobody has read the framework's source: it has hundreds of files, and the first hour of every spike goes to opening folders to find where a request actually travels. Second, the CTO wants an RFC for splitting the shipment-tracking service out of the monolith, and the RFC needs an architecture diagram that the team can argue over and edit in the meeting.

Both jobs are "show me how this code fits together", and both usually end in a long afternoon: reading files to build a mental model, then dragging boxes around a drawing tool for two hours, only for the diagram to drift from the code by the next sprint.

## The Solution

Split the work by whose code it is. For code you do not own, use the **gitdiagram** skill: GitDiagram's MCP server returns the architecture of a public repository (components, source paths, connections, Mermaid source) without cloning it. For your own system, use the **next-ai-draw-io** skill: the agent reads your repository with its normal tools and draws a real draw.io diagram on a live canvas, which the team can then correct by hand, version and export. Both outputs are AI-made drafts. The agent should cite the files behind each box, and a person who knows the system checks the picture before it goes into a document.

## Step-by-Step Walkthrough

### Step 1: Add both servers to the agent

```text
Add the GitDiagram MCP server and the draw.io MCP server to Claude Code for all my projects.
```

The agent runs:

```bash
claude mcp add --transport http gitdiagram https://gitdiagram.com/mcp
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

After a restart, `/mcp` lists `gitdiagram` and `drawio`. Neither needs an API key; the draw.io server uses the agent's own model.

### Step 2: Map the unfamiliar repository

```text
Use gitdiagram to explain fastapi/fastapi. I need to know where a request goes from the app object to my endpoint function, and which file resolves dependencies.
```

The agent calls `get_repository_diagram` with `repository: "fastapi/fastapi"`. It answers from the result: the request path (client, application, middleware stack, route dispatch, dependency solving, endpoint, response encoding), the file behind each step, for example `fastapi/routing.py` for dispatch and `fastapi/dependencies/utils.py` for dependency solving, and the link `https://gitdiagram.com/fastapi/fastapi`, where each box opens its file on GitHub. If no diagram exists yet, the result holds a link that generates one when opened in a browser; the agent hands it over and rereads after a minute.

### Step 3: Keep the map next to the notes

```text
Save the architecture of fastapi/fastapi into docs/research/fastapi-architecture.md, and tell me when it was generated.
```

```bash
mkdir -p docs/research
curl -s -f https://gitdiagram.com/fastapi/fastapi.md -o docs/research/fastapi-architecture.md
sed -n 1,6p docs/research/fastapi-architecture.md
```

The first lines state the generation date. The Mermaid block inside renders in GitHub and most documentation tools, so the research note needs no image.

### Step 4: Verify before relying on it

```text
Open the files the diagram names for dependency solving and confirm the function that resolves a parameter's dependencies. Report anything the diagram got wrong.
```

The agent reads the named file and checks the claim. GitDiagram works from a sample of the code, so a box labelled with a file is a lead, not a proof. Corrections go into the note.

### Step 5: Draw your own system on a live canvas

```text
Read the repository in this folder and draw the current architecture of the monolith with draw.io: the API, the order and shipment modules, the Postgres database, the Redis queue and the carrier webhooks. Then show the shipment-tracking module as a separate service.
```

The agent reads the code, calls `start_session` (the preview opens at a `localhost:6002` address), and calls `create_new_diagram` with the shapes and arrows. It checks its work with `screenshot_diagram`, fixes overlaps with `edit_diagram`, and puts the proposed split on a second page with `add_page`.

### Step 6: Edit together, then export

In the browser, Priya selects the Redis queue and says: "Make these two queues, one for webhooks and one for notifications." The agent calls `get_selection` and `edit_diagram`. When the picture is right:

```text
Export both pages: docs/rfc/tracking-split.drawio for the team to keep editing, and a PNG for the RFC.
```

The agent calls `export_diagram` for `/home/priya/shipments/docs/rfc/tracking-split.drawio` and for `/home/priya/shipments/docs/rfc/tracking-split.png`. The `.drawio` file opens in draw.io for the meeting, and every AI change is in the version history if someone wants the earlier layout back.

## Real-World Example

By lunchtime Priya has a one-page note on FastAPI's request path with file names, which turns the spike into a two-line plan: add the check as a dependency rather than patching the router. In the afternoon the draw.io session produces the monolith diagram and the proposed split in about 25 minutes, including two rounds of hand edits in the meeting. The earlier process, reading code and drawing by hand, took her team the better part of a day for each. The RFC links the `.drawio` file, so the next person edits the diagram instead of redrawing it, and the research note records the date of the GitDiagram snapshot so nobody mistakes it for the live code.

## Related Skills

- [gitdiagram](/skills/gitdiagram) — architecture map, components and Mermaid source of a public GitHub repository, without cloning it
- [next-ai-draw-io](/skills/next-ai-draw-io) — draws and edits the diagram of your own system on a live draw.io canvas and exports `.drawio`, `.png` or `.svg`
