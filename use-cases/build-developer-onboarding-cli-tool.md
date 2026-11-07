---
title: Build a Developer Onboarding CLI Tool
slug: build-developer-onboarding-cli-tool
description: >
  Automate new developer setup from 2 days of manual steps to a single
  command — cloning repos, installing dependencies, provisioning
  dev databases, and running health checks.
skills:
  - typescript
  - commander
  - docker-helper
  - zod
  - github-actions
category: development
tags:
  - developer-experience
  - cli
  - onboarding
  - automation
  - devtools
  - dx
---

# Build a Developer Onboarding CLI Tool

## The Problem

A company with 40 microservices takes two full days to onboard a new developer. The "Getting Started" doc is 47 pages, half outdated. New hires miss steps, get stuck on version mismatches, and spend their first week asking "why doesn't X work?" in Slack. The team hires four engineers a month, and every one of them repeats the same manual setup.

The fix is a small CLI, `devsetup`, that checks the machine, clones the repos for the new hire's team, starts local services and reports what is still broken. It must be safe to run twice, because a half-finished first attempt is the normal case.

## Step 1: Project Setup

Commander 15 is ESM-only and needs Node.js 22.12 or newer (Node 20 reached end of life in April 2026). Zod 4 validates the options.

```bash
mkdir devsetup && cd devsetup
npm init -y
npm pkg set type=module
npm install commander zod
npm install -D typescript tsx @types/node
```

Use a `tsconfig.json` with `"module": "nodenext"`, `"strict": true`, `"noEmit": true` and `"types": ["node"]`. Check types with `npx tsc --noEmit` and run the tool with `npx tsx src/devsetup.ts`.

## Step 2: The Local Services File

Every developer gets the same PostgreSQL and Redis, published on `127.0.0.1` only. The password is a local-only default, overridable with `DEV_DB_PASSWORD`.

```yaml
# docker/dev-services.yml
services:
  postgres:
    image: postgres:18-alpine
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DEV_DB_PASSWORD:-dev-only-password}
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  redis:
    image: redis:8-alpine
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

volumes:
  pgdata:
```

PostgreSQL 18 images keep data in a versioned subdirectory of `/var/lib/postgresql`, so the volume is mounted there. `docker compose up -d --wait` returns only when both healthchecks pass.

## Step 3: CLI Framework

Each step skips work already done, and `--dry-run` prints instead of acting. Actions use `execFileSync` with argument arrays, so no shell interprets user input, and Zod validates the team name before it selects a repo list.

```typescript
// src/devsetup.ts
import { Command } from 'commander';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Team = z.enum(['frontend', 'backend', 'platform', 'mobile']);
const InitOptions = z.object({
  team: Team.default('backend'),
  skipDocker: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});
type Options = z.infer<typeof InitOptions>;
type SetupStep = (opts: Options) => Promise<void>;

const TEAM_REPOS: Record<z.infer<typeof Team>, string[]> = {
  frontend: ['web-app', 'design-system', 'shared-types'],
  backend: ['api-gateway', 'user-service', 'payment-service', 'shared-types'],
  platform: ['infrastructure', 'monitoring', 'ci-templates', 'shared-types'],
  mobile: ['mobile-app', 'shared-types', 'api-client'],
};
const WORK_DIR = join(homedir(), 'work');
const COMPOSE_FILE = fileURLToPath(new URL('../docker/dev-services.yml', import.meta.url));
const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], { stdio: 'pipe' });

const atLeast = (found: string, min: string) =>
  found.localeCompare(min, undefined, { numeric: true }) >= 0;

async function checkPrerequisites(): Promise<void> {
  console.log('Checking prerequisites...');
  const required = [
    { name: 'Node.js', cmd: 'node', args: ['--version'], min: '22.12.0' },
    { name: 'Docker', cmd: 'docker', args: ['--version'], min: '25.0.0' },
    { name: 'Git', cmd: 'git', args: ['--version'], min: '2.30.0' },
    { name: 'pnpm', cmd: 'pnpm', args: ['--version'], min: '10.0.0' },
  ];
  for (const req of required) {
    let out = '';
    try { out = execFileSync(req.cmd, req.args, { encoding: 'utf8' }); }
    catch { throw new Error(`${req.name} not found. Install it first.`); }
    const version = out.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? '0';
    if (!atLeast(version, req.min)) {
      throw new Error(`${req.name} ${version} is older than the required ${req.min}`);
    }
    console.log(`  ok  ${req.name} ${version}`);
  }
}

async function cloneRepositories(opts: Options): Promise<void> {
  console.log('\nCloning repositories...');
  mkdirSync(WORK_DIR, { recursive: true });
  for (const repo of TEAM_REPOS[opts.team]) {
    const repoPath = join(WORK_DIR, repo);
    if (existsSync(repoPath)) { console.log(`  skip  ${repo} already exists`); continue; }
    if (!opts.dryRun) execFileSync('git', ['clone', `git@github.com:company/${repo}.git`, repoPath], { stdio: 'pipe' });
    console.log(`  ok  ${repo}`);
  }
}

async function installAndConfigure(opts: Options): Promise<void> {
  console.log('\nInstalling dependencies and local env files...');
  for (const repo of TEAM_REPOS[opts.team]) {
    const cwd = join(WORK_DIR, repo);
    if (!existsSync(join(cwd, 'package.json')) || opts.dryRun) continue;
    execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'pipe' });
    const example = join(cwd, '.env.example');
    const local = join(cwd, '.env.local');
    if (existsSync(example) && !existsSync(local)) copyFileSync(example, local);
    console.log(`  ok  ${repo} (dependencies installed, .env.local ready)`);
  }
}

async function startServices(opts: Options): Promise<void> {
  console.log('\nStarting PostgreSQL and Redis...');
  if (!opts.dryRun) compose('up', '-d', '--wait');
  console.log('  ok  services healthy');
}

async function provisionDatabases(opts: Options): Promise<void> {
  console.log('\nProvisioning databases...');
  if (opts.dryRun) return;
  const psql = (sql: string) =>
    compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-tAc', sql).toString().trim();
  if (psql("SELECT 1 FROM pg_database WHERE datname = 'app_dev'") !== '1') {
    psql('CREATE DATABASE app_dev');
  }
  const cwd = join(WORK_DIR, 'api-gateway');
  if (existsSync(cwd)) {
    execFileSync('pnpm', ['run', 'db:migrate'], { cwd, stdio: 'pipe' });
    execFileSync('pnpm', ['run', 'db:seed'], { cwd, stdio: 'pipe' });
  }
  console.log('  ok  app_dev created, migrated and seeded');
}

const program = new Command()
  .name('devsetup')
  .description('Automated developer environment setup')
  .version('2.0.0');

program
  .command('init')
  .description('Full environment setup for a new developer')
  .option('--team <team>', `your team (${Team.options.join('|')})`)
  .option('--skip-docker', 'skip Docker services and databases')
  .option('--dry-run', 'show what would be done without doing it')
  .action(async (raw) => {
    const parsed = InitOptions.safeParse(raw);
    if (!parsed.success) {
      console.error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      process.exit(2);
    }
    const opts = parsed.data;
    const steps: SetupStep[] = [
      checkPrerequisites, cloneRepositories, installAndConfigure,
      ...(opts.skipDocker ? [] : [startServices, provisionDatabases]),
    ];
    for (const step of steps) {
      try {
        await step(opts);
      } catch (err) {
        console.error(`\nFailed: ${(err as Error).message}`);
        console.error('Run `devsetup doctor` to diagnose issues');
        process.exit(1);
      }
    }
    console.log('\nSetup finished. Run `devsetup doctor` to verify.');
  });

program
  .command('doctor')
  .description('Diagnose common setup issues')
  .action(() => {
    const diagnostics: Array<[string, () => void]> = [
      ['Docker daemon running', () => { execFileSync('docker', ['info'], { stdio: 'pipe' }); }],
      ['PostgreSQL ready', () => { compose('exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres'); }],
      ['Redis ready', () => { compose('exec', '-T', 'redis', 'redis-cli', 'ping'); }],
      ['Free disk space > 10 GB', () => {
        const s = statfsSync(homedir());
        const gb = (s.bavail * s.bsize) / 1024 ** 3;
        if (gb < 10) throw new Error(`only ${gb.toFixed(1)} GB free`);
      }],
    ];
    for (const [name, check] of diagnostics) {
      try {
        check();
        console.log(`ok    ${name}`);
      } catch (e) {
        console.log(`FAIL  ${name}: ${(e as Error).message.split('\n')[0]}`);
        process.exitCode = 1;
      }
    }
  });

await program.parseAsync();
```

Cloning uses the developer's own SSH key and GitHub access (`git@github.com:company/...`), so the tool never handles credentials itself; if the key is missing, `git clone` fails and the tool reports that error. Commander's `parse()` does not wait for async actions, so the program ends with `parseAsync()`. Port conflicts are left to Compose's own error message.

## Step 4: Keep the Tool Working with CI

A scheduled workflow type-checks the tool and runs the dry run on a clean runner, so a removed Node version or renamed flag fails in CI before a new hire hits it.

```yaml
# .github/workflows/devsetup.yml
name: devsetup
on:
  pull_request:
  schedule:
    - cron: "0 6 * * 1"
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm install -g pnpm@10
      - run: npm ci
      - run: npx tsc --noEmit
      - run: docker compose -f docker/dev-services.yml up -d --wait
      - run: npx tsx src/devsetup.ts init --team platform --dry-run
      - run: docker compose -f docker/dev-services.yml down -v
        if: always()
```

The dry run still executes the prerequisite check, which is why pnpm is installed first. The compose step proves that the services file actually starts and passes its healthchecks.

## Real-World Example

On a hypothetical 40-service team, a new backend engineer clones the platform repo, runs `npx tsx src/devsetup.ts init --team backend`, and the tool stops at the prerequisite check because pnpm is missing. She installs it, reruns, and the second run skips the clones that already finished. `devsetup doctor` then reports a full disk on her laptop, which previously would have surfaced as an obscure `pnpm install` failure two hours in.

The numbers to track are the team's own: minutes from laptop to first green test run, and setup questions asked in Slack in the first week.

## Related Skills

- [typescript](/skills/typescript) — strict typing for the CLI and the `tsc --noEmit` check
- [commander](/skills/commander) — commands, options and `parseAsync()`
- [docker-helper](/skills/docker-helper) — the Compose file with healthchecks, loopback-only ports and the PostgreSQL 18 volume path
- [zod](/skills/zod) — validates the team and flags before they choose a repo list
- [github-actions](/skills/github-actions) — the workflow that keeps the tool itself from rotting
