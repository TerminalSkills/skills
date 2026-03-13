---
title: Build an AI Code Review Bot That Actually Catches Bugs
slug: build-ai-code-review-bot-for-github
description: A platform team builds a GitHub bot that reviews every PR with AI — analyzing diffs for bugs, security issues, performance problems, and style violations, posting inline comments on the exact lines that need attention, learning from team patterns, and escalating only when confidence is high — reducing review turnaround from 2 days to 20 minutes while catching bugs that humans miss.
skills: [openai-agents, langfuse, semgrep, hono, trigger-dev-v3]
category: AI & Machine Learning
tags: [code-review, github, automation, ai, developer-tools, ci-cd, quality]
---

# Build an AI Code Review Bot That Actually Catches Bugs

Tomas leads a 30-person engineering team. PR reviews take an average of 2 days. Senior engineers spend 30% of their time reviewing. Half the comments are about formatting and obvious issues that could be automated. Meanwhile, actual bugs slip through because reviewers are fatigued from looking at style issues. Tomas wants a bot that handles the mechanical review work, so humans can focus on architecture and logic.

## Why Existing Tools Fall Short

Tomas tried CodeRabbit and similar tools. The problem: they're generic. They don't know that his team uses a custom error handling pattern, that all database queries must go through the repository layer, that `console.log` in production code is a hard no. Generic AI review produces noise — developers start ignoring it.

The solution: a custom bot trained on the team's patterns, integrated with their linting rules, that posts comments only when it's confident.

## Step 1: Webhook Handler

Every PR triggers the bot. The webhook handler parses the diff and decides what to review:

```typescript
// api/webhook.ts — GitHub webhook handler
import { Hono } from "hono";
import { verifyGitHubWebhook } from "./lib/github";

const app = new Hono();

app.post("/api/github/webhook", async (c) => {
  const payload = await c.req.json();
  const signature = c.req.header("x-hub-signature-256")!;

  if (!verifyGitHubWebhook(JSON.stringify(payload), signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  if (payload.action === "opened" || payload.action === "synchronize") {
    // Trigger async review (don't block the webhook response)
    await reviewQueue.trigger({
      prNumber: payload.pull_request.number,
      repo: payload.repository.full_name,
      baseSha: payload.pull_request.base.sha,
      headSha: payload.pull_request.head.sha,
      author: payload.pull_request.user.login,
    });
  }

  return c.json({ received: true });
});
```

## Step 2: Diff Analysis Pipeline

The bot doesn't review the entire codebase — only the changed files. It breaks the diff into logical chunks and analyzes each one:

```typescript
// review/analyzer.ts — Parse and analyze PR diff
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const openai = new OpenAI();

interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion";
  confidence: number;                      // 0-1, only post if > 0.7
  category: string;
}

async function analyzePR(repo: string, prNumber: number, baseSha: string, headSha: string): Promise<ReviewComment[]> {
  const [owner, repoName] = repo.split("/");

  // Get the diff
  const { data: files } = await octokit.pulls.listFiles({ owner, repo: repoName, pull_number: prNumber });

  const comments: ReviewComment[] = [];

  for (const file of files) {
    // Skip non-reviewable files
    if (shouldSkipFile(file.filename)) continue;
    if (!file.patch) continue;

    // Get the full file content (for context beyond the diff)
    let fullContent = "";
    try {
      const { data } = await octokit.repos.getContent({ owner, repo: repoName, path: file.filename, ref: headSha });
      if ("content" in data) fullContent = Buffer.from(data.content, "base64").toString();
    } catch {}

    // Analyze with AI
    const fileComments = await analyzeFile(file.filename, file.patch, fullContent);
    comments.push(...fileComments);
  }

  return comments.filter(c => c.confidence >= 0.7);  // Only high-confidence comments
}

async function analyzeFile(filename: string, patch: string, fullContent: string): Promise<ReviewComment[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior code reviewer for a TypeScript/Node.js team.

TEAM CONVENTIONS (these are hard rules, not suggestions):
- All database access goes through repository classes, never raw queries in routes/controllers
- Error handling uses the AppError class hierarchy (BadRequestError, NotFoundError, etc.)
- No console.log in production code; use the structured logger
- All async route handlers must be wrapped in asyncHandler()
- Environment variables accessed only through config.ts, never process.env directly
- API responses follow { data, error, meta } envelope format

REVIEW FOCUS:
1. BUGS: Null pointer risks, race conditions, missing error handling, incorrect logic
2. SECURITY: SQL injection, XSS, auth bypass, secrets in code, mass assignment
3. PERFORMANCE: N+1 queries, missing indexes, unnecessary re-renders, memory leaks
4. TEAM CONVENTIONS: Violations of the rules above

DO NOT COMMENT ON:
- Formatting (prettier handles this)
- Import order (eslint handles this)
- Variable naming preferences (unless genuinely confusing)
- "You could also do it this way" alternatives (unless the current way is buggy)

For each issue found, provide:
- path: filename
- line: the line number in the diff (from @@ hunk headers)
- body: clear explanation of the issue and how to fix it
- severity: critical (must fix), warning (should fix), suggestion (consider)
- confidence: 0-1 how certain you are this is a real issue (not a false positive)
- category: bug, security, performance, convention

Return JSON: { "comments": [...] }
If nothing noteworthy, return { "comments": [] }.
QUALITY OVER QUANTITY. One good catch is worth more than ten nitpicks.`,
      },
      {
        role: "user",
        content: `Review this diff for ${filename}:\n\n\`\`\`diff\n${patch}\n\`\`\`\n\nFull file context:\n\`\`\`\n${fullContent.slice(0, 8000)}\n\`\`\``,
      },
    ],
  });

  const result = JSON.parse(response.choices[0].message.content!);
  return result.comments || [];
}

function shouldSkipFile(filename: string): boolean {
  const skipPatterns = [
    /\.test\.(ts|tsx|js)$/,                // Test files
    /\.spec\.(ts|tsx|js)$/,
    /package-lock\.json$/,
    /\.lock$/,
    /\.md$/,
    /\.json$/,                             // Config files
    /migrations\//,                        // Database migrations
    /generated\//,                         // Auto-generated code
  ];
  return skipPatterns.some(p => p.test(filename));
}
```

## Step 3: Post Comments as Inline Review

The bot posts comments on the exact lines, as a proper GitHub review:

```typescript
// review/poster.ts — Post review to GitHub
async function postReview(repo: string, prNumber: number, headSha: string, comments: ReviewComment[]) {
  const [owner, repoName] = repo.split("/");

  if (comments.length === 0) {
    // Approve if no issues found
    await octokit.pulls.createReview({
      owner, repo: repoName, pull_number: prNumber, commit_id: headSha,
      event: "APPROVE",
      body: "✅ AI review complete — no issues found.",
    });
    return;
  }

  const criticalCount = comments.filter(c => c.severity === "critical").length;
  const warningCount = comments.filter(c => c.severity === "warning").length;

  const summaryBody = [
    `## 🤖 AI Code Review`,
    ``,
    criticalCount > 0 ? `⛔ **${criticalCount} critical issue${criticalCount > 1 ? "s" : ""}** — must fix before merge` : "",
    warningCount > 0 ? `⚠️ **${warningCount} warning${warningCount > 1 ? "s" : ""}** — should fix` : "",
    `💡 **${comments.filter(c => c.severity === "suggestion").length} suggestion${comments.filter(c => c.severity === "suggestion").length !== 1 ? "s" : ""}**`,
    ``,
    `*Confidence threshold: 70%. False positive? React with 👎 and I'll learn from it.*`,
  ].filter(Boolean).join("\n");

  await octokit.pulls.createReview({
    owner, repo: repoName, pull_number: prNumber, commit_id: headSha,
    event: criticalCount > 0 ? "REQUEST_CHANGES" : "COMMENT",
    body: summaryBody,
    comments: comments.map(c => ({
      path: c.path,
      line: c.line,
      body: `${severityEmoji(c.severity)} **${c.category}** (${Math.round(c.confidence * 100)}% confidence)\n\n${c.body}`,
    })),
  });
}

function severityEmoji(severity: string): string {
  return { critical: "🔴", warning: "🟡", suggestion: "💡" }[severity] || "💡";
}
```

## Step 4: Learning from Feedback

When developers react with 👎 to a comment, the bot records it as a false positive. Over time, this feedback tunes the system prompt:

```typescript
// review/feedback.ts — Learn from developer reactions
async function handleReaction(repo: string, commentId: number, reaction: string) {
  if (reaction === "-1") {
    // False positive — record for learning
    const comment = await octokit.pulls.getReviewComment({ owner, repo, comment_id: commentId });

    await db.falsePositives.create({
      data: {
        repo,
        filename: comment.data.path,
        commentBody: comment.data.body,
        diffContext: comment.data.diff_hunk,
        reportedAt: new Date(),
      },
    });

    // Every 50 false positives, update the system prompt with patterns to avoid
    const recentFPs = await db.falsePositives.findMany({ orderBy: { reportedAt: "desc" }, take: 50 });
    if (recentFPs.length >= 50 && recentFPs.length % 10 === 0) {
      await updateReviewPromptWithFeedback(recentFPs);
    }
  }
}
```

## Step 5: Observability with Langfuse

Every review is traced for quality monitoring:

```typescript
import { Langfuse } from "langfuse";

const langfuse = new Langfuse();

async function tracedReview(repo: string, prNumber: number) {
  const trace = langfuse.trace({ name: "pr-review", metadata: { repo, prNumber } });

  const span = trace.span({ name: "analyze-diff" });
  const comments = await analyzePR(repo, prNumber, baseSha, headSha);
  span.end({ output: { commentCount: comments.length } });

  const postSpan = trace.span({ name: "post-review" });
  await postReview(repo, prNumber, headSha, comments);
  postSpan.end();

  // Score the review (based on future feedback)
  trace.score({ name: "comment_count", value: comments.length });
  trace.score({ name: "critical_count", value: comments.filter(c => c.severity === "critical").length });
}
```

## Results

After 4 months of running the bot on all repositories:

- **Review turnaround**: 2 days → 20 minutes for initial feedback; humans still do final review
- **Bugs caught**: 23 real bugs caught by AI that humans missed (null pointers, race conditions, auth bypasses)
- **False positive rate**: Started at 35%, dropped to 12% after feedback loop training
- **Senior engineer time**: 30% → 15% on code review; freed 15% for architecture and mentoring
- **Convention violations**: Dropped 80%; developers self-correct because they know the bot will catch it
- **Security findings**: 7 potential security issues caught (3 SQL injection vectors, 2 auth bypasses, 2 XSS)
- **Developer sentiment**: Initial skepticism → 85% approval after 2 months; "catches things I would have missed"
- **Cost**: $180/month in OpenAI API costs; 200 PRs/month × ~$0.90/review
- **Key insight**: The team conventions in the system prompt are 10x more valuable than generic review rules
