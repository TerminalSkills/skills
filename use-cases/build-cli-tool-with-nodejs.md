---
title: Build a Production CLI Tool with Node.js
slug: build-cli-tool-with-nodejs
description: >-
  Build a professional CLI tool using Commander.js for argument parsing,
  interactive prompts with inquirer, beautiful output with chalk/ora, and
  publish to npm. Complete with testing and CI/CD.
skills:
  - commander
  - semantic-release
  - vitest
category: developer-tools
tags:
  - cli
  - nodejs
  - npm
  - command-line
  - tools
---

# Build a Production CLI Tool with Node.js

Luka maintains a dozen microservices. Every time he sets up a new service, he copies boilerplate files, edits configs, creates a GitHub repo, sets up CI — the same 20 steps every time. He decides to build a CLI tool that automates this, publishable on npm so his team can use it too.

## Step 1: Project Structure

```bash
mkdir create-service && cd create-service
npm init -y
npm install commander inquirer chalk ora fs-extra
npm install -D typescript tsx vitest @types/node @types/inquirer
```

```typescript
// src/cli.ts — Main CLI entry point
#!/usr/bin/env node
import { Command } from 'commander'
import { createService } from './commands/create'
import { listTemplates } from './commands/templates'

const program = new Command()

program
  .name('create-service')
  .description('Scaffold microservices with best practices')
  .version('1.0.0')

program
  .command('new')
  .description('Create a new microservice')
  .argument('[name]', 'service name')
  .option('-t, --template <type>', 'service template')
  .option('-d, --directory <path>', 'output directory', '.')
  .option('--no-git', 'skip git initialization')
  .option('--no-install', 'skip npm install')
  .action(createService)

program
  .command('templates')
  .description('List available templates')
  .action(listTemplates)

program.parse()
```

## Step 2: Interactive Command

When the user runs `create-service new` without arguments, the CLI prompts interactively. When they provide arguments, it runs non-interactively — important for CI/CD usage.

```typescript
// src/commands/create.ts — Interactive service creation
import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import { TEMPLATES } from '../templates'

interface CreateOptions {
  template?: string
  directory: string
  git: boolean
  install: boolean
}

export async function createService(name: string | undefined, options: CreateOptions) {
  // Interactive mode if arguments are missing
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Service name:',
      when: !name,
      validate: (input) => /^[a-z0-9-]+$/.test(input) || 'Use lowercase letters, numbers, and hyphens',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Template:',
      choices: Object.keys(TEMPLATES).map(key => ({
        name: `${TEMPLATES[key].name} — ${TEMPLATES[key].description}`,
        value: key,
      })),
      when: !options.template,
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Additional features:',
      choices: [
        { name: 'Docker + docker-compose', value: 'docker', checked: true },
        { name: 'GitHub Actions CI', value: 'ci', checked: true },
        { name: 'Health check endpoint', value: 'health', checked: true },
        { name: 'OpenTelemetry tracing', value: 'otel' },
        { name: 'Prisma database', value: 'prisma' },
      ],
    },
  ])

  const serviceName = name || answers.name
  const template = options.template || answers.template
  const targetDir = path.join(options.directory, serviceName)

  console.log('')
  console.log(chalk.bold(`Creating ${chalk.cyan(serviceName)} with ${chalk.yellow(template)} template`))
  console.log('')

  // Scaffold project
  const spinner = ora('Copying template files...').start()
  await fs.copy(TEMPLATES[template].path, targetDir)
  await processTemplateVariables(targetDir, { name: serviceName, template })
  spinner.succeed('Template files copied')

  // Add selected features
  for (const feature of answers.features || []) {
    const featureSpinner = ora(`Adding ${feature}...`).start()
    await addFeature(targetDir, feature, serviceName)
    featureSpinner.succeed(`Added ${feature}`)
  }

  // Initialize git
  if (options.git) {
    const gitSpinner = ora('Initializing git...').start()
    execSync('git init && git add -A && git commit -m "Initial commit"', { cwd: targetDir })
    gitSpinner.succeed('Git initialized')
  }

  // Install dependencies
  if (options.install) {
    const installSpinner = ora('Installing dependencies...').start()
    execSync('npm install', { cwd: targetDir, stdio: 'pipe' })
    installSpinner.succeed('Dependencies installed')
  }

  console.log('')
  console.log(chalk.green.bold('✓ Service created successfully!'))
  console.log('')
  console.log(`  ${chalk.bold('cd')} ${serviceName}`)
  console.log(`  ${chalk.bold('npm run dev')}`)
  console.log('')
}
```

## Step 3: Template Engine

```typescript
// src/templates/index.ts — Template definitions
export const TEMPLATES = {
  'express-api': {
    name: 'Express API',
    description: 'REST API with Express, TypeScript, and Zod validation',
    path: path.join(__dirname, '../../templates/express-api'),
  },
  'fastify-api': {
    name: 'Fastify API',
    description: 'High-performance API with Fastify and JSON Schema',
    path: path.join(__dirname, '../../templates/fastify-api'),
  },
  'worker': {
    name: 'Background Worker',
    description: 'BullMQ worker for async job processing',
    path: path.join(__dirname, '../../templates/worker'),
  },
  'grpc': {
    name: 'gRPC Service',
    description: 'gRPC service with Protocol Buffers',
    path: path.join(__dirname, '../../templates/grpc'),
  },
}

// Process {{variables}} in template files
async function processTemplateVariables(dir: string, vars: Record<string, string>) {
  const files = await fs.readdir(dir, { recursive: true })
  for (const file of files) {
    const filePath = path.join(dir, file as string)
    if ((await fs.stat(filePath)).isFile()) {
      let content = await fs.readFile(filePath, 'utf-8')
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(`{{${key}}}`, value)
      }
      await fs.writeFile(filePath, content)
    }
  }
}
```

## Step 4: Testing

```typescript
// tests/create.test.ts — CLI command tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'

const TEST_DIR = path.join(__dirname, '../.test-output')

beforeEach(() => fs.ensureDir(TEST_DIR))
afterEach(() => fs.remove(TEST_DIR))

describe('create-service new', () => {
  it('should create a project with express-api template', () => {
    execSync(
      `npx tsx src/cli.ts new test-api -t express-api -d ${TEST_DIR} --no-install --no-git`,
      { stdio: 'pipe' }
    )

    const projectDir = path.join(TEST_DIR, 'test-api')
    expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'src/server.ts'))).toBe(true)

    const pkg = fs.readJsonSync(path.join(projectDir, 'package.json'))
    expect(pkg.name).toBe('test-api')
  })

  it('should include docker files when docker feature is selected', () => {
    execSync(
      `npx tsx src/cli.ts new test-svc -t express-api -d ${TEST_DIR} --no-install --no-git`,
      { stdio: 'pipe' }
    )

    const projectDir = path.join(TEST_DIR, 'test-svc')
    expect(fs.existsSync(path.join(projectDir, 'Dockerfile'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'docker-compose.yml'))).toBe(true)
  })
})
```

## Step 5: Publish to npm

```json
// package.json — Ready for npm publishing
{
  "name": "create-service",
  "version": "0.0.0-development",
  "description": "Scaffold microservices with best practices",
  "bin": { "create-service": "./dist/cli.js" },
  "files": ["dist", "templates"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["cli", "microservice", "scaffold", "template"]
}
```

## Results

Luka publishes v1.0.0 to npm. His team runs `npx create-service new` and gets a fully scaffolded microservice in 30 seconds — with Docker, CI, health checks, and the team's conventions baked in. Setting up a new service went from a 45-minute copy-paste-edit ritual to a single command. The CLI gets 200 downloads in the first month from the team and a few external users who found it on npm. The interactive mode makes it beginner-friendly, while the flag-based mode works in CI scripts for automated service generation.
