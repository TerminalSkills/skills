---
title: "Build an Extensible AI Agent with Goose"
description: >-
  Build an AI-powered incident response agent using Goose that can SSH into
  servers, check logs, restart services, and create Jira tickets from one
  chat interface. Reduce incident response time from 45 minutes to 8 minutes.
skills: [goose, mcp-server]
difficulty: intermediate
time: "45 minutes"
metadata:
  author: terminal-skills
  tags: ["goose", "ai-agent", "devops", "incident-response", "mcp", "automation"]
---

# Build an Extensible AI Agent with Goose

## The Situation

Dmitri is a DevOps engineer at a SaaS company running 12 microservices on AWS. When an alert fires, his current workflow is:

1. SSH into the affected server (2 min)
2. Check application logs for errors (5 min)
3. Check system metrics — CPU, memory, disk (3 min)
4. Identify root cause from logs (10 min)
5. Restart service or apply fix (5 min)
6. Verify recovery (5 min)
7. Create Jira ticket with full incident report (15 min)

**Total: ~45 minutes per incident.** With 3-4 incidents per week, that's 6-8 hours of repetitive work.

**Goal:** Build a Goose-powered agent that handles steps 1-7 from a single chat, cutting response time to under 10 minutes.

## What You'll Build

A Goose profile called "incident-responder" with:
- SSH access to production servers
- Jira integration via MCP for ticket creation
- Custom health-check extension
- Pre-built incident response playbooks

## Step 1 — Install Goose

```bash
# macOS
brew install block/tap/goose

# Linux / cross-platform
pipx install goose-ai

# Verify
goose --version
```

Set up your LLM provider:
```bash
export GOOSE_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Or use the interactive setup
goose configure
```

## Step 2 — Configure SSH Extension

Goose's built-in `developer` extension already has shell access. For remote servers, set up SSH keys:

```bash
# Ensure SSH keys are configured for your servers
ssh-add ~/.ssh/prod_key

# Test direct access
ssh deploy@prod-web-01 "hostname && uptime"
```

No special Goose extension needed — the `developer` extension executes shell commands including SSH.

## Step 3 — Add Jira MCP Tool

Install the Jira MCP server:
```bash
npm install -g @modelcontextprotocol/server-jira
```

Get a Jira API token from: https://id.atlassian.com/manage-profile/security/api-tokens

```bash
export JIRA_URL="https://yourteam.atlassian.net"
export JIRA_EMAIL="dmitri@company.com"
export JIRA_TOKEN="your-api-token"
```

## Step 4 — Create the Incident Responder Profile

Create `~/.config/goose/profiles.yaml`:

```yaml
incident-responder:
  provider: anthropic
  model: claude-sonnet-4-20250514
  extensions:
    - name: developer
    - name: jira
      type: mcp
      command: npx
      args: ["-y", "@modelcontextprotocol/server-jira"]
      env:
        JIRA_URL: "${JIRA_URL}"
        JIRA_EMAIL: "${JIRA_EMAIL}"
        JIRA_TOKEN: "${JIRA_TOKEN}"
  system_prompt: |
    You are an incident response agent for a SaaS platform.

    ## Servers
    - prod-web-01, prod-web-02: Nginx + Node.js frontend
    - prod-api-01, prod-api-02: Python FastAPI backend
    - prod-db-01: PostgreSQL primary
    - prod-redis-01: Redis cache

    ## SSH Access
    User: deploy, Key: default SSH agent

    ## Log Locations
    - Nginx: /var/log/nginx/access.log, error.log
    - App: /var/log/app/app.log
    - System: journalctl -u <service>

    ## Playbook
    1. SSH into affected server
    2. Check recent error logs (last 15 minutes)
    3. Check system resources (free -h, df -h, top -bn1)
    4. Identify root cause
    5. Apply fix (restart service if needed: sudo systemctl restart <service>)
    6. Verify recovery (curl health endpoint)
    7. Create Jira ticket in OPS project with:
       - Title: [INCIDENT] <brief description>
       - Priority based on severity
       - Full timeline and root cause in description
```

## Step 5 — Test with a Real Scenario

Launch the incident responder:
```bash
goose session --profile incident-responder --name "incident-$(date +%s)"
```

### Scenario: API Returning 502 Errors

```
You: Monitoring alert: prod-api-01 returning 502 errors.
     Rate: 23% of requests in last 5 minutes. Investigate and fix.

Goose: I'll investigate the 502 errors on prod-api-01.

[Executing: ssh deploy@prod-api-01 "tail -100 /var/log/app/app.log | grep -i error"]

Found multiple OOM errors:
  MemoryError: Cannot allocate 256MB for request processing
  Worker pid:4523 exited with code 137 (OOM killed)

[Executing: ssh deploy@prod-api-01 "free -h"]
  Total: 8GB, Used: 7.6GB, Available: 180MB

Root cause: Memory exhaustion. Checking what's consuming memory...

[Executing: ssh deploy@prod-api-01 "ps aux --sort=-%mem | head -10"]

Found: 3 zombie worker processes consuming 2GB each from a failed deployment.

[Executing: ssh deploy@prod-api-01 "sudo systemctl restart app-api"]

Service restarted. Verifying...

[Executing: ssh deploy@prod-api-01 "curl -s localhost:8000/health"]
  {"status": "healthy", "memory_usage": "42%"}

[Executing: curl -s https://api.company.com/health]
  {"status": "healthy", "response_time_ms": 45}

Service recovered. Creating Jira ticket...

[Creates Jira ticket OPS-847]:
  Title: [INCIDENT] prod-api-01 502 errors — OOM from zombie workers
  Priority: High
  Description: Full timeline, root cause, and resolution steps

✅ Incident resolved. Jira ticket: OPS-847
   Total time: ~3 minutes
```

## Step 6 — Add Custom Health Check Extension

For proactive monitoring, create a custom extension:

Save as `~/.config/goose/extensions/health_checker.py`:
```python
import json
import subprocess

def check_all_services():
    """Check health of all production services."""
    services = {
        "web-01": "https://prod-web-01.internal:443/health",
        "web-02": "https://prod-web-02.internal:443/health",
        "api-01": "http://prod-api-01.internal:8000/health",
        "api-02": "http://prod-api-02.internal:8000/health",
    }
    results = {}
    for name, url in services.items():
        try:
            r = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", url],
                capture_output=True, text=True
            )
            code = int(r.stdout.strip())
            results[name] = {"status": "healthy" if code == 200 else "unhealthy", "code": code}
        except Exception as e:
            results[name] = {"status": "error", "error": str(e)}
    return json.dumps(results, indent=2)

if __name__ == "__main__":
    print(check_all_services())
```

Add to the profile:
```yaml
incident-responder:
  extensions:
    # ... existing extensions ...
    - name: health-check
      type: mcp
      command: python
      args: ["~/.config/goose/extensions/health_checker.py"]
```

## Results

| Metric | Before (Manual) | After (Goose) |
|--------|-----------------|---------------|
| Response time | ~45 min | ~8 min |
| SSH + log check | 10 min | 30 sec (automated) |
| Root cause analysis | 10 min | 2 min (AI-assisted) |
| Jira documentation | 15 min | 30 sec (auto-generated) |
| Weekly time spent | 6-8 hours | 1-1.5 hours |
| Consistency | Varies by engineer | Standardized playbook |

**Key win:** Dmitri now handles incidents from his phone using Goose's chat interface. The agent does the SSH work, he reviews and approves the fix. Jira tickets are created automatically with full context — no more writing incident reports at 3 AM.

## Tips

- **Start small:** Begin with read-only access (log checking), then add write actions (restarts)
- **Use named sessions:** `--name "incident-123"` lets you resume context if disconnected
- **Audit trail:** Goose logs every command it runs — export session logs for compliance
- **Safety:** Add confirmation prompts for destructive actions in the system prompt
- **Multiple profiles:** Create separate profiles for different severity levels (P1 gets more aggressive, P3 is read-only)
