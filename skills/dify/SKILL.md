---
name: dify
description: >-
  Dify is an open-source platform for building LLM apps such as chatbots,
  agents, workflows and RAG knowledge bases, and it exposes every published
  app as a REST API. Use when a user asks to self-host Dify with Docker
  Compose, configure Dify environment variables, call a Dify app or workflow
  API, upload documents to a Dify knowledge base, export or import a Dify DSL
  file, run a Dify app from the terminal with difyctl, or upgrade and back up
  a Dify instance.
license: Apache-2.0
compatibility: "Docker 19.03+ with Docker Compose 2.24.0+, at least 2 CPU cores and 4 GiB RAM. git, curl and jq for setup and API calls. difyctl needs Dify 1.15.0+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["dify", "llm-apps", "rag", "workflow-api", "self-hosted"]
  repository: https://github.com/langgenius/dify
---
# Dify — Self-hosted LLM app platform with a REST API

## Overview

Dify combines a visual workflow builder, agents, model management and RAG knowledge bases in one web console. People design apps in the browser; an agent works with Dify from the terminal by deploying the Docker Compose stack, editing its environment files, calling the Service API of published apps and knowledge bases, moving app definitions (DSL YAML) between instances with `difyctl`, and handling upgrades and backups.

## Instructions

### Installation

```bash
# Clone the latest release tag (needs git, curl, jq)
git clone --branch "$(curl -s https://api.github.com/repos/langgenius/dify/releases/latest | jq -r .tag_name)" \
  https://github.com/langgenius/dify.git

cd dify/docker
cp .env.example .env
docker compose version        # must report 2.24.0 or later
docker compose up -d
docker compose ps
```

Every container should be `Up` or `healthy`; `init_permissions` exits after it has set storage permissions, which is expected. If the clone fails with `Remote branch null not found`, the GitHub API call was rate limited: pass the tag directly, for example `--branch 1.17.1`.

The first administrator account is created in a browser at `http://localhost/install`. That step, adding model provider credentials, and creating API keys are done by a person in the console. Ask the user to do them and to hand over keys through environment variables.

### Configure the deployment

Essential settings live in `docker/.env`. Optional, provider-specific settings have templates under `docker/envs/`; copy one without the `.example` suffix to activate it. Values in `docker/.env` override the `envs/*.env` files.

| Variable | Default | Purpose |
|---|---|---|
| `EXPOSE_NGINX_PORT` / `EXPOSE_NGINX_SSL_PORT` | `80` / `443` | Host ports of the bundled Nginx |
| `NEXT_PUBLIC_SOCKET_URL` | `ws://localhost` | Browser WebSocket endpoint; change it together with the host or port |
| `INIT_PASSWORD` | empty | Password (30 characters at most) required on `/install` before the admin account can be created |
| `SECRET_KEY` | empty | Signs sessions and file URLs; empty means a persistent key is generated in storage |
| `DB_PASSWORD`, `REDIS_PASSWORD` | `difyai123456` | Change before the first start; `CELERY_BROKER_URL` embeds the Redis password |
| `CONSOLE_API_URL`, `CONSOLE_WEB_URL`, `SERVICE_API_URL`, `APP_API_URL`, `APP_WEB_URL` | empty | Public URLs; set them for custom domains, HTTPS or split subdomains |
| `NGINX_HTTPS_ENABLED` | `false` | Serve TLS with certificates placed in `docker/nginx/ssl/` |
| `VECTOR_STORE` | `weaviate` | Vector database; also selects the Compose profile that starts it |
| `UPLOAD_FILE_SIZE_LIMIT` | `15` | Maximum document size in MB |
| `SSRF_PROXY_ALLOW_PRIVATE_IPS` | empty | CIDR ranges that HTTP nodes and tools may reach inside private networks |
| `OPENAPI_ENABLED`, `ENABLE_OAUTH_BEARER` | `false` | Both must be `true` before `difyctl` can sign in |

```bash
cd dify/docker
cp envs/vectorstores/qdrant.env.example envs/vectorstores/qdrant.env   # optional template
docker compose down
docker compose up -d                                                   # apply changes
docker compose logs --tail 100 api worker
```

### Call a published app

Each app has its own API key, which a person creates inside that app in the console. The base URL of a default self-hosted deployment is `http://localhost/v1`; Dify Cloud uses `https://api.dify.ai/v1`.

```bash
export DIFY_API_URL="http://localhost/v1"
# DIFY_API_KEY is an app key created by the user in the console

curl -s "$DIFY_API_URL/info" -H "Authorization: Bearer $DIFY_API_KEY"
curl -s "$DIFY_API_URL/parameters" -H "Authorization: Bearer $DIFY_API_KEY" | jq .user_input_form

# Chatbot and Chatflow apps (Agent apps use the same endpoint with "streaming")
curl -s -X POST "$DIFY_API_URL/chat-messages" \
  -H "Authorization: Bearer $DIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs": {}, "query": "How do I reset my password?", "user": "customer-4821", "response_mode": "blocking"}'

# Workflow apps
curl -s -X POST "$DIFY_API_URL/workflows/run" \
  -H "Authorization: Bearer $DIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs": {"ticket_text": "Card was charged twice for order 88213"}, "user": "support-bot", "response_mode": "blocking"}'
```

`GET /parameters` lists the input variable names an app expects. To continue a chat, send the `conversation_id` from the previous reply. `response_mode` is `blocking` (one JSON body) or `streaming` (Server-Sent Events); Agent apps only stream.

```python
import json
import os
import requests

url = f"{os.environ['DIFY_API_URL']}/chat-messages"
headers = {"Authorization": f"Bearer {os.environ['DIFY_API_KEY']}"}
body = {"inputs": {}, "query": "Summarize this week's refund requests",
        "user": "analyst-17", "response_mode": "streaming"}

with requests.post(url, headers=headers, json=body, stream=True, timeout=120) as r:
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue                      # blank separators and "event: ping"
        event = json.loads(line[6:])
        if event["event"] == "message":   # Agent apps send "agent_message" chunks instead
            print(event["answer"], end="", flush=True)
        elif event["event"] == "error":
            raise RuntimeError(event["message"])
```

Files go through `POST /files/upload` (multipart fields `file` and `user`). Reference the returned `id` in an input as `{"type": "document", "transfer_method": "local_file", "upload_file_id": "..."}`.

### Manage knowledge bases

Knowledge endpoints use a separate key, created under Knowledge → Service API. It can be scoped to specific knowledge bases.

```bash
# DIFY_DATASET_KEY is a knowledge base key created by the user in the console

DATASET_ID=$(curl -s -X POST "$DIFY_API_URL/datasets" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Support KB", "indexing_technique": "high_quality", "permission": "all_team_members"}' | jq -r .id)

BATCH=$(curl -s -X POST "$DIFY_API_URL/datasets/$DATASET_ID/document/create-by-file" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" \
  -F 'data={"indexing_technique":"high_quality","process_rule":{"mode":"automatic"}}' \
  -F "file=@support-kb.pdf" | jq -r .batch)

# Indexing is asynchronous: waiting, parsing, cleaning, splitting, indexing, completed
curl -s "$DIFY_API_URL/datasets/$DATASET_ID/documents/$BATCH/indexing-status" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" | jq '.data[] | {indexing_status, completed_segments, total_segments}'

curl -s -X POST "$DIFY_API_URL/datasets/$DATASET_ID/retrieve" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" -H "Content-Type: application/json" \
  -d '{"query": "refund window for annual plans", "retrieval_model": {"search_method": "semantic_search", "reranking_enable": false, "top_k": 3, "score_threshold_enabled": false}}'
```

### Export, import and run apps with difyctl

`difyctl` ships with each Dify release. Install the build that matches the server version, and enable `OPENAPI_ENABLED=true` and `ENABLE_OAUTH_BEARER=true` in `docker/.env` on self-hosted servers.

```bash
DIFY_VERSION=1.17.1
BASE="https://github.com/langgenius/dify/releases/download/$DIFY_VERSION"
curl -fsSLO "$BASE/difyctl-v$DIFY_VERSION-linux-x64"
curl -fsSLO "$BASE/difyctl-v$DIFY_VERSION-checksums.txt"
sha256sum --check --ignore-missing "difyctl-v$DIFY_VERSION-checksums.txt"
install -m 0755 "difyctl-v$DIFY_VERSION-linux-x64" "$HOME/.local/bin/difyctl"
difyctl version
```

```bash
# Device-flow login: prints a one-time code that the user approves in a browser
difyctl auth login --host http://localhost --insecure --no-browser

difyctl get app --mode workflow                  # table: NAME, ID, MODE, UPDATED
difyctl describe app 7f3e9a2b-1c4d-4e8f-9a0b-2d5c8e1f4a7b -o json | jq '.input_schema'
difyctl run app 7f3e9a2b-1c4d-4e8f-9a0b-2d5c8e1f4a7b --inputs '{"topic":"quarterly report"}' -o json

difyctl export studio-app 7f3e9a2b-1c4d-4e8f-9a0b-2d5c8e1f4a7b --output ./daily-report.yaml
difyctl import studio-app --from-file ./daily-report.yaml --name "Daily Report (staging)"
```

`--insecure` is only needed for plain `http://` or self-signed hosts. Exit code `4` means the session expired and a person must sign in again; `7` means rate limited.

### Back up and upgrade

```bash
cd dify/docker
docker compose exec -T db_postgres pg_dump -U postgres dify > "dify-db-$(date +%Y%m%d).sql"

docker compose down
cp .env "env-backup-$(date +%Y%m%d)"
docker run --rm -v "$PWD/volumes:/data:ro" -v "$PWD:/backup" alpine \
  tar czf "/backup/dify-volumes-$(date +%Y%m%d).tar.gz" -C /data .

git fetch --tags
git checkout 1.17.1              # tag of the target release
docker compose pull
docker compose up -d
```

Database migrations run automatically on start. After an upgrade, compare `.env.example` with `.env` for new variables, or run `./dify-env-sync.sh`, which adds missing keys and keeps existing values. Read the upgrade guide of the target release first, because some releases need manual steps.

## Examples

### Example 1: Run a published workflow from a script

**Request:** "Send this ticket through our Support Triage workflow and give me the category it returns."

```bash
curl -s "$DIFY_API_URL/parameters" -H "Authorization: Bearer $DIFY_API_KEY" | jq -c '.user_input_form'
curl -s -X POST "$DIFY_API_URL/workflows/run" \
  -H "Authorization: Bearer $DIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs": {"ticket_text": "I was charged twice for order 88213 and need one payment refunded."},
       "user": "support-bot", "response_mode": "blocking"}' | jq '.data | {status, outputs, elapsed_time, total_tokens}'
```

**Result:**

```json
{
  "status": "succeeded",
  "outputs": {"category": "billing", "priority": "high"},
  "elapsed_time": 1.84,
  "total_tokens": 412
}
```

### Example 2: Load a PDF into a new knowledge base

**Request:** "Create a knowledge base from support-kb.pdf and confirm that retrieval finds the refund policy."

Run the four commands from "Manage knowledge bases", repeating the status call until it reports `completed`:

```json
{"indexing_status": "completed", "completed_segments": 42, "total_segments": 42}
```

The retrieval call then returns ranked chunks:

```json
{
  "query": {"content": "refund window for annual plans"},
  "records": [
    {"score": 0.87, "segment": {"content": "Annual plans can be refunded within 30 days of purchase...",
                                "document": {"name": "support-kb.pdf"}}}
  ]
}
```

## Guidelines

- **Two kinds of keys:** app keys call app endpoints, knowledge base keys call `/datasets`. Using the wrong one returns `401 unauthorized`; a scoped knowledge key returns `403 forbidden` for other knowledge bases. Keep both on the server side.
- **Keep `user` stable:** conversations, uploaded files and resumable workflow streams are tied to the `user` value. Reuse the same value for upload, send, stop and resume.
- **Prefer streaming for long runs:** proxies cut long blocking requests. With `curl`, add `-N` so events print as they arrive.
- **Do not retry configuration errors:** `provider_not_initialize`, `provider_quota_exceeded` and `model_currently_not_support` mean the model setup in Dify is wrong. Retry only `too_many_requests`, HTTP 500 and network failures, with backoff.
- **Secrets at first start:** replace the default database and Redis passwords before the first `docker compose up`, and never change `SECRET_KEY` on a running deployment. Changing it signs out every user and makes stored OAuth credentials unreadable.
- **Public servers:** set `INIT_PASSWORD` before exposing `/install`, enable HTTPS, and update the URL variables to `https://`.
- **Containers cannot reach `127.0.0.1` on the host:** point model providers at the host's LAN address, and allow private ranges with `SSRF_PROXY_ALLOW_PRIVATE_IPS` when HTTP nodes must reach internal services.
- **DSL files:** an export contains the app definition but no knowledge base content and no third-party tool keys. `--include-secret` adds encrypted secret values, so treat that file as sensitive. Workflow exports and imports use the draft; publish in the console before API calls see the change.
- **Stop the vector store gracefully:** use `docker compose down` or `docker compose stop`, never `docker kill`, on the bundled Weaviate. A hard stop can damage the vector index.
- **License:** Dify uses the Dify Open Source License, which is Apache 2.0 with additional conditions. Read it before offering Dify as a hosted service.
- **When not to use:** for LLM calls embedded in application code, a library such as LangChain is lighter. Dify fits when non-developers need to edit flows in a browser and you want an API on top.
