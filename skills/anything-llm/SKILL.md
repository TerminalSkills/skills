---
name: anything-llm
description: >-
  All-in-one private AI app that chats with your own documents in workspaces, using any local or hosted LLM, a built-in vector database and a developer REST API. Use when someone asks to "run AnythingLLM in Docker", "chat with my PDFs privately", "create a workspace and upload documents through the API", "generate an AnythingLLM API key", or "connect AnythingLLM to Ollama".
license: Apache-2.0
compatibility: "Docker (Linux, macOS, Windows) with 2 GB RAM or more and 10 GB disk, or the desktop app for Mac, Windows and Linux; an LLM provider or a local model server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "rag, document-chat, self-hosted, local-llm, workspaces"
  repository: https://github.com/Mintplex-Labs/anything-llm
---

# AnythingLLM — private document chat with workspaces

## Overview

AnythingLLM is a full application, not a library. You upload documents (PDF, Word, text, web pages and more) into a workspace, the app splits and embeds them into a vector database (LanceDB by default), and a chat in that workspace answers from the documents with sources. Models are pluggable: local servers such as Ollama or hosted APIs for the chat model, and a built-in embedder that runs inside the app by default. It runs as a desktop app or as a Docker container with multi-user support, and it exposes a developer REST API under `/api/v1` that is documented with Swagger in the running app.

An agent can realistically do the following: start the container, configure its environment, create an API key, then create workspaces, upload or embed documents and query them over HTTP. First-run onboarding, choosing the chat model and setting an admin password are done in the web UI.

## Instructions

### Run with Docker

The official image is `mintplexlabs/anythingllm` (about 1.1 GB, amd64 and arm64). Pin a version tag rather than `latest` (the tags listed on Docker Hub include `1.19.0`). The container needs the `SYS_ADMIN` capability, the storage folder mounted at `/app/server/storage`, and `STORAGE_DIR` pointing to it. Bind the published port to the loopback interface:

```bash
export STORAGE_LOCATION=$HOME/anythingllm
mkdir -p "$STORAGE_LOCATION"
touch "$STORAGE_LOCATION/.env"
docker run -d --name anythingllm \
  -p 127.0.0.1:3001:3001 \
  --cap-add SYS_ADMIN \
  -v "$STORAGE_LOCATION":/app/server/storage \
  -v "$STORAGE_LOCATION/.env":/app/server/.env \
  -e STORAGE_DIR="/app/server/storage" \
  mintplexlabs/anythingllm:1.19.0
```

Check that it is up, then open `http://127.0.0.1:3001` for onboarding:

```bash
curl -s http://127.0.0.1:3001/api/ping
```

The response is `{"online":true}`. Keep the storage folder on the host: documents, vectors and settings live there, and a newer image can be started against the same folder without losing data.

A service on the host (Ollama, LM Studio, a vector database) is not reachable as `127.0.0.1` from inside the container. Use `http://host.docker.internal:11434`, and on Linux add `--add-host=host.docker.internal:host-gateway` to the `docker run` command (the Docker guide in the repository says the same).

### Docker Compose

The repository's Docker guide shows a Compose service with these settings in `environment`; they are the same keys as in the `.env` file, and the remaining ones are in `docker/.env.example` in the repository:

```yaml
services:
  anythingllm:
    image: mintplexlabs/anythingllm:1.19.0
    container_name: anythingllm
    ports:
      - "127.0.0.1:3001:3001"
    cap_add:
      - SYS_ADMIN
    environment:
      - STORAGE_DIR=/app/server/storage
      - JWT_SECRET=${ANYTHINGLLM_JWT_SECRET}
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_PATH=http://host.docker.internal:11434
      - OLLAMA_MODEL_PREF=llama3.1:8b
      - OLLAMA_MODEL_TOKEN_LIMIT=4096
      - EMBEDDING_ENGINE=ollama
      - EMBEDDING_BASE_PATH=http://host.docker.internal:11434
      - EMBEDDING_MODEL_PREF=nomic-embed-text:latest
      - EMBEDDING_MODEL_MAX_CHUNK_LENGTH=8192
      - VECTOR_DB=lancedb
      - DISABLE_TELEMETRY=true
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - anythingllm_storage:/app/server/storage
    restart: always

volumes:
  anythingllm_storage:
```

Set `ANYTHINGLLM_JWT_SECRET` in your shell to a long random string. Leaving out the embedding variables keeps the built-in embedder.

### Desktop app

For a single user, the desktop app (Mac, Windows, Linux) is downloaded from `https://anythingllm.com/download` and has the same workspace model without Docker. An agent cannot drive its windows; it can tell the user to install it and then use the workspace UI.

### Developer API

Create an API key in the app's settings (the developer API section) and keep it in an environment variable, for example `ANYTHINGLLM_API_KEY`. Requests use `Authorization: Bearer $ANYTHINGLLM_API_KEY` against `http://127.0.0.1:3001/api/v1`. The interactive Swagger page is served at `/api/docs`. The endpoints below are from the repository's `server/swagger/openapi.json`:

- `GET /v1/auth` — checks the key; returns `{"authenticated": true}`.
- `POST /v1/workspace/new` — body `{"name": ..., "chatMode": "chat" | "query", "topN": ..., "similarityThreshold": ...}`; returns the workspace with its `slug`. `GET /v1/workspaces`, `GET`/`DELETE /v1/workspace/{slug}`, `POST /v1/workspace/{slug}/update`.
- `POST /v1/document/upload` — multipart `file`, plus optional `addToWorkspaces` (comma-separated slugs) to embed straight away.
- `POST /v1/document/raw-text` — JSON `{"textContent": ..., "addToWorkspaces": ..., "metadata": {"title": ...}}`; the `title` key is required.
- `POST /v1/workspace/{slug}/update-embeddings` — JSON `{"adds": [...], "deletes": [...]}` using document `location` values from an upload response.
- `GET /v1/documents` — the document library; `DELETE /v1/system/remove-documents` removes documents.
- `POST /v1/workspace/{slug}/chat` and `/stream-chat` — body `{"message": ..., "mode": "chat" | "query", "sessionId": ...}`; the answer is in `textResponse` and the chunks used are in `sources`.
- `POST /v1/workspace/{slug}/vector-search` — body `{"query": ..., "topN": ..., "scoreThreshold": ...}`; returns chunks with `score`, no answer generation.
- `POST /v1/workspace/{slug}/thread/new` and thread chat endpoints keep separate conversations in one workspace.
- `POST /v1/openai/chat/completions` and `/v1/openai/models` give an OpenAI-compatible surface.

Chat and vector search need a chat model provider configured in the app. A fresh instance defaults to OpenAI without a key, and the search call then fails with HTTP 500, so finish onboarding first.

## Examples

### Example 1 — private document chat on a laptop

**Request**: "Set up AnythingLLM so I can chat with my contracts, with everything staying on this machine."

```bash
export STORAGE_LOCATION=$HOME/anythingllm
mkdir -p "$STORAGE_LOCATION" && touch "$STORAGE_LOCATION/.env"
docker run -d --name anythingllm -p 127.0.0.1:3001:3001 --cap-add SYS_ADMIN \
  --add-host=host.docker.internal:host-gateway \
  -v "$STORAGE_LOCATION":/app/server/storage \
  -v "$STORAGE_LOCATION/.env":/app/server/.env \
  -e STORAGE_DIR="/app/server/storage" -e DISABLE_TELEMETRY=true \
  mintplexlabs/anythingllm:1.19.0
curl -s http://127.0.0.1:3001/api/ping
```

**Result**: the ping returns `{"online":true}`. The agent tells the user to open `http://127.0.0.1:3001`, choose Ollama at `http://host.docker.internal:11434` as the chat provider, set an admin password, create a workspace and drag the contracts in.

### Example 2 — load a handbook into a workspace over the API

**Request**: "Create a Support Handbook workspace and add our refund policy so my script can query it."

```bash
BASE=http://127.0.0.1:3001/api/v1
AUTH="Authorization: Bearer $ANYTHINGLLM_API_KEY"

curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name": "Support Handbook", "chatMode": "query", "topN": 4}' \
  $BASE/workspace/new

curl -s -H "$AUTH" -F "file=@docs/refund-policy.pdf" \
  -F "addToWorkspaces=support-handbook" $BASE/document/upload

curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"message": "How many days do customers have to request a refund?", "mode": "query"}' \
  $BASE/workspace/support-handbook/chat
```

**Result**: the first call returns the workspace with slug `support-handbook`; the upload returns `{"success": true, "documents": [...]}` with each document's `location`; the chat call returns JSON whose `textResponse` is the answer and whose `sources` lists the chunks it used. In `query` mode the workspace refuses to answer from outside the documents.

## Guidelines

- A fresh single-user instance has no password. On such an instance (no auth token set), the server's `POST /api/system/generate-api-key` route does not require authentication, so anyone who can reach the port can create an API key (checked against 1.19.0 and the repository's `server/endpoints/system.js`; the route answers 401 once multi-user mode is on). Bind the port to `127.0.0.1` (as above), enable password protection during onboarding and put a TLS reverse proxy in front before anyone else can reach it.
- Telemetry is on by default in Docker. Set `DISABLE_TELEMETRY=true` in the environment or `.env` for a private deployment.
- The built-in embedder downloads its model on first use, so the first embedding needs internet access unless you point `EMBEDDING_ENGINE` at a local server.
- Keep the storage folder or Docker volume backed up and mounted; removing the container without it loses documents and settings.
- Documents are embedded per workspace. Uploading to the library only stores a file; use `addToWorkspaces` or `update-embeddings` so it is searchable.
- `query` mode answers only from workspace documents; `chat` mode also uses the model's own knowledge. Pick `query` when answers must be traceable to documents.
- The API key grants full control of the instance. Keep it in an environment variable or secret store and never in the repository.
- Do not choose AnythingLLM when you need fine control over parsing and chunking of difficult scans (see RAGFlow) or a code-level RAG library (see LightRAG).
