---
title: Build an AI Agent System with MCP Tools and A2A Delegation
slug: build-ai-agent-with-mcp-tools-and-a2a-delegation
description: Build a multi-agent system where a coordinator agent uses MCP servers for local tool access (database, files, APIs) and delegates specialized tasks to external agents via A2A protocol — creating a composable AI architecture where agents discover, communicate, and collaborate across organizational boundaries.
skills: [mcp-sdk, a2a-sdk, openai-agents, langfuse]
category: data-ai
tags: [mcp, a2a, multi-agent, tools, interoperability, protocol]
---

# Build an AI Agent System with MCP Tools and A2A Delegation

Leo manages DevOps at a 50-person startup. The team has scattered tooling: Jira for tasks, GitHub for code, Datadog for monitoring, PagerDuty for incidents, and Confluence for docs. Each tool has its own interface, and context switching kills productivity. Leo wants a single AI assistant that can access all tools via MCP and delegate specialized tasks (code review, security scanning) to external AI agents via A2A.

## Step 1: MCP Servers for Internal Tools

```typescript
// mcp-servers/jira-server.ts — MCP server for Jira
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "jira", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_ticket",
      description: "Create a Jira ticket",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project key (e.g., DEV)" },
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["bug", "story", "task"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          assignee: { type: "string", description: "Assignee email" },
        },
        required: ["project", "title", "type"],
      },
    },
    {
      name: "search_tickets",
      description: "Search Jira tickets with JQL",
      inputSchema: {
        type: "object",
        properties: {
          jql: { type: "string", description: "JQL query" },
          maxResults: { type: "number", default: 10 },
        },
        required: ["jql"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_ticket") {
    const ticket = await jiraClient.createIssue({
      fields: {
        project: { key: args.project },
        summary: args.title,
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: args.description || "" }] }] },
        issuetype: { name: args.type },
        priority: { name: args.priority || "medium" },
      },
    });
    return { content: [{ type: "text", text: `Created ${ticket.key}: ${args.title}` }] };
  }

  if (name === "search_tickets") {
    const results = await jiraClient.searchJira(args.jql, { maxResults: args.maxResults });
    const formatted = results.issues.map(
      (i: any) => `${i.key} [${i.fields.status.name}] ${i.fields.summary}`
    ).join("\n");
    return { content: [{ type: "text", text: formatted || "No tickets found." }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Step 2: A2A Client for External Agent Delegation

```python
# agents/coordinator.py — Main agent with MCP tools + A2A delegation
from agents import Agent, Runner, function_tool
from agents.mcp import MCPServerStdio
from a2a.client import A2AClient

# Discover external agents
code_review_agent = A2AClient("https://review.external-service.com")
security_scan_agent = A2AClient("https://security.external-service.com")

@function_tool
async def delegate_code_review(pr_url: str, focus_areas: str = "") -> str:
    """Delegate a code review to an external AI code review agent.

    Args:
        pr_url: GitHub pull request URL
        focus_areas: Specific areas to focus the review on
    """
    task = await code_review_agent.send_task(
        message=Message(role="user", parts=[
            TextPart(text=f"Review this PR: {pr_url}. Focus: {focus_areas or 'general quality'}"),
        ]),
    )
    result = await wait_for_completion(task, timeout=120)
    return result.messages[-1].parts[0].text

@function_tool
async def delegate_security_scan(repo_url: str, branch: str = "main") -> str:
    """Delegate a security scan to an external security scanning agent.

    Args:
        repo_url: Repository URL to scan
        branch: Branch to scan
    """
    task = await security_scan_agent.send_task(
        message=Message(role="user", parts=[
            TextPart(text=f"Run security scan on {repo_url} branch {branch}"),
        ]),
    )
    result = await wait_for_completion(task, timeout=300)
    return result.messages[-1].parts[0].text

# Coordinator agent with MCP (local tools) + A2A (external agents)
async def run_coordinator():
    async with MCPServerStdio(command="node", args=["mcp-servers/jira-server.js"]) as jira_mcp, \
               MCPServerStdio(command="node", args=["mcp-servers/github-server.js"]) as github_mcp, \
               MCPServerStdio(command="node", args=["mcp-servers/datadog-server.js"]) as datadog_mcp:

        coordinator = Agent(
            name="DevOps Coordinator",
            instructions="""You are a DevOps AI assistant. You have access to:
- Jira (create/search tickets)
- GitHub (PRs, issues, code search)
- Datadog (metrics, alerts, logs)
- External code review agent (delegate PR reviews)
- External security scanner (delegate security scans)

When a user asks about incidents, check Datadog first, then correlate with recent deployments in GitHub.
For PR reviews, delegate to the code review agent.
For security concerns, delegate to the security scan agent.
Create Jira tickets for action items automatically.""",
            mcp_servers=[jira_mcp, github_mcp, datadog_mcp],
            tools=[delegate_code_review, delegate_security_scan],
        )

        result = await Runner.run(
            coordinator,
            "We had a spike in error rates at 3 AM. Investigate what deployed recently, "
            "check if there are related Jira tickets, and if you find the culprit PR, "
            "run a security scan on that branch.",
        )
        print(result.final_output)
```

## Step 3: Observability with Langfuse

```python
# All agent actions traced automatically via Langfuse
from langfuse.decorators import observe

@observe(name="coordinator-session")
async def handle_user_request(user_input: str):
    result = await run_coordinator(user_input)

    # Langfuse captures:
    # - MCP tool calls (jira search, github PR list, datadog metrics)
    # - A2A delegations (code review, security scan)
    # - Token usage per step
    # - Total latency breakdown
    return result
```

## Results

After deploying the coordinator agent, the DevOps team reduces context switching by 70%.

- **Tool access**: Single natural language interface for Jira + GitHub + Datadog (3 MCP servers)
- **Delegation**: Code reviews delegated via A2A complete in 90 seconds (vs 2-hour human turnaround)
- **Incident response**: Mean time to identify root cause dropped from 45 minutes to 8 minutes
- **Ticket creation**: Agent auto-creates Jira tickets for 85% of identified issues
- **Security scans**: Automated on every flagged PR via A2A; 12 vulnerabilities caught in first month
- **Agent composability**: Adding new capabilities = adding new MCP server or A2A endpoint; zero code changes to coordinator
