---
name: renovate
description: >-
  Assists with automating dependency updates across JavaScript, Python, Docker, Go, Rust,
  Terraform, and 50+ ecosystems using Renovate. Use when configuring update strategies,
  automerge policies, grouping rules, or scheduling to keep dependencies current. Trigger
  words: renovate, dependency updates, automerge, package rules, dependency management.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["renovate", "dependencies", "automation", "security", "devops"]
---

# Renovate

## Overview

Renovate is an automated dependency update tool that scans repositories for dependency files across 50+ ecosystems (npm, pip, Docker, Go, Rust, Terraform, GitHub Actions) and creates pull requests with changelogs, release notes, and configurable automerge policies. It supports grouping, scheduling, and per-package rules to keep dependencies current without overwhelming teams.

## Instructions

- When setting up Renovate, start with `config:recommended` which provides sensible defaults for grouping, scheduling, and automerge, then add `renovate.json` to the repo root.
- When configuring automerge, enable it for low-risk updates (`@types/*`, devDependencies patches) and disable it for major updates, using `platformAutomerge` for GitHub's native merge feature.
- When reducing PR noise, use `group:allNonMajor` for a single weekly PR covering all minor and patch updates, and group monorepo packages (React, Angular, Babel) together.
- When setting schedules, configure update windows for low-traffic times (e.g., `["after 9am and before 5pm every weekday"]`) to avoid disrupting developers.
- When defining package rules, use `matchPackageNames`, `matchPackagePatterns`, and `matchUpdateTypes` to set per-package automerge, grouping, and version strategies.
- When handling version strategies, pin exact versions in applications for reproducibility and use ranges in libraries for compatibility.

## Examples

### Example 1: Configure Renovate for a production monorepo

**User request:** "Set up Renovate with automerge for safe updates and weekly batching"

**Actions:**
1. Create `renovate.json` extending `config:recommended` and `schedule:weekly`
2. Add package rules to automerge `@types/*` and devDependency patches
3. Group React, Next.js, and testing library packages into single PRs
4. Enable the dashboard issue for an overview of all pending updates

**Output:** A Renovate configuration that automerges safe updates, batches non-major changes weekly, and groups related packages.

### Example 2: Manage Docker and Terraform dependency updates

**User request:** "Keep Docker base images and Terraform provider versions up to date"

**Actions:**
1. Configure Renovate to scan Dockerfiles and `.tf` files
2. Set `matchDatasources: ["docker"]` with `automerge: false` for base image updates
3. Group Terraform providers by cloud provider (AWS, GCP, Azure)
4. Enable vulnerability alerts to prioritize updates that fix known CVEs

**Output:** Automated PRs for Docker and Terraform dependency updates with grouped providers and security prioritization.

## Guidelines

- Start with `config:recommended` since it handles grouping, scheduling, and automerge sensibly.
- Automerge `@types/*` and devDependencies patches since they are low-risk and high-volume.
- Group monorepo packages (React, Vue, Angular, Babel, Jest) into single PRs to reduce noise.
- Schedule updates for low-traffic times to avoid disrupting developers during peak hours.
- Pin exact versions in applications and use ranges in libraries.
- Review major updates manually since breaking changes require human judgment.
