---
title: "Build an MCP Server with AI"
slug: build-mcp-server
description: "Use an AI agent to design, scaffold, and implement a Model Context Protocol server that exposes your tools and data to AI assistants."
skills: [mcp-server-builder]
category: development
tags: [mcp, model-context-protocol, api, ai-tools, integration]
---

# Build an MCP Server with AI

## The Problem

The Model Context Protocol (MCP) lets AI assistants connect to external tools and data sources, but building an MCP server from scratch requires understanding the protocol specification, implementing JSON-RPC transport, defining tool schemas with proper input validation, handling authentication, and managing server lifecycle events. The MCP SDK documentation covers the basics, but going from "hello world" to a production server that exposes your internal APIs takes significant boilerplate. Developers spend 6-10 hours on protocol plumbing before writing any business logic.

## The Solution

The `mcp-server-builder` skill scaffolds a complete MCP server from a description of your tools and data sources. It generates the server entry point, tool definitions with Zod schemas, resource handlers, and connection configuration — ready to plug into Claude Desktop, Cursor, or any MCP-compatible client.

```bash
npx terminal-skills install mcp-server-builder
```

## Step-by-Step Walkthrough

### 1. Define your tools and resources

```
I want to build an MCP server that connects to our company's PostgreSQL database and exposes these tools: query_customers (search by name, email, or signup date range), get_order_history (by customer ID, with pagination), and generate_report (monthly revenue summary by product category). Use the TypeScript MCP SDK.
```

The agent creates the project structure with `package.json`, `tsconfig.json`, and `src/index.ts` with the MCP server initialization, plus three tool definition files with Zod input schemas.

### 2. Implement the tool handlers with database connectivity

```
Implement the tool handlers. Use pg (node-postgres) with a connection pool. The database has tables: customers (id, name, email, created_at), orders (id, customer_id, product_id, amount, created_at), and products (id, name, category, price). Add parameterized queries to prevent SQL injection.
```

The agent generates handler implementations with parameterized queries, connection pool management, and structured response formatting that returns data as readable markdown tables.

### 3. Add a resource for live schema documentation

```
Add an MCP resource at docs://schema that returns the current database schema so the AI assistant always knows what tables and columns are available. Also add a resource at docs://examples with 5 example queries showing common usage patterns.
```

The agent adds two resource handlers: one that queries `information_schema.columns` at runtime, and one that serves a static markdown file with annotated example queries.

### 4. Configure authentication and test locally

```
Add environment-based configuration for the database connection string and an API key for server authentication. Generate a claude_desktop_config.json snippet I can paste to connect this server to Claude Desktop. Then test all three tools with sample inputs.
```

```
Testing query_customers({name: "sarah"}):
✓ Returns 3 matching customers in markdown table format

Testing get_order_history({customer_id: 142, limit: 5}):
✓ Returns 5 most recent orders with product names and amounts

Testing generate_report({month: "2025-01"}):
✓ Returns revenue breakdown across 8 product categories

All 3 tools operational. Config snippet written to claude_desktop_config.json
```

## Real-World Example

A data analyst at a mid-size e-commerce company wants her AI assistant to query the company database directly instead of exporting CSVs and uploading them to every conversation. She asks the agent to build an MCP server for their PostgreSQL database.

1. She describes three tools she uses daily: customer search, order history lookup, and monthly revenue reports
2. The agent scaffolds the full server in 4 files — 280 lines of TypeScript total — with parameterized queries and connection pooling
3. She adds the generated config snippet to Claude Desktop and immediately starts asking questions like "show me all customers who signed up last week and their order totals"
4. The MCP server handles 50+ queries per day with an average response time of 340ms

What would have taken 2-3 days of reading MCP documentation and writing boilerplate is running in production within 90 minutes. The analyst estimates saving 45 minutes per day previously spent on manual data exports.

## Related Skills

- [sql-optimizer](../skills/sql-optimizer/) — Optimize the queries your MCP server generates for better performance
- [security-audit](../skills/security-audit/) — Audit your MCP server for authentication and injection vulnerabilities
