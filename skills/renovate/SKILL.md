---
name: renovate
description: >-
  Renovate is a bot that scans a repository for dependency files and opens pull
  requests that update them: npm, pip, Docker, Go, Cargo, Terraform, GitHub
  Actions and 100+ other package managers. Use when writing or fixing a
  renovate.json: config presets, package rules, schedules, automerge, grouping,
  minimum release age, vulnerability alerts, or when self-hosting Renovate and
  checking a config with renovate-config-validator. Trigger words: renovate,
  dependency updates, automerge, package rules, dependency management.
license: Apache-2.0
compatibility: "Renovate 44.x. Hosted Mend Renovate app (GitHub) or self-hosted CLI, Docker image or GitHub Action; the CLI needs Node.js 24.11+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["renovate", "dependencies", "automation", "security", "devops"]
  repository: https://github.com/renovatebot/renovate
---

# Renovate

## Overview

Renovate is an automated dependency update tool. It scans a repository for dependency files (version 44 ships 117 managers, among them npm, pip, Docker, Go modules, Cargo, Terraform and GitHub Actions) and opens pull requests with changelogs and release notes. A `renovate.json` in the repository decides which updates arrive, when, how they are grouped and which ones may merge themselves. Renovate runs either as the hosted Mend Renovate app or self-hosted from the `renovate` npm package, Docker image or GitHub Action.

## Instructions

### Put Renovate on a repository

- **Hosted, GitHub:** install the Mend Renovate app (`https://github.com/apps/renovate`) on selected repositories. Renovate opens an onboarding PR titled "Configure Renovate" that adds `renovate.json`; no update PR is created until it is merged.
- **Self-hosted:** see "Self-host Renovate" below.

The config file is looked up in this order: `renovate.json`, `renovate.jsonc`, `renovate.json5`, then the same names under `.github/` and `.gitlab/`, then `.renovaterc` and `.renovaterc.json` (also `.jsonc`, `.json5`). Config in `package.json` is deprecated. Renovate always reads the file on the default branch.

### Start from presets

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"]
}
```

- `config:recommended` turns on the Dependency Dashboard issue, groups known monorepos (React, Angular, Babel) and a list of related packages, ignores `node_modules`, `bower_components`, `vendor`, `examples`, `test`, `tests`, `__tests__` and `__fixtures__` directories, and applies replacements and workarounds. It sets **no schedule and no automerge**; add those yourself.
- `config:best-practices` adds Docker and GitHub Actions digest pinning, `:pinDevDependencies`, config migration PRs, a 3-day `minimumReleaseAge` for npm and weekly lock file maintenance.
- `config:js-app` pins every npm dependency except peer dependencies (reproducible application builds); `config:js-lib` pins only devDependencies and keeps ranges for consumers.
- Useful single presets: `schedule:weekly`, `schedule:nonOfficeHours`, `group:allNonMajor`, `:automergeTypes`, `:automergeLinters`, `:automergeStableNonMajor`, `:approveMajorUpdates`, `:maintainLockFilesWeekly`, `docker:pinDigests`, `helpers:pinGitHubActionDigests`, `security:minimumReleaseAgeNpm`, `security:only-security-updates`.
- Share one config across repositories with `"extends": ["github>northwind-labs/renovate-config"]` (reads `default.json` from that repository); use `local>` on a self-hosted Git server.

### Target updates with packageRules

Rules apply top to bottom and later rules win. All `match*` fields in one rule must match.

| Field | Matches | Example |
| --- | --- | --- |
| `matchPackageNames` | exact name, glob, `/regex/`, `!` negation | `["@aws-sdk/**", "/eslint/", "!eslint-plugin-vue"]` |
| `matchUpdateTypes` | kind of update | `major`, `minor`, `patch`, `pin`, `pinDigest`, `digest`, `lockFileMaintenance` |
| `matchDepTypes` | where it is declared | `dependencies`, `devDependencies`, `peerDependencies` |
| `matchManagers` / `matchDatasources` | ecosystem | `["dockerfile"]`, `["docker"]`, `["terraform-provider"]` |
| `matchCurrentVersion` | installed version | `"!/^0/"` skips 0.x packages |
| `matchFileNames` | path of the package file | `["apps/web/**"]` |

`matchPackagePatterns`, `matchPackagePrefixes` and the `exclude*` variants are legacy: write `matchPackageNames` with a `/regex/`, a glob or a `!` entry instead.

### Schedule

`schedule` limits when Renovate may create branches; how often Renovate itself runs is decided by whoever hosts it. Use cron syntax with `*` in the minute field (hour granularity is the finest), always as an array, and set `timezone` (the default is UTC):

```json
{
  "timezone": "Europe/Berlin",
  "schedule": ["* 0-4,22-23 * * 1-5", "* * * * 0,6"]
}
```

The text form (`"before 5am on monday"`) still parses but is deprecated. A `schedule` inside a `packageRules` entry applies to those packages only. Vulnerability fixes ignore the schedule.

### Automerge

```json
{
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true
    }
  ],
  "lockFileMaintenance": { "enabled": true, "automerge": true }
}
```

- Renovate merges only after the branch's status checks pass. With no checks at all nothing merges unless `ignoreTests` is `true`.
- `platformAutomerge` defaults to `true`: on GitHub enable "Allow auto-merge" in the repository settings and require at least one status check in branch protection, otherwise GitHub can merge a PR whose tests failed.
- `"automergeType": "branch"` pushes green updates straight to the base branch and opens a PR only when tests fail. It needs CI to run on `renovate/**` branches and push rights on the base branch.
- Required reviews and CODEOWNERS block automerge; put the bot on the bypass list. One PR is merged per base branch per run.
- `automergeSchedule` is honoured only when `platformAutomerge` is `false`.

### Group and limit

- `groupName` puts every update the rule matches into one branch and PR; `group:allNonMajor` is one PR for all minor and patch updates.
- A grouped PR automerges only when every update in it has `automerge` enabled, so do not mix automerged and reviewed packages in one group.
- A large group fails as a whole: one broken package holds back the rest. Keep majors out of groups.
- `prHourlyLimit` (default 2) and `prConcurrentLimit` (default 10) throttle PR creation per repository.
- `"dependencyDashboardApproval": true` on a rule holds those updates until someone ticks them in the Dependency Dashboard issue.

### Supply-chain settings

- `"minimumReleaseAge": "3 days"` holds a new version back until it is that old; npm lets authors unpublish within 72 hours. It needs a registry that returns release timestamps.
- `vulnerabilityAlerts` turns GitHub Dependabot alerts into fix PRs (enable the dependency graph and Dependabot alerts on the repository). `"osvVulnerabilityAlerts": true` adds fixes from the OSV database for direct dependencies. A self-hosted or dry run then downloads that database (about 600 MB) into `osv-offline/` under the system temp directory.
- `rangeStrategy` is `auto` by default; the other values are `pin`, `bump`, `replace`, `widen`, `update-lockfile` and `in-range-only`. Pin in applications, keep ranges in libraries.

### Validate and preview

```bash
# check renovate.json in the current directory; --strict also fails on legacy option names
npx --yes --package renovate@44 -- renovate-config-validator --strict

# a file given by name is treated as global (self-hosted) config unless --no-global is passed
npx --yes --package renovate@44 -- renovate-config-validator --no-global presets/default.json

# dry run against the working directory: extracts dependencies and looks up updates, changes nothing
LOG_LEVEL=debug npx --yes renovate@44 --platform=local
```

`--platform=local` cannot resolve `local>` presets and creates no branches; read the `packageFiles with updates` block of the debug log for the planned `branchName` of each update. On a hosted repository, push the changed config to a branch named `renovate/reconfigure` and Renovate reports the validation result as a status check.

### Self-host Renovate

The CLI processes the repositories it is given and exits, so something has to start it on a timer; the docs recommend hourly. Global (administrator) options come from `config.js`, a file named in `RENOVATE_CONFIG_FILE`, `RENOVATE_*` environment variables or CLI flags.

```bash
# RENOVATE_TOKEN holds a token of a dedicated bot account
npx --yes renovate@44 northwind-labs/storefront

docker run --rm -e RENOVATE_TOKEN -e RENOVATE_AUTODISCOVER=true \
  -e RENOVATE_AUTODISCOVER_FILTER='northwind-labs/*' renovate/renovate:44.129.0
```

```yaml
# .github/workflows/renovate.yml
name: Renovate
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
jobs:
  renovate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: renovatebot/github-action@v46.3.5
        with:
          configurationFile: .github/renovate-global.json
          token: ${{ secrets.RENOVATE_TOKEN }}
```

```json
{
  "onboarding": false,
  "requireConfig": "optional",
  "repositories": ["northwind-labs/storefront", "northwind-labs/infra"],
  "gitAuthor": "Renovate Bot <renovate@northwind-labs.dev>",
  "extends": ["config:recommended"]
}
```

`platform` defaults to `github`; for GitLab, Gitea, Forgejo, Bitbucket or Azure DevOps set `RENOVATE_PLATFORM` and `RENOVATE_ENDPOINT`, plus `RENOVATE_GITHUB_COM_TOKEN` (a read-only github.com token) so changelog lookups are not rate limited. The default Docker image installs package managers on demand; the `-full` tag ships them preinstalled and weighs several gigabytes.

## Examples

### Example 1: Weekly batching with safe automerge for a web monorepo

**User request:** "Set up Renovate with automerge for safe updates and weekly batching"

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", "schedule:weekly", "security:minimumReleaseAgeNpm"],
  "timezone": "Europe/Berlin",
  "labels": ["dependencies"],
  "prConcurrentLimit": 5,
  "packageRules": [
    {
      "description": "Runtime dependencies: one weekly PR, reviewed by a human",
      "matchDepTypes": ["dependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "runtime dependencies"
    },
    {
      "description": "Dev tooling: one weekly PR that merges itself when CI is green",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "groupName": "dev dependencies",
      "automerge": true
    },
    {
      "description": "The framework gets its own PR and is never automerged",
      "matchPackageNames": ["next", "eslint-config-next", "@next/**"],
      "groupName": "next.js",
      "automerge": false
    },
    { "matchUpdateTypes": ["major"], "dependencyDashboardApproval": true }
  ],
  "lockFileMaintenance": { "enabled": true, "automerge": true },
  "vulnerabilityAlerts": { "labels": ["security"] }
}
```

**Result:** the validator prints `INFO: Config validated successfully against 1 file(s)`. On Monday before 04:00 Berlin time Renovate opens `renovate/runtime-dependencies`, `renovate/dev-dependencies` and `renovate/next.js`. The dev PR (`@types/node`, `vitest`, `eslint`, `typescript`) merges once CI is green, the other two wait for review, npm versions younger than three days are held back, and majors such as React 19 appear as unticked checkboxes in the Dependency Dashboard issue.

### Example 2: Docker base images and Terraform providers

**User request:** "Keep Docker base images and Terraform provider versions up to date"

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", "docker:pinDigests"],
  "enabledManagers": ["dockerfile", "docker-compose", "terraform", "github-actions"],
  "timezone": "America/New_York",
  "schedule": ["* 0-5 * * 1-5"],
  "packageRules": [
    { "matchDatasources": ["docker"], "matchUpdateTypes": ["major", "minor"], "automerge": false, "labels": ["base-image"] },
    { "matchDatasources": ["docker"], "matchUpdateTypes": ["digest"], "automerge": true },
    { "matchDatasources": ["terraform-provider"], "matchPackageNames": ["hashicorp/aws", "hashicorp/awscc"], "groupName": "terraform aws providers" },
    { "matchDatasources": ["terraform-provider"], "matchPackageNames": ["hashicorp/google", "hashicorp/google-beta"], "groupName": "terraform gcp providers" },
    { "matchDatasources": ["terraform-provider"], "matchPackageNames": ["hashicorp/azurerm", "hashicorp/azuread"], "groupName": "terraform azure providers" }
  ],
  "osvVulnerabilityAlerts": true,
  "vulnerabilityAlerts": { "labels": ["security"] }
}
```

**Result:** `LOG_LEVEL=debug npx --yes renovate@44 --platform=local` in a directory with `FROM node:20.11.0-alpine` and `hashicorp/aws` pinned to `5.30.0` plans `renovate/pin-dependencies` (adds `@sha256:` digests to every `FROM`), `renovate/node-20.x`, `renovate/node-24.x` (major), `renovate/terraform-aws-providers` (5.x minor) and `renovate/major-terraform-aws-providers` (6.x), without touching the files.

## Guidelines

- Start with `config:recommended`, then add a schedule and automerge rules explicitly; the preset contains neither.
- Run `renovate-config-validator --strict` before merging a config change. With an invalid config Renovate stops creating PRs and opens an issue titled "Action Required: Fix Renovate Configuration".
- Automerge what is merged without reading anyway (`@types/*`, linters, devDependency patches, lock file maintenance); keep majors and 0.x packages for a human.
- Automerge is only as safe as the test suite, and required status checks must exist before it is enabled.
- Pin exact versions in applications, keep ranges in libraries.
- Do not use `minimumReleaseAge` to slow down a chatty package; give it its own `schedule`.
- Too narrow a schedule window starves Renovate: branches that need a rebase after another merge wait for the next window.
- Self-hosting: use a dedicated bot account, keep the token in a secret, pin the image or npm version, and treat every monitored repository as trusted. Repository config can run commands on the Renovate host through `postUpgradeTasks` once `allowedCommands` permits them.
- Renovate is not a vulnerability scanner or a licence checker; it opens the update PRs, reviewing and testing them stays with the team.
