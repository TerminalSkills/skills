---
name: commander
description: >-
  Build CLI tools with Commander.js. Use when a user asks to create a command-line
  tool, parse CLI arguments, add subcommands, build a CLI with options and flags,
  or scaffold a Node.js CLI application.
license: Apache-2.0
compatibility: 'Node.js 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: developer-tools
  tags:
    - commander
    - cli
    - nodejs
    - command-line
    - tools
---

# Commander.js

## Overview

Commander.js is the standard library for building Node.js CLI tools. It handles argument parsing, subcommands, options, help text generation, and input validation. Used by Vue CLI, TypeScript, ESLint, and hundreds of popular tools.

## Instructions

### Step 1: Basic CLI

```typescript
// cli.ts — Simple CLI tool
import { Command } from 'commander'

const program = new Command()

program
  .name('mytool')
  .description('A CLI tool for managing projects')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize a new project')
  .argument('<name>', 'project name')
  .option('-t, --template <type>', 'project template', 'default')
  .option('--no-git', 'skip git initialization')
  .action((name, options) => {
    console.log(`Creating project: ${name}`)
    console.log(`Template: ${options.template}`)
    if (options.git) initGit()
  })

program
  .command('deploy')
  .description('Deploy to production')
  .option('-e, --env <environment>', 'target environment', 'staging')
  .option('--dry-run', 'preview without deploying')
  .action((options) => {
    if (options.dryRun) console.log('[DRY RUN]')
    console.log(`Deploying to ${options.env}...`)
  })

program.parse()
```

### Step 2: package.json Setup

```json
// package.json — Make it installable as a CLI
{
  "name": "mytool",
  "version": "1.0.0",
  "bin": { "mytool": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx cli.ts"
  }
}
```

```bash
# Use locally
npx tsx cli.ts init my-project --template react

# Install globally
npm link
mytool init my-project --template react
mytool deploy --env production --dry-run
```

### Step 3: Interactive Prompts

```typescript
// Combine Commander with inquirer for interactive prompts
import inquirer from 'inquirer'

program
  .command('config')
  .description('Configure settings interactively')
  .action(async () => {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'apiUrl', message: 'API URL:', default: 'https://api.example.com' },
      { type: 'list', name: 'format', message: 'Output format:', choices: ['json', 'yaml', 'toml'] },
      { type: 'confirm', name: 'save', message: 'Save to config file?' },
    ])
    console.log(answers)
  })
```

## Guidelines

- Commander auto-generates `--help` from command descriptions and options.
- Use `.argument()` for required positional args, `.option()` for named flags.
- Add `#!/usr/bin/env node` at the top of entry file for global CLI usage.
- For beautiful CLI output, combine with chalk (colors) and ora (spinners).
