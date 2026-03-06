---
name: coderabbit
description: >-
  Automate code reviews with CodeRabbit, the AI-powered review tool. Use when a user asks to set up automated PR reviews, configure review rules, integrate with GitHub or GitLab, customize review instructions, or manage CodeRabbit settings.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["code-review", "ai", "pull-request", "automation", "github"]
---
# CodeRabbit — AI-Powered Code Review

## Overview

You are an expert in CodeRabbit, the AI code review tool that automatically reviews pull requests on GitHub and GitLab. You help teams configure CodeRabbit to catch bugs, security issues, performance problems, and style violations before human review — reducing review bottleneck and improving code quality with path-specific review instructions.

## Instructions

### Configuration

```yaml
# .coderabbit.yaml — Project-level configuration
language: en-US

tone_instructions: >
  Be direct. Show the exact code fix, not just the problem.
  Prioritize: security > bugs > performance > style.
  Don't nitpick formatting — the linter handles that.

early_access: true                         # Enable experimental features

reviews:
  request_changes_workflow: true           # PR status: changes requested
  high_level_summary: true                 # Summary comment at top
  review_status: true                      # Show review progress
  auto_review:
    enabled: true
    drafts: false                          # Skip draft PRs
    base_branches:
      - main
      - develop

  # Path-specific instructions — different rules for different code
  path_instructions:
    - path: "src/server/**/*.ts"
      instructions: |
        Backend review checklist:
        - Input validation with Zod on all endpoints
        - SQL injection prevention (parameterized queries only)
        - Authentication check on protected routes
        - Rate limiting on public endpoints
        - Error responses don't leak internal details
        - Database transactions for multi-step operations

    - path: "src/app/**/*.tsx"
      instructions: |
        Frontend review checklist:
        - Server components preferred (no unnecessary "use client")
        - Loading states and error boundaries
        - Accessibility: labels, alt text, ARIA attributes
        - No inline styles (use Tailwind classes)
        - Memoization only when profiler shows need (no premature useMemo)

    - path: "**/*.test.ts"
      instructions: |
        Test review checklist:
        - Tests describe user behavior, not implementation
        - No snapshot tests for component logic
        - Edge cases covered: empty state, error state, boundary values
        - Mocks are minimal and well-documented

    - path: "drizzle/migrations/**"
      instructions: |
        Migration safety:
        - Reversible migrations (down migration included)
        - No DROP COLUMN without data backup plan
        - Indexes on foreign keys
        - Default values for new NOT NULL columns

  path_filters:
    - "!**/*.lock"                         # Skip lock files
    - "!**/generated/**"                   # Skip generated code
    - "!**/*.min.js"                       # Skip minified files

chat:
  auto_reply: true                         # Reply to developer questions
```

### Interaction in PRs

```markdown
## Talking to CodeRabbit in PR comments

# Ask for explanations
@coderabbit explain this function

# Ask for alternative implementations
@coderabbit suggest a more efficient approach

# Dismiss a review comment (with reason)
@coderabbit resolve — this is intentional for backwards compatibility

# Re-review after changes
@coderabbit review

# Generate summary
@coderabbit summary

# Ask about the full PR
@coderabbit what are the main risks in this PR?
```

### What CodeRabbit Reviews

```markdown
## Review categories (auto-detected)

1. **Security** — SQL injection, XSS, hardcoded secrets, auth bypass
2. **Bugs** — Null pointer, race conditions, off-by-one, type errors
3. **Performance** — N+1 queries, unnecessary re-renders, memory leaks
4. **Error handling** — Uncaught exceptions, missing try/catch, silent failures
5. **Best practices** — Anti-patterns, deprecated APIs, code smells
6. **Accessibility** — Missing labels, keyboard navigation, screen reader support
7. **Testing** — Missing tests for new code, test quality issues
8. **Documentation** — Missing JSDoc, outdated comments, API docs
```

## Installation

```markdown
## Setup (2 minutes)

1. Go to https://coderabbit.ai
2. Install the GitHub App on your organization
3. Add .coderabbit.yaml to your repo
4. CodeRabbit reviews every new PR automatically

## Pricing
- Open source: Free
- Pro: $12/seat/month
- Enterprise: Custom
```

## Examples

**Example 1: User asks to set up coderabbit**

User: "Help me set up coderabbit for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure coderabbit
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with coderabbit**

User: "Create a dashboard using coderabbit"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Path-specific instructions** — Different code needs different review rules; backend security checks don't apply to CSS files
2. **Exclude generated code** — Use `path_filters` to skip lock files, generated types, and minified code; reduces noise
3. **Request changes workflow** — Enable `request_changes_workflow` so CodeRabbit blocks merge until issues are addressed
4. **Custom tone** — Set `tone_instructions` to match your team culture; "direct and specific" saves developer time
5. **Complement, don't replace** — CodeRabbit handles mechanical review (security, patterns, style); humans review architecture and business logic
6. **Interactive review** — Developers can ask CodeRabbit questions in PR comments; use `@coderabbit explain` for complex code
7. **Base branch filtering** — Only review PRs targeting main/develop; skip feature-to-feature branch PRs
8. **Iterate on instructions** — Start with minimal path_instructions; add rules when you see repeated issues CodeRabbit misses
