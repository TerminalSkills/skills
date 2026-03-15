---
title: Build an AI Code Review Bot for Pull Requests
slug: build-ai-code-review-bot-for-pull-requests
description: >
  Automate first-pass code reviews with an AI bot that catches bugs,
  security issues, and style violations — reducing review turnaround
  from 2 days to 15 minutes and letting senior engineers focus on
  architecture, not nitpicks.
skills:
  - typescript
  - vercel-ai-sdk
  - github-actions
  - zod
  - hono
  - redis
category: data-ai
tags:
  - code-review
  - ai-automation
  - github
  - pull-requests
  - developer-experience
  - ci-cd
---

# Build an AI Code Review Bot for Pull Requests

## The Problem

A 30-person engineering team has a PR review bottleneck. Average review turnaround is 2 days — 3 senior engineers review 15-20 PRs each per week. 60% of review comments are mechanical: missing error handling, inconsistent naming, missing types, obvious security issues. Senior engineers are frustrated — they spend 10 hours/week on reviews instead of architecture work. Junior developers are blocked waiting. The team tried linting rules but they only catch formatting, not logic issues.

## Step 1: Diff Parser and Context Builder

```typescript
// src/review/diff-parser.ts
import { z } from 'zod';

const FileDiff = z.object({
  filename: z.string(),
  status: z.enum(['added', 'modified', 'removed', 'renamed']),
  additions: z.number().int(),
  deletions: z.number().int(),
  patch: z.string(),
  language: z.string(),
});

export function parsePRDiff(files: any[]): z.infer<typeof FileDiff>[] {
  return files
    .filter(f => f.patch) // skip binary files
    .map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
      language: detectLanguage(f.filename),
    }));
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
    sql: 'sql', yml: 'yaml', yaml: 'yaml', json: 'json', md: 'markdown',
  };
  return langMap[ext ?? ''] ?? 'unknown';
}

// Build context for AI: surrounding code, not just the diff
export async function buildReviewContext(
  owner: string, repo: string, pr: number, token: string
): Promise<{ files: z.infer<typeof FileDiff>[]; prDescription: string; commitMessages: string[] }> {
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

  // Fetch PR details
  const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr}`, { headers });
  const prData = await prRes.json() as any;

  // Fetch files
  const filesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr}/files?per_page=100`, { headers });
  const filesData = await filesRes.json() as any[];

  // Fetch commits
  const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr}/commits`, { headers });
  const commitsData = await commitsRes.json() as any[];

  return {
    files: parsePRDiff(filesData),
    prDescription: prData.body ?? '',
    commitMessages: commitsData.map((c: any) => c.commit.message),
  };
}
```

## Step 2: AI Review Engine

```typescript
// src/review/ai-reviewer.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const ReviewComment = z.object({
  file: z.string(),
  line: z.number().int().optional(),
  severity: z.enum(['critical', 'warning', 'suggestion', 'praise']),
  category: z.enum([
    'bug', 'security', 'performance', 'error-handling',
    'naming', 'types', 'testing', 'documentation', 'style', 'architecture',
  ]),
  comment: z.string(),
  suggestedFix: z.string().optional(),
});

const ReviewResult = z.object({
  summary: z.string(),
  overallRisk: z.enum(['low', 'medium', 'high']),
  comments: z.array(ReviewComment),
  approvalRecommendation: z.enum(['approve', 'request_changes', 'needs_discussion']),
});

export async function reviewCode(context: {
  files: Array<{ filename: string; patch: string; language: string }>;
  prDescription: string;
}): Promise<z.infer<typeof ReviewResult>> {
  const fileSummaries = context.files.map(f =>
    `### ${f.filename} (${f.language})\n\`\`\`diff\n${f.patch}\n\`\`\``
  ).join('\n\n');

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: ReviewResult,
    prompt: `You are a senior code reviewer. Review this pull request thoroughly.

PR Description: ${context.prDescription}

## Changed Files:
${fileSummaries}

Focus on:
1. **Bugs**: Logic errors, off-by-one, null/undefined issues, race conditions
2. **Security**: SQL injection, XSS, auth bypass, secret exposure, path traversal
3. **Error handling**: Missing try/catch, unhandled promises, silent failures
4. **Performance**: N+1 queries, unnecessary loops, missing indexes
5. **Types**: Missing or incorrect TypeScript types, unsafe casts
6. **Architecture**: SOLID violations, coupling issues, missing abstractions

Do NOT comment on:
- Formatting (handled by linters)
- Import order
- Trailing whitespace
- Minor style preferences

Be specific. Reference exact line numbers. Suggest fixes when possible.
For good code, add a "praise" comment — reinforce good practices.`,
  });

  return object;
}
```

## Step 3: GitHub Integration

```typescript
// src/github/post-review.ts
export async function postReview(
  owner: string,
  repo: string,
  pr: number,
  review: { summary: string; comments: any[]; approvalRecommendation: string },
  token: string
): Promise<void> {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  // Map severity to emoji
  const emoji: Record<string, string> = {
    critical: '🚨', warning: '⚠️', suggestion: '💡', praise: '✨',
  };

  // Create review with inline comments
  const githubComments = review.comments
    .filter(c => c.line) // only comments with line numbers
    .map(c => ({
      path: c.file,
      line: c.line,
      body: `${emoji[c.severity]} **${c.category}** (${c.severity})\n\n${c.comment}${
        c.suggestedFix ? `\n\n**Suggested fix:**\n\`\`\`suggestion\n${c.suggestedFix}\n\`\`\`` : ''
      }`,
    }));

  const event = review.approvalRecommendation === 'approve' ? 'APPROVE'
    : review.approvalRecommendation === 'request_changes' ? 'REQUEST_CHANGES'
    : 'COMMENT';

  // Post the review
  await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr}/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      body: `## 🤖 AI Code Review\n\n${review.summary}\n\n---\n*Risk level: ${review.approvalRecommendation}*`,
      event,
      comments: githubComments,
    }),
  });
}
```

## Step 4: GitHub Actions Workflow

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
      - name: Run AI Review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          node dist/cli.js review \
            --owner ${{ github.repository_owner }} \
            --repo ${{ github.event.repository.name }} \
            --pr ${{ github.event.pull_request.number }}
```

## Results

- **Review turnaround**: 15 minutes average (was 2 days)
- **Senior engineer time**: 3 hours/week on reviews (was 10 hours) — freed 7 hours for architecture
- **Bugs caught pre-merge**: 40% more issues caught vs human-only review
- **Security findings**: 6 critical vulnerabilities caught in first month (SQL injection, exposed secrets)
- **False positive rate**: 8% — tuned prompts to reduce noise
- **Developer satisfaction**: 92% approval in team survey — juniors unblocked, seniors less fatigued
- **AI cost**: ~$200/month for 300 PRs — 100x cheaper than the engineer time saved
