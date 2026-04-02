---
title: "Build an Autonomous Financial Research Agent"
slug: build-autonomous-financial-research-agent
description: >-
  Build an AI agent that automates equity research — fetching SEC filings,
  extracting key metrics, comparing against consensus, and generating
  investment summaries at scale.
skills:
  - dexter-finance
  - anthropic-sdk
category: data-ai
tags:
  - finance
  - research
  - sec-filings
  - investment
  - automation
---

# Build an Autonomous Financial Research Agent

## The Situation

Priya is a buy-side analyst at a mid-cap focused fund, covering 50 stocks across tech and industrials. Every earnings season — four times a year — she faces two weeks of 14-hour days reading 10-K and 10-Q filings, parsing earnings call transcripts, and writing investment summaries for each company.

She wants an AI agent that does the first pass: fetch the filings, extract the numbers, flag anomalies, and produce a draft report she can review and refine.

**Goal:** 50 company reports in hours instead of weeks.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Research Orchestrator               │
├─────────┬──────────┬──────────────┬──────────────┤
│ EDGAR   │ Market   │ Earnings     │ Anomaly      │
│ Fetcher │ Data     │ Transcript   │ Detector     │
│         │ Client   │ Analyzer     │              │
└────┬────┴────┬─────┴──────┬───────┴──────┬───────┘
     │         │            │              │
     ▼         ▼            ▼              ▼
┌─────────────────────────────────────────────────┐
│           Analysis & Synthesis Engine            │
├─────────────────────────────────────────────────┤
│           Report Generator (Markdown/PDF)        │
└─────────────────────────────────────────────────┘
```

## Step 1: Set Up the Research Agent

```typescript
import { DexterAgent, EdgarClient, ReportGenerator } from "dexter-finance";
import Anthropic from "@anthropic-ai/sdk";

const agent = new DexterAgent({
  model: "claude-sonnet-4-20250514",
  tools: ["sec-filings", "market-data", "earnings-transcripts"],
  concurrency: 5,
});

const edgar = new EdgarClient({
  userAgent: "PriyaFund research@priyafund.com",
});
```

## Step 2: Fetch SEC Filings via EDGAR API

```typescript
async function fetchFilings(ticker: string) {
  // Get latest 10-K and last 4 10-Qs
  const annualFiling = await edgar.getFiling({
    ticker,
    type: "10-K",
    latest: true,
  });

  const quarterlyFilings = await edgar.getFilings({
    ticker,
    type: "10-Q",
    count: 4,
  });

  return { annualFiling, quarterlyFilings };
}
```

## Step 3: Extract Key Metrics

```typescript
async function extractMetrics(filings: any) {
  const metrics = edgar.compare(
    [filings.annualFiling, ...filings.quarterlyFilings],
    {
      metrics: [
        "revenue",
        "grossMargin",
        "operatingMargin",
        "netIncome",
        "eps",
        "freeCashFlow",
        "debtToEquity",
        "guidanceRevenue",
        "guidanceEps",
      ],
    }
  );

  return {
    trends: metrics.trends,
    latestQuarter: metrics.latest,
    yoyChanges: metrics.yearOverYear,
  };
}
```

## Step 4: Analyze Earnings Calls

```typescript
import { EarningsAnalyzer } from "dexter-finance";

const earningsAnalyzer = new EarningsAnalyzer({ model: "claude-sonnet-4-20250514" });

async function analyzeEarnings(ticker: string) {
  const analysis = await earningsAnalyzer.analyze({
    ticker,
    quarter: "latest",
  });

  return {
    sentiment: analysis.sentiment,
    guidanceChanges: analysis.guidanceChanges,
    managementTone: analysis.managementTone,
    keyTopics: analysis.keyTopics,
    analystConcerns: analysis.analystConcerns,
  };
}
```

## Step 5: Detect Anomalies

```typescript
import { AnomalyDetector } from "dexter-finance";

const detector = new AnomalyDetector();

async function scanForRedFlags(ticker: string) {
  const flags = await detector.scan({
    ticker,
    checks: [
      "accounting-changes",
      "insider-trading",
      "guidance-cuts",
      "audit-opinions",
      "related-party",
      "revenue-recognition",
    ],
  });

  return flags.filter((f) => f.severity !== "low");
}
```

## Step 6: Generate Investment Summary

```typescript
const reportGenerator = new ReportGenerator({
  model: "claude-sonnet-4-20250514",
  template: "investment-memo",
});

async function generateReport(
  ticker: string,
  metrics: any,
  earnings: any,
  anomalies: any
) {
  const report = await reportGenerator.generate({
    ticker,
    sections: [
      "executive-summary",
      "financial-analysis",
      "earnings-highlights",
      "risk-flags",
      "recommendation",
    ],
    data: { metrics, earnings, anomalies },
    format: "markdown",
    maxPages: 2,
  });

  return report;
}
```

## Step 7: Run Batch Research

```typescript
const watchlist = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "META", "TSLA", "AMD", "CRM", "ORCL",
  // ... 40 more tickers
];

async function runEarningsResearch() {
  console.log(`Starting research on ${watchlist.length} companies...`);

  const reports = [];

  for (const ticker of watchlist) {
    try {
      console.log(`Researching ${ticker}...`);

      const filings = await fetchFilings(ticker);
      const metrics = await extractMetrics(filings);
      const earnings = await analyzeEarnings(ticker);
      const anomalies = await scanForRedFlags(ticker);

      const report = await generateReport(ticker, metrics, earnings, anomalies);
      await report.save(`./reports/${ticker}-summary.md`);

      reports.push({
        ticker,
        recommendation: report.recommendation,
        anomalyCount: anomalies.length,
        sentiment: earnings.sentiment,
      });

      console.log(`✅ ${ticker}: ${report.recommendation} | ${anomalies.length} flags`);
    } catch (error) {
      console.error(`❌ ${ticker}: ${error.message}`);
    }
  }

  // Generate portfolio-level summary
  const portfolioSummary = reports
    .sort((a, b) => b.anomalyCount - a.anomalyCount)
    .map((r) => `${r.ticker}: ${r.recommendation} (${r.anomalyCount} flags, sentiment: ${r.sentiment})`)
    .join("\n");

  console.log("\n=== Portfolio Summary ===");
  console.log(portfolioSummary);
}

runEarningsResearch();
```

## Results

| Metric | Before | After |
|--------|--------|-------|
| Time per company | 6 hours | 5 minutes |
| 50 companies total | 2 weeks | 4 hours |
| Anomalies caught | Variable | Systematic |
| Report consistency | Analyst-dependent | Standardized |

Priya now uses the AI-generated reports as a first pass. She reviews each summary (10 minutes per company), focuses her deep-dive time on flagged anomalies, and produces higher-quality research in a fraction of the time.

## Key Takeaways

- **EDGAR API is free** but requires a valid User-Agent string — use your real company/email
- **Batch with rate limiting** — EDGAR limits to 10 requests/second, set concurrency accordingly
- **Anomaly detection is the highest-value feature** — catching accounting changes or insider selling early pays for the entire system
- **Human review is essential** — AI does the extraction and first-pass analysis, the analyst does the judgment
- **Start with 5 stocks** before scaling to 50 — validate output quality first
