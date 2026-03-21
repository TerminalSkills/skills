---
title: Build an Automated LinkedIn Content Pipeline
slug: build-automated-linkedin-content
description: Build an AI LinkedIn content pipeline — pull trending topics from RSS/Reddit, generate posts in your writing style with Claude, create carousel images with DALL-E, schedule via LinkedIn API, and track performance.
skills:
  - anthropic-sdk
  - openai
difficulty: intermediate
time_estimate: "6 hours"
category: marketing
tags:
  - linkedin
  - content
  - ai
  - automation
  - social-media
  - growth
---

# Build an Automated LinkedIn Content Pipeline

Alex is a founder who posts on LinkedIn sporadically — whenever he finds time, which is once a month. He knows consistent posting grows his audience, but the creative work takes 2 hours per post. He wants to go from 500 to 10k followers in 6 months by posting 5x/week. The pipeline should handle ideation, drafting, and scheduling; Alex reviews and approves before anything goes live.

## Step 1 — Topic Ideation from Trending Sources

```typescript
// lib/topic-ideation.ts — Pull trending content from RSS feeds, Reddit, and HN.
// Finds what's resonating in your niche before you write about it.

import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";

const parser = new Parser();
const anthropic = new Anthropic();

interface TrendingTopic {
  title: string;
  source: string;
  url: string;
  score: number;    // Engagement score from source
  summary: string;
}

export async function getTrendingTopics(niche: string): Promise<TrendingTopic[]> {
  const sources = await Promise.allSettled([
    // HN Algolia API — no scraping needed
    fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(niche)}&tags=story&hitsPerPage=10`)
      .then(r => r.json())
      .then(data => data.hits.map((h: any) => ({
        title: h.title,
        source: "Hacker News",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        score: h.points,
        summary: "",
      }))),

    // Reddit — subreddits relevant to your niche
    fetch(`https://www.reddit.com/r/startups+SaaS+indiehackers/top.json?t=week&limit=10`, {
      headers: { "User-Agent": "LinkedInBot/1.0" },
    })
      .then(r => r.json())
      .then(data => data.data.children.map((p: any) => ({
        title: p.data.title,
        source: `r/${p.data.subreddit}`,
        url: `https://reddit.com${p.data.permalink}`,
        score: p.data.score,
        summary: p.data.selftext?.slice(0, 200) || "",
      }))),

    // Your own RSS feed — blog posts, newsletters in your niche
    parser.parseURL("https://www.indiehackers.com/feed.rss")
      .then(feed => feed.items.slice(0, 10).map(item => ({
        title: item.title || "",
        source: "Indie Hackers",
        url: item.link || "",
        score: 0,
        summary: item.contentSnippet || "",
      }))),
  ]);

  const topics: TrendingTopic[] = sources
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<TrendingTopic[]>).value);

  // Use Claude to select the 5 most LinkedIn-worthy topics
  const selection = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You're selecting LinkedIn post topics for a ${niche} founder with 500 followers who wants to grow.

Available trending topics:
${topics.map((t, i) => `${i + 1}. [${t.source}] ${t.title} (score: ${t.score})`).join("\n")}

Select the 5 best topics for LinkedIn posts. Consider:
- High engagement potential (controversy, strong opinions, practical tips)
- Relevant to the audience (founders, operators, builders)
- Timely and shareable
- Not overly technical or niche

Return JSON: { "selectedIndexes": [1, 5, 8, 12, 17] }`,
    }],
  });

  const { selectedIndexes } = JSON.parse(
    selection.content[0].type === "text" ? selection.content[0].text : "{}"
  );

  return selectedIndexes.map((i: number) => topics[i - 1]).filter(Boolean);
}
```

## Step 2 — AI Post Generation in Your Writing Style

```typescript
// lib/post-generator.ts — Generate LinkedIn posts that match your voice.
// Feed it examples of your best-performing posts to calibrate the style.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Your top posts — the AI learns your style from these
const STYLE_EXAMPLES = [
  `I just made $10k in a month from a tool I almost didn't build.

Here's the story:
I had the idea for 6 months. Kept dismissing it as "too simple."

Then one day I just built it. Took 3 days.

Posted it on HN. It hit #3.

Month 1: $10,247 in revenue.

Lesson: Simple solutions to real problems win.

The idea you're sitting on? Build it this weekend.`,

  `Hot take: Most productivity advice is wrong.

Everyone talks about morning routines.
Nobody talks about this:

Your best work happens in 90-minute focused blocks.
Not 14 hours of being "busy."

I shipped 3 features this week in 6 hours of focused work.
The other 30 hours were meetings, Slack, and context switching.

Protect your blocks. Everything else is noise.`,
];

export interface LinkedInPost {
  hook: string;
  body: string;
  cta: string;
  fullText: string;
  postType: "text" | "carousel" | "poll";
  carouselSlides?: string[];
}

export async function generateLinkedInPost(
  topic: TrendingTopic,
  postType: "text" | "carousel" | "poll" = "text"
): Promise<LinkedInPost> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Write a LinkedIn post about this topic: "${topic.title}"
Source context: ${topic.summary}

Here are examples of my writing style — match the voice exactly:

Example 1:
${STYLE_EXAMPLES[0]}

Example 2:
${STYLE_EXAMPLES[1]}

Post type: ${postType}
${postType === "carousel" ? "Also provide 5-7 carousel slide headlines (short, punchy)." : ""}
${postType === "poll" ? "Also provide 4 poll options." : ""}

Requirements:
- Hook: first line must make someone stop scrolling (bold claim, surprising stat, or provocative question)
- Body: 3-7 short paragraphs or list. No walls of text.
- CTA: end with a question or clear action
- Tone: direct, opinionated, first-person
- Length: 150-300 words for text posts
- No corporate speak, no filler phrases like "In today's world"
- Use line breaks generously — LinkedIn rewards readability

Return JSON:
{
  "hook": "first line",
  "body": "body text",
  "cta": "call to action",
  "fullText": "complete post ready to publish",
  ${postType === "carousel" ? '"carouselSlides": ["slide 1 headline", ...],' : ""}
  "postType": "${postType}"
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
}
```

## Step 3 — Carousel Image Generation

```typescript
// lib/carousel-generator.ts — Generate carousel slide images with DALL-E 3.
// Creates a consistent visual style for all carousels.

import OpenAI from "openai";
import { createCanvas, loadImage } from "canvas";

const openai = new OpenAI();

export async function generateCarouselSlide(
  headline: string,
  slideNumber: number,
  totalSlides: number,
  brandColor: string = "#1a1a2e"
): Promise<Buffer> {
  // Use Canvas for text slides (more reliable than DALL-E for text)
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, 0, 1080, 1080);

  // Slide number
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "bold 32px Inter";
  ctx.fillText(`${slideNumber}/${totalSlides}`, 60, 80);

  // Headline
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px Inter";

  // Word wrap
  const words = headline.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 960 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 90;
  const totalHeight = lines.length * lineHeight;
  const startY = (1080 - totalHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, 60, startY + i * lineHeight);
  });

  // Brand watermark
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "24px Inter";
  ctx.fillText("@alexbuilds", 60, 1040);

  return canvas.toBuffer("image/png");
}
```

## Step 4 — Schedule via LinkedIn API

```typescript
// lib/linkedin-publisher.ts — Schedule posts via LinkedIn API.
// Uses the /ugcPosts endpoint for text posts.

interface PublishOptions {
  text: string;
  scheduledAt?: Date;       // null = post immediately
  images?: Buffer[];
}

export async function scheduleLinkedInPost(
  accessToken: string,
  personId: string,
  options: PublishOptions
): Promise<string> {
  const body: any = {
    author: `urn:li:person:${personId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: options.text,
        },
        shareMediaCategory: options.images?.length ? "IMAGE" : "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LinkedIn API error: ${error}`);
  }

  const data = await response.json();
  return data.id;
}

// Track performance after 48 hours
export async function getPostMetrics(accessToken: string, postId: string) {
  const response = await fetch(
    `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${postId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  return {
    impressions: data.elements?.[0]?.totalShareStatistics?.impressionCount || 0,
    clicks: data.elements?.[0]?.totalShareStatistics?.clickCount || 0,
    likes: data.elements?.[0]?.totalShareStatistics?.likeCount || 0,
    comments: data.elements?.[0]?.totalShareStatistics?.commentCount || 0,
    shares: data.elements?.[0]?.totalShareStatistics?.shareCount || 0,
  };
}
```

## Step 5 — A/B Test Posting Times

```typescript
// lib/scheduler.ts — Determine best posting times based on performance data.

import { db } from "@/lib/db";

export async function getBestPostingTimes(): Promise<{ hour: number; dayOfWeek: number }[]> {
  // Query historical post performance
  const posts = await db.query.linkedinPosts.findMany({
    where: (p, { gt }) => gt(p.impressions, 0),
    columns: {
      publishedAt: true,
      impressions: true,
      engagementRate: true,
    },
    orderBy: (p, { desc }) => desc(p.publishedAt),
    limit: 100,
  });

  // Group by hour and day, calculate average engagement
  const timeSlots = new Map<string, { total: number; count: number }>();

  for (const post of posts) {
    const date = new Date(post.publishedAt);
    const key = `${date.getUTCDay()}-${date.getUTCHours()}`;
    const existing = timeSlots.get(key) || { total: 0, count: 0 };
    timeSlots.set(key, {
      total: existing.total + (post.engagementRate || 0),
      count: existing.count + 1,
    });
  }

  // Return top 3 time slots
  return Array.from(timeSlots.entries())
    .map(([key, stats]) => ({
      dayOfWeek: parseInt(key.split("-")[0]),
      hour: parseInt(key.split("-")[1]),
      avgEngagement: stats.total / stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 3)
    .map(({ dayOfWeek, hour }) => ({ dayOfWeek, hour }));
}
```

## Results

Alex ran the pipeline for 6 months. Starting at 487 followers:

- **Month 6: 9,840 followers** — up from 487. Short of 10k but close. Growth was non-linear: months 1-2 were slow (500→1,100), then the algorithm started amplifying posts and months 5-6 added 5k followers.
- **Time per week: 2 hours** — review 5 AI-drafted posts (20 min each), approve or edit. Previously this was ad-hoc and took the same time for 1 post/month.
- **Best performing format: carousel** — 3x the impressions of text posts. The pipeline now defaults to carousel for topics with list-style content.
- **Best posting times: Tuesday 8am, Thursday 7am, Wednesday 12pm UTC** — discovered from 6 months of performance data. Morning posts get seen during commute; midday posts catch European afternoon.
- **Top post: 140k impressions** — a contrarian take on funding rounds that the algorithm picked up. The pipeline generated the hook; Alex rewrote the body. Human-AI collaboration beats pure automation.
- **Pipeline limitation** — LinkedIn's API doesn't support post scheduling (only immediate publishing). Alex uses a simple cron job that posts at 8am Tuesday/Thursday and 12pm Wednesday.
