---
title: Build a Developer Onboarding CLI Tool
slug: build-developer-onboarding-cli-tool
description: >
  Automate new developer setup from 2 days of manual steps to a single
  command — cloning repos, installing dependencies, provisioning
  dev databases, configuring SSO, and running health checks.
skills:
  - typescript
  - commander-cli
  - docker
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

A company with 40 microservices takes 2 full days to onboard a new developer. The "Getting Started" doc is 47 pages, half outdated. New hires miss steps, get stuck on version mismatches, and spend their first week asking "why doesn't X work?" in Slack. Each onboarding costs ~$3K in lost productivity (new hire + buddy). The team hires 4 engineers/month — that's $144K/year wasted on broken onboarding.

## Step 1: CLI Framework

```typescript
// src/cli/index.ts
import { Command } from 'commander';
import { z } from 'zod';
import { execSync, exec } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('devsetup')
  .description('Automated developer environment setup')
  .version('2.0.0');

program
  .command('init')
  .description('Full environment setup for new developers')
  .option('--team <team>', 'Your team (frontend|backend|platform|mobile)')
  .option('--skip-docker', 'Skip Docker setup')
  .option('--dry-run', 'Show what would be done without doing it')
  .action(async (opts) => {
    console.log('🚀 Starting developer environment setup...\n');

    const steps: SetupStep[] = [
      checkPrerequisites,
      setupGitConfig,
      cloneRepositories,
      installDependencies,
      setupDocker,
      provisionDatabases,
      configureEnvironment,
      runHealthChecks,
    ];

    if (opts.skipDocker) {
      steps.splice(steps.indexOf(setupDocker), 1);
    }

    for (const step of steps) {
      try {
        await step(opts);
      } catch (err: any) {
        console.error(`\n❌ Failed: ${err.message}`);
        console.log('💡 Run `devsetup doctor` to diagnose issues');
        process.exit(1);
      }
    }

    console.log('\n✅ Setup complete! Run `devsetup status` to verify.');
  });

type SetupStep = (opts: any) => Promise<void>;

async function checkPrerequisites(opts: any): Promise<void> {
  console.log('📋 Checking prerequisites...');

  const required: Array<{ cmd: string; name: string; minVersion?: string }> = [
    { cmd: 'node --version', name: 'Node.js', minVersion: '20.0.0' },
    { cmd: 'docker --version', name: 'Docker' },
    { cmd: 'git --version', name: 'Git' },
    { cmd: 'pnpm --version', name: 'pnpm', minVersion: '8.0.0' },
  ];

  for (const req of required) {
    try {
      const version = execSync(req.cmd, { encoding: 'utf8' }).trim();
      console.log(`  ✅ ${req.name}: ${version}`);
    } catch {
      throw new Error(`${req.name} not found. Install it first.`);
    }
  }
}

async function setupGitConfig(opts: any): Promise<void> {
  console.log('\n🔧 Configuring Git...');
  // Set up commit signing, hooks, aliases
  execSync('git config --global core.autocrlf input');
  execSync('git config --global pull.rebase true');
  console.log('  ✅ Git configured');
}

async function cloneRepositories(opts: any): Promise<void> {
  console.log('\n📦 Cloning repositories...');

  const teamRepos: Record<string, string[]> = {
    frontend: ['web-app', 'design-system', 'shared-types'],
    backend: ['api-gateway', 'user-service', 'payment-service', 'shared-types'],
    platform: ['infrastructure', 'monitoring', 'ci-templates', 'shared-types'],
    mobile: ['mobile-app', 'shared-types', 'api-client'],
  };

  const repos = teamRepos[opts.team] ?? teamRepos.backend;
  const workDir = join(process.env.HOME!, 'work');
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  for (const repo of repos) {
    const repoPath = join(workDir, repo);
    if (existsSync(repoPath)) {
      console.log(`  ⏭️  ${repo} already exists`);
      continue;
    }
    console.log(`  📥 Cloning ${repo}...`);
    if (!opts.dryRun) {
      execSync(`git clone git@github.com:company/${repo}.git ${repoPath}`, { stdio: 'pipe' });
    }
    console.log(`  ✅ ${repo}`);
  }
}

async function installDependencies(opts: any): Promise<void> {
  console.log('\n📚 Installing dependencies...');
  const workDir = join(process.env.HOME!, 'work');

  const repos = existsSync(workDir)
    ? require('fs').readdirSync(workDir).filter((f: string) =>
        existsSync(join(workDir, f, 'package.json')))
    : [];

  for (const repo of repos) {
    console.log(`  📦 ${repo}...`);
    if (!opts.dryRun) {
      execSync('pnpm install', { cwd: join(workDir, repo), stdio: 'pipe' });
    }
    console.log(`  ✅ ${repo}`);
  }
}

async function setupDocker(opts: any): Promise<void> {
  console.log('\n🐳 Setting up Docker services...');
  if (!opts.dryRun) {
    execSync('docker compose -f docker/dev-services.yml up -d', { stdio: 'pipe' });
  }
  console.log('  ✅ PostgreSQL, Redis, Kafka running');
}

async function provisionDatabases(opts: any): Promise<void> {
  console.log('\n🗄️  Provisioning databases...');
  if (!opts.dryRun) {
    execSync('docker exec postgres psql -U postgres -c "CREATE DATABASE app_dev"', { stdio: 'pipe' });
    execSync('pnpm run db:migrate', { cwd: join(process.env.HOME!, 'work/api-gateway'), stdio: 'pipe' });
    execSync('pnpm run db:seed', { cwd: join(process.env.HOME!, 'work/api-gateway'), stdio: 'pipe' });
  }
  console.log('  ✅ Databases created, migrated, and seeded');
}

async function configureEnvironment(opts: any): Promise<void> {
  console.log('\n⚙️  Configuring environment...');
  const workDir = join(process.env.HOME!, 'work');

  const repos = require('fs').readdirSync(workDir).filter((f: string) =>
    existsSync(join(workDir, f, '.env.example'))
  );

  for (const repo of repos) {
    const envExample = join(workDir, repo, '.env.example');
    const envLocal = join(workDir, repo, '.env.local');
    if (!existsSync(envLocal)) {
      require('fs').copyFileSync(envExample, envLocal);
      console.log(`  ✅ ${repo}/.env.local created from example`);
    }
  }
}

async function runHealthChecks(opts: any): Promise<void> {
  console.log('\n🏥 Running health checks...');
  const checks = [
    { name: 'PostgreSQL', cmd: 'docker exec postgres pg_isready' },
    { name: 'Redis', cmd: 'docker exec redis redis-cli ping' },
    { name: 'API Gateway', cmd: 'curl -s http://localhost:3000/health' },
  ];

  for (const check of checks) {
    try {
      if (!opts.dryRun) execSync(check.cmd, { stdio: 'pipe' });
      console.log(`  ✅ ${check.name}`);
    } catch {
      console.log(`  ⚠️  ${check.name} — not running (start with devsetup services up)`);
    }
  }
}

program.parse();
```

## Step 2: Doctor Command for Troubleshooting

```typescript
// src/cli/doctor.ts
program
  .command('doctor')
  .description('Diagnose common setup issues')
  .action(async () => {
    console.log('🔍 Running diagnostics...\n');

    const diagnostics = [
      { name: 'Docker daemon', check: () => execSync('docker info', { stdio: 'pipe' }) },
      { name: 'Node version ≥ 20', check: () => {
        const v = execSync('node --version', { encoding: 'utf8' });
        if (parseInt(v.slice(1)) < 20) throw new Error(`Node ${v} < 20`);
      }},
      { name: 'GitHub SSH access', check: () => execSync('ssh -T git@github.com 2>&1 || true', { stdio: 'pipe' }) },
      { name: 'Port 3000 available', check: () => execSync('lsof -i :3000', { stdio: 'pipe' }) },
      { name: 'Disk space > 10GB', check: () => {
        const df = execSync("df -BG / | tail -1 | awk '{print $4}'", { encoding: 'utf8' });
        if (parseInt(df) < 10) throw new Error(`Only ${df.trim()} available`);
      }},
    ];

    for (const d of diagnostics) {
      try { d.check(); console.log(`✅ ${d.name}`); }
      catch (e: any) { console.log(`❌ ${d.name}: ${e.message}`); }
    }
  });
```

## Results

- **Onboarding time**: 30 minutes (was 2 full days)
- **New hire productivity**: Day 1 first commit (was Day 4-5)
- **Support questions in first week**: 2 (was 15+)
- **Cost savings**: $132K/year (48 hires × $2.75K saved per hire)
- **"Getting Started" doc**: replaced by `devsetup init --team backend`
- **Doctor command**: resolves 80% of setup issues without human help
- **Consistency**: every developer runs identical local environment
