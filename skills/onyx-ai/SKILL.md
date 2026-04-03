---
name: onyx-ai
description: >-
  Self-hosted open-source AI platform with chat, RAG, connectors, and multi-LLM support. Use when: deploying private ChatGPT alternative, connecting AI to internal docs, building enterprise AI chat.
license: Apache-2.0
compatibility: "Docker, Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [ai-platform, self-hosted, rag, chat, multi-llm, enterprise, onyx]
  use-cases:
    - "Example use case 1"
    - "Example use case 2"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Onyx AI

## Overview

Onyx (formerly Danswer) is a self-hosted AI platform that connects to your company data sources and provides ChatGPT-like chat with RAG. Supports any LLM provider.

## Quick Start

```bash
git clone https://github.com/onyx-dot-app/onyx.git
cd onyx/deployment/docker_compose
docker compose up -d
```

Access at http://localhost:3000

## Connectors

Onyx connects to 25+ data sources:
- **Documents**: Confluence, Notion, Google Drive, SharePoint
- **Code**: GitHub, GitLab, Bitbucket
- **Communication**: Slack, Teams, Gmail
- **Tickets**: Jira, Linear, Zendesk
- **Custom**: Web scraping, file upload, API

## Multi-LLM Support

Configure any LLM provider in admin settings:
- OpenAI (GPT-4o)
- Anthropic (Claude)
- Azure OpenAI
- Local models via Ollama
- Any OpenAI-compatible API

## RAG Pipeline

1. Connectors pull documents on schedule
2. Documents chunked and embedded
3. User asks question → semantic search → relevant chunks → LLM generates answer with citations
4. Citations link back to original documents

## Admin Features

- User management with SSO (SAML, OIDC)
- Usage analytics and cost tracking
- Per-group access controls
- Custom system prompts per assistant
- Document permission sync from source systems

## API

```python
import requests

resp = requests.post(\"http://localhost:3000/api/chat\", json={
    \"query\": \"What is our refund policy?\",
    \"assistant_id\": 1,
}, headers={\"Authorization\": \"Bearer <token>\"})

print(resp.json()[\"answer\"])
print(resp.json()[\"citations\"])
```
