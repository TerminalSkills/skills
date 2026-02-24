---
name: chalk-advanced
description: >-
  Style terminal output with Chalk. Use when adding colors to CLI output,
  formatting log messages, building styled terminal UIs, or creating
  developer tools with colored output.
license: Apache-2.0
compatibility: 'Node.js 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [chalk, cli, terminal, colors, formatting]
---

# Chalk

## Overview

Chalk styles terminal strings with colors, bold, underline, and backgrounds. ESM-only since v5. Chain styles fluently. Widely used in CLIs for status messages, errors, and formatted output.

## Instructions

### Step 1: Basic Styling

```typescript
import chalk from 'chalk'

console.log(chalk.green('✓ Success'))
console.log(chalk.red.bold('✗ Error: file not found'))
console.log(chalk.yellow('⚠ Warning: deprecated API'))
console.log(chalk.blue.underline('https://example.com'))
console.log(chalk.gray('  (verbose details)'))

// Background colors
console.log(chalk.bgRed.white.bold(' ERROR ') + ' Something went wrong')
console.log(chalk.bgGreen.black.bold(' PASS ') + ' All tests passed')
```

### Step 2: Composable Styles

```typescript
// Define reusable styles
const styles = {
  error: chalk.red.bold,
  success: chalk.green,
  warn: chalk.yellow,
  info: chalk.blue,
  dim: chalk.gray,
  highlight: chalk.cyan.bold,
  label: chalk.bgBlue.white.bold,
}

function log(level: keyof typeof styles, msg: string) {
  const prefix = {
    error: '✗', success: '✓', warn: '⚠', info: 'ℹ', dim: '·', highlight: '→',
  }
  console.log(`${styles[level](prefix[level] || '·')} ${msg}`)
}

log('success', 'Project created')
log('error', 'Build failed')
log('info', `Using ${styles.highlight('TypeScript')} template`)
```

### Step 3: CLI Output Formatting

```typescript
// Table-like output
function printStats(stats: Record<string, number>) {
  const maxKey = Math.max(...Object.keys(stats).map(k => k.length))
  for (const [key, value] of Object.entries(stats)) {
    const label = chalk.gray(key.padEnd(maxKey))
    const val = value > 0 ? chalk.green(value.toString()) : chalk.red(value.toString())
    console.log(`  ${label}  ${val}`)
  }
}

printStats({ 'Files changed': 12, 'Lines added': 847, 'Lines removed': 231, Warnings: 0, Errors: 0 })
```

## Guidelines

- Chalk v5+ is ESM-only. Use `import chalk from 'chalk'`, not require.
- Chalk respects `NO_COLOR` and `FORCE_COLOR` env vars automatically.
- Chain methods: `chalk.red.bold.underline('text')` — order doesn't matter.
- Use template literals: `` chalk`{red Error:} {bold ${message}}` ``
- For complex terminal UIs, combine with ora (spinners) and cli-table3 (tables).
