---
title: "Build MCP Tools That Give AI Agents Direct Database Access"
slug: build-mcp-tools-for-ai-data-access
description: "Create MCP servers that let AI agents query your databases and APIs directly, replacing manual data lookups with natural language tool calls."
skills:
  - mcp-server-builder
  - langchain
category: data-ai
tags:
  - mcp
  - langchain
  - ai-agents
  - database
  - tool-integration
---

# Build MCP Tools That Give AI Agents Direct Database Access

## The Problem

A product analytics team spends much of its time answering ad-hoc data questions from other departments. "How many users signed up last week?" "What is the conversion rate for the new pricing page?" "Which customers are on the enterprise plan but haven't used feature X?" Each question requires writing a SQL query, running it, formatting the results, and sending them in Slack. The analysts want to give everyone access to answers through their AI assistant (Claude Desktop, Cursor, or similar), but the data lives in PostgreSQL, a REST API, and a metrics service, and AI agents cannot reach any of them without custom tooling.

## The Solution

Use **mcp-server-builder** to build an MCP server that exposes database queries and API calls as typed tools any MCP client can call, on the current v2 TypeScript SDK (`@modelcontextprotocol/server`). Then use **langchain** (1.x, `create_agent`) with the `langchain-mcp-adapters` package to load those same tools into a LangChain agent that translates natural language questions into tool calls, for the cases where the question comes from your own app or Slack bot instead of an MCP client.

## Step-by-Step Walkthrough

### 1. Build the MCP server with data access tools

Ask the agent for a server with three tools: a safe read-only SQL query, a metrics lookup, and a customer lookup.

> Build an MCP server in TypeScript with `@modelcontextprotocol/server` and `serveStdio`. Three tools, named with underscores. First: `query_analytics` that accepts one SELECT statement, runs it in a read-only transaction on a PostgreSQL read replica, and returns column names and up to 200 rows. Second: `get_metric` that accepts a metric name, date range, and optional segment, and calls the internal metrics API for time-series data. Third: `customer_lookup` that accepts an email or company name and returns plan, usage stats, and feature flags. Validate inputs with Zod and limit each tool to 10 calls per minute.

The first tool, as the skill generates it:

```typescript
// analytics.ts — read-only analytics tools for AI assistants
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import pg from "pg";
import * as z from "zod/v4";

const pool = new pg.Pool({
  connectionString: process.env.ANALYTICS_REPLICA_URL, // read-only role on a replica
  max: 4,
  statement_timeout: 15_000,
});

// Allow at most `limit` calls per tool per minute
const calls = new Map<string, number[]>();
function rateLimited(tool: string, limit = 10): boolean {
  const now = Date.now();
  const recent = (calls.get(tool) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) return true;
  calls.set(tool, [...recent, now]);
  return false;
}

const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

function createServer(): McpServer {
  const server = new McpServer({ name: "analytics", version: "1.0.0" });

  server.registerTool(
    "query_analytics",
    {
      description:
        "Run one read-only SQL SELECT against the analytics replica. Returns columns and up to 200 rows.",
      inputSchema: z.object({ sql: z.string().min(1).max(4000).describe("A single SELECT statement") }),
    },
    async ({ sql }) => {
      if (rateLimited("query_analytics")) return fail("Rate limit: 10 queries per minute. Try again shortly.");
      const statement = sql.trim().replace(/;\s*$/, "");
      if (!/^(select|with)\b/i.test(statement) || statement.includes(";")) {
        return fail("Only a single SELECT statement is allowed.");
      }
      const client = await pool.connect();
      try {
        // The transaction is read-only, whatever the SQL says
        await client.query("BEGIN READ ONLY");
        // Wrapping in a subquery makes the database stop at 200 rows instead of sending them all
        const result = await client.query(`SELECT * FROM (\n${statement}\n) AS q LIMIT 200`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              columns: result.fields.map((f) => f.name),
              rowCount: result.rowCount,
              rows: result.rows,
            }),
          }],
        };
      } catch (error) {
        return fail(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    },
  );

  return server;
}

void serveStdio(createServer);
console.error("analytics MCP server running on stdio");
```

Three layers protect the data. The database role on the replica has `SELECT` rights only, the query runs inside `BEGIN READ ONLY`, and the string check rejects anything that is not one SELECT. The first two are the real guard; the regex is a convenience. The rate limit stops an enthusiastic agent from running a thousand queries in a loop. Credentials come from the environment (`ANALYTICS_REPLICA_URL`), never from the tool arguments, and the server logs to stderr because stdout carries the protocol.

Run it with `npx tsx analytics.ts`, or inspect it first with `npx @modelcontextprotocol/inspector npx tsx analytics.ts`.

### 2. Connect it to Claude Desktop, Cursor and Claude Code

A stdio server runs on each user's machine under their own read-only credentials, so no shared bearer token is needed. Use absolute paths, because the host does not start the server from your project directory.

```json
{
  "mcpServers": {
    "analytics": {
      "command": "npx",
      "args": ["tsx", "/home/dev/analytics-mcp/analytics.ts"],
      "env": { "ANALYTICS_REPLICA_URL": "postgres://mcp_reader@replica.internal:5432/analytics" }
    }
  }
}
```

For Claude Code, the equivalent is `claude mcp add analytics -e ANALYTICS_REPLICA_URL="$ANALYTICS_REPLICA_URL" -- npx tsx /home/dev/analytics-mcp/analytics.ts`. Ask a question such as "How many enterprise customers used the export feature last month?" and the assistant writes the SQL itself from the table descriptions you gave it:

```text
Tool call: query_analytics
SELECT COUNT(DISTINCT c.id) AS enterprise_export_users
FROM customers c
JOIN feature_usage fu ON fu.customer_id = c.id
WHERE c.plan = 'enterprise'
  AND fu.feature_name = 'export'
  AND fu.used_at >= date_trunc('month', now() - interval '1 month')
  AND fu.used_at <  date_trunc('month', now());

Result: {"columns":["enterprise_export_users"],"rowCount":1,"rows":[{"enterprise_export_users":"147"}]}
```

Note that node-postgres returns `COUNT` values as strings.

### 3. Reuse the tools in a LangChain agent

For a Slack bot or internal web app, load the same MCP tools into a LangChain 1.x agent. The agent gets the schema and the metric vocabulary in its system prompt, so it picks the right tool and parameters.

```bash
pip install langchain langchain-mcp-adapters   # plus the provider package for your model, e.g. langchain-openai
```

```python
# ask.py
import asyncio
import os
import sys

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

SYSTEM = """You answer product analytics questions. Use query_analytics for counts and lists
and get_metric for time series. Tables: customers(id, email, plan, created_at),
feature_usage(customer_id, feature_name, used_at). Metric names: signups = user.registration.completed,
conversion rate = funnel.step.completion. Never guess column names; say so if the schema lacks them."""


async def main(question: str) -> None:
    client = MultiServerMCPClient({
        "analytics": {
            "transport": "stdio",
            "command": "npx",
            "args": ["tsx", "/home/dev/analytics-mcp/analytics.ts"],
            "env": {
                "PATH": os.environ["PATH"],
                "ANALYTICS_REPLICA_URL": os.environ["ANALYTICS_REPLICA_URL"],
            },
        }
    })
    tools = await client.get_tools()
    agent = create_agent(os.environ["AGENT_MODEL"], tools, system_prompt=SYSTEM)  # e.g. "provider:model-name"
    result = await agent.ainvoke({"messages": [{"role": "user", "content": question}]})
    print(result["messages"][-1].content)


asyncio.run(main(sys.argv[1]))
```

`create_agent` replaces the old `AgentExecutor` and `LLMChain` classes, which now live in `langchain-classic`. The model is a `"provider:model"` string, so changing providers is an environment variable.

### 4. Test with the questions your team really gets

Collect the ten questions the analysts answer every week ("What is the trial-to-paid conversion rate this month?", "Which enterprise customers have not logged in for 30 days?", "How many support tickets did we get yesterday?") and run each through the agent or the assistant. Check every answer against a query an analyst writes by hand.

Testing with real questions reveals gaps in the schema description. "Support tickets" may map to no table or metric, exposing that the metrics API does not cover support data, a gap the team did not know about until they tried to automate the queries.

### 5. Log every call

Add one log line per tool call to stderr or a file: the tool name, the SQL, the duration and the row count. Do not log result rows, which may contain customer data. After a few weeks the log shows which questions are asked most, and therefore which dashboards the company actually needs.

## Real-World Example

A 45-person SaaS company connected an MCP analytics server to a PostgreSQL read replica and its metrics API, and twelve people in product, marketing and customer success added it to Claude Desktop in the first week. In the team's own count, ad-hoc requests in the analytics Slack channel dropped sharply in the first month. The query log showed that "churn by plan" was asked 34 times, so the team built a dedicated churn dashboard that made the question unnecessary. The two analysts moved their time from repeat questions to modelling work.

## Tips

- Connect to a read-only replica with a `SELECT`-only role, never the primary. String validation can be bypassed; database permissions cannot.
- Put the table and column descriptions in the agent's system prompt. Without them the model guesses names and generates invalid SQL.
- Cap rows and set a `statement_timeout`, so a runaway query cannot fill the model's context or hold a connection.
- Do not log result rows; log the question, query, duration and row count.

## Related Skills

- [mcp-server-builder](/skills/mcp-server-builder): builds the v2 TypeScript server, its schemas and the client configuration
- [langchain](/skills/langchain): `create_agent` loads the MCP tools into an agent for apps outside an MCP client
