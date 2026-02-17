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
compatibility: "Requires Node.js 18+ (TypeScript SDK) or Python 3.10+ (Python SDK)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["mcp", "ai-agents", "tools", "integration", "protocol"]
---

# MCP Server Builder

## Overview

Create Model Context Protocol (MCP) servers that expose tools, resources, and prompts to AI agents like Claude, Cursor, and other MCP-compatible clients. This skill scaffolds complete MCP server projects with proper typing, error handling, input validation, and deployment configuration.

## Instructions

When a user asks to build an MCP server, follow these steps:

### Step 1: Define the server's purpose and capabilities

Determine what the MCP server will expose:
- **Tools** — Functions the AI can call (e.g., query a database, call an API, run a search)
- **Resources** — Data the AI can read (e.g., file contents, database records, config)
- **Prompts** — Reusable prompt templates with parameters

Ask: What service or data source should the AI agent connect to?

### Step 2: Scaffold the project

**TypeScript (recommended):**

```bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext --outDir dist
```

Create the entry point structure:
```
my-mcp-server/
├── src/
│   └── index.ts       # Server entry point
├── package.json
└── tsconfig.json
```

Update `package.json`:
```json
{
  "type": "module",
  "bin": { "my-mcp-server": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**Python:**

```bash
mkdir my-mcp-server && cd my-mcp-server
python -m venv .venv && source .venv/bin/activate
pip install mcp[cli]
```

### Step 3: Implement the server

**TypeScript MCP server template:**

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

// Define a tool
server.tool(
  'search_issues',
  'Search GitHub issues by query. Returns title, number, state, and URL.',
  {
    query: z.string().describe('Search query for issues'),
    repo: z.string().describe('Repository in owner/repo format'),
    state: z.enum(['open', 'closed', 'all']).default('open').describe('Issue state filter'),
  },
  async ({ query, repo, state }) => {
    const response = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(query)}+repo:${repo}+state:${state}`
    );
    if (!response.ok) {
      return { content: [{ type: 'text', text: `Error: ${response.statusText}` }], isError: true };
    }
    const data = await response.json();
    const results = data.items.slice(0, 10).map((issue: any) =>
      `#${issue.number} [${issue.state}] ${issue.title}\n  ${issue.html_url}`
    ).join('\n\n');

    return { content: [{ type: 'text', text: results || 'No issues found.' }] };
  }
);

// Define a resource
server.resource(
  'repo-readme',
  'github://readme/{owner}/{repo}',
  async (uri) => {
    const [owner, repo] = uri.pathname.split('/').filter(Boolean);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { Accept: 'application/vnd.github.raw' },
    });
    return { contents: [{ uri: uri.href, text: await response.text(), mimeType: 'text/markdown' }] };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Python MCP server template:**

```python
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("my-mcp-server")

@mcp.tool()
async def search_issues(query: str, repo: str, state: str = "open") -> str:
    """Search GitHub issues by query. Returns title, number, state, and URL."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/search/issues",
            params={"q": f"{query} repo:{repo} state:{state}"},
        )
        resp.raise_for_status()
        items = resp.json()["items"][:10]
        return "\n\n".join(
            f"#{i['number']} [{i['state']}] {i['title']}\n  {i['html_url']}"
            for i in items
        ) or "No issues found."

@mcp.resource("github://readme/{owner}/{repo}")
async def repo_readme(owner: str, repo: str) -> str:
    """Fetch the README for a GitHub repository."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw"},
        )
        return resp.text

if __name__ == "__main__":
    mcp.run()
```

### Step 4: Add client configuration

Generate the MCP client config for the user:

**Claude Desktop (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  }
}
```

**For Python servers:**
```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "python",
      "args": ["/absolute/path/to/server.py"]
    }
  }
}
```

### Step 5: Test the server

```bash
# TypeScript — build and test
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# Python — test with MCP inspector
mcp dev server.py
```

Verify:
- All tools appear in `tools/list` response
- Tool inputs are validated (try invalid params)
- Error responses are graceful, not stack traces

## Examples

### Example 1: MCP server for a PostgreSQL database

**User request:** "Build an MCP server so Claude can query my Postgres database"

**Actions taken:**
1. Scaffolded TypeScript MCP project with `pg` driver
2. Created tools: `run_query` (read-only SQL), `list_tables`, `describe_table`
3. Added connection pooling and query timeout (30s)
4. Restricted to SELECT queries only (safety)

**Key tool implementation:**
```typescript
server.tool(
  'run_query',
  'Execute a read-only SQL query against the database. Only SELECT statements allowed.',
  { sql: z.string().describe('SQL SELECT query to execute') },
  async ({ sql }) => {
    if (!/^\s*SELECT\b/i.test(sql)) {
      return { content: [{ type: 'text', text: 'Error: Only SELECT queries are allowed.' }], isError: true };
    }
    const result = await pool.query({ text: sql, timeout: 30000 });
    const formatted = result.rows.map(r => JSON.stringify(r)).join('\n');
    return { content: [{ type: 'text', text: `${result.rowCount} rows:\n${formatted}` }] };
  }
);
```

**Result:** 3 tools created, tested with MCP inspector, config generated for Claude Desktop.

### Example 2: MCP server wrapping a REST API (Jira)

**User request:** "Create an MCP server for Jira so I can manage tickets from Claude"

**Actions taken:**
1. Created Python FastMCP server with httpx
2. Implemented tools: `search_tickets`, `create_ticket`, `update_status`, `add_comment`
3. Added authentication via environment variable `JIRA_API_TOKEN`
4. Input validation with proper error messages

**Tools created:**
```
- search_tickets(jql: str, max_results: int = 10) → Search Jira issues using JQL
- create_ticket(project: str, summary: str, description: str, type: str) → Create a new issue
- update_status(ticket_key: str, status: str) → Transition issue status
- add_comment(ticket_key: str, body: str) → Add a comment to an issue
```

**Result:** 4 tools, all tested. User can now ask Claude: "Find all open bugs in PROJECT assigned to me" and Claude calls `search_tickets` with the appropriate JQL.

## Guidelines

- Always validate tool inputs with Zod (TypeScript) or type hints (Python). Never trust raw input.
- Return structured, readable text from tools — the AI will interpret it for the user.
- Use `isError: true` in tool responses for failures so the AI knows to retry or report the error.
- Keep tool descriptions clear and specific — the AI uses them to decide when to call each tool.
- For database tools, enforce read-only access by default. Only allow writes if explicitly requested.
- Store API keys and credentials in environment variables, never hardcode them.
- Add timeouts to all external calls (HTTP requests, database queries) to prevent hangs.
- Limit response sizes — if a query returns 10,000 rows, paginate or truncate.
- Use stdio transport for local development, SSE/HTTP transport for remote deployment.
- Test every tool with the MCP inspector (`npx @modelcontextprotocol/inspector`) before shipping.
- Include a README with setup instructions, required env vars, and example Claude Desktop config.
