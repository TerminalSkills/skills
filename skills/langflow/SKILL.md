---
name: langflow
description: >-
  Langflow is a visual builder for AI agents and workflows that serves every
  flow as a REST API endpoint and as an MCP tool. Use when a user asks to
  install or run Langflow, deploy Langflow with Docker Compose and PostgreSQL,
  run a flow through the Langflow API, pass tweaks or a session id, export or
  import flow JSON, create a Langflow API key, run a flow file without the
  server using lfx, connect Langflow flows to an MCP client, or upgrade
  Langflow without losing flows.
license: Apache-2.0
compatibility: "Python 3.10–3.14 with uv, or Docker with the Compose v2 plugin. Dual-core CPU and 2 GB RAM minimum, 4 GB recommended. curl and jq for API calls."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["langflow", "ai-agents", "flow-api", "mcp-server", "self-hosted"]
  repository: https://github.com/langflow-ai/langflow
---
# Langflow — Visual agent flows served as APIs and MCP tools

## Overview

In Langflow, people assemble flows from components on a browser canvas. An agent handles the parts around the canvas from a terminal: installing and starting the server, configuring it through environment variables, calling flows over HTTP, moving flow JSON between instances and into git, running a flow file headlessly with `lfx`, registering a project as an MCP server, and upgrading.

## Instructions

### Installation

```bash
# Python package, inside a virtual environment
uv venv langflow-venv
source langflow-venv/bin/activate
uv pip install langflow          # langflow-base installs the same app without provider bundles
uv run langflow run              # first start can take a few minutes
```

The server listens on `http://127.0.0.1:7860`. A quick container without persistent storage:

```bash
# LANGFLOW_SUPERUSER_PASSWORD is chosen by the user; the image refuses to start without it
docker run -p 7860:7860 \
  -e LANGFLOW_SUPERUSER_PASSWORD="$LANGFLOW_SUPERUSER_PASSWORD" \
  langflowai/langflow:latest

curl -s http://localhost:7860/health_check
# {"status":"ok","chat":"ok","db":"ok"}
```

Official images set `LANGFLOW_AUTO_LOGIN=false`, so the superuser password is mandatory and the old default value `langflow` is rejected. The default superuser name is `langflow`.

### Deploy with Docker Compose and PostgreSQL

The repository ships a Compose file with PostgreSQL and named volumes for data.

```bash
git clone https://github.com/langflow-ai/langflow.git
cd langflow/docker_example
printf 'LANGFLOW_SUPERUSER_PASSWORD=%s\n' "$(openssl rand -hex 16)" > .env
docker compose up -d
docker compose ps
```

For anything beyond a local test, pin `image: langflowai/langflow:1.12.4` instead of `latest`, change the PostgreSQL credentials in the file, and remove the published `5432` port.

### Configure the server

Settings come from CLI options, environment variables or a `.env` file; a CLI option overrides the variable of the same name.

| Variable | Default | Purpose |
|---|---|---|
| `LANGFLOW_HOST`, `LANGFLOW_PORT` | `localhost`, `7860` | Bind address and port (a free port is chosen if busy) |
| `LANGFLOW_AUTO_LOGIN` | `True` (package), `false` (Docker) | `False` requires sign-in and API keys |
| `LANGFLOW_SUPERUSER`, `LANGFLOW_SUPERUSER_PASSWORD` | `langflow`, none | Admin account created at startup |
| `LANGFLOW_SECRET_KEY` | generated | Encrypts stored credentials; set it explicitly in production |
| `LANGFLOW_DATABASE_URL` | SQLite file | For example `postgresql://langflow:s3cure@postgres:5432/langflow` |
| `LANGFLOW_CONFIG_DIR` | depends on the OS | Directory for logs, file storage and secret keys |
| `LANGFLOW_API_KEY_SOURCE` | `db` | `env` validates requests against `LANGFLOW_API_KEY` |
| `LANGFLOW_LOAD_FLOWS_PATH` | unset | Directory of flow JSON loaded at startup (needs auto-login) |
| `LANGFLOW_ENABLE_SUPERUSER_CLI` | `True` | Set `False` to disable `langflow superuser` |

```bash
python3 -c "from secrets import token_urlsafe; print(f'LANGFLOW_SECRET_KEY={token_urlsafe(32)}')" >> langflow.env
printf 'LANGFLOW_AUTO_LOGIN=False\nLANGFLOW_ENABLE_SIGNUP=False\n' >> langflow.env
printf 'LANGFLOW_SUPERUSER_PASSWORD=%s\n' "$(openssl rand -hex 16)" >> langflow.env

uv run langflow run --env-file langflow.env --host 0.0.0.0 --port 7860 --backend-only
```

`--backend-only` starts the API without the visual editor. Other CLI commands: `langflow api-key`, `langflow superuser`, `langflow migration` and `langflow --version`.

### Authenticate

Requests carry a Langflow API key in the `x-api-key` header. Keys are created in the editor under Settings → Langflow API Keys, or on the server by a superuser:

```bash
uv run langflow api-key
```

For unattended deployments, set `LANGFLOW_API_KEY_SOURCE=env` and `LANGFLOW_API_KEY` to a generated secret. That single key then has superuser rights.

```bash
export LANGFLOW_URL="http://localhost:7860"      # LANGFLOW_API_KEY comes from one of the methods above
curl -s "$LANGFLOW_URL/api/v1/version"
curl -s "$LANGFLOW_URL/api/v1/flows/?get_all=true&header_flows=true" \
  -H "x-api-key: $LANGFLOW_API_KEY" | jq -r '.[] | "\(.id)  \(.name)"'
```

### Run a flow

```bash
FLOW_ID="359cd752-07ea-46f2-9d3b-a4407ef618da"   # flow UUID or its endpoint name
curl -s -X POST "$LANGFLOW_URL/api/v1/run/$FLOW_ID?stream=false" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -d '{
    "input_value": "What is your refund policy for annual plans?",
    "input_type": "chat",
    "output_type": "chat",
    "session_id": "customer-4821",
    "tweaks": {"ChatOutput-6zcZt": {"should_store_message": true}}
  }' | jq -r '.outputs[0].outputs[0].results.message.text'
```

| Field | Meaning |
|---|---|
| `input_value` | Text passed to the flow's input component |
| `input_type`, `output_type` | `chat` or `text` for input; `chat`, `any` or `debug` for output |
| `session_id` | Conversation id; reuse it to keep chat memory between calls |
| `tweaks` | One-time overrides keyed by component id, such as `OpenAIModel-d1wOZ` |
| `?stream=true` | Streams `token` events and a final `end` event |

Secrets and per-request values can be injected as global variables without storing them in Langflow: add headers of the form `X-LANGFLOW-GLOBAL-VAR-OPENAI_API_KEY: ...`. A flow with a Webhook component is started with `POST /api/v1/webhook/$FLOW_ID` and any JSON body; the reply only confirms that the run started.

```python
import os
import requests

url = f"{os.environ['LANGFLOW_URL']}/api/v1/run/{os.environ['FLOW_ID']}"
headers = {"x-api-key": os.environ["LANGFLOW_API_KEY"]}
payload = {"input_value": "Summarize ticket 88213", "input_type": "chat",
           "output_type": "chat", "session_id": "helpdesk-88213"}

response = requests.post(url, headers=headers, json=payload, timeout=120)
response.raise_for_status()
print(response.json()["outputs"][0]["outputs"][0]["results"]["message"]["text"])
```

### Export and import flows

```bash
# Export selected flows as a ZIP of JSON files
curl -s -X POST "$LANGFLOW_URL/api/v1/flows/download/" \
  -H "Content-Type: application/json" -H "x-api-key: $LANGFLOW_API_KEY" \
  -d '["359cd752-07ea-46f2-9d3b-a4407ef618da", "92f9a4c5-cfc8-4656-ae63-1f0881163c28"]' \
  --output langflow-flows.zip

# Export a whole project
curl -s "$LANGFLOW_URL/api/v1/projects/" -H "x-api-key: $LANGFLOW_API_KEY" | jq -r '.[] | "\(.id)  \(.name)"'
curl -s "$LANGFLOW_URL/api/v1/projects/download/1415de42-8f01-4f36-bf34-539f23e47466" \
  -H "x-api-key: $LANGFLOW_API_KEY" --output langflow-project.zip

# Import one flow file into a project
curl -s -X POST "$LANGFLOW_URL/api/v1/flows/upload/?folder_id=1415de42-8f01-4f36-bf34-539f23e47466" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -F "file=@faq-assistant.json;type=application/json"
```

An exported flow references global variables by name. The target instance needs variables with the same names, or the flow fails at run time.

### Run a flow file without the server

`lfx` executes flow JSON statelessly, with no database and no editor. It is included with Langflow 1.6 and later, or installed alone with `uv pip install lfx`.

```bash
lfx requirements faq-assistant.json            # Python packages the flow's components need
uv run lfx run faq-assistant.json "What is your refund policy?" --format json | jq '.result'

export LANGFLOW_API_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
uv run lfx serve faq-assistant.json            # prints the flow id, serves http://127.0.0.1:8000
curl -s -X POST "http://127.0.0.1:8000/flows/c1dab29d-3364-58ef-8fef-99311d32ee42/run" \
  -H "Content-Type: application/json" -H "x-api-key: $LANGFLOW_API_KEY" \
  -d '{"input_value": "What is your refund policy?"}'
```

### Expose flows to MCP clients

Every project is an MCP server at `/api/v1/mcp/project/$PROJECT_ID/streamable`, and each flow with a Chat Output component becomes a tool. Generate the client entry instead of typing the key into a file by hand:

```bash
PROJECT_ID="1415de42-8f01-4f36-bf34-539f23e47466"
jq -n --arg url "$LANGFLOW_URL/api/v1/mcp/project/$PROJECT_ID/streamable" --arg key "$LANGFLOW_API_KEY" \
  '{mcpServers: {"langflow-support": {command: "uvx",
    args: ["mcp-proxy", "--transport", "streamablehttp", "--headers", "x-api-key", $key, $url]}}}'
```

Merge the printed object into the client's MCP configuration, such as Cursor's `mcp.json`.

### Upgrade

```bash
# 1. Export every project as shown above, then dump the database
docker compose exec -T postgres pg_dump -U langflow langflow > "langflow-db-$(date +%Y%m%d).sql"

# 2. Set the new image tag in docker-compose.yml, then
docker compose pull
docker compose up -d

# Python installs: uv pip install langflow -U
```

Pending database migrations run at startup. If startup reports a schema mismatch, `uv run langflow migration` previews the required changes without applying them.

## Examples

### Example 1: Call a flow and keep the conversation

**Request:** "Ask our FAQ Assistant flow about refunds, then ask a follow-up in the same conversation."

```bash
ask() {
  curl -s -X POST "$LANGFLOW_URL/api/v1/run/faq-assistant?stream=false" \
    -H "Content-Type: application/json" -H "x-api-key: $LANGFLOW_API_KEY" \
    -d "$(jq -n --arg q "$1" '{input_value: $q, input_type: "chat", output_type: "chat", session_id: "customer-4821"}')" \
    | jq -r '.outputs[0].outputs[0].results.message.text'
}
ask "Can I get a refund on an annual plan?"
ask "And how long does it take to arrive?"
```

**Result:**

```text
Annual plans can be refunded in full within 30 days of purchase.
Refunds are returned to the original payment method within 5 to 7 business days.
```

The second answer resolves "it" because both calls share `session_id`.

### Example 2: Move a project to a new instance

**Request:** "Copy every flow from the old Langflow server to the new one before we switch DNS."

```bash
curl -s "https://flows-old.northwind.dev/api/v1/projects/download/1415de42-8f01-4f36-bf34-539f23e47466" \
  -H "x-api-key: $LANGFLOW_OLD_API_KEY" --output support-flows.zip

curl -s -X POST "https://flows.northwind.dev/api/v1/projects/upload/" \
  -H "x-api-key: $LANGFLOW_API_KEY" \
  -F "file=@support-flows.zip" | jq -r '.[] | "\(.id)  \(.name)"'
```

**Result:** the upload answers with the flows it created on the new instance:

```text
8d2f6c1e-5b7a-4f3d-9a60-2e1c7b4d9f05  FAQ Assistant
41b9e7a3-0c6d-4e82-b5f1-7a3d2c9e6b18  Ticket Router
```

Compare these ids with the ones callers use before switching traffic. Global variables are not part of the archive and have to be created on the new instance with the same names.

## Guidelines

- **Building flows is a browser task:** components are placed and wired on the canvas by a person. An agent can generate or edit flow JSON, but should validate it by importing it and running it once.
- **Auto-login is for local use only:** with `LANGFLOW_AUTO_LOGIN=True` every visitor acts as superuser. Any shared or public server needs `False`, a strong superuser password and a fixed `LANGFLOW_SECRET_KEY`.
- **API keys inherit the creator's rights:** a key made by a superuser can read and change every flow of that user. Keys created with `langflow api-key` are always superuser keys.
- **Exports can contain secrets:** a literal key typed into a component field is written into the exported JSON. Store credentials as global variables so only the variable name is exported, and review files before committing them.
- **Database location:** the default SQLite file lives inside the Python environment, so a new virtual environment starts empty. Set `LANGFLOW_DATABASE_URL` to PostgreSQL or an absolute SQLite path such as `sqlite:////var/lib/langflow/langflow.db`. Switching databases copies nothing; export flows first and import them afterwards.
- **Migrations:** `langflow migration --fix` can delete data. Run `langflow migration` first and keep a database backup.
- **Missing components after an upgrade:** since 1.12, `langflow` installs only a curated set of provider bundles. The error names the missing package; install it, for example `uv pip install lfx-exa`.
- **Webhooks need a key too:** webhook endpoints require the API key unless `LANGFLOW_WEBHOOK_AUTH_ENABLE=False`, which should stay enabled outside trusted networks.
- **Multiple workers:** running `--workers` above 1 needs a shared Redis job queue. Keep one worker unless that is configured.
- **When not to use:** if nobody needs a visual editor, calling a model SDK or an agent framework directly has fewer moving parts. For production serving of finished flows, `lfx serve` is lighter than the full server.
