---
title: "Automate Semantic Versioning and Changelogs Across Your Repos"
slug: automate-semantic-versioning-and-changelogs
description: "Set up conventional commits, automated version bumping, and changelog generation so releases are consistent and effortless."
skills: [git-commit-pro, changelog-generator, cicd-pipeline]
category: productivity
tags: [versioning, changelog, semver, release-management, conventional-commits]
---

# Automate Semantic Versioning and Changelogs Across Your Repos

## The Problem

A team maintains 8 packages in a monorepo. Version numbers are bumped manually — sometimes the developer forgets, sometimes they bump a patch when it should be a minor. Changelogs are written by hand the night before a release, usually missing half the changes. Three times last quarter, a breaking change shipped as a patch version, breaking downstream consumers. Nobody trusts the version numbers, and customers have stopped reading changelogs because they are incomplete.

## The Solution

Use `git-commit-pro` to enforce conventional commits across all repos, `changelog-generator` to produce accurate changelogs from commit history, and `cicd-pipeline` to automate version bumping and publishing on merge to main.

```bash
npx terminal-skills install git-commit-pro changelog-generator cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Audit existing commit history and establish conventions

```text
Analyze the last 200 commits in our monorepo. Categorize them by what they
actually did: bug fixes, new features, breaking changes, refactors, docs,
chores. Show me what the version history should have looked like if we had
used semver correctly. How many incorrect version bumps did we ship?
```

The agent scans 200 commits and classifies them: 67 bug fixes, 41 features, 12 breaking changes, 48 refactors, 19 docs updates, 13 chores. It finds 8 version bumps that were wrong — 3 breaking changes shipped as patches, 2 features shipped as patches, and 3 patches that should have been no-version-change chores. It generates a "what versions should have been" table.

### 2. Set up conventional commit enforcement

```text
Configure commitlint and husky for our monorepo so every commit must follow
the conventional commits spec. Our scopes should match our package names:
api, web, shared, cli, docs, auth, billing, notifications. Add a commit
message template that developers see when they run git commit. Include
the BREAKING CHANGE footer format.
```

The agent generates `.commitlintrc.js` with the 8 scopes, husky pre-commit and commit-msg hooks, a `.gitmessage` template, and a `.vscode/settings.json` that shows the template in VS Code's source control panel. Commits like `fixed stuff` or `updates` are now rejected with a helpful error message showing the correct format.

### 3. Generate changelogs from commit history

```text
Generate a CHANGELOG.md for each package based on the last 6 months of
commits. Group entries by version, with sections for Features, Bug Fixes,
Breaking Changes, and Performance Improvements. Link each entry to its
commit hash and PR number. For breaking changes, include a migration guide
section explaining what consumers need to update.
```

The agent produces 8 CHANGELOG.md files, one per package. Each has properly grouped entries with commit links, PR references, and migration guides for breaking changes. The billing package changelog shows 3 breaking changes with clear "Before/After" code examples for each.

### 4. Automate version bumping and release

```text
Create a GitHub Actions release workflow that triggers on merge to main.
It should:
1. Determine which packages changed (using file paths)
2. Calculate the correct semver bump from conventional commits since last tag
3. Update package.json versions
4. Generate/update CHANGELOG.md
5. Create git tags for each bumped package
6. Publish changed packages to npm
7. Create a GitHub Release with the changelog as the body
8. Post a summary to our #releases Slack channel

Handle the case where one PR changes multiple packages — each should get
its own independent version bump.
```

The agent generates a multi-job workflow: detect-changes identifies affected packages, bump-versions runs `standard-version` per package with the correct increment, publish pushes to npm with provenance, and notify posts a formatted Slack message listing all released packages with their new versions and changelog excerpts.

### 5. Handle the monorepo dependency chain

```text
When the shared package gets a breaking change, all packages that depend on
it need a version bump too. Set up automatic dependency updates: if shared
bumps to 3.0.0, all packages that depend on it should update their
dependency range and get at least a patch bump. The release workflow should
detect this cascade and handle it in the right order.
```

The agent adds a dependency graph resolver to the release workflow. It topologically sorts packages by their internal dependencies, bumps them in order, and cascades version updates. When `shared` gets a breaking change, `api`, `web`, `cli`, and `auth` automatically get patch bumps with updated dependency ranges, and all 5 packages are released in the correct order.

## Real-World Example

An engineering manager at a 35-person company runs a monorepo with 8 npm packages. Customers complain that version numbers are unreliable, changelogs are incomplete, and breaking changes appear in patch releases.

1. Commit audit reveals 8 incorrect version bumps in 6 months — 3 breaking changes shipped as patches
2. Conventional commits are enforced — within a week, 100% of commits follow the format
3. Auto-generated changelogs are accurate and complete for the first time. Customer support stops fielding "what changed?" tickets
4. The release workflow ships 47 correct version bumps over the next quarter with zero manual intervention
5. Downstream teams start trusting semver again and adopt automated dependency updates, reducing their integration lag from 3 weeks to 2 days
