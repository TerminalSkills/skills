---
name: cursor-rules
description: >-
  Create and manage .cursorrules and .cursor/rules/*.mdc files to customize
  Cursor AI behavior for your project. Use when: setting up Cursor for a new
  project, enforcing coding standards with AI, customizing AI responses per file
  type, or sharing team AI conventions.
license: Apache-2.0
compatibility: "Cursor 0.40+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["cursor", "ai-coding", "rules", "workflow"]
  use-cases:
    - "Set up Cursor rules for a Next.js project with TypeScript and Tailwind"
    - "Enforce team coding standards via Cursor AI rules"
    - "Create file-specific AI behavior for tests vs implementation files"
  agents: [claude-code, openai-codex, cursor]
---

# Cursor Rules

## Overview

Cursor rules let you customize how Cursor's AI assistant behaves in your project. You can enforce coding conventions, provide project context, attach rules to specific file types, and share AI behavior across the team through version control.

There are two rule formats:
- **`.cursorrules`** (legacy) — single file in project root, always active
- **`.cursor/rules/*.mdc`** (current) — directory of rule files with frontmatter, supports targeting by file type and activation mode

## Instructions

### Rule types

| Type | When it applies |
|------|----------------|
| **Always** | Included in every AI request in the project |
| **Auto Attached** | Automatically added when files matching a glob pattern are in context |
| **Manual** | Only applied when explicitly referenced with `@rule-name` |
| **Agent Requested** | AI decides whether to include it based on the description |

### Step 1: Create the rules directory

```bash
mkdir -p .cursor/rules
```

### Step 2: MDC file format

Each `.mdc` file has a YAML frontmatter block followed by the rule content in Markdown:

```markdown
---
description: Rule description shown in the UI and used by Agent Requested rules
globs: src/**/*.ts, src/**/*.tsx
alwaysApply: false
---

# Rule content in Markdown

Your instructions here.
```

- `globs` — file patterns that trigger Auto Attached behavior (comma-separated)
- `alwaysApply` — set `true` for Always rules
- `description` — required for Agent Requested and Manual rules; helps the AI decide when to include it

### Step 3: Always rules — project-wide context

Create `.cursor/rules/project.mdc` for context that should apply to every conversation:

```markdown
---
description: Core project context and conventions
alwaysApply: true
---

# Project: Acme SaaS

## Stack
- Next.js 15 App Router, TypeScript strict mode
- Tailwind CSS + shadcn/ui components
- Prisma ORM + PostgreSQL
- Auth.js for authentication

## Conventions
- Use `async/await` over `.then()` chains
- Prefer `const` over `let`; never use `var`
- Export named exports, not default exports (except page components)
- All API route handlers must validate input with Zod
- Database queries go in `lib/db/` — never directly in components

## File structure
- `app/` — Next.js pages and API routes
- `components/` — Reusable UI components
- `lib/` — Business logic, utilities, and DB queries
- `types/` — Shared TypeScript types
```

### Step 4: Auto Attached rules — file-type specific behavior

Create `.cursor/rules/react-components.mdc` for React files:

```markdown
---
description: React component conventions
globs: src/components/**/*.tsx, app/**/*.tsx
alwaysApply: false
---

# React Component Rules

- Use functional components with TypeScript props interface
- Define props as `interface ComponentNameProps { ... }`
- Use shadcn/ui primitives (Button, Input, etc.) before custom HTML
- Add `"use client"` directive only when hooks or browser APIs are needed
- Wrap client components in Suspense with a meaningful fallback
- Never put business logic in components — call lib/ functions instead

## Pattern for data-fetching components:
```tsx
// Server component fetches data
export async function UserList() {
  const users = await getUsers(); // from lib/db/users.ts
  return <UserListClient users={users} />;
}
```
```

Create `.cursor/rules/api-routes.mdc` for API handlers:

```markdown
---
description: API route handler conventions
globs: app/api/**/*.ts
alwaysApply: false
---

# API Route Rules

- Always validate request body with Zod before processing
- Return consistent error shape: `{ error: string, code: string }`
- Use `NextResponse.json()` with appropriate HTTP status codes
- Authenticate with `auth()` from auth.js at the start of protected routes
- Log errors with context but never expose stack traces to clients

## Standard handler pattern:
```ts
import { z } from "zod";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const schema = z.object({ ... });

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 });

  // handle request
}
```
```

### Step 5: Test rules — testing-specific guidance

Create `.cursor/rules/tests.mdc`:

```markdown
---
description: Testing conventions for unit and integration tests
globs: **/*.test.ts, **/*.test.tsx, **/*.spec.ts
alwaysApply: false
---

# Testing Rules

- Use Vitest for unit tests, Playwright for E2E
- Follow AAA pattern: Arrange, Act, Assert
- Test file mirrors source file structure: `lib/utils.ts` → `lib/utils.test.ts`
- Mock external services in `__mocks__/` directory
- Each test should test one behavior, not one function
- Use `describe` blocks to group related tests
- Prefer `userEvent` over `fireEvent` in React Testing Library tests
```

### Step 6: Manual rules — on-demand context

Create `.cursor/rules/sql-optimization.mdc` for when you need SQL help:

```markdown
---
description: SQL query optimization patterns for PostgreSQL
alwaysApply: false
---

# SQL Optimization Rules

- Always use parameterized queries through Prisma
- Add database indexes for foreign keys and frequently filtered columns
- Use `select` to fetch only needed columns, never `findMany()` without limits
- Prefer `findMany` with cursor-based pagination over offset pagination
- Use `$transaction` for operations that must be atomic
```

Reference it in chat: `@sql-optimization How should I query the orders table?`

### Step 7: Legacy .cursorrules (simpler projects)

For small projects, a single `.cursorrules` file in the root works fine:

```
You are an expert TypeScript developer working on a Node.js REST API.

## Stack
- Node.js + Fastify + TypeScript
- Drizzle ORM + PostgreSQL

## Code style
- Use `async/await` everywhere
- Validate all inputs with Zod
- Return typed responses using Zod schemas
- Never use `any` type

## When generating code
- Add JSDoc comments to exported functions
- Include error handling with meaningful messages
- Write the happy path first, then handle edge cases
```

## Examples

### Example 1: Monorepo rules with package-specific targeting

```markdown
---
description: Backend package rules
globs: packages/backend/**/*.ts
alwaysApply: false
---

# Backend Rules
- Use dependency injection via constructors
- Services in `src/services/`, repositories in `src/repositories/`
- Every service method must have a corresponding unit test
```

```markdown
---
description: Frontend package rules
globs: packages/frontend/**/*.tsx
alwaysApply: false
---

# Frontend Rules
- Zustand for global state, React Query for server state
- No inline styles — Tailwind classes only
- Lazy-load heavy components with React.lazy()
```

### Example 2: Security-focused rules

```markdown
---
description: Security review checklist for code generation
alwaysApply: false
---

# Security Rules
- Never interpolate user input into SQL strings
- Sanitize HTML output with DOMPurify before rendering
- Validate and sanitize file upload names and types
- Rate-limit all public API endpoints
- Store secrets in environment variables, never in code
- Use `crypto.randomBytes` for token generation, not `Math.random`
```

## Guidelines

- Keep **Always** rules concise — they consume tokens on every request
- Use **Auto Attached** rules for file-type conventions (React, tests, API routes)
- Put large reference material (design system docs, API specs) in **Manual** rules
- Commit `.cursor/rules/` to version control so rules are shared across the team
- Use specific, actionable instructions — "prefer named exports" beats "write good code"
- Include code patterns and examples, not just prose rules
- Test rules by opening a file of the target type and checking `Ctrl+Shift+P → Cursor: Show Active Rules`
