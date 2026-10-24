---
name: mcp-client
description: >-
  Connect to and consume MCP servers from applications. Use when: integrating
  MCP servers into your app, building AI agents that use MCP tools, testing MCP
  server implementations, or programmatically calling MCP tools and reading
  resources.
license: Apache-2.0
compatibility: "Node.js 18+ (TypeScript SDK v2 or v1) or Python 3.10+ (mcp 2.x)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["mcp", "model-context-protocol", "ai-tools", "client"]
  repository: "https://github.com/modelcontextprotocol/typescript-sdk"
  use-cases:
    - "Build an AI agent that discovers and calls tools from MCP servers"
    - "Test an MCP server by listing and invoking its tools programmatically"
    - "Integrate MCP resources into a RAG pipeline"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# MCP Client

## Overview

An MCP client connects your program to an MCP server, discovers its tools, resources and prompts, and calls them. Use it to give an AI agent a set of tools, to test a server you wrote, or to read server resources into a pipeline.

Both official SDKs shipped a stable v2 in July 2026 (protocol revision 2026-07-28), and the examples below use it:

- TypeScript: `@modelcontextprotocol/client` (v2). The old `@modelcontextprotocol/sdk` (v1.x) still gets fixes and works, but its import paths and the `Client` constructor differ.
- Python: `pip install mcp` installs 2.x. The new `Client` replaces v1's `stdio_client` + `ClientSession` + `initialize()` stack.

## Instructions

### Step 1: Install

```bash
npm install @modelcontextprotocol/client     # TypeScript, Node 18+
pip install mcp                              # Python 3.10+ (v2 docs recommend 3.11+)
```

### Step 2: Connect to a local (stdio) server

The client starts the server as a child process and owns it until `close()`.

```typescript
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "docs-agent", version: "1.0.0" });

const transport = new StdioClientTransport({
  command: "node",
  args: ["./weather-server/dist/index.js"],
  env: { WEATHER_API_KEY: process.env.WEATHER_API_KEY ?? "" },
});

await client.connect(transport);
console.log(client.getServerVersion(), client.getServerCapabilities());
```

```python
import asyncio
import os
from mcp import Client, StdioServerParameters

server = StdioServerParameters(
    command="python",
    args=["weather_server.py"],
    env={"WEATHER_API_KEY": os.environ.get("WEATHER_API_KEY", "")},
)

async def main():
    async with Client(server) as client:          # connects on enter, closes on exit
        print(client.server_info, client.protocol_version)

asyncio.run(main())
```

The child process does not inherit your whole environment, only a short allow-list (`PATH`, `HOME` and similar). Pass API keys through `env`.

### Step 3: Connect to a remote server

Use Streamable HTTP. It is the transport servers deploy today.

```typescript
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const client = new Client({ name: "docs-agent", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("https://mcp.internal.acme.dev/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
});
await client.connect(transport);
// ...
await transport.terminateSession(); // ends the server-side session, then:
await client.close();
```

```python
async with Client("http://127.0.0.1:8000/mcp") as client:
    print(client.protocol_version)   # '2026-07-28'
```

In Python a URL string means Streamable HTTP. For headers, auth or proxies build an `httpx2.AsyncClient` and pass `Client(streamable_http_client(url, http_client=your_client))`; there is no `headers=` argument.

For a legacy SSE-only server, retry on a fresh `Client` with `SSEClientTransport` (TypeScript) or `Client(sse_client(url))` (Python, from `mcp.client.sse`). Build nothing new on SSE.

### Step 4: Discover tools

```typescript
const { tools } = await client.listTools();   // follows pagination for you
for (const tool of tools) {
  console.log(`- ${tool.name}: ${tool.description}`);   // tool.inputSchema is JSON Schema
}
```

```python
tools = await client.list_tools()
for tool in tools.tools:
    print(f"- {tool.name}: {tool.description}")      # tool.input_schema is JSON Schema
```

Check `client.getServerCapabilities()` (TypeScript) or `client.server_capabilities` (Python) first: a missing `tools`, `resources` or `prompts` entry means the server lacks that verb.

### Step 5: Call a tool

```typescript
const result = await client.callTool({
  name: "get_weather",
  arguments: { city: "Berlin", units: "celsius" },
});

if (result.isError) {
  console.error("Tool failed:", result.content);
} else {
  for (const block of result.content) {
    if (block.type === "text") console.log(block.text);
  }
}
```

```python
result = await client.call_tool("get_weather", {"city": "Berlin", "units": "celsius"})
if result.is_error:
    print("Tool failed:", result.content)
else:
    for block in result.content:
        if block.type == "text":
            print(block.text)
    print(result.structured_content)   # typed data when the tool declares an output schema
```

A tool that throws, and arguments the input schema rejects, come back as an ordinary result with `isError` / `is_error` set, so a model can read the message and retry. Only protocol failures throw: an unknown tool name raises in TypeScript (`Tool nope not found`) but returns `is_error=True` in Python.

### Step 6: Resources and prompts

```typescript
const { resources } = await client.listResources();
const { contents } = await client.readResource({ uri: "config://app" });
for (const item of contents) {
  if ("text" in item) console.log(item.mimeType, item.text);
}

const { prompts } = await client.listPrompts();
const prompt = await client.getPrompt({
  name: "code_review",
  arguments: { language: "TypeScript", focus: "security" },
});
// prompt.messages go to your LLM as-is
```

```python
resources = await client.list_resources()
contents = await client.read_resource("config://app")        # plain string URI
prompt = await client.get_prompt("code_review", {"language": "TypeScript", "focus": "security"})
```

Use `listResourceTemplates()` / `list_resource_templates()` for parameterised URIs. Resource contents are text or blob; check which before reading `.text`.

### Step 7: Drive a model with the tools

The tool list maps one to one onto an LLM tool definition. This loop uses the Anthropic SDK; it type-checks against `@anthropic-ai/sdk` 1.x.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
const { tools: mcpTools } = await client.listTools();
const tools: Anthropic.Tool[] = mcpTools.map((tool) => ({
  name: tool.name,
  description: tool.description ?? "",
  input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
}));

async function runAgent(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  for (let turn = 0; turn < 10; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4096,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await client.callTool({
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        is_error: result.isError === true,
        content: result.content.flatMap((c) => (c.type === "text" ? [{ type: "text" as const, text: c.text }] : [])),
      });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent did not finish in 10 turns");
}
```

Check the Anthropic model overview for current model ids; `claude-sonnet-4-5-20250929` is deprecated and retires on 2026-11-30.

### Step 8: Clean up

Call `await client.close()` in a `finally` block; it ends a stdio server process. Python's `async with Client(...)` does it for you.

## Examples

### Example 1: List what an MCP server offers

**User prompt:** "Connect to the filesystem MCP server for ./docs and tell me what it can do."

```typescript
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "inspector", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/dana/projects/handbook/docs"],
  })
);
try {
  const caps = client.getServerCapabilities();
  if (caps?.tools) console.log("Tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
  if (caps?.resources) console.log("Resources:", (await client.listResources()).resources.map((r) => r.uri).join(", "));
  if (caps?.prompts) console.log("Prompts:", (await client.listPrompts()).prompts.map((p) => p.name).join(", "));
} finally {
  await client.close();
}
```

Output (this server offers tools only):

```console
Tools: read_file, read_text_file, read_media_file, read_multiple_files, write_file, edit_file, create_directory, list_directory, list_directory_with_sizes, directory_tree, move_file, search_files, get_file_info, list_allowed_directories
```

### Example 2: Test a tool of your own server in memory (Python)

**User prompt:** "Write a test that calls my get_forecast tool without starting a process."

```python
import pytest
from mcp import Client
from weather_server import mcp          # the MCPServer instance

@pytest.mark.anyio
async def test_forecast_for_known_city():
    async with Client(mcp) as client:   # in-process, no subprocess, no port
        result = await client.call_tool("get_forecast", {"city": "Berlin"})
        assert not result.is_error
        assert "Berlin" in result.content[0].text
```

In TypeScript, `InMemoryTransport.createLinkedPair()` (exported by `@modelcontextprotocol/client` and `@modelcontextprotocol/server`; take both halves from the same package) links a `Client` and an `McpServer` the same way.

## Guidelines

- Always close the connection, or a stdio server process keeps running.
- Treat `isError` / `is_error` as the tool-level failure signal and show or forward the message to the model.
- Do not trust a server you did not write. Tool descriptions and results are untrusted input to your model: prompt-injection can arrive through them, so limit which tools an agent may call and confirm destructive ones.
- Keep secrets in environment variables; never log the `Authorization` header.
- Set timeouts for long tools (TypeScript request options `timeout`, `onprogress`, `resetTimeoutOnProgress`; Python `Client` timeouts take float seconds).
- Python v2 changes from v1: `ClientSession` is the low-level layer (`client.session`); fields are snake_case (`input_schema`, `is_error`, `structured_content`); `mcp.types` moved to the `mcp-types` package; `FastMCP` is now `MCPServer`.
- TypeScript v1 (`@modelcontextprotocol/sdk`): imports are `@modelcontextprotocol/sdk/client/index.js` and `.../client/stdio.js`, and `new Client({ name, version }, { capabilities: {} })` takes a second argument. The upstream codemod migrates a v1 project to v2.
