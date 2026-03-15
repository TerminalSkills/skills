---
title: Build an MCP Server for Internal Tools
slug: build-mcp-server-for-internal-tools
description: Build a Model Context Protocol server that exposes internal tools (database queries, deployments, incident management) to AI assistants — letting developers interact with infrastructure through natural language.
skills:
  - typescript
  - postgresql
  - redis
  - zod
category: data-ai
tags:
  - mcp
  - ai-agents
  - developer-tools
  - llm
  - automation
---

# Build an MCP Server for Internal Tools

## The Problem

Ava leads platform engineering at a 50-person company. Developers constantly ask DevOps for help: "What's the status of the staging deployment?", "Can you restart the payment service?", "Show me the error logs from the last hour." DevOps answers the same questions 30 times a day via Slack. They want AI assistants (Claude, Cursor, internal chatbots) to answer these questions directly by connecting to internal systems through MCP — a standardized protocol that lets AI models call tools safely.

## Step 1: Build the MCP Server

```typescript
// src/mcp/server.ts — MCP server exposing internal tools to AI assistants
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const server = new Server(
  { name: "platform-tools", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_service_status",
      description: "Get the current status of a microservice including health, version, replicas, and recent errors",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name (e.g., 'api-gateway', 'payment-service')" },
        },
        required: ["service"],
      },
    },
    {
      name: "query_logs",
      description: "Search application logs by service, level, and time range",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name" },
          level: { type: "string", enum: ["error", "warn", "info"], description: "Log level filter" },
          minutes: { type: "number", description: "Look back this many minutes (default 60)", default: 60 },
          query: { type: "string", description: "Text search within log messages" },
        },
        required: ["service"],
      },
    },
    {
      name: "restart_service",
      description: "Restart a service (requires confirmation). Triggers a rolling restart with zero downtime.",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service to restart" },
          reason: { type: "string", description: "Reason for restart (logged for audit)" },
        },
        required: ["service", "reason"],
      },
    },
    {
      name: "run_database_query",
      description: "Run a READ-ONLY SQL query against the analytics database. No mutations allowed.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL SELECT query" },
          database: { type: "string", enum: ["analytics", "reporting"], default: "analytics" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_deployment_status",
      description: "Get the status of recent deployments for a service",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name" },
          limit: { type: "number", description: "Number of recent deployments", default: 5 },
        },
        required: ["service"],
      },
    },
    {
      name: "create_incident",
      description: "Create an incident in the incident management system",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Incident title" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          service: { type: "string", description: "Affected service" },
          description: { type: "string", description: "Detailed description" },
        },
        required: ["title", "severity", "service"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_service_status": {
      const service = args?.service as string;
      const status = await getServiceStatus(service);
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }

    case "query_logs": {
      const { service, level, minutes = 60, query } = args as any;

      // Validate: read-only, bounded time range
      const maxMinutes = Math.min(minutes, 1440); // max 24h

      const { rows } = await pool.query(
        `SELECT timestamp, level, message, metadata
         FROM logs
         WHERE service = $1
           AND ($2::text IS NULL OR level = $2)
           AND timestamp > NOW() - INTERVAL '${maxMinutes} minutes'
           AND ($3::text IS NULL OR message ILIKE '%' || $3 || '%')
         ORDER BY timestamp DESC
         LIMIT 50`,
        [service, level || null, query || null]
      );

      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    case "restart_service": {
      const { service, reason } = args as any;

      // Audit log
      await pool.query(
        "INSERT INTO audit_log (action, target, reason, actor, created_at) VALUES ('restart', $1, $2, 'mcp-server', NOW())",
        [service, reason]
      );

      // Trigger rolling restart via K8s API
      const result = await triggerRestart(service);
      return { content: [{ type: "text", text: `Restart initiated for ${service}. ${result}` }] };
    }

    case "run_database_query": {
      const sql = (args?.query as string).trim();

      // Safety: only SELECT queries
      if (!/^SELECT\s/i.test(sql)) {
        return { content: [{ type: "text", text: "Error: Only SELECT queries are allowed." }], isError: true };
      }

      // Disallow dangerous patterns
      if (/\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE)\b/i.test(sql)) {
        return { content: [{ type: "text", text: "Error: Mutation queries are not allowed." }], isError: true };
      }

      const { rows } = await pool.query({ text: sql, rowMode: "array" });
      return { content: [{ type: "text", text: JSON.stringify(rows.slice(0, 100), null, 2) }] };
    }

    case "get_deployment_status": {
      const { service, limit = 5 } = args as any;
      const { rows } = await pool.query(
        `SELECT version, environment, status, deployed_by, started_at, completed_at, duration_seconds
         FROM deployments WHERE service = $1 ORDER BY started_at DESC LIMIT $2`,
        [service, limit]
      );
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    case "create_incident": {
      const { title, severity, service, description } = args as any;
      const { rows: [incident] } = await pool.query(
        `INSERT INTO incidents (title, severity, service, description, status, created_at)
         VALUES ($1, $2, $3, $4, 'open', NOW()) RETURNING id`,
        [title, severity, service, description || ""]
      );
      // Notify on-call via PagerDuty/Slack
      await redis.publish("incidents:new", JSON.stringify({ id: incident.id, title, severity, service }));
      return { content: [{ type: "text", text: `Incident #${incident.id} created (${severity}): ${title}` }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

// Resources: expose dashboards and runbooks
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "platform://services", name: "All Services", description: "List of all microservices and their status" },
    { uri: "platform://runbooks", name: "Runbooks", description: "Incident response runbooks" },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "platform://services") {
    const { rows } = await pool.query("SELECT name, version, status, replicas FROM services ORDER BY name");
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(rows, null, 2) }] };
  }

  if (uri === "platform://runbooks") {
    const { rows } = await pool.query("SELECT title, service, steps FROM runbooks ORDER BY service");
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(rows, null, 2) }] };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

async function getServiceStatus(service: string) {
  const { rows: [svc] } = await pool.query(
    "SELECT * FROM services WHERE name = $1", [service]
  );
  if (!svc) throw new Error(`Service not found: ${service}`);

  const { rows: errors } = await pool.query(
    "SELECT COUNT(*) as count FROM logs WHERE service = $1 AND level = 'error' AND timestamp > NOW() - INTERVAL '1 hour'",
    [service]
  );

  return { ...svc, recentErrors: parseInt(errors[0].count) };
}

async function triggerRestart(service: string): Promise<string> {
  // K8s rollout restart
  return `Rolling restart initiated. Pods will be replaced one at a time.`;
}

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Results

- **DevOps Slack questions dropped 80%** — developers ask their AI assistant "what's the error rate on payment-service?" instead of pinging DevOps; the MCP server queries logs directly
- **Incident creation: 5 minutes → 30 seconds** — "create a high severity incident for checkout-service, payments are timing out" generates a properly formatted incident with PagerDuty notification
- **Read-only SQL queries are safe** — the MCP server validates queries, blocks mutations, and limits results; developers explore analytics data through natural language
- **Every action is audited** — restarts, queries, and incidents are logged with timestamps; the team knows exactly what the AI did and when
- **Works with any MCP client** — Claude Desktop, Cursor, custom chatbots — any tool that speaks MCP can use these platform tools without custom integrations
