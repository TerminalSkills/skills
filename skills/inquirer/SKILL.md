---
name: inquirer
description: >-
  Build interactive CLI prompts with Inquirer.js. Use when creating
  interactive terminal UIs, multi-step wizards, form-like CLI inputs,
  or configuration generators with user input.
license: Apache-2.0
compatibility: 'Node.js 20.17+, 22.13+ or 23.5+ (ESM)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/SBoudrias/Inquirer.js
  tags: [inquirer, cli, prompts, interactive, terminal]
---

# Inquirer.js

## Overview

Inquirer provides interactive prompts for CLIs — text input, confirmations, lists, checkboxes, passwords, and editors. The current API is the modular `@inquirer/prompts` package (8.x in October 2026): import only the prompts you use, and each supports themes and validation. Besides the ones below there are `search` (async autocomplete), `number`, `expand`, `rawlist` and `editor`. Prompts are async functions that resolve to the answer.

## Instructions

Install with `npm install @inquirer/prompts`. It is ESM-only and needs Node.js `^20.17`, `^22.13` or `>=23.5` (the package's `engines` field), so use `import`, not `require`.

### Step 1: Prompts

```typescript
import { input, select, confirm, checkbox, password, search } from '@inquirer/prompts'

// Text input with validation
const name = await input({
  message: 'Project name:',
  default: 'my-app',
  validate: (v) => v.length >= 2 || 'Name must be at least 2 characters',
})

// Single select
const framework = await select({
  message: 'Choose a framework:',
  choices: [
    { name: 'Next.js', value: 'nextjs', description: 'Full-stack React' },
    { name: 'Remix', value: 'remix', description: 'Web standards focused' },
    { name: 'Astro', value: 'astro', description: 'Content-first' },
    { name: 'Angular', value: 'angular', disabled: '(not available yet)' },
  ],
})

// Multi-select
const features = await checkbox({
  message: 'Select features:',
  choices: [
    { name: 'TypeScript', value: 'typescript', checked: true },
    { name: 'ESLint', value: 'eslint', checked: true },
    { name: 'Tailwind CSS', value: 'tailwind' },
    { name: 'Database (Prisma)', value: 'prisma' },
    { name: 'Auth (NextAuth)', value: 'auth' },
  ],
})

// Confirmation
const proceed = await confirm({ message: 'Create project?', default: true })

// Password (masked)
const apiKey = await password({ message: 'Enter API key:', mask: '*' })

// Async autocomplete: `source` is called on every keystroke, `signal` aborts stale requests
const pkg = await search({
  message: 'Pick an npm package:',
  source: async (term, { signal }) => {
    if (!term) return []
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=10`,
      { signal },
    )
    const { objects } = await res.json()
    return objects.map((o) => ({ name: o.package.name, value: o.package.name, description: o.package.description }))
  },
})
```

### Step 2: Multi-Step Wizard

```typescript
async function setupWizard() {
  console.log('🚀 Project Setup Wizard\n')

  const projectName = await input({ message: 'Project name:' })
  const template = await select({
    message: 'Template:',
    choices: [
      { name: 'SaaS Starter', value: 'saas' },
      { name: 'Blog', value: 'blog' },
      { name: 'E-commerce', value: 'ecommerce' },
    ],
  })

  const features = await checkbox({
    message: 'Features:',
    choices: getFeatureChoices(template),    // dynamic based on template, same { name, value } shape
  })

  const useDocker = await confirm({ message: 'Add Docker?', default: false })

  console.log('\n📋 Summary:')
  console.log(`  Name: ${projectName}`)
  console.log(`  Template: ${template}`)
  console.log(`  Features: ${features.join(', ')}`)

  const ok = await confirm({ message: '\nProceed?', default: true })
  if (!ok) { console.log('Cancelled.'); process.exit(0) }

  return { projectName, template, features, useDocker }
}
```

### Step 3: Ctrl+C, timeouts and non-interactive runs

When the user presses Ctrl+C, the prompt promise rejects with an error named `ExitPromptError`. Catch it, otherwise a stack trace is printed. A second argument (the context) takes an `AbortSignal`; when it fires, the promise rejects with an error named `AbortPromptError`, which needs its own check.

```typescript
import { confirm } from '@inquirer/prompts'

try {
  const deploy = await confirm(
    { message: 'Deploy to production?', default: false },
    { signal: AbortSignal.timeout(30_000) },   // rejects with AbortPromptError after 30 s
  )
  console.log(deploy ? 'Deploying...' : 'Skipped.')
} catch (err) {
  if (err instanceof Error && err.name === 'AbortPromptError') {
    console.log('No answer in 30 s, skipping deploy.')
    process.exit(1)
  }
  if (err instanceof Error && err.name === 'ExitPromptError') {
    console.log('Cancelled.')
    process.exit(130)
  }
  throw err
}
```

## Examples

### Example 1: Ask for a project name and stack

Request: "Make `create-shop` ask for a project name and a framework."

Run the Step 1 `input` and `select` calls in a script. Terminal result: `? Project name: (my-app)` accepts Enter for the default, then `? Choose a framework:` shows a list with the description of the highlighted option below it; the disabled Angular row is greyed out with its reason and cannot be selected. The script then holds `name = 'my-app'` and `framework = 'nextjs'`.

### Example 2: Wizard that also works in CI

Request: "The setup wizard hangs in GitHub Actions; let CI pass answers as flags."

```typescript
const interactive = process.stdin.isTTY && !process.env.CI
const projectName = flags.name ?? (interactive ? await input({ message: 'Project name:' }) : undefined)
if (!projectName) {
  console.error('Missing --name (no TTY available to ask).')
  process.exit(1)
}
```

With `--name=billing-api` the script never prompts; with no flag and no terminal it exits with code 1 and a clear message instead of an `ExitPromptError`.

## Guidelines

- Import individual prompts from `@inquirer/prompts`. The older `inquirer` package (`inquirer.prompt([...])`, v14 in October 2026) is still published but its own docs describe it as maintained, not actively developed; prefer the modular package for new code.
- Use `validate` for input validation — return true or error message string.
- `description` in choices shows hint text below the option name; `disabled: true` or a reason string makes a choice unselectable; `new Separator('-- Databases --')` adds a label row.
- `checkbox` accepts `required: true` to demand at least one selection, and `input` accepts `required`, `pattern` and `patternError` in place of a custom `validate`.
- Set `INQUIRER_KEYBINDINGS=vim` (or `emacs`) to enable alternative navigation keys in list prompts.
- For non-interactive environments (CI, piped stdin), accept config via flags and skip prompts; prompts need a real terminal and fail with `ExitPromptError` otherwise.
- Pair with Commander for argument parsing + Inquirer for interactive mode.
