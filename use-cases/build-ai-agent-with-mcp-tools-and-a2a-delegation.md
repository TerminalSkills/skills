---
title: Build an AI Agent System with MCP Tools and A2A Delegation
slug: build-ai-agent-with-mcp-tools-and-a2a-delegation
description: Build a multi-agent system where a coordinator agent uses MCP servers for local tool access (database, files, APIs) and delegates specialized tasks to external agents via A2A protocol — creating a composable AI architecture where agents discover, communicate, and collaborate across organizational boundaries.
skills: [mcp-server-builder, a2a-protocol, openai-agents, langfuse, fastmcp]
category: data-ai
tags: [mcp, a2a, multi-agent, tools, interoperability, protocol]
---

# Build an AI Agent System with MCP Tools and A2A Delegation

Leo manages DevOps at a 50-person startup. The team has scattered tooling: Jira for tasks, GitHub for code, Datadog for monitoring, PagerDuty for incidents, and Confluence for docs. Each tool has its own interface, and context switching kills productivity. Leo wants a single AI assistant that reaches the internal tools through MCP and delegates specialized work (code review, security scanning) to external AI agents over A2A.

The two protocols do different jobs. **MCP** connects an agent to tools and data it controls: a server exposes functions, the agent calls them. **A2A** (Agent2Agent) connects an agent to another agent that it does not control: the remote agent publishes an Agent Card, takes a task, and returns artifacts without exposing its internals. The coordinator below uses both, in Python, with `mcp` 2.3, `fastmcp` 4.1, `a2a-sdk` 1.3, `openai-agents` 0.24 and `langfuse` 5.2 (Python 3.11 or newer, which Langfuse 5 requires).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install mcp fastmcp "a2a-sdk[http-server]" openai-agents langfuse openinference-instrumentation-openai-agents httpx
```

## Step 1: MCP Servers for Internal Tools

The **mcp-server-builder** skill covers the official SDK. In Python v2 the server class is `mcp.server.MCPServer` (the old `mcp.server.fastmcp` module is gone). Logging must go to stderr: a stray `print` corrupts the stdio stream. The Jira server uses the Jira Cloud REST v3 API with an API token (Basic auth: account email plus token). Descriptions must be Atlassian Document Format, priorities are `Highest/High/Medium/Low/Lowest`, and the search endpoint is `/rest/api/3/search/jql`.

```python
# mcp_servers/jira_server.py - MCP server for Jira Cloud (stdio)
import os

import httpx
from mcp.server import MCPServer

mcp = MCPServer("jira")

BASE = os.environ["JIRA_BASE_URL"]  # https://<your-site>.atlassian.net
AUTH = (os.environ.get("JIRA_EMAIL", ""), os.environ.get("JIRA_API_TOKEN", ""))


def _adf(text: str) -> dict:
    """Jira Cloud v3 wants descriptions in Atlassian Document Format."""
    return {"type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


@mcp.tool()
async def create_ticket(project: str, title: str, issue_type: str = "Task",
                        description: str = "", priority: str = "Medium") -> str:
    """Create a Jira ticket.

    Args:
        project: Project key, for example DEV.
        title: One-line summary.
        issue_type: Bug, Story or Task (names must exist in the project).
        description: Plain-text details.
        priority: Highest, High, Medium, Low or Lowest.
    """
    fields = {"project": {"key": project}, "summary": title,
              "issuetype": {"name": issue_type}, "priority": {"name": priority}}
    if description:
        fields["description"] = _adf(description)
    async with httpx.AsyncClient(base_url=BASE, auth=AUTH, timeout=15) as client:
        resp = await client.post("/rest/api/3/issue", json={"fields": fields})
        resp.raise_for_status()
    return f"Created {resp.json()['key']}: {title}"


@mcp.tool()
async def search_tickets(jql: str, max_results: int = 10) -> str:
    """Search Jira tickets with JQL, for example: project = DEV AND statusCategory != Done."""
    async with httpx.AsyncClient(base_url=BASE, auth=AUTH, timeout=15) as client:
        resp = await client.get("/rest/api/3/search/jql", params={
            "jql": jql, "maxResults": max_results, "fields": "summary,status"})
        resp.raise_for_status()
    rows = [f"{i['key']} [{i['fields']['status']['name']}] {i['fields']['summary']}"
            for i in resp.json()["issues"]]
    return "\n".join(rows) or "No tickets found."


if __name__ == "__main__":
    mcp.run()  # stdio
```

The **fastmcp** skill is the shorter route when a server is a handful of functions: the schema comes from type hints and the docstring. This GitHub server is read-only, so a prompt-injected agent can not push or merge through it.

```python
# mcp_servers/github_server.py - read-only GitHub tools written with FastMCP
import os

import httpx
from fastmcp import FastMCP

mcp = FastMCP("github", instructions="Read-only view of recent pull requests.")
HEADERS = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
           "Authorization": f"Bearer {os.environ.get('GITHUB_TOKEN', '')}"}


@mcp.tool
async def recent_merged_prs(repo: str, limit: int = 5) -> list[dict]:
    """List the most recently merged pull requests of a repository.

    Args:
        repo: owner/name, for example acme/api.
        limit: How many pull requests to return.
    """
    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        resp = await client.get(f"https://api.github.com/repos/{repo}/pulls",
                                params={"state": "closed", "sort": "updated",
                                        "direction": "desc", "per_page": 30})
        resp.raise_for_status()
    merged = [p for p in resp.json() if p.get("merged_at")]
    return [{"number": p["number"], "title": p["title"], "merged_at": p["merged_at"],
             "url": p["html_url"], "branch": p["head"]["ref"]} for p in merged[:limit]]


if __name__ == "__main__":
    mcp.run()  # stdio
```

Secrets (`JIRA_API_TOKEN`, `GITHUB_TOKEN`) come from the environment, never from the code. Check each server before wiring it in: `npx @modelcontextprotocol/inspector python mcp_servers/jira_server.py`, then Connect and open the Tools tab. Do not test by piping raw JSON into stdin, because v2 servers negotiate the protocol first.

## Step 2: A2A Client for External Agent Delegation

The **a2a-protocol** skill covers the current v1.0 SDK. Most older tutorials show `A2AClient`, `TextPart` and `/.well-known/agent.json`; none of those exist in `a2a-sdk` 1.x. The client fetches the Agent Card from `/.well-known/agent-card.json`, picks a transport it supports and streams back responses. Each `StreamResponse` holds exactly one of `task`, `message`, `status_update` or `artifact_update`.

```python
# a2a_delegate.py - call a remote A2A agent (a2a-sdk 1.x)
from a2a.client import create_client
from a2a.helpers import get_artifact_text, new_text_message
from a2a.types import Role, SendMessageRequest


async def ask_agent(base_url: str, text: str) -> str:
    client = await create_client(base_url)  # fetches /.well-known/agent-card.json
    try:
        answer = ""
        request = SendMessageRequest(message=new_text_message(text, role=Role.ROLE_USER))
        async for chunk in client.send_message(request):  # StreamResponse objects
            if chunk.HasField("artifact_update"):
                answer += get_artifact_text(chunk.artifact_update.artifact)
            elif chunk.HasField("message"):
                answer = chunk.message.parts[0].text
        return answer
    finally:
        await client.close()
```

Only point the client at agents you trust: their output goes into your coordinator's context, so treat it as untrusted text, and never let it trigger writes without a confirmation.

## Step 3: The Coordinator

The **openai-agents** skill covers the SDK. Remote agents become `@function_tool` functions; MCP servers are started as stdio child processes with `MCPServerStdio(params={...})` and passed in `mcp_servers`. The instructions ask for confirmation before creating a ticket, so the one write tool is not called on its own. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `REVIEW_AGENT_URL` and `SECURITY_AGENT_URL` before running.

```python
# coordinator.py - one agent: MCP servers for internal tools, A2A for external agents
import asyncio
import os
import sys

from agents import Agent, Runner, function_tool
from agents.mcp import MCPServerStdio
from langfuse import get_client, observe
from openinference.instrumentation.openai_agents import OpenAIAgentsInstrumentor

from a2a_delegate import ask_agent

OpenAIAgentsInstrumentor().instrument()  # OpenAI Agents SDK spans -> OpenTelemetry -> Langfuse

REVIEW_AGENT_URL = os.environ["REVIEW_AGENT_URL"]      # base URL of the agent's Agent Card host
SECURITY_AGENT_URL = os.environ["SECURITY_AGENT_URL"]


@function_tool
async def delegate_code_review(pr_url: str, focus_areas: str = "") -> str:
    """Delegate a pull request review to the external code review agent.

    Args:
        pr_url: GitHub pull request URL.
        focus_areas: What the review should concentrate on.
    """
    prompt = f"Review this PR: {pr_url}. Focus: {focus_areas or 'general quality'}"
    return await asyncio.wait_for(ask_agent(REVIEW_AGENT_URL, prompt), timeout=120)


@function_tool
async def delegate_security_scan(repo_url: str, branch: str = "main") -> str:
    """Delegate a security scan to the external scanning agent.

    Args:
        repo_url: Repository URL to scan.
        branch: Branch to scan.
    """
    prompt = f"Run a security scan on {repo_url} branch {branch}"
    return await asyncio.wait_for(ask_agent(SECURITY_AGENT_URL, prompt), timeout=300)


def stdio(script: str) -> MCPServerStdio:
    # The child process inherits only what you pass; JIRA_*/GITHUB_TOKEN come from the parent env.
    return MCPServerStdio(params={"command": sys.executable, "args": [script],
                                  "env": {k: v for k, v in os.environ.items()
                                          if k.startswith(("JIRA_", "GITHUB_"))}})


@observe(name="coordinator-session")
async def handle_request(user_input: str) -> str:
    async with stdio("mcp_servers/jira_server.py") as jira, \
               stdio("mcp_servers/github_server.py") as github:
        coordinator = Agent(
            name="DevOps Coordinator",
            instructions=(
                "You are a DevOps assistant with Jira and GitHub tools, plus two external agents "
                "(code review, security scan) reached through tools. For incidents, list recently "
                "merged PRs, then search Jira for related tickets. Delegate PR reviews and security "
                "scans to the external agents. Ask before creating a ticket."),
            mcp_servers=[jira, github],
            tools=[delegate_code_review, delegate_security_scan],
            model=os.environ["OPENAI_MODEL"],   # a model your OpenAI account can use
        )
        result = await Runner.run(coordinator, user_input)
        return result.final_output


if __name__ == "__main__":
    print(asyncio.run(handle_request(
        "Error rates spiked at 3 AM. Which PRs merged in acme/api recently, and are there "
        "open Jira tickets about it?")))
    get_client().flush()  # short-lived script: send the last spans before exit
```

## Step 4: Observability with Langfuse

The coordinator file already contains the tracing. The **langfuse** skill covers the v5 SDK: `@observe` wraps the request into one trace, and the OpenInference instrumentation turns every agent run, model call and MCP tool call of the OpenAI Agents SDK into spans under it. Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` (for example `https://cloud.langfuse.com`). The old `from langfuse.decorators import observe` import is v2 and fails on v5. Inputs and outputs are recorded by default, so ticket text and PR contents reach Langfuse; pass `capture_input=False, capture_output=False` to `@observe` for sensitive flows. The Agents SDK also uploads its own traces to the OpenAI dashboard unless `OPENAI_AGENTS_DISABLE_TRACING=1` is set.

## What Leo's Team Gets

One natural-language entry point over Jira and GitHub, with code review and security scanning handled by outside agents. Adding a capability means adding an MCP server (a local tool) or another A2A agent URL (a remote agent) and one more tool or `mcp_servers` entry in the coordinator. Datadog and PagerDuty follow the same pattern as the Jira server: one small MCP server each. Each request shows up in Langfuse as a single trace, so Leo can see which tool calls and delegations a slow or wrong answer went through.

## Related Skills

- [mcp-server-builder](/skills/mcp-server-builder) — writes the Jira MCP server in Step 1 with the official SDK (Python or TypeScript)
- [fastmcp](/skills/fastmcp) — writes the GitHub MCP server in Step 1 from plain typed functions
- [a2a-protocol](/skills/a2a-protocol) — the client in Step 2, and the server side if Leo publishes his own agent
- [openai-agents](/skills/openai-agents) — the coordinator in Step 3: tools, MCP servers and the run loop
- [langfuse](/skills/langfuse) — the tracing in Step 4
