---
name: open-webui
description: >-
  Open WebUI is a self-hosted web chat interface for local and cloud language
  models that connects to Ollama and any OpenAI-compatible API. Use when a
  user asks to install or deploy Open WebUI with Docker or pip, connect Open
  WebUI to Ollama, llama.cpp, vLLM or OpenAI, configure it with environment
  variables, create the admin account without a browser, call the Open WebUI
  API for chat completions or RAG, upload files to a knowledge base, export or
  sync custom models, or update and back up an Open WebUI instance.
license: Apache-2.0
compatibility: "Docker with the Compose v2 plugin, or Python 3.11 or 3.12 for the pip package (3.13 is not supported). The :cuda image needs an Nvidia GPU and the NVIDIA container toolkit. curl and jq for API calls."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["open-webui", "self-hosted", "chat-interface", "ollama", "rag"]
  repository: https://github.com/open-webui/open-webui
---
# Open WebUI — Self-hosted chat interface for local and cloud models

## Overview

Open WebUI puts a multi-user chat interface, knowledge bases (RAG), custom models and tools in front of Ollama and OpenAI-compatible backends. People chat in the browser. An agent deploys the container, sets connections and security through environment variables, creates the first admin account without a browser, drives the HTTP API for chat, files and knowledge bases, keeps model definitions in version control, and handles updates and backups.

## Instructions

### Installation

```bash
# Docker: UI on http://localhost:3000, data in the named volume open-webui
export WEBUI_SECRET_KEY="$(openssl rand -hex 32)"    # generate once and keep it
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  -e WEBUI_SECRET_KEY="$WEBUI_SECRET_KEY" \
  --name open-webui --restart always \
  ghcr.io/open-webui/open-webui:main

curl -s http://localhost:3000/health
# {"status":true}
```

```bash
# Python package: UI on http://localhost:8080
pip install open-webui
DATA_DIR="$HOME/.open-webui" open-webui serve --port 8080
```

| Image tag | Use |
|---|---|
| `:main` | Standard image, rolling build of the main branch (`:latest` is the same image) |
| `:v0.11.4` | Pinned release; use pinned tags in production |
| `:slim` | Small image without local embedding, speech and document-extraction runtimes |
| `:cuda` | Nvidia GPU support for the built-in embedding and speech models; add `--gpus all` |
| `:ollama` | Bundles Ollama in the same container; add `-v ollama:/root/.ollama` |
| `:dev` | Pre-release build; give it its own volume and port |

### Deploy with Docker Compose

```yaml
# docker-compose.yml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.11.4
    container_name: open-webui
    ports:
      - "3000:8080"
    volumes:
      - open-webui:/app/backend/data
    extra_hosts:
      - host.docker.internal:host-gateway
    environment:
      - WEBUI_SECRET_KEY=${WEBUI_SECRET_KEY}
      - WEBUI_ADMIN_EMAIL=${WEBUI_ADMIN_EMAIL}
      - WEBUI_ADMIN_PASSWORD=${WEBUI_ADMIN_PASSWORD}
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - ENABLE_API_KEYS=True
    restart: unless-stopped

volumes:
  open-webui:
```

```bash
printf 'WEBUI_SECRET_KEY=%s\nWEBUI_ADMIN_EMAIL=%s\nWEBUI_ADMIN_PASSWORD=%s\n' \
  "$(openssl rand -hex 32)" "ops@northwind.dev" "$(openssl rand -hex 16)" > .env
chmod 600 .env
docker compose up -d
docker compose logs --tail 50 open-webui
```

`WEBUI_ADMIN_EMAIL` and `WEBUI_ADMIN_PASSWORD` create the administrator on the first start of an empty database and switch sign-up off. Without them, the first person who opens the page and registers becomes the administrator.

### Connect model backends

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` in Docker | Ollama server; `OLLAMA_BASE_URLS` takes several, separated by `;` |
| `OPENAI_API_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible server; `OPENAI_API_BASE_URLS` for several |
| `OPENAI_API_KEY` | none | Key for that server; `OPENAI_API_KEYS` takes several, separated by `;` |
| `ENABLE_OLLAMA_API`, `ENABLE_OPENAI_API` | `True` | Switch a backend type off |

```yaml
# environment entries for llama.cpp, vLLM or LiteLLM on the host; the URL must end in /v1
      - OPENAI_API_BASE_URL=http://host.docker.internal:8080/v1
      - OPENAI_API_KEY=${LLAMA_API_KEY}
```

If the container cannot reach a service on the host, run it with `--network=host` and `-e OLLAMA_BASE_URL=http://127.0.0.1:11434`; the UI then listens on port 8080 instead of 3000.

### Other settings

| Variable | Default | Purpose |
|---|---|---|
| `WEBUI_SECRET_KEY` | generated | Signs sessions and encrypts stored secrets; a new value signs everyone out |
| `ENABLE_SIGNUP` | `True` | Account creation; disabled automatically after the first user registers |
| `DEFAULT_USER_ROLE` | `pending` | Role for new accounts: `pending`, `user` or `admin` |
| `ENABLE_API_KEYS` | `False` | Allows API keys to be created and used |
| `ENABLE_PERSISTENT_CONFIG` | `True` | `False` makes environment variables win over values saved in the admin panel |
| `CORS_ALLOW_ORIGIN` | `*` | Allowed origins, separated by `;`; set it to the real URLs behind a proxy |
| `DATABASE_URL` | `sqlite:///${DATA_DIR}/webui.db` | SQLite or PostgreSQL connection URL |
| `OFFLINE_MODE` | `False` | No update checks and no model downloads |
| `ENV` | `prod` in Docker | `dev` serves the Swagger UI at `/docs` |

Many settings, including the connection URLs, `ENABLE_SIGNUP` and `ENABLE_API_KEYS`, are persistent: after the first start the value stored in the database wins over the environment variable.

### Get an API key

API keys must be enabled (`ENABLE_API_KEYS=True`). A user creates the key under Settings → Account. On a headless server, sign in with the admin credentials and request the key over the same endpoints the web interface uses:

```bash
export OPEN_WEBUI_URL="http://localhost:3000"
TOKEN=$(curl -s -X POST "$OPEN_WEBUI_URL/api/v1/auths/signin" -H "Content-Type: application/json" \
  -d "$(jq -n --arg e "$WEBUI_ADMIN_EMAIL" --arg p "$WEBUI_ADMIN_PASSWORD" '{email: $e, password: $p}')" | jq -r .token)

export OPEN_WEBUI_API_KEY=$(curl -s -X POST "$OPEN_WEBUI_URL/api/v1/auths/api_key" \
  -H "Authorization: Bearer $TOKEN" | jq -r .api_key)
```

An account holds exactly one key, so this call replaces an existing key of that account.

### Chat through the API

```bash
curl -s "$OPEN_WEBUI_URL/api/models" -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" | jq -r '.data[].id'

curl -s -X POST "$OPEN_WEBUI_URL/api/chat/completions" \
  -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "llama3.1:8b", "messages": [{"role": "user", "content": "Why is the sky blue?"}]}' \
  | jq -r '.choices[0].message.content'
```

The endpoint follows the OpenAI chat completions format, so OpenAI-compatible clients work with the base URL `http://localhost:3000/api`. Anthropic-format clients use `POST /api/v1/messages`. Native Ollama routes are proxied under `/ollama`, for example `/ollama/api/tags` and `/ollama/api/embed`.

### Build a knowledge base through the API

```python
import os
import time
import requests

base = os.environ["OPEN_WEBUI_URL"]
auth = {"Authorization": f"Bearer {os.environ['OPEN_WEBUI_API_KEY']}"}

kb = requests.post(f"{base}/api/v1/knowledge/create", headers=auth,
                   json={"name": "Employee Handbook", "description": "HR policies 2026"}).json()

with open("employee-handbook-2026.pdf", "rb") as f:
    file_id = requests.post(f"{base}/api/v1/files/", headers=auth, files={"file": f}).json()["id"]

# Extraction and embedding run in the background; adding the file too early returns HTTP 400
while True:
    status = requests.get(f"{base}/api/v1/files/{file_id}/process/status", headers=auth).json()
    if status["status"] == "completed":
        break
    if status["status"] == "failed":
        raise RuntimeError(status.get("error"))
    time.sleep(2)

requests.post(f"{base}/api/v1/knowledge/{kb['id']}/file/add", headers=auth,
              json={"file_id": file_id}).raise_for_status()

answer = requests.post(f"{base}/api/chat/completions", headers=auth, json={
    "model": "llama3.1:8b",
    "messages": [{"role": "user", "content": "How many vacation days do new employees get?"}],
    "files": [{"type": "collection", "id": kb["id"]}],
}).json()
print(answer["choices"][0]["message"]["content"])
```

A single uploaded file is referenced with `{"type": "file", "id": "..."}` instead of a collection.

### Keep custom models in version control

```bash
curl -s "$OPEN_WEBUI_URL/api/v1/models/export" \
  -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" > models.json

# Additive: creates and updates, never deletes
curl -s -X POST "$OPEN_WEBUI_URL/api/v1/models/import" \
  -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" -H "Content-Type: application/json" \
  -d "{\"models\": $(cat models.json)}"
```

`POST /api/v1/models/sync` takes the same body but makes the instance match the file exactly, which deletes every model that is not in it. It is admin-only; use it only when that is the intent.

### Update, back up and roll back

```bash
# Backup of the whole data volume (database, uploads, vector store)
docker run --rm -v open-webui:/data -v "$(pwd)":/backup alpine \
  tar czf "/backup/openwebui-$(date +%Y%m%d).tar.gz" /data

# Update a Compose deployment: change the image tag, then
docker compose pull
docker compose up -d
docker logs open-webui 2>&1 | head -20        # pip installs: pip install -U open-webui
```

To restore, extract the archive into a new empty volume and start a container with `-v open-webui-restored:/app/backend/data`. The old volume stays untouched until the restore is verified:

```bash
docker volume create open-webui-restored
docker run --rm -v open-webui-restored:/data -v "$(pwd)":/backup alpine \
  tar xzf /backup/openwebui-20260929.tar.gz -C /
```

## Examples

### Example 1: Headless deployment next to an existing Ollama

**Request:** "Put Open WebUI on this server, connect it to the Ollama that already runs here, and give me an API key for our scripts."

Write the `docker-compose.yml` and `.env` from "Deploy with Docker Compose", start the stack, load the admin credentials, run the two commands from "Get an API key", and list the models:

```bash
docker compose up -d
until curl -sf http://localhost:3000/health > /dev/null; do sleep 2; done
set -a; . ./.env; set +a          # WEBUI_ADMIN_EMAIL and WEBUI_ADMIN_PASSWORD for the sign-in call
curl -s "$OPEN_WEBUI_URL/api/models" -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" | jq -r '.data[].id'
```

**Result:** the models that Ollama serves are listed, which proves both the key and the connection:

```text
llama3.1:8b
qwen2.5-coder:7b
nomic-embed-text:latest
```

### Example 2: Ask a question against a PDF

**Request:** "Load employee-handbook-2026.pdf into a knowledge base and ask how many vacation days new employees get."

Run the Python script from "Build a knowledge base through the API".

**Result:**

```text
New employees receive 25 vacation days per calendar year, prorated from their start date (section 4.2).
```

## Guidelines

- **Always mount the data volume:** without `-v open-webui:/app/backend/data`, chats, users and settings are lost when the container is recreated.
- **Fix the secret key:** without a constant `WEBUI_SECRET_KEY`, every recreated container signs all users out and cannot decrypt stored secrets.
- **Claim the admin account before exposing the server:** the first registered user becomes administrator. Set the admin variables, or register before the port is reachable from outside.
- **`WEBUI_AUTH=False` is permanent:** single-user mode only works on a fresh installation and cannot be switched back. Never use it on a network-reachable server.
- **Environment changes that seem ignored:** persistent settings are read from the database after the first start. Change them in the admin panel or start with `ENABLE_PERSISTENT_CONFIG=False`.
- **One API key per account:** create a separate non-admin account for each integration, and keep keys in environment variables. Keys do not expire and must be rotated by hand.
- **Pin versions in production:** `:main` and `:latest` move with every merge. Use `:vX.Y.Z`, read the release notes, and back up first, because database migrations cannot be undone by starting an older image.
- **Never share a volume between `:dev` and a release image:** newer migrations can make the data unreadable for the release.
- **Copying the SQLite file:** stop the container first. The database runs in WAL mode, so a copy of `webui.db` from a running instance can miss recent writes.
- **Scale with replicas, not workers:** keep `UVICORN_WORKERS=1`. Several instances need PostgreSQL, Redis and an external vector database.
- **License:** the Open WebUI License requires the "Open WebUI" branding to be preserved. Check the license file before rebranding.
- **When not to use:** if scripts only need a model endpoint and nobody needs a chat interface, call Ollama or llama.cpp directly.
