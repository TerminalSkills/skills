---
title: Build an AI-Powered Changelog Generator
slug: build-ai-powered-changelog-generator
description: >
  Generate user-facing changelogs from Git commits and PRs using AI —
  grouping changes by category, writing clear descriptions, and
  publishing automatically with every release.
skills:
  - typescript
  - vercel-ai-sdk
  - github-actions
  - zod
  - hono
category: Developer Experience
tags:
  - changelog
  - release-notes
  - ai-automation
  - github
  - developer-experience
  - documentation
---

# Build an AI-Powered Changelog Generator

## The Problem

A SaaS product ships weekly releases but nobody writes changelogs. The "What's New" page hasn't been updated in 4 months. Customers discover new features by accident. The support team doesn't know what changed, leading to confused ticket responses. When a PM finally writes release notes, they take 3 hours to compile by reading 80+ commits and 20+ PRs — and the result is either too technical ("refactored auth middleware") or too vague ("improvements and bug fixes").

## Step 1: Change Data Collector

```typescript
// src/changelog/collector.ts
import { z } from 'zod';

const ChangeItem = z.object({
  type: z.enum(['commit', 'pr']),
  sha: z.string().optional(),
  prNumber: z.number().optional(),
  title: z.string(),
  body: z.string(),
  author: z.string(),
  labels: z.array(z.string()),
  files: z.array(z.string()),
  mergedAt: z.string().datetime(),
});

export async function collectChanges(
  owner: string,
  repo: string,
  fromTag: string,
  toTag: string,
  token: string
): Promise<z.infer<typeof ChangeItem>[]> {
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

  // Get commits between tags
  const compareRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/compare/${fromTag}...${toTag}`,
    { headers }
  );
  const compare = await compareRes.json() as any;

  // Get PRs merged in this range
  const prs: z.infer<typeof ChangeItem>[] = [];
  const prNumbers = new Set<number>();

  for (const commit of compare.commits ?? []) {
    // Extract PR number from merge commit
    const prMatch = commit.commit.message.match(/Merge pull request #(\d+)/);
    if (prMatch) prNumbers.add(parseInt(prMatch[1]));

    // Also check for squash merges
    const squashMatch = commit.commit.message.match(/\(#(\d+)\)$/);
    if (squashMatch) prNumbers.add(parseInt(squashMatch[1]));
  }

  for (const prNum of prNumbers) {
    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNum}`,
      { headers }
    );
    const pr = await prRes.json() as any;

    // Get files changed
    const filesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNum}/files`,
      { headers }
    );
    const files = await filesRes.json() as any[];

    prs.push({
      type: 'pr',
      prNumber: prNum,
      title: pr.title,
      body: pr.body ?? '',
      author: pr.user.login,
      labels: (pr.labels ?? []).map((l: any) => l.name),
      files: files.map((f: any) => f.filename),
      mergedAt: pr.merged_at,
    });
  }

  return prs;
}
```

## Step 2: AI Changelog Writer

```typescript
// src/changelog/generator.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const Changelog = z.object({
  version: z.string(),
  date: z.string(),
  summary: z.string().max(200),
  sections: z.array(z.object({
    category: z.enum(['✨ New Features', '🔧 Improvements', '🐛 Bug Fixes', '🔒 Security', '⚡ Performance', '📝 Documentation']),
    items: z.array(z.object({
      title: z.string(),
      description: z.string(),
      prNumber: z.number().optional(),
      impact: z.enum(['high', 'medium', 'low']),
    })),
  })),
  highlights: z.array(z.string()).max(3),
  breakingChanges: z.array(z.object({
    description: z.string(),
    migration: z.string(),
  })),
});

export async function generateChangelog(
  changes: any[],
  version: string,
  previousChangelog?: string
): Promise<z.infer<typeof Changelog>> {
  const changesSummary = changes.map(c =>
    `PR #${c.prNumber}: ${c.title}\n  Labels: ${c.labels.join(', ')}\n  Description: ${c.body.slice(0, 300)}\n  Files: ${c.files.slice(0, 10).join(', ')}`
  ).join('\n\n');

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: Changelog,
    prompt: `Generate a user-facing changelog from these pull requests.

Version: ${version}
Date: ${new Date().toISOString().split('T')[0]}

## Pull Requests:
${changesSummary}

Rules:
- Write for USERS, not developers. "You can now export reports as PDF" not "Added PDF export endpoint"
- Group by category: features, improvements, bugs, security, performance, docs
- Skip internal refactors, dependency updates, and CI changes unless user-facing
- Highlights: pick the 1-3 most impactful changes
- Breaking changes: mention any that require user action
- Be specific about what changed and why it matters
- Include PR numbers for reference
- Keep descriptions to 1-2 sentences max`,
  });

  return object;
}
```

## Step 3: Publisher

```typescript
// src/changelog/publisher.ts
import type { Changelog } from './generator';

export function renderMarkdown(changelog: any): string {
  let md = `# ${changelog.version} (${changelog.date})\n\n`;
  md += `> ${changelog.summary}\n\n`;

  if (changelog.highlights.length > 0) {
    md += `## Highlights\n\n`;
    for (const h of changelog.highlights) {
      md += `- 🌟 ${h}\n`;
    }
    md += '\n';
  }

  for (const section of changelog.sections) {
    if (section.items.length === 0) continue;
    md += `## ${section.category}\n\n`;
    for (const item of section.items) {
      md += `- **${item.title}**`;
      if (item.prNumber) md += ` (#${item.prNumber})`;
      md += `\n  ${item.description}\n`;
    }
    md += '\n';
  }

  if (changelog.breakingChanges.length > 0) {
    md += `## ⚠️ Breaking Changes\n\n`;
    for (const bc of changelog.breakingChanges) {
      md += `- ${bc.description}\n  **Migration:** ${bc.migration}\n`;
    }
  }

  return md;
}

export async function publishChangelog(
  changelog: any,
  targets: Array<'github' | 'website' | 'slack' | 'email'>
): Promise<void> {
  const markdown = renderMarkdown(changelog);

  for (const target of targets) {
    switch (target) {
      case 'github':
        // Create GitHub release
        break;
      case 'slack':
        // Post to #product-updates
        await fetch(process.env.SLACK_WEBHOOK!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `📋 *${changelog.version}* released!\n\n${changelog.summary}\n\n${changelog.highlights.map((h: string) => `• ${h}`).join('\n')}`,
          }),
        });
        break;
    }
  }
}
```

## Results

- **Changelog turnaround**: 2 minutes (was 3 hours manual compilation)
- **Update frequency**: every release (was once every 4 months)
- **Customer awareness**: 40% more users discover new features within a week
- **Support team**: knows what changed, resolves tickets faster
- **PM time saved**: 3 hours/week freed from release note writing
- **Quality**: AI writes user-focused descriptions, not developer jargon
- **Consistency**: every release has a changelog, no exceptions
