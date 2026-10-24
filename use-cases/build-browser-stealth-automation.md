---
title: Build Browser Stealth Automation
slug: build-browser-stealth-automation
description: Build reliable, polite browser automation with Puppeteer — honest user agent, robots.txt checks, per-domain rate limits in Redis, retries with backoff, and a validated Hono endpoint — for your own sites, end-to-end tests and permitted public data.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - browser-automation
  - scraping
  - puppeteer
  - robots-txt
  - rate-limiting
---

# Build Browser Stealth Automation

## The Problem

Marcus leads data at a 20-person e-commerce intelligence company. They collect public price pages from partner and supplier sites that allow it, plus their own storefront for end-to-end checks. Their Puppeteer scripts hammer pages with no pacing, ignore `robots.txt`, retry instantly on errors and send the default headless user agent, so sites throttle them and flaky pages fail whole runs. They do not need to hide: they need automation that is reliable and polite — it identifies itself, respects the rules each site publishes, paces itself per domain, and recovers from transient failures.

This guide covers legitimate uses only: automating your own sites and apps, end-to-end tests, and collecting public data where the site's terms and `robots.txt` allow it. If a site blocks automated access, ask for an API or written permission rather than working around the block.

## Step 1: Install the pieces

```bash
npm install puppeteer ioredis robots-parser zod hono @hono/node-server
```

Puppeteer downloads a matching Chrome on install. Run Redis bound to `127.0.0.1` only and set `REDIS_URL=redis://127.0.0.1:6379`.

## Step 2: Validate configuration with Zod

Put the client identity and limits in one schema so a missing contact URL fails at startup, not in production.

## Step 3: The polite browser module

The module launches Chrome with an honest user agent (name plus a contact URL), reads and caches each site's `robots.txt` in Redis, honours `Crawl-delay`, limits requests per domain with a shared counter, and retries only transient failures with exponential backoff and `Retry-After`. A `403`, `404` or `451` is a decision by the site, so it is never retried.

```typescript
import puppeteer, { type Browser, type Page } from "puppeteer";
import { Redis } from "ioredis";
import { createRequire } from "node:module";
import { z } from "zod";

type Robots = { isAllowed(url: string, ua?: string): boolean | undefined; getCrawlDelay(ua?: string): number | undefined };
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Robots;
const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

export const Config = z.object({
  botName: z.string().min(1),
  contact: z.url(),
  maxPerMinute: z.number().int().positive().default(6),
  maxAttempts: z.number().int().min(1).max(5).default(3),
});
export type Config = z.infer<typeof Config>;

export const cfg = Config.parse({
  botName: "AcmePriceWatch/1.0",
  contact: "https://acme.example/bot",
});
const userAgent = `${cfg.botName} (+${cfg.contact})`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent({ userAgent });
  await page.setViewport({ width: 1366, height: 768 });
  return { browser, page };
}

export async function allowedByRobots(url: string): Promise<{ ok: boolean; crawlDelay?: number }> {
  const { origin } = new URL(url);
  const key = `robots:${origin}`;
  let body = await redis.get(key);
  if (body === null) {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": userAgent } });
    // RFC 9309: a 4xx robots.txt means no rules; a 5xx means the site is unreachable, so assume disallow
    body = res.ok ? await res.text() : res.status >= 500 ? "User-agent: *\nDisallow: /" : "";
    await redis.set(key, body, "EX", 3600);
  }
  const robots = robotsParser(`${origin}/robots.txt`, body);
  return { ok: robots.isAllowed(url, cfg.botName) !== false, crawlDelay: robots.getCrawlDelay(cfg.botName) };
}

export async function waitForSlot(host: string, perMinute = cfg.maxPerMinute): Promise<void> {
  for (;;) {
    const key = `rate:${host}:${Math.floor(Date.now() / 60_000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 120);
    if (n <= perMinute) return;
    await sleep(60_000 - (Date.now() % 60_000) + 250);
  }
}

export async function politeGoto(page: Page, url: string): Promise<void> {
  const { ok, crawlDelay } = await allowedByRobots(url);
  if (!ok) throw new Error(`robots.txt disallows ${url}`);
  const host = new URL(url).host;
  const perMinute = crawlDelay ? Math.min(cfg.maxPerMinute, Math.floor(60 / crawlDelay)) : cfg.maxPerMinute;
  for (let attempt = 1; ; attempt++) {
    await waitForSlot(host, Math.max(1, perMinute));
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
    const status = res?.status() ?? 0;
    if (status >= 200 && status < 400) return;
    if (status === 403 || status === 404 || status === 451) throw new Error(`${status} for ${url}; not retrying`);
    if (attempt >= cfg.maxAttempts) throw new Error(`giving up on ${url} (status ${status})`);
    const retryAfter = Number(res?.headers()["retry-after"]);
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2 ** attempt * 1000 + Math.random() * 500);
  }
}
```

A `robots.txt` that answers `4xx` is treated as "no rules" and one that answers `5xx` as "disallow everything", as RFC 9309 specifies. `isAllowed` returns `undefined` for an invalid URL, so the check is written as `!== false`. The counter is a fixed one-minute window shared by every worker through Redis, so adding workers does not multiply your request rate.

## Step 4: Expose it as a validated Hono endpoint

Other services in the company post a URL and a CSS selector; Zod rejects malformed input before a browser starts.

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { launch, politeGoto } from "./polite.js";

const Body = z.object({ url: z.url(), selector: z.string().min(1) });
const app = new Hono();

app.post("/check", async (c) => {
  const parsed = Body.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: z.treeifyError(parsed.error) }, 400);
  const { browser, page } = await launch();
  try {
    await politeGoto(page, parsed.data.url);
    const text = await page.$eval(parsed.data.selector, (el) => el.textContent?.trim() ?? "");
    return c.json({ url: parsed.data.url, text });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  } finally {
    await browser.close();
  }
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 8787 });
```

The server binds to `127.0.0.1`; put authentication in front of it before exposing it elsewhere.

```console
$ curl -s -X POST http://127.0.0.1:8787/check -H 'content-type: application/json' \
    -d '{"url":"https://shop.acme.example/p/42","selector":".price"}'
{"url":"https://shop.acme.example/p/42","text":"$24.90"}
```

## Step 5: Practice that keeps it reliable

- Wait for what you need, not for a fixed sleep: `page.waitForSelector(selector, { timeout })` or `waitUntil: "networkidle0"` for pages that load data after navigation.
- Prefer an official API, a feed or a sitemap over scraping when the site offers one.
- Keep `maxPerMinute` low (the default here is 6 per domain) and lower it when a site slows down; a `429` or `503` means back off, not push harder.
- Cache pages you have fetched, and fetch only what you use.
- For your own apps, run the same module in tests with a test user agent and a higher limit.

## Results

Marcus's example team compared a week of runs before and after the change:

- **Fewer failed runs** — transient `5xx` and timeouts are retried with backoff, while `403` and `404` fail fast instead of burning attempts.
- **Rules respected** — pages disallowed by `robots.txt` are never requested, and sites that publish a `Crawl-delay` get it.
- **One identity** — every request carries the bot name and a contact page, so a site operator who sees the traffic can reach the team.
- **Safe to scale** — the shared Redis counter keeps total traffic per domain constant however many workers run.

## Related Skills

- [redis](/skills/redis) — shared counters for per-domain rate limits and the robots.txt cache
- [hono](/skills/hono) — the small HTTP endpoint other services call
- [zod](/skills/zod) — validated configuration and request bodies
