---
title: "Build an Extensible AI Agent with Goose"
description: >-
  Build an incident response agent with Goose that checks logs over SSH,
  proposes a fix for your approval, and files a Jira ticket through a small
  MCP server you write yourself, all from one recipe.
skills: [goose, mcp-server-builder]
difficulty: intermediate
time: "45 minutes"
metadata:
  author: terminal-skills
  tags: ["goose", "ai-agent", "devops", "incident-response", "mcp", "automation"]
---

# Build an Extensible AI Agent with Goose

## The Situation

Dmitri is a DevOps engineer at a SaaS company running a dozen services on AWS. When an alert fires, he SSHes into the affected server, reads logs, checks memory and disk, finds the cause, restarts a service, verifies recovery, and then writes a Jira ticket. Every step is the same each time; the ticket alone costs him a quarter of an hour at 3 AM.

**Goal:** a Goose recipe that does the investigation and the paperwork, while Dmitri approves every command that changes something.

## What You'll Build

- A recipe, `incident-responder.yaml`, with the incident playbook as its instructions
- Shell and SSH access through Goose's built-in `developer` extension
- A custom Jira extension: a ~50-line MCP server (Python, `mcp` 2.x) that Goose starts as a `stdio` extension
- Approval mode on, so restarts and other writes wait for a yes

## Step 1: Install Goose

Goose is a single Rust binary, so there is no Python package to install for it.

```bash
brew install block-goose-cli     # macOS and Linux with Homebrew
goose --version
goose configure                  # choose a provider and paste its API key
goose doctor                     # confirms the setup works
```

The project also ships an install script on its GitHub releases page, but releases carry no checksum file, so do not pipe it into a shell. Provider keys belong in the environment or the system keyring, never in the recipe or `config.yaml`:

```bash
export GOOSE_PROVIDER=anthropic
export GOOSE_MODEL=claude-sonnet-5-5
export ANTHROPIC_API_KEY="$(cat ~/.secrets/anthropic)"
export GOOSE_MODE=approve        # ask before every tool call; smart_approve asks only for risky ones
```

## Step 2: SSH Access

The `developer` extension runs shell commands, so `ssh` works with no extra setup. Use a dedicated key with a restricted account:

```bash
ssh-add ~/.ssh/incident_key
ssh deploy@prod-api-01 "hostname && uptime"
```

With `GOOSE_MODE=approve` Goose shows each command before it runs. Keep the approvals on for production: the default mode (`auto`) runs commands without asking.

## Step 3: Write the Jira Extension as an MCP Server

There is no official `@modelcontextprotocol/server-jira` npm package, so write the small server you need with the `mcp-server-builder` approach. In Python, the 2.x SDK calls the server class `MCPServer`:

```bash
mkdir -p /opt/incident-tools && cd /opt/incident-tools || exit 1
python3 -m venv .venv
.venv/bin/pip install "mcp>=2,<3" httpx
```

```python
# /opt/incident-tools/jira_mcp.py
import os

import httpx
from mcp.server import MCPServer

mcp = MCPServer("jira-incidents")


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=os.environ["JIRA_BASE_URL"].rstrip("/") + "/rest/api/3",
        auth=(os.environ["JIRA_USER_EMAIL"], os.environ["JIRA_API_TOKEN"]),
        timeout=15,
    )


@mcp.tool()
def create_incident(project_key: str, summary: str, details: str, priority: str = "High") -> str:
    """Create a Jira Task for an incident. details is the plain-text timeline and root cause."""
    body = {"fields": {
        "project": {"key": project_key},
        "issuetype": {"name": "Task"},
        "summary": f"[INCIDENT] {summary}"[:250],
        "priority": {"name": priority},
        "description": {  # Jira Cloud wants Atlassian Document Format, not plain text
            "type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": line}]}
                        for line in details.splitlines() if line.strip()],
        },
    }}
    with _client() as c:
        r = c.post("/issue", json=body)
    return f"Created {r.json()['key']}" if r.status_code == 201 else f"Jira error {r.status_code}: {r.text[:300]}"


@mcp.tool()
def find_open_incidents(project_key: str) -> str:
    """List open issues in a project whose summary mentions INCIDENT."""
    jql = f'project = "{project_key}" AND statusCategory != Done AND summary ~ "INCIDENT" ORDER BY created DESC'
    with _client() as c:
        r = c.post("/search/jql", json={"jql": jql, "fields": ["summary", "status"], "maxResults": 20})
    if r.status_code != 200:
        return f"Jira error {r.status_code}: {r.text[:300]}"
    rows = [f"{i['key']} [{i['fields']['status']['name']}] {i['fields']['summary']}" for i in r.json()["issues"]]
    return "\n".join(rows) or "None open."


if __name__ == "__main__":
    mcp.run()   # stdio, launched by Goose
```

The search uses `POST /rest/api/3/search/jql`, because the old `/search` endpoint is being removed. Create an API token at `https://id.atlassian.com/manage-profile/security/api-tokens` and export the three variables the server reads:

```bash
export JIRA_BASE_URL="https://yourteam.atlassian.net"
export JIRA_USER_EMAIL="dmitri@example.com"
export JIRA_API_TOKEN="$(cat ~/.secrets/jira-token)"
```

Test the server on its own with the MCP Inspector before wiring it into Goose: `npx @modelcontextprotocol/inspector /opt/incident-tools/.venv/bin/python /opt/incident-tools/jira_mcp.py`, connect, and call `find_open_incidents`.

## Step 4: Write the Recipe

Goose has no `profiles.yaml` and no `--profile` flag. A reusable agent setup is a recipe: a `.yaml` file (`.yml` is not supported) with instructions, parameters and extensions.

```yaml
# incident-responder.yaml
version: "1.0.0"
title: "Incident responder"
description: "Investigate an alert on one server, propose a fix, and file a Jira ticket"
parameters:
  - key: host
    input_type: string
    requirement: required
    description: "Server named in the alert, for example prod-api-01"
  - key: alert
    input_type: string
    requirement: required
    description: "The alert text"
  - key: project
    input_type: string
    requirement: optional
    default: "OPS"
    description: "Jira project key for the ticket"
instructions: |
  You are an incident response agent. Servers are reached as `ssh deploy@<host>`
  with the key already loaded in the SSH agent.
  Playbook:
  1. Read the last 15 minutes of the app log (/var/log/app/app.log) and
     `journalctl -u app-api --since "15 min ago"`.
  2. Check resources: `free -h`, `df -h`, `ps aux --sort=-%mem | head`.
  3. State the root cause and the single change you propose. Wait for approval.
  4. After the fix, verify with the service health endpoint.
  5. Call create_incident with the timeline and root cause.
  Run only read-only commands until the fix is approved. Never delete files.
prompt: "Alert: {{ alert }}. Investigate {{ host }} and, when done, file a ticket in project {{ project }}."
extensions:
  - type: builtin
    name: developer
  - type: stdio
    name: jira
    cmd: /opt/incident-tools/.venv/bin/python
    args: ["/opt/incident-tools/jira_mcp.py"]
    env_keys: [JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN]
    timeout: 60
    description: "Create and list incident tickets in Jira"
```

`env_keys` makes Goose read each value from the environment (or its secret store) when it starts the extension. Check the file before using it:

```bash
goose recipe validate incident-responder.yaml
goose run --recipe incident-responder.yaml --explain
```

## Step 5: Run It on an Alert

```bash
goose run --recipe incident-responder.yaml --interactive -n incident-api-502 --max-turns 40 \
  --params host=prod-api-01 \
  --params alert="502 on 23% of requests for 5 minutes"
```

`--max-turns 40` caps the loop. `--interactive` keeps the session open after the first pass, so Dmitri can approve the restart and ask follow-ups. A session started with `-n` can be reopened with `goose session --resume -n incident-api-502`.

An illustrative run (your output depends on the server and the model):

```console
Goose: I'll start with read-only checks on prod-api-01.
  [approve?] ssh deploy@prod-api-01 "tail -100 /var/log/app/app.log | grep -i error"
  -> MemoryError: Cannot allocate 256MB ... Worker pid 4523 killed (OOM)
  [approve?] ssh deploy@prod-api-01 "free -h"
  -> Mem: 8.0Gi total, 7.6Gi used, 180Mi available
Root cause: memory exhaustion from leftover workers after a failed deploy.
Proposed fix: sudo systemctl restart app-api. Approve?
You: yes
  [approve?] ssh deploy@prod-api-01 "sudo systemctl restart app-api"
  [approve?] ssh deploy@prod-api-01 "curl -s 127.0.0.1:8000/health"  -> {"status": "healthy"}
  [jira] create_incident -> Created OPS-847
```

## Step 6: Extend It

More extensions are added the same way. A one-off MCP server on the command line: `goose session --with-extension "uvx mcp-server-fetch"`. A shared remote MCP server goes in the recipe as `type: streamable_http` with a `uri`; SSE extensions are no longer supported. To expose only part of a server, list `available_tools` on the extension. For a read-only P3 variant, copy the recipe, drop the `jira` extension and change the instructions.

## Results

For the example team, the investigation and ticket steps move from typing to approving commands: Dmitri reads one root-cause summary, says yes to the restart, and the ticket is filed with the timeline already written. Treat any time saving as something to measure on your own incidents; the approvals are the point, not the speed.

## Tips

- Start read-only: give the agent log access first, add restart rights once you trust the playbook.
- Keep `GOOSE_MODE=approve` or `smart_approve` for anything that touches production; run unattended jobs in a container or throwaway VM.
- Cap loops with `--max-turns`; add `--debug` to see full tool parameters.
- Give each extension only the environment variables it needs, and never put keys in a recipe or the repo.
- Export or review the session after an incident (`goose session list`) for the post-mortem.

## Related Skills

- [goose](/skills/goose): installs Goose, runs the recipe, sets the approval mode and registers the extension.
- [mcp-server-builder](/skills/mcp-server-builder): the pattern for the Python Jira MCP server in Step 3.
