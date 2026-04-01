---
title: Optimize AI Coding Agent for Production Team Use
slug: optimize-ai-coding-agent-for-production
description: Standardize Claude Code across a 12-person dev team — shared CLAUDE.md templates, skills library, cross-session memory, and security guardrails — boosting task completion by 40% and eliminating accidental destructive operations.
skills:
  - everything-claude-code
  - claude-subconscious
category: development
tags:
  - claude-code
  - team
  - optimization
  - memory
  - security
  - best-practices
  - agent-performance
  - developer-productivity
---

## The Problem

Mira leads a 12-person engineering team that adopted Claude Code six months ago. Usage is high — developers love it — but the results are wildly inconsistent:

- **Fragmented setups** — Each developer has their own CLAUDE.md (or none). The agent behaves completely differently per person.
- **Context amnesia** — Every session starts from scratch. Claude doesn't remember that we switched to tRPC, that we deprecated the old auth module, or that we agreed on hexagonal architecture three months ago.
- **No guardrails** — Last week, a junior dev asked Claude to "clean up the project" and it deleted the entire `/scripts` directory. Didn't break main (they caught it in PR review), but it was close.
- **Inconsistent quality** — Some developers get great results. Others get hallucinated APIs, wrong patterns, and code that doesn't fit the codebase. Nobody knows why.
- **Zero measurement** — They know Claude Code is "helpful" but can't quantify it. No data on task completion rate, context efficiency, or error patterns.

The team needs Claude Code to feel like a single, well-trained senior engineer that knows the codebase — not 12 random contractors with different instructions.

## The Solution

Use **everything-claude-code** to implement a complete agent harness system: standardized CLAUDE.md templates, a shared skills library, memory persistence hooks, security guardrails, and measurement infrastructure.

Optional: Add **claude-subconscious** for persistent cross-session memory that builds up automatically over time.

## Step-by-Step Walkthrough

### Step 1: Standardize CLAUDE.md Across All Repos

Create a CLAUDE.md template that every repo must have. Add it to the company's repo template and backfill existing repos.

```bash
# Install ECC for the scaffolding tools
npm install -g ecc-universal

# Generate a CLAUDE.md for an existing repo
cd your-repo
ecc init  # Interactive wizard
```

**Standard team CLAUDE.md structure:**

```markdown
# CLAUDE.md — [Service Name]

## What This Service Does
[2 sentences max. What problem does this solve? Who uses it?]

## Tech Stack
- Language: TypeScript 5.x (strict mode)
- Framework: Next.js 15 (App Router)
- Database: PostgreSQL 16 via Prisma ORM
- Auth: Clerk (not NextAuth — we migrated in Q3 2024)
- Testing: Vitest + Testing Library
- API: tRPC v11 (not REST — we migrated from REST in Q4 2024)

## Architecture
- Monorepo: Turborepo
- Packages: `apps/web`, `apps/api`, `packages/ui`, `packages/db`
- Pattern: Hexagonal architecture (ports and adapters)
- State: Zustand for client state, React Query for server state

## Code Conventions
- No default exports (named exports only)
- Zod for all input validation
- `result-ts` for error handling (not throw/catch)
- Server components by default; client components only when needed
- Never use `any` — use `unknown` and narrow types

## Key Commands
- Dev: `pnpm dev` (from root)
- Test: `pnpm test` (unit), `pnpm test:e2e` (Playwright)
- Lint: `pnpm lint` (must pass before committing)
- DB migration: `pnpm db:migrate` (never edit migration files)

## Rules
- NEVER force push to main/develop/staging
- NEVER modify files in `prisma/migrations/` directly
- NEVER commit .env files with real credentials
- ALWAYS run `pnpm lint && pnpm test` before suggesting a commit
- ALWAYS create a branch for any changes
- Research existing patterns before creating new abstractions

## Recent Decisions (update quarterly)
- 2024-Q4: Migrated REST → tRPC. No new REST endpoints.
- 2024-Q3: Migrated NextAuth → Clerk. Don't reference NextAuth.
- 2024-Q3: Adopted hexagonal architecture. New features go in domain layer.
- 2025-Q1: Switched to Vitest from Jest. Old Jest tests still exist — don't add new ones.
```

**Enforcement:** Add a CI check that fails if CLAUDE.md is missing or under 50 lines.

```yaml
# .github/workflows/claude-md-check.yml
- name: Verify CLAUDE.md
  run: |
    [ -f CLAUDE.md ] || (echo "CLAUDE.md missing!" && exit 1)
    wc -l CLAUDE.md | awk '{if ($1 < 50) {print "CLAUDE.md too short"; exit 1}}'
```

### Step 2: Set Up a Shared Skills Library

Create a team skills repo and mount it in all developer environments.

```bash
# Create shared skills repo
mkdir company-claude-skills && cd company-claude-skills
git init
git remote add origin git@github.com:company/claude-skills.git

# Directory structure
mkdir -p skills/{typescript-tdd,api-patterns,database-migrations,deploy-workflow,code-review}
```

**Example: `skills/typescript-tdd/SKILL.md`**

```markdown
# TypeScript TDD

## When to Use
Any time you're implementing a new feature or fixing a bug.

## Process
1. Read the existing test file for the module (look for `*.test.ts` or `*.spec.ts`)
2. Write a failing test that describes the expected behavior
3. Run `pnpm test --run` to confirm it fails with the right error
4. Write minimal implementation to make the test pass
5. Run full test suite: `pnpm test`
6. Refactor if needed, re-run tests

## Rules
- Test file lives next to source: `src/auth/login.ts` → `src/auth/login.test.ts`
- Mock external services with `vi.mock()` — never hit real APIs
- For database, use the test database: `DATABASE_URL=postgresql://localhost/test_db`
- Aim for behavior tests, not implementation tests
```

**Mount in all repos via symlink:**

```bash
# In each repo's setup script
ln -s ~/company-claude-skills/skills .claude/team-skills

# Add to CLAUDE.md
## Team Skills
Shared team skills: `.claude/team-skills/`
Load these for domain-specific tasks.
```

### Step 3: Configure Memory — Session → Project → Team Knowledge Base

Three-layer memory stack ensures context is never lost:

**Layer 1: Session hooks (automatic capture)**

```bash
# .claude/hooks/session-end.sh
#!/bin/bash
# Auto-captures decisions and file changes at session end

SESSION_FILE=".claude/memory/$(date +%Y-%m-%d).md"
mkdir -p .claude/memory

cat >> "$SESSION_FILE" << EOF
## Session $(date +%H:%M)
Task: ${CLAUDE_TASK:-"Not specified"}
Files modified:
$(git diff --name-only 2>/dev/null | head -20 | sed 's/^/- /')
Key changes:
$(git diff --stat 2>/dev/null | tail -5)
---
EOF
```

**Layer 2: Project memory (curated, quarterly update)**

```markdown
# .claude/memory/DECISIONS.md

## Architecture
- Hexagonal architecture: domain/ contains business logic, adapters/ contains I/O
- All external services go through ports (interfaces), not direct calls

## Libraries
- tRPC for all new API routes (migrated from REST in Q4 2024)
- Clerk for auth (migrated from NextAuth in Q3 2024)
- Prisma for database (never write raw SQL in application code)
- Zod for validation (all external inputs must be validated)

## Testing
- Vitest + Testing Library (replacing old Jest tests over time)
- E2E: Playwright tests in `e2e/` directory
- Coverage threshold: 80% for new code

## Performance
- Server components by default in Next.js
- Client components only for interactive UI
- No client-side data fetching (use React Query or server components)
```

**Layer 3: claude-subconscious (automatic cross-session memory)**

```bash
# Install the plugin for all team members
/plugin marketplace add letta-ai/claude-subconscious
/plugin install claude-subconscious@claude-subconscious

# Set team Letta API key (shared agent per repo)
export LETTA_API_KEY="team-api-key"
export LETTA_MODE="whisper"
```

After a few weeks, the subconscious agent builds up a rich model of the codebase and team patterns — automatically. No manual updates needed.

### Step 4: Security Guardrails

Install AgentShield (included in ECC) and configure team-specific rules:

```bash
# Install AgentShield
npm install -g ecc-agentshield

# Initialize security config
ecc security-init
```

**Team security rules (`.claude/security/rules.yaml`):**

```yaml
rules:
  # Git safety
  - id: no-force-push
    description: "Never force push to protected branches"
    pattern: "git push.*--force"
    branches: [main, develop, staging, production]
    severity: critical
    action: block

  - id: require-branch
    description: "Always work on a branch, never commit to main"
    pattern: "git commit.*"
    check: "git branch --show-current | grep -qvE '^(main|develop|staging|production)$'"
    severity: high
    action: warn

  # File operations
  - id: protect-env
    description: "Never read or display .env files"
    pattern: "(cat|read|display|show).*\\.env"
    severity: critical
    action: block

  - id: no-mass-delete
    description: "Require confirmation for directory deletion"
    pattern: "rm -rf [a-zA-Z/]"
    severity: high
    action: require-confirmation

  # Secrets
  - id: no-commit-secrets
    description: "Block commits containing API keys or tokens"
    pre_commit: true
    patterns:
      - "sk-[a-zA-Z0-9]{48}"   # OpenAI
      - "ghp_[a-zA-Z0-9]{36}"  # GitHub PAT
      - "AKIA[0-9A-Z]{16}"     # AWS
    severity: critical
    action: block
```

**Distribute via repo template or onboarding script:**

```bash
# onboarding.sh — run once per developer
ecc security-install --rules company-security-rules.yaml
echo "Security rules installed. Claude Code will now enforce team guardrails."
```

### Step 5: Research-First Methodology

Train developers to set up their CLAUDE.md with a research-first requirement. Add it to the team standard:

```markdown
## CLAUDE.md Rule — Research First (add to all repos)

Before implementing any feature or fix:
1. **Search existing code** — `grep -r "related_term" src/` before creating anything new
2. **Check the skills** — Is there a team skill for this pattern?
3. **Read the module** — Read the header/README of the module you're modifying
4. **Check recent decisions** — Review `.claude/memory/DECISIONS.md`
5. **Then implement** — Following the established patterns

This prevents: reinventing utilities, using deprecated patterns, creating architectural inconsistencies.
```

**Enforce via slash command:**

```bash
# /research command (add to .claude/commands/research.md)
When starting any task:
1. Run: grep -r "${TASK_KEYWORD}" src/ --include="*.ts" | head -20
2. Check: ls .claude/team-skills/ and identify relevant skills
3. Read: The top 2-3 most relevant files found
4. Summarize: What patterns exist that should be followed?
5. Then proceed with implementation
```

### Step 6: Measure — Track What Matters

Set up lightweight measurement to quantify improvement:

```bash
# Add to .claude/hooks/session-end.sh
# Log session metrics to team dashboard

curl -X POST "https://metrics.company.internal/claude-sessions" \
  -H "Content-Type: application/json" \
  -d "{
    \"developer\": \"$(git config user.email)\",
    \"repo\": \"$(basename $(git rev-parse --show-toplevel))\",
    \"task\": \"${CLAUDE_TASK}\",
    \"files_changed\": $(git diff --name-only | wc -l),
    \"session_date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"completed\": ${CLAUDE_TASK_COMPLETED:-true}
  }"
```

**Track these metrics weekly:**

| Metric | Before | After (Month 1) | Target |
|--------|--------|-----------------|--------|
| Task completion rate | ~60% | ~80% | 85%+ |
| Sessions per task | 3.2 avg | 1.8 avg | ≤2 |
| Incorrect pattern usage | 4-5/week | 0-1/week | 0 |
| Destructive operations blocked | N/A | 2 blocked | 0 reach PR |
| Developer satisfaction | 6.2/10 | 8.1/10 | 8.5+ |

## The Result

**Month 1 after rollout:**

- **40% improvement in task completion rate** (60% → 84%) — measured by PR success rate for agent-assisted tasks
- **Zero accidental destructive operations** — security rules blocked 3 force pushes and 1 `rm -rf` attempt in the first week
- **Consistent code quality** — PR reviewers report significantly less "this doesn't fit our patterns" feedback
- **Faster onboarding** — New developers are productive with Claude Code in day 1 instead of week 2

**Developer feedback:**

> "It actually knows we use tRPC now. Stopped suggesting REST endpoints." — Senior dev

> "The research-first prompt changed everything. Claude reads the code before writing." — Tech lead

> "I haven't had to tell it about our auth system once this month." — Junior dev

## Tips and Gotchas

- **Roll out CLAUDE.md first** — It has the highest ROI and zero infrastructure requirements
- **Don't over-engineer skills** — Start with 3-5 skills covering your most common patterns; expand from there
- **Review and prune quarterly** — Stale CLAUDE.md content is worse than no CLAUDE.md (wrong context)
- **Security rules need testing** — Test that guardrails actually trigger before announcing them to the team
- **claude-subconscious is optional but powerful** — Requires Letta API key; worth it for long-running projects
- **Measure before rolling out** — Baseline metrics make it easy to demonstrate ROI to management

## What's Next

Once the foundation is stable:

- Add per-language skills (TypeScript patterns, Python idioms, SQL conventions)
- Build a `/deploy` skill that walks through your deployment checklist
- Set up team-wide instinct extraction: weekly review of session transcripts to identify new patterns worth capturing
- Create a `/harness-audit` baseline score and track improvement over time
