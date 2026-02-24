---
name: commander
description: >-
  Build CLI tools with Commander.js. Use when creating command-line
  applications, parsing arguments, implementing subcommands, or building
  developer tools with flags and options.
license: Apache-2.0
compatibility: 'Node.js 14+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [commander, cli, nodejs, developer-tools, terminal]
---

# Commander.js

## Overview

Commander is the standard library for building Node.js CLIs. Parse arguments, define subcommands, generate help text, and handle options. Powers thousands of CLIs including create-react-app, eslint, and prisma.

## Instructions

### Step 1: Basic CLI

```typescript
// cli.ts — CLI with commands and options
import { Command } from 'commander'

const program = new Command()
  .name('mytools')
  .description('Developer productivity toolkit')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize a new project')
  .argument('<name>', 'project name')
  .option('-t, --template <type>', 'project template', 'default')
  .option('--no-git', 'skip git initialization')
  .option('-d, --dry-run', 'show what would be created')
  .action(async (name, opts) => {
    console.log(`Creating project: ${name}`)
    console.log(`Template: ${opts.template}`)
    if (opts.dryRun) { console.log('(dry run)'); return }
    await createProject(name, opts)
  })

program
  .command('deploy')
  .description('Deploy to production')
  .option('-e, --env <environment>', 'target environment', 'production')
  .option('--force', 'skip confirmation')
  .action(async (opts) => {
    if (!opts.force) {
      const ok = await confirm(`Deploy to ${opts.env}?`)
      if (!ok) process.exit(0)
    }
    await deploy(opts.env)
  })

program.parse()
```

### Step 2: Package Setup

```json
{
  "name": "mytools",
  "bin": { "mytools": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts"
  }
}
```

```bash
# Development
npx tsx src/cli.ts init my-project --template react

# After build + npm link
mytools init my-project --template react
mytools deploy --env staging
mytools --help
```

## Guidelines

- Commander auto-generates `--help` from your command definitions.
- Use `argument()` for required positional args, `option()` for flags.
- `--no-*` flags automatically create boolean negations (e.g., `--no-git` → `opts.git === false`).
- Exit codes: 0 for success, 1 for errors. Commander handles parse errors automatically.
- For interactive prompts, pair with Inquirer or @clack/prompts.
