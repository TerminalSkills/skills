---
name: pentagi
description: >-
  Run AI-powered penetration testing with PentAGI. Use when a user asks to
  automate security testing, set up autonomous pentesting, deploy an AI-driven
  vulnerability scanner, build a self-hosted security testing platform, or
  conduct penetration tests with LLM-powered agents.
license: Apache-2.0
compatibility: 'Docker, any LLM provider (OpenAI, Anthropic, Ollama, Bedrock, Gemini, DeepSeek)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - pentagi
    - penetration-testing
    - security
    - ai-agents
    - autonomous
    - vulnerability
---

# PentAGI

## Overview

PentAGI is a fully autonomous AI agent system for penetration testing. It deploys a multi-agent architecture where specialized AI agents (research, development, infrastructure) collaborate to plan, execute, and report security assessments. All operations run in sandboxed Docker containers with 20+ professional security tools (nmap, metasploit, sqlmap, nikto, gobuster, etc.). Features a knowledge graph (Neo4j + Graphiti) for persistent learning across engagements, web intelligence via built-in browser, and comprehensive monitoring with Grafana/Langfuse. Self-hosted — your data stays on your infrastructure.

## Instructions

### Step 1: Quick Deployment

```bash
# Clone the repository
git clone https://github.com/vxcontrol/pentagi.git
cd pentagi

# Copy and configure environment
cp .env.example .env
```

```bash
# .env — Essential configuration
# LLM Provider (choose one)
OPENAI_API_KEY=sk-...                    # OpenAI
# ANTHROPIC_API_KEY=sk-ant-...           # Anthropic
# OLLAMA_SERVER_URL=http://host:11434    # Local Ollama

# Primary model for the main agent
LLM_MODEL=gpt-4o                         # or claude-3-5-sonnet, llama3.1
LLM_PROVIDER=openai                       # openai, anthropic, ollama, bedrock, gemini, deepseek

# Search provider for web intelligence
TAVILY_API_KEY=tvly-...                   # Tavily (recommended)
# GOOGLE_SEARCH_API_KEY=...              # or Google Custom Search
# SEARXNG_URL=http://localhost:8080      # or self-hosted SearXNG

# Security — change these in production
POSTGRES_PASSWORD=your-secure-password
SECRET_KEY=your-secret-key-min-32-chars
```

```bash
# Deploy the full stack
docker compose up -d

# Access the web UI
open http://localhost:3000
```

The stack deploys: React frontend, Go backend (GraphQL API), PostgreSQL with pgvector, Neo4j knowledge graph, security tools container, web scraper, and monitoring (Grafana + Langfuse).

### Step 2: Configure AI Agents

PentAGI uses a team of specialized agents that collaborate on the assessment.

```yaml
# Agent architecture (configured via UI or API)
#
# Primary Agent (Orchestrator)
#   ├── Researches target, plans attack phases
#   ├── Delegates to specialists:
#   │   ├── Research Agent — OSINT, web scraping, CVE lookup
#   │   ├── Development Agent — exploit modification, payload crafting
#   │   └── Infrastructure Agent — container management, tool setup
#   ├── Executes security tools in sandboxed containers
#   └── Generates vulnerability reports
#
# Each agent has access to:
#   - 20+ security tools (nmap, metasploit, sqlmap, nikto, etc.)
#   - Web browser for research
#   - Knowledge graph for persistent memory
#   - Previous engagement learnings
```

### Step 3: Start a Penetration Test via Web UI

```text
1. Open http://localhost:3000
2. Create a new engagement:
   - Target: IP address, domain, or CIDR range
   - Scope: Which services/ports to test
   - Rules of engagement: What's allowed (e.g., no DoS, no data exfiltration)
   - Objective: "Full security assessment" or specific focus
3. The AI agent:
   - Performs reconnaissance (nmap, whois, DNS enumeration)
   - Identifies services and versions
   - Searches for known vulnerabilities (CVE databases)
   - Attempts exploitation with appropriate tools
   - Documents findings with evidence
   - Generates a vulnerability report
```

### Step 4: GraphQL API Integration

```typescript
// Integrate PentAGI into your security pipeline via GraphQL
const PENTAGI_URL = 'http://localhost:3000/graphql'

// Create a new engagement
const createEngagement = await fetch(PENTAGI_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_TOKEN}`,
  },
  body: JSON.stringify({
    query: `
      mutation CreateTask($input: CreateTaskInput!) {
        createTask(input: $input) {
          id
          status
          createdAt
        }
      }
    `,
    variables: {
      input: {
        target: '192.168.1.0/24',
        objective: 'Perform a comprehensive security assessment of the internal network segment. Focus on identifying exposed services, default credentials, unpatched vulnerabilities, and potential lateral movement paths.',
        scope: ['port-scan', 'service-enum', 'vuln-scan', 'web-app-test'],
        constraints: ['no-dos', 'no-data-exfil', 'business-hours-only'],
      },
    },
  }),
})

// Monitor progress
const checkStatus = await fetch(PENTAGI_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_TOKEN}` },
  body: JSON.stringify({
    query: `
      query TaskStatus($id: ID!) {
        task(id: $id) {
          id
          status
          progress
          currentPhase
          findings {
            severity
            title
            description
            evidence
            remediation
          }
          logs {
            timestamp
            agent
            action
            output
          }
        }
      }
    `,
    variables: { id: engagement.id },
  }),
})
```

### Step 5: Knowledge Graph — Persistent Learning

```text
# PentAGI remembers findings across engagements via Neo4j + Graphiti
#
# After each engagement, the knowledge graph stores:
# - Vulnerability patterns found per technology stack
# - Successful exploitation techniques
# - Network topology relationships
# - Service fingerprints and their known weaknesses
#
# In future engagements, the agent queries this knowledge to:
# - Prioritize attack vectors that worked before on similar targets
# - Skip techniques known to fail on specific configurations
# - Correlate findings across multiple assessments
# - Identify systemic issues across the organization
```

### Step 6: Monitoring and Reporting

```bash
# Grafana dashboards — real-time monitoring
open http://localhost:3001
# Dashboards include:
# - Active agent operations and tool execution
# - Token usage and LLM cost tracking
# - Container resource utilization
# - Engagement timeline and progress

# Langfuse — LLM observability
open http://localhost:3002
# Track:
# - Agent reasoning chains
# - Prompt effectiveness
# - Token usage per engagement phase
# - Model performance comparison
```

```bash
# Export vulnerability report
curl -H "Authorization: Bearer $API_TOKEN" \
  "http://localhost:3000/api/v1/tasks/$TASK_ID/report" \
  -o vulnerability-report.pdf

# Report includes:
# - Executive summary
# - Detailed findings with CVSS scores
# - Evidence (screenshots, command output)
# - Remediation recommendations
# - Risk matrix
```

## Guidelines

- **Always get written authorization** before running PentAGI against any target. Unauthorized penetration testing is illegal.
- Deploy on an isolated network segment — PentAGI's sandboxed containers contain offensive tools.
- Use `constraints` to enforce rules of engagement — prevent DoS, data exfiltration, or out-of-scope testing.
- Start with `Ollama` for local/private assessments — no data leaves your infrastructure.
- The knowledge graph improves over time — run PentAGI consistently to build organizational security intelligence.
- Review agent actions in real-time via the web UI — autonomous doesn't mean unsupervised.
- PentAGI complements manual testing — use it for initial reconnaissance and known vulnerability scanning, then have humans investigate complex logic flaws.
- Resource requirements: 8GB+ RAM, 4+ CPU cores. GPU optional (only for local LLM via Ollama).
- Langfuse integration helps optimize LLM costs — track which models give best results per phase.
