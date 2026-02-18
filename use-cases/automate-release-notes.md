---
title: "Automate Release Notes from Git History with AI"
slug: automate-release-notes
description: "Generate polished, user-facing release notes by analyzing git commits, PRs, and changelogs automatically."
skills: [changelog-generator, git-commit-pro]
category: productivity
tags: [release-notes, changelog, git, automation, developer-productivity]
---

# Automate Release Notes from Git History with AI

## The Problem

Release day arrives and nobody wrote the changelog. The PM asks "what shipped this week?" and the lead engineer spends 45 minutes scrolling through git log, trying to translate cryptic commit messages into something customers can understand. Half the changes get missed, the formatting is inconsistent, and by the time it's done, the actual release is delayed.

## The Solution

Use the **changelog-generator** skill to extract and categorize changes from git history, and **git-commit-pro** to ensure future commits are structured for easy parsing. The agent reads your commits, groups them by type (features, fixes, breaking changes), and outputs polished release notes ready for users.

## Step-by-Step Walkthrough

### 1. Ask the agent to analyze recent changes

```text
Generate release notes for version 2.4.0. Compare the changes between tags v2.3.0 and HEAD on main.
```

### 2. The agent reads git history and categorizes changes

It runs `git log v2.3.0..HEAD --oneline` and groups commits:

```text
## v2.4.0 (2026-02-17)

### ✨ New Features
- Add bulk import for CSV files up to 50MB (#312)
- Support dark mode across all dashboard views (#298)
- Add webhook notifications for failed payments (#305)

### 🐛 Bug Fixes
- Fix timezone offset in scheduled reports (#315)
- Resolve memory leak in WebSocket connection handler (#308)
- Fix pagination breaking on filtered search results (#301)

### ⚡ Performance
- Reduce dashboard load time by 40% with query caching (#310)

### 🔧 Internal
- Upgrade Node.js from 20 to 22 (#303)
- Migrate CI pipeline from CircleCI to GitHub Actions (#307)
```

### 3. Request a user-facing version

```text
Now rewrite these as user-facing release notes for our blog. Our audience is non-technical small business owners who use our invoicing platform.
```

```text
## What's New in BillFlow 2.4.0

**Import your data faster** — You can now upload CSV files up to 50MB
to bulk-import customers, invoices, or products. No more adding them one by one.

**Dark mode is here** — Every screen in your dashboard now supports dark
mode. Toggle it in Settings → Appearance.

**Get notified about failed payments** — Set up webhook alerts so your
team knows instantly when a customer payment fails.

**Bug fixes** — We fixed an issue where scheduled reports showed the
wrong timezone, and search results now paginate correctly when filters are applied.

**Faster dashboards** — Your main dashboard loads up to 40% faster thanks
to improved caching.
```

### 4. Generate a structured CHANGELOG entry

```text
Append this release to CHANGELOG.md in Keep a Changelog format.
```

The agent formats and prepends the new version entry to your existing CHANGELOG.md file, maintaining consistent formatting with previous releases.

### 5. Improve future commits

```text
Our commit messages are messy. Set up a commit convention so future changelogs are easier to generate.
```

The agent configures a commit message template using Conventional Commits format and explains the prefixes: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`.

## Real-World Example

Dani, the engineering lead at a 12-person SaaS startup, releases every two weeks. Before using AI, changelog day meant 2 hours of archaeology through 80+ commits written by 5 developers with wildly different commit styles.

1. Dani asks the agent: "Generate release notes from v3.11.0 to HEAD"
2. The agent parses 83 commits, identifies 12 features, 9 bug fixes, and 1 breaking change
3. It flags the breaking change prominently: "API endpoint `/v1/tasks` renamed to `/v2/tasks`"
4. Dani asks for a customer-facing version and a developer changelog
5. Both are ready in under 2 minutes — the blog post goes out with the release

The team also adopted Conventional Commits with the git-commit-pro skill, making each subsequent changelog even more accurate.
