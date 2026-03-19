---
name: windsurf-rules
description: >-
  Configure Windsurf AI coding assistant with .windsurfrules and workspace rules.
  Use when: customizing Windsurf for a project, setting AI coding standards,
  creating team-shared Windsurf configurations, or tuning Cascade AI behavior.
license: Apache-2.0
compatibility: "Windsurf 1.0+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["windsurf", "ai-coding", "rules", "workflow"]
  use-cases:
    - "Set up Windsurf rules for a React + TypeScript project"
    - "Share coding standards with a team through version-controlled rules"
    - "Tune Cascade AI to follow your project architecture"
  agents: [claude-code, cursor, windsurf]
---

# Windsurf Rules

## Overview

Windsurf rules customize how Cascade (Windsurf's AI) behaves in your project. Rules can be global (apply to all projects) or workspace-specific (apply only in this directory). Workspace rules are stored in `.windsurfrules` at the project root and can be committed to version control for team sharing.

## Instructions

### Rule scopes

| Scope | Location | Use for |
|-------|----------|---------|
| **Global** | Windsurf Settings → Rules | Cross-project standards (your personal style, preferred libraries) |
| **Workspace** | `.windsurfrules` in project root | Project-specific conventions, stack details, architecture patterns |

Workspace rules override global rules when they conflict.

### Step 1: Create the workspace rules file

Create `.windsurfrules` in your project root:

```bash
touch .windsurfrules
```

### Step 2: Basic structure

`.windsurfrules` is a plain Markdown file. Write it like a system prompt — clear, specific instructions for the AI:

```markdown
# Project: My SaaS App

## Tech Stack
- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Fastify, Prisma, PostgreSQL
- Auth: Clerk
- Deployment: Railway

## Code Style
- TypeScript strict mode — no implicit `any`
- Prefer `const` over `let`; never use `var`
- Use named exports; avoid default exports except for page-level components
- Async/await over promises — never mix `.then()` with `await`
- Format with Prettier (config in `.prettierrc`)

## Architecture Rules
- Business logic lives in `src/services/` — keep components thin
- Database access only through Prisma in `src/db/` — no raw SQL
- API calls go through `src/api/` client functions — never fetch() in components
- All environment variables accessed through `src/config/env.ts`

## Testing
- Unit tests with Vitest, E2E with Playwright
- Test files next to source: `Button.tsx` → `Button.test.tsx`
- Mock external dependencies, not internal modules
```

### Step 3: Stack-specific instructions

Give Cascade context about your exact versions and patterns:

```markdown
## React Patterns
- Use React Query (TanStack Query v5) for server state management
- Zustand for global client state — one store per domain
- React Hook Form + Zod for all forms
- Prefer Server Components; use `"use client"` only when necessary

## API Conventions
- REST endpoints follow: `GET /api/resources`, `POST /api/resources`, `PATCH /api/resources/:id`
- Response shape: `{ data: T }` for success, `{ error: string, code: string }` for errors
- All inputs validated with Zod schemas in `src/schemas/`
- Rate limiting applied to all public endpoints via `src/middleware/rateLimit.ts`
```

### Step 4: Provide examples for key patterns

Examples work better than prose rules for complex patterns:

```markdown
## File Organization

When creating a new feature, follow this structure:
```
src/features/users/
  components/       # React components
    UserList.tsx
    UserCard.tsx
  hooks/           # Custom hooks
    useUsers.ts
  services/        # Business logic
    users.service.ts
  schemas/         # Zod schemas
    user.schema.ts
  index.ts         # Public exports only
```

## Component Pattern

```tsx
// ✅ Correct
interface UserCardProps {
  userId: string;
  onSelect?: (id: string) => void;
}

export function UserCard({ userId, onSelect }: UserCardProps) {
  const { data: user } = useUser(userId);
  return <div onClick={() => onSelect?.(userId)}>{user?.name}</div>;
}

// ❌ Avoid
export default function ({ user, click }) {
  return <div onClick={click}>{user.name}</div>;
}
```
```

### Step 5: Set constraints and anti-patterns

Tell Cascade what to avoid:

```markdown
## What NOT to Do
- Never use `useEffect` for data fetching — use React Query instead
- Don't install new npm packages without noting them in the conversation
- Avoid class components — use functional components only
- Don't use `console.log` in production code — use the logger from `src/lib/logger.ts`
- Never hardcode API URLs — use `src/config/env.ts` constants
- Don't write database migrations manually — use `prisma migrate dev`
- Avoid prop drilling more than 2 levels deep — use context or Zustand
```

### Step 6: Global rules in Windsurf Settings

For rules that apply across all projects, add them in **Settings → General → Rules for AI**:

```markdown
## My Global Standards

- Write TypeScript, not JavaScript
- Add JSDoc comments to exported functions
- Suggest the simplest solution that solves the problem
- When multiple approaches exist, briefly explain the tradeoffs
- Flag security concerns proactively (SQL injection, XSS, secrets in code)
- Prefer established libraries over custom implementations for auth, crypto, dates
```

### Step 7: Per-conversation rules with Memories

Windsurf Cascade can store memories that persist across sessions. Trigger them with natural language:

```
"Remember: in this project we use inches not pixels for all spacing values"
"Always remind me to run tests before suggesting I commit"
```

These are stored automatically and referenced in future conversations in the same workspace.

## Examples

### Example 1: Python FastAPI project

```markdown
# Backend API — Python FastAPI

## Stack
- Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic
- Pydantic v2 for all schemas
- pytest + pytest-asyncio for tests
- Ruff for linting and formatting

## Patterns
- Dependency injection via FastAPI `Depends()`
- Repository pattern: routers call services, services call repositories
- All DB models in `app/models/`, Pydantic schemas in `app/schemas/`
- Background tasks via FastAPI `BackgroundTasks` or Celery for heavy work

## Rules
- Type everything — `from __future__ import annotations`
- Use `async def` for all route handlers and DB operations
- Validate env vars at startup with a Pydantic settings class in `app/config.py`
- Return HTTP 422 for validation errors (FastAPI default), 400 for business logic errors

## Anti-patterns to avoid
- Sync DB calls in async routes (use `await` always)
- Catching broad `Exception` — be specific with exception types
- Business logic inside Pydantic validators
```

### Example 2: Mobile React Native project

```markdown
# React Native App

## Stack
- React Native 0.74, Expo SDK 51, TypeScript
- Expo Router for navigation (file-based)
- Zustand for state, React Query for API data
- NativeWind (Tailwind for RN)

## Rules
- Use `expo-*` packages over third-party when available
- All screens in `app/` following Expo Router conventions
- StyleSheet.create() only for dynamic styles; static styles via NativeWind classes
- Test on both iOS and Android before declaring complete
- Accessibility: all interactive elements must have `accessibilityLabel`

## Performance
- Use `FlashList` instead of `FlatList` for long lists
- Memoize expensive components with `React.memo()`
- Avoid anonymous functions in `renderItem` props
```

## Guidelines

- Keep `.windsurfrules` focused — 100-300 lines is ideal; too long dilutes effectiveness
- Be **specific** and **actionable**: "use React Query for server state" beats "manage state well"
- Use **examples** liberally — Cascade learns patterns faster from code than prose
- Commit `.windsurfrules` to git so all team members share the same AI behavior
- Update rules when you make architecture decisions — treat it like living documentation
- Global rules for your personal style; workspace rules for project-specific patterns
- Avoid contradicting yourself — conflicting rules confuse the AI
- Review and prune outdated rules when the project evolves
