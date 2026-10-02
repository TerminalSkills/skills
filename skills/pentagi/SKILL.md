---
name: pentagi
description: >-
  PentAGI is a self-hosted, autonomous AI penetration-testing system: LLM agents plan and run security tools such as nmap and sqlmap inside sandboxed Docker containers and write a vulnerability report.
  Use when a user asks to automate security testing, set up autonomous pentesting, deploy an AI-driven vulnerability scanner,
  build a self-hosted security testing platform, or drive pentests through the PentAGI API. Only for systems the user is authorized to test.
license: Apache-2.0
compatibility: 'Docker and Docker Compose (or Podman); 2+ vCPU, 4 GB RAM, 20 GB disk; at least one LLM provider (OpenAI, Anthropic, Gemini, Bedrock, Ollama, DeepSeek and others)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/vxcontrol/pentagi
  category: devops
  tags:
    - pentagi
    - penetration-testing
    - security
    - ai-agents
    - vulnerability
---

# PentAGI

## Overview

PentAGI (v2.1.0, May 2026) is an open-source platform in which a team of AI agents (orchestrator, researcher, developer, infrastructure and others) carries out a penetration test as a "flow": it plans tasks, runs 20+ professional tools (nmap, metasploit, sqlmap and more) in isolated Docker containers, searches the web for context, stores results in PostgreSQL with pgvector, and produces a report. Optional add-ons are a Graphiti/Neo4j knowledge graph (beta, off by default), Langfuse for LLM tracing, and a Grafana/OpenTelemetry observability stack. Everything is self-hosted; only the LLM and search API calls leave your network (unless you use Ollama or another local model).

Use it only against systems you own or are explicitly authorized in writing to test. It is a pentest assistant, not a breach-and-attack-simulation product with predefined campaigns.

## Instructions

### Step 1: Deploy with Docker Compose

Requirements: Docker and Compose (Podman is supported), 2 vCPU, 4 GB RAM, 20 GB disk. The repository also offers an interactive installer, but the manual route below needs no extra binary.

```bash
mkdir pentagi && cd pentagi
curl -o .env https://raw.githubusercontent.com/vxcontrol/pentagi/master/.env.example
curl -o docker-compose.yml https://raw.githubusercontent.com/vxcontrol/pentagi/master/docker-compose.yml
# docker-compose.yml mounts these three files; create them or Docker makes directories in their place
curl -o example.custom.provider.yml https://raw.githubusercontent.com/vxcontrol/pentagi/master/examples/configs/custom-openai.provider.yml
curl -o example.ollama.provider.yml https://raw.githubusercontent.com/vxcontrol/pentagi/master/examples/configs/ollama-llama318b.provider.yml
curl -o example.bedrock.provider.yml https://raw.githubusercontent.com/vxcontrol/pentagi/master/examples/configs/bedrock.provider.yml
```

Review `.env.example` and the compose file before starting them: the stack mounts the Docker socket for its worker containers.

Edit `.env`. At least one LLM provider is required; the variable names are provider-specific (there is no `LLM_PROVIDER` or `LLM_MODEL`):

```bash
# LLM providers: set one or more
OPEN_AI_KEY=your-openai-key
# ANTHROPIC_API_KEY=...   GEMINI_API_KEY=...   DEEPSEEK_API_KEY=...
# OLLAMA_SERVER_URL=http://localhost:11434
# OLLAMA_SERVER_MODEL=llama3.1:8b-instruct-q8_0

# Web search (all optional)
DUCKDUCKGO_ENABLED=true
TAVILY_API_KEY=your-tavily-key
# SEARXNG_URL=http://searxng.internal:8080

# Security: change before real use
COOKIE_SIGNING_SALT=replace-with-a-long-random-string
PUBLIC_URL=https://localhost:8443
PENTAGI_POSTGRES_PASSWORD=replace-with-a-strong-password
NEO4J_PASSWORD=replace-with-a-strong-password
```

```bash
docker compose up -d
```

The web UI is `https://localhost:8443` (self-signed certificate unless you supply `SERVER_SSL_CRT`/`SERVER_SSL_KEY`). There is no public sign-up: the first login is `admin@pentagi.com` / `admin`; change that password immediately. To reach it from other hosts set `PENTAGI_LISTEN_IP=0.0.0.0`, `PUBLIC_URL` and `CORS_ORIGINS`, and firewall port 8443.

### Step 2: Add monitoring stacks (optional)

The overlays reuse networks created by the main compose file, so start that first:

```bash
curl -O https://raw.githubusercontent.com/vxcontrol/pentagi/master/docker-compose-langfuse.yml
curl -O https://raw.githubusercontent.com/vxcontrol/pentagi/master/docker-compose-observability.yml
docker compose -f docker-compose.yml -f docker-compose-langfuse.yml up -d          # Langfuse at http://localhost:4000
docker compose -f docker-compose.yml -f docker-compose-observability.yml up -d     # Grafana at http://localhost:3000 (set OTEL_HOST=otelcol:8148)
```

Langfuse needs its own `LANGFUSE_*` secrets and initial admin values in `.env`. Graphiti is `docker-compose-graphiti.yml` plus `GRAPHITI_ENABLED=true` and `GRAPHITI_URL`; it is beta, and complements (does not replace) the pgvector memory.

### Step 3: Run a flow in the web UI

Create a new flow, choose **Automation** (fully autonomous) or **Assistant** (interactive; the "Use Agents" toggle lets it delegate to sub-agents), pick the LLM provider, and describe the target, scope and rules of engagement in plain language. Templates can prefill the box. While it runs, follow tasks, subtasks, terminal output and tool activity on the flow page, steer it through the Assistant view, and upload files in the Files tab (mirrored at `/work/uploads/` in the agent container). When enough results exist, the **Report** menu opens a web view, copies the report, or downloads Markdown or PDF. JSON report export is not a supported format.

### Step 4: Automate through the API

Create a token under Settings, API Tokens (name, expiry from 1 minute to 3 years; shown once). Use it as a Bearer token. The OpenAPI UI is at `/api/v1/swagger/index.html`, the GraphQL playground at `/api/v1/graphql/playground`.

```bash
export PENTAGI_URL=https://pentagi.lab.internal:8443
curl -k -X POST "$PENTAGI_URL/api/v1/graphql" \
  -H "Authorization: Bearer $PENTAGI_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { createFlow(modelProvider: \"openai\", input: \"Assess https://staging.acme-shop.io for injection and authentication flaws. Stay on that host only.\") { id title status } }"}'

curl -k "$PENTAGI_URL/api/v1/flows" -H "Authorization: Bearer $PENTAGI_API_TOKEN"
```

`-k` is only for the default self-signed certificate; install a real certificate instead for anything shared. The full GraphQL schema is downloadable from the UI settings.

### Step 5: Choosing models

Strong hosted models give the best results. For private assessments, use Ollama or any OpenAI-compatible endpoint through `LLM_SERVER_URL`/`LLM_SERVER_KEY` (see the README's custom-provider section and its vLLM guide). Small open models need the execution-monitoring and task-planning options described in the README.

## Examples

### Example 1: Authorized assessment of a staging site

**User request:** "Run an automated web pentest against our staging site https://staging.acme-shop.io, we have written approval."

Start the stack, log in, create an Automation flow with the prompt "Assess https://staging.acme-shop.io for common web vulnerabilities: authentication, file upload, injection. Do not test other hosts, no denial of service, no data exfiltration. Report confirmed findings with reproduction steps." The agents scan, probe and validate; the result is a flow page with tasks, terminal output and a downloadable PDF/Markdown report listing confirmed findings and remediation advice. Review it manually before acting on anything.

### Example 2: Kick off flows from CI

**User request:** "Trigger a PentAGI run after each staging deploy."

Store `PENTAGI_API_TOKEN` as a CI secret and call the `createFlow` mutation from Step 4 in the deploy job, then poll `GET /api/v1/flows` until its `status` shows the flow has finished. The job output is the flow `id` and `title`; link the report URL from the web UI in the build summary.

## Guidelines

- Get written authorization and define scope before every test; unauthorized testing is illegal. The project's EULA sets acceptable-use terms.
- Put the host on an isolated network. Worker containers contain offensive tools and the stack touches the Docker daemon; the README recommends a hardened Docker-in-Docker daemon over TLS (`DOCKER_INSIDE=true`) rather than bind-mounting the socket.
- Change the default admin password and every secret in `.env` before exposing the UI; never commit `.env`.
- Autonomous is not unsupervised: watch the flow, put scope limits in the prompt, and stop it from the Assistant view if it drifts.
- Findings are LLM-generated; confirm each one by hand before reporting it. Use PentAGI for reconnaissance and known-vulnerability checks and humans for business-logic flaws.
- Web search and LLM calls send target details to third parties unless you use local models and SearXNG.
- Deleting a flow does not remove its `flow-{id}-data/` directory; clean it up manually.
- Use the same embedding provider throughout; switching providers invalidates stored memory.
