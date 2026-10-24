---
title: "Build an AI Stock Screener"
description: "Create a custom equity screener that pulls prices from Yahoo Finance's chart endpoint and fundamentals from SEC EDGAR, applies fundamental and technical filters, and uses Claude to summarize each company, with a watchlist and price alerts."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [fintech, stocks, investing, ai, screening, technical-analysis]
---

# Build an AI Stock Screener

## The Problem

You are tired of Finviz's limits and Seeking Alpha's paywalls. You want your own screener: filters you define, AI summaries you can inspect, alerts that actually fire. You are a retail investor looking at small-cap growth stocks, with specific criteria (high revenue growth, reasonable P/E, healthy momentum), and you want to scan hundreds of tickers in seconds.

## The Solution

A small TypeScript pipeline with four parts:

- Prices from Yahoo Finance's unofficial chart endpoint (no key; it may change or rate-limit, so swap in Alpaca or Polygon for production).
- Fundamentals (revenue growth, diluted EPS, shares outstanding) from SEC EDGAR's free XBRL API.
- Technical signals (RSI and SMA50/200) computed locally.
- A Claude summary per stock, a watchlist and price alerts, stored with Prisma 7 on PostgreSQL.

Prerequisites: Node.js 20+, PostgreSQL, an `ANTHROPIC_API_KEY`, and `SEC_USER_AGENT` set to something like `"MyScreener you@yourdomain.com"` (SEC asks for a contact address in the User-Agent).

## Step-by-Step Walkthrough

### Step 1: Install and schema

Prisma 7 needs a driver adapter, the `prisma-client` generator with an `output`, and the database URL in `prisma.config.ts`. Pin `@7`: npm `latest` can point at a release candidate.

```bash
npm install --save-dev prisma@7 tsx typescript @types/node @types/pg
npm install @prisma/client@7 @prisma/adapter-pg pg dotenv @anthropic-ai/sdk
# also set "type": "module" in package.json
echo 'DATABASE_URL="postgresql://user:password@127.0.0.1:5432/screener"' > .env
```

```ts
// prisma.config.ts
import "dotenv/config";
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
model Stock {
  id             String          @id @default(cuid())
  ticker         String          @unique
  name           String
  marketCap      Float?
  peRatio        Float?          // trailing: price / diluted EPS
  revenueGrowth  Float?          // latest 10-K vs prior 10-K, %
  eps            Float?
  lastPrice      Float?
  rsi14          Float?
  sma50          Float?
  sma200         Float?
  aiSummary      String?
  updatedAt      DateTime        @updatedAt
  watchlistItems WatchlistItem[]
  priceAlerts    PriceAlert[]
}
model WatchlistItem {
  id      String   @id @default(cuid())
  userId  String
  stockId String
  addedAt DateTime @default(now())
  stock   Stock    @relation(fields: [stockId], references: [id])
  @@unique([userId, stockId])
}
model PriceAlert {
  id          String  @id @default(cuid())
  userId      String
  stockId     String
  targetPrice Float
  direction   String  // "above" | "below"
  triggered   Boolean @default(false)
  stock       Stock   @relation(fields: [stockId], references: [id])
}
```

```bash
npx prisma migrate dev --name init && npx prisma generate
```

### Step 2: Fetch market data and fundamentals

EDGAR gives annual figures from 10-K filings. Revenue growth is the latest 10-K against the prior one; P/E is price divided by diluted EPS; market cap is price times reported shares outstanding. Companies that tag revenue or share counts differently come back as `null` and drop out of filters, so check your tickers.

```ts
// lib/edgar.ts — SEC EDGAR is free; it asks for a descriptive User-Agent with a contact address
const UA = process.env.SEC_USER_AGENT ?? 'ScreenerApp you@example.com';
const get = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};
let tickerMap: Record<string, { cik_str: number; title: string }> | undefined;
export async function lookupCompany(ticker: string) {
  tickerMap ??= Object.fromEntries(
    Object.values(await get('https://www.sec.gov/files/company_tickers.json')).map((c: any) => [c.ticker, c]),
  );
  const c = tickerMap![ticker.toUpperCase()];
  if (!c) throw new Error(`${ticker} not in SEC ticker list`);
  return { cik: String(c.cik_str).padStart(10, '0'), name: c.title as string };
}
type Fact = { start?: string; end: string; val: number; form: string };
// Annual values from 10-K filings (≈ one-year duration), newest first, one per period end
function annual(facts: any, concepts: string[], unit: string): Fact[] {
  for (const c of concepts) {
    const rows: Fact[] | undefined = facts['us-gaap']?.[c]?.units?.[unit];
    if (!rows) continue;
    const days = (f: Fact) => (+new Date(f.end) - +new Date(f.start!)) / 864e5;
    const byEnd = new Map<string, Fact>();
    for (const f of rows) if (f.form === '10-K' && f.start && days(f) > 350 && days(f) < 380) byEnd.set(f.end, f);
    const out = [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));
    if (out.length) return out;
  }
  return [];
}
export async function fetchFundamentals(ticker: string) {
  const { cik, name } = await lookupCompany(ticker);
  const { facts } = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const rev = annual(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'], 'USD');
  const eps = annual(facts, ['EarningsPerShareDiluted'], 'USD/shares');
  const shares: Fact[] = facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  return {
    name,
    revenueGrowth: rev.length >= 2 ? ((rev[0].val - rev[1].val) / Math.abs(rev[1].val)) * 100 : null,
    eps: eps[0]?.val ?? null,
    sharesOutstanding: shares.at(-1)?.val ?? null, // approximate: a company can report several share classes
  };
}
```

```ts
// lib/market-data.ts
import { prisma } from './prisma';
import { fetchFundamentals } from './edgar';
// Yahoo's chart endpoint is unofficial and may change or rate-limit; swap in Alpaca/Polygon for production
export async function fetchCloses(ticker: string): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo ${ticker}: ${res.status}`);
  const data = await res.json();
  const closes: (number | null)[] = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((c): c is number => c !== null);
}
export async function updateStockData(ticker: string) {
  const [prices, f] = await Promise.all([fetchCloses(ticker), fetchFundamentals(ticker)]);
  const lastPrice = prices.at(-1) ?? null;
  const data = {
    name: f.name,
    lastPrice,
    eps: f.eps,
    revenueGrowth: f.revenueGrowth,
    peRatio: lastPrice && f.eps && f.eps > 0 ? lastPrice / f.eps : null,
    marketCap: lastPrice && f.sharesOutstanding ? lastPrice * f.sharesOutstanding : null,
  };
  await prisma.stock.upsert({ where: { ticker }, update: data, create: { ticker, ...data } });
  return { ticker, lastPrice, prices };
}
```

```ts
// lib/prisma.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
```

### Step 3: Technical indicators

```ts
// lib/technicals.ts
import { prisma } from './prisma';
const sma = (p: number[], n: number) => p.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, p.length);
// RSI with Wilder's smoothing
function rsi(p: number[], n = 14): number {
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = p[i] - p[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}
export async function computeAndStoreTechnicals(ticker: string, prices: number[]) {
  if (prices.length < 200) return; // SMA200 needs 200 closes
  await prisma.stock.update({
    where: { ticker },
    data: { rsi14: rsi(prices), sma50: sma(prices, 50), sma200: sma(prices, 200) },
  });
}
```

### Step 4: Screener query

Filters are optional; a missing value is skipped and a `null` column never matches a set filter.

```ts
// lib/screener.ts
import { prisma } from './prisma';
export interface ScreenerFilters {
  maxPE?: number; minMarketCapM?: number; maxMarketCapM?: number; // market cap in millions
  minRevenueGrowth?: number; minRSI?: number; maxRSI?: number;
}
export function runScreener(f: ScreenerFilters) {
  const range = (min?: number, max?: number) =>
    min === undefined && max === undefined ? undefined : { gte: min, lte: max };
  return prisma.stock.findMany({
    where: {
      peRatio: f.maxPE === undefined ? undefined : { gt: 0, lte: f.maxPE },
      marketCap: range(f.minMarketCapM && f.minMarketCapM * 1e6, f.maxMarketCapM && f.maxMarketCapM * 1e6),
      revenueGrowth: range(f.minRevenueGrowth),
      rsi14: range(f.minRSI, f.maxRSI),
    },
    orderBy: { revenueGrowth: 'desc' },
    take: 20,
  });
}
```

### Step 5: AI summary

Claude only sees the numbers you pass it, so the prompt tells it not to add facts. For real filing text, fetch the 10-K from EDGAR and add the relevant sections to the prompt.

```ts
// lib/ai-analysis.ts
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
export async function analyzeStock(ticker: string) {
  const s = await prisma.stock.findUnique({ where: { ticker } });
  if (!s) throw new Error(`Stock ${ticker} not found`);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analyze this stock for a growth-focused retail investor in 3-4 sentences. Use only these figures (trailing P/E, market cap in USD, revenue growth % from the latest 10-K, diluted EPS, RSI14, price vs SMA200); do not invent facts.
${JSON.stringify({ ticker, pe: s.peRatio, marketCap: s.marketCap, revenueGrowthPct: s.revenueGrowth, eps: s.eps, rsi14: s.rsi14, aboveSma200: s.lastPrice && s.sma200 ? s.lastPrice > s.sma200 : null})}
Reply with only JSON: {"summary": "...", "bullCase": "...", "bearCase": "...", "verdict": "buy|hold|watch|avoid"}`,
    }],
  });
  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : '';
  const match = text.match(/\{[\s\S]*\}/);
  const analysis = match ? JSON.parse(match[0]) : { summary: text };
  await prisma.stock.update({ where: { ticker }, data: { aiSummary: analysis.summary } });
  return analysis;
}
```

### Step 6: Price alerts

```ts
// lib/price-alerts.ts
import { prisma } from './prisma';
export async function checkPriceAlerts() {
  const alerts = await prisma.priceAlert.findMany({ where: { triggered: false }, include: { stock: true } });
  const fired = alerts.filter(({ stock: { lastPrice: p }, direction, targetPrice }) =>
    p !== null && (direction === 'above' ? p >= targetPrice : p <= targetPrice));
  for (const a of fired) await prisma.priceAlert.update({ where: { id: a.id }, data: { triggered: true } });
  return fired.map((a) => ({ ticker: a.stock.ticker, price: a.stock.lastPrice, target: a.targetPrice }));
}
```

### Step 7: Run it

Write `scripts/run.ts` that loops over your tickers, calls `updateStockData` then `computeAndStoreTechnicals(ticker, prices)`, then `runScreener({ maxPE: 60, minRevenueGrowth: 20, minRSI: 40, maxRSI: 70 })` and `analyzeStock` on the top hit. Run it with `npx tsx scripts/run.ts` and put it in cron. Pause 500 ms between tickers to stay polite to both APIs.

## Real-World Example
A retail investor keeps a list of 80 small-cap software tickers and runs the script each evening from cron. The screen (P/E under 60, revenue growth over 20%, RSI between 40 and 70) leaves a handful of names; those get a Claude summary, and the investor adds the interesting ones to the watchlist with an alert 5% below the current price. The summary is a starting point for reading the filing, not a recommendation.

## Related Skills
- [anthropic-sdk](/skills/anthropic-sdk) - Claude Messages API for the summaries
- [prisma](/skills/prisma) - Schema, migrations and the Prisma 7 client
