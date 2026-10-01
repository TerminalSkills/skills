---
name: worldmonitor
description: >-
  World Monitor is an open-source real-time global intelligence dashboard that
  aggregates news, conflict, market, maritime, aviation, cyber and
  infrastructure data and serves it through an MCP server, a REST API, a CLI
  and SDKs. Use when a user asks to query World Monitor from a script or an
  agent, get a country risk score or brief, pull conflict, cyber, sanctions or
  market feeds, connect the World Monitor MCP server, or self-host the
  dashboard.
license: Apache-2.0
compatibility: "CLI: Node.js 18.17+. Python SDK: Python 3.9+. Self-hosting: Node.js 22+ and Docker or Podman. Most data calls need a paid API key."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: [intelligence, news-aggregation, geopolitical, monitoring, dashboard]
  repository: https://github.com/koala73/worldmonitor
  use-cases:
    - "Pull a country risk score or strategic brief into a script or report"
    - "Give an AI agent live conflict, cyber, sanctions and market data over MCP"
    - "Self-host the World Monitor dashboard with your own data-source keys"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# World Monitor

## Overview

World Monitor (`koala73/worldmonitor`, AGPL-3.0) is a situational-awareness dashboard: curated news feeds synthesized into briefs, a 3D globe and flat map with shared layers, a Country Instability Index, market, energy, maritime and aviation panels. The same data is available to programs through four surfaces that all speak to one backend:

| Surface | Where | Use it for |
|---|---|---|
| MCP server | `https://worldmonitor.app/mcp` (Streamable HTTP) | Agents; the recommended surface — more than 80 tools in October 2026 |
| CLI | `worldmonitor` on npm (alias `wm`) | Shell scripts and CI; a thin wrapper over the MCP server |
| SDKs | `worldmonitor-sdk` (PyPI), `worldmonitor` (RubyGems), `github.com/koala73/worldmonitor/sdk/go` | Application code |
| REST API | `https://api.worldmonitor.app`, OpenAPI at `https://worldmonitor.app/openapi.yaml` | Endpoints MCP does not expose |

Listing tools is public. One data tool, `get_sources`, works without credentials; every other data call needs an API key (`wm_` plus 40 hex characters, from worldmonitor.app/pro) or an OAuth sign-in from an MCP client.

## Instructions

### CLI

```bash
npm install -g worldmonitor        # or run ad hoc: npx worldmonitor tools
worldmonitor tools                 # public: the live tool registry as JSON
worldmonitor list cyber            # public: REST operations of one service, from the OpenAPI spec

export WORLDMONITOR_API_KEY="wm_..."   # sent as the X-WorldMonitor-Key header
worldmonitor world                             # global situation brief
worldmonitor country IR                        # AI strategic brief, ISO 3166-1 alpha-2
worldmonitor risk DE                           # Country Instability Index and sanctions status
worldmonitor conflicts --country Sudan --limit 5
worldmonitor markets --asset_class crypto
worldmonitor news --topic cyber --alerts_only           # a bare --flag is sent as boolean true
```

Shortcuts exist for `world`, `country`, `risk`, `markets`, `conflicts`, `cyber`, `news`, `disasters`, `sanctions`, `forecasts` and `maritime`. Every other tool goes through `call`; any `--key value` that is not a CLI flag becomes a tool argument, and `--args` passes typed JSON:

```bash
worldmonitor call get_cyber_threats --min_severity high --limit 10
worldmonitor call get_market_data --args '{"symbols":["AAPL","MSFT"]}'
worldmonitor call describe_tool --tool_name get_country_risk     # full definition of one tool
worldmonitor get /api/cyber/v1/list-cyber-threats                # raw REST path
```

Flags: `--api-key`, `--mcp-url`, `--base-url`, `--args`, `--timeout <ms>` (default 30000), `--raw`, `--compact`. Exit codes: `0` success, `1` request or transport error (body on stderr), `2` usage error.

### Shrinking responses

Every tool accepts a `jmespath` argument that projects the response on the server; the projected value comes back under `structuredContent.projection`. Cache-backed tools wrap their payload as `{ "cached_at", "stale", "data" }` — `stale: true` means a contributing feed missed its freshness budget, so caveat the answer. List fields are capped at 30 items unless `limit` is set (`0` removes the cap); `summary: true` returns counts and three samples.

```bash
worldmonitor risk DE --jmespath '{score: cii.combinedScore, trend: cii.trend, advisory: advisoryLevel, sanctioned: sanctionsActive}'
```

### MCP server

```bash
# Claude Code — then run /mcp, pick worldmonitor, and sign in
claude mcp add --transport http worldmonitor https://worldmonitor.app/mcp

# With an API key instead of OAuth
claude mcp add --transport http worldmonitor https://worldmonitor.app/mcp \
  --header "X-WorldMonitor-Key: $WORLDMONITOR_API_KEY"
```

Claude Desktop and Cursor take `{"mcpServers": {"worldmonitor": {"url": "https://worldmonitor.app/mcp"}}}` in `claude_desktop_config.json` or `~/.cursor/mcp.json` and run the OAuth flow on first use. From a script, the server is plain JSON-RPC over HTTP:

```bash
curl -s https://worldmonitor.app/mcp \
  -H "X-WorldMonitor-Key: $WORLDMONITOR_API_KEY" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_country_risk","arguments":{"country_code":"DE"}}}'
```

The key goes in `X-WorldMonitor-Key`, never in `Authorization: Bearer` — that header is reserved for OAuth tokens and a key sent there returns `401 invalid_token`.

### Python SDK

```python
# pip install worldmonitor-sdk   (the PyPI package named "worldmonitor" is an unrelated project)
from worldmonitor_sdk import Client, MCPError

client = Client()                       # reads WORLDMONITOR_API_KEY; or Client(api_key="wm_...")
tools = client.list_tools()["tools"]    # public
risk = client.country_risk("DE")
events = client.conflict_events(country="Sudan", limit=5)
quotes = client.call_tool("get_market_data", asset_class="crypto")
```

Helpers: `world_brief`, `country_brief`, `country_risk`, `market_data`, `conflict_events`, `cyber_threats`, `news_intelligence`, `natural_disasters`, `sanctions_data`, `forecast_predictions`, `maritime_activity`, plus `call_tool`, `get("/api/...")` and `health()`. A missing or invalid key raises `MCPError` with code `-32001`. The Ruby and Go clients mirror the same surface.

### Running the dashboard yourself

```bash
git clone https://github.com/koala73/worldmonitor.git && cd worldmonitor
npm install
npm run dev            # http://localhost:3000 — set DEV_PORT in .env.local to change it
npm run dev:finance    # variants: dev:tech, dev:finance, dev:commodity, dev:happy, dev:energy
```

The dev server needs no environment variables; optional keys in `.env.example` unlock extra layers. For the full self-hosted stack (dashboard, relay, Redis), four secrets must exist before the containers start:

```bash
for name in RELAY_SHARED_SECRET REDIS_PASSWORD REDIS_TOKEN WM_SESSION_SECRET; do
  echo "$name=$(openssl rand -hex 32)" >> .env
done
docker compose up -d
./scripts/run-seeders.sh     # runs on the host, fills Redis from upstream sources
```

The dashboard is then at `http://localhost:3000` (`WM_PORT` changes it). Data-source and LLM keys (`GROQ_API_KEY`, `FINNHUB_API_KEY`, `NASA_FIRMS_API_KEY`, or `LLM_API_URL` for an OpenAI-compatible endpoint such as Ollama) go in a gitignored `docker-compose.override.yml`. The self-hosted MCP endpoint is `/api/mcp`; it accepts keys listed in `WORLDMONITOR_VALID_KEYS`, and point the CLI at it with `--mcp-url http://localhost:3000/api/mcp`.

## Examples

### Example 1: Check that the API is reachable, then read a country's risk

**User request:** "Set up the World Monitor CLI and tell me how unstable Germany is right now."

Confirm connectivity with the one call that needs no key:

```bash
npx worldmonitor call get_sources --view summary \
  --jmespath 'summary.{providers:providerCount,outlets:outletCount,tiers:outletsByTier}' --compact
```

```json
{"content":[{"type":"text","text":"{\"providers\":771,\"outlets\":519,\"tiers\":{\"1\":64,\"2\":240,\"3\":194,\"4\":21}}"}],"structuredContent":{"projection":{"providers":771,"outlets":519,"tiers":{"1":64,"2":240,"3":194,"4":21}}}}
```

Without a key, `npx worldmonitor risk DE` exits with status 1 and prints `Authentication required. Use OAuth (/oauth/token) or pass your API key via X-WorldMonitor-Key header.` Export `WORLDMONITOR_API_KEY` and run:

```bash
worldmonitor risk DE --jmespath '{score: cii.combinedScore, trend: cii.trend, advisory: advisoryLevel, sanctioned: sanctionsActive}'
```

The projection returns four fields: `score` is the Composite Instability Index on a 0–100 scale, `trend` its direction, `advisory` the travel advisory level and `sanctioned` a boolean. Report the score together with `cii.computedAt` when the user needs to know how fresh it is.

### Example 2: Morning conflict digest for a watchlist, posted to Slack

**User request:** "Every morning, post the deadliest conflict events in Sudan, Myanmar and Ukraine to our #geo-risk channel."

```python
# wm_digest.py — run from cron: 0 7 * * * /opt/geo/venv/bin/python /opt/geo/wm_digest.py
import json, os, urllib.request
from worldmonitor_sdk import Client, MCPError

WATCHLIST = ["Sudan", "Myanmar", "Ukraine"]
PROJECTION = ('{stale: stale, events: data."ucdp-events".events[]'
              '.{country: country, a: sideA, b: sideB, deaths: deathsBest}}')
client = Client()  # WORLDMONITOR_API_KEY

lines = []
for country in WATCHLIST:
    try:
        result = client.conflict_events(country=country, min_fatalities=5, limit=5, jmespath=PROJECTION)
    except MCPError as err:
        lines.append(f"{country}: lookup failed ({err.code})")
        continue
    view = result["structuredContent"]["projection"]
    flag = " (feed stale)" if view["stale"] else ""
    for e in view["events"] or []:
        lines.append(f"{e['country']}{flag}: {e['a']} vs {e['b']} — {e['deaths']} dead")

payload = json.dumps({"text": "\n".join(lines) or "No events above threshold."}).encode()
request = urllib.request.Request(os.environ["SLACK_WEBHOOK_URL"], data=payload,
                                 headers={"Content-Type": "application/json"})
urllib.request.urlopen(request, timeout=10)
```

Each run costs three tool calls. The Slack message has one line per event in the form `Sudan: <side A> vs <side B> — <deaths> dead`; a country with nothing above the threshold adds no lines.

## Guidelines

- **Budget the quota.** Pro includes 50 MCP calls per UTC day; API Starter 1,000 requests per day at 60 per minute; API Business 10,000 per day at 300 per minute. On the API plans MCP and REST draw on the same allowance, and tools that fetch live data cost more than one unit (`get_country_risk` 2, `get_country_brief` 3); Pro counts one per call. Beyond the allowance the API answers 429 until 00:00 UTC. Cache results and use `jmespath` rather than re-calling.
- **Anonymous limits.** `get_sources` allows 10 calls per minute per IP without a key; discovery (`tools/list`) 60 per minute.
- **Send a descriptive User-Agent to the REST API.** Without a `wm_` key, a request from `curl`, `python-requests` or a similar generic agent to an `/api/*` data path is rejected with `403 agent_request_blocked` (`/api/health` and `/api/version` are exempt); the CLI and SDKs set their own agent string.
- **Do not trust stale data silently.** Check `stale` and `cached_at`; the public status is at `https://api.worldmonitor.app/api/health?compact=1`.
- **Tool arguments change.** The registry is live — read `worldmonitor tools` or `describe_tool` instead of assuming a parameter; for example `get_cyber_threats` takes `min_severity` as `low`, `medium`, `high` or `critical`, not a number.
- **Keep keys server-side.** Never ship a `wm_` key in browser code, and never commit `.env` or `docker-compose.override.yml`.
- **Self-hosting security.** The stack refuses to start without the four secrets. Never set `I_UNDERSTAND_THIS_DISABLES_AUTH=true` on a host reachable from the internet, and keep the Redis REST proxy bound to `127.0.0.1`.
- **Licensing.** The platform is AGPL-3.0: a modified instance offered over a network must publish its source. The CLI and SDKs are MIT. Hosted data has redistribution limits by plan — building a customer-facing product on it needs API Business.
- **AI output is a starting point.** Briefs and forecasts (`get_country_brief`, `analyze_situation`, `generate_forecasts`) are model-generated; cite the underlying sources the response lists before acting on them.
- **When not to use it.** For a private feed of your own RSS sources with custom classification, a small pipeline you own is simpler than self-hosting the full stack.
