---
name: value-based-selling
description: >-
  Master value-based selling techniques — price based on customer value, reduce barriers to
  purchase, and close deals through education rather than pressure. Use when: setting prices
  for a product/service, improving conversion rates, training sales teams.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [sales, pricing, value-based, conversion, negotiation, revenue]
  use-cases:
    - "Price a B2B SaaS product based on value delivered, not cost"
    - "Identify and remove the top 5 barriers preventing customers from buying"
    - "Create a sales process that educates prospects instead of pressuring them"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Value-Based Selling

## Overview

Most businesses price based on cost-plus or competitor matching. Both leave massive money on the table. Value-based selling prices your offering based on the value it creates for the customer — and uses education, not pressure, to close deals.

The Pricing Uncertainty Principle from the Personal MBA states: all prices are malleable. There is no "correct" price — only the price the market will bear relative to the perceived value. Your job is to maximize perceived value and minimize perceived risk.

## Instructions

When a user asks about pricing strategy, improving sales conversions, or removing barriers to purchase, apply these frameworks.

### Step 1: Understand the Value You Create

Before setting any price, quantify the value your product creates for the customer. There are four pricing methods to establish this:

#### The 4 Pricing Methods

1. **Replacement Cost** — What would it cost the customer to build this themselves?
   - "Our CRM integration saves you from hiring a developer for 3 months ($45k). We charge $499/month."
   - Works best for: tools that replace labor or in-house builds

2. **Market Comparison** — What do alternatives cost?
   - "Competitors charge $200-800/month. We're at $149/month with better features."
   - Works best for: established markets with known competitors
   - Danger: anchors you to competitor pricing, not value

3. **Discounted Cash Flow (DCF)** — What is the financial value of what you provide over time?
   - "Our tool increases conversion rate by 2%, which at your traffic means $340k additional revenue per year."
   - Works best for: B2B with measurable ROI

4. **Value Comparison** — What is the emotional/strategic value to the buyer?
   - "How much is it worth to never worry about data loss again?"
   - Works best for: insurance, security, peace-of-mind products

**Rule of thumb:** Price at 10-20% of the value you create. If you save a company $100k/year, charging $10-20k/year is a no-brainer for them and highly profitable for you.

### Step 2: Apply Education-Based Selling

Stop selling. Start teaching. Education-based selling works because:

- **Informed buyers convert better** — When prospects understand their problem deeply, they see why your solution matters
- **Teaching builds trust** — You become the expert, not just another vendor
- **It disqualifies bad fits early** — Prospects who don't have the problem you solve self-select out

**Implementation:**
1. Create content that teaches prospects about their problem (blog posts, webinars, guides)
2. Show the cost of NOT solving the problem (status quo has a price)
3. Explain the landscape of solutions (including competitors — yes, really)
4. Demonstrate how your approach is different (not "better" — different in a way that matters)
5. Let them conclude that you're the right choice (don't push — pull)

**Example email sequence for a SaaS product:**
- Email 1: "The hidden cost of manual data entry (most teams waste 15 hours/week)"
- Email 2: "3 approaches to automation: build, buy off-the-shelf, or use an AI tool"
- Email 3: "How Company X reduced data entry time by 80% (case study)"
- Email 4: "Your options: here's what we offer (with transparent pricing)"

### Step 3: Remove Barriers to Purchase

Every sale has friction. The 5 standard barriers to purchase and how to eliminate each:

1. **It costs too much** (price barrier)
   - Solution: Reframe as investment with ROI. Offer payment plans. Show cost of inaction.
   - "This costs $200/month. But you're losing $2,000/month to the problem it solves."

2. **It won't work for me** (effectiveness barrier)
   - Solution: Case studies from similar customers. Free trial period. Live demo with their data.
   - "Here's a company your exact size in your industry that got these results."

3. **It won't work well enough** (quality barrier)
   - Solution: Guarantee. "If you don't see X result in 30 days, full refund."
   - Money-back guarantees typically INCREASE sales by 20-30% while refund rates stay under 5%.

4. **I can wait** (urgency barrier)
   - Solution: Show cost of delay. Limited-time pricing. Founder pricing for early adopters.
   - "Every month you wait costs you $2,000 in lost productivity."

5. **It's too hard to switch** (effort barrier)
   - Solution: White-glove onboarding. Data migration service. "We'll set it up for you."
   - The biggest competitor isn't another product — it's the customer's current workflow (even if it sucks).

### Step 4: Implement Risk Reversal

Risk reversal shifts the risk from buyer to seller. This sounds scary but dramatically increases conversions:

- **Money-back guarantee** — "Full refund within 30 days, no questions asked"
- **Free trial** — "Use it free for 14 days, credit card not required"
- **Pay-for-results** — "You only pay if we deliver the agreed outcome"
- **Pilot program** — "Start with a 3-month pilot at reduced rate"

The stronger your risk reversal, the more you're saying: "We're so confident this works that we'll bet on it." Customers trust confident sellers.

### Step 5: Analyze the Next Best Alternative

Your prospect always has alternatives. Map them:

```
For a project management SaaS:
  1. Direct competitors: Asana, Monday, Linear ($8-20/user/month)
  2. Indirect alternatives: spreadsheets (free), email threads (free), sticky notes
  3. Do nothing: keep current chaotic process

Your positioning must beat ALL of these, not just direct competitors.
The real enemy is often "do nothing" — the status quo.
```

## Code Example: Pricing Calculator

```typescript
interface PricingInputs {
  // What value do you create?
  annualValueToCustomer: number;        // $ saved or earned per year
  alternativeCostPerYear: number;        // what they'd pay for the next best option
  customerTimeSavedHoursPerWeek: number; // hours saved per week
  customerHourlyRate: number;            // what their time is worth

  // What does it cost you?
  costToServePerMonth: number;           // hosting, support, etc.
  targetMarginPercent: number;           // desired gross margin (e.g., 80)
}

interface PricingRecommendation {
  valueBased: { monthly: number; annual: number; reasoning: string };
  competitorBased: { monthly: number; annual: number; reasoning: string };
  costPlus: { monthly: number; annual: number; reasoning: string };
  recommended: { monthly: number; annual: number; reasoning: string };
  riskReversals: string[];
}

function calculatePricing(inputs: PricingInputs): PricingRecommendation {
  const timeSavingsPerYear = inputs.customerTimeSavedHoursPerWeek * 52 * inputs.customerHourlyRate;
  const totalValuePerYear = inputs.annualValueToCustomer + timeSavingsPerYear;

  // Value-based: 10-20% of value created
  const valueBasedAnnual = Math.round(totalValuePerYear * 0.15);
  const valueBasedMonthly = Math.round(valueBasedAnnual / 12);

  // Competitor-based: 10-20% below alternative
  const competitorBasedAnnual = Math.round(inputs.alternativeCostPerYear * 0.85);
  const competitorBasedMonthly = Math.round(competitorBasedAnnual / 12);

  // Cost-plus: cost / (1 - margin%)
  const costPlusMonthly = Math.round(inputs.costToServePerMonth / (1 - inputs.targetMarginPercent / 100));
  const costPlusAnnual = costPlusMonthly * 12;

  // Recommended: highest of cost-plus and average of value + competitor
  const recommendedMonthly = Math.max(
    costPlusMonthly,
    Math.round((valueBasedMonthly + competitorBasedMonthly) / 2)
  );

  return {
    valueBased: {
      monthly: valueBasedMonthly,
      annual: valueBasedAnnual,
      reasoning: `15% of ${totalValuePerYear.toLocaleString()} annual value created`,
    },
    competitorBased: {
      monthly: competitorBasedMonthly,
      annual: competitorBasedAnnual,
      reasoning: `15% below alternative cost of ${inputs.alternativeCostPerYear.toLocaleString()}/year`,
    },
    costPlus: {
      monthly: costPlusMonthly,
      annual: costPlusAnnual,
      reasoning: `${inputs.targetMarginPercent}% margin on ${inputs.costToServePerMonth}/month cost`,
    },
    recommended: {
      monthly: recommendedMonthly,
      annual: recommendedMonthly * 10, // annual discount (2 months free)
      reasoning: "Balanced between value created and competitive positioning, with annual discount",
    },
    riskReversals: [
      "30-day money-back guarantee (no questions asked)",
      "14-day free trial (no credit card required)",
      `ROI guarantee: if you don't save ${Math.round(totalValuePerYear * 0.5).toLocaleString()} in year 1, next year is free`,
    ],
  };
}
```

## Examples

### Example 1: Price a B2B SaaS product

**User request:** "I built an automated reporting tool for marketing agencies. It saves them about 10 hours/week of manual report creation. How should I price it?"

**Output:**
```
Value-Based Pricing Analysis:

  Value Created:
    Time saved: 10 hrs/week × 52 weeks × $75/hr (agency rate) = $39,000/year
    Client retention from better reporting: ~$15,000/year estimated
    Total annual value: ~$54,000/year

  Pricing Options:
    Value-based (15% of value):   $675/month ($8,100/year)
    Competitor-based:             $299/month (ReportGarden: $199, AgencyAnalytics: $399)
    Cost-plus (80% margin):       $75/month (your floor)

  Recommended: $399/month ($3,990/year on annual plan)
  Why: Positions you mid-market, 10x below value created (easy ROI argument),
       competitive with established players.

  Risk Reversal Strategy:
    - 14-day free trial (no credit card)
    - "If you don't save 5+ hours/week in the first month, full refund"
    - White-glove onboarding for annual plans

  Sales Pitch: "You're spending $39k/year in labor on manual reports.
  Our tool does it for $4k/year. That's a 10x return."
```

### Example 2: Remove barriers to purchase

**User request:** "We have a great product but conversion from free trial to paid is only 4%. What's wrong?"

**Output:**
```
Barrier Analysis for 4% Trial-to-Paid Conversion:

  Industry benchmark: 15-25% for SaaS free trials

  Likely barriers (investigate in order):

  1. VALUE NOT DEMONSTRATED (most common cause)
     - Are users reaching the "aha moment" during trial?
     - Action: Track activation metrics. What % complete core workflow?
     - Fix: Guided onboarding → show value in first 5 minutes

  2. EFFORT TOO HIGH
     - How many steps to get value? If > 5, you're losing people.
     - Action: Map the trial experience step by step
     - Fix: Pre-fill data, offer templates, reduce setup friction

  3. PRICE SHOCK
     - Do users see pricing BEFORE or AFTER experiencing value?
     - Action: Show pricing only after activation milestone
     - Fix: Anchor price to value: "You saved 3 hours this week.
       Keep saving for $X/month."

  4. NO URGENCY
     - 14-day trial is standard. But do you remind them?
     - Action: Email sequence at day 1, 3, 7, 10, 13
     - Fix: Show progress: "You've saved 12 hours this trial.
       Don't lose access in 4 days."

  5. SWITCHING COST FEAR
     - Will their data be locked in? Can they export?
     - Action: Prominent "export anytime" messaging
     - Fix: Migration assistance, data portability guarantees

  Quick win: Focus on barrier #1 first — it's almost always the issue.
```

## Guidelines

- Always quantify value in dollars when possible. "Saves time" is vague. "Saves $39k/year in labor" closes deals.
- Never recommend pricing below cost-plus — you must be profitable to serve customers long-term.
- When analyzing barriers, focus on the BIGGEST barrier first. Fixing all five at once is overwhelming.
- Risk reversal should feel confident, not desperate. Frame guarantees as "we're betting on ourselves."
- The Next Best Alternative is often "do nothing." Always address inertia as a competitor.
- Education-based selling takes longer to close but produces higher LTV customers who churn less.
