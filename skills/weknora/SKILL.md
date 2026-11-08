---
name: weknora
description: >-
  WeKnora is Tencent's open-source knowledge base and RAG platform: it parses documents, indexes them for hybrid search, answers questions with citations, and runs agents over the same knowledge bases. Use this skill to self-host it with Docker Compose bound to localhost, point it at Ollama or a cloud model, create knowledge bases, upload documents and query them through the REST API or the weknora CLI. Triggers: "self-hosted RAG platform", "Tencent WeKnora", "private knowledge base with citations", "document Q&A server with an API", "weknora docker".
license: Apache-2.0
compatibility: "Docker with Compose v2 and Git, 8 GB RAM or more, a chat and an embedding model (Ollama or an API key); Go 1.26+ only to build the CLI"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "rag, knowledge-base, document-parsing, self-hosted, tencent"
  repository: https://github.com/Tencent/WeKnora
---

# WeKnora — a self-hosted knowledge base and RAG platform

## Overview

WeKnora (MIT licensed, Go backend, Vue web UI) turns a team's documents into a searchable knowledge base. Uploaded files (PDF, Word, Excel, images, Markdown and more) go through a separate `docreader` service, are chunked and embedded, and are served by hybrid retrieval (vector plus keyword, optional rerank). On top of that it offers cited Q&A, agents with tools and skills, an auto-generated wiki, and data-source sync from services such as Notion, Confluence, Feishu and GitLab. Models are swappable: Ollama, OpenAI-compatible endpoints and many other vendors.

This skill targets release `v0.9.0` (2026-10-29). The project moves fast, so read the release notes at `https://weknora.weixin.qq.com/docs/07-releases/v0.9.0` before upgrading and pin the version everywhere. The default Compose stack runs several containers: web frontend (port 80), backend API (port 8080), `docreader`, PostgreSQL (ParadeDB image) and Redis. Optional profiles add Neo4j, MinIO, Langfuse, Qdrant and others.

## Instructions

### Deploy with Docker Compose, localhost only

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Tencent/WeKnora.git
cd WeKnora || exit 1
cp .env.example .env
```

Edit `.env` (every variable has a comment; most comments are in Chinese):

```bash
WEKNORA_VERSION=v0.9.0            # image tag, with the v prefix; default is latest
JWT_SECRET=                       # fill with: openssl rand -hex 32
SYSTEM_AES_KEY=                   # fill with: openssl rand -hex 16 (exactly 32 ASCII bytes)
SYSTEM_SIGNING_KEY=               # fill with: openssl rand -hex 32
DB_PASSWORD=                      # replace the example password, and REDIS_PASSWORD too
OLLAMA_BASE_URL=http://host.docker.internal:11434   # only if Ollama runs on the host
```

`SYSTEM_AES_KEY` encrypts stored model and vector-store credentials. If it is lost or has the wrong length, those fields cannot be decrypted and must be re-entered, so keep it with your other secrets. The `.env.example` file ships example database and Redis passwords; change both before first start.

The shipped `docker-compose.yml` publishes the frontend and the API on all interfaces (`"${FRONTEND_PORT:-80}:80"` and `"${APP_PORT:-8080}:8080"`). Change those two lines to `"127.0.0.1:${FRONTEND_PORT:-80}:80"` and `"127.0.0.1:${APP_PORT:-8080}:8080"`. Do the same for any profile service you enable (MinIO, Neo4j, Qdrant and the others publish ports too). The README states the project expects an internal network deployment and warns against exposing it directly to the internet.

```bash
docker compose pull          # images match WEKNORA_VERSION
docker compose up -d         # core services
docker compose ps
```

Open `http://127.0.0.1` and complete the onboarding to create the first account. Once the people who need accounts have them, set `DISABLE_REGISTRATION=true` in `.env` and run `docker compose up -d` again. Optional services use profiles: `docker compose --profile neo4j --profile minio up -d` (profiles are `full`, `neo4j`, `minio`, `langfuse` and the vector-store ones listed in the compose file). Upgrade by changing `WEKNORA_VERSION`, then `docker compose pull && docker compose up -d`; `up -d` alone reuses cached images. `docker compose down` stops the stack and keeps the named volumes.

### Models

The stack ships with no model credentials. Add a chat model, an embedding model and optionally a rerank model in the web UI settings, or declare built-in ones in a YAML file (`config/builtin_models.yaml.example` in the repository shows the shape, including a "one local Ollama" section). For Ollama the model `name` is the Ollama model name, for example `nomic-embed-text` for embeddings, and the base URL is `OLLAMA_BASE_URL`. List what is configured, and get the ids a knowledge base needs, with `GET /api/v1/models`.

### Authenticate against the API

All business endpoints live under `/api/v1`. Two credentials work for scripts:

```bash
# JWT from the same account you use in the web UI
TOKEN=$(curl -s http://127.0.0.1:8080/api/v1/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$WEKNORA_EMAIL\",\"password\":\"$WEKNORA_PASSWORD\"}" | jq -r .token)
curl -s http://127.0.0.1:8080/api/v1/knowledge-bases -H "Authorization: Bearer $TOKEN"

# or a workspace API key (created in the UI or via POST /api/v1/tenants/{id}/api-keys)
curl -s http://127.0.0.1:8080/api/v1/knowledge-bases -H "X-API-Key: $WEKNORA_API_KEY"
```

The login response also carries `refresh_token`; `POST /api/v1/auth/refresh` issues a new token. Prefer a scoped API key for automation: keys can be limited to capabilities such as `retrieve`, `ingest` and `chat`, and to a list of knowledge bases. Keep both credentials in environment variables, never in commands you paste into shared logs.

### Knowledge bases, documents and search

Fields below come from the repository's `docs/swagger.yaml`.

```bash
API=http://127.0.0.1:8080/api/v1
# create a knowledge base (embedding_model_id and summary_model_id come from GET /models)
KB_ID=$(curl -s $API/knowledge-bases -H "X-API-Key: $WEKNORA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Vendor contracts","description":"Signed MSAs and DPAs","embedding_model_id":"model-nomic-embed","summary_model_id":"model-qwen3"}' | jq -r .data.id)
# upload a file (multipart; optional fields: fileName, metadata, tag_ids, process_config)
curl -s $API/knowledge-bases/$KB_ID/knowledge/file -H "X-API-Key: $WEKNORA_API_KEY" -F file=@msa-2026.pdf
# list documents and their parse status
curl -s $API/knowledge-bases/$KB_ID/knowledge -H "X-API-Key: $WEKNORA_API_KEY"
# retrieval only, no LLM summary: the same pipeline the product uses (recall, rerank, merge)
curl -s $API/knowledge-search -H "X-API-Key: $WEKNORA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"termination for convenience notice period","knowledge_base_ids":["'"$KB_ID"'"],"match_count":5}'
```

Responses wrap their payload as `{"success":true,"data":...}`. A duplicate upload returns `409`. Parsing runs in the background; `POST /knowledge/{id}/reparse` retries a failed document and `POST /knowledge/{id}/cancel-parse` stops one.

### Cited answers

```bash
SESSION=$(curl -s $API/sessions -H "X-API-Key: $WEKNORA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Contract questions"}' | jq -r .data.id)
curl -N $API/knowledge-chat/$SESSION -H "X-API-Key: $WEKNORA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"What notice period applies if we terminate the Northwind MSA?","knowledge_base_ids":["'"$KB_ID"'"]}'
```

The reply is a server-sent event stream (`text/event-stream`), so use `curl -N`. Add `?resource_urls=public` to get directly loadable file links instead of handles. The body can also scope the question to `knowledge_ids` or `tag_ids`, enable `web_search_enabled`, or pick `agent_id` and use `POST /api/v1/agent-chat/{session_id}` for agent runs.

### The weknora CLI

The repository ships a CLI designed for agents (`cli/`, no prebuilt binary is published; build it from source with Go 1.26+):

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Tencent/WeKnora.git weknora-src
cd weknora-src/cli || exit 1
go build -o weknora .
export WEKNORA_HOST=http://127.0.0.1:8080
export WEKNORA_API_KEY=your-workspace-key        # stateless auth: no profile or login file is written
./weknora doctor
./weknora kb list
./weknora link --kb vendor-contracts             # bind this folder to a knowledge base (writes .weknora/project.yaml here)
./weknora doc upload msa-2026.pdf
./weknora doc wait DOC_ID                        # exit 0 done, 1 failed, 124 timeout
./weknora search chunks "termination notice period"
./weknora chat "Summarise the liability cap in the Northwind MSA"
```

Every command takes `--format json` and returns an `{ok, data, meta?}` envelope on stdout; errors go to stderr with a typed code and an exit code (3 auth, 4 not found, 7 transient, 10 destructive write needs confirmation). Never add `-y` to a delete without the user's explicit go-ahead. `weknora schema` lists every command's contract, `weknora mcp serve` exposes a read-only MCP tool surface over stdio, and `weknora skills install` copies the CLI's own agent skills into `~/.claude/skills`.

## Examples

### Example 1: Private contract Q&A on one machine

**Request:** "Set up WeKnora so only this laptop can reach it, load our vendor contracts and let me ask questions with citations."

```bash
git clone --branch v0.9.0 --depth 1 https://github.com/Tencent/WeKnora.git && cd WeKnora || exit 1
cp .env.example .env
# set WEKNORA_VERSION=v0.9.0, JWT_SECRET, SYSTEM_AES_KEY, SYSTEM_SIGNING_KEY, DB_PASSWORD, REDIS_PASSWORD
# edit docker-compose.yml: 127.0.0.1 in front of the frontend and app port mappings
docker compose pull && docker compose up -d
```

Then create the account at `http://127.0.0.1`, add an Ollama chat model and `nomic-embed-text`, create the knowledge base `Vendor contracts`, upload `msa-2026.pdf`, wait until the document's parse status is completed and ask the question through `/knowledge-chat`.

**Result:** `docker compose ps` lists the frontend, app, docreader, postgres and redis containers as running; nothing listens on a public interface; the streamed answer cites chunks from the uploaded contract.

### Example 2: Retrieval endpoint for another agent

**Request:** "I only want passages back, my own agent writes the answer."

```bash
curl -s http://127.0.0.1:8080/api/v1/knowledge-search \
  -H "X-API-Key: $WEKNORA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"query":"data breach notification deadline","knowledge_base_ids":["'"$KB_ID"'"],"match_count":8,"rerank":true}' \
  | jq .
```

**Result:** a JSON object with the ranked chunks and their source documents (set `KB_ID` as in the knowledge-base step). Use a scoped API key with only the `retrieve` capability for this caller.

## Guidelines

- Run it on a private network or bound to `127.0.0.1`; the project itself warns against exposing the stack to the internet. Change the example database and Redis passwords and fill the three secret keys before first start.
- Pin `WEKNORA_VERSION` (for example `v0.9.0`, with the `v`). `latest` can move under you, and some releases need migrations; read the release notes' upgrade section first.
- Keep `SYSTEM_AES_KEY` stable across upgrades. Back up the PostgreSQL volume and the data-files volume together.
- The agent features (sandboxes, local browser, skills from external catalogs) execute code and act with the user's permissions. Leave them off unless needed and keep the execution mode read-only or confirm-before-change.
- Heavy for a single notebook of PDFs: five or more containers and several GB of images. For a lighter personal tool use a smaller notebook-style app; for a hosted-free quick test the project documents a "Lite" single-binary build, which this skill does not cover.
- Most of `.env.example` is commented in Chinese, and the best API reference is the Swagger file `docs/swagger.yaml` in the repository. When a field is unclear, read it there instead of guessing.
- Document formats and parsers differ by version: check a document's parse status after upload instead of assuming success.
