---
name: windsurf-rules
description: >-
  Windsurf rules are Markdown files that tell the Cascade AI agent in the
  Windsurf IDE (now branded Devin Desktop) how to work in a project: stack,
  code style, architecture and things to avoid. Use when a user asks to set up
  .windsurfrules or .windsurf/rules, write global or workspace rules for
  Windsurf, scope a rule to certain files, share coding standards with a team,
  or tune Cascade behavior.
license: Apache-2.0
compatibility: "Windsurf / Devin Desktop IDE; workspace rules in .devin/rules/ or .windsurf/rules/, legacy .windsurfrules still read"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["windsurf", "ai-coding", "rules", "cascade"]
---

# Windsurf Rules

## Overview

Rules are persistent instructions that Cascade (the AI agent in the Windsurf IDE) receives while it works. Windsurf is now published as Devin Desktop (by Cognition); the docs and UI use that name, but the same Cascade rules system, the `.windsurf/` directory and the legacy `.windsurfrules` file are still supported, so this skill keeps the Windsurf name.

Rules come at four levels: a global file, per-rule files in the workspace, `AGENTS.md` files in any directory, and system-level files deployed by IT. Each workspace rule has an activation mode that decides when its text enters the context window, so a rule costs nothing until it is relevant.

## Instructions

### Step 1: Pick the scope

| Scope | Location | Notes |
|-------|----------|-------|
| Global | `~/.codeium/windsurf/memories/global_rules.md` | One file, always on, all workspaces. Limit 6,000 characters. |
| Workspace | `.devin/rules/*.md` (preferred) or `.windsurf/rules/*.md` | One file per rule, each with an activation mode. Limit 12,000 characters per file. |
| Directory | `AGENTS.md` (or `agents.md`) in any folder | No frontmatter. Root file is always on; a subfolder file applies only to files inside that folder. |
| Legacy | `.windsurfrules` at the workspace root | Single plain Markdown file, still read. Prefer separate rule files for new work. |
| System (enterprise) | `/etc/devin/rules/` (Linux), `/Library/Application Support/Devin/rules/` (macOS), `C:\ProgramData\Devin\rules\` (Windows) | Deployed by IT, read-only; `Windsurf` directories are the legacy fallback. |

Rules are discovered in the workspace, its subdirectories and parent directories up to the git root. Create rules from the UI (the Customizations icon in the Cascade panel, then Rules, then `+ Global` or `+ Workspace`) or write the files by hand and commit them.

### Step 2: Write a workspace rule with an activation mode

Each file in `.devin/rules/` starts with frontmatter whose `trigger` field picks the mode:

| `trigger:` | When the rule reaches Cascade |
|------------|-------------------------------|
| `always_on` | Full text in the system prompt on every message |
| `model_decision` | Only the `description` is shown; Cascade reads the file when it judges it relevant |
| `glob` | When Cascade reads or edits a file matching `globs` (for example `src/**/*.ts`) |
| `manual` | Only when you type `@rule-name` in the Cascade input |

```bash
mkdir -p .devin/rules
```

```markdown
---
trigger: always_on
---
# Stack and conventions
- Frontend: React 19, TypeScript strict mode, Vite, Tailwind CSS
- Backend: Node.js 22, Fastify, Prisma, PostgreSQL
- Named exports only; default exports just for page components
- Business logic in `src/services/`; components stay thin
- Environment variables are read only through `src/config/env.ts`
```

```markdown
---
trigger: glob
globs: "**/*.test.ts"
---
- Use `describe`/`it` blocks with Vitest
- Mock external HTTP calls, never internal modules
- Test file sits next to the source: `Button.tsx` and `Button.test.tsx`
```

### Step 3: Write rules Cascade can follow

- Keep each rule short and specific; the docs advise against generic lines like "write good code", which the model already follows.
- Use bullet lists and Markdown. XML-style tags can group related rules.
- Show a small correct example for patterns that are hard to describe, and name the anti-pattern next to it:

```markdown
## Component pattern
export function UserCard({ userId, onSelect }: UserCardProps) { ... }   // correct
export default function ({ user, click }) { ... }                      // avoid
```

- State prohibitions as a short list: no `useEffect` for data fetching (use TanStack Query), no hardcoded API URLs, no hand-written migrations (use `prisma migrate dev`).

### Step 4: Add AGENTS.md for folder-specific guidance

```
my-shop/
  AGENTS.md              # always on: project-wide conventions
  frontend/AGENTS.md     # applies only when working under frontend/
  backend/AGENTS.md
```

Plain Markdown, no frontmatter. The same file is also read by other agents (Codex, Claude Code and others), so it is a good place for rules you want shared across tools.

### Step 5: Global rules, memories, workflows and skills

- Global rules (`global_rules.md`) hold personal habits that apply everywhere, for example "flag security concerns proactively" or "explain tradeoffs when several approaches exist".
- Memories are generated by Cascade (or on request: "create a memory of ...") and stored locally in `~/.codeium/windsurf/memories/`, per workspace, never committed. They apply to the legacy Cascade agent only; the Devin Local agent does not keep memories. For anything the team should rely on, write a rule or `AGENTS.md` instead.
- Workflows (`.devin/workflows/*.md`, run as `/workflow-name`) are manual runbooks. Skills (`.devin/skills/<name>/SKILL.md`, with optional scripts and templates) are picked by the model or by `@name`. Use a skill when a task needs supporting files; use a rule for a constraint.

## Examples

### Example 1: Python FastAPI project

User request: "Set up Windsurf rules for our FastAPI service so Cascade stops writing sync database code."

Create `.devin/rules/backend.md`:

```markdown
---
trigger: glob
globs: "app/**/*.py"
---
# Backend API (Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic)
- Use `async def` for route handlers and every database call
- Dependencies come from FastAPI `Depends()`; routers call services, services call repositories
- Pydantic v2 schemas live in `app/schemas/`, models in `app/models/`
- Settings come from a Pydantic settings class in `app/config.py`, validated at startup
- Never catch bare `Exception`; no business logic inside Pydantic validators
- Tests: pytest with pytest-asyncio; lint and format with Ruff
```

Result: the rule is applied when Cascade reads or edits a `.py` file under `app/`, and costs no context during frontend work.

### Example 2: Move an old .windsurfrules file to rule files

User request: "Our repo has a 400-line .windsurfrules. Cascade ignores half of it."

Split it by topic into files under `.devin/rules/`: `stack.md` (`trigger: always_on`, under 60 lines), `react.md` (`trigger: glob`, `globs: "src/**/*.tsx"`), `testing.md` (`trigger: glob`, `globs: "**/*.test.*"`) and `release.md` (`trigger: manual`, called with `@release`). Delete duplicated or generic lines, keep each file under 12,000 characters, then `git add .devin/rules && git commit -m "Split Windsurf rules by topic"`. Result: less always-on text, so the lines that remain are followed more reliably.

## Guidelines

- Prefer `.devin/rules/` for new rules; `.windsurf/rules/` and `.windsurfrules` keep working. If both exist for the same workspace, `.devin/` takes precedence.
- Respect the limits: 6,000 characters for the global file, 12,000 per workspace rule.
- Use `always_on` sparingly, since it is paid on every message; scope the rest with `glob`, `model_decision` or `manual`.
- Commit workspace rules and `AGENTS.md` to git so the team shares them; global rules and memories stay on one machine.
- Never put secrets, tokens or internal URLs in rules; the files are committed and sent to the model.
- Avoid contradictions between global, workspace and `AGENTS.md` rules; the docs describe them as combined context, so conflicting lines confuse the model.
- Review rules when the stack changes: stale version numbers and removed libraries make Cascade generate outdated code.
- Rules guide behavior but do not enforce it; keep linters, type checks and tests in CI for anything that must never break.
