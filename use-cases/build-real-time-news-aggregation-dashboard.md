---
title: Build a Real-Time News Aggregation Dashboard
slug: build-real-time-news-aggregation-dashboard
description: Build a real-time news dashboard that ingests official RSS feeds, deduplicates stories with PostgreSQL trigram search, tags topics and sentiment, and pushes live updates and alerts through Redis and Hono.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - news-aggregation
  - rss
  - dashboard
  - real-time
  - ai-categorization
---

# Build a Real-Time News Aggregation Dashboard

## The Problem

Pavel leads intelligence at a 20-person fintech. His analysts check a dozen regulator and central-bank pages by hand for market-moving events: rule changes, rate decisions, data releases. Important items get buried, the same story shows up from several outlets, and there is no way to filter by topic or tone. By the time someone forwards the relevant item, the window to act has often closed. He needs one pipeline that ingests the feeds, removes duplicates, tags each item, and alerts the right person within seconds.

## The Solution

Use TypeScript for the ingest worker, PostgreSQL (with the `pg_trgm` extension) for storage and duplicate detection, Redis pub/sub to fan out new articles and queue alerts, Hono for the dashboard API, and Zod to validate every query.

**Only ingest sources whose terms allow it.** Start from feeds the publisher offers for exactly this use: the SEC press releases feed, the Federal Reserve press releases feed and the ECB press feed. Read each publisher's terms before adding a source. If a site has no public feed or API, or puts its articles behind a paywall, do not scrape it. License a news API instead and store only what the license lets you keep (headline, link, snippet). Always identify yourself in the `User-Agent`: the SEC's fair-access rules ask every automated client to declare one with a contact address and to stay under 10 requests per second.

## Step-by-Step Walkthrough

### Step 1: Install the packages and create the schema

```console
$ npm install hono @hono/node-server @hono/zod-validator zod pg ioredis xml2js
$ npm install -D typescript tsx @types/node @types/pg @types/xml2js
$ npm pkg set type=module
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE articles (
  id bigserial PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(id),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  url text NOT NULL UNIQUE,
  published_at timestamptz NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  sentiment real NOT NULL DEFAULT 0,
  duplicate_of bigint REFERENCES articles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX articles_title_trgm ON articles USING gin (title gin_trgm_ops);
CREATE INDEX articles_feed ON articles (published_at DESC) WHERE duplicate_of IS NULL;
CREATE INDEX articles_categories ON articles USING gin (categories);

INSERT INTO sources (id, name, url) VALUES
  ('sec', 'SEC press releases', 'https://www.sec.gov/news/pressreleases.rss'),
  ('fed', 'Federal Reserve press releases', 'https://www.federalreserve.gov/feeds/press_all.xml'),
  ('ecb', 'ECB press', 'https://www.ecb.europa.eu/rss/press.xml');
```

The unique `url` column makes re-polling idempotent, and the trigram index keeps the title-similarity lookup fast.

### Step 2: Ingest, tag, deduplicate and publish

```typescript
// src/ingest.ts
import { Pool } from "pg";
import { Redis } from "ioredis";
import { parseStringPromise } from "xml2js";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
const USER_AGENT = `NewsDashboard/1.0 (${process.env.CONTACT_EMAIL})`;

const RULES: Record<string, string[]> = {
  regulation: ["rule", "regulation", "enforcement", "compliance", "charges"],
  earnings: ["earnings", "revenue", "profit", "quarterly"],
  macro: ["inflation", "interest rate", "gdp", "unemployment", "monetary policy"],
  crypto: ["bitcoin", "ethereum", "crypto", "stablecoin"],
};
const POSITIVE = ["growth", "gain", "upgrade", "approve", "strong"];
const NEGATIVE = ["decline", "loss", "warning", "risk", "fraud", "charges"];

// Keyword rules are a cheap baseline. Swap in an LLM classifier behind the same signatures if you need more.
function categorize(text: string): string[] {
  const t = text.toLowerCase();
  const hits = Object.keys(RULES).filter((c) => RULES[c].some((k) => t.includes(k)));
  return hits.length ? hits : ["general"];
}

function sentiment(text: string): number {
  const t = text.toLowerCase();
  const score = POSITIVE.filter((w) => t.includes(w)).length * 0.2 -
    NEGATIVE.filter((w) => t.includes(w)).length * 0.2;
  return Math.max(-1, Math.min(1, score));
}

interface FeedItem { title: string; link: string; summary: string; published: Date }

async function parseFeed(xml: string): Promise<FeedItem[]> {
  const doc = await parseStringPromise(xml, { explicitArray: false, trim: true });
  const text = (v: any): string => (typeof v === "string" ? v : v?._ ?? "");
  if (doc.rss) {
    return [].concat(doc.rss.channel.item ?? []).map((i: any) => ({
      title: text(i.title),
      link: text(i.link),
      summary: text(i.description).replace(/<[^>]+>/g, "").slice(0, 500),
      published: new Date(text(i.pubDate) || Date.now()),
    }));
  }
  if (doc.feed) {
    return [].concat(doc.feed.entry ?? []).map((e: any) => ({
      title: text(e.title),
      link: ([] as any[]).concat(e.link ?? [])[0]?.$?.href ?? "",
      summary: text(e.summary).replace(/<[^>]+>/g, "").slice(0, 500),
      published: new Date(text(e.published) || text(e.updated) || Date.now()),
    }));
  }
  return [];
}

export async function pollSource(source: { id: string; url: string }): Promise<number> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${source.id}: HTTP ${res.status}`);

  let added = 0;
  for (const item of await parseFeed(await res.text())) {
    if (!item.title || !item.link) continue;

    // Same story from another source in the last 24 h? pg_trgm similarity() returns 0..1.
    const dup = await pool.query(
      `SELECT id FROM articles
        WHERE duplicate_of IS NULL AND created_at > now() - interval '24 hours'
          AND similarity(title, $1) > 0.6
        ORDER BY similarity(title, $1) DESC LIMIT 1`,
      [item.title],
    );
    const text = `${item.title} ${item.summary}`;
    const inserted = await pool.query(
      `INSERT INTO articles (source_id, title, summary, url, published_at, categories, sentiment, duplicate_of)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (url) DO NOTHING
       RETURNING id, title, summary, url, published_at, categories, sentiment, duplicate_of`,
      [source.id, item.title, item.summary, item.link, item.published,
       categorize(text), sentiment(text), dup.rows[0]?.id ?? null],
    );
    if (!inserted.rowCount) continue; // already stored
    added++;

    const article = inserted.rows[0];
    await redis.publish("news:new", JSON.stringify(article));
    if (!article.duplicate_of) await queueAlerts(article);
  }
  return added;
}

async function queueAlerts(article: { title: string; summary: string; categories: string[]; sentiment: number }) {
  const { rows: rules } = await pool.query("SELECT * FROM alert_rules WHERE enabled");
  for (const rule of rules) {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    const keywordOk = !rule.keywords.length || rule.keywords.some((k: string) => text.includes(k.toLowerCase()));
    const categoryOk = !rule.categories.length || rule.categories.some((c: string) => article.categories.includes(c));
    const toneOk = rule.max_sentiment == null || article.sentiment <= rule.max_sentiment;
    if (keywordOk && categoryOk && toneOk) {
      await redis.rpush("alerts:queue", JSON.stringify({ ruleId: rule.id, webhook: rule.webhook_url, article }));
    }
  }
}

// Poll every 5 minutes; one failing source must not stop the others.
export function startPolling() {
  const tick = async () => {
    const { rows } = await pool.query("SELECT id, url FROM sources WHERE enabled");
    await Promise.allSettled(rows.map((s) => pollSource(s).catch((e) => console.error(e.message))));
  };
  void tick();
  return setInterval(tick, 5 * 60_000);
}
```

Add the table the alert step reads:

```sql
CREATE TABLE alert_rules (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  max_sentiment real,
  webhook_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
```

A separate worker pops `alerts:queue` with `BLPOP` and POSTs to the webhook, so a slow Slack endpoint never blocks ingestion.

### Step 3: Serve the dashboard API with Hono and Zod

```typescript
// src/server.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Redis } from "ioredis";
import { pool, startPolling } from "./ingest.js";

const app = new Hono();

const listQuery = z.object({
  category: z.string().optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

app.get("/articles", zValidator("query", listQuery), async (c) => {
  const { category, sentiment, limit, page } = c.req.valid("query");
  const where = ["duplicate_of IS NULL"];
  const params: unknown[] = [];
  if (category) { params.push(category); where.push(`$${params.length} = ANY(categories)`); }
  if (sentiment === "positive") where.push("sentiment > 0.1");
  if (sentiment === "negative") where.push("sentiment < -0.1");
  if (sentiment === "neutral") where.push("sentiment BETWEEN -0.1 AND 0.1");
  const clause = where.join(" AND ");

  const total = await pool.query(`SELECT count(*)::int AS n FROM articles WHERE ${clause}`, params);
  const items = await pool.query(
    `SELECT * FROM articles WHERE ${clause}
      ORDER BY published_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params,
  );
  return c.json({
    items: items.rows, total: total.rows[0].n, page, limit,
    pageCount: Math.ceil(total.rows[0].n / limit),
  });
});

// Server-sent events: each browser tab gets its own Redis subscriber connection.
app.get("/stream", (c) =>
  streamSSE(c, async (stream) => {
    const sub = new Redis(process.env.REDIS_URL!);
    await sub.subscribe("news:new");
    sub.on("message", (_ch, data) => void stream.writeSSE({ event: "article", data }));
    stream.onAbort(() => sub.disconnect());
    while (!stream.aborted) await stream.sleep(15_000);
  }),
);

startPolling();
serve({ fetch: app.fetch, port: 8787, hostname: "127.0.0.1" });
```

Put authentication and a TLS-terminating reverse proxy in front before exposing `/articles` and `/stream`.

### Step 4: Run it

```console
$ export DATABASE_URL=postgres://news:$DB_PASSWORD@127.0.0.1:5432/news
$ export REDIS_URL=redis://127.0.0.1:6379 CONTACT_EMAIL=intel@example.com
$ npx tsx src/server.ts
$ curl -s "http://127.0.0.1:8787/articles?category=regulation&limit=5"
```

## Real-World Example

Pavel's team starts with the three official feeds above and adds two licensed API sources for broader coverage, storing only headline, link and snippet as the licenses allow. A Fed statement and a news-agency rewrite of it arrive minutes apart; the trigram check marks the second as a duplicate of the first, so the feed shows the story once. An alert rule on `regulation` with `max_sentiment` of `-0.2` posts to the compliance Slack channel within one polling cycle plus queue time. Analysts open the dashboard filtered to their topic, and `/stream` adds new items without a refresh.

## Related Skills

- [typescript](/skills/typescript) - typed ingest worker and API
- [redis](/skills/redis) - pub/sub for live updates and a queue for alerts
- [postgresql](/skills/postgresql) - storage, GIN indexes and `pg_trgm` duplicate detection
- [hono](/skills/hono) - lightweight HTTP and SSE server
- [zod](/skills/zod) - validation of every query parameter
