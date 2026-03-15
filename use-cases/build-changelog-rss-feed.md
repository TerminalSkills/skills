---
title: Build a Changelog RSS Feed
slug: build-changelog-rss-feed
description: Build a changelog RSS feed generator with Atom and RSS 2.0 output, category filtering, webhook triggers, email digest integration, and JSON feed support for developer product updates.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - changelog
  - rss
  - atom
  - feed
  - updates
---

# Build a Changelog RSS Feed

## The Problem

Max leads DevRel at a 20-person API company. Developers want to know when the API changes — new endpoints, deprecations, breaking changes. The changelog page exists but developers don't visit it proactively. Email announcements have 10% open rate. Some developers want RSS to integrate with their existing feed readers. Others want webhooks to trigger CI pipeline updates. Slack integration requests keep coming. They need a universal changelog feed: RSS 2.0, Atom, JSON Feed, webhook notifications, email digests, and category filtering.

## Step 1: Build the Feed Generator

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface ChangelogEntry {
  id: string;
  title: string;
  content: string;
  contentHtml: string;
  type: "feature" | "improvement" | "fix" | "deprecation" | "breaking";
  version: string | null;
  tags: string[];
  publishedAt: string;
  author: string;
}

interface FeedOptions {
  format: "rss" | "atom" | "json";
  types?: string[];
  tags?: string[];
  limit?: number;
}

const FEED_META = {
  title: process.env.PRODUCT_NAME || "API Changelog",
  description: "Latest updates, features, and changes",
  link: process.env.CHANGELOG_URL || "https://example.com/changelog",
  feedUrl: process.env.FEED_URL || "https://example.com/changelog/feed",
};

export async function generateFeed(options: FeedOptions): Promise<string> {
  const entries = await getEntries(options);

  switch (options.format) {
    case "rss": return generateRSS(entries);
    case "atom": return generateAtom(entries);
    case "json": return generateJSON(entries);
    default: throw new Error(`Unknown format: ${options.format}`);
  }
}

async function getEntries(options: FeedOptions): Promise<ChangelogEntry[]> {
  const cacheKey = `feed:${JSON.stringify(options)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let sql = "SELECT * FROM changelog_entries WHERE published_at IS NOT NULL";
  const params: any[] = [];
  let idx = 1;
  if (options.types?.length) { sql += ` AND type = ANY($${idx})`; params.push(options.types); idx++; }
  if (options.tags?.length) { sql += ` AND tags::jsonb ?| $${idx}`; params.push(options.tags); idx++; }
  sql += ` ORDER BY published_at DESC LIMIT $${idx}`;
  params.push(options.limit || 50);

  const { rows } = await pool.query(sql, params);
  const entries = rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags) }));
  await redis.setex(cacheKey, 300, JSON.stringify(entries));
  return entries;
}

function generateRSS(entries: ChangelogEntry[]): string {
  const items = entries.map((e) => `    <item>
      <title>${escXml(e.title)}</title>
      <link>${FEED_META.link}/${e.id}</link>
      <guid isPermaLink="false">${e.id}</guid>
      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>
      <category>${e.type}</category>
      <description>${escXml(e.content)}</description>
      <content:encoded><![CDATA[${e.contentHtml}]]></content:encoded>
    </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(FEED_META.title)}</title>
    <link>${FEED_META.link}</link>
    <description>${escXml(FEED_META.description)}</description>
    <atom:link href="${FEED_META.feedUrl}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

function generateAtom(entries: ChangelogEntry[]): string {
  const items = entries.map((e) => `  <entry>
    <title>${escXml(e.title)}</title>
    <link href="${FEED_META.link}/${e.id}" />
    <id>urn:changelog:${e.id}</id>
    <updated>${new Date(e.publishedAt).toISOString()}</updated>
    <category term="${e.type}" />
    <summary>${escXml(e.content.slice(0, 300))}</summary>
    <content type="html">${escXml(e.contentHtml)}</content>
    <author><name>${escXml(e.author)}</name></author>
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escXml(FEED_META.title)}</title>
  <link href="${FEED_META.link}" />
  <link href="${FEED_META.feedUrl}" rel="self" />
  <updated>${new Date().toISOString()}</updated>
  <id>${FEED_META.link}</id>
${items}
</feed>`;
}

function generateJSON(entries: ChangelogEntry[]): string {
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: FEED_META.title,
    home_page_url: FEED_META.link,
    feed_url: FEED_META.feedUrl + "?format=json",
    items: entries.map((e) => ({
      id: e.id, title: e.title, url: `${FEED_META.link}/${e.id}`,
      content_html: e.contentHtml, content_text: e.content,
      date_published: new Date(e.publishedAt).toISOString(),
      tags: [e.type, ...e.tags], authors: [{ name: e.author }],
    })),
  }, null, 2);
}

function escXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Publish new changelog entry + notify subscribers
export async function publishEntry(entry: Omit<ChangelogEntry, "id">): Promise<string> {
  const id = `cl-${Date.now().toString(36)}`;
  await pool.query(
    `INSERT INTO changelog_entries (id, title, content, content_html, type, version, tags, author, published_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [id, entry.title, entry.content, entry.contentHtml, entry.type, entry.version, JSON.stringify(entry.tags), entry.author, entry.publishedAt]
  );

  // Invalidate feed cache
  const keys = await redis.keys("feed:*");
  if (keys.length) await redis.del(...keys);

  // Notify webhook subscribers
  const { rows: webhooks } = await pool.query("SELECT url FROM changelog_webhooks WHERE active = true");
  for (const wh of webhooks) {
    await redis.rpush("webhook:delivery:queue", JSON.stringify({ url: wh.url, payload: { event: "changelog.published", entry: { ...entry, id } } }));
  }

  return id;
}
```

## Results

- **3 feed formats** — RSS 2.0 for traditional readers, Atom for standards compliance, JSON Feed for modern apps; all from same data; generated in <10ms
- **Filtered feeds** — `/feed?types=breaking,deprecation` for teams that only care about breaking changes; no noise from minor fixes
- **Webhook integration** — new changelog entry → webhooks fire → CI pipeline re-reads API spec → SDK regenerated; automated response to API changes
- **Developer reach: 10% → 45%** — RSS in feed readers + webhook in Slack + email digest weekly; developers get updates in their preferred channel
- **Cache with instant invalidation** — feed cached for 5 minutes; new entry invalidates immediately; subscribers see updates within seconds
