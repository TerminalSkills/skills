---
title: "Build an MCP Server to Connect AI to Your Data"
slug: build-mcp-server
description: "Create a Model Context Protocol server that gives AI assistants direct, structured access to your databases and APIs."
skills: [mcp-server-builder]
category: development
tags: [mcp, ai-integration, api, protocol, claude]
---

# Build an MCP Server to Connect AI to Your Data

## The Problem

You want your AI assistant to query your production database, but the workflow is painful: copy a question into chat, get a SQL suggestion, paste it into your DB client, copy results, paste them back, ask a follow-up, repeat. A simple "what were our top 10 customers last quarter?" takes 5 round trips and 4 minutes of copying and pasting.

The Model Context Protocol (MCP) lets AI assistants call tools directly — but building an MCP server means understanding JSON-RPC transport, Zod tool schemas, resource endpoints, auth middleware, and error handling that follows the spec. Most developers spend 6-10 hours on boilerplate before writing a single line of business logic.

Every team has data locked behind databases, REST APIs, and dashboards that AI can't reach. Support agents alt-tab between AI and five internal tools. Analysts explain queries instead of letting AI run them. The gap between "AI that talks about your data" and "AI that accesses your data" is the MCP server you haven't built yet.

## The Solution

The **mcp-server-builder** skill scaffolds a complete MCP server from your database schema or API spec. It generates typed tool definitions with Zod validation, database-connected handlers with connection pooling, schema documentation as resources, and authentication — ready for Claude Desktop, Cursor, and any MCP client.

```bash
npx terminal-skills install mcp-server-builder
```

## Step-by-Step Walkthrough

### 1. Scaffold from your database schema

```
Build an MCP server that connects to our PostgreSQL database. Generate tools for querying customers, orders, and analytics.
```

```
Connected to PostgreSQL — 24 tables detected

Generated: mcp-server-analytics/
  src/tools/customers.ts  — search, detail, lifetime-value
  src/tools/orders.ts     — list, detail, revenue-by-period, status-breakdown
  src/tools/analytics.ts  — top-products, cohort-retention, funnel-metrics
  src/resources/schema.ts — All 24 tables documented
  src/auth.ts, src/db.ts  — API key auth + read-only connection pool

10 tools created, all enforce read-only (SELECT only).
Zod schemas validate all inputs. SQL injection prevented via parameterized queries.
```

### 2. Add schema resources for AI context

```
Add MCP resources so the AI understands our data model without me explaining it.
```

```
Resources added:
  resource://schema/tables          — All 24 tables with descriptions + row counts
  resource://schema/tables/{name}   — Columns, types, constraints, foreign keys
  resource://schema/relationships   — Entity relationship map
  resource://schema/examples        — Example queries for common questions

The AI can now explore your schema before writing queries — no more
"what columns does orders have?" back-and-forth.
```

### 3. Configure auth and rate limiting

```
Add API key auth and rate limiting. Internal team only.
```

```
  Auth: MCP_API_KEY env var, validated on every tool/resource call
  Rate limit: 100 calls/min, 10 concurrent queries, 30s timeout
  Read-only: analytics_readonly DB role, query parser rejects mutations
  Results capped at 1,000 rows

Created: scripts/create-readonly-role.sql
```

### 4. Test with Claude Desktop

```
Generate Claude Desktop config and test all tools.
```

```
Add to claude_desktop_config.json:
{
  "mcpServers": {
    "company-analytics": {
      "command": "node",
      "args": ["./mcp-server-analytics/dist/index.js"],
      "env": { "DATABASE_URL": "...", "MCP_API_KEY": "..." }
    }
  }
}

Testing 10 tools...
  ✓ search_customers("acme") → 3 results (124ms)
  ✓ get_revenue_by_period("2025-01", "2025-03") → 3 rows (156ms)
  ✓ get_top_products("Q1-2025", 5) → 5 products (201ms)
  ... all 10 tools + 4 resources operational ✓

Ask Claude: "What was our revenue last quarter vs Q3?" — it queries directly.
```

### 5. Deploy as a production service

```
Package as a Docker container with health monitoring.
```

```
  Dockerfile: multi-stage, 47MB image
  Health: GET /health → {"status":"ok","db":"connected","tools":10}
  Logging: All tool calls with duration + row count
  Alerts: Query latency >5s, connection pool exhausted

Ready for deployment on internal infrastructure.
```

## Real-World Example

A data analyst at a growing DTC e-commerce company spent 30% of her day answering ad-hoc data questions from marketing and product. "What's our repeat purchase rate?" "Which products have the highest return rate?" Each question: write SQL, run it, format results, paste into Slack. Eight to twelve requests per day.

The engineering lead used the mcp-server-builder skill Thursday afternoon to create an MCP server with 12 tools covering customer metrics, product performance, and marketing attribution. By Friday morning, it ran as a Docker container on their internal network.

The marketing team connected it to Claude. Instead of asking the analyst "what were our top products last month?", they asked Claude — answer in 3 seconds with a formatted table and period-over-period comparison. Within two weeks, ad-hoc requests dropped from 10/day to 2-3 (the complex ones needing custom analysis). She estimated saving 8-10 hours per week — time redirected to the cohort analysis dashboard the team had been requesting for months.

## Related Skills

- [security-audit](../skills/security-audit/) — Audit your MCP server for SQL injection and auth vulnerabilities
- [test-generator](../skills/test-generator/) — Generate integration tests for all tool handlers
- [docker-helper](../skills/docker-helper/) — Optimize Docker deployment configuration
