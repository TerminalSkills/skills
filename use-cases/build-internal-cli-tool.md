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

Every new developer spends their first day copying shell commands from a stale Confluence page to set up their local environment. The page was last updated 8 months ago, two of the steps reference services that have been renamed, and the Docker Compose section still uses v2 syntax. Senior devs have personal bash aliases for deployments, database resets, and log tailing -- none documented, and no two developers use the same ones.

The team runs 8-12 manual steps to seed test data, and someone breaks staging once a month by running the wrong migration command. There is no single entry point for common workflows. Instead there is a Confluence page nobody trusts, a README that covers initial setup but not deployments, three different Slack threads explaining the staging reset process (each slightly different), and a senior engineer who fields the same questions every week.

The cost adds up: 2-3 hours lost per new hire on day one, one staging incident per month from manual errors, and a constant background drain as developers interrupt each other to ask "how do I..." questions that have been answered a dozen times.

## The Solution

Using the **coding-agent**, **test-generator**, and **git-commit-pro** skills, the agent scaffolds a Node.js CLI called `dx` (developer experience) with subcommands for every team workflow, adds interactive safety prompts for destructive operations, generates integration tests, and packages the tool for internal distribution via a private npm registry.

## Step-by-Step Walkthrough

### Step 1: Define Commands from Existing Tribal Knowledge

Start by listing everything developers do manually today:

```text
I want to build an internal CLI called "dx" (developer experience) for our team.
Here are the things developers do manually today:

- Set up local env: clone 3 repos, install deps, copy .env.example, run docker-helper, run migrations, seed data
- Deploy to staging: build, run tests, push image to ECR, update ECS task definition
- Reset staging DB: snapshot current, run down migrations, run up migrations, re-seed
- Tail logs: connect to CloudWatch log group by service name
- Generate test fixtures: create realistic fake data for a given model

Build this as a Node.js CLI using Commander.js. Each workflow should be a subcommand.
```

The agent scaffolds a full CLI project: `dx setup`, `dx deploy staging`, `dx db:reset`, `dx logs <service>`, and `dx fixtures <model>`. Each command has proper argument parsing, `--help` text, and error handling. The project structure follows Commander.js conventions with each subcommand in its own file under `src/commands/`, a shared utilities module for common operations like spinner display and config loading, and a root `dx` entry point that registers all subcommands.

### Step 2: Add Safety Checks for Destructive Commands

The most dangerous commands need guardrails. Nobody should accidentally reset staging during a customer demo:

```text
For destructive commands (db:reset, deploy), add confirmation prompts with
a summary of what will happen. For db:reset, show the current row counts
before proceeding. For deploy, show the git diff summary and current
staging version. Add a --yes flag to skip prompts in CI.
```

Destructive operations now show exactly what is about to happen before asking for confirmation. `dx db:reset` queries the database and displays current row counts -- "You are about to drop 14,329 rows across 12 tables. Continue? [y/N]" -- with a color-coded red warning. `dx deploy staging` shows a summary of changes: the git diff between the currently deployed commit and HEAD, the number of migration files that will run, and the current staging version for comparison.

The `--yes` flag bypasses prompts for CI pipelines, but only when the `CI` environment variable is also set -- so nobody accidentally aliases `dx db:reset --yes` in their local shell and blows away staging with a typo. The double-check is intentional.

### Step 3: Implement the Environment Setup Command

The setup command is the highest-value subcommand because it runs once per developer but saves hours of frustration and "it works on my machine" debugging:

```text
The "dx setup" command should:
1. Check prerequisites (Node 18+, Docker, AWS CLI)
2. Clone frontend, backend, and shared-lib repos if not present
3. Install dependencies in each
4. Copy .env.example to .env with prompted values (DB password, API keys)
5. Start docker-helper (Postgres, Redis, Elasticsearch)
6. Wait for services to be healthy
7. Run migrations and seed data
8. Print a summary with local URLs

Handle partial failures — if step 5 fails, don't try steps 6-7.
Show progress with spinners for long operations.
```

The implementation uses `ora` spinners for long operations (dependency install takes 90 seconds, Docker startup takes 30-60 seconds), health check polling with configurable timeouts for each service, and a step-based execution model where a failure at step N skips everything after it but reports exactly which step failed and why.

Prerequisite checking catches problems early: if Docker is not running, the command tells you before it clones three repos and installs dependencies. If Node is the wrong version, it suggests `nvm use 18` instead of letting the install fail with a cryptic error 40 seconds later. The final output is a summary table:

```
  Frontend:  http://localhost:3000
  API:       http://localhost:4000
  Postgres:  localhost:5432
  Redis:     localhost:6379
  Kibana:    http://localhost:5601

  Setup complete in 4m 12s. Run "dx logs api" to tail the API server.
```

### Step 4: Add Tests and Documentation

```text
Generate integration tests for the setup and deploy commands. Mock external
calls (Docker, AWS CLI) but test the actual command logic: argument parsing,
confirmation flows, error handling, and output formatting. Also generate
a README with installation instructions, command reference, and examples.
```

The test suite covers 24 cases: happy paths for each command, error scenarios (Docker not running, AWS credentials expired, migration failure mid-stream, disk full during clone), confirmation flow logic (accepting, declining, `--yes` bypass, `--yes` without CI env var), and output formatting verification. External calls to Docker, AWS CLI, and the database are mocked so tests run in 3 seconds without any infrastructure.

The README includes a command reference table showing every subcommand with its arguments and flags, example sessions showing real terminal output, and a troubleshooting section covering the 10 most common setup failures -- because the first thing a new developer does with the CLI is run `dx setup`, and it needs to work on their first try.

### Step 5: Package and Distribute Internally

```text
Set up the CLI for internal distribution:
- Publish to our private npm registry (Artifactory at registry.internal.company.com)
- Add a postinstall script that checks for updates
- Create a GitHub Actions workflow that publishes on version tag
- Add "dx update" command that self-updates from the registry
```

The distribution pipeline: `.npmrc` configured for the private Artifactory registry, semantic versioning with `standard-version` for automatic changelog generation, a GitHub Actions workflow that publishes on version tags (`v1.2.3`), and a `dx update` command that compares the installed version against the registry and runs `npm install -g @company/dx` when outdated.

A postinstall hook prints a one-line message if a newer version is available, so developers see the update prompt naturally whenever they install any npm package. The `dx` command itself checks for updates on launch (cached, so it only hits the registry once per day) and prints a subtle reminder if a new version has been out for more than a week.

## Real-World Example

A lead engineer at a 25-person SaaS company notices developers waste 2-3 hours on their first day setting up local environments, and senior devs maintain personal shell scripts that nobody else can use or find. She builds `dx` with 5 subcommands covering the most common workflows.

The setup command reduces first-day onboarding from 3 hours to 12 minutes -- clone the repo, run `dx setup`, answer 4 prompts for environment-specific values, and everything is running. Destructive operations now have safety prompts that show exactly what will happen before proceeding, so the monthly "someone accidentally reset staging" incident stops happening entirely. Over the next month the team adds 4 more commands (`dx lint-fix`, `dx create-migration`, `dx rotate-keys`, `dx open-pr`), each one replacing a workflow that used to live in someone's head or a Slack thread. New developer survey scores for "tooling satisfaction" climb from 3.1 to 4.6 out of 5, and the senior engineer who used to field setup questions every week gets two hours back.
