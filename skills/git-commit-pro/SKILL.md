---
name: git-commit-pro
description: >-
  Write well-structured git commit messages following the Conventional Commits
  standard. Use when a user asks to commit changes, write a commit message,
  stage and commit, improve a commit message, or follow commit conventions.
  Analyzes diffs to produce accurate, meaningful commit messages.
license: Apache-2.0
compatibility: "Requires git installed"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["git", "commits", "conventional-commits", "version-control"]
  repository: https://github.com/git/git
---

# Git Commit Pro

## Overview

Generate well-structured git commit messages by analyzing staged changes. Follows Conventional Commits format and produces messages that explain what changed and why.

## Instructions

When a user asks you to commit, write a commit message, or improve an existing commit message, follow these steps:

### Step 1: Inspect the changes

```bash
# See what is staged
git diff --cached --stat

# See full staged diff
git diff --cached

# See unstaged changes (in case user wants to stage first)
git status
```

If nothing is staged, help the user stage the right files first. Never use `git add .` unless the user explicitly asks -- prefer adding specific files.

### Step 2: Analyze the diff

Categorize what changed:
- **New files**: What functionality do they add?
- **Modified files**: What behavior changed? Why?
- **Deleted files**: What was removed and why?
- **Renamed/moved files**: What restructuring happened?

Look at the actual code changes, not just file names. Understand the intent behind the changes.

### Step 3: Write the commit message

Use Conventional Commits format:

```
type(scope): short description

Longer explanation of what changed and why. Wrap at 72 characters.
Reference any issues or tickets.

BREAKING CHANGE: description of the incompatible change and what callers must do
```

Breaking changes are marked either with a `!` before the colon (`feat(api)!: drop v1 login endpoint`) or with a `BREAKING CHANGE:` footer (uppercase, colon, space, then the description). Use one of them, or both.

The spec requires only `feat` and `fix` as types; the list below is the common convention, and other types are allowed.

**Types:**
- `feat`: New feature or capability
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, semicolons, whitespace (no logic change)
- `refactor`: Code restructuring without behavior change
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `ci`: CI/CD configuration changes
- `chore`: Maintenance tasks, tooling updates

**Rules for the subject line:**
- Use imperative mood ("add" not "added" or "adds")
- Do not capitalize the first word after the colon
- No period at the end
- Keep under 72 characters
- Scope is optional but helpful (e.g., `feat(auth):`, `fix(api):`)

**Rules for the body:**
- Separate from subject with a blank line
- Explain WHAT and WHY, not HOW (the diff shows how)
- Wrap at 72 characters
- Use bullet points for multiple changes
- Reference issue numbers: `Fixes #123`, `Closes #456`

### Step 4: Execute the commit

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject line here

Body paragraph explaining the change.

EOF
)"
```

### Step 5: Verify

```bash
git log --oneline -1
git status
```

Confirm the commit was created and the working tree is in the expected state.

## Examples

### Example 1: Feature addition

**Staged changes:** New `auth/` directory with login, register, and middleware files.

**Commit message:**
```
feat(auth): add user authentication with JWT

Implement login and registration endpoints with JWT-based session
management. Includes:
- POST /auth/login with email/password
- POST /auth/register with validation
- Auth middleware for protected routes
- Token refresh endpoint

Closes #42
```

### Example 2: Bug fix

**Staged changes:** Modified `src/utils/date.ts` -- changed timezone handling in `formatDate()`.

**Commit message:**
```
fix(utils): correct timezone offset in date formatting

formatDate() was applying the UTC offset in the wrong direction,
causing dates to display one day behind for users in negative UTC
timezones (Americas). The offset is now subtracted instead of added.

Fixes #187
```

### Example 3: Multiple small changes

**Staged changes:** Updated README, added a `.env.example`, fixed a typo in a config file.

**Commit message:**
```
chore: update project setup documentation

- Add .env.example with required environment variables
- Update README with new setup instructions
- Fix typo in webpack.config.js comment
```

## Guidelines

- One commit per logical change. If the diff contains unrelated changes, suggest splitting into multiple commits.
- Never write generic messages like "update files" or "fix stuff." Every commit should be understandable without looking at the diff.
- If the user has an existing commit convention in their repo (check recent `git log`), match that style instead of Conventional Commits.
- For large diffs, focus the subject on the primary change and use the body for secondary changes.
- If the diff includes generated files (lockfiles, build artifacts), mention them briefly but focus on the source changes.
- When amending, always confirm with the user first. Amending rewrites history and can cause issues for shared branches.
- If the changes are too large or unfocused for a single good commit message, tell the user and suggest how to split them.
- Do not add `Co-Authored-By` or other trailer lines unless the user asks for them.
