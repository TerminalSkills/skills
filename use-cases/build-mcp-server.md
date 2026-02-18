---
title: "Build an MCP Server with AI"
slug: build-mcp-server
description: "Build a Model Context Protocol server, test its API endpoints, and generate a comprehensive test suite for reliable tool integration."
skills: [mcp-server-builder, api-tester, test-generator]
category: development
tags: [mcp, api, testing, ai-tools, server]
---

# Build an MCP Server with AI

## The Problem

Your team wants to expose internal tools — inventory lookup, order tracking, customer records — as MCP tools so AI assistants can query them directly. But building an MCP server means handling the protocol spec, JSON-RPC transport, tool schemas, validation, and error handling. Once built, AI agents will call tools with unexpected inputs — empty strings, wrong types, massive payloads. A malformed response means the agent silently fails and users get bad answers.

## The Solution

The **mcp-server-builder** skill scaffolds a production-ready MCP server with tool definitions and transport config. The **api-tester** skill tests each endpoint with realistic requests, edge cases, and error scenarios. The **test-generator** skill creates an automated suite so regressions get caught before deployment.

```bash
npx terminal-skills install mcp-server-builder api-tester test-generator
```

## Step-by-Step Walkthrough

### 1. Scaffold the MCP server

```text
Build an MCP server with three tools: inventory-lookup (search by SKU or name), order-status (track by ID), customer-search (find by email or phone). TypeScript with @modelcontextprotocol/sdk, PostgreSQL backend.
```

```text
Created: mcp-warehouse-server/

  src/index.ts           — Server entry with stdio transport
  src/tools/inventory.ts — inventory-lookup (SKU, name, category search)
  src/tools/orders.ts    — order-status (by order ID or customer ID)
  src/tools/customers.ts — customer-search (email, phone, name)
  src/db.ts              — PostgreSQL with connection pooling
  src/schemas.ts         — Zod validation for all tool inputs
  src/errors.ts          — Typed errors (not-found, invalid-input, rate-limited)
```

### 2. Test each tool with realistic requests

```text
Test each MCP tool with realistic requests. Try normal lookups, empty results, invalid inputs, and edge cases like SQL injection and oversized payloads.
```

```text
inventory-lookup:
  ✓ SKU "WH-4521" → 1 result (Wireless Headphones, $79.99)
  ✓ Name "cable" → 23 results, paginated correctly
  ✓ Empty: SKU "NONEXISTENT-999" → { products: [], total: 0 }
  ✓ SQL injection "'; DROP TABLE--" → Rejected by Zod
  ✓ 10,000-char string → Rejected, max 200

order-status:
  ✓ "ORD-78432" → Complete order with 4 timeline events
  ✓ Non-existent → MCP error { code: -32602, message: "Order not found" }
  ✗ Missing both IDs → Returns 500 instead of validation error

customer-search:
  ✓ Email → exact match, masked phone
  ✓ Phone → partial match with E.164 normalization
  ✗ Phone "+1" (too short) → Returns empty instead of validation error

2 bugs found. Applying fixes... All 16 scenarios passing ✓
```

### 3. Test protocol edge cases

```text
Test MCP protocol compliance: malformed JSON-RPC, unsupported methods, concurrent calls, connection handling.
```

```text
  ✓ Malformed JSON → parse error (-32700)
  ✓ Invalid method → method-not-found (-32601)
  ✓ Missing params → invalid-params (-32602)
  ✓ tools/list → correct schemas for all 3 tools
  ✓ 10 concurrent calls → all resolve, avg 45ms
  ✓ 500 products response → streams correctly
  ✗ Unknown notification type → server crashes
    Fix: Added catch-all handler. Applied ✓

Protocol compliance: 8/8 required behaviors verified ✓
```

### 4. Generate automated test suite

```text
Generate a test suite covering all tools, validation, error responses, and database edge cases. Vitest with test database.
```

```text
  tests/tools/inventory.test.ts  — 18 tests (search, pagination, validation, DB errors)
  tests/tools/orders.test.ts     — 15 tests (lookup, compound validation, status flow)
  tests/tools/customers.test.ts  — 13 tests (multi-field search, masking, normalization)
  tests/protocol/transport.test.ts — 9 tests (JSON-RPC, concurrency, reconnection)
  tests/setup.ts — seed data (50 products, 30 orders, 20 customers)

Total: 55 tests, all passing. Coverage: 87% statements. Run time: 3.2s.
```

### 5. Finalize and verify end-to-end

```text
Add test scripts, README with setup guide, and verify the server works with Claude Desktop.
```

```text
  package.json — "test": "vitest run", "test:watch": "vitest"
  README.md — setup, tool docs, Claude Desktop config example

  Claude Desktop config:
    { "mcpServers": { "warehouse": {
      "command": "node", "args": ["dist/index.js"],
      "env": { "DATABASE_URL": "postgresql://..." }
    }}}

  ✓ Server responds to initialize
  ✓ All 3 tools callable from Claude Desktop
  ✓ 55 tests passing, TypeScript strict mode clean
```

## Real-World Example

A platform engineer at a 50-person logistics company needed to give AI assistants access to warehouse, shipping, and returns data across 3 databases. Support agents switched between 4 dashboards to answer "where's my order?" questions.

Monday, mcp-server-builder scaffolded 5 tools covering inventory, orders, shipments, returns, and customers. Tuesday, api-tester found 4 edge-case bugs — including pagination returning duplicates and a null check crash on cancelled orders. Wednesday, test-generator produced 72 tests at 84% coverage. Thursday, the server went live in Claude Desktop for 8 agents.

Ticket resolution: 6 minutes → 2.5 minutes. Dashboard switching eliminated. The test suite caught 3 regressions in the first month. Estimated savings: $8,200/month in support efficiency.
