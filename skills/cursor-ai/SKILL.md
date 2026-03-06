---
name: cursor-ai
category: Developer Tools
tags: [ai-coding, ide, code-generation, cursor-rules, mcp, vibe-coding]
version: 1.0.0
author: terminal-skills
---

# Cursor — AI-First Code Editor

You are an expert in Cursor, the AI-first code editor built on VS Code. You help developers configure Cursor Rules for consistent code generation, set up MCP servers for tool access, use Composer for multi-file edits, and build team-wide AI coding workflows with shared conventions, project-specific instructions, and context management.

## Core Capabilities

### Cursor Rules

```markdown
<!-- .cursor/rules/general.mdc — Project-wide rules -->
<!-- These rules apply to every AI interaction in the project -->

---
description: General coding standards
globs: ["**/*.ts", "**/*.tsx"]
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

```markdown
<!-- .cursor/rules/react.mdc — React-specific rules -->

---
description: React component patterns
globs: ["src/components/**/*.tsx", "src/app/**/*.tsx"]
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
```

### MCP Configuration

```json
// .cursor/mcp.json — MCP servers available to Cursor
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/database/index.ts"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./src"]
    }
  }
}
```

### Composer (Multi-File Edits)

```markdown
## Using Composer effectively:
1. Select files with @file — Composer edits multiple files at once
2. Reference docs with @docs — point to API docs, README, or specs
3. Use @codebase — lets AI search your entire codebase for context
4. Agent mode — Cursor runs terminal commands, reads files, iterates

## Example Composer prompts:

"Refactor the auth middleware in @src/middleware.ts to use the new
session validation from @src/lib/auth.ts. Update all API routes
in @src/app/api that import the old middleware."

"Create a new CRUD module for 'invoices' following the same patterns
as @src/modules/users. Include Drizzle schema, API routes, Zod
validation, and tests."
```

### .cursorrules (Legacy) vs .cursor/rules/ (New)

```markdown
## Migration from .cursorrules to .cursor/rules/

Old: Single `.cursorrules` file at project root (still supported)
New: `.cursor/rules/*.mdc` files with frontmatter (globs, description)

Benefits of new format:
- File-glob targeting: different rules for different file types
- `alwaysApply` vs on-demand: some rules always active, others contextual
- Organized: split rules by concern (typescript.mdc, testing.mdc, api.mdc)
- Shareable: commit to repo, entire team gets the same AI behavior
```

## Best Practices

1. **Rules in Git** — Commit `.cursor/rules/` to the repo; every team member gets the same AI behavior automatically
2. **Glob targeting** — Use specific globs (`src/app/api/**/*.ts`) for context-specific rules; avoid one giant rules file
3. **MCP for context** — Connect databases, APIs, and docs via MCP servers; AI generates better code with real context
4. **Composer for refactors** — Use Composer in Agent mode for multi-file changes; it reads, plans, edits, and tests
5. **@codebase for discovery** — Use `@codebase` when AI needs to find related code; it searches semantically, not just by filename
6. **Tab completion** — Enable Cursor Tab for inline completions; learns your coding style over time
7. **Review AI diffs** — Always review Cursor's proposed changes before accepting; use the diff view to understand what changed
8. **Rules evolve** — Update rules when you find the AI making the same mistake twice; each rule prevents future errors
