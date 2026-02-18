---
title: "Build a Custom Internal CLI Tool for Your Dev Team"
slug: build-internal-cli-tool
description: "Scaffold, implement, and distribute an internal CLI that automates repetitive team workflows like environment setup, deployments, and data seeding."
skills: [coding-agent, test-generator, git-commit-pro]
category: development
tags: [cli, developer-tools, automation, internal-tooling, productivity]
---

# Build a Custom Internal CLI Tool for Your Dev Team

## The Problem

Every new developer spends their first day copying shell commands from a stale Confluence page to set up their local environment. Senior devs have personal bash aliases for deployments, database resets, and log tailing — none of them documented. The team runs 8-12 manual steps to seed test data, and someone breaks staging once a month by running the wrong migration command. There is no single entry point for common team workflows.

## The Solution

Use `coding-agent` to scaffold a Node.js CLI with subcommands for every team workflow, `test-generator` to add integration tests for critical commands, and `git-commit-pro` to maintain clean commit history as the tool evolves.

```bash
npx terminal-skills install coding-agent test-generator git-commit-pro
```

## Step-by-Step Walkthrough

### 1. Define commands from existing tribal knowledge

```text
I want to build an internal CLI called "dx" (developer experience) for our team.
Here are the things developers do manually today:

- Set up local env: clone 3 repos, install deps, copy .env.example, run docker-compose, run migrations, seed data
- Deploy to staging: build, run tests, push image to ECR, update ECS task definition
- Reset staging DB: snapshot current, run down migrations, run up migrations, re-seed
- Tail logs: connect to CloudWatch log group by service name
- Generate test fixtures: create realistic fake data for a given model

Build this as a Node.js CLI using Commander.js. Each workflow should be a subcommand.
```

The agent scaffolds a full CLI project with `dx setup`, `dx deploy staging`, `dx db:reset`, `dx logs <service>`, and `dx fixtures <model>`. Each command has proper argument parsing, help text, and error handling.

### 2. Add interactive prompts and safety checks

```text
For destructive commands (db:reset, deploy), add confirmation prompts with
a summary of what will happen. For db:reset, show the current row counts
before proceeding. For deploy, show the git diff summary and current
staging version. Add a --yes flag to skip prompts in CI.
```

The agent adds Inquirer.js prompts with color-coded warnings for destructive operations, a `--yes` flag for CI automation, and pre-flight checks that query actual infrastructure state before proceeding.

### 3. Implement the environment setup command

```text
The "dx setup" command should:
1. Check prerequisites (Node 18+, Docker, AWS CLI)
2. Clone frontend, backend, and shared-lib repos if not present
3. Install dependencies in each
4. Copy .env.example to .env with prompted values (DB password, API keys)
5. Start docker-compose (Postgres, Redis, Elasticsearch)
6. Wait for services to be healthy
7. Run migrations and seed data
8. Print a summary with local URLs

Handle partial failures — if step 5 fails, don't try steps 6-7.
Show progress with spinners for long operations.
```

The agent implements the full setup flow with `ora` spinners, health check polling with timeouts, graceful error handling that reports exactly which step failed, and a final summary table with clickable URLs.

### 4. Add tests and documentation

```text
Generate integration tests for the setup and deploy commands. Mock external
calls (Docker, AWS CLI) but test the actual command logic: argument parsing,
confirmation flows, error handling, and output formatting. Also generate
a README with installation instructions, command reference, and examples.
```

The agent produces 24 test cases covering happy paths, error scenarios, and edge cases. The README includes a command reference table, GIF-style usage examples, and troubleshooting section.

### 5. Package and distribute internally

```text
Set up the CLI for internal distribution:
- Publish to our private npm registry (Artifactory at registry.internal.company.com)
- Add a postinstall script that checks for updates
- Create a GitHub Actions workflow that publishes on version tag
- Add "dx update" command that self-updates from the registry
```

The agent configures `.npmrc` for the private registry, adds semantic versioning with `standard-version`, creates the publish workflow, and implements the self-update command that compares versions and runs `npm install -g` when outdated.

## Real-World Example

A lead engineer at a 25-person SaaS company notices developers waste 2-3 hours on their first day setting up local environments, and senior devs maintain personal shell scripts for common operations.

1. She uses the agent to scaffold `dx` with 5 subcommands covering the most common workflows
2. The setup command reduces first-day onboarding from 3 hours to 12 minutes
3. Destructive operations now have safety prompts — no more accidental staging resets
4. The team adds 4 more commands over the next month (lint-fix, create-migration, rotate-keys, open-pr)
5. New developer survey scores for "tooling satisfaction" increase from 3.1 to 4.6 out of 5
