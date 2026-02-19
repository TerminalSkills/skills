---
name: semantic-release
description: >-
  Automate versioning and package publishing with semantic-release. Use when a user asks to automate npm publishing, generate changelogs, handle semantic versioning in CI, or automate GitHub releases.
license: Apache-2.0
compatibility: 'Node.js, any CI'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - semantic-release
    - versioning
    - changelog
    - npm
    - ci-cd
---

# semantic-release

## Overview
semantic-release automates the release workflow: determine version bump from commit messages, generate changelog, create Git tag, publish to npm, create GitHub release.

## Instructions

### Step 1: Setup
```bash
npm install -D semantic-release @semantic-release/changelog @semantic-release/git
```

### Step 2: Configure
```json
// .releaserc.json — Release configuration
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/git", { "assets": ["CHANGELOG.md", "package.json"] }],
    "@semantic-release/github"
  ]
}
```

### Step 3: CI Integration
Add to your CI pipeline (GitHub Actions, GitLab CI, etc.) to run on every push to main. Requires GITHUB_TOKEN and NPM_TOKEN secrets.

## Guidelines
- Requires conventional commits — feat = minor, fix = patch, BREAKING CHANGE = major.
- Use with commitlint + husky to enforce commit format.
- Works with monorepos using semantic-release-monorepo plugin.
