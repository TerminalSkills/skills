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

Max leads DevRel at a 20-person API company. Developers want to know when the API changes: new endpoints, deprecations, breaking changes. The changelog page exists but nobody visits it, and email announcements get skimmed. Some developers want a feed in their reader; others want a webhook that triggers a CI job. They need one source of truth published as RSS 2.0, Atom and JSON Feed, filterable by change type, with webhook notifications on every new entry.

## The Solution

Entries live in `postgresql`. A small `hono` service validates input with `zod`, renders the three formats from one `typescript` module, caches results in `redis`, and pushes a delivery job for every active webhook when an entry is published. Start with the schema:

```sql
CREATE TABLE changelog_entries (
  id text PRIMARY KEY, title text NOT NULL, content text NOT NULL, content_html text NOT NULL,
  type text NOT NULL CHECK (type IN ('feature','improvement','fix','deprecation','breaking')),
  version text, tags text[] NOT NULL DEFAULT '{}', author text NOT NULL,
  published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON changelog_entries (published_at DESC);

CREATE TABLE changelog_webhooks (id serial PRIMARY KEY, url text NOT NULL, active boolean NOT NULL DEFAULT true);
```

```bash
npm install hono @hono/node-server zod pg ioredis && npm install -D typescript tsx @types/node @types/pg
```

## Step-by-Step Walkthrough

### Step 1: Feed renderers

Pure functions with no I/O. Every interpolated value is XML-escaped, and `]]>` inside HTML is split so it cannot close the CDATA section early.

```typescript
// src/feed.ts
export interface ChangelogEntry {
  id: string; title: string; content: string; contentHtml: string;
  type: "feature" | "improvement" | "fix" | "deprecation" | "breaking";
  version: string | null; tags: string[]; publishedAt: string; author: string;
}

export const FEED_META = {
  title: process.env.PRODUCT_NAME ?? "API Changelog",
  description: "Latest updates, features, and changes",
  link: process.env.CHANGELOG_URL ?? "https://example.com/changelog",
  feedUrl: process.env.FEED_URL ?? "https://example.com/changelog/feed",
};

export const escXml = (s: string) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const el = (name: string, v: string, attrs = "") => `<${name}${attrs}>${escXml(v)}</${name}>`;
const cdata = (s: string) => `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`; // split "]]>"
const url = (e: ChangelogEntry) => `${FEED_META.link}/${e.id}`;
const xml = (root: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${root}`;

export function generateRSS(entries: ChangelogEntry[]): string {
  const items = entries.map((e) => `    <item>
      ${el("title", e.title)}${el("link", url(e))}<guid isPermaLink="false">${escXml(e.id)}</guid>
      ${el("pubDate", new Date(e.publishedAt).toUTCString())}${el("category", e.type)}
      ${el("description", e.content)}<content:encoded>${cdata(e.contentHtml)}</content:encoded>
    </item>`).join("\n");
  return xml(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    ${el("title", FEED_META.title)}${el("link", FEED_META.link)}${el("description", FEED_META.description)}
    <atom:link href="${escXml(FEED_META.feedUrl)}" rel="self" type="application/rss+xml" />
    ${el("lastBuildDate", new Date().toUTCString())}
${items}
  </channel>
</rss>`);
}

export function generateAtom(entries: ChangelogEntry[]): string {
  const items = entries.map((e) => `  <entry>
    ${el("title", e.title)}<link href="${escXml(url(e))}" />${el("id", `urn:changelog:${e.id}`)}
    ${el("updated", new Date(e.publishedAt).toISOString())}<category term="${escXml(e.type)}" />
    ${el("summary", e.content.slice(0, 300))}${el("content", e.contentHtml, ' type="html"')}
    <author>${el("name", e.author)}</author>
  </entry>`).join("\n");
  const updated = new Date(entries[0]?.publishedAt ?? Date.now()).toISOString();
  return xml(`<feed xmlns="http://www.w3.org/2005/Atom">
  ${el("title", FEED_META.title)}<link href="${escXml(FEED_META.link)}" /><link href="${escXml(FEED_META.feedUrl)}" rel="self" />
  ${el("updated", updated)}${el("id", FEED_META.link)}
${items}
</feed>`);
}

export function generateJSON(entries: ChangelogEntry[]): string {
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: FEED_META.title,
    home_page_url: FEED_META.link,
    feed_url: `${FEED_META.feedUrl}?format=json`,
    items: entries.map((e) => ({
      id: e.id, title: e.title, url: url(e),
      content_html: e.contentHtml, content_text: e.content,
      date_published: new Date(e.publishedAt).toISOString(),
      tags: [e.type, ...e.tags], authors: [{ name: e.author }],
    })),
  }, null, 2);
}
```

### Step 2: The service

```typescript
// src/server.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import pg from "pg";
import { Redis } from "ioredis";
import { type ChangelogEntry, generateAtom, generateJSON, generateRSS } from "./feed";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
const TYPES = ["feature", "improvement", "fix", "deprecation", "breaking"] as const;
const csv = z.string().optional().transform((v) => (v ? v.split(",").filter(Boolean) : []));
const feedQuery = z.object({
  format: z.enum(["rss", "atom", "json"]).default("rss"),
  types: csv.pipe(z.array(z.enum(TYPES))),
  tags: csv,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const entryBody = z.object({
  title: z.string().min(1).max(200), content: z.string().min(1), contentHtml: z.string().min(1),
  type: z.enum(TYPES), version: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]), author: z.string().min(1),
});
const webhookBody = z.object({ url: z.url({ protocol: /^https$/ }) });
async function getEntries(q: z.infer<typeof feedQuery>): Promise<ChangelogEntry[]> {
  // The version counter replaces KEYS + DEL: bumping it orphans every cached feed
  const version = (await redis.get("feed:version")) ?? "0";
  const key = `feed:${version}:${q.types}:${q.tags}:${q.limit}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    `SELECT id, title, content, content_html AS "contentHtml", type, version, tags,
            to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt", author
       FROM changelog_entries
      WHERE published_at IS NOT NULL
        AND (cardinality($1::text[]) = 0 OR type = ANY($1))
        AND (cardinality($2::text[]) = 0 OR tags && $2)
      ORDER BY published_at DESC LIMIT $3`,
    [q.types, q.tags, q.limit],
  );
  await redis.set(key, JSON.stringify(rows), "EX", 300);
  return rows;
}
const app = new Hono();
app.get("/changelog/feed", async (c) => {
  const parsed = feedQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: z.treeifyError(parsed.error) }, 400);
  const entries = await getEntries(parsed.data);
  switch (parsed.data.format) {
    case "atom": return c.body(generateAtom(entries), 200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    case "json": return c.body(generateJSON(entries), 200, { "Content-Type": "application/feed+json; charset=utf-8" });
    default: return c.body(generateRSS(entries), 200, { "Content-Type": "application/rss+xml; charset=utf-8" });
  }
});

// Protect this route (API key or session) before exposing it
app.post("/changelog/entries", async (c) => {
  const parsed = entryBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: z.treeifyError(parsed.error) }, 400);
  const e = parsed.data;
  const id = `cl-${Date.now().toString(36)}`;
  await pool.query(
    `INSERT INTO changelog_entries (id, title, content, content_html, type, version, tags, author, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, e.title, e.content, e.contentHtml, e.type, e.version, e.tags, e.author],
  );
  await redis.incr("feed:version");
  const { rows } = await pool.query("SELECT url FROM changelog_webhooks WHERE active");
  for (const wh of rows) {
    await redis.rpush("webhook:delivery:queue", JSON.stringify({ url: wh.url, event: "changelog.published", id, type: e.type, title: e.title }));
  }
  return c.json({ id }, 201);
});
app.post("/changelog/webhooks", async (c) => {
  const parsed = webhookBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: z.treeifyError(parsed.error) }, 400);
  await pool.query("INSERT INTO changelog_webhooks (url) VALUES ($1)", [parsed.data.url]);
  return c.json({ ok: true }, 201);
});
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 });
```

Notes:

- Zod validates the query (`/changelog/feed?format=atom&types=breaking,deprecation&limit=20`); an unknown type returns 400. All SQL is parameterized, using `type = ANY($1)` and the array-overlap operator `tags && $2`.
- Cache invalidation bumps a version counter in the cache key. `KEYS` scans the whole keyspace and blocks Redis, and the counter needs no scan at all; old keys expire after 5 minutes.
- Webhook URLs must be `https`, and the worker in Step 3 refuses private and loopback addresses, signs every payload and applies timeouts and retries, because subscribers supply these URLs.
- The server binds to 127.0.0.1; put a reverse proxy in front for public traffic and add authentication to `POST /changelog/entries`.

### Step 3: Webhook delivery worker

A second process drains the queue that `POST /changelog/entries` fills. Subscribers supply the URLs, so the worker refuses private, loopback and link-local targets (checked at connect time, so DNS cannot change between check and request), does not follow redirects, signs the body with HMAC-SHA256, times out after 5 seconds and retries up to 3 times. It uses top-level `await`, so set `"type": "module"` in `package.json`, and run it with `WEBHOOK_SECRET` and `REDIS_URL` set.

```typescript
// src/worker.ts - run with: npx tsx src/worker.ts
import { createHmac } from "node:crypto";
import { lookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);
const SECRET = process.env.WEBHOOK_SECRET!;
const blocked = new BlockList(); // private, loopback, link-local and metadata ranges
for (const [net, bits] of [["10.0.0.0", 8], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.168.0.0", 16], ["100.64.0.0", 10], ["0.0.0.0", 8]] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::1", 128], ["fc00::", 7], ["fe80::", 10], ["::", 128]] as const) blocked.addSubnet(net, bits, "ipv6");
const isBlocked = (ip: string) => blocked.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
// Node skips lookup for IP literals, so post() checks those itself
const safeLookup: typeof lookup = ((host: string, opts: object, cb: Function) =>
  lookup(host, opts as never, (err, address, family) => {
    const ips = Array.isArray(address) ? address.map((a) => a.address) : [address as unknown as string];
    if (!err && ips.some(isBlocked)) return cb(new Error("blocked address"));
    cb(err, address, family);
  })) as never;
function post(url: string, body: string, signature: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isBlocked(host)) return reject(new Error("blocked address"));
    const req = request(url, {
      method: "POST", lookup: safeLookup, timeout: 5000, // redirects are not followed
      headers: { "Content-Type": "application/json", "X-Changelog-Signature": `sha256=${signature}` },
    }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
async function deliver(job: { url: string }) {
  const body = JSON.stringify(job);
  const signature = createHmac("sha256", SECRET).update(body).digest("hex");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const status = await post(job.url, body, signature);
      if (status >= 200 && status < 300) return console.log("delivered", job.url);
      if (status < 500 && status !== 429) return console.warn("rejected", status, job.url); // retrying will not help
    } catch (err) {
      if ((err as Error).message === "blocked address") return console.warn("blocked", job.url);
      console.warn("attempt", attempt, job.url, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
  }
  console.error("gave up", job.url);
}
while (true) {
  const item = await redis.blpop("webhook:delivery:queue", 0);
  if (item) await deliver(JSON.parse(item[1]));
}
```

Receivers recompute `HMAC-SHA256(secret, rawBody)` and compare it with `X-Changelog-Signature` in constant time. Delivery is at-least-once: an entry popped just before a crash is lost, so use a reliable-queue pattern or BullMQ if you cannot tolerate that.

### Step 4: Make it discoverable and check it

Add feed autodiscovery to the changelog page's `<head>` so reader apps find it:

```html
<link rel="alternate" type="application/rss+xml" title="API Changelog" href="/changelog/feed">
<link rel="alternate" type="application/atom+xml" title="API Changelog (Atom)" href="/changelog/feed?format=atom">
<link rel="alternate" type="application/feed+json" title="API Changelog (JSON)" href="/changelog/feed?format=json">
```

Request `http://127.0.0.1:3000/changelog/feed?format=json&types=breaking`, then run the RSS and Atom responses through a feed validator such as https://validator.w3.org/feed/ (public URL or pasted text) before announcing the URL.

## Real-World Example

Max's team publishes an entry whenever the API ships a breaking change or deprecation. A customer's CI subscribes to `?types=breaking,deprecation` through a Slack RSS integration, and two partners register webhooks that regenerate their SDKs. Because feeds are cached for five minutes and the cache is invalidated on publish, new entries show up within seconds. After a quarter the team found that the changelog was being read mostly through feed readers and the webhook-driven Slack channel rather than the web page (their own analytics, not a benchmark).

## Related Skills

- [typescript](/skills/typescript): types for entries and feed options
- [redis](/skills/redis): feed cache and webhook delivery queue
- [postgresql](/skills/postgresql): entry storage and filtered queries
- [hono](/skills/hono): the HTTP service
- [zod](/skills/zod): query and body validation
