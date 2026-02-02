---
title: "Write Better Commits with AI"
slug: write-better-commits
description: "Generate precise, conventional commit messages by analyzing staged git changes."
skill: git-commit-pro
category: development
tags: [git, commits, workflow, conventional-commits]
---

# Write Better Commits with AI

## The Problem

Most git histories look like "fix bug", "update stuff", "wip", "final final v2". When something breaks in production and you run `git log` to find the change that caused it, vague commit messages make bisecting nearly impossible. Teams waste hours tracing issues that a clear commit message would have explained in seconds.

## The Solution

Use the **git-commit-pro** skill to have your AI agent analyze your staged changes and generate a precise, conventional commit message that explains what changed and why.

Install the skill:

```bash
npx terminal-skills install git-commit-pro
```

## Step-by-Step Walkthrough

### 1. Stage your changes normally

```bash
git add src/auth/middleware.ts src/auth/types.ts
```

### 2. Ask the agent to commit

```
Commit these changes with a good message.
```

### 3. The agent analyzes the diff

It reads `git diff --cached` to understand exactly what changed: new files, modified logic, deleted code, renamed symbols. It looks at the actual code changes, not just file names.

### 4. A structured message is generated

```
feat(auth): add role-based access control middleware

Implement RBAC middleware that checks user permissions against route
requirements. Includes:
- Permission checking middleware for Express routes
- Role hierarchy (admin > editor > viewer)
- New RoleConfig type for route permission definitions

Closes #89
```

### 5. The commit is executed

The agent runs `git commit` with the generated message and verifies it succeeded.

## Real-World Example

A developer finishes a refactoring session that touched 8 files across 3 directories. Without the skill, they might write "refactor auth module." With the git-commit-pro skill:

1. They stage all changes and ask the agent to commit
2. The agent reads the diff and identifies: extracted shared validation logic into a utility, renamed two functions for clarity, removed a dead code path, and updated tests
3. The commit message captures all of this:

```
refactor(auth): extract shared validation into auth-utils module

Move duplicated input validation from login and register handlers
into a shared auth-utils module. Also:
- Rename verifyUser -> verifyCredentials for clarity
- Remove unused legacyTokenCheck function
- Update tests to use the new module path
```

4. Six months later, when someone reads the git log, they understand exactly what happened and why

## Related Skills

- [code-reviewer](../skills/code-reviewer/) -- Review changes before committing
- [markdown-writer](../skills/markdown-writer/) -- Document the changes in a changelog
