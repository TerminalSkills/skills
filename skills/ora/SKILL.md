---
name: ora
description: >-
  Add terminal spinners with Ora. Use when showing loading indicators in CLI
  tools, displaying progress during async operations, or building polished
  command-line interfaces with status feedback.
license: Apache-2.0
compatibility: 'Node.js 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [ora, cli, spinner, loading, terminal]
---

# Ora

## Overview

Ora creates elegant terminal spinners. Show progress during async operations (API calls, file processing, builds), then succeed/fail with a final status. Used by create-next-app, Vercel CLI, Angular CLI.

## Instructions

### Step 1: Basic Spinner

```typescript
import ora from 'ora'

const spinner = ora('Installing dependencies...').start()

try {
  await exec('npm install')
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

## Guidelines

- `succeed()` / `fail()` / `warn()` / `info()` stop the spinner with a status icon.
- `stopAndPersist()` for custom symbols/text when the built-in statuses don't fit.
- Update `spinner.text` during long operations to show progress.
- Ora is ESM-only since v6. Use `import ora from 'ora'`.
- In CI environments, ora falls back to static text (no animation).
