---
title: Build a Visual AI Agent Workflow with Langflow
slug: build-a-visual-ai-agent-workflow-with-langflow
description: Turn an agent flow drawn in Langflow into a versioned, tested API that a support backend and the team's coding agents can call, for small product teams.
skills:
  - langflow
  - docker-helper
category: data-ai
tags:
  - langflow
  - ai-agents
  - flow-api
  - mcp-server
  - docker-compose
---

## The Problem

Dario Esposito is the solutions engineer at Cartwheel Bikes, an online bike shop with 35 employees. The operations manager, Ines, knows exactly how an order-status question should be handled: look up the order, check the carrier, and explain delays in plain language. She cannot write Python, but she can wire components on a canvas, and she wants to keep adjusting the prompt herself.

Dario has to make her flow usable by the support chat backend, which answers about 400 order questions a week. He needs a server that survives restarts, a stable HTTP call with conversation memory, the flow definition in git so that a bad edit can be reverted, and a quick test that runs without the whole server. The developers also want to call the same flow from their coding agents.

## The Solution

Use the **langflow** skill to run Langflow with PostgreSQL, load a starter flow for Ines to adapt, call it through the run endpoint, export it into the repository, test the exported file with `lfx`, and publish the project as an MCP server. Use the **docker-helper** skill for the Compose override and container checks. Ines does the canvas work in her browser; the agent does everything else from the terminal.

## Step-by-Step Walkthrough

### 1. Start Langflow with a database that persists

```text
Run Langflow 1.12.4 with PostgreSQL on this server using the project's example Compose file. Generate the superuser password.
```

```bash
git clone https://github.com/langflow-ai/langflow.git
cd langflow/docker_example
printf 'LANGFLOW_SUPERUSER_PASSWORD=%s\n' "$(openssl rand -hex 16)" > .env
```

The agent pins the image in an override file instead of editing the upstream Compose file:

```yaml
# docker-compose.override.yml
services:
  langflow:
    image: langflowai/langflow:1.12.4
    pull_policy: missing
```

```bash
docker compose up -d
docker compose ps
curl -s http://localhost:7860/health_check
```

The health check answers `{"status":"ok","chat":"ok","db":"ok"}`. Ines signs in as `langflow` with the generated password, and Dario creates an API key under Settings → Langflow API Keys and exports it as `LANGFLOW_API_KEY`.

### 2. Load a starter flow for Ines to adapt

```text
Import the Simple Agent starter flow into our project so Ines has something to edit.
```

```bash
export LANGFLOW_URL="http://localhost:7860"
curl -s -o order-status-agent.json \
  "https://raw.githubusercontent.com/langflow-ai/langflow/main/src/backend/base/langflow/initial_setup/starter_projects/Simple%20Agent.json"

PROJECT_ID=$(curl -s "$LANGFLOW_URL/api/v1/projects/" -H "x-api-key: $LANGFLOW_API_KEY" | jq -r '.[0].id')

FLOW_ID=$(curl -s -X POST "$LANGFLOW_URL/api/v1/flows/upload/?folder_id=$PROJECT_ID" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -F "file=@order-status-agent.json;type=application/json" | jq -r '.[0].id')
echo "$FLOW_ID"
```

Ines opens the flow, renames it to "Order Status Agent", adds the order lookup tool and rewrites the agent instructions. She stores the model provider key as a global variable, so it never appears in the flow file.

### 3. Call the flow from the support backend

```text
Show me the HTTP call for the chat backend. Each customer conversation must keep its own memory.
```

```bash
curl -s -X POST "$LANGFLOW_URL/api/v1/run/$FLOW_ID?stream=false" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -d '{
    "input_value": "Where is my order CW-10482?",
    "input_type": "chat",
    "output_type": "chat",
    "session_id": "chat-7f31c2"
  }' | jq -r '.outputs[0].outputs[0].results.message.text'
```

```text
Order CW-10482 left our warehouse on 24 September and is with the carrier. The expected delivery date is 1 October.
```

The backend sends the chat widget's conversation id as `session_id`, so follow-up questions such as "Can I change the address?" are answered in context.

### 4. Put the flow in git

```text
Export the flow into the repository under flows/ so we can review changes.
```

```bash
curl -s -X POST "$LANGFLOW_URL/api/v1/flows/download/" \
  -H "Content-Type: application/json" -H "x-api-key: $LANGFLOW_API_KEY" \
  -d "[\"$FLOW_ID\"]" --output order-status-agent.zip
unzip -o order-status-agent.zip -d flows/
ls flows/
```

The archive contains `Order Status Agent.json`. Before it is committed, the agent searches the file for literal credentials and finds only the name of the global variable.

### 5. Test the exported file without the server

```text
Run the exported flow once with lfx as a smoke test.
```

```bash
lfx requirements "flows/Order Status Agent.json"
uv run lfx run "flows/Order Status Agent.json" "Where is my order CW-10482?" --format json | jq '.result'
```

`lfx` runs the flow statelessly, so the model provider key is supplied as an environment variable for this run. If a component package is missing, the error names the bundle to install.

### 6. Offer the flow to the developers' coding agents

```text
Create the MCP client configuration for our project so the team can use the flow as a tool in Cursor.
```

```bash
jq -n --arg url "$LANGFLOW_URL/api/v1/mcp/project/$PROJECT_ID/streamable" --arg key "$LANGFLOW_API_KEY" \
  '{mcpServers: {"cartwheel-support": {command: "uvx",
    args: ["mcp-proxy", "--transport", "streamablehttp", "--headers", "x-api-key", $key, $url]}}}'
```

Each developer merges the output into their own `mcp.json`. Dario asks Ines to give the flow a clear tool name and description in the project's MCP Server tab, because clients choose tools by those texts.

## Real-World Example

Ines needs two afternoons to get the agent's answers right. In the first week the chat backend sends 412 order questions through the flow; 371 are answered without a human, and the rest are handed to support staff with the order data already attached.

In week three Ines shortens the instructions and the agent starts to skip the carrier check. Dario exports the flow again, and the diff in `flows/Order Status Agent.json` shows the removed paragraph. He uploads the previous version from git, and the smoke test passes again within ten minutes of the first complaint. Since then, every change to the flow is exported and reviewed before the backend switches to it.

## Related Skills

- [langflow](/skills/langflow) — runs the server, imports and exports flow JSON, calls the run endpoint, tests the file with lfx and publishes the project as an MCP server
- [docker-helper](/skills/docker-helper) — writes the Compose override that pins the image and checks the state of the containers
