---
name: ora
description: >-
  Add terminal spinners with Ora. Use when showing loading indicators in CLI
  tools, displaying progress during async operations, or building polished
  command-line interfaces with status feedback.
license: Apache-2.0
compatibility: 'Node.js 20+ (ESM only)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/sindresorhus/ora
  category: development
  tags: [ora, cli, spinner, loading, terminal]
---

# Ora

## Overview

Ora creates elegant terminal spinners. Show progress during async operations (API calls, file processing, builds), then succeed/fail with a final status.

## Instructions

Install with `npm install ora` (current major is 9, which needs Node.js 20 or newer).

### Step 1: Basic Spinner

```typescript
import ora from 'ora'

const spinner = ora('Installing dependencies...').start()

try {
  await exec('npm install')  // your own async helper, e.g. execa
  spinner.succeed('Dependencies installed')
} catch (err) {
  spinner.fail('Installation failed')
  process.exit(1)
}
```

### Step 2: Multi-Step Operations

```typescript
async function deploy(env: string) {
  const spinner = ora()

  spinner.start('Building project...')
  await build()
  spinner.succeed('Build complete')

  spinner.start('Running tests...')
  const results = await runTests()
  spinner.succeed(`${results.passed} tests passed`)

  spinner.start(`Deploying to ${env}...`)
  const url = await deployToCloud(env)
  spinner.succeed(`Deployed to ${url}`)

  spinner.start('Verifying deployment...')
  await healthCheck(url)
  spinner.succeed('Deployment verified ✓')
}
```

### Step 3: With Other Libraries

```typescript
import ora from 'ora'
import chalk from 'chalk'

const spinner = ora({
  text: 'Processing files...',
  color: 'cyan',
  spinner: 'dots',       // or 'line', 'arc', 'bouncingBar'
})

spinner.start()
spinner.text = `Processing ${chalk.bold('image-001.png')}...`
// ... after processing
spinner.text = `Processing ${chalk.bold('image-002.png')}...`

spinner.stopAndPersist({
  symbol: chalk.green('✓'),
  text: `Processed ${chalk.bold('42')} files in ${chalk.gray('3.2s')}`,
})
```

### Step 4: Wrap a Promise

`oraPromise` starts the spinner, then calls `succeed` or `fail` for you:

```typescript
import { oraPromise } from 'ora'

const user = await oraPromise(fetchUser('u_4821'), {
  text: 'Loading user...',
  successText: (u) => `Loaded ${u.email}`,
  failText: (err) => `Could not load user: ${(err as Error).message}`,
})
```

Result in a terminal: a spinner while the request runs, then `✔ Loaded maria@shop.dev`.

## Examples

### "Show a spinner while I copy build artifacts, and keep my log lines readable"

```typescript
import ora from 'ora'

const spinner = ora({ text: 'Copying artifacts...', prefixText: '[build]' }).start()
for (const file of ['app.js', 'app.css', 'index.html']) {
  spinner.text = `Copying ${file}...`
  await copyToDist(file)
  console.log(`copied ${file}`)   // ora clears the spinner, prints, and redraws it
}
spinner.succeed('3 files copied to dist/')
```

### "Make my CLI quiet with --json and in pipes"

```typescript
const spinner = ora({ text: 'Fetching report...', isSilent: process.argv.includes('--json') }).start()
const report = await fetchReport()
spinner.stop()
if (process.argv.includes('--json')) console.log(JSON.stringify(report))
```

`isSilent: true` suppresses the spinner and all of its text; plain `isEnabled: false` still prints the text without animation.

## Guidelines

- `succeed()` / `fail()` / `warn()` / `info()` stop the spinner with a status icon.
- `stopAndPersist()` for custom symbols/text when the built-in statuses don't fit.
- Update `spinner.text` during long operations to show progress.
- Ora is ESM-only (since v6). Use `import ora from 'ora'`; from CommonJS use a dynamic `await import('ora')`.
- Without a TTY (pipes, CI) the spinner is disabled and ora only prints the text. Spinners write to stderr by default, so stdout stays clean for piped output.
- Only one spinner at a time. For parallel tasks use listr2 or spinnies.
- Synchronous work freezes the animation, and ora does not animate inside worker threads: post messages to the main thread and drive the spinner there.
- By default ora puts stdin in raw mode (`discardStdin`); blocking the event loop delays Ctrl+C. Keep work async or set `discardStdin: false`.
- Prompts (inquirer, prompts) conflict with a running spinner: `stop()` it before asking.
