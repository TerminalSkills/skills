---
name: open-notebook
description: >-
  Open Notebook is a self-hosted, open-source alternative to Google NotebookLM: you collect PDFs, web pages, text and audio or video into notebooks, search them, chat with the sources and generate podcasts, with your choice of AI provider. Use this skill to deploy it with Docker Compose bound to localhost, connect a model provider, load sources and query them through its REST API. Triggers: "self-hosted NotebookLM", "chat with my PDFs privately", "open notebook docker", "research notebook with citations", "generate a podcast from documents".
license: Apache-2.0
compatibility: "Docker with Compose v2, 4 GB free RAM, an AI provider (cloud API key or Ollama), curl and jq for the API examples"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: research
  tags: "notebooklm-alternative, self-hosted, rag, research, podcast"
  repository: https://github.com/lfnovo/open-notebook
---

# Open Notebook — a self-hosted NotebookLM alternative

## Overview

Open Notebook (MIT licensed, Python/FastAPI plus a Next.js UI, SurrealDB for storage) keeps research material in notebooks. A notebook holds sources (uploaded files, links, pasted text), notes, and chat sessions that use the sources as context. It also offers text and vector search, "transformations" that summarise or extract from a source, and multi-speaker podcast generation. Everything the web UI does goes through a REST API, so an agent can deploy and drive it from a terminal.

This skill covers the stable `1.x` line (checked against release 1.15.1). The Docker Compose stack runs two containers: `surrealdb` (database) and `open_notebook` (UI on 8502, API on 5055, background worker inside the same container). Model providers are not part of the stack: you connect OpenAI, Anthropic, Google, Ollama or any other supported provider after it starts.

## Instructions

### Deploy with Docker Compose, localhost only

```bash
mkdir open-notebook && cd open-notebook || exit 1
curl -o docker-compose.yml https://raw.githubusercontent.com/lfnovo/open-notebook/main/docker-compose.yml
openssl rand -hex 32     # generate your own value for the encryption key; the value shown below is only a format sample
```

Edit `docker-compose.yml` before the first start. The shipped file publishes ports on all interfaces and has no password:

```yaml
  open_notebook:
    image: lfnovo/open_notebook:1.15.1      # pin instead of v1-latest
    ports:
      - "127.0.0.1:8502:8502"               # web UI
      - "127.0.0.1:5055:5055"               # REST API
    environment:
      - OPEN_NOTEBOOK_ENCRYPTION_KEY=3f9a1c7e5b2d48a6c0e1f7b9d2a4c6e8f0b1d3a5c7e9f2b4d6a8c0e1f3b5d7a9
      - OPEN_NOTEBOOK_PASSWORD=nb-local-8Kq2vXw9
```

Keep the other environment lines (`SURREAL_URL`, `SURREAL_USER`, `SURREAL_PASSWORD`, `SURREAL_NAMESPACE`, `SURREAL_DATABASE`) as shipped. The `surrealdb` service already binds its debug port to `127.0.0.1:8000`; its default `root:root` login is only safe because of that. To change it, put `SURREAL_USER=` and `SURREAL_PASSWORD=` in a `.env` file next to the compose file before the first start.

Rules that matter:

- The encryption key protects provider API keys stored in the database. Changing it later makes saved keys unreadable, so store it with your other secrets.
- A `.env` file is not loaded into the container (no `env_file:`); it only fills `${...}` placeholders in the compose file. Put every Open Notebook setting in the `environment:` block of the `open_notebook` service.
- Apply a settings change with `docker compose up -d`. `docker compose restart` does not re-read the file.

```bash
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:5055/health      # {"status":"healthy"} after 20-30 seconds
```

Data lives in `./surreal_data` (database) and `./notebook_data` (uploads and caches). Back up both together with the encryption key.

### Authentication for the API

With `OPEN_NOTEBOOK_PASSWORD` set, every `/api/*` call needs `Authorization: Bearer ` followed by the password; without the header the API answers `401 {"detail":"Missing authorization header"}`. `/health`, `/docs`, `/redoc`, `/openapi.json`, `/api/auth/status` and `/api/config` stay open. Export the password once and reuse it:

```bash
export OPEN_NOTEBOOK_PASSWORD='nb-local-8Kq2vXw9'     # the value set in docker-compose.yml
export ON_API=http://127.0.0.1:5055
onapi() { curl -s -H "Authorization: Bearer $OPEN_NOTEBOOK_PASSWORD" "$@"; }
```

All application routes sit under `/api` (not `/api/v1`). The live schema at `$ON_API/openapi.json` (Swagger UI at `/docs`) is the reference for request fields; read it before calling anything not shown here.

### Connect a model provider

Chat, embeddings, transformations and podcasts all need models. The documented path is the web UI at `http://127.0.0.1:8502`: Manage, then Models, add a credential for the provider, test it, add a language model and an embedding model, and set the defaults. Provider keys set as environment variables (`OPENAI_API_KEY` and similar) still work but are marked deprecated in `.env.example`; prefer stored credentials.

For a scripted setup the API has the same operations (request shapes confirmed in the OpenAPI schema):

```bash
# 1. store a credential (api_key or base_url, depending on the provider)
onapi -H 'Content-Type: application/json' $ON_API/api/credentials \
  -d '{"name":"local-ollama","provider":"ollama","modalities":["language","embedding"],"base_url":"http://ollama:11434"}'
# 2. list the models the provider offers (discover only lists them)
onapi -X POST $ON_API/api/credentials/credential:k3j9x0a1/discover
# 3. register the ones you want, with the type of each (language, embedding, text_to_speech, speech_to_text)
onapi -H 'Content-Type: application/json' $ON_API/api/credentials/credential:k3j9x0a1/register-models \
  -d '{"models":[{"name":"qwen3","provider":"ollama","model_type":"language"},{"name":"nomic-embed-text","provider":"ollama","model_type":"embedding"}]}'
# 4. set the default chat and embedding models from the registered ones (only empty slots are filled)
onapi -X POST $ON_API/api/models/auto-assign
onapi $ON_API/api/models/defaults
```

For local models in Docker, add an `ollama/ollama` service in a `docker-compose.override.yml`, pull a chat model and an embedding model with `docker compose exec ollama ollama pull qwen3`, and give the credential the base URL `http://ollama:11434`. If Ollama runs on the host instead, the container must use `http://host.docker.internal:11434`, because `localhost` inside the container is the container itself; on Linux add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `open_notebook` service first, since that name does not exist there by default. Until a default language model is set, chat fails; until a default embedding model exists, vector search and embedding return errors (`422`, model not configured).

### Notebooks, sources and notes

```bash
# create a notebook
onapi -H 'Content-Type: application/json' $ON_API/api/notebooks \
  -d '{"name":"Q3 Board Report","description":"Board pack and supporting notes"}'

# add pasted text (type is link, upload or text)
onapi -H 'Content-Type: application/json' $ON_API/api/sources/json \
  -d '{"type":"text","title":"Q3 summary","content":"Q3 revenue was 4.2 million dollars.","notebooks":["notebook:abc123"],"embed":true}'

# upload a file (multipart; use -F, not JSON)
onapi $ON_API/api/sources -F type=upload -F 'notebooks=["notebook:abc123"]' \
  -F title='Churn notes' -F file=@churn-notes.txt

# add a web page
onapi -H 'Content-Type: application/json' $ON_API/api/sources/json \
  -d '{"type":"link","url":"https://github.com/lfnovo/open-notebook/blob/main/README.md","notebooks":["notebook:abc123"],"embed":true}'
```

Notebook ids look like `notebook:7az61ukah60w6qg5d89a`; read them from the JSON responses (`jq -r .id`). `embed: true` creates vector embeddings and needs a default embedding model. For large files send `async_processing=true`, then poll `GET /api/sources/{id}/status` until `completed` or `failed`. A rejected upload returns `413` (over `OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB`, default 100) or `415` (unsupported type). Heavy extractors (Docling with OCR, a local Crawl4AI browser) are opt-in through `OPEN_NOTEBOOK_ENABLE_DOCLING=true` and `OPEN_NOTEBOOK_ENABLE_CRAWL4AI=true` on the `open_notebook` service; the next start installs them and takes several minutes.

### Search

```bash
# keyword search works without any model
onapi -H 'Content-Type: application/json' $ON_API/api/search \
  -d '{"query":"revenue","type":"text","search_sources":true,"search_notes":true,"limit":10}'
# semantic search needs an embedding model and embedded sources
onapi -H 'Content-Type: application/json' $ON_API/api/search \
  -d '{"query":"why did churn drop","type":"vector","notebook_id":"notebook:abc123","limit":5}'
```

`POST /api/search/ask/simple` answers a question across the knowledge base and returns `{"question", "answer"}`; the streaming variant `POST /api/search/ask` returns server-sent events, so call it with `curl -N`. Both take `question` plus `strategy_model`, `answer_model` and `final_answer_model` (model ids from `GET /api/models`), need a default embedding model, and accept `notebook_id` or `notebook_ids` to limit the scope.

### Chat with a notebook, notes and podcasts

Chat sessions belong to a notebook. The request shapes below come from the OpenAPI schema; they need a configured language model, so they could not be run without provider credentials.

```bash
# 1. open a session
onapi -H 'Content-Type: application/json' $ON_API/api/chat/sessions \
  -d '{"notebook_id":"notebook:abc123","title":"Board questions"}'
# 2. build the context: per source, "insights" (short), "full content" (long) or "not in"
onapi -H 'Content-Type: application/json' $ON_API/api/chat/context \
  -d '{"notebook_id":"notebook:abc123","context_config":{"sources":{"source:g5wwzyuer3e7nf2c8ine":"full content"},"notes":{}}}'
# 3. send a message, passing the "context" object from step 2 unchanged
onapi -H 'Content-Type: application/json' $ON_API/api/chat/execute \
  -d '{"session_id":"chat_session:bs38vdzeii9hjhyos90g","message":"What drove the Q3 revenue growth?","context":{"sources":[],"notes":[]}}'
```

Notes are created with `POST /api/notes`. Podcast generation is `POST /api/podcasts/generate` with `episode_profile`, `speaker_profile`, `episode_name` and either `content` or `notebook_id`; it returns a `job_id`, which you poll at `GET /api/podcasts/jobs/{job_id}`. The profiles are managed under `/api/episode-profiles` and `/api/speaker-profiles` and need a text-to-speech model.

## Examples

### Example 1: Private notebook over a quarter's reports

**Request:** "Stand up Open Notebook on this machine, only reachable locally, and load the Q3 notes so I can search them."

```bash
mkdir open-notebook && cd open-notebook || exit 1
curl -o docker-compose.yml https://raw.githubusercontent.com/lfnovo/open-notebook/main/docker-compose.yml
# edit docker-compose.yml: pin image 1.15.1, bind both ports to 127.0.0.1,
# set OPEN_NOTEBOOK_ENCRYPTION_KEY (your own openssl rand -hex 32) and OPEN_NOTEBOOK_PASSWORD
docker compose up -d
curl -s http://127.0.0.1:5055/health
NB=$(onapi -H 'Content-Type: application/json' $ON_API/api/notebooks \
  -d '{"name":"Q3 Board Report","description":"Board pack"}' | jq -r .id)
onapi $ON_API/api/sources -F type=upload -F "notebooks=[\"$NB\"]" -F file=@churn-notes.txt
onapi -H 'Content-Type: application/json' $ON_API/api/search \
  -d '{"query":"churn","type":"text","limit":5}'
```

**Result:** the health call returns `{"status":"healthy"}`, the notebook call returns an object with an `id` such as `notebook:7az61ukah60w6qg5d89a`, the upload returns the extracted `full_text` of the file, and the search returns a `results` array containing the source with its title and relevance. Without the password header the same calls return `401`.

### Example 2: Fully local models and a podcast

**Request:** "Use Ollama instead of a cloud API, then make a two-host podcast from the board notebook."

```bash
# docker-compose.override.yml adds an ollama service; then:
docker compose up -d
docker compose exec ollama ollama pull qwen3
docker compose exec ollama ollama pull nomic-embed-text
onapi -H 'Content-Type: application/json' $ON_API/api/credentials \
  -d '{"name":"local-ollama","provider":"ollama","modalities":["language","embedding"],"base_url":"http://ollama:11434"}'
# then discover and register the two models as shown under "Connect a model provider"
onapi -X POST $ON_API/api/models/auto-assign
onapi $ON_API/api/episode-profiles
onapi $ON_API/api/speaker-profiles
```

**Result:** the credential response carries an `id`; after `discover` and `register-models` (as in the provider section), `auto-assign` reports which default chat and embedding slots it set, `skipped` or left `missing`. It never sets a text-to-speech default. Pick profile names from the two list calls and start the episode with `POST /api/podcasts/generate`; podcasts stay unavailable until a text-to-speech model is configured.

## Guidelines

- Bind published ports to `127.0.0.1` unless you add TLS and a reverse proxy. The password is one shared secret, not user accounts, and it protects the API and UI together.
- Never keep the placeholder encryption key from the shipped file, and never reuse a value copied from a guide.
- Back up `./surreal_data`, `./notebook_data` and the encryption key as a set. After upgrading to 1.15 or later, stored keys can be rewritten into the new format with `POST /api/credentials/migrate-encryption`; take a database backup first because older versions cannot read the new format.
- Source text and chat context are sent to the chosen provider. For data that must stay on the machine, use Ollama or another local server and check which provider each default model points at.
- Do not use it as a multi-user product: there is no per-user separation. Use a different tool when you need team permissions and per-notebook access control.
- Running 1.x images are tagged by version (`1.15.1`) and by `v1-latest`; pin the version in anything that must be reproducible, and read the release notes before changing it.
- Stop the stack with `docker compose down`; add `-v` only if you also want the named volumes removed (the shipped file uses bind folders, which stay on disk until you delete them).
