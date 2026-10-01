---
name: librechat
description: >-
  LibreChat is a self-hosted, ChatGPT-style web chat that puts OpenAI, Anthropic,
  Google, OpenRouter, Ollama and other providers behind one login, with agents,
  MCP tools, file search and per-user spending budgets. Use when deploying LibreChat
  with Docker Compose, editing librechat.yaml or .env, adding a custom endpoint,
  connecting MCP servers, closing registration or adding SSO, creating users, or
  updating an instance. Trigger phrases: "set up LibreChat", "self-hosted ChatGPT
  for the team", "add Claude and GPT to one chat UI", "add an MCP server to
  LibreChat", "update LibreChat".
license: Apache-2.0
compatibility: "Docker Engine with Docker Compose v2, Git; 4 GB RAM or more; x86_64 or arm64 (Apple Silicon needs an older MongoDB image)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["librechat", "self-hosted", "llm-chat", "mcp", "docker-compose"]
  repository: https://github.com/LibreChat-AI/LibreChat
---
# LibreChat — Self-Hosted Chat UI for Many Model Providers

## Overview

LibreChat is an open-source (MIT) web app that looks and works like ChatGPT but lets you plug in the models you choose: OpenAI, Anthropic, Google, Azure, Bedrock, and any OpenAI-compatible API (OpenRouter, Groq, Mistral, Ollama, vLLM). On top of plain chat it offers agents built in the UI, MCP tool servers, file upload with RAG, code execution, conversation search, presets and token balances per user.

A Docker Compose deployment runs five containers: the `api` app (port 3080), MongoDB for users and conversations, Meilisearch for search, pgvector plus `rag_api` for file search. Three files control it:

| File | Holds |
|------|-------|
| `.env` | Secrets and server switches: API keys, `CREDS_KEY`, `JWT_SECRET`, registration flags, SSO |
| `librechat.yaml` | Endpoints, custom providers, MCP servers, agents, interface, balances |
| `docker-compose.override.yml` | Your changes to the stock compose file, including the `librechat.yaml` mount |

Never edit `docker-compose.yml` itself; `git pull` overwrites it on update.

## Instructions

### Install with Docker Compose

```bash
git clone https://github.com/LibreChat-AI/LibreChat.git
cd LibreChat
cp .env.example .env
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d
```

Open `http://localhost:3080` and click **Register**. In a single-tenant install the first account registered becomes the admin; there are no default credentials. Check the app with `docker compose logs -f api`.

On Apple Silicon, MongoDB 8 crashes without AVX; pin an older image in the override:

```yaml
services:
  mongodb:
    image: mongo:4.4.18
```

### Keep the app ports off the public interface

The stock compose file publishes `api` on 3080 and `admin-panel` on 3000 on every interface. Docker writes its own iptables rules for published ports, so a ufw or firewalld rule does not close them. On a server behind a reverse proxy, rebind both to loopback in `docker-compose.override.yml`. A plain `ports:` list in an override is appended to the stock one, so use `!override`:

```yaml
services:
  api:
    ports: !override
      - "127.0.0.1:3080:3080"
  admin-panel:
    ports: !override
      - "127.0.0.1:3000:3000"
```

`docker compose config` should then show `host_ip: 127.0.0.1` and a single entry for each service.

### Set permanent secrets in .env

Blank `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET` and `JWT_REFRESH_SECRET` are generated into `/app/data/.env.temp` on first start. That is fine for a trial; for a real deployment generate fixed values once and store them in your secret manager, because user-provided API keys are encrypted with `CREDS_KEY` and changing it later does not re-encrypt them.

```bash
echo "CREDS_KEY=$(openssl rand -hex 32)"
echo "CREDS_IV=$(openssl rand -hex 16)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "MEILI_MASTER_KEY=$(openssl rand -hex 32)"
echo "ADMIN_PANEL_SESSION_SECRET=$(openssl rand -hex 32)"
```

Paste the output into `.env`. Search needs both `SEARCH=true` and a unique `MEILI_MASTER_KEY`. The current compose file also starts an `admin-panel` container on port 3000 that refuses to start without `ADMIN_PANEL_SESSION_SECRET`.

### Configure the built-in providers

Each built-in provider reads one key from `.env`. The shipped value `user_provided` makes every user paste their own key in the UI; replace it with a company key to share one. With the keys exported in your shell (OpenAI keys come from platform.openai.com/api-keys, Anthropic keys from console.anthropic.com):

```bash
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI_API_KEY}|" .env
sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" .env
sed -i "s|^DOMAIN_CLIENT=.*|DOMAIN_CLIENT=https://chat.brightpath.dev|" .env
sed -i "s|^DOMAIN_SERVER=.*|DOMAIN_SERVER=https://chat.brightpath.dev|" .env
echo "ENDPOINTS=openAI,anthropic,google,agents,custom" >> .env
```

`GOOGLE_KEY` stays `user_provided` here, so people who want Gemini bring their own key. `ENDPOINTS` controls which providers appear in the model selector and in what order. `DOMAIN_CLIENT` and `DOMAIN_SERVER` must match the public URL, or OAuth callbacks and links break.

### Add custom endpoints in librechat.yaml

Mount the file by uncommenting the volume in `docker-compose.override.yml`:

```yaml
services:
  api:
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
```

Any OpenAI-compatible API becomes a custom endpoint. `${VAR}` reads a value from `.env`:

```yaml
version: 1.3.17
cache: true
endpoints:
  custom:
    - name: 'OpenRouter'
      apiKey: '${OPENROUTER_KEY}'
      baseURL: 'https://openrouter.ai/api/v1'
      models:
        default: ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct']
        fetch: true
      titleConvo: true
      titleModel: 'meta-llama/llama-3.3-70b-instruct'
      dropParams: ['stop']
      modelDisplayLabel: 'OpenRouter'
    - name: 'Ollama'
      apiKey: 'ollama'
      baseURL: 'http://host.docker.internal:11434/v1/'
      models:
        default: ['qwen2.5-coder:14b', 'llama3.1:8b']
        fetch: true
      titleConvo: true
      titleModel: 'current_model'
```

`host.docker.internal` reaches services on the Docker host; the stock compose file already maps it. For an endpoint that speaks the native Anthropic Messages API, add `provider: 'anthropic'`. Apply config changes with a restart:

```bash
docker compose down && docker compose up -d
```

An endpoint block missing a required field is dropped without an error in the UI, and a `${VAR}` with no `.env` entry fails only when someone sends a message (`Missing API Key for OpenRouter`). Check `docker compose logs api` after every edit.

### Connect MCP servers

MCP tools show up in chat for built-in endpoints and can be attached to agents. Remote servers use `streamable-http` or `sse`; `stdio` servers run inside the `api` container, so the command must exist there (`npx` does, the image is Node based).

```yaml
mcpServers:
  github:
    type: streamable-http
    url: 'https://api.githubcopilot.com/mcp/'
    headers:
      Authorization: 'Bearer {{GITHUB_PAT}}'
    customUserVars:
      GITHUB_PAT:
        title: 'GitHub personal access token'
        description: 'Create one at github.com/settings/tokens with repo read access.'
    requiresOAuth: false
    startup: false
  thinking:
    type: stdio
    command: npx
    args:
      - -y
      - '@modelcontextprotocol/server-sequential-thinking'
    timeout: 60000
```

`{{GITHUB_PAT}}` is a per-user variable: each person saves their own token in the MCP panel and clicks reinitialize; `startup: false` stops LibreChat from connecting before anyone has a token. `requiresOAuth: false` matters for servers that use a static `Authorization` header: GitHub answers an unauthenticated probe with a `WWW-Authenticate: Bearer` challenge, and without the flag LibreChat may treat the server as OAuth-protected. `{{LIBRECHAT_USER_EMAIL}}` and `{{LIBRECHAT_USER_ID}}` pass the signed-in user to the server. SSRF protection blocks private addresses by default, so an MCP server on the host or LAN needs an exemption:

```yaml
mcpSettings:
  allowedAddresses:
    - 'host.docker.internal:8931'
```

### Agents and spending budgets

Users build agents in the Agent Builder (model, instructions, files, MCP tools). Limits live under `endpoints.agents`. `balance` caps spend per user in token credits, which are a money unit: 1,000,000 credits = $1 at LibreChat's per-model list rates (Claude Sonnet 4.5 costs 3 credits per input token and 15 per output token). This block gives everyone about $15 a month:

```yaml
endpoints:
  agents:
    recursionLimit: 30
    maxRecursionLimit: 60
    disableBuilder: false
balance:
  enabled: true
  startBalance: 15000000
  autoRefillEnabled: true
  refillIntervalValue: 30
  refillIntervalUnit: 'days'
  refillAmount: 15000000
```

A refill adds `refillAmount` to whatever is left, so unused credits carry over; it is a budget, not a hard monthly reset. An endpoint named OpenRouter gets its prices fetched from OpenRouter; other custom-endpoint models LibreChat has no rate for (Ollama, vLLM) are charged a default 6 credits per token unless you set `tokenConfig` on the endpoint.

### Users, registration and SSO

```bash
docker compose exec api npm run create-user -- dana.okafor@brightpath.dev "Dana Okafor" dokafor
docker compose exec api npm run list-users
docker compose exec api npm run add-balance dana.okafor@brightpath.dev 5000000
```

Run this way, `create-user` asks two questions: a password (blank generates one) and "Email verified? (Y/n)". That form is for a person at a terminal. From a script or an agent, disable the TTY with `-T` and pass both answers as arguments so nothing prompts:

```bash
PW=$(openssl rand -base64 18)
docker compose exec -T api npm run create-user -- dana.okafor@brightpath.dev "Dana Okafor" dokafor "$PW" --email-verified=true
```

The script warns that a password on the command line is insecure; hand the generated passwords over once and have people change them. To stop open sign-ups set `ALLOW_REGISTRATION=false` in `.env`. For SSO through an OpenID Connect provider (Keycloak, Entra ID, Authentik) set `ALLOW_SOCIAL_LOGIN=true`, `OPENID_ISSUER`, `OPENID_CLIENT_ID`, `OPENID_CLIENT_SECRET`, `OPENID_SESSION_SECRET`, `OPENID_SCOPE="openid profile email"` and `OPENID_CALLBACK_URL=/oauth/openid/callback`, register `https://chat.brightpath.dev/oauth/openid/callback` at the provider, and list `openid` under `registration.socialLogins` in `librechat.yaml`.

### Update

```bash
docker compose exec -T mongodb mongodump --db LibreChat --archive > librechat-$(date +%F).archive
docker compose down
git pull
docker compose pull
docker compose up -d
```

Read `UPGRADING.md` in the repo after `git pull`; some releases need a one-off migration command before the API restarts.

## Examples

### Example 1: One chat for a 25-person team over three providers

**User request:** "Stand up LibreChat on our VM at chat.brightpath.dev. GPT and Claude on company keys, OpenRouter for open models, no public sign-up, and cap each person at about $15 of model spend a month."

1. Clone, copy `.env.example`, generate the six secrets above and paste them in.
2. Run the `sed` lines from "Configure the built-in providers" with `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` exported, add `OPENROUTER_KEY` (created at openrouter.ai/keys) to `.env` the same way, and use `ENDPOINTS=openAI,anthropic,agents,custom`. Leave `ALLOW_REGISTRATION=true` for now.
3. `librechat.yaml` with the OpenRouter endpoint and the `balance` block from above (15000000 credits = $15); mount it and bind the ports to `127.0.0.1` in the override; `docker compose up -d`.
4. Register the admin account first, then set `ALLOW_REGISTRATION=false`, restart, and add the rest with the scripted `create-user` form.
5. Put a TLS proxy in front. Caddyfile:

```text
chat.brightpath.dev {
    reverse_proxy localhost:3080
}
```

Result: the model selector shows OpenAI, Anthropic and OpenRouter; each new user starts with 15,000,000 credits ($15) and gets 15,000,000 more every 30 days; the sign-up link is gone; ports 3080 and 3000 answer only on localhost.

### Example 2: Give engineers GitHub tools inside chat

**User request:** "Let engineers ask LibreChat about their GitHub issues and PRs, each with their own token."

1. Add the `github` server from the MCP section to `librechat.yaml` and restart.
2. Each engineer opens the MCP panel, saves a fine-grained token under **GitHub personal access token**, and clicks reinitialize; a toast confirms the connection.
3. In the Agent Builder, create "PR Triage" on `claude-sonnet-4-5`, add the GitHub MCP tools, and share it with the team.

Result: asking "list open PRs in brightpath/billing-api waiting on review" calls the GitHub tools with that user's own permissions; nobody shares one token.

## Guidelines

- The stock `docker-compose.yml` pulls `librechat-dev:latest`, built from the main branch. For numbered releases, set `image: registry.librechat.ai/librechat-ai/librechat:latest` in the override.
- MongoDB runs with `--noauth` and is not published outside the Docker network; keep it that way and never add a public `ports:` entry for it or Meilisearch.
- Do not reuse secrets from old `.env.example` copies: LibreChat refuses to start with the retired published JWT defaults.
- Back up MongoDB before each update and keep `CREDS_KEY`/`CREDS_IV` with the backup, or stored user keys become unreadable.
- `stdio` MCP servers run with the app's permissions inside the container; only add packages you trust, and prefer remote servers with per-user credentials.
- `balance` credits are USD-denominated (1,000,000 = $1) and charged at LibreChat's built-in per-model rates, which can lag behind provider price changes; it limits use per person but does not replace provider-side spend limits.
- A host firewall does not protect ports Docker publishes; bind them to `127.0.0.1` or use the cloud provider's firewall.
- Validate YAML before restarting (the docs site has a YAML checker); a bad file stops the `api` container.
- Choose Open WebUI instead when the goal is mainly a front end for local Ollama models; LibreChat's strength is many hosted providers, agents and MCP behind one login.
- It is not a hosted service: you own patching, backups and uptime. A team that cannot run Docker should use a hosted chat product instead.
