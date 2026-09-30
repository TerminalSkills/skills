---
title: Deploy a Self-Hosted AI Chat Interface with Open WebUI
slug: deploy-a-self-hosted-ai-chat-interface-with-open-webui
description: Give a small team a private chat interface with accounts, a shared knowledge base and an API, running on hardware the company already owns.
skills:
  - open-webui
  - ollama
  - docker-helper
category: data-ai
tags:
  - open-webui
  - ollama
  - self-hosted
  - private-ai
  - rag
---

## The Problem

Maria Oliveira runs IT at AdPulse Media, a marketing agency with 22 employees. The copywriters paste client briefs into consumer chatbots to get headline ideas, and two client contracts signed this year forbid exactly that: campaign material may not be sent to third-party AI services. The agency also pays for 22 chatbot seats at 20 dollars each, 440 dollars a month, for a tool it is no longer allowed to use on its most valuable work.

The agency owns a rendering workstation with an RTX 4090 that sits idle most of the day. Maria wants a chat interface on it that feels familiar to the team, has one account per person, knows the brand guidelines of the two restricted clients, and offers an API for the script that checks copy against those guidelines. She has one day to set it up and wants to be able to update it without fear.

## The Solution

Use the **ollama** skill to serve open models on the workstation's GPU, the **open-webui** skill to deploy the chat interface, create the admin account without a browser, load the brand guidelines into a knowledge base and issue an API key, and the **docker-helper** skill to run both services from one Compose file with a GPU reservation.

## Step-by-Step Walkthrough

### 1. Describe both services in one Compose file

```text
Set up Ollama with GPU access and Open WebUI 0.11.4 in one Compose project on this workstation. Create the admin account from environment variables and enable API keys.
```

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    volumes:
      - ollama:/root/.ollama
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.11.4
    container_name: open-webui
    depends_on:
      - ollama
    ports:
      - "3000:8080"
    volumes:
      - open-webui:/app/backend/data
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - WEBUI_SECRET_KEY=${WEBUI_SECRET_KEY}
      - WEBUI_ADMIN_EMAIL=${WEBUI_ADMIN_EMAIL}
      - WEBUI_ADMIN_PASSWORD=${WEBUI_ADMIN_PASSWORD}
      - ENABLE_API_KEYS=True
    restart: unless-stopped

volumes:
  ollama:
  open-webui:
```

```bash
printf 'WEBUI_SECRET_KEY=%s\nWEBUI_ADMIN_EMAIL=%s\nWEBUI_ADMIN_PASSWORD=%s\n' \
  "$(openssl rand -hex 32)" "maria.oliveira@adpulse.media" "$(openssl rand -hex 16)" > .env
chmod 600 .env
docker compose up -d
```

### 2. Pull the models and check the service

```text
Pull a general chat model and a coding model, then confirm Open WebUI is up.
```

```bash
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull qwen2.5-coder:7b
docker compose exec ollama ollama list

until curl -sf http://localhost:3000/health > /dev/null; do sleep 2; done
curl -s http://localhost:3000/health
```

The health endpoint answers `{"status":true}`. Because the admin account was created from the environment, sign-up is already closed and nobody else can claim the instance.

### 3. Create an API key and verify the connection to Ollama

```text
Sign in as the admin, create an API key, and list the models Open WebUI can see.
```

```bash
set -a; . ./.env; set +a
export OPEN_WEBUI_URL="http://localhost:3000"
TOKEN=$(curl -s -X POST "$OPEN_WEBUI_URL/api/v1/auths/signin" -H "Content-Type: application/json" \
  -d "$(jq -n --arg e "$WEBUI_ADMIN_EMAIL" --arg p "$WEBUI_ADMIN_PASSWORD" '{email: $e, password: $p}')" | jq -r .token)
export OPEN_WEBUI_API_KEY=$(curl -s -X POST "$OPEN_WEBUI_URL/api/v1/auths/api_key" \
  -H "Authorization: Bearer $TOKEN" | jq -r .api_key)

curl -s "$OPEN_WEBUI_URL/api/models" -H "Authorization: Bearer $OPEN_WEBUI_API_KEY" | jq -r '.data[].id'
```

```text
llama3.1:8b
qwen2.5-coder:7b
```

### 4. Load the brand guidelines into a knowledge base

```text
Create a knowledge base "Client Brand Guidelines" from the two PDFs in ./guidelines and test it with a question.
```

```python
import os
import time
import requests

base = os.environ["OPEN_WEBUI_URL"]
auth = {"Authorization": f"Bearer {os.environ['OPEN_WEBUI_API_KEY']}"}

kb = requests.post(f"{base}/api/v1/knowledge/create", headers=auth,
                   json={"name": "Client Brand Guidelines", "description": "Tone and wording rules"}).json()

for name in ["guidelines/verdana-foods-brand-book.pdf", "guidelines/kestrel-bank-tone-of-voice.pdf"]:
    with open(name, "rb") as f:
        file_id = requests.post(f"{base}/api/v1/files/", headers=auth, files={"file": f}).json()["id"]
    while True:
        status = requests.get(f"{base}/api/v1/files/{file_id}/process/status", headers=auth).json()["status"]
        if status == "completed":
            break
        if status == "failed":
            raise RuntimeError(f"processing failed for {name}")
        time.sleep(2)
    requests.post(f"{base}/api/v1/knowledge/{kb['id']}/file/add", headers=auth,
                  json={"file_id": file_id}).raise_for_status()

reply = requests.post(f"{base}/api/chat/completions", headers=auth, json={
    "model": "llama3.1:8b",
    "messages": [{"role": "user", "content": "May we use exclamation marks in Kestrel Bank headlines?"}],
    "files": [{"type": "collection", "id": kb["id"]}],
}).json()
print(kb["id"], reply["choices"][0]["message"]["content"])
```

```text
3f0b7c52-9a41-4e6d-b1c8-5d2e9f7a6041 No. The Kestrel Bank tone-of-voice guide rules out exclamation marks in headlines and subject lines.
```

The copy-check script uses the same request with the knowledge base id and the text to be checked.

### 5. Back up before every update

```text
Make a backup of the Open WebUI data and then update to the next release.
```

```bash
docker run --rm -v open-webui:/data -v "$(pwd)":/backup alpine \
  tar czf "/backup/openwebui-$(date +%Y%m%d).tar.gz" /data

# after changing the image tag in docker-compose.yml
docker compose pull open-webui
docker compose up -d open-webui
docker logs open-webui 2>&1 | head -20
```

The agent reads the release notes first, because a database migration cannot be undone by starting the older image again; the archive is the way back.

## Real-World Example

Maria has the stack running before lunch. In the afternoon she opens sign-up in the admin panel for one hour, the 22 employees register, and she approves the pending accounts and closes sign-up again. The two brand books, 96 pages together, are searchable a few minutes after the upload.

After the first month the usage page shows 3,140 chats. The agency cancels 18 of the 22 chatbot seats and keeps four for work on unrestricted accounts, which saves 360 dollars a month. The copy-check script runs on every draft for the two restricted clients and flags 27 guideline violations in the first two weeks, mostly forbidden superlatives. When the next Open WebUI release arrives, Maria asks the agent to repeat step 5; the update takes four minutes and everyone stays signed in because the secret key did not change.

## Related Skills

- [open-webui](/skills/open-webui) — deploys the chat interface, creates the admin account and API key, builds the knowledge base and handles backup and updates
- [ollama](/skills/ollama) — serves the chat and coding models on the workstation's GPU and pulls new models
- [docker-helper](/skills/docker-helper) — defines both services, the volumes and the GPU reservation in one Compose file
