---
name: cursor-ai
description: >-
  Build software with Cursor, the AI-powered code editor. Use when a user asks to configure Cursor rules, write project rules (.cursor/rules, AGENTS.md), use Agent (formerly Composer) for multi-file edits, integrate MCP servers, or optimize AI-assisted coding workflows.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["ai-coding", "ide", "code-generation", "cursor-rules", "mcp"]
---
# Cursor — AI-First Code Editor

## Overview

Cursor is an AI-first code editor built on VS Code. This skill covers the parts you configure in a repository: project rules in `.cursor/rules`, `AGENTS.md`, MCP servers in `.cursor/mcp.json`, and how to prompt Agent for multi-file changes. Cursor renamed its old Composer panel to Agent; the chat that edits files, runs commands and searches the codebase is now simply Agent.

## Instructions

### Cursor Rules

```markdown
<!-- .cursor/rules/general.mdc: project-wide rules. The file starts with the frontmatter block. -->

---
description: General coding standards
alwaysApply: true
---

## Stack
- TypeScript strict mode, no `any`
- Next.js 15 App Router
- Drizzle ORM + PostgreSQL
- Zod for all validation
- Vitest for testing

## Code Style
- Functional, declarative code — no classes
- Early returns over nested conditionals
- Descriptive variable names: `isLoading`, `hasPermission`, `userCount`
- File naming: `kebab-case.ts` for modules, `PascalCase.tsx` for components
- Imports: absolute paths via `@/` alias

## Error Handling
- Return Result types: `{ success: true, data } | { success: false, error }`
- Never throw in business logic
- Use `try/catch` only at API boundaries

## When Generating Tests
- Colocate test files: `module.test.ts` next to `module.ts`
- Use `describe/it` blocks with clear descriptions
- Test behavior, not implementation
- Mock external services, never databases in integration tests
```

````markdown
<!-- .cursor/rules/react.mdc: auto-attached when a matching file is in context -->

---
globs: src/components/**/*.tsx, src/app/**/*.tsx
alwaysApply: false
---

## Components
- Server Components by default
- `"use client"` only for interactivity (state, effects, event handlers)
- Props interface defined and exported above the component
- Use `cn()` utility for conditional classNames (clsx + tailwind-merge)

## Patterns
```tsx
// ✅ Correct pattern
export interface UserCardProps {
  user: User;
  onSelect?: (userId: string) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return (/* ... */);
}

// ❌ Wrong: arrow function export, inline types
export const UserCard = ({ user }: { user: any }) => {/* ... */};
```
````

Rule files must end in `.mdc` (a plain `.md` in `.cursor/rules` is ignored), and may sit in subfolders. The three frontmatter fields combine like this: `alwaysApply: true` always includes the rule; `globs` alone auto-attaches it when a matching file is in context; `description` alone lets Agent decide; with none of them it applies only when you `@`-mention it. Multiple globs are separated by commas. A file mentioned in a rule (`@service-template.ts`) is read by Agent on demand, not pasted in. Type `/create-rule` in Agent to generate a rule file.

For simple cases, a plain `AGENTS.md` in the project root works instead of `.cursor/rules`.

### MCP Configuration

Project servers go in `.cursor/mcp.json`; servers for every project go in `~/.cursor/mcp.json`. Transports: stdio (`command`), SSE and Streamable HTTP (`url`). Values can use `${env:NAME}`, `${workspaceFolder}` and `${userHome}`; the `${DATABASE_URL}` form without `env:` is not documented.

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/database/index.ts"],
      "env": { "DATABASE_URL": "${env:DATABASE_URL}" }
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${env:GITHUB_TOKEN}" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}/src"]
    }
  }
}
```

### Agent (multi-file edits)

```markdown
## Prompting Agent effectively
1. Type @ and a file or folder name (@src/middleware.ts, @src/app/api/) to attach exactly the files that matter
2. Other @ mentions: @Terminals (terminal output), @Chats (an earlier conversation), @Commit (working-state diff), @Branch (diff with main), @Browser
3. If you do not know which files matter, skip the mentions: Agent searches the codebase itself
4. Type / to run a skill, or attach a rule by name with @rule-name
5. Agent reads files, edits several at once, runs terminal commands and iterates

Example prompts:

"Refactor the auth middleware in @src/middleware.ts to use the session
validation from @src/lib/auth.ts. Update every route in @src/app/api that
imports the old middleware."

"Create an invoices module following the same patterns as @src/modules/users:
Drizzle schema, API routes, Zod validation and tests."
```

The older `@codebase`, `@docs` and `@file` mentions are not in the current mentions list; use `@` plus a file or folder name instead.

## Examples

### Example 1: Team rule for API routes

Request: "Make Cursor always validate input with Zod in our Next.js API routes."

Create `.cursor/rules/api.mdc`:

```markdown
---
globs: src/app/api/**/*.ts
alwaysApply: false
---

- Parse every request body with a Zod schema before using it
- Return `{ error: { code, message } }` with a 4xx status on invalid input
- Follow the structure of @src/app/api/users/route.ts
```

Commit it. When Agent works on a file under `src/app/api`, the rule is attached; in Customize > Rules it is listed as a project rule of type Apply to Specific Files.

### Example 2: Connect a database to Agent

Request: "Let Cursor query our Postgres staging database."

Add the `database` server from MCP Configuration to `.cursor/mcp.json`, export `DATABASE_URL` in the shell that launches Cursor, and make sure the server is enabled under Customize in the sidebar. Use a read-only database role; Agent can then list tables and run queries through the server's tools.

## Guidelines

1. **Rules in Git** — Commit `.cursor/rules/` to the repo; every team member gets the same AI behavior. Keep each rule short and focused; do not paste whole style guides, use a linter for that
2. **Glob targeting** — Use specific globs (`src/app/api/**/*.ts`) for context-specific rules; avoid one giant rules file
3. **MCP for context** — Connect databases, APIs, and docs via MCP servers; never put tokens directly in `mcp.json`, use `${env:NAME}`, and give servers least-privilege credentials
4. **Agent for refactors** — Use Agent for multi-file changes; it reads, plans, edits, and runs commands
5. **Let Agent search** — When you do not know the files involved, describe the task and let Agent find them instead of attaching everything
6. **Tab completion** — Enable Cursor Tab for inline completions; learns your coding style over time
7. **Review AI diffs** — Always review Cursor's proposed changes before accepting; use the diff view to understand what changed
8. **Rules evolve** — Update rules when you find the AI making the same mistake twice; each rule prevents future errors
