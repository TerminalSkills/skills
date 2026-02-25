---
title: Build a Developer CLI Tool
slug: build-developer-cli-tool
description: >-
  Build a production CLI tool with Commander for argument parsing, Inquirer
  for interactive prompts, Chalk for styled output, and Ora for spinners.
  Scaffold projects, manage configs, and automate workflows.
skills:
  - commander
  - inquirer
  - chalk-advanced
  - ora
category: development
tags:
  - cli
  - developer-tools
  - nodejs
  - terminal
  - automation
---

# Build a Developer CLI Tool

Dani's team uses the same boilerplate setup for every new microservice — initialize the repo, add TypeScript, configure linting, set up Docker, add CI, connect to the service mesh. It takes 45 minutes and 12 steps. She builds a CLI that does it in 30 seconds.

## Step 1: Command Structure

```typescript
#!/usr/bin/env node
// src/cli.ts — Main CLI entry point
import { Command } from 'commander'
import chalk from 'chalk'

const program = new Command()
  .name('forge')
  .description(chalk.bold('🔥 Forge — Microservice scaffolding tool'))
  .version('2.1.0')

program
  .command('create')
  .description('Create a new microservice')
  .argument('[name]', 'service name')
  .option('-t, --template <type>', 'template (api, worker, gateway)', 'api')
  .option('--no-docker', 'skip Docker setup')
  .option('--no-ci', 'skip CI pipeline')
  .option('-d, --dry-run', 'preview without creating files')
  .action(createCommand)

program
  .command('add <feature>')
  .description('Add a feature to existing service')
  .option('--force', 'overwrite existing files')
  .action(addCommand)

program
  .command('doctor')
  .description('Check development environment')
  .action(doctorCommand)

program.parse()
```

## Step 2: Interactive Wizard

When arguments aren't provided, the CLI becomes interactive — asking questions with styled prompts.

```typescript
// src/commands/create.ts — Create command with interactive fallback
import { input, select, checkbox, confirm } from '@inquirer/prompts'
import chalk from 'chalk'

async function createCommand(name?: string, opts?: CreateOptions) {
  console.log(chalk.bold('\n🔥 Forge — New Microservice\n'))

  // If name not provided as argument, ask interactively
  const serviceName = name || await input({
    message: 'Service name:',
    validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || 'Lowercase alphanumeric with dashes',
  })

  const template = opts?.template || await select({
    message: 'Template:',
    choices: [
      { name: 'REST API', value: 'api', description: 'Express + Prisma + OpenAPI' },
      { name: 'Worker', value: 'worker', description: 'BullMQ job processor' },
      { name: 'Gateway', value: 'gateway', description: 'API Gateway with rate limiting' },
    ],
  })

  const features = await checkbox({
    message: 'Features:',
    choices: [
      { name: 'TypeScript', value: 'typescript', checked: true },
      { name: 'Prisma ORM', value: 'prisma', checked: template === 'api' },
      { name: 'Redis', value: 'redis', checked: template === 'worker' },
      { name: 'OpenTelemetry', value: 'otel' },
      { name: 'Rate Limiting', value: 'ratelimit', checked: template === 'gateway' },
    ],
  })

  const config = { serviceName, template, features, docker: opts?.docker !== false, ci: opts?.ci !== false }

  // Show summary
  console.log(chalk.bold('\n📋 Summary:'))
  console.log(`  Name:     ${chalk.cyan(config.serviceName)}`)
  console.log(`  Template: ${chalk.cyan(config.template)}`)
  console.log(`  Features: ${config.features.map(f => chalk.green(f)).join(', ')}`)
  console.log(`  Docker:   ${config.docker ? chalk.green('yes') : chalk.gray('no')}`)
  console.log(`  CI:       ${config.ci ? chalk.green('yes') : chalk.gray('no')}`)

  if (opts?.dryRun) {
    console.log(chalk.yellow('\n(dry run — no files created)'))
    return
  }

  const proceed = await confirm({ message: '\nCreate service?', default: true })
  if (!proceed) { console.log('Cancelled.'); return }

  await scaffold(config)
}
```

## Step 3: Scaffold with Progress

```typescript
// src/scaffold.ts — Generate project with spinner feedback
import ora from 'ora'
import chalk from 'chalk'

async function scaffold(config: ServiceConfig) {
  const spinner = ora()
  const startTime = Date.now()

  spinner.start('Creating directory structure...')
  await createDirectories(config)
  spinner.succeed('Directory structure created')

  spinner.start('Generating source files...')
  await generateFiles(config)
  spinner.succeed(`${chalk.bold(countFiles(config))} source files generated`)

  if (config.features.includes('prisma')) {
    spinner.start('Setting up Prisma schema...')
    await setupPrisma(config)
    spinner.succeed('Prisma configured')
  }

  if (config.docker) {
    spinner.start('Creating Docker configuration...')
    await createDockerFiles(config)
    spinner.succeed('Dockerfile + docker-compose.yml created')
  }

  if (config.ci) {
    spinner.start('Setting up CI pipeline...')
    await createCIPipeline(config)
    spinner.succeed('GitHub Actions workflow created')
  }

  spinner.start('Installing dependencies...')
  await exec(`cd ${config.serviceName} && npm install`)
  spinner.succeed('Dependencies installed')

  spinner.start('Initializing git repository...')
  await exec(`cd ${config.serviceName} && git init && git add . && git commit -m "Initial commit"`)
  spinner.succeed('Git repository initialized')

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(chalk.bold.green(`\n✓ Service ${chalk.cyan(config.serviceName)} created in ${elapsed}s\n`))
  console.log('  Next steps:')
  console.log(chalk.gray(`  cd ${config.serviceName}`))
  console.log(chalk.gray('  npm run dev'))
  console.log()
}
```

## Step 4: Doctor Command

```typescript
// src/commands/doctor.ts — Environment health check
import ora from 'ora'
import chalk from 'chalk'

async function doctorCommand() {
  console.log(chalk.bold('\n🔍 Checking development environment...\n'))

  const checks = [
    { name: 'Node.js', check: () => execSync('node --version').toString().trim(), min: '18.0.0' },
    { name: 'npm', check: () => execSync('npm --version').toString().trim(), min: '9.0.0' },
    { name: 'Docker', check: () => execSync('docker --version').toString().trim() },
    { name: 'Git', check: () => execSync('git --version').toString().trim() },
    { name: 'PostgreSQL', check: () => execSync('psql --version').toString().trim() },
    { name: 'Redis', check: () => execSync('redis-cli ping').toString().trim() === 'PONG' ? 'Connected' : 'Not responding' },
  ]

  let allGood = true
  for (const { name, check } of checks) {
    const spinner = ora(name).start()
    try {
      const result = check()
      spinner.succeed(`${name}: ${chalk.gray(result)}`)
    } catch {
      spinner.fail(`${name}: ${chalk.red('not found')}`)
      allGood = false
    }
  }

  console.log()
  if (allGood) {
    console.log(chalk.green.bold('✓ All checks passed! Ready to forge.\n'))
  } else {
    console.log(chalk.yellow('⚠ Some tools are missing. Install them before proceeding.\n'))
  }
}
```

## Results

The `forge create` command replaces a 45-minute manual setup with a 30-second interactive wizard. The team creates 12 new microservices in the first month, each with consistent structure, configuration, and CI. The `doctor` command catches environment issues before they become 2-hour debugging sessions — a new developer joins and discovers they're missing Redis in their first minute, not after an hour of "why doesn't it work." The CLI supports both interactive mode (great for exploration) and flag mode (great for scripts and CI: `forge create payment-service --template api --no-ci`).
