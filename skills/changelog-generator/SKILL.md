---
name: changelog-generator
description: >-
  Generate release notes and changelogs from git commits, feature lists, or
  project updates. Use when a user asks to generate a changelog, create
  release notes, summarize recent changes, draft a CHANGELOG entry, or
  prepare release documentation from git history.
license: Apache-2.0
compatibility: "Works with any git repository"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "changelog, release-notes, git, documentation, versioning"
  use-cases: "Generate a CHANGELOG.md entry for a new release from git commits, Create user-facing release notes from technical commit history, Summarize changes between two tags or branches"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Changelog Generator

## Overview

Generate structured changelogs and release notes from git commit history, merge commits, or manually provided feature lists. Produces well-organized, categorized output following the Keep a Changelog convention. Handles both technical changelogs for developers and user-facing release notes.

## Instructions

When a user asks you to generate a changelog or release notes, follow this process:

### Step 1: Determine the scope

Identify what range of changes to include:

```bash
# List recent tags to find version boundaries
git tag --sort=-creatordate | head -10

# Get commits since the last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)
echo "Last tag: $LAST_TAG"

# If no tags exist, ask the user for a date range or commit range
# (an empty LAST_TAG turns the range below into "..HEAD", which lists nothing)
```

Get the raw commit data:

```bash
# Commits since last tag (all commits when there is no tag yet)
git log ${LAST_TAG:+"$LAST_TAG"..}HEAD --oneline --no-merges

# Commits between two tags
git log v1.1.0..v1.2.0 --oneline --no-merges

# Commits in the last 2 weeks
git log --since="2 weeks ago" --oneline --no-merges

# With more detail (author, date, body)
git log "$LAST_TAG"..HEAD --format="%h %s (%an, %ad)" --date=short --no-merges

# Full messages, to catch "BREAKING CHANGE:" footers and "Closes #123" references
git log "$LAST_TAG"..HEAD --format="--- %h%n%B" --no-merges

# Repos that squash-merge PRs: one entry per PR is already the first-parent history
git log "$LAST_TAG"..HEAD --first-parent --oneline
```

### Step 2: Categorize the commits

Sort each commit into one of these categories based on the commit message and changed files:

- **Added** - New features or capabilities
- **Changed** - Changes to existing functionality
- **Deprecated** - Features that will be removed in a future version
- **Removed** - Features that have been removed
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

Use commit message prefixes as hints:
- `feat:`, `feature:` -> Added
- `fix:`, `bugfix:` -> Fixed
- `refactor:`, `perf:` -> Changed
- `docs:` -> Changed (if user-facing) or skip
- `chore:`, `ci:`, `build:` -> Skip unless significant
- `security:`, `vuln:` -> Security
- `deprecate:` -> Deprecated
- `remove:` -> Removed
- a `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer (Conventional Commits) -> list it under Changed or Removed, flag it as breaking, and bump the major version

If commits lack conventional prefixes, read the diff to classify:

```bash
# See what files changed in a commit
git show --stat 4f9c2ab

# See the actual diff for ambiguous commits
git show 4f9c2ab
```

### Step 3: Write the changelog entry

Format following Keep a Changelog:

```markdown
## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD

### Added
- Feature description in user-understandable language (#PR)

### Changed
- What changed and why it matters (#PR)

### Fixed
- Bug description and what was corrected (#PR)
```

Rules for writing entries:
- Write from the user's perspective, not the developer's
- Start each item with a verb (Add, Fix, Update, Remove)
- Include PR or issue numbers when available
- Group related changes into a single entry
- Skip internal refactors unless they affect behavior
- Mention breaking changes prominently

### Step 4: Output the result

- If a `CHANGELOG.md` exists, prepend the new entry below the header
- If creating release notes (e.g., for GitHub), use a more narrative style
- Always show the user the generated content before writing to a file

## Examples

### Example 1: Generate changelog from git history

**User request:** "Generate a changelog for the v2.3.0 release"

**Actions:**

```bash
git log v2.2.0..v2.3.0 --oneline --no-merges
```

**Output:**

```markdown
## [2.3.0] - 2025-04-15

### Added
- Add dark mode support across all pages (#234)
- Add CSV export for dashboard reports (#241)
- Add keyboard shortcuts for navigation (#238)

### Changed
- Improve search performance by 3x with debounced queries (#236)
- Update authentication flow to support SSO providers (#240)

### Fixed
- Fix pagination losing filters on page change (#235)
- Fix timezone display in event scheduler (#237)
- Fix memory leak in WebSocket connection handler (#242)
```

### Example 2: Create user-facing release notes

**User request:** "Write release notes for our users about this update"

**Output:**

```markdown
# What's New in v2.3.0

We're excited to ship dark mode, faster search, and SSO support!

## Highlights

**Dark Mode** - The app now supports dark mode across all pages.
Toggle it from Settings > Appearance or let it follow your system
preference.

**3x Faster Search** - Search results now appear instantly as you
type, thanks to a complete rewrite of the search engine.

**SSO Login** - You can now sign in with your company's identity
provider (Okta, Azure AD, Google Workspace).

## Bug Fixes
- Filters now persist correctly when navigating between pages
- Event times display in your local timezone
- Resolved a connectivity issue with real-time updates

## Full Changelog
See the [complete changelog](./CHANGELOG.md) for all details.
```

### Example 3: Changelog from a branch diff

**User request:** "What changed on the feature branch compared to main?"

**Actions:**

```bash
git log main..feature/payments --oneline --no-merges
git diff main..feature/payments --stat
```

**Output:** A summary of all changes on the branch, categorized and formatted, suitable for including in a PR description or release planning document.

## Guidelines

- Always read the existing CHANGELOG.md format before generating a new entry to match the style.
- Use semantic versioning: breaking changes = major, new features = minor, fixes = patch.
- For conventional commits repos, leverage the prefixes for automatic categorization.
- Skip trivial commits (typo fixes, whitespace changes) unless the user wants everything.
- When in doubt about whether a change is user-facing, include it with a note.
- For monorepos, group changes by package or service.
- Always include the date in ISO 8601 format (YYYY-MM-DD).
- Keep an `## [Unreleased]` section at the top while work is in progress; on release, move its items under the new version heading. Keep a Changelog 1.1.0 also uses link references at the bottom (`[2.3.0]: https://github.com/ironwood-labs/dashboard/compare/v2.2.0...v2.3.0`) so each version heading links to its diff.
- Changelogs are written for humans: do not paste raw `git log` output, and do not include commits that only touch CI or formatting.
- If the user provides a list of features instead of git history, format them into the same structure.
