---
title: "Build a Custom Internal CLI Tool for Your Dev Team"
slug: build-internal-cli-tool
description: "Scaffold, implement, and distribute an internal CLI that automates repetitive team workflows like environment setup, deployments, and data seeding."
skills: [coding-agent, test-generator, git-commit-pro, golang, swift]
category: development
tags: [cli, developer-tools, automation, internal-tooling, productivity]
---

# Build a Custom Internal CLI Tool for Your Dev Team

## The Problem

Every new developer spends their first day copying shell commands from a stale Confluence page to set up their local environment. The page was last updated 8 months ago, two of the steps reference services that have been renamed, and the Docker Compose section still uses the old `docker-compose` binary and the obsolete `version:` key. Senior devs have personal bash aliases for deployments, database resets, and log tailing -- none documented, and no two developers use the same ones.

The team runs 8-12 manual steps to seed test data, and someone breaks staging once a month by running the wrong migration command. There is no single entry point for common workflows: a Confluence page nobody trusts, a README that covers initial setup but not deployments, three Slack threads explaining the staging reset (each slightly different), and a senior engineer who fields the same questions every week.

## The Solution

Use **coding-agent** to run Claude Code headless (`claude -p`) on one well-scoped task at a time: scaffold a Node.js CLI called `dx` with a subcommand per team workflow and confirmation prompts for destructive operations. Use **test-generator** to write the Vitest suite, and **git-commit-pro** to commit each step as a Conventional Commit. Distribute through a private npm registry.

## Step-by-Step Walkthrough

### Step 1: Define Commands from Existing Tribal Knowledge

List everything developers do manually, then give the agent one narrow task with only the tools it needs:

```bash
timeout 900 claude -p "Scaffold an internal CLI named dx in this empty repo. ESM Node project
(engines.node >=22.13), commander for commands, ora for spinners, @inquirer/prompts for
confirmations. One file per subcommand under src/commands/: setup, deploy <env>, db:reset,
logs <service>, fixtures <model>. Each has --help text and exits non-zero on failure.
Stub the bodies; do not call real services." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Bash(npm install *)" "Bash(node --check *)" \
  --max-budget-usd 2 --output-format text > /tmp/dx-scaffold.log 2>&1
```

Check the result yourself: `node bin/dx.js --help` lists five commands. Current commander (15) and ora (10) are ESM-only and need Node 22+ (@inquirer/prompts 8 needs 22.13 or newer within the 22 line); that is why the project sets `"type": "module"`. Commit with git-commit-pro's format, for example `feat(cli): scaffold dx with five subcommands`, staging specific files instead of `git add .`.

### Step 2: Add Safety Checks for Destructive Commands

The most dangerous commands need guardrails. Nobody should accidentally reset staging during a customer demo:

```javascript
import { confirm } from '@inquirer/prompts';

export async function guard(summary, { yes }) {
  console.log(summary);                       // what is about to happen
  if (yes && process.env.CI) return true;     // --yes only counts in CI
  if (yes) throw new Error('--yes is only honoured when CI is set');
  return confirm({ message: 'Continue?', default: false });
}
```

`dx db:reset` prints the current row counts before asking; `dx deploy staging` prints the commit range between the deployed version and `HEAD` and the migrations that will run. `--yes` is honoured only when `CI` is also set, so a local alias such as `dx db:reset --yes` fails with an error instead of wiping staging. Running this guard locally: `node bin/dx.js db:reset --yes` stops with the error, `CI=1 node bin/dx.js db:reset --yes` proceeds.

### Step 3: Implement the Environment Setup Command

The setup command is the highest-value subcommand because it runs once per developer and replaces hours of "it works on my machine" debugging:

```text
The "dx setup" command should:
1. Check prerequisites (Node 22+, Docker with the compose plugin, AWS CLI v2)
2. Clone frontend, backend, and shared-lib repos if not present
3. Install dependencies in each
4. Copy .env.example to .env, prompting for secrets (never echo them)
5. Run `docker compose up -d --wait` for Postgres, Redis, Elasticsearch
6. Run migrations and seed data
7. Print a summary with local URLs

Stop at the first failed step and say which one failed and why.
```

Run it through the same `claude -p` pattern as step 1. Two details keep the implementation honest. First, `docker compose up -d --wait` blocks until services with a `healthcheck` report healthy and has `--wait-timeout <seconds>`, so the CLI does not need its own polling loop; each service in `compose.yaml` needs a healthcheck for this to mean anything. Second, call external programs with `execFileSync('docker', ['compose', ...])` and an argument array, never a shell string built from user input.

Prerequisite checks catch problems before three repos are cloned: if Docker is not running, the command says so first; if Node is older than 22, it suggests `nvm install 22`. The final output is a table of local URLs and ports, each bound to `127.0.0.1` in the compose file.

### Step 4: Add Tests and Documentation

Hand the test task to the agent with the **test-generator** approach: detect the framework, mock external calls, and cover happy path, edge cases and errors.

```bash
timeout 900 claude -p "Write Vitest tests for src/commands/setup.js and src/commands/db-reset.js.
Mock node:child_process and @inquirer/prompts with vi.mock. Cover: prerequisite missing,
step 5 failing stops steps 6-7, confirmation accepted, declined, --yes without CI, --yes with CI.
Do not change source files." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Bash(npx vitest run)" \
  --max-budget-usd 2 --output-format text > /tmp/dx-tests.log 2>&1
```

Run `npx vitest run` yourself and read the assertions: generated tests that only mock everything prove nothing. Add a README with a command table and a troubleshooting section built from the failures new hires actually hit.

### Step 5: Package and Distribute Internally

Publish to your private registry (Artifactory, Verdaccio, GitHub Packages), scoped so only `@company` packages go there:

```ini
# .npmrc  (the token comes from the environment, never from the file)
@company:registry=https://registry.internal.company.com/api/npm/npm/
//registry.internal.company.com/api/npm/npm/:_authToken=${NPM_TOKEN}
```

A GitHub Actions workflow publishes on version tags (`v1.2.3`) after tests pass; release with `npm version minor` (it bumps `package.json`, commits and tags), then `git push --follow-tags`. Add `"files": ["bin", "src"]` and `"bin": {"dx": "bin/dx.js"}` to `package.json` so the package ships the entry point. `dx update` compares `npm view @company/dx version` with the installed version and runs `npm install -g @company/dx`. Do the update check at launch, cached for a day, and only print a reminder. Do not check from a `postinstall` script: npm hides lifecycle output from dependencies, and a network call at install time is a surprise nobody asked for.

If the team would rather ship one static binary per OS than require Node on every laptop, build the same commands in Go (see the golang skill, `CGO_ENABLED=0 GOOS=... GOARCH=... go build`) and attach the files to a GitHub release with their checksums.

## Real-World Example

A lead engineer at a 25-person SaaS company notices new developers lose most of their first day to local setup, and senior devs keep private shell scripts nobody else can find. She builds `dx` with five subcommands in a few sessions, running the agent one task at a time and reviewing every diff before committing.

New hires now clone the repo, run `dx setup`, answer a few prompts for environment-specific values, and have a running stack, which the team measured at well under an hour on their own machines. Destructive operations show what will happen before proceeding, and `--yes` only works in CI, so the monthly "someone reset staging" incident stops. Over the next month the team adds more commands (`dx lint-fix`, `dx create-migration`, `dx open-pr`), each replacing a workflow that used to live in a Slack thread.

## Related Skills

- [coding-agent](/skills/coding-agent) -- headless `claude -p` runs for each scoped task.
- [test-generator](/skills/test-generator) -- the Vitest suite for commands and confirmation flows.
- [git-commit-pro](/skills/git-commit-pro) -- Conventional Commit messages for each step.
- [golang](/skills/golang) -- choose Go when the CLI should ship as one static binary per OS instead of requiring Node and a private npm registry on every laptop.
- [swift](/skills/swift) -- choose swift when the team already writes Swift and the CLI should ship as one statically linked Linux binary (swiftly toolchain, Swift Package Manager, Static Linux SDK) with no runtime on the servers.
