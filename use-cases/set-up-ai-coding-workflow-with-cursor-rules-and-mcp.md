---
title: Configure Cursor Rules and MCP Servers for Consistent Team AI Coding
slug: set-up-ai-coding-workflow-with-cursor-rules-and-mcp
description: >-
  Enforce team coding standards with shared Cursor rules, Claude Code CLAUDE.md files, and MCP servers to cut PR rejection rates from 40% to 8%.
skills: [cursor-ai, claude-code, mcp-server-builder]
category: development
tags: [ai-coding, cursor, mcp, developer-experience, productivity]
---

# Configure Cursor Rules and MCP Servers for Consistent Team AI Coding

Leo leads a 6-person engineering team at a fintech startup. Everyone uses AI coding tools but the output is inconsistent -- one developer gets clean TypeScript, another gets sloppy JavaScript with `any` types. Code review rejection rate is 40%.

## The Problem

Without shared configuration, each developer's AI tool generates code in its own style. Cursor produces different patterns depending on how the prompt is worded. MCP servers connect to production databases without guardrails. New team members take two weeks to learn conventions because they're only documented in a wiki nobody reads. The result is 40% of AI-generated PRs rejected in first review, averaging 3.2 review rounds per PR, with developers spending 25 minutes per prompt just crafting context.

## The Solution

Create shared Cursor rules that encode team standards, configure Claude Code as a terminal-based agent for complex refactors, and build MCP servers that give AI tools safe access to internal systems.

```bash
terminal-skills install mcp-server-builder
```

## Step-by-Step Walkthrough

### 1. Define Cursor rules for team conventions

Create `.cursor/rules/` files that apply automatically to every AI generation. These encode standards so developers never need to repeat "use TypeScript strict mode" in prompts.

A TypeScript conventions rule (`.cursor/rules/typescript.mdc`) should cover: strict mode with `noUncheckedIndexedAccess`, no `any` types (use `unknown` and narrow), Zod for all external data validation, result pattern instead of throwing, and consistent naming (camelCase functions, PascalCase types, kebab-case files).

An API routes rule (`.cursor/rules/api-routes.mdc`) should enforce: Zod validation before database access, auth checks before business logic, proper HTTP status codes, structured error logging, and never exposing internal errors to clients.

### 2. Configure Claude Code for complex refactors

Set up a `CLAUDE.md` file in the project root with architecture details, conventions, and explicit boundaries. Claude Code reads this automatically and follows the constraints during terminal-based pair programming sessions.

Key sections to include: framework and tooling overview, database conventions (e.g., "all queries through Drizzle, never raw SQL"), testing requirements ("run existing tests before and after changes"), and explicit restrictions ("no new dependencies without asking, no schema changes without migrations").

This is especially powerful for multi-file refactors -- extracting a 400-line webhook handler into separate handler files with Zod schemas and tests, for example.

### 3. Build MCP servers with safety guardrails

Create MCP servers that give AI tools structured access to internal systems. A database MCP server should expose read-only queries with PII exclusion:

```typescript
server.tool(
  "query_users",
  "Search users by plan or domain. Returns id, plan, created_at (no PII).",
  {
    filter: z.enum(["free", "pro", "enterprise"]).optional(),
    email_domain: z.string().optional(),
    limit: z.number().max(100).default(20),
  },
  async ({ filter, email_domain, limit }) => {
    const users = await db.query.users.findMany({
      columns: { id: true, plan: true, createdAt: true, email: false, passwordHash: false },
      where: (u, { eq, like, and }) => and(
        filter ? eq(u.plan, filter) : undefined,
        email_domain ? like(u.email, `%@${email_domain}`) : undefined,
      ),
      limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
  }
);
```

Register MCP servers in `.cursor/mcp.json` so both Cursor and Claude Code can use them. Add deployment and error tracking servers alongside the database server.

### 4. Measure the impact

Track code review metrics over two weeks to validate the workflow. Compare rejection rates, review rounds, and prompt crafting time before and after adopting shared rules and MCP servers.

## Real-World Example

Leo, an engineering lead at a fintech startup in Austin, implements this workflow for his 6-person team. He spends one afternoon writing three Cursor rule files (TypeScript conventions, API route patterns, database query standards) and configuring two MCP servers (read-only database access, Sentry error logs).

Results after two weeks:

1. PR rejection rate drops from 40% to 8% -- AI follows team conventions automatically
2. Review rounds per PR drop from 3.2 to 1.4 -- first attempts are consistently close
3. Prompt crafting time drops from 25 minutes to 5 minutes -- MCP servers provide context, rules provide conventions
4. New developer onboarding drops from 2 weeks to 2 days -- they read Cursor rules to learn conventions while AI enforces them

The shared configuration acts as living documentation that is both human-readable and machine-enforced, solving the consistency problem at the source rather than catching it in code review.

## Related Skills

- [mcp-server-builder](../skills/mcp-server-builder/) -- Build custom MCP servers for database, API, and deployment access
