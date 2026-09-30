---
name: fastmcp
description: >-
  FastMCP is a Python framework for building Model Context Protocol (MCP)
  servers and clients: a decorated Python function becomes a tool, resource or
  prompt that an AI agent can call, with the schema generated from type hints.
  Use when someone asks to "build an MCP server in Python", "create a FastMCP
  server", "expose this function to Claude as a tool", "turn our OpenAPI spec
  into MCP tools", "test my MCP server", "call an MCP server from Python", or
  "install my server into Claude Code or Cursor". Covers tools, resources and
  prompts, stdio and HTTP transports, the fastmcp CLI, in-memory tests, token
  authentication, and generation from OpenAPI.
license: Apache-2.0
compatibility: "Python 3.10+; uv is recommended and required for fastmcp install and the dependency flags"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["fastmcp", "mcp", "python", "mcp-server", "agent-tools"]
  repository: https://github.com/PrefectHQ/fastmcp
---
# FastMCP — Build MCP servers and clients in Python

## Overview

FastMCP wraps ordinary Python functions as MCP tools, resources and prompts. Names, descriptions and input schemas come from the function signature, type hints and docstring; validation, transports and protocol negotiation are handled by the framework. The same package contains a client for calling any MCP server and a `fastmcp` CLI for running, inspecting, calling and installing servers. This skill targets FastMCP 4.x, imported as `from fastmcp import FastMCP`.

## Instructions

### Installation

```bash
uv add fastmcp          # inside a uv project (recommended)
pip install fastmcp     # any virtual environment
fastmcp version         # prints FastMCP, MCP and Python versions
```

### Define a server

```python
# stock_server.py
from typing import Annotated

from pydantic import Field
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

mcp = FastMCP(
    "Warehouse Stock",
    instructions="Look up and reserve bike parts. Call find_items before reserve_item.",
)

STOCK = {
    "BRK-2210": {"name": "Disc brake pads", "on_hand": 48, "bin": "A-14"},
    "CHN-1180": {"name": "11-speed chain", "on_hand": 6, "bin": "C-03"},
    "TIR-0700": {"name": "700x28c road tire", "on_hand": 0, "bin": "D-21"},
}

@mcp.tool
def find_items(query: str, max_results: int = 10) -> list[dict]:
    """Search stock by part name or SKU.

    Args:
        query: Part name fragment or SKU, for example "chain" or "BRK-2210".
        max_results: Maximum number of rows to return.
    """
    q = query.lower()
    rows = [{"sku": sku, **item} for sku, item in STOCK.items()
            if q in sku.lower() or q in item["name"].lower()]
    return rows[:max_results]

@mcp.tool(annotations={"readOnlyHint": False, "idempotentHint": False})
def reserve_item(sku: str, quantity: Annotated[int, Field(ge=1, le=100)]) -> dict:
    """Reserve units of one SKU for an order and return the remaining stock."""
    item = STOCK.get(sku)
    if item is None:
        raise ToolError(f"Unknown SKU {sku}. Call find_items first.")
    if item["on_hand"] < quantity:
        raise ToolError(f"Only {item['on_hand']} of {sku} on hand.")
    item["on_hand"] -= quantity
    return {"sku": sku, "reserved": quantity, "on_hand": item["on_hand"]}

@mcp.resource("stock://bins/{bin_id}")
def bin_contents(bin_id: str) -> dict:
    """Everything stored in one warehouse bin."""
    return {sku: item for sku, item in STOCK.items() if item["bin"] == bin_id}

@mcp.prompt
def restock_report(threshold: int = 10) -> str:
    """Ask for a restock list for parts below a threshold."""
    return f"List every part with fewer than {threshold} units on hand and suggest order quantities."

if __name__ == "__main__":
    mcp.run()
```

- Parameters without a default are required. `Annotated[..., Field(...)]` adds constraints and descriptions; docstring `Args:` entries become parameter descriptions. A resource URI with `{placeholders}` is a template; without them it is a fixed resource.
- `ToolError` messages always reach the client. Other exceptions are also reported unless the server is created with `mask_error_details=True`.
- For logging and progress inside a tool, make it `async` and add a parameter `ctx: Context = CurrentContext()` (`from fastmcp.dependencies import CurrentContext`, `from fastmcp.server.context import Context`), then `await ctx.info("...")` or `await ctx.report_progress(progress=50, total=100)`.

### Run it

```bash
python stock_server.py                                          # stdio, the default transport
fastmcp run stock_server.py:mcp --transport http --port 8000    # serves http://localhost:8000/mcp
fastmcp run stock_server.py --reload                            # restart on file changes
fastmcp dev inspector stock_server.py                           # open the MCP Inspector in a browser
```

`fastmcp run` imports the server object (it looks for `mcp`, `server` or `app`) and ignores the `if __name__ == "__main__":` block. In code, HTTP is `mcp.run(transport="http", host="127.0.0.1", port=8000)`. To serve through an ASGI server, expose `app = mcp.http_app()` in a module and start it with Uvicorn.

### Inspect and call from the terminal

```bash
fastmcp inspect stock_server.py
fastmcp list stock_server.py --resources --prompts
fastmcp call stock_server.py find_items query=chain
fastmcp call stock_server.py stock://bins/A-14
fastmcp call stock_server.py restock_report --prompt threshold=5
fastmcp call http://localhost:8000/mcp reserve_item sku=CHN-1180 quantity=2 --auth none
```

Add `--json` to `list` or `call` for machine-readable output. Arguments are `key=value` pairs coerced to the schema types; pass one JSON object for nested input. For URL targets the CLI tries OAuth by default: use `--auth none` for local servers, or pass a bearer token value to `--auth`.

### Install into an agent

```bash
fastmcp install claude-code stock_server.py --name warehouse-stock
fastmcp install cursor stock_server.py --with pandas
fastmcp install gemini-cli stock_server.py --env WAREHOUSE_DB_URL="$WAREHOUSE_DB_URL"
fastmcp install mcp-json stock_server.py        # print a JSON entry for any other client
```

Clients launch the server in an isolated `uv` environment, so every dependency must be declared with `--with`, `--with-requirements` or `--with-editable`, and every environment variable the server needs must be passed with `--env`. The manual equivalent for Claude Code is `claude mcp add warehouse-stock -- uv run --with fastmcp fastmcp run stock_server.py`.

### Call a server from Python

```python
import asyncio
from fastmcp import Client

async def main() -> None:
    async with Client("http://localhost:8000/mcp") as client:
        tools = await client.list_tools()
        print([tool.name for tool in tools])
        result = await client.call_tool("find_items", {"query": "brake"})
        print(result.data)
        content = await client.read_resource("stock://bins/A-14")
        print(content[0].text)

asyncio.run(main())
```

`Client` takes a URL for HTTP, `Path("stock_server.py")` for a local script over stdio, or a `FastMCP` object for an in-memory connection. `result.data` holds the deserialized return value; `result.content` holds the raw content blocks. A failed tool raises `ToolError` unless `raise_on_error=False` is passed.

### Test in memory with pytest

```python
# test_stock_server.py  (pyproject.toml: [tool.pytest.ini_options] asyncio_mode = "auto")
import pytest
from fastmcp import Client
from fastmcp.exceptions import ToolError
from stock_server import mcp

@pytest.fixture
async def client():
    async with Client(mcp) as c:
        yield c

async def test_find_items_matches_name(client):
    result = await client.call_tool("find_items", {"query": "chain"})
    assert result.data[0]["sku"] == "CHN-1180"

async def test_reserve_rejects_out_of_stock(client):
    with pytest.raises(ToolError, match="Only 0"):
        await client.call_tool("reserve_item", {"sku": "TIR-0700", "quantity": 1})
```

Requires `pytest-asyncio`. No process or port is started.

### Protect an HTTP server

```python
import os
from fastmcp import FastMCP
from fastmcp.server.auth.providers.jwt import JWTVerifier

auth = JWTVerifier(
    jwks_uri=os.environ["AUTH_JWKS_URI"],
    issuer=os.environ["AUTH_ISSUER"],
    audience="warehouse-stock-mcp",
)
mcp = FastMCP("Warehouse Stock", auth=auth)
```

The three values come from the identity provider that issues the tokens. Built-in providers also cover GitHub OAuth (`GitHubProvider`) and WorkOS AuthKit (`AuthKitProvider`). A Python client sends a token with `Client(url, auth=os.environ["WAREHOUSE_MCP_TOKEN"])`, without the `Bearer` prefix.

## Examples

### Example 1: Give Claude Code access to warehouse stock

**Request:** "Create an MCP server for our stock data, check that it works, and add it to Claude Code."

Using `stock_server.py` from above:

```bash
fastmcp inspect stock_server.py
fastmcp call stock_server.py reserve_item sku=CHN-1180 quantity=2
fastmcp call stock_server.py reserve_item sku=TIR-0700 quantity=1
fastmcp install claude-code stock_server.py --name warehouse-stock
```

**Result (shortened):**

```text
Components
  Tools:        2
{ "sku": "CHN-1180", "reserved": 2, "on_hand": 4 }
Error calling tool 'reserve_item'
Error: Only 0 of TIR-0700 on hand.
```

After the install, asking Claude Code "do we have 11-speed chains?" calls `find_items` and answers with 6 on hand in bin C-03. The sample keeps stock in memory, so every new server process starts from the initial numbers; a real server reads and writes a database.

### Example 2: Expose only the read endpoints of a REST API

**Request:** "Our billing service has an OpenAPI spec. Let the agent read invoices, but nothing that writes and nothing under /admin."

```python
# billing_mcp.py
import json
import os
from pathlib import Path
import httpx2
from fastmcp import FastMCP
from fastmcp.server.providers.openapi import MCPType, RouteMap

spec = json.loads(Path("openapi/billing-v2.json").read_text())
api = httpx2.AsyncClient(
    base_url=os.environ["BILLING_API_URL"],
    headers={"Authorization": f"Bearer {os.environ['BILLING_API_TOKEN']}"},
)

mcp = FastMCP.from_openapi(
    openapi_spec=spec,
    client=api,
    name="Billing (read-only)",
    route_maps=[
        RouteMap(pattern=r"^/admin/.*", mcp_type=MCPType.EXCLUDE),
        RouteMap(methods=["GET"], mcp_type=MCPType.TOOL),
        RouteMap(mcp_type=MCPType.EXCLUDE),
    ],
)
```

`BILLING_API_TOKEN` is a read-only service token created in the billing service's own admin panel; both variables are exported in the shell before running:

```bash
fastmcp inspect billing_mcp.py
fastmcp run billing_mcp.py:mcp --transport http --port 8000
fastmcp list http://localhost:8000/mcp --auth none
```

**Result:** for a spec with `GET /invoices`, `GET /invoices/{invoice_id}`, `DELETE /invoices/{invoice_id}` and `GET /admin/keys`, `inspect` reports `Tools: 2` and the list shows `list_invoices()` and `get_invoice(invoice_id: str)`, named after each `operationId`. Route maps are matched in order, so the final catch-all removes everything the earlier rules did not keep.

## Guidelines

- **Two packages share the name.** `from mcp.server.fastmcp import FastMCP` is FastMCP 1.0 inside the official MCP SDK. This skill is about the standalone `fastmcp` package, which has the CLI, the client, auth providers and OpenAPI support. Do not mix the imports.
- **Tool design matters more than coverage.** Write a docstring that says what the tool returns and when to call it. A few task-level tools work better than one tool per endpoint; the FastMCP authors recommend OpenAPI generation for bootstrapping, not as the final design. Tools cannot take `*args` or `**kwargs`, because the schema must list every parameter.
- **stdio for local, HTTP for shared.** stdio servers are started by the client per session. HTTP servers serve many clients and should have authentication; some clients refuse remote servers without it. If port 8000 is taken the server exits with `address already in use`; choose another with `--port`. Binding to `0.0.0.0` exposes the server to the network: keep `127.0.0.1` for local work, and on public hosts enable `host_origin_protection` with `allowed_hosts`.
- **Authentication applies to HTTP transports only.** `StaticTokenVerifier` and `DebugTokenVerifier` are for development; they must not reach production.
- **stdio servers do not inherit the shell environment.** `fastmcp list stock_server.py`, `fastmcp call` and `Client(Path(...))` start the script with a minimal environment, so a server that reads `os.environ["BILLING_API_URL"]` at import fails with `KeyError`. Check such servers with `fastmcp inspect`, run them over HTTP, or pass variables explicitly through `PythonStdioTransport` and its `env` argument.
- **Keep secrets in the environment.** Pass them with `--env` or `--env-file` on install and read them with `os.environ`. Never return tokens, connection strings or stack traces from a tool; set `mask_error_details=True` on servers exposed to others.
- **Mark side effects.** Set `annotations` such as `readOnlyHint` and `destructiveHint` honestly so clients can ask for confirmation, and validate inputs with `Field` constraints: tool arguments are chosen by a model.
- **Pin the version.** Use an exact pin such as `fastmcp==4.0.10` in production; breaking changes can arrive in minor releases.
- **FastMCP 4 changes to watch.** Pass `Path("server.py")` to `Client`, not a bare string path. HTTP clients handed to FastMCP must be `httpx2`, and FastMCP raises `httpx2` exceptions. `ctx.sample()` and `ctx.list_roots()` are gone, and `ctx.elicit()` fails on connections that negotiate the newer protocol. `import_server()` was removed in favor of `mount()`.
- **When not to use it.** For a TypeScript codebase use the TypeScript SDK or `@prefecthq/fastmcp-ts`. For protocol-level design questions that are independent of the framework, or for servers in other languages, see the `mcp-server-builder` skill. If the only consumer is a single script in the same process, a plain function call is simpler than MCP.
