---
name: act
description: >-
  Run GitHub Actions locally with act. Use when a user asks to test GitHub Actions workflows locally, debug CI pipelines without pushing, or run workflows offline.
license: Apache-2.0
compatibility: 'Docker required, any OS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - act
    - github-actions
    - ci
    - local
    - docker
---

# Act

## Overview
Act runs GitHub Actions workflows locally using Docker. Test and debug CI pipelines without pushing to GitHub. Supports most GitHub Actions features.

## Instructions

### Step 1: Install
```bash
brew install act
```

### Step 2: Run Workflows
```bash
act                          # run push event
act pull_request             # run PR event
act -j test                  # run specific job
act -W .github/workflows/ci.yml  # specific workflow
act --secret-file .env.secrets   # with secrets
```

### Step 3: Configuration
```bash
# .actrc — Default settings
-P ubuntu-latest=catthehacker/ubuntu:act-latest
--env-file .env
```

### Step 4: Debug
```bash
act -n    # dry run
act -v    # verbose
act -l    # list workflows
```

## Guidelines
- First run downloads Docker images (~1-3GB).
- Not all GitHub Actions features work locally (e.g., OIDC tokens).
- Use micro images for faster runs.
- Great for iterating on CI without waiting for GitHub runners.
