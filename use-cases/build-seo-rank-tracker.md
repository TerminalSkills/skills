---
title: "Build a Keyword Rank Tracker"
slug: build-seo-rank-tracker
description: "Monitor Google keyword positions on a schedule across thousands of keywords and many client sites, with position-change alerts and historical data."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "10 hours"
tags: [seo, rank-tracking, keywords, analytics, alerts, agency]
---

# Build a Keyword Rank Tracker

## The Problem

Commercial rank trackers charge by tracked keyword, and an agency with 50 clients and thousands of keywords outgrows the cheap tiers quickly. The core need is simple: check Google rankings on a schedule and alert when something changes. You want to own the data and put your own branding on it.

## Who This Is For

**Persona:** An SEO agency owner with 50 clients who currently mixes a hosted tracker with manual checks, and wants a tool on their own server that they can offer to clients as an add-on.

## What You'll Build

- Keyword management per client project (country, language, device)
- Scheduled rank checks through the SerpAPI Google Search API
- Position-change alerts (5 or more places) by email, one email per client
- A history query for per-keyword position charts

## Architecture

```
cron / systemd timer (daily)
    ↓
rank-checker.ts   → SerpAPI (one search per results page, stops when the domain is found)
    ↓
Prisma → Postgres: RankSnapshot
    ↓
alerts.ts: compare the two newest snapshots → Resend email per client
```

A long-running batch like this belongs in a plain Node process started by cron or a systemd timer, not in a serverless function: thousands of keywords outlive a function's time limit, and work started after the response is sent can be killed.

## Step 1: Data Schema

Tested with Prisma 7.10 (`prisma-client` generator, Postgres driver adapter). Prisma 7 reads the connection URL from `prisma.config.ts`, not the schema.

```console
$ npm install @prisma/client@7 @prisma/adapter-pg@7 pg resend
$ npm install -D prisma@7 typescript tsx @types/node @types/pg
```

Pin the `7` major: the `latest` tag of the `prisma` CLI package currently points at an 8.0 release candidate, which this page's config and generator were not tested with.

```typescript
// prisma.config.ts
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Project {
  id          String              @id @default(cuid())
  name        String
  domain      String              // bare host, e.g. "example.com"
  clientEmail String
  keywords    Keyword[]
  createdAt   DateTime            @default(now())
}

model Keyword {
  id        String         @id @default(cuid())
  projectId String
  project   Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  keyword   String
  country   String         @default("us")
  language  String         @default("en")
  device    String         @default("desktop") // desktop | mobile
  snapshots RankSnapshot[]
  createdAt DateTime       @default(now())

  @@unique([projectId, keyword, country, language, device])
}

model RankSnapshot {
  id        String   @id @default(cuid())
  keywordId String
  keyword   Keyword  @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  position  Int?     // null = not found in the pages we fetched
  url       String?  // the URL that actually ranks
  checkedAt DateTime @default(now())

  @@index([keywordId, checkedAt])
}
```

Run `npx prisma generate` and `npx prisma migrate dev --name init` (use `prisma migrate deploy` in production).

## Step 2: Rank Checking Worker

SerpAPI's Google endpoint (`https://serpapi.com/search.json`) takes `q`, `gl` (country), `hl` (language), `device` (`desktop`, `tablet` or `mobile`) and `start` (result offset). It does not offer a "100 results" parameter, so each page of about 10 results is a separate search and counts against your plan. The worker therefore fetches page by page and stops as soon as the domain appears, up to `MAX_PAGES`.

```typescript
// src/db.ts — Prisma 7 needs a driver adapter
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// src/rank-checker.ts — one SerpAPI search per results page, stop as soon as the domain shows up
import { prisma } from "./db.js";
import { runAlerts } from "./alerts.js";

const SERPAPI = process.env.SERPAPI_BASE ?? "https://serpapi.com/search.json";
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 3); // 3 pages ≈ top 30; every page is 1 billed search
const CONCURRENCY = 5;

type Organic = { position: number; link: string };
type Check = { id: string; keyword: string; country: string; language: string; device: string; project: { domain: string } };

async function fetchPage(k: Check, page: number): Promise<Organic[]> {
  const params = new URLSearchParams({
    engine: "google",
    q: k.keyword,
    gl: k.country,
    hl: k.language,
    device: k.device,
    start: String(page * 10),
    api_key: process.env.SERPAPI_KEY!,
  });
  const res = await fetch(`${SERPAPI}?${params}`);
  const body = (await res.json()) as { error?: string; organic_results?: Organic[] };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.organic_results ?? [];
}

// Match on hostname, not substring: "notexample.com" must not count as "example.com".
function isDomain(link: string, domain: string): boolean {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

async function checkKeyword(k: Check) {
  let found: Organic | undefined;
  for (let page = 0; page < MAX_PAGES && !found; page++) {
    const results = await fetchPage(k, page);
    if (results.length === 0) break;
    found = results.find((r) => isDomain(r.link, k.project.domain));
    // SerpAPI's sample for start=10 numbers results from 1 again: make the position absolute
    if (found && page > 0 && found.position <= page * 10) found = { ...found, position: page * 10 + found.position };
  }
  await prisma.rankSnapshot.create({
    data: { keywordId: k.id, position: found?.position ?? null, url: found?.link ?? null },
  });
}

export async function runDailyRankCheck() {
  const keywords = await prisma.keyword.findMany({ include: { project: true } });
  console.log(`Checking ${keywords.length} keywords...`);
  const queue = [...keywords];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let k = queue.shift(); k; k = queue.shift()) {
        try {
          await checkKeyword(k);
        } catch (err) {
          // A failed check writes no snapshot, so it can never look like "dropped out of the results"
          console.error(`keyword ${k.id} failed:`, (err as Error).message);
        }
      }
    }),
  );
  await runAlerts();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDailyRankCheck().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
}
```

## Step 3: Position Change Alerts

```typescript
// src/alerts.ts — compare the two newest snapshots, send one email per client
import { Resend } from "resend";
import { prisma } from "./db.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const THRESHOLD = 5;
const OUT = 101; // treat "not found" as just past the pages we fetched

type Move = { keyword: string; domain: string; before: number | null; after: number | null; change: number };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const show = (p: number | null) => (p === null ? "not in top results" : `#${p}`);

export async function runAlerts() {
  const keywords = await prisma.keyword.findMany({
    include: { project: true, snapshots: { orderBy: { checkedAt: "desc" }, take: 2 } },
  });

  const byClient = new Map<string, Move[]>();
  for (const k of keywords) {
    if (k.snapshots.length < 2) continue;
    const [now, before] = [k.snapshots[0].position, k.snapshots[1].position];
    const change = (before ?? OUT) - (now ?? OUT); // positive = moved up
    if (Math.abs(change) < THRESHOLD) continue;
    const list = byClient.get(k.project.clientEmail) ?? [];
    list.push({ keyword: k.keyword, domain: k.project.domain, before, after: now, change });
    byClient.set(k.project.clientEmail, list);
  }

  for (const [email, moves] of byClient) {
    const row = (m: Move) =>
      `<li><strong>${esc(m.keyword)}</strong> (${esc(m.domain)}): ${show(m.before)} → ${show(m.after)}</li>`;
    const up = moves.filter((m) => m.change > 0);
    const down = moves.filter((m) => m.change < 0);
    const { error } = await resend.emails.send({
      from: process.env.ALERT_FROM!, // an address on a domain verified in Resend
      to: email,
      subject: `Rank alert: ${moves.length} keyword${moves.length === 1 ? "" : "s"} moved`,
      html: `<h2>Keyword position changes</h2>
        ${up.length ? `<h3>Up (${up.length})</h3><ul>${up.map(row).join("")}</ul>` : ""}
        ${down.length ? `<h3>Down (${down.length})</h3><ul>${down.map(row).join("")}</ul>` : ""}`,
    });
    if (error) console.error(`alert to ${email} failed:`, error.message);
  }
}
```

Verify your sending domain in Resend and use an address on it for `ALERT_FROM`. The `esc()` helper matters: keywords are user input going into HTML.

## Step 4: History for Charts

```typescript
// src/history.ts — data for a position chart (call from any route handler)
import { prisma } from "./db.js";

export async function keywordHistory(keywordId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.rankSnapshot.findMany({
    where: { keywordId, checkedAt: { gte: since } },
    orderBy: { checkedAt: "asc" },
    select: { position: true, checkedAt: true },
  });
  return rows.map((r) => ({ date: r.checkedAt.toISOString().slice(0, 10), position: r.position }));
}
```

Plot it with a chart library such as Recharts or ECharts, inverting the y-axis so position 1 is at the top. A `null` position means "not found in the pages fetched".

## Step 5: Schedule It

Put the secrets in an env file readable only by the service user (`DATABASE_URL`, `SERPAPI_KEY`, `RESEND_API_KEY`, `ALERT_FROM`) and run the worker from cron:

```console
$ crontab -l
0 3 * * * cd /srv/rank-tracker && node --env-file=.env --import tsx src/rank-checker.ts >> /var/log/rank-tracker.log 2>&1
```

## Cost Analysis

SerpAPI bills per search, and monthly plans are fixed (checked on serpapi.com/pricing, October 2026): $25 for 1,000, $75 for 5,000, $150 for 15,000, $275 for 30,000 searches. Cost is driven by how often you check and how deep you look; the table assumes the domain is found on page 1 (1 search per check).

| Keywords | Check frequency | Searches/month | Fits plan |
|----------|-----------------|----------------|-----------|
| 500 | weekly | ~2,200 | $75 |
| 500 | daily | ~15,000 (15,500 in a 31-day month) | $275 |
| 5,000 | weekly | ~21,700 | $275 |
| 5,000 | daily | ~150,000 | above the listed plans; ask SerpAPI for a quote |

Keywords that rank deeper, or not at all, cost up to `MAX_PAGES` searches per check. Daily checks of every keyword are rarely worth it: weekly for the long tail and daily for each client's top 50 keywords keeps both cost and noise down.

## Next Steps
1. Competitor tracking: add a `ProjectCompetitor` table and record each competitor's position from the same SERP response, at no extra search cost
2. Weekly summary email per client, and a dashboard with position timelines
3. Google Search Console data (impressions, clicks) for your clients' own sites, free through its API

## Related Skills

- [prisma](../skills/prisma/SKILL.md) — schema, migrations and the typed client
- [resend](../skills/resend/SKILL.md) — transactional email for the alerts
