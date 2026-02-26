---
name: composio
description: >-
  Connect AI agents to 250+ tools and APIs with Composio — managed integrations
  for LLM agents. Use when someone asks to "connect AI to tools", "Composio",
  "AI agent integrations", "give my agent access to GitHub/Slack/Gmail",
  "tool use for AI agents", or "managed OAuth for AI apps". Covers tool
  connections, auth management, action execution, and framework integrations.
license: Apache-2.0
compatibility: "Python/TypeScript. Works with LangChain, CrewAI, OpenAI, Anthropic."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["ai-agent", "integrations", "composio", "tools", "oauth"]
---

# Composio

## Overview

Composio provides 250+ pre-built tool integrations for AI agents — GitHub, Slack, Gmail, Notion, Linear, Jira, Salesforce, and more. Instead of building OAuth flows, API wrappers, and error handling for each service, Composio handles authentication, rate limiting, and API calls. Your agent says "create a GitHub issue" and Composio executes it with the user's credentials.

## When to Use

- AI agent needs to interact with third-party services (GitHub, Slack, Gmail, etc.)
- Don't want to build OAuth flows for each integration
- Multi-user app where each user connects their own accounts
- Building an AI assistant that takes actions (not just answers questions)
- Need managed auth token refresh and rate limit handling

## Instructions

### Setup

```bash
pip install composio-openai  # For OpenAI
# Or: pip install composio-langchain, composio-crewai, composio-anthropic
```

### Connect a User Account

```python
# connect.py — Connect a user's GitHub account
from composio import ComposioToolSet

toolset = ComposioToolSet(api_key="your-composio-key")

# Generate a connection URL for the user
connection = toolset.initiate_connection(
    app="github",
    entity_id="user-123",  # Your user ID
)
print(f"Connect GitHub: {connection.redirectUrl}")
# User clicks this URL → OAuth flow → account connected
```

### Use Tools with OpenAI

```python
# agent.py — AI agent with GitHub tools
from openai import OpenAI
from composio_openai import ComposioToolSet, Action

client = OpenAI()
toolset = ComposioToolSet()

# Get GitHub tools for the connected user
tools = toolset.get_tools(
    actions=[
        Action.GITHUB_CREATE_ISSUE,
        Action.GITHUB_LIST_REPOS,
        Action.GITHUB_CREATE_PR,
        Action.SLACK_SEND_MESSAGE,
    ],
    entity_id="user-123",
)

# Agent with tool use
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful developer assistant with access to GitHub and Slack."},
        {"role": "user", "content": "Create a GitHub issue in myorg/myrepo titled 'Fix login bug' with details about the session timeout, then notify #engineering on Slack."},
    ],
    tools=tools,
)

# Execute tool calls
result = toolset.handle_tool_call(response)
print(result)
```

### LangChain Integration

```python
# langchain_agent.py — LangChain agent with Composio tools
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_functions_agent
from composio_langchain import ComposioToolSet, Action

toolset = ComposioToolSet()
tools = toolset.get_tools(
    actions=[
        Action.GMAIL_SEND_EMAIL,
        Action.GOOGLE_CALENDAR_CREATE_EVENT,
        Action.NOTION_CREATE_PAGE,
    ],
    entity_id="user-123",
)

llm = ChatOpenAI(model="gpt-4o")
agent = create_openai_functions_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools)

result = executor.invoke({
    "input": "Schedule a meeting for tomorrow at 2 PM with the team, create a Notion agenda page, and send a Gmail invite to team@example.com."
})
```

### TypeScript

```typescript
// agent.ts — TypeScript with OpenAI
import { OpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";

const toolset = new OpenAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY });
const openai = new OpenAI();

const tools = await toolset.getTools({
  actions: ["GITHUB_CREATE_ISSUE", "SLACK_SEND_MESSAGE"],
  entityId: "user-123",
});

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Create a bug report on GitHub..." }],
  tools,
});

const result = await toolset.handleToolCall(response);
```

## Examples

### Example 1: AI dev assistant with full tool access

**User prompt:** "Build an AI assistant that can create GitHub PRs, send Slack messages, and update Linear tickets."

The agent will set up Composio connections for each service, configure tool actions, and build an agent loop that executes multi-step developer workflows.

### Example 2: AI email assistant

**User prompt:** "Build an assistant that reads my Gmail, drafts replies, and schedules follow-ups on my calendar."

The agent will connect Gmail and Google Calendar via Composio, create an agent with read/send/schedule actions, and implement a review step before sending.

## Guidelines

- **`entity_id` = your user** — each user connects their own accounts
- **OAuth managed by Composio** — no building auth flows yourself
- **Action-based** — specify which actions the agent can use (principle of least privilege)
- **Token refresh automatic** — Composio handles OAuth token lifecycle
- **Multiple frameworks** — works with OpenAI, LangChain, CrewAI, Anthropic
- **250+ apps** — GitHub, Slack, Gmail, Notion, Linear, Jira, Salesforce, etc.
- **Custom actions** — add your own API integrations alongside built-in ones
- **Rate limits handled** — Composio respects provider rate limits
- **Audit logs** — track which actions were executed and by whom
- **Self-hostable** — run Composio locally for sensitive environments
