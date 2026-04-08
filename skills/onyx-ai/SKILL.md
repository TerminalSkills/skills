---
name: onyx-ai
description: >-
  Deploy and configure Onyx, a self-hosted AI chat platform with RAG and 25+ data
  connectors. Use when: setting up private ChatGPT alternative, connecting AI to
  company documents, building enterprise AI assistant with Confluence/Slack/Drive access.
license: MIT
compatibility: "Docker, Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["self-hosted", "rag", "enterprise-ai"]
---

# Onyx AI

## Overview

Onyx (formerly Danswer) is a self-hosted AI platform that connects to your company's data sources and provides ChatGPT-like chat with retrieval-augmented generation. It supports any LLM provider and includes 25+ connectors for Confluence, Slack, Google Drive, GitHub, Notion, and more.

## Instructions

### Deployment

Deploy Onyx using Docker Compose:

```bash
git clone https://github.com/onyx-dot-app/onyx.git
cd onyx/deployment/docker_compose
docker compose up -d
```

Access the admin panel at `http://localhost:3000`. Create an admin account on first visit.

### Configure LLM Provider

In Admin → LLM Configuration, add your provider:

- **OpenAI**: Enter API key, select model (gpt-4o recommended)
- **Anthropic**: Enter API key, select Claude model
- **Azure OpenAI**: Enter endpoint URL, API key, deployment name
- **Ollama**: Point to local Ollama instance for fully private setup

### Connect Data Sources

In Admin → Connectors, add sources:

1. **Confluence**: Enter base URL + API token. Onyx indexes all spaces.
2. **Slack**: Install Onyx Slack app, select channels to index.
3. **Google Drive**: OAuth connection, select shared drives.
4. **GitHub**: Personal access token, select repos.
5. **Web scraping**: Enter URLs to crawl and index.

Each connector runs on a configurable schedule (hourly, daily, weekly).

### Create Assistants

Create specialized assistants with different system prompts and document access:

- **Engineering Assistant**: Access to GitHub + Confluence tech docs
- **Sales Assistant**: Access to CRM data + product docs
- **HR Assistant**: Access to policies + handbook (restricted access)

## Examples

**Example 1: Company knowledge search**

User prompt: "What is our refund policy for enterprise customers?"

The assistant searches across Confluence docs and Google Drive, finds the relevant policy document, and responds with the answer including a citation link to the source document.

**Example 2: Code question**

User prompt: "How does our authentication middleware work?"

The assistant searches GitHub repos, finds the auth middleware files, and explains the implementation with code references.

## Guidelines

- Start with 1-2 connectors, verify quality before adding more
- Set document permissions to match your org structure
- Use Ollama for fully air-gapped deployments (no data leaves your network)
- Monitor token usage in Admin → Analytics to control costs
- Schedule connector syncs during off-hours to avoid load spikes
- Test RAG quality with known questions before rolling out to team
