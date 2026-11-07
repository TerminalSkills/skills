---
title: Build an Automated Dependency Update Pipeline
slug: build-automated-dependency-update-pipeline
description: >
  Automate npm dependency updates with Renovate, a CI vulnerability gate and
  auto-merge for safe updates, so security fixes land in hours and major
  upgrades stay small and reviewable.
skills:
  - typescript
  - github-actions
  - docker-helper
  - zod
category: devops
tags:
  - dependency-management
  - security
  - automation
  - supply-chain
  - renovate
  - vulnerability
---

# Build an Automated Dependency Update Pipeline

## The Problem

A monorepo has 200+ npm dependencies. Nobody updates them: "if it works, don't touch it." An audit finds dozens of known vulnerabilities, several of them critical. The team tried Dependabot with default settings and got a stream of one-package PRs that nobody reviewed. When someone finally upgrades a major dependency, the codebase is 18 months behind and three things break at once. The fix is not a bigger script that re-implements a bot. It is a bot that is configured to group, schedule and merge by risk, plus a CI gate that blocks known-bad releases.

## Step 1: Configure Renovate by risk

Renovate reads `renovate.json` from the repository root. Patches of dev tooling are grouped and auto-merged, runtime patches are grouped and auto-merged, runtime minors are grouped for a human, and every major gets its own PR that is never merged automatically.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 6am on monday"],
  "timezone": "UTC",
  "prConcurrentLimit": 5,
  "minimumReleaseAge": "3 days",
  "osvVulnerabilityAlerts": true,
  "vulnerabilityAlerts": {
    "labels": ["security"],
    "automerge": true
  },
  "packageRules": [
    {
      "description": "Patch and minor updates of dev tooling: one PR, auto-merge when CI is green",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["patch", "minor"],
      "groupName": "dev tooling",
      "automerge": true
    },
    {
      "description": "Runtime patches: one PR, auto-merge when CI is green",
      "matchDepTypes": ["dependencies"],
      "matchUpdateTypes": ["patch"],
      "groupName": "runtime patches",
      "automerge": true
    },
    {
      "description": "Runtime minors: grouped, reviewed by a human",
      "matchDepTypes": ["dependencies"],
      "matchUpdateTypes": ["minor"],
      "groupName": "runtime minors"
    },
    {
      "description": "Majors: one PR per package, never merged automatically",
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["major-update"]
    }
  ]
}
```

What each setting does:

- `schedule` batches routine PRs into one weekly window. Security PRs are exempt: by default a `vulnerabilityAlerts` PR ignores `schedule` and the concurrency limits, so a fix opens the day the advisory is known.
- `minimumReleaseAge` waits 3 days after a version is published before proposing it, which filters out most quickly-yanked or hijacked releases.
- `osvVulnerabilityAlerts` adds fixes for advisories from the OSV database (direct dependencies only). Renovate flags this option as experimental, so it may change; drop it if you only want GitHub's alerts. GitHub's own alerts also feed `vulnerabilityAlerts`, but only once the Dependency graph and Dependabot alerts are enabled in the repository settings.
- Auto-merge only works safely with branch protection that requires the CI checks below. Without required checks, Renovate has nothing to wait for. Renovate's own docs warn that a wrong vulnerability alert can produce a flapping fix, so look at the first few auto-merged security PRs.

Check the file before committing it: `npx --package renovate@44 renovate-config-validator renovate.json` prints `Config validated successfully`.

## Step 2: Run Renovate

The simplest option is the Mend Renovate GitHub App, which needs no pipeline of your own. To self-host, use the official action with a token stored as a repository secret (a classic PAT with `repo` scope, or a GitHub App token):

```yaml
# .github/workflows/renovate.yml
name: Renovate
on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  renovate:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
      - uses: renovatebot/github-action@v46.3.12
        with:
          token: ${{ secrets.RENOVATE_TOKEN }}
        env:
          RENOVATE_REPOSITORIES: ${{ github.repository }}
```

The `schedule` in `renovate.json` decides when PRs are created, so the bot can run daily and still keep routine PRs to Mondays while security fixes get through immediately.

To preview what Renovate would do without opening anything, run the official Docker image in dry-run mode from your machine, with the token in the environment and never on the command line:

```console
$ export RENOVATE_TOKEN=...   # a token with access to the repository
$ docker run --rm -e RENOVATE_TOKEN -e LOG_LEVEL=debug ghcr.io/renovatebot/renovate:44 renovate --dry-run=full my-org/my-repo
```

The image tag `44` follows the 44.x release line; pin a full version, or a digest, for reproducible runs. `--dry-run=full` logs the branches and PRs it would create.

## Step 3: A vulnerability gate in CI

Renovate raises PRs; CI decides whether they may merge. This gate parses `npm audit` output with Zod and fails the job on a high or critical advisory in production dependencies. Note the real severity names: npm uses `info`, `low`, `moderate`, `high` and `critical` (there is no `medium`), and the `via` array mixes advisory objects with the names of other vulnerable packages.

```typescript
// scripts/audit-gate.ts
// usage: npm audit --omit=dev --json | npx tsx scripts/audit-gate.ts
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Severity = z.enum(['info', 'low', 'moderate', 'high', 'critical']);

const Audit = z.object({
  vulnerabilities: z.record(
    z.string(),
    z.object({
      severity: Severity,
      isDirect: z.boolean(),
      via: z.array(z.union([z.string(), z.object({ title: z.string(), url: z.string() }).passthrough()])),
      fixAvailable: z.union([
        z.boolean(),
        z.object({ name: z.string(), version: z.string(), isSemVerMajor: z.boolean() }),
      ]),
    }),
  ),
});

const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 } as const;
const failAt = rank.high;

const audit = Audit.parse(JSON.parse(readFileSync(0, 'utf8')));
const blocking = Object.entries(audit.vulnerabilities).filter(([, v]) => rank[v.severity] >= failAt);

for (const [name, v] of blocking) {
  const advisories = v.via.filter((x) => typeof x !== 'string').map((x) => x.url);
  console.error(`${v.severity.toUpperCase()} ${name} (fix: ${JSON.stringify(v.fixAvailable)}) ${advisories.join(' ')}`);
}
if (blocking.length > 0) process.exit(1);
console.log('No high or critical vulnerabilities in production dependencies.');
```

Fed an audit report containing a high-severity `lodash` advisory it prints `HIGH lodash (fix: true) https://github.com/advisories/...` and exits 1; with no findings it exits 0.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm test
      - name: Vulnerability gate
        run: npm audit --omit=dev --json | npx tsx scripts/audit-gate.ts
```

`npm audit` exits non-zero when it finds anything, but in a pipe only the last command's status counts, so the gate script is what passes or fails the step. Mark `test` as a required status check in branch protection: that is what lets Renovate's auto-merge wait for it.

## Step 4: Test the upgraded app in a container

Dependency upgrades can pass unit tests and still break the production image (a native module that needs glibc, a Node engine bump). Build the real image in CI for update PRs. Follow the Docker helper rules: pin a supported Node LTS, install from the lockfile, prune dev dependencies in the builder, run as the non-root `node` user.

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
USER node
CMD ["node", "dist/index.js"]
```

Add a `docker build -t app:pr .` step after `npm test` and a smoke test that starts the container on `127.0.0.1` and calls a health endpoint. A `.dockerignore` listing `node_modules`, `.git` and `.env` keeps the build context small and secrets out.

## Results

An example team of this size can expect:

- Security fixes arrive as labelled PRs the day an advisory appears, and merge themselves when CI passes.
- The weekly noise drops to a handful of grouped PRs (dev tooling, runtime patches, runtime minors) instead of one PR per package.
- Major upgrades arrive one package at a time, so a breaking change has one cause and one reviewer.
- The CI gate blocks any PR, bot or human, that introduces a high or critical advisory in production dependencies.

## Related Skills

- [typescript](/skills/typescript) — the audit gate script
- [zod](/skills/zod) — validating the `npm audit` JSON
- [github-actions](/skills/github-actions) — CI and the Renovate workflow
- [docker-helper](/skills/docker-helper) — the container build and dry-run image
