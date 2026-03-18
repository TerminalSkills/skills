---
name: vibe-coding
description: >-
  Patterns and workflows for AI-assisted development (vibe coding) — building
  software primarily through natural language with AI coding agents. Use when:
  setting up an AI-first development workflow, structuring projects for AI
  coding, using prompt-driven development best practices, or maximizing output
  from Claude Code, Cursor, Windsurf, or Aider.
license: Apache-2.0
compatibility: "Works with Claude Code, Cursor, Windsurf, Aider, GitHub Copilot"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["vibe-coding", "ai-coding", "workflow", "productivity", "claude-code"]
  use-cases:
    - "Set up a new project structure optimized for AI coding agents"
    - "Build a full-stack app using Claude Code from spec to deploy"
    - "Establish a team workflow for AI-assisted development"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Vibe Coding

## Overview

Vibe coding is building software primarily through natural language prompts to AI coding agents. Done well, it dramatically accelerates development — the AI writes boilerplate, implements features, fixes bugs, and handles routine tasks while you focus on decisions, architecture, and quality. Done poorly, it produces a mess of half-working code that's hard to reason about.

The difference between productive vibe coding and chaos comes down to **structure**, **context**, and **iteration**.

## Instructions

### The core loop

```
Spec → Generate → Review → Test → Iterate
```

1. **Spec**: Write a clear description of what you want
2. **Generate**: Let the AI produce the code
3. **Review**: Read and understand what was generated
4. **Test**: Run it and verify it works
5. **Iterate**: Refine with follow-up prompts

Never skip Review. You own the code. The AI is the keyboard, you're the brain.

### Step 1: Structure your project for AI

AI agents work best when they can understand your project at a glance. Key files:

**`CLAUDE.md` / `AGENTS.md`** — Project context for the AI agent:
```markdown
# Project: MyApp

## What this is
A SaaS app for freelancers to track invoices and clients.

## Stack
- Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- Prisma + PostgreSQL (Supabase)
- Auth.js with GitHub OAuth
- Stripe for billing

## Architecture
- `app/` — Next.js App Router pages
- `components/` — Reusable UI components
- `lib/` — Business logic and DB queries
- `lib/db/` — All Prisma queries (never query DB from components)

## Key conventions
- Named exports everywhere
- Zod validation on all API inputs
- React Query for client-side data fetching
- Error handling: throw in lib/, catch and return proper HTTP responses in API routes

## Commands
- `npm run dev` — Start development server
- `npm run test` — Run Vitest tests
- `npm run db:migrate` — Run Prisma migrations
- `npm run typecheck` — TypeScript check without building
```

**Why this matters:** Without `CLAUDE.md`, the AI guesses your stack and conventions. With it, every prompt inherits your context — no need to repeat "we use TypeScript with strict mode" every time.

### Step 2: Write effective prompts

**The anatomy of a good prompt:**
```
[Context] + [What you want] + [Constraints] + [Examples if needed]
```

**Weak prompt:**
```
Add a user settings page
```

**Strong prompt:**
```
Create a user settings page at app/settings/page.tsx.
It should let users update: display name, email, avatar URL.
Use the existing UserForm pattern from app/profile/page.tsx.
Fetch current user with getServerSession, update via PATCH /api/user.
Add a Zod schema for the update payload.
Show a toast on success using the sonner setup in lib/toast.ts.
```

The difference: the strong prompt gives the AI enough to produce code that fits your project without guessing.

### Step 3: Context management

AI coding tools have context windows. Use them wisely:

**Keep files small and focused** — A 50-line file that does one thing beats a 500-line file. The AI can read the whole thing, understand it, and modify it correctly.

**Name things descriptively** — `getUserInvoicesWithLineItems.ts` tells the AI more than `queries.ts`.

**Use barrel files** — `lib/db/index.ts` that re-exports everything lets the AI import without hunting:
```typescript
// lib/db/index.ts
export * from "./users";
export * from "./invoices";
export * from "./clients";
```

**Reference specific files in prompts:**
```
Looking at lib/db/users.ts, add a similar pattern for clients.
Use the same error handling and Zod validation approach.
```

### Step 4: The spec-first workflow

For features bigger than a few lines, write a spec before coding:

```markdown
## Feature: Invoice PDF Export

### What
User clicks "Export PDF" on an invoice → receives a download of a formatted PDF

### How
1. Frontend: Add "Export PDF" button to InvoiceDetail component
2. API: POST /api/invoices/:id/export → returns a PDF blob
3. Generation: Use @react-pdf/renderer to build the PDF template
4. The PDF should include: company logo, invoice items, totals, payment instructions

### Edge cases
- Draft invoices can be exported (show DRAFT watermark)
- Long item descriptions should wrap, not overflow
- If company logo URL is broken, show placeholder

### Template
Mirror the layout of the existing invoice preview at components/InvoicePreview.tsx
```

Hand this spec to the AI: "Implement this feature. Start with the API route, then the PDF template, then the frontend button."

### Step 5: Iterative refinement

Generate in chunks, not all at once:

```
Iteration 1: "Create the database schema and Prisma model for invoices"
Iteration 2: "Add the CRUD API routes for invoices using the schema we just created"
Iteration 3: "Build the invoice list page that fetches from the API"
Iteration 4: "Add the invoice detail page with edit functionality"
Iteration 5: "Write tests for the API routes"
```

Each iteration is reviewable, testable, and committable. This beats "build me a full invoice system" which produces 2000 lines you need to review all at once.

### Step 6: Review patterns

When the AI produces code, check:

1. **Does it compile?** Run `tsc --noEmit` immediately
2. **Does it follow your patterns?** Compare to existing similar code
3. **Are there obvious security issues?** Input validation, auth checks
4. **Does it handle errors?** What happens when the database is down?
5. **Does it do what you asked?** AI sometimes solves a slightly different problem

If something looks wrong, tell the AI specifically:
```
The getUserById function doesn't handle the case where the user doesn't exist.
It should return null, not throw. Fix that.
```

### Step 7: When to code manually

Vibe coding isn't always the right tool:

**Use AI for:**
- Boilerplate (CRUD routes, forms, migration files)
- Implementing well-understood patterns
- Refactoring and renaming
- Writing tests for existing logic
- Debugging with error messages

**Write manually when:**
- The algorithm requires careful thought (complex business logic, performance-critical code)
- Security is critical (auth flows, cryptography)
- You're prototyping and exploring the problem space
- The AI keeps getting it wrong (you understand it better than it does)

### Step 8: Git hygiene with AI coding

Commit small, commit often. When the AI generates a bunch of code:

```bash
# Review changes before committing
git diff

# Commit in logical chunks
git add lib/db/invoices.ts
git commit -m "feat: add invoice DB queries"

git add app/api/invoices/route.ts
git commit -m "feat: add invoice CRUD API"
```

This keeps your history readable and makes it easy to revert if the AI went off track.

## Examples

### Example 1: Starting a new project with Claude Code

```bash
# 1. Create project
npx create-next-app@latest myapp --typescript --tailwind --app

# 2. Write CLAUDE.md
cat > CLAUDE.md << 'EOF'
# MyApp
Next.js 15 + TypeScript + Prisma + Supabase + Auth.js + Stripe
[... stack and conventions ...]
EOF

# 3. Start Claude Code
claude

# 4. Prompt:
"Read CLAUDE.md. Set up the project:
1. Install Prisma and configure with Supabase connection string from .env
2. Create the initial User and Account models for Auth.js
3. Add the Auth.js configuration with GitHub OAuth
4. Create a basic layout with header and sidebar using shadcn/ui"
```

### Example 2: Debugging with context

```
I'm getting this error:
PrismaClientKnownRequestError: Foreign key constraint failed on field: invoice_id

It happens when I call deleteClient() in lib/db/clients.ts.
The client has existing invoices. I need to either:
a) Block deletion if invoices exist (return an error)
b) Cascade delete the invoices too

Looking at the business rules in CLAUDE.md, what approach makes sense,
and how should I implement it?
```

### Example 3: Refactoring session

```
The components/forms/ directory has grown to 15 files and they're all doing
their own validation and submission logic differently.

Please:
1. Identify the common patterns across these form components
2. Extract a useFormSubmit hook that handles: loading state, error handling, success toast
3. Refactor UserForm.tsx and InvoiceForm.tsx to use it as a demonstration
4. I'll refactor the remaining forms myself following that pattern
```

## Guidelines

- **Read what the AI writes** — you're responsible for the code, not the AI
- **Commit before major changes** — easy to revert if the AI goes sideways
- **One thing at a time** — smaller tasks produce better results than "build the whole feature"
- **Invest in CLAUDE.md/AGENTS.md** — 30 minutes writing context saves hours of prompt repetition
- **Small files beat large files** — better AI comprehension, easier diffs, more modular
- **Test after every generation** — catch problems early before they compound
- **Tell the AI your constraints** — token budgets, existing patterns, what NOT to change
- **When stuck, be more specific** — vague prompts produce vague code
