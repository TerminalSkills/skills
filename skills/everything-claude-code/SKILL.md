---
name: everything-claude-code
description: >-
  Optimize AI coding agent performance with proven patterns — skills architecture, memory
  management, security hardening, and research-first development. Use when: maximizing Claude
  Code/Codex/Cursor effectiveness, setting up agent best practices, building production-grade
  agent workflows.
license: MIT
compatibility: "Claude Code, Codex, Cursor, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags:
    - claude-code
    - optimization
    - best-practices
    - memory
    - security
    - agent-performance
  use-cases:
    - "Optimize Claude Code setup for maximum coding productivity"
    - "Implement memory and security best practices for AI coding agents"
    - "Set up a research-first development methodology with AI"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Everything Claude Code

The performance optimization system for AI agent harnesses. Not just configs — a complete system covering skills, instincts, memory optimization, continuous learning, security scanning, and research-first development. Evolved over 10+ months of intensive daily use building real products.

> Source: [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (129k+ ⭐) — Anthropic Hackathon Winner

Works across **Claude Code**, **Codex**, **Cowork**, **Cursor**, and other AI agent harnesses.

## CLAUDE.md Optimization

The `CLAUDE.md` file is your agent's brain boot sequence. An optimized CLAUDE.md dramatically improves task completion rates.

### Structure

```markdown
# CLAUDE.md

## Project Context
- What this project does (1-2 sentences)
- Tech stack: [list frameworks, languages, key libraries]
- Architecture: [monorepo/microservices/serverless]

## Code Conventions
- Style: [prettier, eslint config, formatting rules]
- Naming: [camelCase for functions, PascalCase for components]
- Testing: [jest, vitest, pytest — where tests live, how to run]

## Key Commands
- Build: `npm run build`
- Test: `npm test`
- Deploy: `./deploy.sh staging`

## Project-Specific Rules
- Never modify migration files directly
- All API changes need OpenAPI spec update
- Use server components by default (Next.js)

## Current Sprint Context
- Working on: user authentication refactor
- Blocked on: waiting for Stripe webhook setup
- Recent decisions: switched from REST to tRPC
```

### Tips for CLAUDE.md

- **Keep it under 500 lines** — Token cost matters; trim ruthlessly
- **Update after major decisions** — Architecture changes, library swaps
- **Include "don't" rules** — What the agent should never do is as important as what it should
- **Add file pointers** — "Auth logic is in `src/auth/`, don't look elsewhere"

## Skills Architecture

Skills are reusable instruction sets that teach the agent domain-specific patterns.

### Directory Structure

```
.claude/
├── CLAUDE.md              # Project context
├── skills/
│   ├── typescript-tdd/    # Test-driven development patterns
│   ├── api-design/        # REST/GraphQL conventions
│   ├── database-migration/ # Safe migration workflows
│   └── deploy-staging/    # Deployment procedures
└── commands/
    ├── /review            # Code review workflow
    ├── /deploy            # Deployment pipeline
    └── /test-coverage     # Coverage analysis
```

### Writing Effective Skills

```markdown
# skill: typescript-tdd

## When to Use
Triggered when writing new features or refactoring existing code.

## Process
1. Write the test first — describe expected behavior
2. Run the test — verify it fails for the right reason
3. Write minimal implementation to pass
4. Refactor — clean up without changing behavior
5. Run full test suite — ensure no regressions

## Rules
- Every exported function needs at least one test
- Mock external services, never real APIs in tests
- Test file lives next to source: `foo.ts` → `foo.test.ts`
```

## Instinct Patterns

Instincts are automatic behaviors the agent develops through continuous learning — patterns extracted from successful sessions and applied automatically.

### How Instincts Work

```yaml
# .claude/instincts/check-types-before-commit.yaml
trigger: "before any git commit"
action: "Run tsc --noEmit to catch type errors"
confidence: 0.92
source: "Extracted from 47 sessions where type errors were caught post-commit"
```

### Built-in Instinct Categories

- **Pre-commit checks** — Type checking, lint, test affected files
- **Error recovery** — Common error patterns and their fixes
- **Context loading** — Which files to read first for different task types
- **Security checks** — Scan for leaked secrets, unsafe patterns

## Memory Management

Memory in AI agents operates at three levels:

### Session Memory (Active Context)

What the agent knows during the current session:

- Files read and modified
- Conversation history
- Tool outputs and results
- Errors encountered and how they were resolved

**Optimization:** Keep sessions focused. One task per session = better context utilization.

### Project Memory (CLAUDE.md + Skills)

Persistent knowledge that loads at session start:

- Project context and conventions
- Skill instructions
- Command definitions
- Recent decisions and sprint context

**Optimization:** Prune stale content. A 6-month-old sprint context is noise, not signal.

### Global Memory (Cross-Project Patterns)

Patterns that apply across all projects:

- Language conventions (TypeScript patterns, Python idioms)
- Tool usage patterns (git workflows, Docker commands)
- Security rules (never commit secrets, always validate input)

**Optimization:** Use `~/.claude/CLAUDE.md` for global rules, project-level for specifics.

### Hooks for Memory Persistence

Automate memory capture with hooks:

```bash
# .claude/hooks/session-end.sh
# Captures key decisions from the session transcript
#!/bin/bash
echo "## Session $(date +%Y-%m-%d_%H:%M)" >> .claude/memory/sessions.md
echo "- Task: $CLAUDE_TASK" >> .claude/memory/sessions.md
echo "- Files modified: $(git diff --name-only)" >> .claude/memory/sessions.md
```

## Security Hardening

Production agents need guardrails. ECC includes AgentShield with 1282 tests and 102 rules.

### Git Guardrails

```yaml
# Prevent force pushes
- rule: "never-force-push"
  action: "Block git push --force on main/master/develop"

# Require branch for changes
- rule: "no-direct-main"
  action: "Always create a branch, never commit directly to main"
```

### File Operation Restrictions

```yaml
# Protect sensitive files
- rule: "protect-env"
  action: "Never read, modify, or display .env files with real credentials"

# Prevent mass deletion
- rule: "no-rm-rf"
  action: "Never run rm -rf on directories without explicit user confirmation"
```

### Secret Scanning

```yaml
# Scan before commit
- rule: "pre-commit-secrets"
  action: "Check staged files for API keys, tokens, passwords before any commit"
  patterns:
    - "sk-[a-zA-Z0-9]{48}"        # OpenAI keys
    - "ghp_[a-zA-Z0-9]{36}"       # GitHub PATs
    - "AKIA[0-9A-Z]{16}"          # AWS access keys
```

### Security Scan Command

```bash
# Run AgentShield security audit
/security-scan

# Output: vulnerability report with severity ratings
# Critical: 0 | High: 2 | Medium: 5 | Low: 12
```

## Research-First Development

The core methodology: agents research before they code.

### The Pattern

```
1. RESEARCH    — Read docs, check existing code, understand the problem space
2. PLAN        — Outline the approach, list files to modify, identify risks
3. IMPLEMENT   — Write the code following the plan
4. VERIFY      — Run tests, type checks, lint
5. DOCUMENT    — Update docs, CLAUDE.md, commit message
```

### Why Research First?

Without research, agents:
- Reinvent existing utilities instead of using project helpers
- Use deprecated APIs because they trained on old data
- Miss project conventions and create inconsistent code
- Make architectural decisions that conflict with existing patterns

### Forcing Research

```markdown
## CLAUDE.md Rule
Before implementing any feature:
1. Search the codebase for similar patterns: `grep -r "similar_concept" src/`
2. Read the relevant module's README or header comments
3. Check if there's an existing utility in `src/utils/` or `src/helpers/`
4. Only then start writing new code
```

## Token Optimization

Reduce cost and improve quality by optimizing token usage:

### System Prompt Slimming

- Remove redundant instructions from CLAUDE.md
- Use shorthand: "TS strict mode" instead of "Always use TypeScript with strict mode enabled"
- Reference files instead of inlining: "See `docs/api-conventions.md`" vs copying the whole doc

### Model Routing

Use cheaper models for simple tasks:

```yaml
# Route by task complexity
simple_tasks:    # Typo fixes, rename, format
  model: claude-sonnet
complex_tasks:   # Architecture, debugging, refactoring
  model: claude-opus
```

### Background Processing

Offload expensive operations to background:

```bash
# Run tests in background while agent continues
/background npm test
# Agent continues working, checks results later
```

## Harness Commands

ECC provides built-in commands for agent management:

| Command | Purpose |
|---------|---------|
| `/harness-audit` | Score your setup quality (0-100) |
| `/loop-start` | Begin iterative development loop |
| `/quality-gate` | Check if code meets standards |
| `/model-route` | Show model routing configuration |
| `/security-scan` | Run AgentShield security audit |
| `/sessions` | View session history and memory |

## Quick Setup

### Install ECC

```bash
# Clone the repo
git clone https://github.com/affaan-m/everything-claude-code.git
cd everything-claude-code

# Run the interactive installer
node install-plan.js    # Plan what to install
node install-apply.js   # Apply the plan

# Or use the npm package
npm install -g ecc-universal
ecc setup
```

### Verify Setup

```bash
# Check harness score
/harness-audit

# Expected output:
# Harness Score: 85/100
# ✓ CLAUDE.md present and well-structured
# ✓ Skills directory configured (12 skills)
# ✓ Security rules active
# ⚠ No session hooks configured
# ⚠ No model routing set
```

## References

- [GitHub: affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [Shorthand Guide](https://x.com/affaanmustafa/status/2012378465664745795) — Setup and foundations
- [Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) — Token optimization, memory, evals
- [Security Guide](https://x.com/affaanmustafa/status/2033263813387223421) — Attack vectors, sandboxing, AgentShield
- [GitHub Marketplace: ECC Tools](https://github.com/marketplace/ecc-tools)
- [npm: ecc-universal](https://www.npmjs.com/package/ecc-universal)
