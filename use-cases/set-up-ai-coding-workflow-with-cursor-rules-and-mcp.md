---
title: Set Up an AI Coding Workflow with Cursor Rules and MCP Servers
slug: set-up-ai-coding-workflow-with-cursor-rules-and-mcp
description: Configure a production AI coding environment using Cursor with custom rules for consistent code generation, Claude Code for terminal-based pair programming, and MCP servers that give AI agents access to databases, APIs, and deployment tools — reducing code review rejections from 40% to 8% by teaching AI your team's conventions.
skills: [cursor-ai, claude-code, mcp-server-builder]
category: Developer Tools
tags: [ai-coding, cursor, claude-code, mcp, vibe-coding, developer-experience, productivity]
---

# Set Up an AI Coding Workflow with Cursor Rules and MCP Servers

Leo leads a 6-person engineering team at a fintech startup. Everyone uses AI coding tools, but the results are inconsistent. One developer gets clean TypeScript from Cursor; another gets sloppy JavaScript with `any` types. MCP servers connect to production databases but have no guardrails. Code review rejection rate is 40% because AI-generated code doesn't follow team conventions.

Leo fixes this by creating shared Cursor rules that encode team standards, configuring Claude Code as a terminal-based code agent for complex refactors, and building MCP servers that give AI tools safe access to internal systems.

## Step 1: Cursor Rules for Team Conventions

Cursor rules (`.cursor/rules`) tell the AI exactly how your team writes code. Instead of repeating "use TypeScript strict mode" in every prompt, rules apply automatically to every generation.

```markdown
<!-- .cursor/rules/typescript.mdc -->
<!-- Cursor rule: TypeScript conventions for the team -->

---
description: TypeScript coding standards for all source files
globs: ["src/**/*.ts", "src/**/*.tsx"]
alwaysApply: true
---

## TypeScript Standards

- **Strict mode always**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled
- **No `any`**: Use `unknown` for truly unknown types, then narrow with type guards
- **Zod for validation**: All external data (API responses, form inputs, env vars) validated with Zod schemas
- **Result pattern for errors**: Return `{ success: true, data } | { success: false, error }` instead of throwing
- **Naming**:
  - Functions: `camelCase`, verbs first (`getUserById`, `validatePayment`)
  - Types/Interfaces: `PascalCase`, no `I` prefix (`User`, not `IUser`)
  - Constants: `SCREAMING_SNAKE_CASE` for true constants, `camelCase` for config
  - Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components

## Database Queries (Drizzle ORM)

```typescript
// ALWAYS use prepared statements
const getUser = db.query.users.findFirst({
  where: eq(users.id, sql.placeholder("id")),
}).prepare("get_user");

// NEVER interpolate values into SQL
// ❌ db.execute(sql`SELECT * FROM users WHERE id = ${userId}`)
// ✅ const result = await getUser.execute({ id: userId });
```

## React Components

- Functional components only, no classes
- Props interface defined above the component, exported
- Use `forwardRef` when component wraps a native element
- Custom hooks in `src/hooks/`, prefixed with `use`
- Server Components by default (Next.js App Router), `"use client"` only when needed
```

```markdown
<!-- .cursor/rules/api-routes.mdc -->
<!-- Cursor rule: API route patterns -->

---
description: API route patterns for Next.js App Router
globs: ["src/app/api/**/*.ts"]
alwaysApply: true
---

## API Route Structure

Every API route follows this exact pattern:

```typescript
// src/app/api/[resource]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// 1. Input schema (Zod)
const CreateResourceSchema = z.object({
  name: z.string().min(1).max(100),
  // ...
});

// 2. Route handler
export async function POST(req: NextRequest) {
  // 2a. Auth check
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2b. Parse and validate input
  const body = await req.json();
  const parsed = CreateResourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 2c. Business logic
  try {
    const result = await db.insert(resources).values({
      ...parsed.data,
      userId: session.user.id,
    }).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("[API] POST /resource failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

- Always validate with Zod before touching the database
- Always check auth before business logic
- Always return proper HTTP status codes
- Always log errors with context (route, method)
- Never expose internal error messages to clients
```

## Step 2: Claude Code for Complex Refactors

Claude Code works in the terminal as a pair programmer. Leo uses it for tasks that span multiple files — refactoring a payment module, migrating from REST to tRPC, or debugging a production issue by reading logs and tracing code.

```markdown
<!-- CLAUDE.md — Project instructions for Claude Code -->
# Project: FinPay API

## Architecture
- **Framework**: Next.js 15 App Router
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Better Auth with session tokens
- **Payments**: Stripe (subscriptions + one-time)
- **Queue**: BullMQ for async jobs (email, webhooks, reports)
- **Testing**: Vitest + Testing Library

## Conventions
- All database queries go through Drizzle — never raw SQL
- Environment variables validated at startup with `src/env.ts` (Zod)
- Error handling: Result pattern, never throw in business logic
- Logging: structured JSON via Pino, levels: error/warn/info/debug
- Feature flags: checked via `src/lib/flags.ts`, not hardcoded

## Before Making Changes
1. Read the relevant test file first
2. Run existing tests: `pnpm test:unit -- --filter=<module>`
3. After changes, run: `pnpm typecheck && pnpm test:unit`

## Do NOT
- Add new dependencies without asking
- Modify database schema without creating a migration
- Change auth logic without explicit approval
- Use `console.log` — use the Pino logger
```

```bash
# Example Claude Code session for a complex refactor
# Leo starts Claude Code in the project root

$ claude

> Refactor the payment webhook handler in src/app/api/webhooks/stripe/route.ts.
> Currently it's a 400-line switch statement. Extract each event type into a
> separate handler in src/lib/stripe/handlers/. Each handler should:
> 1. Validate the event data with Zod
> 2. Update the database
> 3. Queue any side effects (email, Slack notification)
> 4. Return a typed result

# Claude Code reads the file, understands the structure, creates
# individual handler files, updates imports, adds Zod schemas,
# writes tests for each handler, and runs the test suite.
```

## Step 3: MCP Servers for AI Tool Access

MCP (Model Context Protocol) servers give AI tools access to internal systems — databases, APIs, deployment tools. Leo builds three MCP servers that both Cursor and Claude Code can use.

```typescript
// mcp-servers/database/index.ts — Safe database access for AI tools
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "./db.js";

const server = new McpServer({
  name: "finpay-database",
  version: "1.0.0",
});

// Tool: Query users (read-only, no PII in results)
server.tool(
  "query_users",
  "Search users by email domain or plan. Returns id, plan, created_at (no PII).",
  {
    filter: z.enum(["free", "pro", "enterprise"]).optional(),
    email_domain: z.string().optional(),
    limit: z.number().max(100).default(20),
  },
  async ({ filter, email_domain, limit }) => {
    // AI tools can query but NEVER see passwords, tokens, or full emails
    const users = await db.query.users.findMany({
      columns: {
        id: true,
        plan: true,
        createdAt: true,
        email: false,             // Explicitly exclude PII
        passwordHash: false,
      },
      where: (u, { eq, like, and }) => and(
        filter ? eq(u.plan, filter) : undefined,
        email_domain ? like(u.email, `%@${email_domain}`) : undefined,
      ),
      limit,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
    };
  }
);

// Tool: Get table schema (for writing queries)
server.tool(
  "get_schema",
  "Get the Drizzle schema definition for a table",
  { table: z.string() },
  async ({ table }) => {
    const schemaFile = await readFile(`src/db/schema/${table}.ts`, "utf-8");
    return { content: [{ type: "text", text: schemaFile }] };
  }
);

// Resource: Recent error logs
server.resource(
  "recent_errors",
  new ResourceTemplate("logs://errors/{minutes}", { list: undefined }),
  async (uri, { minutes }) => {
    const logs = await fetchRecentErrors(parseInt(minutes));
    return {
      contents: [{
        uri: uri.href,
        text: logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n"),
        mimeType: "text/plain",
      }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

```json
// .cursor/mcp.json — Register MCP servers with Cursor
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/database/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://dev:devpass@localhost:5432/finpay_dev"
      }
    },
    "deployment": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/deployment/index.ts"],
      "env": {
        "VERCEL_TOKEN": "${VERCEL_TOKEN}"
      }
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}"
      }
    }
  }
}
```

## Step 4: Measuring Impact

After two weeks of shared Cursor rules and MCP servers, Leo tracks the code review metrics.

Before the workflow:
- 40% of AI-generated PRs rejected in first review
- Average 3.2 review rounds per PR
- Developers spent 25 minutes per prompt crafting context

After the workflow:
- **8% rejection rate** — AI follows team conventions automatically via rules
- **1.4 review rounds** per PR — first attempt is usually close
- **5 minutes** per prompt — MCP servers provide context, rules provide conventions
- **Onboarding time**: New developers productive in 2 days instead of 2 weeks — they read the Cursor rules to learn team conventions while AI enforces them
