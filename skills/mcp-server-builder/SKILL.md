---
name: mcp-server-builder
description: >-
  Build Model Context Protocol (MCP) servers that connect AI agents to external
  services and data sources. Use when a user asks to create an MCP server, build
  an MCP tool, connect an AI agent to an API, create a tool server for Claude,
  build MCP resources, or expose a database/service via MCP. Generates TypeScript
  or Python MCP servers with tools, resources, and prompts following the official
  MCP specification.
license: Apache-2.0
compatibility: "Requires Node.js 20+ (TypeScript SDK v2) or Python 3.11+ (Python SDK v2)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/modelcontextprotocol/typescript-sdk
  tags: ["mcp", "ai-agents", "tools", "integration", "protocol"]
---

# MCP Server Builder

## Overview

Create Model Context Protocol (MCP) servers that expose tools, resources, and prompts to AI agents like Claude, Cursor, and other MCP-compatible clients. This skill scaffolds complete MCP server projects with typed inputs, error handling, and client configuration.

Both official SDKs reached a stable v2 in July 2026 (spec revision 2026-07-28): `@modelcontextprotocol/server` for TypeScript and `mcp` 2.x for Python. v2 renamed the main APIs, so code copied from older tutorials (`server.tool()`, `StdioServerTransport`, `FastMCP`) fails on a fresh install.

## Instructions

### Step 1: Define the server's purpose and capabilities

- **Tools**: functions the model calls (query a database, call an API)
- **Resources**: read-only data the client attaches as context (files, records, config)
- **Prompts**: reusable prompt templates with parameters

Ask what service or data source the agent should reach, and which operations must be read-only.

### Step 2: Scaffold the project

**TypeScript (Node.js 20+):**

```bash
mkdir github-issues-mcp && cd github-issues-mcp
npm init -y
npm pkg set type=module
npm install @modelcontextprotocol/server zod tsx
mkdir src
```

`type=module` is required (the SDK is ESM only). `tsx` runs the TypeScript directly, so there is no build step. If you need a compiled `dist/`, add `typescript` and `@types/node` and build with `tsc`. Zod v4 is imported as `zod/v4`; any Standard Schema library (Valibot, ArkType) also works.

The v1 package `@modelcontextprotocol/sdk` still gets security fixes, but new projects should use v2.

**Python (3.11+):**

```bash
mkdir github-issues-mcp && cd github-issues-mcp
python -m venv .venv && source .venv/bin/activate
pip install "mcp[cli]" httpx
```

The `cli` extra provides the `mcp dev` and `mcp run` commands. Add `httpx` yourself if your tools make HTTP calls.

### Step 3: Implement the server

**TypeScript server (`src/index.ts`):**

```typescript
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

function createServer(): McpServer {
  const server = new McpServer({ name: 'github-issues', version: '1.0.0' });

  server.registerTool(
    'search_issues',
    {
      description: 'Search GitHub issues. Returns number, state, title and URL.',
      inputSchema: z.object({
        query: z.string().describe('Search text'),
        repo: z.string().describe('Repository as owner/name, e.g. vercel/next.js'),
        state: z.enum(['open', 'closed']).default('open')
      })
    },
    async ({ query, repo, state }) => {
      const q = encodeURIComponent(`${query} repo:${repo} is:issue state:${state}`);
      const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=10`, {
        headers: { 'User-Agent': 'github-issues-mcp/1.0', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) {
        return { content: [{ type: 'text', text: `GitHub API error: HTTP ${res.status}` }], isError: true };
      }
      const data = (await res.json()) as { items: { number: number; state: string; title: string; html_url: string }[] };
      const text = data.items.map(i => `#${i.number} [${i.state}] ${i.title}\n  ${i.html_url}`).join('\n\n');
      return { content: [{ type: 'text', text: text || 'No issues found.' }] };
    }
  );

  server.registerResource(
    'repo-readme',
    new ResourceTemplate('github://readme/{owner}/{repo}', { list: undefined }),
    { title: 'Repository README', mimeType: 'text/markdown' },
    async (uri, { owner, repo }) => {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: { 'User-Agent': 'github-issues-mcp/1.0', Accept: 'application/vnd.github.raw' },
        signal: AbortSignal.timeout(10_000)
      });
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await res.text() }] };
    }
  );

  return server;
}

void serveStdio(createServer);
console.error('github-issues MCP server running on stdio');
```

Notes: `registerTool(name, config, handler)` replaces `server.tool()`, `registerResource` replaces `server.resource()`, and `serveStdio(factory)` replaces `new StdioServerTransport()` plus `server.connect()`. The `inputSchema` must be a schema object (`z.object(...)`), not a bare shape. Logging goes to stderr: one `console.log` corrupts the stdout protocol stream.

**Python server (`server.py`):**

```python
import httpx
from mcp.server import MCPServer

mcp = MCPServer("github-issues")


@mcp.tool()
async def search_issues(query: str, repo: str, state: str = "open") -> str:
    """Search GitHub issues. Returns number, state, title and URL."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.github.com/search/issues",
            params={"q": f"{query} repo:{repo} is:issue state:{state}", "per_page": 10},
            headers={"User-Agent": "github-issues-mcp/1.0"},
        )
        resp.raise_for_status()
    items = resp.json()["items"]
    return "\n\n".join(
        f"#{i['number']} [{i['state']}] {i['title']}\n  {i['html_url']}" for i in items
    ) or "No issues found."


@mcp.resource("github://readme/{owner}/{repo}")
async def repo_readme(owner: str, repo: str) -> str:
    """README of a GitHub repository."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw", "User-Agent": "github-issues-mcp/1.0"},
        )
        return resp.text


if __name__ == "__main__":
    mcp.run()
```

`MCPServer` (import `from mcp.server import MCPServer`) is the v2 name of `FastMCP`; the old `mcp.server.fastmcp` module is gone. The tool schema comes from the type hints and docstring. Plain `mcp.run()` serves stdio; `mcp.run(transport="streamable-http", host="127.0.0.1", port=8000)` serves HTTP (transport options are arguments of `run()`, not of the constructor).

### Step 4: Add client configuration

**Claude Code:**

```bash
claude mcp add github-issues -- npx tsx /home/dev/github-issues-mcp/src/index.ts
```

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "github-issues": {
      "command": "npx",
      "args": ["tsx", "/home/dev/github-issues-mcp/src/index.ts"],
      "env": { "GITHUB_TOKEN": "set-in-your-own-config" }
    }
  }
}
```

For Python, use `"command": "/home/dev/github-issues-mcp/.venv/bin/python"` with `"args": ["/home/dev/github-issues-mcp/server.py"]`. Always use absolute paths: hosts do not launch the server from your project directory.

### Step 5: Test the server

```bash
# TypeScript
npx @modelcontextprotocol/inspector npx tsx src/index.ts

# Python
mcp dev server.py
```

In the Inspector, click Connect, open the Tools tab, and call `search_issues`. Do not test by piping raw JSON into stdin: v2 servers negotiate the protocol first, so a bare `tools/list` line gets no useful answer. For automated tests, use the SDK `Client` (Python: `from mcp import Client`, which accepts the server object for in-memory tests).

Verify that all tools are listed, invalid arguments are rejected before the handler runs, and errors are readable messages, not stack traces.

## Examples

### Example 1: MCP server for a PostgreSQL database

**User request:** "Build an MCP server so Claude can query my Postgres database"

**Actions taken:**
1. Scaffolded a TypeScript project with `@modelcontextprotocol/server` and the `pg` driver
2. Registered tools `run_query`, `list_tables`, `describe_table`
3. Connected with a read-only database role (`mcp_reader`) and a 30 s `statement_timeout`
4. Rejected anything but SELECT as a second line of defence

```typescript
server.registerTool(
  'run_query',
  {
    description: 'Run a read-only SQL SELECT against the analytics database.',
    inputSchema: z.object({ sql: z.string().describe('A single SELECT statement') })
  },
  async ({ sql }) => {
    if (!/^\s*SELECT\b/i.test(sql) || sql.includes(';')) {
      return { content: [{ type: 'text', text: 'Only a single SELECT statement is allowed.' }], isError: true };
    }
    const result = await pool.query({ text: sql, query_timeout: 30000 });
    const rows = result.rows.slice(0, 200).map(r => JSON.stringify(r)).join('\n');
    return { content: [{ type: 'text', text: `${result.rowCount} rows (first 200):\n${rows}` }] };
  }
);
```

**Result:** three tools listed in the Inspector, a `DROP TABLE users` attempt returns the error message, and `claude mcp add analytics-db -- ...` registers it for Claude Code. The regex check is only a guard; the read-only role is what actually protects the data.

### Example 2: MCP server wrapping a REST API (Jira)

**User request:** "Create an MCP server for Jira so I can manage tickets from Claude"

**Actions taken:**
1. Created a Python `MCPServer` with httpx
2. Implemented `search_tickets`, `create_ticket`, `update_status`, `add_comment`
3. Read `JIRA_BASE_URL`, `JIRA_USER_EMAIL` and `JIRA_API_TOKEN` from environment variables
4. Typed every argument so the SDK rejects bad input before the function runs

```python
@mcp.tool()
async def search_tickets(jql: str, max_results: int = 10) -> str:
    """Search Jira issues with JQL, e.g. 'project = PAY AND status = Open'."""
```

**Result:** four tools. Asking Claude "Find all open bugs in PAY assigned to me" makes it call `search_tickets` with the right JQL.

## Guidelines

- Validate inputs with a schema (Zod in TypeScript, type hints in Python); never trust raw arguments.
- Return readable text. For failures the model should see and react to, return `isError: true` (TypeScript) or, in Python, raise from an `MCPServer` tool (the model then sees only a generic "Error executing tool ..." line, so catch and re-raise with care, or return a readable string). The low-level Python `Server` turns exceptions into protocol errors instead.
- Write tool descriptions specific enough that the model can choose between tools.
- Database tools: use a read-only database role first, query filtering second.
- Keep credentials in environment variables and out of the repository and tool output.
- Add timeouts to every external call and cap response sizes (truncate or paginate).
- stdio is for local servers launched by the host. For a shared remote server use Streamable HTTP (`createMcpHandler` in TypeScript, `run(transport="streamable-http")` in Python); SSE is only a legacy transport. Bind to 127.0.0.1 unless you add authentication.
- Never write to stdout from a stdio server except through the SDK.
- Pin the SDK major version in `package.json` or `pyproject.toml`; v1 and v2 APIs are not compatible. Migration guides: ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2 and py.sdk.modelcontextprotocol.io/migration/.
- Ship a README with setup steps, required environment variables, and the `claude mcp add` command.
