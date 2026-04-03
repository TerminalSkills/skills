---
title: Build a Self-Hosted AI Chat for Enterprise
description: >-
  A CTO deploys Onyx as an internal AI assistant for 200 employees,
  connecting Slack, Confluence, and Google Drive with full GDPR compliance
  and data sovereignty.
skills: [onyx-ai]
category: enterprise
tags: [ai-chat, self-hosted, gdpr, enterprise, rag, knowledge-base]
---

# Build a Self-Hosted AI Chat for Enterprise

## The Scenario

You're the CTO of a 200-person European SaaS company. Your team wastes hours searching across Slack, Confluence, Google Drive, and GitHub for answers that already exist somewhere in the company's knowledge base. You need an internal AI assistant that:

- Answers questions using actual company knowledge (not hallucinated internet data)
- Stays fully GDPR-compliant — no data leaves your infrastructure
- Connects to existing tools without requiring migration
- Supports multiple departments with different access levels

## Why Onyx

Onyx (formerly Danswer) is the only open-source solution that checks all boxes:

- **Self-hosted** — runs on your servers, data never leaves your VPC
- **30+ connectors** — Slack, Confluence, Google Drive, GitHub, Notion, and more
- **RAG pipeline** — retrieves real company documents, not hallucinations
- **Multi-LLM** — use OpenAI, Anthropic, or fully local models via Ollama
- **Access control** — document sets per team, SSO/OIDC integration

## Step 1: Infrastructure Setup

Provision a VM in an EU data center or EU-region cloud (for GDPR):

```
Specs: 8 vCPU, 32GB RAM, 200GB SSD
Region: EU-West (Frankfurt, Dublin, Amsterdam)
OS: Ubuntu 22.04
```

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone Onyx
git clone https://github.com/onyx-dot-app/onyx.git
cd onyx/deployment/docker_compose

# Copy and edit environment
cp .env.example .env
```

Edit `.env` for GDPR-compliant configuration:

```bash
# Use local model (no data leaves server)
GEN_AI_MODEL_PROVIDER=ollama
GEN_AI_API_ENDPOINT=http://host.docker.internal:11434
GEN_AI_MODEL_VERSION=llama3:70b

# Or Azure OpenAI in EU region (data stays in EU)
# GEN_AI_MODEL_PROVIDER=azure
# AZURE_API_BASE=https://your-eu-west.openai.azure.com/
# AZURE_API_KEY=...

# Company SSO
AUTH_TYPE=oidc
OIDC_CLIENT_ID=onyx-app
OIDC_CLIENT_SECRET=...
OIDC_PROVIDER_URL=https://sso.yourcompany.eu/.well-known/openid-configuration

# Disable telemetry
DISABLE_TELEMETRY=true
```

```bash
docker compose -f docker-compose.yml -p onyx up -d
# Access admin at http://your-server:3000/admin
```

## Step 2: Connect Knowledge Sources

### Slack
1. Create Slack App with bot scopes: `channels:history`, `channels:read`, `users:read`
2. Install to workspace → copy Bot Token
3. Admin → Connectors → Slack → paste token
4. Select channels: `#engineering`, `#product`, `#support`, `#general`
5. Sync interval: every 30 minutes

### Confluence
1. Generate API token from Atlassian account
2. Admin → Connectors → Confluence
3. Enter wiki URL + email + API token
4. Select spaces: Engineering, Product, HR, Onboarding

### Google Drive
1. Create GCP service account with domain-wide delegation
2. Scope: `drive.readonly`
3. Upload service account JSON
4. Target: shared drives for each department

### GitHub
1. Create org-level PAT with `repo` scope
2. Admin → Connectors → GitHub → select repositories
3. Indexes: README files, issues, PRs, wiki pages

## Step 3: Configure Access Control

Create document sets per department in Admin → Document Sets:

```
Document Set: "Engineering"
  Sources: Slack #engineering #devops, Confluence Engineering space,
           all GitHub repos
  Access: Engineering group only

Document Set: "Product"
  Sources: Slack #product #feature-requests, Confluence Product space,
           Google Drive Product shared drive
  Access: Product group only

Document Set: "All Company"
  Sources: Slack #general #announcements,
           Confluence Company Handbook,
           Google Drive Public shared drive
  Access: Everyone
```

## Step 4: Create Department Assistants

### Engineering Bot
```
Name: DevBot
System prompt: "You are an engineering assistant. Answer questions about
our codebase, architecture decisions, runbooks, and deployment processes.
Always cite the source document and include the direct link."
Document sets: Engineering + All Company
Model: Llama 3 70B (local)
```

### HR / Onboarding Bot
```
Name: OnboardBot
System prompt: "You help employees find information about company policies,
benefits, tools setup, and team structure. Be friendly and thorough.
If unsure, direct to HR contact."
Document sets: All Company
Model: Llama 3 70B (local)
```

### Support Bot
```
Name: SupportBot
System prompt: "Help support agents find solutions to customer issues.
Search past tickets, documentation, and known issues.
Always include the relevant doc link in your answer."
Document sets: Support + Engineering + All Company
Model: Llama 3 70B (local)
```

## Step 5: GDPR Compliance Checklist

- [x] **Data residency** — All data stored on EU servers under your control
- [x] **No external API calls** — Using local Ollama model (or Azure EU)
- [x] **Access logging** — All queries logged (Admin → Performance → Query Logs)
- [x] **Data retention** — Configure Postgres backup retention policy
- [x] **Right to deletion** — Remove specific documents/connectors on request
- [x] **Centralized auth** — SSO/OIDC, no separate Onyx passwords
- [x] **Telemetry disabled** — `DISABLE_TELEMETRY=true` in .env
- [x] **Encryption at rest** — Encrypted disk volumes on the VM
- [x] **TLS in transit** — Nginx reverse proxy with Let's Encrypt cert

## Step 6: Rollout Plan

| Week | Action |
|------|--------|
| 1 | Deploy + connect Confluence + Slack. Engineering team pilots. |
| 2 | Collect feedback, tune prompts, add Google Drive connector. |
| 3 | Roll out to Product and Support teams. |
| 4 | Company-wide launch with all three assistants. |

## Results (After 1 Month)

- **3,200 queries/week** across 200 employees
- **65% reduction** in "where do I find X?" Slack messages
- **New employee onboarding** knowledge ramp-up cut from 2 weeks to 3 days
- **Support resolution** 40% faster with instant access to past solutions
- **Zero data incidents** — everything stays on-premise

## Maintenance

```bash
# Update Onyx
cd onyx/deployment/docker_compose
docker compose -p onyx pull
docker compose -p onyx up -d

# Daily backup
docker exec onyx-relational_db-1 \
  pg_dump -U postgres danswer > /backups/onyx-$(date +%F).sql

# Monitor health
docker compose -p onyx ps
docker compose -p onyx logs -f api_server --tail=100
```
