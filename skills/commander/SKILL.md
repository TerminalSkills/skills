---
name: commander
description: >-
  Build CLI tools with Commander.js. Use when creating command-line
  applications, parsing arguments, implementing subcommands, or building
  developer tools with flags and options.
license: Apache-2.0
compatibility: 'Node.js 22.12+ for commander 15; Node.js 20+ for commander 14'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/tj/commander.js
  tags: [commander, cli, nodejs, developer-tools, terminal]
---

# Commander.js

## Overview

Commander is a widely used Node.js library for building command-line tools. It parses arguments and options, defines subcommands, generates `--help` and `--version` output, and reports usage errors with a non-zero exit code. The current release is 15 (May 2026): it is ESM-only and needs Node.js 22.12 or newer, which lets CommonJS code load it with `require()`. Commander 14 supports Node.js 20+.

## Instructions

### Step 1: Install
```bash
npm install commander
# optional, stronger TypeScript inference for opts and action arguments:
npm install @commander-js/extra-typings
```
Use `"type": "module"` in `package.json` (or `.mjs` files) for the `import` syntax below. On Node 20, install `commander@14`.

### Step 2: Basic CLI

```typescript
// src/cli.ts — CLI with commands and options
import { Command } from 'commander'
import { createProject, deploy, confirm } from './actions.js'  // your own code

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

await program.parseAsync()
```

Use `parseAsync()` (not `parse()`) when any action is async, so rejected promises propagate. Action handlers receive the declared arguments first, then the options object, then the command: `.action((name, opts, command) => …)`.

### Step 3: Package setup

```json
{
  "name": "mytools",
  "type": "module",
  "bin": { "mytools": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts"
  }
}
```
The built `dist/cli.js` needs `#!/usr/bin/env node` as its first line (keep it at the top of `src/cli.ts`).

```bash
npx tsx src/cli.ts init my-project --template react   # development
npm link && mytools deploy --env staging               # after build
mytools --help
```

## Examples

### Example 1: Option rules the user asks about
**Request:** "Make `--env` required and limited to staging or production."

```typescript
import { Command, Option } from 'commander'

new Command('deploy')
  .addOption(new Option('-e, --env <environment>', 'target').choices(['staging', 'production']).makeOptionMandatory())
  .action((opts) => console.log(`deploying to ${opts.env}`))
  .parse(['node', 'mytools', '--env', 'qa'])
```
Result: Commander prints `error: option '-e, --env <environment>' argument 'qa' is invalid. Allowed choices are staging, production.` and exits with code 1.

### Example 2: Variadic arguments and camelCase options
**Request:** "`mytools lint src tests --max-warnings 5` should give me the folders and the number."

```typescript
program
  .command('lint')
  .argument('<folders...>', 'folders to lint')
  .option('--max-warnings <count>', 'allowed warnings', (v) => parseInt(v, 10), 0)
  .action((folders, opts) => {
    console.log(folders, opts.maxWarnings)   // [ 'src', 'tests' ] 5
  })
```
Multi-word flags become camelCase properties (`--max-warnings` becomes `opts.maxWarnings`); the third argument to `.option()` is a parser, the fourth the default.

## Guidelines

- Commander generates `--help` from your definitions; add `.description()` to every command and option.
- Required positionals use `<name>`, optional use `[name]`, a variadic goes last (`<names...>`). Use `.requiredOption()` for mandatory flags.
- `--no-git` alone defines a boolean that defaults to `true` and becomes `false` when passed. In commander 15, defining both `--git` and `--no-git` no longer sets an implicit default; set it yourself if you need one.
- Since commander 14, extra positional arguments are an error by default; call `.allowExcessArguments()` if you want the old behavior.
- Usage errors exit with code 1 automatically. Use `.exitOverride()` to get a `CommanderError` instead of an exit, which helps in tests.
- Subcommands can also live in separate executables (`mytools-deploy`) via `.command('deploy', 'description')`.
- For interactive prompts, pair with `@inquirer/prompts` or `@clack/prompts`.
