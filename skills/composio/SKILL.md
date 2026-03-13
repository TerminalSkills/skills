---
name: composio
description: >-
   You are an expert in Composio, the platform that gives AI agents access to
  250+ external tools and APIs with managed authentication. You help
  developers connect agents to GitHub, Slack, Gmail, Jira, Notion, Salesforce,
  and 200+ more services — handling OAuth flows, API key management, and rate
  limiting so agents can take real-world actions.
category: AI & Machine Learning
tags: [agent, tools, integrations, api, oauth, actions, 250-apps]
version: 1.0.0
author: terminal-skills
---

# Composio — Tool Platform for AI Agents

You are an expert in Composio, the platform that gives AI agents access to 250+ external tools and APIs with managed authentication. You help developers connect agents to GitHub, Slack, Gmail, Jira, Notion, Salesforce, and 200+ more services — handling OAuth flows, API key management, and rate limiting so agents can take real-world actions.

## Core Capabilities

```python
from composio_openai import ComposioToolSet, Action
from openai import OpenAI

client = OpenAI()
toolset = ComposioToolSet()

# Get tools for specific actions
tools = toolset.get_tools(actions=[
    Action.GITHUB_CREATE_ISSUE,
    Action.SLACK_SEND_MESSAGE,
    Action.GMAIL_SEND_EMAIL,
    Action.NOTION_CREATE_PAGE,
])

# Use with OpenAI function calling
response = client.chat.completions.create(
    model="gpt-4o",
    tools=tools,
    messages=[{"role": "user", "content": "Create a GitHub issue in myorg/myrepo titled 'Fix login bug' and notify #dev-team on Slack"}],
)

# Execute tool calls
toolset.handle_tool_calls(response)
# → Creates GitHub issue AND sends Slack message, with proper auth for both

# With CrewAI
from crewai import Agent
agent = Agent(
    role="DevOps Assistant",
    tools=toolset.get_tools(apps=["github", "slack", "linear"]),
)

# Auth management
toolset.initiate_connection(app="github", auth_scheme="oauth2")
# Returns OAuth URL → user authorizes → Composio stores tokens → agent uses them
```

## Installation

```bash
pip install composio-openai composio-crewai composio-langchain
composio login                             # Authenticate
composio add github                        # Connect GitHub account
```

## Best Practices

1. **Managed auth** — Composio handles OAuth, API keys, token refresh; agents don't see credentials
2. **250+ integrations** — GitHub, Slack, Gmail, Notion, Jira, Linear, Salesforce, HubSpot, etc.
3. **Framework support** — Works with OpenAI, LangChain, CrewAI, Autogen, Mastra; same tool definitions
4. **Action-level control** — Grant specific actions, not full API access; `GITHUB_CREATE_ISSUE` not `GITHUB_*`
5. **Triggers** — Set up event triggers (new email, PR created); agent reacts to real-world events
6. **Custom tools** — Add your own APIs alongside built-in integrations; same auth management
7. **Rate limiting** — Composio handles provider rate limits; queues and retries automatically
8. **Multi-user** — Each user has their own OAuth connections; agents act on behalf of the right user
