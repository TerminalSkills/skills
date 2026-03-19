---
title: Build an AI Code Reviewer for Pull Requests
slug: build-ai-code-reviewer
description: Add automated AI code review to your GitHub PRs — Claude analyzes diffs for bugs, security issues, and code quality, then posts inline comments and an overall score before a human reviewer looks at it.
skills:
  - anthropic-sdk
tags:
  - code-review
  - github
  - ci-cd
  - developer-tools
  - automation
---

## The Problem

Tae-yang leads an engineering team of 8. Every PR needs a senior engineer's eyes on it. Senior engineers are also the team's biggest bottleneck. They're reviewing 30+ PRs a week, catching the same style issues repeatedly, and spending mental energy on first-pass checks that a tool could do.

The team tried GitHub Copilot — it's good for autocomplete but doesn't review PRs. Tae-yang wants an automated first pass that catches obvious bugs, security issues, and code smell before the human review even starts. The human reviewer should be spending time on architecture decisions, not missing null checks.

## The Solution

Use anthropic-sdk (Claude) to analyze PR diffs and generate structured review comments. A GitHub Actions workflow triggers on `pull_request`, calls the review script, and posts inline comments plus a summary via GitHub API.

## Step-by-Step Walkthrough

### Step 1: GitHub Actions Trigger

```yaml
# .github/workflows/ai-code-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]
    # Optional: only run on specific paths
    # paths:
    #   - 'src/**'
    #   - 'packages/**'

jobs:
  ai-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write    # needed to post comments
      contents: read
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0      # full history needed for accurate diffs
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
        working-directory: .github/scripts/ai-reviewer
      
      - name: Run AI code review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
          REPO: ${{ github.repository }}
        run: node .github/scripts/ai-reviewer/index.js
```

### Step 2: Parse the PR Diff

```typescript
// .github/scripts/ai-reviewer/diff-parser.ts
import { execSync } from 'child_process';

export interface DiffHunk {
  filePath: string;
  language: string;
  oldStart: number;
  newStart: number;
  lines: string[];        // raw diff lines with +/-
  addedLines: string[];   // only added lines
  context: string;        // full hunk as string
}

export interface ParsedDiff {
  hunks: DiffHunk[];
  filesChanged: string[];
  totalAdditions: number;
  totalDeletions: number;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript/React', js: 'JavaScript', jsx: 'JavaScript/React',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    cs: 'C#', cpp: 'C++', c: 'C', php: 'PHP', swift: 'Swift',
    kt: 'Kotlin', sql: 'SQL', sh: 'Shell', yml: 'YAML', yaml: 'YAML',
  };
  return langMap[ext] || ext.toUpperCase() || 'Unknown';
}

export function parseDiff(baseSha: string, headSha: string): ParsedDiff {
  const rawDiff = execSync(
    `git diff ${baseSha}..${headSha} --unified=5`,
    { encoding: 'utf-8' }
  );

  const hunks: DiffHunk[] = [];
  let currentFile = '';
  let currentHunk: DiffHunk | null = null;
  let newStart = 0;

  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('diff --git')) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = null;
      currentFile = line.match(/b\/(.+)$/)?.[1] || '';
    } else if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      newStart = match ? parseInt(match[2]) : 0;
      currentHunk = {
        filePath: currentFile,
        language: detectLanguage(currentFile),
        oldStart: match ? parseInt(match[1]) : 0,
        newStart,
        lines: [],
        addedLines: [],
        context: '',
      };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.addedLines.push(line.slice(1));
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  // Set context string for each hunk
  hunks.forEach(h => { h.context = h.lines.join('\n'); });

  const filesChanged = [...new Set(hunks.map(h => h.filePath))];
  const totalAdditions = hunks.reduce((sum, h) => sum + h.addedLines.length, 0);
  const totalDeletions = hunks.reduce((sum, h) => sum + h.lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length, 0);

  return { hunks, filesChanged, totalAdditions, totalDeletions };
}
```

### Step 3: Review with Claude

```typescript
// .github/scripts/ai-reviewer/reviewer.ts
import Anthropic from '@anthropic-ai/sdk';
import type { DiffHunk } from './diff-parser';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ReviewComment {
  filePath: string;
  line: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'bug' | 'security' | 'performance' | 'style' | 'logic' | 'readability';
  comment: string;
  suggestion?: string;    // improved code snippet if applicable
}

export interface PRReview {
  comments: ReviewComment[];
  overallScore: number;    // 0-10
  summary: string;
  approved: boolean;       // auto-approve if score >= 8 and no critical issues
  highlights: string[];    // things done well
  blockers: string[];      // must-fix before merge
}

// Configurable rules — customize for your team
const REVIEW_GUIDELINES = `
Review focus:
1. BUGS: Logic errors, off-by-one, unhandled edge cases, wrong comparisons
2. SECURITY: SQL injection, XSS, hardcoded secrets, missing auth checks, unsafe deserialization
3. PERFORMANCE: N+1 queries, missing indexes, unnecessary re-renders, blocking operations
4. LOGIC: Race conditions, incorrect assumptions, missing null/undefined checks
5. STYLE: Only flag significant issues, not minor formatting (that's what linters are for)

DO NOT flag:
- Minor formatting/whitespace (linter handles this)
- Subjective naming preferences
- Working code that has no clear issue
`;

export async function reviewHunk(hunk: DiffHunk): Promise<ReviewComment[]> {
  // Skip generated files, tests, and config
  if (
    hunk.filePath.includes('.generated.') ||
    hunk.filePath.includes('__snapshots__') ||
    hunk.filePath.includes('node_modules') ||
    hunk.addedLines.length === 0
  ) {
    return [];
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',    // fast + cheap for individual hunks
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `Review this ${hunk.language} code diff for issues.

File: ${hunk.filePath} (line ${hunk.newStart})

${REVIEW_GUIDELINES}

DIFF (+ added, - removed, space = context):
${hunk.context}

Return a JSON array of issues. Only include real issues — empty array if code looks fine:
[{
  line: number,          // line number in the new file
  severity: "info" | "warning" | "error" | "critical",
  category: "bug" | "security" | "performance" | "style" | "logic" | "readability",
  comment: string,       // clear explanation of the issue
  suggestion: string     // optional: improved code snippet
}]

Return [] if no issues. Return only JSON.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') return [];
  
  try {
    const comments = JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim()) as Array<Omit<ReviewComment, 'filePath'>>;
    return comments.map(c => ({ ...c, filePath: hunk.filePath }));
  } catch {
    return [];
  }
}

export async function generatePRSummary(
  allComments: ReviewComment[],
  diff: { filesChanged: string[]; totalAdditions: number; totalDeletions: number }
): Promise<PRReview> {
  const criticalCount = allComments.filter(c => c.severity === 'critical').length;
  const errorCount = allComments.filter(c => c.severity === 'error').length;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Summarize this PR review.

Changes: ${diff.filesChanged.length} files, +${diff.totalAdditions}/-${diff.totalDeletions} lines

Issues found:
${allComments.map(c => `- [${c.severity}][${c.category}] ${c.filePath}:${c.line}: ${c.comment}`).join('\n') || 'No issues found'}

Return JSON:
{
  overallScore: 0-10,     // 10 = excellent, 8+ = approvable, below 6 = needs work
  summary: string,        // 2-3 sentences
  highlights: string[],   // 2-3 things done well
  blockers: string[]      // must-fix before merge (critical/error issues)
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  const result = JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());

  return {
    ...result,
    comments: allComments,
    approved: result.overallScore >= 8 && criticalCount === 0 && errorCount === 0,
  };
}
```

### Step 4: Post Review Comments via GitHub API

```typescript
// .github/scripts/ai-reviewer/github.ts

const GITHUB_API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN!;
const REPO = process.env.REPO!;
const PR_NUMBER = parseInt(process.env.PR_NUMBER!);

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

/**
 * Post inline review comments on specific lines.
 */
export async function postReview(
  headSha: string,
  comments: Array<{ filePath: string; line: number; comment: string; suggestion?: string }>,
  summary: string,
  approved: boolean
): Promise<void> {
  const reviewComments = comments.map(c => ({
    path: c.filePath,
    line: c.line,
    side: 'RIGHT',
    body: c.suggestion
      ? `${c.comment}\n\n**Suggested fix:**\n\`\`\`suggestion\n${c.suggestion}\n\`\`\``
      : c.comment,
  }));

  await fetch(`${GITHUB_API}/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      commit_id: headSha,
      body: summary,
      event: approved ? 'APPROVE' : comments.length > 0 ? 'REQUEST_CHANGES' : 'COMMENT',
      comments: reviewComments.slice(0, 20),  // GitHub allows max 20 inline comments per review
    }),
  });
}

/**
 * Post a summary comment at the PR level.
 */
export async function postSummaryComment(review: import('./reviewer').PRReview): Promise<void> {
  const scoreEmoji = review.overallScore >= 8 ? '✅' : review.overallScore >= 6 ? '⚠️' : '❌';
  
  const body = `## 🤖 AI Code Review

${scoreEmoji} **Score: ${review.overallScore}/10** — ${review.approved ? 'Auto-approved' : 'Review requested'}

${review.summary}

${review.highlights.length ? `### ✨ Looks good\n${review.highlights.map(h => `- ${h}`).join('\n')}` : ''}

${review.blockers.length ? `### 🚫 Must fix before merge\n${review.blockers.map(b => `- ${b}`).join('\n')}` : ''}

_AI review by Claude. This is a first-pass check — human review still required for architecture decisions._`;

  await fetch(`${GITHUB_API}/repos/${REPO}/issues/${PR_NUMBER}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
}
```

### Step 5: Orchestrate the Full Review

```typescript
// .github/scripts/ai-reviewer/index.ts
import { parseDiff } from './diff-parser';
import { reviewHunk, generatePRSummary } from './reviewer';
import { postReview, postSummaryComment } from './github';

async function runAIReview() {
  const baseSha = process.env.BASE_SHA!;
  const headSha = process.env.HEAD_SHA!;

  console.log(`Reviewing diff: ${baseSha}..${headSha}`);
  
  const diff = parseDiff(baseSha, headSha);
  console.log(`Found ${diff.hunks.length} hunks across ${diff.filesChanged.length} files`);

  // Review hunks in parallel batches of 4
  const allComments = [];
  for (let i = 0; i < diff.hunks.length; i += 4) {
    const batch = diff.hunks.slice(i, i + 4);
    const batchComments = await Promise.all(batch.map(hunk => reviewHunk(hunk)));
    allComments.push(...batchComments.flat());
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Found ${allComments.length} issues`);
  
  const review = await generatePRSummary(allComments, diff);
  
  // Post inline comments
  if (allComments.length > 0) {
    await postReview(headSha, allComments, review.summary, review.approved);
  }
  
  // Always post summary comment
  await postSummaryComment(review);
  
  console.log(`Review complete: ${review.overallScore}/10, approved: ${review.approved}`);
  
  // Exit with non-zero if score is too low (blocks merge if required check)
  if (review.overallScore < 5) {
    console.error('Review score below threshold');
    process.exit(1);
  }
}

runAIReview().catch(err => {
  console.error('AI review failed:', err);
  process.exit(1);
});
```

## What You've Built

An AI code reviewer that runs on every PR, analyzes diffs with Claude Haiku, posts inline comments with specific line numbers, suggests fixes, scores the PR 0-10, and can auto-approve clean PRs — all before a human reviewer opens the diff.

**Next steps:** Add language-specific rules (security rules for SQL, React best practices for TSX). Build a team convention config file so the reviewer learns your style guide. Add a "learning mode" that improves rules based on reviewer feedback.
