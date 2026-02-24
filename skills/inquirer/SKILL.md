---
name: inquirer
description: >-
  Build interactive CLI prompts with Inquirer.js. Use when creating
  interactive terminal UIs, multi-step wizards, form-like CLI inputs,
  or configuration generators with user input.
license: Apache-2.0
compatibility: 'Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [inquirer, cli, prompts, interactive, terminal]
---

# Inquirer.js

## Overview

Inquirer provides interactive prompts for CLIs — text input, confirmations, lists, checkboxes, passwords, and editors. The v2 API is modular (import only what you use) and supports themes, validation, and transformations.

## Instructions

### Step 1: Prompts

```typescript
import { input, select, confirm, checkbox, password } from '@inquirer/prompts'

// Text input with validation
const name = await input({
  message: 'Project name:',
  validate: (v) => v.length >= 2 || 'Name must be at least 2 characters',
})

// Single select
const framework = await select({
  message: 'Choose a framework:',
  choices: [
    { name: 'Next.js', value: 'nextjs', description: 'Full-stack React' },
    { name: 'Remix', value: 'remix', description: 'Web standards focused' },
    { name: 'Astro', value: 'astro', description: 'Content-first' },
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
    choices: getFeatureChoices(template),    // dynamic based on template
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

## Guidelines

- Import individual prompts (`@inquirer/prompts`) not the legacy `inquirer` package.
- Use `validate` for input validation — return true or error message string.
- `description` in choices shows hint text below the option name.
- For non-interactive environments (CI), accept config via flags and skip prompts.
- Pair with Commander for argument parsing + Inquirer for interactive mode.
