---
name: dexter-finance
description: >-
  Build autonomous financial research agents that analyze stocks, SEC filings, earnings calls,
  and market data to produce investment reports. Use when: automating investment research,
  building AI-powered stock analysis, creating financial due diligence agents.
license: MIT
compatibility: "Node.js 18+ or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags:
    - finance
    - research
    - stocks
    - sec-filings
    - investment
    - autonomous-agent
    - dexter
  use-cases:
    - "Build an agent that researches a stock and produces a full investment memo"
    - "Automate analysis of SEC 10-K/10-Q filings with AI"
    - "Create a daily market briefing agent that summarizes key moves and news"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Dexter Finance

Build autonomous financial research agents using [Dexter](https://github.com/virattt/dexter) — an agent framework for deep financial analysis covering SEC filings, earnings calls, market data, and investment report generation.

## Architecture

Dexter follows a four-stage research pipeline:

```
Data Collection → Analysis → Synthesis → Report
     │                │           │          │
  EDGAR API      Financial    Cross-ref    Investment
  Market data    ratios       patterns     memo/brief
  Transcripts    Sentiment    Anomalies    PDF/Markdown
```

## Installation

```bash
npm install dexter-finance
```

Or with Python:

```bash
pip install dexter-finance
```

Set up API keys:

```bash
export OPENAI_API_KEY="sk-..."        # or ANTHROPIC_API_KEY
export SEC_EDGAR_USER_AGENT="Company Name email@example.com"
export ALPHA_VANTAGE_KEY="..."         # optional, for market data
```

## Basic Usage

### Research a Single Stock

```typescript
import { DexterAgent } from "dexter-finance";

const agent = new DexterAgent({
  model: "claude-sonnet-4-20250514",
  tools: ["sec-filings", "market-data", "earnings-transcripts"],
});

const report = await agent.research({
  ticker: "AAPL",
  depth: "full", // "quick" | "standard" | "full"
  periods: 4,    // quarters to analyze
});

console.log(report.summary);
console.log(report.recommendation); // "Buy" | "Hold" | "Sell"
await report.save("aapl-report.md");
```

## SEC Filing Fetchers

### Fetch and Parse 10-K/10-Q Filings

```typescript
import { EdgarClient } from "dexter-finance";

const edgar = new EdgarClient({
  userAgent: "MyApp research@example.com",
});

// Fetch latest 10-K
const filing = await edgar.getFiling({
  ticker: "MSFT",
  type: "10-K",
  latest: true,
});

// Extract key sections
console.log(filing.sections.businessOverview);
console.log(filing.sections.riskFactors);
console.log(filing.sections.financialStatements);
console.log(filing.sections.mdAndA); // Management Discussion & Analysis

// Parse financial tables
for (const table of filing.financialTables) {
  console.log(`${table.name}:`);
  console.log(table.toJSON());
}
```

### Compare Filings Across Periods

```typescript
const filings = await edgar.getFilings({
  ticker: "GOOGL",
  type: "10-Q",
  count: 4,
});

const comparison = edgar.compare(filings, {
  metrics: ["revenue", "netIncome", "operatingMargin", "eps"],
});

console.log(comparison.trends);    // Quarter-over-quarter changes
console.log(comparison.anomalies); // Significant deviations
```

## Earnings Call Analysis

```typescript
import { EarningsAnalyzer } from "dexter-finance";

const analyzer = new EarningsAnalyzer({ model: "claude-sonnet-4-20250514" });

const analysis = await analyzer.analyze({
  ticker: "NVDA",
  quarter: "Q4-2025",
});

console.log(analysis.keyTopics);       // Main discussion themes
console.log(analysis.sentiment);       // Overall tone: bullish/bearish/neutral
console.log(analysis.guidanceChanges); // Forward guidance vs prior
console.log(analysis.managementTone);  // Confident, cautious, evasive
console.log(analysis.analystConcerns); // Key questions from analysts
```

## Financial Ratio Calculations

```typescript
import { FinancialMetrics } from "dexter-finance";

const metrics = new FinancialMetrics();

const ratios = await metrics.calculate({
  ticker: "AMZN",
  period: "TTM", // Trailing twelve months
});

console.log(ratios.profitability);
// { grossMargin: 0.48, operatingMargin: 0.11, netMargin: 0.07, roe: 0.22 }

console.log(ratios.valuation);
// { pe: 62.3, ps: 3.1, pb: 8.4, evEbitda: 28.7 }

console.log(ratios.growth);
// { revenueYoY: 0.12, epsYoY: 0.34, fcfYoY: 0.28 }

console.log(ratios.health);
// { currentRatio: 1.05, debtToEquity: 0.58, interestCoverage: 12.4 }
```

## Sentiment Analysis

```typescript
import { SentimentEngine } from "dexter-finance";

const sentiment = new SentimentEngine({ model: "claude-sonnet-4-20250514" });

// Analyze news sentiment for a ticker
const result = await sentiment.analyzeNews({
  ticker: "TSLA",
  days: 30,
  sources: ["reuters", "bloomberg", "wsj"],
});

console.log(result.overall);        // -0.3 to 1.0 scale
console.log(result.bySource);       // Breakdown per source
console.log(result.keyEvents);      // Events driving sentiment
console.log(result.trendDirection);  // "improving" | "declining" | "stable"
```

## Report Generation

### Generate Investment Memo

```typescript
import { ReportGenerator } from "dexter-finance";

const generator = new ReportGenerator({
  model: "claude-sonnet-4-20250514",
  template: "investment-memo",
});

const report = await generator.generate({
  ticker: "META",
  sections: [
    "executive-summary",
    "business-overview",
    "financial-analysis",
    "competitive-position",
    "risk-factors",
    "valuation",
    "recommendation",
  ],
  format: "markdown",
  maxPages: 5,
});

await report.save("meta-investment-memo.md");
await report.toPDF("meta-investment-memo.pdf");
```

### Daily Market Briefing

```typescript
import { BriefingAgent } from "dexter-finance";

const briefing = new BriefingAgent({
  model: "claude-sonnet-4-20250514",
  watchlist: ["AAPL", "GOOGL", "MSFT", "AMZN", "NVDA"],
});

const daily = await briefing.generate({
  includePreMarket: true,
  includeEarningsCalendar: true,
  includeMacroEvents: true,
});

console.log(daily.marketOverview);
console.log(daily.watchlistMoves);
console.log(daily.earningsToday);
console.log(daily.keyEvents);
```

## Anomaly Detection

```typescript
import { AnomalyDetector } from "dexter-finance";

const detector = new AnomalyDetector();

const flags = await detector.scan({
  ticker: "XYZ",
  checks: [
    "accounting-changes",     // Unusual accounting policy changes
    "insider-trading",        // Insider selling patterns
    "guidance-cuts",          // Downward guidance revisions
    "audit-opinions",         // Qualified audit opinions
    "related-party",          // Related party transactions
    "revenue-recognition",    // Revenue recognition changes
  ],
});

for (const flag of flags) {
  console.log(`⚠️ ${flag.type}: ${flag.description}`);
  console.log(`   Severity: ${flag.severity}`);  // low | medium | high | critical
  console.log(`   Source: ${flag.source}`);
  console.log(`   Filing: ${flag.filingRef}`);
}
```

## Multi-Stock Batch Research

```typescript
const agent = new DexterAgent({
  model: "claude-sonnet-4-20250514",
  tools: ["sec-filings", "market-data", "earnings-transcripts"],
  concurrency: 5,
});

const tickers = ["AAPL", "GOOGL", "MSFT", "AMZN", "NVDA"];

const reports = await agent.batchResearch({
  tickers,
  depth: "standard",
  output: "./reports/",
  format: "markdown",
  onProgress: (ticker, status) => {
    console.log(`${ticker}: ${status}`);
  },
});

console.log(`Generated ${reports.length} reports`);
```

## Tips

- Set `SEC_EDGAR_USER_AGENT` to a valid company/email — EDGAR rate-limits anonymous requests
- Use `depth: "quick"` for screening, `"full"` for deep dives — saves tokens and time
- Batch research runs concurrently — set `concurrency` based on your API rate limits
- Anomaly detection is most useful on small/mid-cap stocks where coverage is thin
- Combine with a scheduler (cron) for automated daily briefings
- Always validate AI-generated financial analysis — treat outputs as research drafts, not advice
