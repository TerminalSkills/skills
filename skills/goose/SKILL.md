---
name: goose
description: >-
  Use Block's Goose — an open-source, extensible AI agent that goes beyond code
  suggestions to install software, execute commands, edit files, run tests, and
  manage infrastructure. Use when: setting up Goose, building custom extensions,
  adding MCP tool support, configuring multi-LLM backends, creating task-specific
  agents (DevOps, data pipelines, incident response), or comparing Goose to other
  AI coding agents.
license: Apache-2.0
compatibility: "macOS, Linux, Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["ai-agent", "extensible", "coding-agent"]
---

# Goose — Extensible AI Agent by Block

## Overview

Goose is an open-source AI agent from Block (formerly Square) that operates as a full system agent — not just a code assistant. It can install packages, execute shell commands, edit files, run tests, browse the web, and interact with external services through extensions.

**Repo:** `block/goose`  
**Key differentiator:** Extension system + MCP tool support = unlimited capabilities

## Installation

```bash
# macOS (Homebrew)
brew install block/tap/goose

# Cross-platform (pipx)
pipx install goose-ai

# From source
git clone https://github.com/block/goose.git
cd goose && cargo build --release
```

Verify installation:
```bash
goose --version
```

## Core Concepts

### What Makes Goose Different

Unlike code-only AI tools, Goose has full system agency:

| Capability | Code Assistants | Goose |
|-----------|----------------|-------|
| Code suggestions | ✅ | ✅ |
| File editing | Limited | ✅ Full filesystem |
| Command execution | ❌ | ✅ Shell access |
| Package installation | ❌ | ✅ |
| Web browsing | ❌ | ✅ Via extensions |
| External APIs | ❌ | ✅ MCP tools |
| Custom workflows | ❌ | ✅ Extensions |

### Sessions

Goose maintains session context across interactions:
```bash
# Start new session
goose session

# Resume last session
goose session --resume

# Named session
goose session --name "deploy-v2"
```

## CLI Usage

```bash
# Interactive session
goose session

# One-shot task
goose run "Write unit tests for src/auth.py and run them"

# With specific profile
goose session --profile devops

# Pipe input
echo "Explain this error log" | goose run --stdin
```

### Profiles

Create `~/.config/goose/profiles.yaml`:
```yaml
devops:
  provider: anthropic
  model: claude-sonnet-4-20250514
  extensions:
    - name: ssh-tools
    - name: developer
    - name: jira-mcp

coding:
  provider: openai
  model: gpt-4o
  extensions:
    - name: developer
```

## Multi-LLM Support

Goose supports multiple LLM providers:

```bash
# Configure provider
goose configure

# Supported providers
# - Anthropic (Claude)
# - OpenAI (GPT-4o, o1)
# - Google (Gemini)
# - Ollama (local models)
# - Azure OpenAI
# - AWS Bedrock
```

Set via environment:
```bash
export GOOSE_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-...
```

## Extension System

Extensions give Goose new capabilities. They run as separate processes communicating via the Model Context Protocol (MCP).

### Built-in Extensions

| Extension | Capabilities |
|-----------|-------------|
| `developer` | Shell, file editing, code analysis |
| `web` | Browse pages, extract content |
| `computeruse` | GUI interaction, screenshots |
| `memory` | Persistent memory across sessions |

Enable extensions:
```bash
goose configure extensions
# Interactive selection of extensions
```

### MCP Tool Integration

Goose natively supports MCP (Model Context Protocol) servers as extensions, connecting it to databases, APIs, and services:

```yaml
# ~/.config/goose/profiles.yaml
default:
  provider: anthropic
  model: claude-sonnet-4-20250514
  extensions:
    - name: developer
    - name: jira-mcp
      type: mcp
      command: npx
      args: ["-y", "@modelcontextprotocol/server-jira"]
      env:
        JIRA_URL: "https://myteam.atlassian.net"
        JIRA_TOKEN: "${JIRA_TOKEN}"
    - name: postgres-mcp
      type: mcp
      command: npx
      args: ["-y", "@modelcontextprotocol/server-postgres"]
      env:
        DATABASE_URL: "${DATABASE_URL}"
```

### Building Custom Extensions

Create an extension in Python:

```python
# my_extension.py
from goose.extension import Extension, tool

class HealthChecker(Extension):
    """Check service health endpoints."""

    @tool
    def check_health(self, url: str) -> str:
        """Check if a service is healthy by hitting its /health endpoint."""
        import requests
        try:
            r = requests.get(f"{url}/health", timeout=5)
            return f"Status: {r.status_code}, Response: {r.json()}"
        except Exception as e:
            return f"Health check failed: {e}"

    @tool
    def check_multiple(self, urls: list[str]) -> str:
        """Check health of multiple services."""
        results = []
        for url in urls:
            status = self.check_health(url)
            results.append(f"{url}: {status}")
        return "\n".join(results)
```

Register in profile:
```yaml
default:
  extensions:
    - name: health-checker
      type: mcp
      command: python
      args: ["my_extension.py"]
```

## Common Workflows

### DevOps Incident Response
```
> goose session --profile devops

You: SSH into prod-web-01, check the nginx logs for 5xx errors
     in the last hour, and create a Jira ticket if there are more than 10

Goose: [uses ssh-tools to connect]
       [runs: grep "HTTP/1.1\" 5" /var/log/nginx/access.log | tail -60]
       [finds 47 5xx errors]
       [creates JIRA ticket OPS-1234 with error summary]
       Found 47 5xx errors in the last hour. Created OPS-1234.
```

## Tips

- Use `--verbose` flag to see what tools Goose is calling
- Set `GOOSE_LOG=debug` for detailed extension communication logs
- Extensions run in sandboxed processes — a crash won't kill Goose
- Use profiles to switch between provider/extension combos quickly
- Goose respects `.gooseignore` files (like `.gitignore`) to exclude files from context
