---
name: business-finance-fundamentals
description: >-
  Understand essential business finance — profit margins, unit economics, cash flow, LTV/CAC,
  and the 4 methods to increase revenue. Use when: analyzing business profitability, making
  pricing decisions, evaluating SaaS unit economics, financial planning.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "finance, unit-economics, ltv-cac, margins, revenue"
  use-cases: "Calculate whether a SaaS business is healthy using LTV/CAC ratio, Find which of the 4 revenue levers will have the biggest impact, Model the financial impact of a price increase on profit"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Business Finance Fundamentals

## Overview

You don't need an MBA to understand business finance. You need to understand five things: how money comes in (revenue), how money goes out (costs), what's left (profit), how long customers stay and pay (LTV), and how much it costs to get them (CAC). Everything else is a variation of these five.

This skill covers essential financial frameworks — the 4 methods to increase revenue, unit economics, LTV/CAC analysis, and the critical distinction between profit and cash flow.

## Instructions

When a user asks about business profitability, unit economics, pricing impact, or financial health, apply these frameworks.

### The 4 Methods to Increase Revenue

Every business in the world can only increase revenue in exactly four ways. There are no exceptions:

1. **Increase the number of customers** — More marketing, better conversion, new channels. Linear impact: 2x customers = 2x revenue (usually hardest and most expensive).

2. **Increase the average transaction size** — Upsells, bundles, premium tiers, add-ons. Example: "Would you like fries with that?" generates billions for McDonald's.

3. **Increase the frequency of transactions** — Subscriptions, consumables, habit-building. Example: Moving from one-time purchase to subscription model = recurring revenue.

4. **Increase prices** — Value-based pricing, premium positioning. Highest leverage: a 10% price increase with no cost change goes straight to profit.

**The Revenue Impact Formula:**
```
Revenue = Customers × Units per Transaction × Frequency × Price per Unit
```

A 10% improvement in ALL four factors:
```
1.1 × 1.1 × 1.1 × 1.1 = 1.46 → 46% revenue increase from four 10% improvements
```

### Profit Margin Analysis

**Gross Margin** = (Revenue - Cost of Goods Sold) / Revenue
- Rough heuristics, not sourced statistics; compare against your own sector:
- SaaS: 70-85%
- Services: 40-60%
- Physical products: 30-50%

**Net Margin** = (Revenue - ALL Costs) / Revenue
- Rough heuristics: SaaS 15-25% net margin at scale; services 10-20%

**Why margins matter more than revenue:**
- $1M revenue at 10% margin = $100k profit
- $500k revenue at 40% margin = $200k profit
- The smaller business is more profitable. Revenue is vanity, profit is sanity.

### Unit Economics: LTV and CAC

**Customer Lifetime Value (LTV):**
```
LTV = ARPU / Monthly Churn Rate

Example:
  ARPU = $90/month
  Monthly churn = 5%
  LTV = $90 / 0.05 = $1,800
```

More precise with gross margin:
```
LTV = (ARPU × Gross Margin) / Monthly Churn Rate

Example:
  ARPU = $90, Gross Margin = 80%, Churn = 5%
  LTV = ($90 × 0.80) / 0.05 = $1,440
```

**Customer Acquisition Cost (CAC):**
```
CAC = Total Sales & Marketing Spend / New Customers Acquired

Example:
  Spent $17,000 on marketing last month
  Acquired 50 new customers
  CAC = $17,000 / 50 = $340
```

**The LTV/CAC Ratio — a core SaaS metric (the 3:1 bands are common rules of thumb, not standards):**

| LTV/CAC | Verdict | Action |
|---------|---------|--------|
| < 1:1 | Losing money on every customer | Stop acquiring. Fix product or pricing immediately. |
| 1-2:1 | Barely surviving | Reduce CAC or increase LTV urgently. |
| 2-3:1 | Borderline healthy | Optimize — you have a business but it's fragile. |
| 3-5:1 | Healthy | Good unit economics. Scale carefully. |
| > 5:1 | Excellent or under-investing | Either very efficient or not spending enough on growth. |

**CAC Payback Period:**
```
Payback = CAC / (ARPU × Gross Margin)

Example:
  CAC = $340, ARPU = $90, Gross Margin = 80%
  Payback = $340 / ($90 × 0.80) = 4.7 months
```

Rule of thumb: payback under 12 months; under 6 months is excellent.

### Breakeven Analysis

```
Breakeven Point = Fixed Costs / (Price per Unit - Variable Cost per Unit)

Example:
  Fixed costs: $8,000/month (salaries, hosting, tools)
  Price per customer: $90/month
  Variable cost per customer: $12/month (API calls, support)
  Breakeven = $8,000 / ($90 - $12) = 103 customers
```

Below 103 customers: losing money. Above 103: every new customer adds $78/month profit.

### Cash Flow vs Profit

**Profit** is an accounting concept. **Cash flow** is reality. You can be profitable on paper and still go bankrupt (customer pays Net 60, you pay salaries now — profit positive, cash negative, business dead).

**Cash flow rules:**
1. Collect money as fast as possible (annual plans > monthly, prepayment > Net 30)
2. Pay expenses as late as reasonably possible (negotiate terms)
3. Always have 3-6 months of operating expenses in reserve
4. Annual plan with discount is almost always worth it: offer $890/year vs $90/month ($1,080). You get $890 cash NOW.

### Allowable Acquisition Cost

How much CAN you spend to acquire a customer? Max Allowable CAC = LTV x (1 - Target Margin). Example: LTV = $1,800, target margin kept after acquisition 60%, Max CAC = $1,800 x 0.40 = $720. If actual CAC is $340, you have $380 of headroom to invest more in growth.

## Key Formulas

```
ARPU = MRR / Customer Count
LTV = (ARPU × Gross Margin) / Monthly Churn Rate
CAC = Total Sales & Marketing Spend / New Customers Acquired
LTV/CAC Ratio = LTV / CAC
CAC Payback = CAC / (ARPU × Gross Margin)
Breakeven Customers = (Fixed Costs + Marketing Spend) / (ARPU × Gross Margin)
Max Allowable CAC = LTV × 0.40 (keep 60%, spend up to 40% on acquisition)
```

## Examples

### Example 1: SaaS health check

**User request:** "My SaaS has $45k MRR, 500 customers, 8% monthly churn, $17k/month marketing spend, 50 new customers/month, 75% gross margin, $22k fixed costs. Am I healthy?"

**Output:**
```
SaaS Unit Economics Report:

  ARPU:               $90/month
  LTV:                $844 (low — churn is killing you)
  CAC:                $340
  LTV/CAC:            2.5x — WARNING: Borderline healthy
  CAC Payback:        5.0 months (acceptable)
  Average Customer Life: 12.5 months

  Monthly P&L:
    Revenue:          $45,000
    Gross Profit:     $33,750 (75%)
    - Fixed Costs:    -$22,000
    - Marketing:      -$17,000
    Net Margin:       -$5,250 (-11.7%) ← LOSING MONEY

  Breakeven:          578 customers (you have 500 — 78 short)

  Revenue Lever Impact (each lever changed on its own):
    Churn 8%→7.2%:        LTV $844→$938 (+11%); the effect builds over months
    ARPU $90→$99:         +$4,500 MRR immediately (+$3,375 gross profit)
    Price +10%:           same as ARPU if applied to all customers
    Acquisition 50→55/mo: +5 customers/month (+$450 MRR per monthly cohort)

  Diagnosis: Your #1 problem is churn. At 8%/month, customers live only
  12.5 months on average. Fix churn first: retention gains compound, while the price
  lever pays off immediately. If you halve churn to 4%, LTV doubles to $1,688 and
  the steady-state customer base (50 new/month / churn) doubles from 625 to 1,250,
  far above the 578 breakeven.
```

### Example 2: Price increase impact modeling

**User request:** "What happens if I raise prices 20% from $49 to $59/month? I have 300 customers."

**Output:**
```
Price Increase Impact Model: $49 → $59/month (+20%)

  Scenario A: No customer loss (best case)
    Revenue: $14,700 → $17,700 (+$3,000/month, +$36k/year)
    If costs unchanged: $3,000/month goes straight to profit

  Scenario B: 5% customer loss (typical)
    Customers: 300 → 285
    Revenue: $14,700 → $16,815 (+$2,115/month, +$25k/year)
    Still a clear win.

  Scenario C: 15% customer loss (aggressive)
    Customers: 300 → 255
    Revenue: $14,700 → $15,045 (+$345/month)
    Marginal win, but fewer customers = lower support cost.

  Break-even churn from price increase:
    You'd need to lose 51+ customers (17%) for this to be net negative.
    Churn after a price increase varies by product; test it with a
    subset of customers before applying it to everyone.

  Recommendation: DO IT. Grandfather existing customers for 3 months,
  apply new price to all new signups immediately.
```

## Guidelines

- Always calculate LTV with gross margin, not raw ARPU. LTV = (ARPU × Gross Margin) / Churn.
- When churn is above 5% monthly (a rule of thumb for SaaS), flag it as the top priority.
- Present the 4 revenue levers ranked by impact for the specific business, not in generic order.
- Cash flow warnings should be prominent when a business is profitable on paper but cash-negative.
- Price increase modeling should always include 3 scenarios: no loss, typical loss (5%), and aggressive loss (15%).
- Remind users: "Revenue is vanity, profit is sanity, cash is king."
