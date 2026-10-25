---
name: market-evaluation
description: >-
  Scores a business idea or market on the ten factors from Josh Kaufman's The Personal MBA
  (urgency, market size, pricing, acquisition cost and more) before anything is built. Use when
  someone asks to evaluate a business idea, compare markets, decide whether an idea is worth
  pursuing, or assess demand and competition.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "market-research, evaluation, startup, product-market-fit, demand"
  use-cases: "Score a SaaS idea on 10 dimensions before investing time building it, Compare 3 market opportunities and pick the best one, Identify red flags in a business idea before it's too late"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Market Evaluation

## Overview

Before writing a single line of code or spending a dollar on ads, evaluate whether your market is worth entering. This skill implements the "10 Ways to Evaluate a Market" checklist from Josh Kaufman's The Personal MBA (personalmba.com/10-ways-to-evaluate-a-market) — a back-of-the-napkin way to score any business idea on a 0-100 scale and make go/no-go decisions based on data, not gut feelings.

Most failed startups don't fail because of bad execution. They fail because they picked a bad market. Kaufman's Iron Law of the Market says the same: even the most ingenious idea fails if no one wants it, so look for existing markets to serve before building something and hunting for buyers.

## Instructions

When a user asks to evaluate a business idea, market opportunity, or compare multiple ideas, follow this framework.

### Step 1: Score the Idea on 10 Factors

Rate each factor from 0 (extremely unattractive) to 10 (extremely attractive). When in doubt, be conservative — optimism kills startups.

#### The 10 Evaluation Factors

1. **Urgency** — How badly do people need this RIGHT NOW?
   - 0 = "Nice to have someday" / 10 = "I need this fixed by Friday or I lose money"
   - Look for: deadlines, pain frequency, regulatory pressure, broken workflows
   - Example: Tax filing software in March (10) vs a journaling app (2)

2. **Market Size** — How many people are actively purchasing things like this?
   - 0 = A few hundred people worldwide / 10 = Millions of potential paying customers
   - Don't count "could theoretically use it" — count people who already buy things like this
   - Example: CRM for real estate agents (8) vs CRM for yacht brokers (3)

3. **Pricing Potential** — What is the highest average price a buyer would be willing to pay for a solution?
   - 0 = Under $5/month / 10 = $10,000+ per deal
   - Higher pricing = fewer customers needed = more room for CAC
   - Example: Enterprise security audit ($50k+, score 10) vs mobile game ($2, score 1)

4. **Cost of Customer Acquisition** — How easy is it to win a customer, in money and effort per sale?
   - 0 = Impossible to reach, long sales cycles / 10 = They're already searching for this
   - Consider: Are they Googleable? Do they hang out in communities? Can you run ads?
   - Example: Shopify store owners (easy to target, score 8) vs hospital procurement (score 2)

5. **Cost of Value Delivery** — How much does it cost, in money and effort, to create and deliver what you offer?
   - 0 = Extremely expensive per unit / 10 = Near-zero marginal cost
   - Software scores high (build once, deliver infinitely). Services score low.
   - Example: SaaS product (9) vs custom consulting engagement (3)

6. **Uniqueness of Offer** — How different is this from competing offers, and how easily can a competitor copy it?
   - 0 = Exact clone of 50 competitors / 10 = Nothing like this exists
   - Don't need to be unique in everything — unique in ONE dimension that matters
   - Example: Notion when it launched (8) vs another project management tool today (2)

7. **Speed to Market** — How quickly can you have a sellable product?
   - 0 = Years of development / 10 = Can sell within a week
   - Faster = less risk, faster learning, less capital burned
   - Example: Consulting service (10) vs medical device (1)

8. **Up-front Investment** — How much capital before the first sale?
   - 0 = Millions required / 10 = Can start with $0-100
   - Invert: lower investment = higher score
   - Example: Info product (10) vs hardware startup (2)

9. **Upsell Potential** — Can you sell related offerings after the first purchase?
   - 0 = One-and-done transaction / 10 = Natural expansion into premium, add-ons, services
   - Look for: tiers, add-ons, complementary products, increasing usage
   - Example: Slack (free→pro→enterprise + app marketplace, score 9) vs a calculator app (1)

10. **Evergreen Potential** — Once the offer exists, how much more work is needed to keep selling it?
    - 0 = Constant maintenance, trend-dependent / 10 = Set up once, runs for years
    - Consider: Does the need persist? Will technology shifts kill it?
    - Example: Accounting software (9) vs fidget spinner store (1)

### Step 2: Calculate the Total Score

```
Total = Sum of all 10 factors (max 100)
```

**Interpretation** (Kaufman's cut-offs):
- **75 and up: Promising** — Strong opportunity. Proceed to validation immediately.
- **51-74: Proceed with Caution** — Likely to cover costs, but only a big, sustained investment of time and money turns it into a big win. Address the low-scoring factors or find a niche where they don't matter.
- **50 or below: Don't Bother** — Too many structural problems. Either pivot the idea dramatically or move on. Life is too short for bad markets.

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
  - Rules of thumb, not Kaufman's numbers: < 2% conversion = weak demand
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
    totalScore > 50 ? "caution" : "dont-bother";

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
  Risks to discuss (judgement; none scores 3 or below, so the code's critical-risk flags stay empty):
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
- Reference the Iron Law of the Market: even the most ingenious idea fails if no one wants it, so prefer markets where people already spend money on the problem.
- The score is a screening tool, not a forecast. Rescore after customer conversations; the numbers should change as you learn.
