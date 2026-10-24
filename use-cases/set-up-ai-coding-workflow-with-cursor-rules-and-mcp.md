---
title: Configure Cursor Rules and MCP Servers for Consistent Team AI Coding
slug: set-up-ai-coding-workflow-with-cursor-rules-and-mcp
description: >-
  Enforce team coding standards with shared Cursor rules, a Claude Code CLAUDE.md, and a read-only MCP server so every developer's AI tool follows the same conventions.
skills: [cursor-ai, claude-code, mcp-server-builder]
category: development
tags: [ai-coding, cursor, mcp, developer-experience, productivity]
---

# Configure Cursor Rules and MCP Servers for Consistent Team AI Coding

Leo leads a 6-person engineering team at a fintech startup. Everyone uses AI coding tools but the output is inconsistent -- one developer gets clean TypeScript, another gets sloppy JavaScript with `any` types. In the team's own count, 40% of AI-assisted PRs are rejected in first review.

## The Problem

Without shared configuration, each developer's AI tool generates code in its own style. Cursor produces different patterns depending on how the prompt is worded. MCP servers connect to production databases without guardrails. New team members take two weeks to learn conventions because they're only documented in a wiki nobody reads. Developers spend long stretches of every prompt re-explaining context the tools could read from the repository.

## The Solution

Commit three things to the repository: Cursor rules that encode team standards, a `CLAUDE.md` for developers who use Claude Code in the terminal for large refactors, and an MCP server that gives both tools safe, read-only access to internal data.

```bash
npx terminal-skills install cursor-ai
npx terminal-skills install claude-code
npx terminal-skills install mcp-server-builder
```

## Step-by-Step Walkthrough

### 1. Define Cursor rules for team conventions

Project rules live in `.cursor/rules/` as `.mdc` files (a plain `.md` file there is ignored) and are version-controlled. The frontmatter decides when a rule applies. `.cursor/rules/typescript.mdc`, always applied:

```markdown
---
description: TypeScript conventions
alwaysApply: true
---

- TypeScript strict mode with `noUncheckedIndexedAccess`; no `any`, use `unknown` and narrow
- Validate all external data with Zod
- Return `{ success, data } | { success, error }` instead of throwing in business logic
- camelCase functions, PascalCase types, kebab-case file names
```

`.cursor/rules/api-routes.mdc`, attached only when a matching file is in context:

```markdown
---
globs: src/app/api/**/*.ts
alwaysApply: false
---

- Validate the request body with Zod before any database access
- Check auth before business logic
- Use correct HTTP status codes; never return internal error messages to clients
- Follow the structure of @src/app/api/users/route.ts
```

Reference example files with `@file` instead of pasting code, keep each rule short, and use a linter for pure style. Type `/create-rule` in Agent to generate a rule file. If your team also uses other agents, a plain `AGENTS.md` in the repository root is a simple alternative to `.cursor/rules`.

### 2. Configure Claude Code for complex refactors

Claude Code reads `CLAUDE.md` at the start of every session. Put architecture, commands, conventions and explicit boundaries in it:

```markdown
# FinPay API

## Commands
- `pnpm typecheck` -- TypeScript check
- `pnpm test:unit` -- unit tests

## Conventions
- All database queries go through Drizzle, never raw SQL
- Zod schemas for all external data

## Before and after changes
- Run the tests for the module first; after changes run `pnpm typecheck && pnpm test:unit`

## Do not
- Add dependencies without asking
- Change the database schema without a migration
```

To avoid maintaining the same rules twice, keep shared instructions in `AGENTS.md` and start `CLAUDE.md` with the line `@AGENTS.md`, then add Claude-specific notes below it. (Claude Code reads `AGENTS.md` on its own only when no `CLAUDE.md` exists.) Run `/init` inside Claude Code to draft a first `CLAUDE.md` from the codebase.

### 3. Build an MCP server with safety guardrails

Give the AI tools structured access to internal data through an MCP server. The current TypeScript SDK is `@modelcontextprotocol/server` (2.x); tools are registered with `registerTool` and an `inputSchema` built from `z.object`:

```bash
npm install @modelcontextprotocol/server zod drizzle-orm pg
npm install -D tsx typescript @types/node @types/pg
```

`mcp-servers/database/index.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  plan: text('plan').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

// DATABASE_URL must belong to a read-only role: that role, not this code, is the guardrail.
const db = drizzle(process.env.DATABASE_URL!);

function createServer(): McpServer {
  const server = new McpServer({ name: 'database', version: '1.0.0' });

  server.registerTool(
    'query_users',
    {
      description: 'List users by plan. Returns id, plan and created_at only (no PII).',
      inputSchema: z.object({
        plan: z.enum(['free', 'pro', 'enterprise']).optional(),
        limit: z.number().int().max(100).default(20),
      }),
    },
    async ({ plan, limit }) => {
      const rows = await db
        .select({ id: users.id, plan: users.plan, createdAt: users.createdAt })
        .from(users)
        .where(plan ? eq(users.plan, plan) : undefined)
        .limit(limit);
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    },
  );

  return server;
}

void serveStdio(createServer);
console.error('database MCP server running on stdio');
```

The tool selects an explicit column list, so email and password hash never leave the database, and the connection string should point at a read-only role on a staging or replica database, not production. Log to stderr only: anything written to stdout corrupts the stdio protocol. Test it with `npx @modelcontextprotocol/inspector npx tsx mcp-servers/database/index.ts`.

### 4. Register the server in both tools

The two tools read different files. Cursor reads `.cursor/mcp.json`; Claude Code reads `.mcp.json` at the project root, not the Cursor file. Both expand environment variables, so no secret goes into the committed file.

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "${workspaceFolder}/mcp-servers/database/index.ts"],
      "env": { "DATABASE_URL": "${env:DATABASE_URL}" }
    }
  }
}
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/database/index.ts"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" }
    }
  }
}
```

Each developer exports `DATABASE_URL` (the read-only URL) in the shell that launches the tool. Claude Code asks each developer to approve a project-scoped server from `.mcp.json` before using it; check with `claude mcp list`. In Cursor, make sure the server is enabled under Customize in the sidebar.

### 5. Measure the impact

Track code review metrics for two weeks: first-review rejection rate, review rounds per PR, and how long developers spend writing context into prompts. Compare with the weeks before the rules landed. Whenever the AI makes the same mistake twice, add or tighten a rule.

## Real-World Example

Leo spends one afternoon writing three Cursor rule files (TypeScript conventions, API route patterns, database query standards), a `CLAUDE.md` that imports the shared `AGENTS.md`, and the read-only database MCP server above. He commits all of it, and each developer exports their own `DATABASE_URL`.

Over the next two weeks the team tracks its own numbers: the first-review rejection rate falls well below the starting 40%, because generated code follows the conventions without being told, and developers stop pasting schemas into prompts because the MCP tool answers those questions. A new hire reads the rule files on day one and learns the conventions from the same text the AI is following. The configuration is both human-readable documentation and machine-applied guidance, which fixes inconsistency at the source instead of catching it in review.

## Related Skills

- [cursor-ai](../skills/cursor-ai/SKILL.md) -- Cursor rules, `.cursor/mcp.json` and Agent prompts
- [claude-code](../skills/claude-code/SKILL.md) -- CLAUDE.md files and terminal-based refactors
- [mcp-server-builder](../skills/mcp-server-builder/SKILL.md) -- Build custom MCP servers for database, API, and deployment access
