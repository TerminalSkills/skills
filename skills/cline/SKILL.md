---
name: cline
description: >-
   You are an expert in Cline, the autonomous AI coding agent for VS Code that
  can read files, write code, run terminal commands, and use the browser —
  with human-in-the-loop approval at each step. You help developers use Cline
  for complex multi-file refactoring, feature implementation, debugging, and
  codebase exploration where the AI plans and executes while the developer
  reviews and approves.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - ai-coding
    - autonomous-agent
    - vs-code
    - refactoring
    - multi-file
    - human-in-the-loop
---

# Cline — Autonomous AI Coding Agent for VS Code

You are an expert in Cline, the autonomous AI coding agent for VS Code that can read files, write code, run terminal commands, and use the browser — with human-in-the-loop approval at each step. You help developers use Cline for complex multi-file refactoring, feature implementation, debugging, and codebase exploration where the AI plans and executes while the developer reviews and approves.

## Core Capabilities

### Agentic Workflow

```markdown
## How Cline Works

1. You describe a task in natural language
2. Cline creates a plan (visible to you)
3. For each step, Cline:
   - Reads relevant files (auto-approved)
   - Proposes file changes (you approve/reject each)
   - Runs terminal commands (you approve first)
   - Opens browser for testing (you approve)
4. You can steer the agent mid-task

## Example: Add Authentication to an Existing App

Prompt: "Add Clerk authentication to this Next.js app. Protect all /dashboard
routes. Add a sign-in page. Show the user's name in the header."

Cline's steps (each requires your approval):
1. Reads package.json, layout.tsx, middleware.ts
2. Runs: npm install @clerk/nextjs
3. Creates: src/middleware.ts with Clerk middleware
4. Modifies: src/app/layout.tsx to add ClerkProvider
5. Creates: src/app/sign-in/[[...sign-in]]/page.tsx
6. Modifies: src/components/Header.tsx to show UserButton
7. Runs: npm run build (to verify no errors)
8. Opens browser to test sign-in flow
```

### Configuration

```json
// VS Code settings for Cline
{
  "cline.apiProvider": "anthropic",
  "cline.apiModelId": "claude-sonnet-4-20250514",
  "cline.customInstructions": "Follow the project conventions in .cursor/rules/. Use TypeScript strict mode. Prefer server components. Always run tests after changes.",
  "cline.autoApproveReadOnly": true,     // Don't ask to read files
  "cline.maxFileLineCount": 500          // Warn before reading huge files
}
```

### Common Use Cases

```markdown
## Multi-File Refactoring
"Migrate all API routes from Express to Hono. Keep the same route structure
and middleware. Update tests to use the Hono test client."
→ Cline reads all route files, creates a migration plan, edits each file,
  updates imports, runs tests after each change.

## Feature Implementation
"Add a Stripe webhook handler that processes subscription.created,
subscription.updated, and subscription.deleted events. Update the user's
plan in the database. Add proper signature verification."
→ Cline scaffolds the handler, adds event processing, creates DB migration,
  writes tests, and verifies the build.

## Debugging
"Users report that the search API returns stale results. Find the caching
layer, identify why it's not invalidating properly, and fix it."
→ Cline reads the search route, finds the Redis cache, identifies the TTL
  issue, proposes a fix with cache invalidation on write.

## Documentation
"Generate API documentation for all endpoints in src/server/routers/.
Create a markdown file for each router with endpoint descriptions,
input/output schemas, and example requests."
→ Cline reads each router, extracts Zod schemas, and generates docs.
```

### MCP Server Integration

```markdown
## Cline supports MCP (Model Context Protocol) servers

Add custom tools via MCP:
- Database query tool → Cline can check DB schema/data
- Deployment tool → Cline can deploy to staging
- Testing tool → Cline can run specific test suites
- Monitoring tool → Cline can check error rates

Configure in Cline settings → MCP Servers → Add server URL
```

## Installation

```markdown
# VS Code Extension
Search "Cline" in VS Code Extensions marketplace
# Or: code --install-extension saoudrizwan.claude-dev

# Set API key in Cline settings
# Supports: Anthropic, OpenAI, Google, AWS Bedrock, OpenRouter, local models
```

## Best Practices

1. **Approve step by step** — Review each file change before approving; Cline shows diffs for every modification
2. **Custom instructions** — Add project conventions in settings; Cline follows them for every task
3. **Start small** — Break large tasks into smaller prompts; "Add auth" is better as 3 steps than 1 mega-prompt
4. **Let it read first** — Cline reads files to build context; auto-approve reads to speed up the workflow
5. **Terminal commands** — Cline can run builds, tests, and installs; review commands before approving
6. **Browser testing** — Cline can open a browser to verify visual changes; useful for frontend work
7. **MCP for context** — Connect MCP servers for database, deployment, and monitoring context
8. **Cost awareness** — Cline shows token usage per task; use Sonnet for most work, Opus for complex architecture decisions
