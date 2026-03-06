---
name: cursor
category: Developer Tools
tags: [ai-coding, ide, code-generation, vibe-coding, editor, productivity]
version: 1.0.0
author: terminal-skills
---

# Cursor — AI-First Code Editor

You are an expert in Cursor, the AI-first code editor built on VS Code. You help developers set up project-level AI rules, use Composer for multi-file edits, leverage Tab completion for inline suggestions, and configure `.cursor/rules` for team-wide AI coding standards that make every AI suggestion match project conventions.

## Core Capabilities

### Cursor Rules (Project Context)

```markdown
# .cursor/rules/general.mdc
---
description: Global rules for the entire project
globs: ["**/*"]
alwaysApply: true
---

## Tech Stack
- Next.js 15 App Router with TypeScript
- Database: Drizzle ORM + PostgreSQL
- Styling: Tailwind CSS + shadcn/ui
- Auth: Clerk
- API: tRPC v11

## Code Style
- Prefer named exports over default exports
- Use `type` imports for type-only imports: `import type { User } from "./types"`
- All async functions must have error handling
- No `any` types — use `unknown` and narrow with type guards
- Prefer early returns over nested if/else
```

```markdown
# .cursor/rules/api.mdc
---
description: Rules for API routes and server code
globs: ["src/server/**/*.ts", "src/app/api/**/*.ts"]
---

## tRPC Procedures
- Every procedure validates input with Zod
- Use protectedProcedure for authenticated endpoints
- Return typed responses, never raw database objects

## Example Pattern
```typescript
export const userRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string().cuid2() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.id),
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),
});
```
```

### Composer (Multi-File Edits)

```markdown
## Using Composer effectively

Cmd+I opens Composer for multi-file generation and refactoring.

Good prompts:
- "Add a subscription billing page with Stripe checkout. Create the API route,
   the React page, and the Stripe webhook handler."
- "Refactor the user repository to use Drizzle's relational queries instead
   of raw joins. Update all callers."
- "Add unit tests for the payment service. Mock Stripe and test success,
   failure, and webhook signature verification."

Bad prompts:
- "Make it better" (too vague)
- "Build me an app" (too broad)
- "Fix the bug" (which bug? where?)

## @-mentions for context
- @file — reference specific files
- @folder — include entire directory
- @docs — link to external documentation
- @web — search the web for current info
- @codebase — search your entire project
```

### Tab Completion

```typescript
// Cursor Tab predicts your next edit based on recent changes.
// Example: After adding a new field to the schema...

// You edit the schema:
const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),         // ← You add this line
});

// Tab automatically suggests updating the type:
type User = {
  id: string;
  email: string;
  avatarUrl: string | null;              // ← Tab suggests this
};

// And the validation schema:
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable(), // ← Tab suggests this
});
```

### .cursorrules (Legacy) vs .cursor/rules/ (Current)

```markdown
## Migration guide

Old way (single file, deprecated):
  .cursorrules

New way (structured, per-directory):
  .cursor/
    rules/
      general.mdc          # Global rules (alwaysApply: true)
      backend.mdc           # Matches src/server/**
      frontend.mdc          # Matches src/app/**
      testing.mdc            # Matches **/*.test.ts

Benefits of new format:
- Glob-based: different rules for different parts of the codebase
- Auto-attached: rules activate based on which files you're editing
- Composable: multiple rules can apply simultaneously
- Shareable: commit to Git, team-wide consistency
```

## Installation

```bash
# Download from https://cursor.com
# Import VS Code settings: Cursor > Settings > Import from VS Code
# API keys: Cursor > Settings > Models (or use Cursor Pro)
```

## Best Practices

1. **Rules per directory** — Create specific rules for backend, frontend, and tests; the AI generates different patterns for each context
2. **Include examples** — Show 1-2 code examples in rules; the AI follows concrete patterns better than abstract descriptions
3. **Commit rules to Git** — `.cursor/rules/` is team infrastructure; every developer gets the same AI behavior
4. **Composer for multi-file** — Use Composer (Cmd+I) for features that span multiple files; it handles imports, types, and wiring
5. **Tab for flow** — Accept Tab suggestions while coding for inline completions; reject and keep typing when the suggestion is wrong
6. **@codebase for context** — Reference `@codebase` in Composer prompts to let Cursor search your entire project for relevant context
7. **Iterate, don't restart** — If a Composer result is 80% right, ask for specific fixes instead of regenerating from scratch
8. **Model selection** — Use Claude Sonnet for fast completions, Claude Opus/GPT-4o for complex multi-file refactoring
