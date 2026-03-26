---
name: market-evaluation
description: >-
  Evaluate market opportunities before building — assess demand, competition, margins, and
  timing using Personal MBA's proven 10-factor framework. Use when: evaluating a new business
  idea, deciding which market to enter, assessing product-market fit potential.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [market-research, evaluation, startup, product-market-fit, demand]
  use-cases:
    - "Score a SaaS idea on 10 dimensions before investing time building it"
    - "Compare 3 market opportunities and pick the best one"
    - "Identify red flags in a business idea before it's too late"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Market Evaluation

## Overview

Before writing a single line of code or spending a dollar on ads, evaluate whether your market is worth entering. This skill implements the 10-factor market evaluation framework from Josh Kaufman's Personal MBA — a systematic way to score any business idea on a 0-100 scale and make go/no-go decisions based on data, not gut feelings.

Most failed startups don't fail because of bad execution. They fail because they picked a bad market. The Iron Law of the Market says: every business is fundamentally constrained by the size and quality of the market it serves. No amount of hustle can overcome a market that doesn't want what you're selling.

## Instructions

When a user asks to evaluate a business idea, market opportunity, or compare multiple ideas, follow this framework.

### Step 1: Score the Idea on 10 Factors

Rate each factor from 1 (worst) to 10 (best). Be brutally honest — optimism kills startups.

#### The 10 Evaluation Factors

1. **Urgency** — How badly do people need this RIGHT NOW?
   - 1 = "Nice to have someday" / 10 = "I need this fixed by Friday or I lose money"
   - Look for: deadlines, pain frequency, regulatory pressure, broken workflows
   - Example: Tax filing software in March (10) vs a journaling app (2)

2. **Market Size** — How many people are actively willing to pay for this?
   - 1 = A few hundred people worldwide / 10 = Millions of potential paying customers
   - Don't count "could theoretically use it" — count "would actually pay money"
   - Example: CRM for real estate agents (8) vs CRM for yacht brokers (3)

3. **Pricing Potential** — What's the highest price a buyer would realistically pay?
   - 1 = Under $5/month / 10 = $10,000+ per deal
   - Higher pricing = fewer customers needed = more room for CAC
   - Example: Enterprise security audit ($50k+, score 10) vs mobile game ($2, score 1)

4. **Cost of Customer Acquisition** — How easy is it to find and convince buyers?
   - 1 = Impossible to reach, long sales cycles / 10 = They're already searching for this
   - Consider: Are they Googleable? Do they hang out in communities? Can you run ads?
   - Example: Shopify store owners (easy to target, score 8) vs hospital procurement (score 2)

5. **Cost of Value Delivery** — How much does it cost to produce and deliver?
   - 1 = Extremely expensive per unit / 10 = Near-zero marginal cost
   - Software scores high (build once, deliver infinitely). Services score low.
   - Example: SaaS product (9) vs custom consulting engagement (3)

6. **Uniqueness of Offer** — How different is this from existing alternatives?
   - 1 = Exact clone of 50 competitors / 10 = Nothing like this exists
   - Don't need to be unique in everything — unique in ONE dimension that matters
   - Example: Notion when it launched (8) vs another project management tool today (2)

7. **Speed to Market** — How quickly can you have a sellable product?
   - 1 = Years of development / 10 = Can sell within a week
   - Faster = less risk, faster learning, less capital burned
   - Example: Consulting service (10) vs medical device (1)

8. **Up-front Investment** — How much capital before the first sale?
   - 1 = Millions required / 10 = Can start with $0-100
   - Invert: lower investment = higher score
   - Example: Info product (10) vs hardware startup (2)

9. **Upsell Potential** — Can you sell related offerings after the first purchase?
   - 1 = One-and-done transaction / 10 = Natural expansion into premium, add-ons, services
   - Look for: tiers, add-ons, complementary products, increasing usage
   - Example: Slack (free→pro→enterprise + app marketplace, score 9) vs a calculator app (1)

10. **Evergreen Potential** — Does it keep working without constant reinvention?
    - 1 = Constant maintenance, trend-dependent / 10 = Set up once, runs for years
    - Consider: Does the need persist? Will technology shifts kill it?
    - Example: Accounting software (9) vs fidget spinner store (1)

### Step 2: Calculate the Total Score

```
Total = Sum of all 10 factors (max 100)
```

**Interpretation:**
- **75-100: Promising** — Strong opportunity. Proceed to validation immediately.
- **50-74: Proceed with Caution** — Has potential but significant weaknesses. Address the low-scoring factors or find a niche where they don't matter.
- **Below 50: Don't Bother** — Too many structural problems. Either pivot the idea dramatically or move on. Life is too short for bad markets.

### Step 3: Apply the Iron Law of the Market

Even if you score 75+, ask: "Is there a market of people who are ALREADY spending money to solve this problem?"

- If YES → You're competing for existing budget. Easier sell, harder differentiation.
- If NO → You need to create demand from scratch. 10x harder unless the pain is unbearable.

The best ideas solve problems people are ALREADY paying to solve, but poorly. They have budget allocated, vendors they're unhappy with, and workflows that frustrate them daily.

### Step 4: List Critical Assumptions

Every business idea rests on assumptions. Most founders never write them down, which means they never test them.

List every assumption that MUST be true for this business to work:

```
Example for "AI Invoice Parser for Accountants":
1. Accountants spend 5+ hours/week on manual invoice data entry
2. They're willing to pay $49+/month for automation
3. AI can extract invoice data with 95%+ accuracy
4. Integration with Xero/QuickBooks is technically feasible
5. Accountants trust AI with financial data
```

**Priority rule:** Test the cheapest-to-verify assumption first. Don't build an MVP to test assumption #3 if you can test assumption #1 with 10 phone calls.

### Step 5: Shadow Test Before Building

Shadow testing validates demand WITHOUT building the product:

- **Landing page test:** Create a page describing the product. Run $200 in Google Ads targeting your market. Measure signup/waitlist conversion rate.
  - < 2% conversion = weak demand
  - 2-5% = moderate interest
  - > 5% = strong signal

- **Pre-order test:** Offer early-bird pricing with a "buy now" button. If people enter credit cards (even if you don't charge), demand is real.

- **Concierge test:** Deliver the service manually to 5 customers. Do they get value? Do they come back? Would they pay more?

- **Email test:** If you have access to your target market, email 50 people describing the product. Track reply rate and enthusiasm level.

## Code Example

```typescript
interface MarketEvaluation {
  ideaName: string;
  scores: {
    urgency: number;
    marketSize: number;
    pricingPotential: number;
    customerAcquisitionCost: number;
    valueDeliveryCost: number;
    uniqueness: number;
    speedToMarket: number;
    upfrontInvestment: number;
    upsellPotential: number;
    evergreenPotential: number;
  };
}

interface EvaluationResult {
  ideaName: string;
  totalScore: number;
  verdict: "promising" | "caution" | "dont-bother";
  strengths: string[];
  weaknesses: string[];
  criticalRisks: string[];
}

function evaluateMarket(evaluation: MarketEvaluation): EvaluationResult {
  const { scores } = evaluation;
  const entries = Object.entries(scores) as [string, number][];

  const totalScore = entries.reduce((sum, [, v]) => sum + v, 0);

  const verdict: EvaluationResult["verdict"] =
    totalScore >= 75 ? "promising" :
    totalScore >= 50 ? "caution" : "dont-bother";

  const strengths = entries
    .filter(([, v]) => v >= 8)
    .map(([k]) => k.replace(/([A-Z])/g, " $1").toLowerCase().trim());

  const weaknesses = entries
    .filter(([, v]) => v <= 4)
    .map(([k]) => k.replace(/([A-Z])/g, " $1").toLowerCase().trim());

  const criticalRisks: string[] = [];
  if (scores.urgency <= 3) criticalRisks.push("Low urgency — people won't prioritize buying this");
  if (scores.marketSize <= 3) criticalRisks.push("Tiny market — ceiling is very low even with perfect execution");
  if (scores.customerAcquisitionCost <= 3) criticalRisks.push("Hard to reach customers — CAC may eat all margin");
  if (scores.uniqueness <= 3) criticalRisks.push("Crowded market — need a strong differentiator or niche");

  return {
    ideaName: evaluation.ideaName,
    totalScore,
    verdict,
    strengths,
    weaknesses,
    criticalRisks,
  };
}

function compareIdeas(ideas: MarketEvaluation[]): EvaluationResult[] {
  return ideas
    .map(evaluateMarket)
    .sort((a, b) => b.totalScore - a.totalScore);
}
```

## Examples

### Example 1: Score a single SaaS idea

**User request:** "Evaluate my idea: an AI tool that automatically categorizes and tags expenses for freelancers"

**Actions taken:**
1. Score each factor based on known market dynamics
2. Calculate total and identify strengths/weaknesses
3. List critical assumptions to test

**Output:**
```
Market Evaluation: AI Expense Categorizer for Freelancers

  Urgency:                 6  (tax season spikes it, but not daily pain)
  Market Size:             7  (millions of freelancers globally)
  Pricing Potential:       4  (freelancers are price-sensitive, $10-20/mo ceiling)
  Customer Acquisition:    6  (can target via freelance platforms, communities)
  Value Delivery Cost:     8  (software, low marginal cost)
  Uniqueness:              4  (QuickBooks Self-Employed, FreshBooks already do this)
  Speed to Market:         7  (API integrations + AI classification = 4-6 weeks)
  Up-front Investment:     8  (low — API costs + hosting)
  Upsell Potential:        6  (invoicing, tax filing, bookkeeping add-ons)
  Evergreen Potential:     8  (expenses never stop)

  TOTAL: 64/100 — PROCEED WITH CAUTION

  Strengths: value delivery cost, up-front investment, evergreen potential
  Weaknesses: pricing potential, uniqueness
  Critical Risks:
    - Crowded market — QuickBooks and FreshBooks already serve this audience
    - Low pricing ceiling limits growth potential

  Recommendation: Only pursue if you find a specific niche (e.g., freelancers
  in a specific country with unique tax rules) where incumbents are weak.

  Critical Assumptions to Test:
    1. Freelancers are dissatisfied with current expense tracking (test: survey 30 freelancers)
    2. They'd pay $15/month for a standalone tool (test: landing page + ads)
    3. AI can categorize expenses with 90%+ accuracy (test: prototype with sample data)
```

### Example 2: Compare three ideas

**User request:** "I have three ideas: (A) AI resume builder for developers, (B) automated code review bot for teams, (C) SaaS monitoring dashboard for indie hackers. Which one should I build?"

**Actions taken:**
1. Score all three ideas independently
2. Rank by total score
3. Provide go/no-go recommendation

**Output:**
```
Comparative Market Evaluation:

  #1 Automated Code Review Bot    → 76/100 (PROMISING)
  #2 SaaS Monitoring Dashboard    → 61/100 (CAUTION)
  #3 AI Resume Builder            → 48/100 (DON'T BOTHER)

  Winner: Code Review Bot
  Why: High urgency (teams need this in CI/CD now), strong pricing ($49-499/mo
  per team), clear acquisition channels (dev communities, GitHub marketplace).

  Next step: Shadow test with a landing page targeting engineering leads.
  Budget $200 on LinkedIn ads, measure signup rate over 5 days.
```

## Guidelines

- Always be honest about scores. Founders inflate urgency and market size — your job is to be the reality check.
- When comparing ideas, present them as a ranked table with clear winner and reasoning.
- If a score is below 50, say "don't bother" clearly. Saving someone from a bad market is more valuable than encouraging them.
- After scoring, always suggest the ONE cheapest next step to validate (usually a landing page test or customer interviews).
- If the user has no access to the target market (can't reach customers easily), flag this as a critical risk regardless of other scores.
- Reference the Iron Law: "Every business is limited by the size and quality of the market it serves. You can't fix a bad market with great execution."
