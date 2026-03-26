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
  version: "1.0.0"
  category: business
  tags: [finance, unit-economics, ltv, cac, margins, revenue, profitability, saas]
  use-cases:
    - "Calculate whether a SaaS business is healthy using LTV/CAC ratio"
    - "Find which of the 4 revenue levers will have the biggest impact"
    - "Model the financial impact of a price increase on profit"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Business Finance Fundamentals

## Overview

You don't need an MBA to understand business finance. You need to understand five things: how money comes in (revenue), how money goes out (costs), what's left (profit), how long customers stay and pay (LTV), and how much it costs to get them (CAC). Everything else is a variation of these five.

This skill covers the essential financial frameworks from the Personal MBA — the 4 methods to increase revenue, unit economics, LTV/CAC analysis, and the critical distinction between profit and cash flow.

## Instructions

When a user asks about business profitability, unit economics, pricing impact, or financial health, apply these frameworks.

### The 4 Methods to Increase Revenue

Every business in the world can only increase revenue in exactly four ways. There are no exceptions:

1. **Increase the number of customers**
   - More marketing, better conversion, new channels, referrals
   - Impact: Linear. 2x customers = 2x revenue (usually hardest and most expensive)

2. **Increase the average transaction size**
   - Upsells, bundles, premium tiers, add-ons
   - Impact: Multiplier. Adding a $20 add-on to 1,000 transactions = $20k more revenue
   - Example: "Would you like fries with that?" generates billions for McDonald's

3. **Increase the frequency of transactions**
   - Subscriptions, consumables, habit-building, regular check-ins
   - Impact: Multiplier. Monthly → weekly purchasing = 4x frequency
   - Example: Moving from one-time purchase to subscription model

4. **Increase prices**
   - Value-based pricing, premium positioning, removing discounts
   - Impact: Highest leverage. 10% price increase with no cost change goes straight to profit
   - Example: A 10% price increase often causes < 5% customer loss = net positive

**The Revenue Impact Formula:**
```
Revenue = Customers × Average Transaction × Frequency × Price
```

A 10% improvement in ALL four factors:
```
1.1 × 1.1 × 1.1 × 1.1 = 1.46 → 46% revenue increase from four 10% improvements
```

### Profit Margin Analysis

**Gross Margin** = (Revenue - Cost of Goods Sold) / Revenue
- SaaS benchmark: 70-85%
- Services benchmark: 40-60%
- Physical products: 30-50%

**Net Margin** = (Revenue - ALL Costs) / Revenue
- Healthy SaaS: 15-25% net margin at scale
- Healthy services: 10-20% net margin

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

**The LTV/CAC Ratio — The Single Most Important SaaS Metric:**

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

Benchmark: Payback should be < 12 months. Under 6 months is excellent.

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

**Profit** is an accounting concept. **Cash flow** is reality.

You can be profitable on paper and still go bankrupt:
- Customer pays Net 60 (you get cash in 2 months)
- You pay salaries on the 1st (cash goes out now)
- Profit: positive. Cash: negative. Business: dead.

**Cash flow rules:**
1. Collect money as fast as possible (annual plans > monthly, prepayment > Net 30)
2. Pay expenses as late as reasonably possible (negotiate terms)
3. Always have 3-6 months of operating expenses in reserve
4. Annual plan with discount is almost always worth it: $90/mo × 12 = $1,080. Offer $890/year (18% discount). You get $890 cash NOW vs $90/month drip.

### Allowable Acquisition Cost

How much CAN you spend to acquire a customer and still be profitable?

```
Maximum Allowable CAC = LTV × Target Margin

Example:
  LTV = $1,800
  Target margin after acquisition: 60%
  Max CAC = $1,800 × 0.40 = $720
  (You keep 60%, spend up to 40% on acquisition)
```

If your actual CAC is $340 and your max is $720, you have $380 of headroom. You could invest more in growth.

## Code Example: SaaS Unit Economics Calculator

```typescript
interface SaaSMetrics {
  mrr: number;                    // Monthly Recurring Revenue
  customerCount: number;          // Total paying customers
  monthlyChurnRate: number;       // % of customers who cancel per month (e.g., 0.05 for 5%)
  monthlySalesMarketingSpend: number; // Total S&M spend per month
  newCustomersPerMonth: number;   // New customers acquired per month
  grossMarginPercent: number;     // Gross margin % (e.g., 80 for 80%)
  fixedMonthlyCosts: number;      // Fixed operating costs per month
}

interface UnitEconomicsReport {
  arpu: number;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  ltvCacVerdict: string;
  cacPaybackMonths: number;
  grossMarginDollars: number;
  netMarginDollars: number;
  netMarginPercent: number;
  breakEvenCustomers: number;
  maxAllowableCAC: number;
  cacHeadroom: number;
  medianCustomerLifeMonths: number;
  revenueLevers: {
    lever: string;
    currentValue: string;
    tenPercentImprovement: string;
    revenueImpact: number;
  }[];
}

function analyzeUnitEconomics(metrics: SaaSMetrics): UnitEconomicsReport {
  const arpu = metrics.mrr / metrics.customerCount;
  const ltv = (arpu * (metrics.grossMarginPercent / 100)) / metrics.monthlyChurnRate;
  const cac = metrics.monthlySalesMarketingSpend / metrics.newCustomersPerMonth;
  const ltvCacRatio = ltv / cac;

  let ltvCacVerdict: string;
  if (ltvCacRatio < 1) ltvCacVerdict = "CRITICAL: Losing money on every customer";
  else if (ltvCacRatio < 2) ltvCacVerdict = "DANGER: Barely surviving";
  else if (ltvCacRatio < 3) ltvCacVerdict = "WARNING: Borderline healthy";
  else if (ltvCacRatio < 5) ltvCacVerdict = "HEALTHY: Good unit economics";
  else ltvCacVerdict = "EXCELLENT: Very efficient or under-investing in growth";

  const cacPaybackMonths = cac / (arpu * (metrics.grossMarginPercent / 100));
  const grossMarginDollars = metrics.mrr * (metrics.grossMarginPercent / 100);
  const netMarginDollars = grossMarginDollars - metrics.fixedMonthlyCosts - metrics.monthlySalesMarketingSpend;
  const netMarginPercent = (netMarginDollars / metrics.mrr) * 100;
  const variableCostPerCustomer = arpu * (1 - metrics.grossMarginPercent / 100);
  const contributionPerCustomer = arpu - variableCostPerCustomer;
  const breakEvenCustomers = Math.ceil(
    (metrics.fixedMonthlyCosts + metrics.monthlySalesMarketingSpend) / contributionPerCustomer
  );
  const maxAllowableCAC = ltv * 0.4;
  const medianCustomerLifeMonths = Math.round(1 / metrics.monthlyChurnRate * 10) / 10;

  // Calculate impact of 10% improvement on each lever
  const baseRevenue = metrics.mrr;
  const levers = [
    {
      lever: "Increase customers (reduce churn)",
      currentValue: `${(metrics.monthlyChurnRate * 100).toFixed(1)}% monthly churn`,
      tenPercentImprovement: `${(metrics.monthlyChurnRate * 0.9 * 100).toFixed(1)}% monthly churn`,
      revenueImpact: baseRevenue * (1 / (metrics.monthlyChurnRate * 0.9) - 1 / metrics.monthlyChurnRate) * metrics.monthlyChurnRate,
    },
    {
      lever: "Increase ARPU (upsell/pricing)",
      currentValue: `$${arpu.toFixed(0)} ARPU`,
      tenPercentImprovement: `$${(arpu * 1.1).toFixed(0)} ARPU`,
      revenueImpact: baseRevenue * 0.1,
    },
    {
      lever: "Increase new customers",
      currentValue: `${metrics.newCustomersPerMonth} new/month`,
      tenPercentImprovement: `${Math.round(metrics.newCustomersPerMonth * 1.1)} new/month`,
      revenueImpact: Math.round(metrics.newCustomersPerMonth * 0.1) * arpu,
    },
    {
      lever: "Increase prices",
      currentValue: `$${arpu.toFixed(0)}/month`,
      tenPercentImprovement: `$${(arpu * 1.1).toFixed(0)}/month`,
      revenueImpact: baseRevenue * 0.1,
    },
  ];

  levers.sort((a, b) => b.revenueImpact - a.revenueImpact);

  return {
    arpu: Math.round(arpu * 100) / 100,
    ltv: Math.round(ltv),
    cac: Math.round(cac),
    ltvCacRatio: Math.round(ltvCacRatio * 10) / 10,
    ltvCacVerdict,
    cacPaybackMonths: Math.round(cacPaybackMonths * 10) / 10,
    grossMarginDollars: Math.round(grossMarginDollars),
    netMarginDollars: Math.round(netMarginDollars),
    netMarginPercent: Math.round(netMarginPercent * 10) / 10,
    breakEvenCustomers,
    maxAllowableCAC: Math.round(maxAllowableCAC),
    cacHeadroom: Math.round(maxAllowableCAC - cac),
    medianCustomerLifeMonths,
    revenueLevers: levers.map(l => ({ ...l, revenueImpact: Math.round(l.revenueImpact) })),
  };
}
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
  Median Customer Life: 12.5 months

  Monthly P&L:
    Revenue:          $45,000
    Gross Profit:     $33,750 (75%)
    - Fixed Costs:    -$22,000
    - Marketing:      -$17,000
    Net Margin:       -$5,250 (-11.7%) ← LOSING MONEY

  Breakeven:          578 customers (you have 500 — 78 short)

  Revenue Lever Impact (10% improvement each):
    #1 Reduce churn 8%→7.2%:     +$5,625/month (HIGHEST IMPACT)
    #2 Increase ARPU $90→$99:    +$4,500/month
    #3 Increase prices 10%:       +$4,500/month
    #4 More customers 50→55/mo:  +$450/month

  Diagnosis: Your #1 problem is churn. At 8%/month, customers live only
  12.5 months on average. Fix churn first — it has the highest ROI.
  If you halve churn to 4%, LTV doubles to $1,688 and you become profitable.
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
    Research shows < 5% typically leave after a 20% price increase
    when communicated well with adequate notice.

  Recommendation: DO IT. Grandfather existing customers for 3 months,
  apply new price to all new signups immediately.
```

## Guidelines

- Always calculate LTV with gross margin, not raw ARPU. LTV = (ARPU × Gross Margin) / Churn.
- When churn is above 5% monthly, flag it as the #1 priority. Nothing else matters until churn is fixed.
- Present the 4 revenue levers ranked by impact for the specific business, not in generic order.
- Cash flow warnings should be prominent when a business is profitable on paper but cash-negative.
- Price increase modeling should always include 3 scenarios: no loss, typical loss (5%), and aggressive loss (15%).
- Remind users: "Revenue is vanity, profit is sanity, cash is king."
