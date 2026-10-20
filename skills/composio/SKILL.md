---
name: composio
description: >-
  Composio connects AI agents to 1,000+ external apps (GitHub, Slack, Gmail,
  Notion, Linear and more) and handles OAuth, token storage and per-user
  connections for them. Use when someone asks to "give my agent access to
  Gmail or GitHub", "add Composio to my agent", "connect users' accounts to an
  AI agent", "use Composio with OpenAI Agents, Claude Agent SDK or LangChain",
  or "fix Composio code that uses composio-core or ComposioToolSet".
license: Apache-2.0
compatibility: "Python 3.11 to 3.15 (package composio) or Node.js 22.22.3+ (ESM only, @composio/core). Needs a COMPOSIO_API_KEY from the Composio dashboard."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  repository: https://github.com/ComposioHQ/composio
  tags: ["agent", "tools", "integrations", "oauth", "composio"]
---

# Composio — Tool Platform for AI Agents

## Overview

Composio gives an agent access to apps through a **session** created for one of your users. The session exposes a small set of meta tools; the agent searches the toolkit catalog at run time, asks the user to connect an account through a hosted Connect Link when needed, and executes tools with that user's stored credentials. Tokens never pass through your app or the model.

The current SDKs are session-based (`composio` on PyPI, `@composio/core` on npm). The older `composio-core` package, `ComposioToolSet`, `Action.GITHUB_CREATE_ISSUE` enums, `toolset.handle_tool_calls()` and `composio add github` belong to the legacy v1 SDK. Composio's docs say not to install `composio-core`: it calls deprecated APIs and does not work with sessions. If a project uses them, migrate rather than extend.

## Instructions

### 1. Install

Python (provider packages are named `composio-<provider>`):

```bash
pip install python-dotenv composio composio-openai-agents openai-agents
# Claude Agent SDK: composio composio-claude-agent-sdk claude-agent-sdk
# LangChain: composio composio-langchain
```

TypeScript (ESM only, Node.js 22.22.3 or newer; provider packages are `@composio/<provider>`):

```bash
npm install @composio/core @composio/openai-agents @openai/agents
```

Put the key in `.env`: `COMPOSIO_API_KEY=...` (from the dashboard project settings), plus your model provider's key.

### 2. Create a session per user and pass its tools to the agent

```python
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider

load_dotenv()
composio = Composio(provider=OpenAIAgentsProvider())

session = composio.sessions.create(
    user_id="usr_8f3a21c4",                       # your database id, never "default"
    toolkits=["github", "gmail", "slack"],        # optional; omit to allow the whole catalog
)
agent = Agent(
    name="Release Assistant",
    instructions="Use Composio tools. If a connection is required, share its Connect Link and wait. "
                 "Ask for confirmation before creating, updating, or deleting data.",
    tools=session.tools(),
)
print(Runner.run_sync(agent, "List open issues labelled bug in my main repo").final_output)
```

TypeScript equivalent: `const session = await composio.create("usr_8f3a21c4", { toolkits: ["github", "gmail"] }); const tools = await session.tools();`.

### 3. Authentication

- In chat: the session includes the `COMPOSIO_MANAGE_CONNECTIONS` meta tool. When a tool needs an account the agent returns a Connect Link; the user signs in on the hosted page and Composio stores the connected account.
- On demand (onboarding screen, pre-flight check): call `session.authorize("github")` (toolkit slug; optional `callback_url=`) and send the user to the returned `redirect_url`.
- Send users back to your app with `manage_connections={"callback_url": "https://app.northwind.dev/chat"}` (Python) or `manageConnections: { callbackUrl }` (TypeScript) when creating the session.
- Bring your own OAuth app or scopes with a custom auth config; otherwise managed auth is used.

### 4. Reuse sessions, or use MCP

Store `session.session_id` and later call `composio.use(session_id)` instead of creating a new session each turn. Any MCP-capable client can use a session through `session.mcp.url` and `session.mcp.headers` without a provider package; create (or resume) the session with `mcp=True` (`{ mcp: true }` in TypeScript), otherwise the headers are empty. Treat the headers as a secret.

## Examples

### Example 1: Slack digest of GitHub issues for each customer

**User prompt:** "Build an agent that posts our open P1 issues to #support every morning, per customer workspace."

Create one session per customer with `user_id` set to that customer's database id and `toolkits=["github", "slack"]`. First run: the agent replies with a Connect Link for GitHub, the customer authorizes, the agent continues and posts to Slack. Later runs reuse the stored connections for that `user_id` only.

### Example 2: Migrate legacy v1 code

**User prompt:** "My agent uses ComposioToolSet and Action.GMAIL_SEND_EMAIL and stopped working."

Replace `pip install composio-core composio-openai` with `pip install composio composio-openai-agents`, replace the toolset with `Composio(provider=...)`, replace `toolset.get_tools(actions=[...])` with `composio.sessions.create(user_id=..., toolkits=["gmail"]).tools()`, and drop `handle_tool_calls` when the framework's runner executes the tools (OpenAI Agents, Claude Agent SDK, LangChain agents). With a plain OpenAI chat-completions loop, pass the session instead: `provider.handle_tool_calls(response=response, session=session)`. Result: the agent discovers the Gmail send tool itself and asks for a Connect Link if the user has no Gmail connection.

## Guidelines

- Use a stable user id (database primary key). Never `default` in production: it exposes one user's connected accounts to others. Avoid emails, which change.
- Restrict `toolkits` to what the agent needs, and tell the agent to ask before writes. Use a scoped project API key with the session-management and session-tool-execution permissions only.
- Keep `COMPOSIO_API_KEY` in the environment; do not commit it.
- Check Composio's current docs (docs.composio.dev) before copying older tutorials; many still show the v1 API.
- REST v3.1 is the current API; v3.0 is legacy.
- Many tools in older toolkits have been flagged deprecated; if a tool disappears, search the session again rather than hard-coding slugs.
