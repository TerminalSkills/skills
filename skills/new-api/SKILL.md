---
name: new-api
description: >-
  New API is a self-hosted AI gateway that puts many LLM providers behind one OpenAI-compatible endpoint, with a web console for channels, API keys, quotas and usage logs. Use when the user asks to "self-host an LLM gateway", "give each team its own API key and budget", "route requests across several upstream providers with failover", "deploy new-api", or "point an OpenAI client at my own gateway". Lawful use with your own upstream keys only.
license: Apache-2.0
compatibility: "Docker 24+ with Compose v2; optional PostgreSQL 15+ and Redis for production; Linux amd64 or arm64"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "llm-gateway, api-gateway, openai-compatible, self-hosted, usage-tracking"
  repository: https://github.com/QuantumNous/new-api
---
# New API — a self-hosted gateway for your LLM providers

## Overview

New API (QuantumNous, a project built on One API) is a Go service with an embedded web console. You add upstream providers as **channels** (OpenAI, Anthropic, Gemini, Azure OpenAI, Bedrock, Vertex AI, DeepSeek, Qwen and other compatible services), then issue **API keys** that clients use against a single base URL. The gateway handles model mapping, channel priority and weights, retries, per-key quotas, groups with price ratios, and usage logs.

It speaks OpenAI Chat Completions and Responses, Anthropic Messages (`/v1/messages`) and Gemini (`/v1beta/...`), plus embeddings, rerank, images and audio. What converts between protocols depends on the channel and upstream model.

It is a gateway you operate, not a library. If the user wants an in-process Python router, use the `litellm` skill instead. The agent's realistic jobs here are deploying the service, configuring it, and calling it. Initial setup (admin account, channels, keys) is done in the web console.

Use it only with upstream keys and accounts you are entitled to use, within each provider's terms. Offering it to the public as a resale service carries filing, licensing, tax and content-safety duties in many jurisdictions; the project README says to complete them first.

## Instructions

### Try it locally (SQLite)

Pin a release tag from the GitHub releases page instead of `latest`. `v1.0.0-rc.48` was the current tag when this skill was written and started cleanly in a test run.

```bash
mkdir -p data
docker run --name new-api -d --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e TZ=Europe/Berlin \
  -v "$(pwd)/data:/data" \
  calciumion/new-api:v1.0.0-rc.48
curl -s http://127.0.0.1:3000/api/setup
```

Right after the first start the setup endpoint answers `{"data":{"status":false,"root_init":false,"database_type":"sqlite"},"success":true}`. Open http://127.0.0.1:3000 and complete the wizard to create the administrator account. The SQLite file (`one-api.db`) lives in the mounted `data` directory, so keep that directory across container replacements. Without a valid key, `GET /v1/models` returns HTTP 401 with `"Invalid token"`, which confirms the relay is up.

If port 3000 is taken, change only the host side, for example `-p 127.0.0.1:3410:3000`.

### Production: Docker Compose with PostgreSQL and Redis

The repository's `docker-compose.yml` starts New API, PostgreSQL 15 and Redis. Its example passwords are placeholders that must be replaced.

```bash
git clone https://github.com/QuantumNous/new-api.git
cd new-api
git checkout v1.0.0-rc.48
openssl rand -hex 32          # use the output as SESSION_SECRET
```

Edit `docker-compose.yml` before the first start:

- Replace the Postgres password (`POSTGRES_PASSWORD`) and the one inside `SQL_DSN`.
- Replace the Redis `--requirepass` value and the one inside `REDIS_CONN_STRING`.
- Uncomment `SESSION_SECRET` and set it to the generated value.
- Change the image from `calciumion/new-api:latest` to the pinned tag.
- Behind HTTPS also set `SESSION_COOKIE_SECURE=true` and `SESSION_COOKIE_TRUSTED_URL` to the exact public origin, such as `https://llm.northwind.example` (no path, no wildcard).

```bash
docker compose up -d
docker compose logs -f new-api
```

The compose file maps port 3000 to all interfaces. Put it behind a reverse proxy with TLS, and change the mapping to `127.0.0.1:3000:3000` if the proxy runs on the same host. The proxy must allow streaming and WebSocket upgrades.

### Environment variables

| Variable | Purpose |
|---|---|
| `SQL_DSN` | Main database. Unset means SQLite. PostgreSQL: `postgresql://user:pw@host:5432/new-api`; MySQL: `user:pw@tcp(host:3306)/new-api` |
| `LOG_SQL_DSN` | Separate database for logs (ClickHouse also supported) |
| `REDIS_CONN_STRING` | `redis://:password@host:6379` |
| `SESSION_SECRET` | Persistent random secret; every node must share it |
| `CRYPTO_SECRET` | Defaults to `SESSION_SECRET` |
| `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_TRUSTED_URL` | HTTPS console hardening |
| `TRUSTED_PROXIES` | Reverse-proxy IPs/CIDRs, or `none` |
| `PORT`, `TZ`, `STREAMING_TIMEOUT` | Listen port, time zone, streaming timeout in seconds (source default 300) |

Setting variables only in `.env.example` does nothing for the container; put them under `environment:` or `env_file:` in Compose. Several nodes must share the same database, secrets and Redis, otherwise rate limits and sessions diverge.

### Configure channels, groups and keys (web console)

1. Add a channel per upstream: type, the upstream key from your provider's console, the model list, and a group. Run the channel test.
2. For fallback, add a second channel serving the same model name and give it a lower priority than the first (higher numbers are tried first); channels with equal priority share load by weight. A channel can also hold several upstream keys. Fallback only happens through retries: the retry count setting defaults to 0, and each retry moves to the next priority tier, so raise it to at least the number of fallback tiers (the source stores it as the `RetryTimes` option; the console label is not verified here). Which upstream status codes trigger a retry is configurable; by default most 4xx and 5xx codes do, except 400, 408, 504 and 524.
3. Use model mapping on a channel to expose your own stable names (for example `chat-default`) and point them at whatever the upstream calls the model.
4. Set prices under the ratio settings: a model ratio, a completion ratio for output tokens, and a group ratio. Quota is counted in points, with 1 USD equal to 500,000 points. Models without a configured ratio are rejected in billing mode.
5. Create one API key per team or application in the token page, with a quota, allowed models and the group.
6. Check spend in the usage logs and the dashboard.

Management endpoints exist under `/api/...` (channels, tokens, users), but they need an admin access token; treat the console as the primary interface.

### Call the gateway

Any OpenAI-compatible client works with `base_url` set to the gateway plus `/v1` and the New API-issued key (not the upstream key):

```python
import os
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:3000/v1", api_key=os.environ["NEW_API_KEY"])
reply = client.chat.completions.create(
    model="chat-default",
    messages=[{"role": "user", "content": "Summarise ticket #4821 in two sentences."}],
)
print(reply.choices[0].message.content)
```

```bash
curl --fail-with-body http://127.0.0.1:3000/v1/models \
  -H "Authorization: Bearer ${NEW_API_KEY}"
```

For the Responses API use `POST /v1/responses` with `{"model": "...", "input": "..."}`; Anthropic clients use `POST /v1/messages`.

## Examples

### Example 1 — a local gateway for one developer

Request: "Run a gateway on my laptop so my scripts use one key for OpenAI and Anthropic."

```bash
mkdir -p ~/llm-gateway/data && cd ~/llm-gateway
docker run --name new-api -d -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/data:/data" calciumion/new-api:v1.0.0-rc.48
```

The agent then asks the user to open http://127.0.0.1:3000, create the admin account, add an OpenAI channel and an Anthropic channel with keys read from the provider consoles, and create a key. The user exports it as `NEW_API_KEY`. Result: `curl http://127.0.0.1:3000/v1/models -H "Authorization: Bearer ${NEW_API_KEY}"` returns a JSON list with the models of both channels, and the Python snippet above prints a reply while the call appears in the usage logs.

### Example 2 — shared team gateway with failover and budgets

Request: "Our three teams call OpenAI directly. Put a gateway in front, fall back to Azure OpenAI when OpenAI fails, and cap each team."

```bash
git clone https://github.com/QuantumNous/new-api.git /srv/new-api
cd /srv/new-api && git checkout v1.0.0-rc.48
openssl rand -hex 32
```

The agent edits `docker-compose.yml` as described above (new passwords, `SESSION_SECRET`, pinned image, `127.0.0.1:3000:3000`), runs `docker compose up -d`, and checks `docker compose ps` for healthy containers. In the console the user adds an OpenAI channel (priority higher) and an Azure OpenAI channel (priority lower) serving the same model name, then creates keys `search-team`, `support-team` and `data-team`, each with its own quota. Clients change only `base_url` and key. Result: with the retry count raised to 1 or more, requests that fail on the primary channel are retried on the Azure channel, and the usage logs show spend per key.

## Guidelines

- Use only upstream keys you own or are authorized to use, and follow each provider's terms. Do not pool shared or purchased accounts, and do not resell access without meeting the legal duties.
- Pin the image tag. `latest` moves, and database migrations run on upgrade: back up the database and the `data` volume first and read the release notes.
- Never leave the example passwords or an empty `SESSION_SECRET` in a multi-node or internet-facing install. Do not expose port 3000 without TLS and a reverse proxy.
- Keys issued by New API are not upstream keys; hand teams the former only, and set quotas and model allow-lists on each.
- SQLite is for trials. Use PostgreSQL (preferred) or MySQL plus Redis for anything shared.
- Fallback only helps for models both channels actually serve; test each channel after adding it. Protocol conversion is best effort, so verify tools, reasoning fields and multimodal inputs on the exact model.
- Streaming and WebSocket (`/v1/realtime`) need proxy support and a compatible upstream.
- Not the right tool for a Python-only router inside an application (use `litellm`) or for a hosted service with no operations budget.
