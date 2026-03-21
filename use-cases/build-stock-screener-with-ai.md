---
title: "Build an AI Stock Screener"
description: "Create a custom equity screener that pulls market data from Yahoo Finance or Alpaca, applies fundamental and technical filters, and uses Claude to summarize company fundamentals from SEC filings — with a watchlist and price alerts."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [fintech, stocks, investing, ai, screening, technical-analysis]
---

# Build an AI Stock Screener

You're tired of Finviz's limitations and Seeking Alpha's paywalls. You want **your own screener** — filters you define, AI summaries you trust, alerts that actually fire.

## Who This Is For

A retail investor focusing on small-cap growth stocks. You have specific criteria — high revenue growth, reasonable P/E, strong momentum — and want to scan thousands of stocks in seconds.

## What You'll Build

- 📈 Market data pipeline — Yahoo Finance / Alpaca API
- 🔍 Screener filters — P/E, market cap, revenue growth, momentum
- 🧠 AI analysis — fundamentals from SEC filings summarized by Claude
- 📉 Technical signals — RSI, MACD, moving averages
- 📋 Watchlist with price alerts

## Prerequisites

- Anthropic API key
- Alpaca Markets account (free tier) or Yahoo Finance access
- PostgreSQL database

---

## Step 1: Schema

```prisma
// schema.prisma
model Stock {
  id            String      @id @default(cuid())
  ticker        String      @unique
  name          String
  marketCap     Float?
  peRatio       Float?
  revenueGrowth Float?      // YoY %
  eps           Float?
  sector        String?
  lastPrice     Float?
  rsi14         Float?
  macd          Float?
  sma50         Float?
  sma200        Float?
  aiSummary     String?
  updatedAt     DateTime    @updatedAt
  watchlistItems WatchlistItem[]
  priceAlerts   PriceAlert[]
}

model WatchlistItem {
  id        String   @id @default(cuid())
  userId    String
  stockId   String
  addedAt   DateTime @default(now())
  stock     Stock    @relation(fields: [stockId], references: [id])
}

model PriceAlert {
  id         String   @id @default(cuid())
  userId     String
  stockId    String
  targetPrice Float
  direction  String   // "above" | "below"
  triggered  Boolean  @default(false)
  stock      Stock    @relation(fields: [stockId], references: [id])
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: Fetch Market Data

```typescript
// lib/market-data.ts
import { prisma } from './prisma';

// Using Yahoo Finance via unofficial API (or swap for Alpaca)
async function fetchYahooQuote(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  return data.chart?.result?.[0];
}

async function fetchYahooStats(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,summaryDetail`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  return data.quoteSummary?.result?.[0];
}

export async function updateStockData(ticker: string) {
  const [quote, stats] = await Promise.all([
    fetchYahooQuote(ticker),
    fetchYahooStats(ticker),
  ]);

  const prices: number[] = quote?.indicators?.quote?.[0]?.close ?? [];
  const lastPrice = prices[prices.length - 1];

  const keyStats = stats?.defaultKeyStatistics;
  const financialData = stats?.financialData;

  await prisma.stock.upsert({
    where: { ticker },
    update: {
      lastPrice,
      peRatio: keyStats?.forwardPE?.raw,
      marketCap: keyStats?.enterpriseValue?.raw,
      revenueGrowth: financialData?.revenueGrowth?.raw * 100,
      eps: keyStats?.trailingEps?.raw,
    },
    create: {
      ticker,
      name: ticker,
      lastPrice,
      peRatio: keyStats?.forwardPE?.raw,
      marketCap: keyStats?.enterpriseValue?.raw,
      revenueGrowth: financialData?.revenueGrowth?.raw * 100,
      eps: keyStats?.trailingEps?.raw,
    }
  });

  return { ticker, lastPrice, prices };
}
```

---

## Step 3: Technical Indicators

```typescript
// lib/technicals.ts
import { prisma } from './prisma';

function sma(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function rsi(prices: number[], period = 14): number {
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function macd(prices: number[]): number {
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  return ema12[ema12.length - 1] - ema26[ema26.length - 1];
}

export async function computeAndStoreTechnicals(ticker: string, prices: number[]) {
  if (prices.length < 200) return;

  await prisma.stock.update({
    where: { ticker },
    data: {
      rsi14: rsi(prices),
      macd: macd(prices),
      sma50: sma(prices, 50),
      sma200: sma(prices, 200),
    }
  });
}
```

---

## Step 4: Screener Query

```typescript
// lib/screener.ts
import { prisma } from './prisma';

export interface ScreenerFilters {
  maxPE?: number;
  minMarketCapM?: number;  // millions
  maxMarketCapM?: number;
  minRevenueGrowth?: number;  // %
  maxRSI?: number;
  minRSI?: number;
  aboveSMA200?: boolean;
}

export async function runScreener(filters: ScreenerFilters) {
  return prisma.stock.findMany({
    where: {
      AND: [
        filters.maxPE ? { peRatio: { lte: filters.maxPE } } : {},
        filters.minMarketCapM ? { marketCap: { gte: filters.minMarketCapM * 1e6 } } : {},
        filters.maxMarketCapM ? { marketCap: { lte: filters.maxMarketCapM * 1e6 } } : {},
        filters.minRevenueGrowth ? { revenueGrowth: { gte: filters.minRevenueGrowth } } : {},
        filters.maxRSI ? { rsi14: { lte: filters.maxRSI } } : {},
        filters.minRSI ? { rsi14: { gte: filters.minRSI } } : {},
      ]
    },
    orderBy: { revenueGrowth: 'desc' },
    take: 20,
  });
}

// Example: small-cap growth screen
// runScreener({ maxPE: 30, minMarketCapM: 300, maxMarketCapM: 2000, minRevenueGrowth: 20, minRSI: 40, maxRSI: 70 })
```

---

## Step 5: AI Fundamental Analysis

```typescript
// lib/ai-analysis.ts
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';

const anthropic = new Anthropic();

export async function analyzeStock(ticker: string) {
  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) throw new Error(`Stock ${ticker} not found`);

  // In production: fetch actual SEC filing text from EDGAR
  // Here we use stats as a proxy
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analyze this stock for a growth-focused retail investor. Be concise (3-4 sentences). Highlight key risks and opportunities.

Ticker: ${ticker}
P/E Ratio: ${stock.peRatio?.toFixed(1) ?? 'N/A'}
Market Cap: $${((stock.marketCap ?? 0) / 1e9).toFixed(1)}B
Revenue Growth YoY: ${stock.revenueGrowth?.toFixed(1) ?? 'N/A'}%
EPS: ${stock.eps?.toFixed(2) ?? 'N/A'}
RSI (14): ${stock.rsi14?.toFixed(1) ?? 'N/A'}
Price vs SMA200: ${stock.lastPrice && stock.sma200 ? (stock.lastPrice > stock.sma200 ? 'Above' : 'Below') : 'N/A'}
MACD: ${stock.macd?.toFixed(2) ?? 'N/A'}

Provide a JSON: { "summary": "...", "bullCase": "...", "bearCase": "...", "verdict": "buy|hold|watch|avoid" }`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };

  await prisma.stock.update({
    where: { ticker },
    data: { aiSummary: analysis.summary }
  });

  return analysis;
}
```

---

## Step 6: Price Alert Check

```typescript
// lib/price-alerts.ts
import { prisma } from './prisma';

export async function checkPriceAlerts() {
  const alerts = await prisma.priceAlert.findMany({
    where: { triggered: false },
    include: { stock: true }
  });

  const triggered = [];
  for (const alert of alerts) {
    const price = alert.stock.lastPrice ?? 0;
    const hit = alert.direction === 'above'
      ? price >= alert.targetPrice
      : price <= alert.targetPrice;

    if (hit) {
      await prisma.priceAlert.update({ where: { id: alert.id }, data: { triggered: true } });
      triggered.push({ ticker: alert.stock.ticker, price, target: alert.targetPrice, direction: alert.direction });
    }
  }

  return triggered;
}
```

---

## Running the Pipeline

```bash
# Scan and update a list of tickers
tsx scripts/scan.ts AAPL NVDA CRWD DDOG SQ SOFI

# Run the screener
tsx scripts/screen.ts --maxPE 25 --minGrowth 20 --minCap 300 --maxCap 2000

# Analyze a specific stock with AI
tsx scripts/analyze.ts CRWD
```

---

## Next Steps

- Add SEC EDGAR integration for actual 10-K/10-Q text analysis
- Build a web UI with Recharts for price charts and screening results
- Schedule daily scans with cron + alert emails via Resend
- Expand to options flow screening (unusual options activity)
- Add portfolio tracking — link holdings and P&L
