---
title: Build a Competitive Monitoring Agent
slug: build-competitive-monitoring-agent
description: Automatically track competitor websites, pricing pages, and review sites daily — then get a weekly digest summarizing what changed, why it matters, and what to do about it.
skills:
  - anthropic-sdk
  - resend
tags:
  - competitive-intelligence
  - monitoring
  - ai
  - automation
  - b2b-saas
---

## The Problem

Carlos is a product manager at a B2B SaaS. He has 5 direct competitors he needs to track. He knows he should be watching their pricing pages, feature announcements, G2 reviews, and HN launches — but doing it manually is either a full-time job or something that never happens.

Last quarter, a competitor dropped their price by 30% and Carlos didn't find out until a customer mentioned it on a sales call. By then, two deals had already been lost.

He wants an automated agent that checks competitors daily, understands what actually changed vs. noise, and sends a weekly digest with the intel that matters.

## The Solution

Use anthropic-sdk to understand page changes and generate insight summaries. Use resend to deliver weekly digests and real-time alerts. The agent runs on a cron schedule — daily diff checks, weekly reports.

## Step-by-Step Walkthrough

### Step 1: Track Website Changes (Pricing, Features, Content)

```typescript
// tracker/website.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface PageSnapshot {
  url: string;
  competitorName: string;
  content: string;
  contentHash: string;
  capturedAt: Date;
}

export interface PageDiff {
  url: string;
  competitorName: string;
  before: string;
  after: string;
  hasChanged: boolean;
  capturedAt: Date;
}

const SNAPSHOT_DIR = './snapshots';

/**
 * Fetch a webpage and extract readable text content.
 * Strip navigation, footers, ads — focus on main content.
 */
export async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; monitoring-bot/1.0)',
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

  const html = await response.text();
  
  // Basic HTML to text conversion — use cheerio for better results
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/**
 * Compare current content to last snapshot. Return diff if changed.
 */
export function detectChange(
  url: string,
  competitorName: string,
  newContent: string
): PageDiff {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${Buffer.from(url).toString('base64').slice(0, 32)}.json`);
  const newHash = crypto.createHash('md5').update(newContent).digest('hex');

  let previousContent = '';

  if (fs.existsSync(snapshotPath)) {
    const snapshot: PageSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    previousContent = snapshot.content;
  }

  // Save new snapshot
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snapshot: PageSnapshot = { url, competitorName, content: newContent, contentHash: newHash, capturedAt: new Date() };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  return {
    url,
    competitorName,
    before: previousContent,
    after: newContent,
    hasChanged: previousContent !== newContent && previousContent !== '',
    capturedAt: new Date(),
  };
}
```

### Step 2: Monitor Review Sites and Social

```typescript
// tracker/reviews.ts

export interface ReviewData {
  source: 'g2' | 'capterra' | 'hackernews';
  competitorName: string;
  items: Array<{
    title: string;
    text: string;
    date: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    url?: string;
  }>;
}

/**
 * Check HN Algolia API for competitor mentions.
 * Free, no auth required.
 */
export async function fetchHNMentions(competitorName: string): Promise<ReviewData> {
  const query = encodeURIComponent(competitorName);
  const url = `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&hitsPerPage=10&numericFilters=created_at_i>=${Math.floor(Date.now() / 1000) - 7 * 24 * 3600}`;
  
  const response = await fetch(url);
  const data = await response.json() as { hits: Array<{ title: string; url?: string; created_at: string; objectID: string }> };

  return {
    source: 'hackernews',
    competitorName,
    items: data.hits.map(hit => ({
      title: hit.title,
      text: hit.title,
      date: hit.created_at,
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    })),
  };
}

/**
 * Check G2 recent reviews via their public pages.
 * Note: For production use, consider G2's official API.
 */
export async function fetchRecentActivity(
  competitor: { name: string; g2Slug?: string; capterraSlug?: string }
): Promise<ReviewData[]> {
  const results: ReviewData[] = [];

  // HN mentions are always checked
  const hn = await fetchHNMentions(competitor.name);
  if (hn.items.length > 0) results.push(hn);

  return results;
}
```

### Step 3: Analyze Changes with Claude

```typescript
// analyzer/changes.ts
import Anthropic from '@anthropic-ai/sdk';
import type { PageDiff } from '../tracker/website';
import type { ReviewData } from '../tracker/reviews';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ChangeInsight {
  competitorName: string;
  changeType: 'pricing' | 'feature' | 'content' | 'review_trend' | 'launch' | 'none';
  significance: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  whatChanged: string;
  whyItMatters: string;
  suggestedAction: string;
}

export async function analyzePageChange(diff: PageDiff): Promise<ChangeInsight> {
  if (!diff.hasChanged) {
    return {
      competitorName: diff.competitorName,
      changeType: 'none',
      significance: 'low',
      summary: 'No changes detected',
      whatChanged: '',
      whyItMatters: '',
      suggestedAction: '',
    };
  }

  // Extract a meaningful diff (first 3000 chars of each to fit context)
  const beforeExcerpt = diff.before.slice(0, 3000);
  const afterExcerpt = diff.after.slice(0, 3000);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Analyze this competitor page change for a B2B SaaS product manager.

Competitor: ${diff.competitorName}
URL: ${diff.url}

BEFORE:
${beforeExcerpt}

AFTER:
${afterExcerpt}

Identify what changed, why it matters competitively, and what action to consider.

Return JSON:
{
  changeType: "pricing" | "feature" | "content" | "review_trend" | "launch" | "none",
  significance: "low" | "medium" | "high" | "critical",
  summary: string,           // one sentence
  whatChanged: string,       // what specifically changed
  whyItMatters: string,      // competitive implication
  suggestedAction: string    // what we should do in response
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  const result = JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());

  return { competitorName: diff.competitorName, ...result };
}

export async function analyzeReviewTrend(reviews: ReviewData): Promise<ChangeInsight> {
  if (!reviews.items.length) {
    return {
      competitorName: reviews.competitorName,
      changeType: 'none',
      significance: 'low',
      summary: 'No new reviews or mentions',
      whatChanged: '',
      whyItMatters: '',
      suggestedAction: '',
    };
  }

  const reviewText = reviews.items.slice(0, 10).map(r => `- ${r.date}: ${r.text}`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `Summarize recent ${reviews.source} activity for ${reviews.competitorName}.

Recent items:
${reviewText}

What's the trend? Positive momentum, complaints, new launch traction?

Return JSON:
{
  significance: "low" | "medium" | "high" | "critical",
  summary: string,
  whatChanged: string,
  whyItMatters: string,
  suggestedAction: string
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  const result = JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());

  return { competitorName: reviews.competitorName, changeType: 'review_trend', ...result };
}
```

### Step 4: Send Weekly Digest via Resend

```typescript
// emailer/digest.ts
import { Resend } from 'resend';
import type { ChangeInsight } from '../analyzer/changes';

const resend = new Resend(process.env.RESEND_API_KEY!);

const SIGNIFICANCE_EMOJI = { low: '⚪', medium: '🟡', high: '🔴', critical: '🚨' };

function buildDigestHtml(insights: ChangeInsight[], weekOf: string): string {
  const significant = insights.filter(i => i.changeType !== 'none' && i.significance !== 'low');
  const critical = insights.filter(i => i.significance === 'critical' || i.significance === 'high');

  const insightBlocks = significant.map(ins => `
    <div style="border-left:4px solid ${ins.significance === 'critical' ? '#ef4444' : ins.significance === 'high' ? '#f97316' : '#facc15'};padding:12px 16px;margin:12px 0;background:#f9f9f9;">
      <strong>${SIGNIFICANCE_EMOJI[ins.significance]} ${ins.competitorName}</strong> — ${ins.changeType.replace('_', ' ')}
      <p style="margin:8px 0 4px;color:#555;">${ins.whatChanged}</p>
      <p style="margin:4px 0;color:#333;"><em>Why it matters:</em> ${ins.whyItMatters}</p>
      <p style="margin:4px 0;color:#059669;"><em>Suggested action:</em> ${ins.suggestedAction}</p>
    </div>
  `).join('');

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:20px;">
      <h2>Weekly Competitive Intelligence — Week of ${weekOf}</h2>
      ${critical.length ? `<p style="background:#fef2f2;border:1px solid #ef4444;padding:12px;border-radius:6px;">⚠️ <strong>${critical.length} high-priority items</strong> require attention this week.</p>` : '<p>No critical changes detected this week.</p>'}
      <h3>What Changed</h3>
      ${insightBlocks || '<p>No significant changes detected across tracked competitors.</p>'}
    </div>
  `;
}

export async function sendWeeklyDigest(
  insights: ChangeInsight[],
  recipients: string[],
  fromEmail: string
): Promise<void> {
  const weekOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const significantCount = insights.filter(i => i.changeType !== 'none').length;
  
  await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `Competitive Intel: ${significantCount} changes detected — Week of ${weekOf}`,
    html: buildDigestHtml(insights, weekOf),
  });

  console.log(`Digest sent to ${recipients.length} recipients`);
}

export async function sendCriticalAlert(
  insight: ChangeInsight,
  recipients: string[],
  fromEmail: string
): Promise<void> {
  await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `🚨 Competitor Alert: ${insight.competitorName} — ${insight.whatChanged.slice(0, 60)}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;padding:20px;">
        <h2>🚨 Critical Competitor Change</h2>
        <p><strong>Competitor:</strong> ${insight.competitorName}</p>
        <p><strong>What changed:</strong> ${insight.whatChanged}</p>
        <p><strong>Why it matters:</strong> ${insight.whyItMatters}</p>
        <p><strong>Suggested action:</strong> ${insight.suggestedAction}</p>
      </div>
    `,
  });
}
```

### Step 5: Orchestrate Daily Checks and Weekly Reports

```typescript
// index.ts
import { fetchPageContent, detectChange } from './tracker/website';
import { fetchRecentActivity } from './tracker/reviews';
import { analyzePageChange, analyzeReviewTrend } from './analyzer/changes';
import { sendWeeklyDigest, sendCriticalAlert } from './emailer/digest';

const COMPETITORS = [
  {
    name: 'CompetitorA',
    pages: [
      { url: 'https://competitora.com/pricing', label: 'Pricing' },
      { url: 'https://competitora.com/features', label: 'Features' },
    ],
    g2Slug: 'competitor-a',
  },
  {
    name: 'CompetitorB',
    pages: [
      { url: 'https://competitorb.com/pricing', label: 'Pricing' },
    ],
  },
];

const ALERT_RECIPIENTS = ['pm@yourcompany.com', 'ceo@yourcompany.com'];
const DIGEST_RECIPIENTS = ['team@yourcompany.com'];

async function runDailyCheck() {
  const allInsights = [];

  for (const competitor of COMPETITORS) {
    // Check website pages
    for (const page of competitor.pages) {
      const content = await fetchPageContent(page.url);
      const diff = detectChange(page.url, competitor.name, content);
      const insight = await analyzePageChange(diff);
      allInsights.push(insight);

      // Send immediate alert for critical changes
      if (insight.significance === 'critical') {
        await sendCriticalAlert(insight, ALERT_RECIPIENTS, 'intel@yourcompany.com');
      }
    }

    // Check reviews / HN
    const activity = await fetchRecentActivity(competitor);
    for (const data of activity) {
      const insight = await analyzeReviewTrend(data);
      allInsights.push(insight);
    }

    await new Promise(r => setTimeout(r, 2000));  // polite delay between competitors
  }

  console.log(`Daily check complete: ${allInsights.length} signals processed`);
  return allInsights;
}

async function runWeeklyDigest() {
  const insights = await runDailyCheck();
  await sendWeeklyDigest(insights, DIGEST_RECIPIENTS, 'intel@yourcompany.com');
}

// Run modes: set via env or cron schedule
const MODE = process.env.RUN_MODE || 'daily';
if (MODE === 'weekly') {
  runWeeklyDigest();
} else {
  runDailyCheck();
}
```

## What You've Built

A competitive intelligence agent that monitors pricing pages, feature announcements, reviews, and HN mentions daily — sending real-time alerts for critical changes and weekly digests with AI-generated analysis of what changed, why it matters, and what to do.

**Next steps:** Add G2/Capterra API access for structured review data. Track Twitter/X mentions using the API. Build a dashboard to visualize change history over time. Add Slack integration for critical alerts.
