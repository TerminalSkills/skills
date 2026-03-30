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
  category: data-ai
  tags:
    - finance
    - stocks
    - sec-filings
    - investment
    - research
---

# Dexter Finance

Build autonomous financial research agents using [Dexter](https://github.com/virattt/dexter) — an agent framework for deep financial analysis covering SEC filings, earnings calls, market data, and investment report generation.

## Overview

Dexter follows a four-stage research pipeline: data collection (EDGAR API, market data, transcripts), analysis (financial ratios, sentiment), synthesis (cross-referencing patterns and anomalies), and report generation (investment memos in PDF/Markdown). It supports single-stock deep dives and batch research across watchlists.

## Instructions

### Installation

```bash
npm install dexter-finance
# or: pip install dexter-finance
```

Set up API keys:

```bash
export OPENAI_API_KEY="sk-..."        # or ANTHROPIC_API_KEY
export SEC_EDGAR_USER_AGENT="Company Name email@example.com"
export ALPHA_VANTAGE_KEY="..."         # optional, for market data
```

### Research a Single Stock

```typescript
import { DexterAgent } from "dexter-finance";

const agent = new DexterAgent({
  model: "claude-sonnet-4-20250514",
  tools: ["sec-filings", "market-data", "earnings-transcripts"],
});

const report = await agent.research({
  ticker: "AAPL",
  depth: "full",
  periods: 4,
});

console.log(report.summary);
console.log(report.recommendation);
await report.save("aapl-report.md");
```

### SEC Filing Analysis

```typescript
import { EdgarClient } from "dexter-finance";

const edgar = new EdgarClient({ userAgent: "MyApp research@example.com" });

const filing = await edgar.getFiling({ ticker: "MSFT", type: "10-K", latest: true });

console.log(filing.sections.riskFactors);
console.log(filing.sections.financialStatements);
console.log(filing.sections.mdAndA);

for (const table of filing.financialTables) {
  console.log(`${table.name}:`, table.toJSON());
}
```

### Earnings Call Analysis

```typescript
import { EarningsAnalyzer } from "dexter-finance";

const analyzer = new EarningsAnalyzer({ model: "claude-sonnet-4-20250514" });

const analysis = await analyzer.analyze({ ticker: "NVDA", quarter: "Q4-2025" });

console.log(analysis.sentiment);
console.log(analysis.guidanceChanges);
console.log(analysis.managementTone);
console.log(analysis.analystConcerns);
```

### Financial Ratios

```typescript
import { FinancialMetrics } from "dexter-finance";

const ratios = await new FinancialMetrics().calculate({ ticker: "AMZN", period: "TTM" });

console.log(ratios.profitability); // { grossMargin, operatingMargin, netMargin, roe }
console.log(ratios.valuation);     // { pe, ps, pb, evEbitda }
console.log(ratios.growth);        // { revenueYoY, epsYoY, fcfYoY }
```

### Anomaly Detection

```typescript
import { AnomalyDetector } from "dexter-finance";

const flags = await new AnomalyDetector().scan({
  ticker: "XYZ",
  checks: ["accounting-changes", "insider-trading", "guidance-cuts",
           "audit-opinions", "related-party", "revenue-recognition"],
});

for (const flag of flags) {
  console.log(`${flag.severity.toUpperCase()}: ${flag.type} — ${flag.description}`);
}
```

## Examples

### Example 1: Full Investment Memo for META

```typescript
import { ReportGenerator } from "dexter-finance";

const generator = new ReportGenerator({
  model: "claude-sonnet-4-20250514",
  template: "investment-memo",
});

const report = await generator.generate({
  ticker: "META",
  sections: ["executive-summary", "business-overview", "financial-analysis",
             "competitive-position", "risk-factors", "valuation", "recommendation"],
  format: "markdown",
  maxPages: 5,
});

await report.save("meta-investment-memo.md");
await report.toPDF("meta-investment-memo.pdf");
// Produces a 5-page memo with financial tables, ratio analysis, and buy/hold/sell recommendation
```

### Example 2: Daily Market Briefing for a Watchlist

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
// Output: structured briefing with price changes, upcoming earnings, and macro events
```

## Guidelines

- Set `SEC_EDGAR_USER_AGENT` to a valid company/email — EDGAR rate-limits anonymous requests
- Use `depth: "quick"` for screening, `"full"` for deep dives — saves tokens and time
- Batch research runs concurrently — set `concurrency` based on your API rate limits
- Anomaly detection is most useful on small/mid-cap stocks where coverage is thin
- Combine with a scheduler (cron) for automated daily briefings
- Always validate AI-generated financial analysis — treat outputs as research drafts, not advice
