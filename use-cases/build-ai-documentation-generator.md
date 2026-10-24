---
title: "Build an AI Documentation Generator"
description: "Automatically generate JSDoc comments, release notes, and MDX documentation pages from your codebase using Claude. No more docs debt."
skills: [anthropic-sdk, github-actions]
difficulty: intermediate
time_estimate: "5 hours"
tags: [documentation, ai, claude, jsdoc, mdx, nextra, changelog, github-actions]
---

# Build an AI Documentation Generator

**Persona:** You're on a 4-person dev team shipping fast. Documentation is always "we'll do it later." Six months in, nobody knows how the auth module works. You need docs that write themselves — on every push.

---

## What You'll Build

- **Code parser:** extract TypeScript functions, parameters and types with ts-morph
- **AI JSDoc generator:** Claude writes a JSDoc comment for every undocumented function
- **MDX docs site:** Nextra pages generated from the documented functions
- **AI release notes:** Git commits since the last tag summarized into release notes
- **GitHub Actions pipelines:** docs on every push to `main`, release notes on every tag

Scripts run with `npx tsx` and read `ANTHROPIC_API_KEY` from the environment. Install: `npm install ts-morph @anthropic-ai/sdk && npm install -D tsx typescript @types/node`. The model ID used below, `claude-sonnet-5-5`, comes from the Anthropic models overview page; check it there before you copy it, since model IDs are retired over time.

## Step 1: Parse TypeScript Source

```ts
// scripts/parse-ts.ts
import { Project } from 'ts-morph';

export const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

export function extractFunctions(filePath: string) {
  const source = project.getSourceFileOrThrow(filePath);

  return source.getFunctions().filter(fn => fn.getName()).map(fn => ({
    name: fn.getName()!,
    params: fn.getParameters().map(p => ({
      name: p.getName(),
      type: p.getType().getText(),
    })),
    returnType: fn.getReturnType().getText(),
    body: fn.getBodyText()?.slice(0, 500) ?? '', // first 500 chars for context
    hasDoc: fn.getJsDocs().length > 0,
  }));
}
```

A `tsconfig.json` must exist in the project root so ts-morph can resolve types.

## Step 2: Generate Docs with Claude

```ts
// scripts/generate-docs.ts
import Anthropic from '@anthropic-ai/sdk';
import { extractFunctions } from './parse-ts';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Fn = ReturnType<typeof extractFunctions>[number];

export async function generateJSDoc(fn: Fn): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 1024,
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

  const block = message.content.find(b => b.type === 'text');
  if (block?.type !== 'text') throw new Error(`No text returned for ${fn.name}`);
  return block.text.trim();
}

// Document every undocumented function in a file. The SDK retries 429s and 5xx on its own.
export async function documentFile(filePath: string) {
  const results: { name: string; doc: string }[] = [];
  for (const fn of extractFunctions(filePath)) {
    if (fn.hasDoc) continue; // never overwrite human-written docs
    results.push({ name: fn.name, doc: await generateJSDoc(fn) });
  }
  return results;
}
```

## Step 3: Write Docs Back to Source

```ts
// scripts/inject-docs.ts
import { project } from './parse-ts';

export function injectJSDocs(filePath: string, docs: { name: string; doc: string }[]) {
  const source = project.getSourceFileOrThrow(filePath);

  for (const { name, doc } of docs) {
    const fn = source.getFunction(name);
    if (!fn || fn.getJsDocs().length > 0) continue;

    // ts-morph adds the /** */ wrapper itself, so strip the model's and each leading " * "
    const text = doc
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\* ?/, ''))
      .join('\n');
    fn.addJsDoc(text);
  }

  source.saveSync();
}
```

## Step 4: Generate MDX Pages

Create the docs site by following the Nextra "Docs Theme" getting-started guide (Nextra 4 uses the Next.js App Router, where each page is an `app/<route>/page.mdx` file). The old `shuding/nextra-docs-template` still pins Next.js 13, so do not start from it. Put the site in `docs/`, then generate one page per module:

```ts
// scripts/build-docs-pages.ts
import { mkdirSync, writeFileSync } from 'node:fs';

export function generateMDXPage(moduleName: string, docs: { name: string; doc: string }[]) {
  const content = `# ${moduleName}\n\n` + docs.map(({ name, doc }) =>
    `## \`${name}\`\n\n\`\`\`ts\n${doc}\n\`\`\``
  ).join('\n\n') + '\n';

  const dir = `docs/app/api/${moduleName.toLowerCase()}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/page.mdx`, content);
}
```

One script ties the steps together:

```ts
// scripts/document-all.ts
import { project } from './parse-ts';
import { documentFile } from './generate-docs';
import { injectJSDocs } from './inject-docs';
import { generateMDXPage } from './build-docs-pages';

async function main() {
  for (const source of project.getSourceFiles('src/**/*.ts')) {
    const filePath = source.getFilePath();
    const docs = await documentFile(filePath);
    if (docs.length === 0) continue;
    injectJSDocs(filePath, docs);
    generateMDXPage(source.getBaseNameWithoutExtension(), docs);
    console.log(`Documented ${docs.length} functions in ${filePath}`);
  }
}

main();
```

Run it with `npx tsx scripts/document-all.ts`, then review the diff before committing: the model writes from a 500-character body snippet and can describe behavior that is not there.

## Step 5: AI-Written Release Notes

```ts
// scripts/generate-changelog.ts
import { execFileSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function generateChangelog(fromTag: string, toTag = 'HEAD') {
  const commits = execFileSync(
    'git', ['log', `${fromTag}..${toTag}`, '--pretty=format:%h %s', '--no-merges'],
    { encoding: 'utf8' },
  ).trim();

  const message = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Convert these Git commits into a human-readable changelog in Markdown.
Group into: Features, Bug Fixes, Improvements, Removed.
Skip chores and version bumps. Output only the Markdown.

Commits:
${commits}`,
    }],
  });

  const block = message.content.find(b => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

// npx tsx scripts/generate-changelog.ts --from v1.2.0 [--to v1.3.0]
const args = process.argv.slice(2);
const arg = (flag: string) => args[args.indexOf(flag) + 1];
if (args.includes('--from')) {
  generateChangelog(arg('--from'), arg('--to')).then(console.log);
}
```

```bash
npx tsx scripts/generate-changelog.ts --from v1.2.0 > release-notes.md
```

## Step 6: GitHub Actions Pipelines

Docs on every push to `main` that touches source:

```yaml
# .github/workflows/docs.yml
name: Generate Docs

on:
  push:
    branches: [main]
    paths: ['src/**/*.ts']

permissions:
  contents: write

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with: { node-version: '24' }

      - run: npm ci

      - name: Generate JSDoc and MDX pages
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npx tsx scripts/document-all.ts

      - name: Commit docs
        run: |
          git config user.name "docs-bot"
          git config user.email "docs-bot@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "docs: auto-update"
          git push
```

Pushes made with the default `GITHUB_TOKEN` do not trigger new workflow runs, so this does not loop. If `main` is protected, have the job open a pull request instead of pushing. Deploy the `docs/` site with your host's Git integration (Vercel, for example, builds on every push), so no deploy token has to live in CI.

Release notes on every version tag:

```yaml
# .github/workflows/release-notes.yml
name: Release Notes

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0  # full history and tags

      - uses: actions/setup-node@v7
        with: { node-version: '24' }

      - run: npm ci

      - name: Write notes and publish the release
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ github.token }}
        run: |
          PREV=$(git describe --tags --abbrev=0 "${GITHUB_REF_NAME}^")
          npx tsx scripts/generate-changelog.ts --from "$PREV" --to "$GITHUB_REF_NAME" > notes.md
          gh release create "$GITHUB_REF_NAME" --notes-file notes.md
```

The first tag in a repository has no previous tag, so create that release by hand.

## Related Skills

- [anthropic-sdk](/skills/anthropic-sdk)
- [github-actions](/skills/github-actions)
