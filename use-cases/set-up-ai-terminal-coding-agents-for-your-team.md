---
title: Set Up AI Terminal Coding Agents for Your Team
slug: set-up-ai-terminal-coding-agents-for-your-team
description: Configure a team-wide AI coding workflow using Claude Code for complex architecture tasks, OpenAI Codex CLI for autonomous issue resolution in CI, and Gemini CLI for codebase-wide analysis — standardizing how a 6-person engineering team delegates work to AI agents while maintaining code quality and security.
skills: [claude-code, openai-codex-cli, gemini-cli]
category: Developer Tools
tags: [ai-coding, terminal, cli, team-workflow, autonomous-agent, developer-productivity]
---

# Set Up AI Terminal Coding Agents for Your Team

Sam is an engineering manager at a Series A startup with 6 developers. Each developer uses AI differently — some copy-paste into ChatGPT, some use Copilot suggestions they don't review, and one developer doesn't use AI at all. The result: inconsistent code quality, no shared conventions for AI-generated code, and security concerns about code being sent to different providers.

Sam standardizes the team on three terminal-based AI agents, each for a specific workflow: Claude Code for complex architecture and multi-file tasks, Codex CLI for autonomous issue processing in CI, and Gemini CLI for codebase analysis and documentation.

## Step 1: Claude Code for Complex Tasks

Claude Code is the team's primary tool for tasks requiring deep understanding: architecture decisions, complex refactoring, feature implementation across multiple files.

```markdown
# CLAUDE.md — Team conventions (committed to repo)

## Project
TypeScript monorepo: apps/web (Next.js 14), apps/api (Hono on Cloudflare Workers),
packages/db (Drizzle ORM + PostgreSQL), packages/ui (shadcn components).

## Coding Standards
- Strict TypeScript everywhere (no `any`, no `as` casts without comment)
- Server components by default; 'use client' only when needed
- All API endpoints: Zod input validation + typed responses
- Database: Drizzle queries in packages/db/src/queries/, never raw SQL in app code
- Tests: Vitest + MSW for API mocking, Testing Library for components

## Architecture Rules
- New features: create a design doc in docs/decisions/ before implementing
- Database changes: always create a migration with `drizzle-kit generate`
- New API endpoints: add OpenAPI schema in packages/api-spec/
- Shared types: define in packages/types/, never duplicate across apps

## Security
- Never commit secrets; use environment variables
- All user input goes through Zod validation
- SQL queries only via Drizzle ORM (prevents injection)
- Rate limiting on all public endpoints

## Don't
- Don't use `useEffect` for data fetching (use server components or TanStack Query)
- Don't add new npm dependencies without checking bundle size
- Don't modify the CI pipeline without Sam's review
```

```bash
# Daily developer workflow with Claude Code
claude                                    # Start interactive session

# Complex feature: "Add team billing"
# Claude reads CLAUDE.md, understands the monorepo structure,
# creates migration, API endpoints, UI components, and tests

# Architecture review
claude "Review the authentication flow end-to-end. Are there any
security issues? Check token handling, session management, and
CORS configuration."
```

## Step 2: Codex CLI for Autonomous CI Tasks

Codex CLI runs in full-auto mode within CI pipelines — automatically fixing lint errors, generating missing tests, and resolving simple issues from the backlog.

```yaml
# .github/workflows/ai-assist.yml — Codex in CI
name: AI Auto-Fix
on:
  issues:
    types: [labeled]
  push:
    branches: [main]

jobs:
  auto-fix-lint:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      - name: Run linter
        id: lint
        run: npm run lint 2>&1 | tee lint-output.txt || true

      - name: Auto-fix with Codex
        if: failure()
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @openai/codex --approval-mode full-auto \
            --message "Fix all lint errors reported in lint-output.txt. Only modify the files that have errors. Run 'npm run lint' after fixing to verify."

      - name: Create PR with fixes
        if: failure()
        uses: peter-evans/create-pull-request@v5
        with:
          title: "fix: auto-fix lint errors"
          branch: ai/auto-lint-fix
          body: "Automated lint fixes by Codex CLI"

  resolve-issue:
    if: github.event.label.name == 'ai-ready'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      - name: Resolve issue with Codex
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
          ISSUE_BODY: ${{ github.event.issue.body }}
        run: |
          npx @openai/codex --approval-mode auto-edit \
            --auto-test --test-cmd "npm test" \
            --message "Resolve this issue: ${ISSUE_TITLE}. Details: ${ISSUE_BODY}. Follow the conventions in codex.md. Run tests after changes."

      - name: Create PR
        uses: peter-evans/create-pull-request@v5
        with:
          title: "fix: resolve #${{ github.event.issue.number }} — ${{ github.event.issue.title }}"
          branch: "ai/issue-${{ github.event.issue.number }}"
          body: "Closes #${{ github.event.issue.number }}\n\nAutomated by Codex CLI."
```

## Step 3: Gemini CLI for Codebase Analysis

Gemini's 1M+ token context window makes it ideal for whole-codebase analysis — architecture reviews, dependency audits, documentation generation, and finding patterns across hundreds of files.

```bash
# Weekly codebase health check (runs Monday morning)
gemini "Analyze the entire codebase. Report:
1. Dead code (exported functions never imported elsewhere)
2. Circular dependencies between packages
3. Files over 300 lines that should be split
4. TODO/FIXME comments older than the last 20 commits
5. API endpoints without test coverage
Output as a markdown checklist."

# Security audit
gemini "Review all files in apps/api/src/ for:
- Input validation gaps (endpoints without Zod schemas)
- Authentication bypass possibilities
- Rate limiting coverage
- SQL injection risks (even with ORM)
- Exposed error details in responses
Rate each finding as Critical/High/Medium/Low."

# Generate architecture docs
gemini "Create an architecture document for this project:
1. System overview diagram (mermaid)
2. Data flow for key user journeys (signup, create project, invite team)
3. Database schema relationships
4. API endpoint inventory with auth requirements
5. External service dependencies
Save as docs/ARCHITECTURE.md"
```

## Team Guidelines

```markdown
# docs/AI_CODING_GUIDELINES.md

## Which tool when?

| Task | Tool | Mode |
|------|------|------|
| Complex features (multi-file) | Claude Code | Interactive |
| Architecture decisions | Claude Code | Interactive |
| Simple bug fixes | Codex CLI | auto-edit |
| Lint/test fixes in CI | Codex CLI | full-auto |
| Codebase analysis | Gemini CLI | Interactive |
| Documentation generation | Gemini CLI | Interactive |
| Code review prep | Gemini CLI | Interactive |

## Rules
1. Always review AI-generated code before merging
2. AI-generated PRs need human review (label: `ai-generated`)
3. Never share API keys between personal and CI use
4. Run tests after every AI code change
5. Complex tasks: Claude Code interactive. Simple tasks: Codex auto.
```

## Results After 90 Days

- **Developer velocity**: 28 story points/sprint → 47 story points/sprint (+68%)
- **Issue resolution**: 32 issues auto-resolved by Codex in CI (41% of labeled issues)
- **Code quality**: Lint errors in CI dropped to 0 (auto-fixed on every push)
- **Documentation**: Architecture docs auto-generated and kept up-to-date by Gemini
- **Security**: 3 medium-severity issues found by Gemini audit that human review missed
- **AI cost**: ~$180/month across all three tools for a 6-person team
