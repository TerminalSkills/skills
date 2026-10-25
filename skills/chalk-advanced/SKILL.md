---
name: chalk-advanced
description: >-
  Chalk colors and styles text in the terminal with a chainable API for Node.js
  (bold, underline, 16/256/truecolor, backgrounds). Use when adding colors to CLI
  output, formatting log messages, styling errors and warnings, honoring
  --no-color and FORCE_COLOR, or building developer tools with readable output.
license: Apache-2.0
compatibility: "Node.js 22+ for chalk 6; ESM only (chalk 5 supports Node 12.17+, 14.13+, 16+)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/chalk/chalk
  tags: "chalk, cli, terminal, colors, formatting"
---

# Chalk

## Overview

Chalk styles terminal strings with colors, bold, underline and backgrounds. The current release is chalk 6.0.1 (checked 2026-10-24 on npm): ESM only, Node.js 22 or newer. Styles chain (`chalk.red.bold`), and Chalk downsamples truecolor to what the terminal supports. If you must stay on an older Node.js, pin chalk 5 (`npm install chalk@5`); the API shown here is the same. Chalk 4 is the last CommonJS version.

## Instructions

### Step 1: Basic styling

```typescript
import chalk from "chalk";

console.log(chalk.green("✓ Success"));
console.log(chalk.red.bold("✗ Error: file not found"));
console.log(chalk.yellow("⚠ Warning: deprecated API"));
console.log(chalk.blue.underline("https://terminalskills.io"));
console.log(chalk.gray("  (verbose details)"));

console.log(chalk.bgRed.white.bold(" ERROR ") + " Something went wrong");
console.log(chalk.hex("#ff8800").bold("Orange"), chalk.rgb(15, 100, 204)("Blue"), chalk.ansi256(200)("Pink"));
```

### Step 2: Reusable styles

```typescript
const styles = {
  error: chalk.red.bold,
  success: chalk.green,
  warn: chalk.yellow,
  info: chalk.blue,
  highlight: chalk.cyan.bold,
};
const prefix = { error: "✗", success: "✓", warn: "⚠", info: "ℹ" } as const;

function log(level: keyof typeof prefix, msg: string) {
  console.log(`${styles[level](prefix[level])} ${msg}`);
}

log("success", "Project created");
log("info", `Using ${styles.highlight("TypeScript")} template`);
```

### Step 3: Output that is not stdout, and custom levels

```typescript
import chalk, { Chalk, chalkStderr } from "chalk";

console.error(chalkStderr.red("Build failed"));     // color support detected for stderr, not stdout
const plain = new Chalk({ level: 0 });               // never emits color (levels 0-3)
const forced = new Chalk({ level: 3 });              // always truecolor, e.g. for tests
```

### Step 4: Tagged templates

Chalk 5 and later removed the built-in template literal tag. Install the separate package and import its default export:

```bash
npm install chalk-template
```

```typescript
import chalkTemplate from "chalk-template";

console.log(chalkTemplate`{red Error:} {bold ${"config.json not found"}}`);
```

## Examples

### Example 1: Test runner summary

**User request:** "Print a pass/fail summary in my CLI, green for passing counts and red when anything failed."

**Actions:**

```typescript
import chalk from "chalk";

function summary(passed: number, failed: number) {
  const badge = failed === 0 ? chalk.bgGreen.black.bold(" PASS ") : chalk.bgRed.white.bold(" FAIL ");
  console.log(`${badge} ${chalk.green(`${passed} passed`)}, ${failed ? chalk.red(`${failed} failed`) : chalk.gray("0 failed")}`);
}
summary(42, 1);
```

**Result:** `FAIL 42 passed, 1 failed` with a red badge; with output piped to a file, no escape codes are written.

### Example 2: Aligned stats table

**User request:** "Show git-style stats with dim labels and colored values."

**Actions:**

```typescript
import chalk from "chalk";

function printStats(stats: Record<string, number>) {
  const width = Math.max(...Object.keys(stats).map((k) => k.length));
  for (const [key, value] of Object.entries(stats)) {
    console.log(`  ${chalk.gray(key.padEnd(width))}  ${value > 0 ? chalk.green(value) : chalk.red(value)}`);
  }
}
printStats({ "Files changed": 12, "Lines added": 847, Warnings: 0 });
```

**Result:** three aligned rows; counts above zero are green, zero is red.

## Guidelines

- Chalk is ESM only: `import chalk from "chalk"`, not `require`. A CommonJS project must use `chalk@4` or switch to ESM.
- Color detection is automatic and respects the flags `--color`/`--no-color` and `FORCE_COLOR` (`0` disables; `1`, `2`, `3` set the level). Chalk does not read `NO_COLOR` (checked on chalk 6: with `NO_COLOR=1` in a terminal the level stayed 3), so if you want to honor it, set `FORCE_COLOR=0` yourself or create `new Chalk({ level: 0 })` when `process.env.NO_COLOR` is set.
- Piped output (not a TTY) gets level 0 automatically, so logs captured by CI or files stay clean.
- `chalk.level` is global; set it only in your own application, not in a library. Libraries should accept a `Chalk` instance or leave detection alone.
- Style order in a chain does not matter, but later colors override earlier ones.
- The old `` chalk`{red text}` `` syntax does not work in chalk 5 and 6; use `chalk-template`.
- For spinners use `ora`, for tables `cli-table3`; both work with Chalk.
