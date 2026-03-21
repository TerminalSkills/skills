---
title: "Build an AI Documentation Generator"
description: "Automatically generate JSDoc, docstrings, changelogs, and full MDX documentation sites from your codebase using Claude. No more docs debt."
skills: [anthropic-sdk, github-actions]
difficulty: intermediate
time_estimate: "5 hours"
tags: [documentation, ai, claude, jsdoc, mdx, nextra, changelog, openapi, github-actions]
---

# Build an AI Documentation Generator

**Persona:** You're on a 4-person dev team shipping fast. Documentation is always "we'll do it later." Six months in, nobody knows how the auth module works. You need docs that write themselves — on every push.

---

## What You'll Build

- **Code parser:** extract TypeScript/Python functions, classes, and types
- **AI docstring generator:** Claude writes JSDoc/docstrings per function
- **MDX docs site:** Nextra-powered, auto-generated from source
- **AI changelog:** summarize Git commits into human-readable release notes
- **OpenAPI reference:** extract from schema, generate readable docs
- **GitHub Actions pipeline:** runs on every push to `main`

---

## Step 1: Parse TypeScript Source

```ts
// scripts/parse-ts.ts
import { Project, SyntaxKind } from 'ts-morph';

export function extractFunctions(filePath: string) {
  const project = new Project();
  const source = project.addSourceFileAtPath(filePath);

  return source.getFunctions().map(fn => ({
    name: fn.getName(),
    params: fn.getParameters().map(p => ({
      name: p.getName(),
      type: p.getType().getText(),
    })),
    returnType: fn.getReturnType().getText(),
    body: fn.getBodyText()?.slice(0, 500), // first 500 chars for context
    existingDoc: fn.getJsDocs().map(d => d.getComment()).join('\n'),
  }));
}
```

Install: `npm install ts-morph`

---

## Step 2: Generate Docs with Claude

```ts
// scripts/generate-docs.ts
import Anthropic from '@anthropic-ai/sdk';
import { extractFunctions } from './parse-ts';

const client = new Anthropic();

export async function generateJSDoc(fn: ReturnType<typeof extractFunctions>[0]) {
  if (fn.existingDoc) return fn.existingDoc; // skip if already documented

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Write a JSDoc comment for this TypeScript function. Be concise but complete. Include @param, @returns, and @example.

Function name: ${fn.name}
Parameters: ${fn.params.map(p => `${p.name}: ${p.type}`).join(', ')}
Return type: ${fn.returnType}
Body snippet: ${fn.body}

Output ONLY the JSDoc comment, starting with /**`,
    }],
  });

  return (message.content[0] as any).text;
}

// Process a whole file
export async function documentFile(filePath: string) {
  const functions = extractFunctions(filePath);
  const results = [];

  for (const fn of functions) {
    const doc = await generateJSDoc(fn);
    results.push({ name: fn.name, doc });
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  return results;
}
```

---

## Step 3: Write Docs Back to Source

```ts
// scripts/inject-docs.ts
import { Project } from 'ts-morph';

export function injectJSDocs(filePath: string, docs: { name: string; doc: string }[]) {
  const project = new Project();
  const source = project.addSourceFileAtPath(filePath);

  for (const { name, doc } of docs) {
    const fn = source.getFunction(name);
    if (!fn || fn.getJsDocs().length > 0) continue;

    // Strip /** and */ markers for ts-morph
    const cleaned = doc.replace(/^\/\*\*\n/, '').replace(/\s*\*\/$/, '');
    fn.addJsDoc(cleaned);
  }

  source.saveSync();
}
```

---

## Step 4: AI-Powered Changelog

```ts
// scripts/generate-changelog.ts
import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function generateChangelog(fromTag: string, toTag = 'HEAD') {
  const commits = execSync(
    `git log ${fromTag}..${toTag} --pretty=format:"%h %s" --no-merges`
  ).toString().trim();

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Convert these Git commits into a human-readable changelog in Markdown.
Group into: ✨ Features, 🐛 Bug Fixes, 🔧 Improvements, 🗑️ Removed.
Skip chores and version bumps.

Commits:
${commits}`,
    }],
  });

  return (message.content[0] as any).text;
}
```

Usage:

```bash
npx ts-node scripts/generate-changelog.ts --from v1.2.0 >> CHANGELOG.md
```

---

## Step 5: Build Nextra Docs Site

```bash
npx create-next-app docs --example https://github.com/shuding/nextra-docs-template
```

Auto-generate MDX pages from documented functions:

```ts
// scripts/build-docs-pages.ts
import { writeFileSync } from 'fs';

export function generateMDXPage(moduleName: string, docs: { name: string; doc: string }[]) {
  const content = `# ${moduleName}\n\n` + docs.map(({ name, doc }) =>
    `## \`${name}\`\n\n\`\`\`\n${doc}\n\`\`\``
  ).join('\n\n');

  writeFileSync(`docs/pages/api/${moduleName.toLowerCase()}.mdx`, content);
}
```

---

## Step 6: GitHub Actions Pipeline

```yaml
# .github/workflows/docs.yml
name: Generate Docs

on:
  push:
    branches: [main]
    paths: ['src/**/*.ts']

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # full history for changelog

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - run: npm ci

      - name: Generate JSDoc
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npx ts-node scripts/document-all.ts

      - name: Generate Changelog
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npx ts-node scripts/generate-changelog.ts --from $(git describe --tags --abbrev=0) >> CHANGELOG.md

      - name: Commit docs
        run: |
          git config user.name "docs-bot"
          git config user.email "bot@yourapp.com"
          git add -A
          git diff --staged --quiet || git commit -m "docs: auto-update [skip ci]"
          git push

      - name: Deploy Nextra to Vercel
        run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
        working-directory: docs
```

---

## Key Outcomes

- Every function documented automatically on push
- Readable changelog generated from Git history
- Nextra docs site deployed to Vercel per release
- Zero manual doc writing for new functions
- Tech debt cleared incrementally via CI
