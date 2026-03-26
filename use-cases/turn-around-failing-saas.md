---
title: Turn Around a SaaS Stuck in the Growth Trough
slug: turn-around-failing-saas
description: >-
  Alex's project management SaaS hit $12k MRR then flatlined for 9 months.
  New signups come in but churn cancels all growth. Using systems thinking and
  the 5-Fold Why, he finds the real constraint — 23% activation rate — and
  reaches $18k MRR in 3 months by fixing onboarding.
skills:
  - systems-thinking
  - market-evaluation
category: business
tags:
  - saas
  - churn
  - activation
  - onboarding
  - systems-thinking
  - growth
---

## The Problem

Alex built a project management SaaS for creative agencies. He launched 2 years ago, grinded through early growth, and hit $12k MRR at month 15. Then something broke.

For 9 straight months: $12k MRR. Not declining — just dead flat.

**His numbers:**
- MRR: $12,000 (stuck)
- Monthly signups: ~120
- Monthly churn: ~28 customers (7% of ~400 customers)
- New paying customers/month: ~28 (almost exactly canceling churn)
- Team: 3 people (Alex + 2 developers)
- Runway: 4 months

He's tried everything obvious:
- Switched email marketing tools (no impact)
- Redesigned the homepage (tiny traffic bump, no conversion change)
- Added 4 new features based on customer requests (churn continued)
- Discounted aggressively (got customers who churned faster)

He's exhausted and starting to think the market is wrong.

The market isn't the problem.

## The Solution

Stop guessing and apply systems thinking: map the customer journey as a system, find the constraint, drill to root cause with 5-Fold Why, and fix the one thing that's breaking growth.

## Step-by-Step Walkthrough

### Step 1: Map the System

Alex stops trying to fix things and starts mapping the customer journey as a system with feedback loops.

```
CUSTOMER JOURNEY SYSTEM:

Marketing → Signups → [ACTIVATION] → Paying → [RETENTION] → Expansion
                ↓                         ↓
             Drop off                  Churn
             (most here)              (some here)

INPUTS per month:
  Traffic: ~3,000 visitors
  Signups: 120 (4% conversion from traffic — reasonable)
  Trial → Activation: ? (Alex doesn't know this number — red flag)
  Activation → Paid: ? (also unknown)
  Monthly churn: 28 customers (7%)
```

Alex realizes he's been optimizing the top of the funnel (traffic, homepage) without knowing where users actually drop off. He spends 3 days adding analytics.

### Step 2: Find the Constraint

After adding Mixpanel events to track the user journey, Alex looks at the data:

```
FUNNEL METRICS (actual):
  Monthly signups:          120  (100%)
  Completed onboarding:      28  (23%)  ← MASSIVE DROP
  Connected first project:   24  (20%)
  Invited a teammate:        19  (16%)
  Converted to paid:         16  (13%)

77% of signups leave before experiencing the product.

This is Theory of Constraints in action:
  - The CONSTRAINT is not marketing (120 signups/month is fine)
  - The CONSTRAINT is not closing (16/24 active trial users convert — 67%, great)
  - The CONSTRAINT is ACTIVATION (23% of signups even get to the product)

Fixing marketing: Get 200 signups/month. At 23% activation → 46 active. 16 paid.
                  Costs ~$8,500/month more in ad spend for 16 more customers.
                  
Fixing activation: Get 120 signups/month. At 50% activation → 60 active. 40 paid.
                   Costs nothing in additional spend. +24 customers/month.
```

This one chart changes everything. Alex has been spending money on the wrong problem.

### Step 3: Apply the 5-Fold Why

Alex wants to understand WHY activation is 23%. He doesn't guess — he watches users.

He records 10 Hotjar sessions of users who signed up and never came back. Then runs 8 user interviews with "activated" vs "not activated" users to understand the difference.

```
5-FOLD WHY: "Why don't new users activate?"

WHY 1: Why do 77% of signups leave without using the product?
  → They sign up, see an empty dashboard, and don't know what to do next.

WHY 2: Why don't they know what to do next?
  → There's no guided setup. The app just opens to a blank project list.

WHY 3: Why is there no guided setup?
  → Alex assumed users would "figure it out" — the product seems intuitive to him.

WHY 4: Why does an empty state feel overwhelming to new users?
  → Project management tools require YOU to bring the data/structure.
     There are no template projects, no example data, no "start here."

WHY 5: Why does this matter more for Alex's product than for competitors?
  → Creative agencies have complex workflows. Asana/Monday have huge doc libraries.
     Alex's product has better UX for agencies but zero onboarding resources.

ROOT CAUSE: New users can't see the value fast enough because:
  1. Empty state with no guidance
  2. No template projects to demonstrate capability
  3. Time to first value is > 20 minutes (vs competitors' < 5 minutes)
```

### Step 4: The Solution

Alex defines the fix: **Time to First Value < 3 minutes.**

Users should be able to start a real project and see the product's core value within 3 minutes of signing up — before any configuration, before reading any docs, before inviting teammates.

```
2-WEEK SPRINT PLAN:

Week 1: The "3-minute value" onboarding
  Day 1-2: Step-by-step onboarding wizard (4 steps max)
    Step 1: "What kind of agency are you?" (3 options: digital, creative, branding)
    Step 2: "How big is your team?" (Solo / 2-10 / 10+)
    Step 3: [Auto-create a template project based on answers]
    Step 4: "Here are your first 3 tasks — try completing one"
  
  Day 3-4: Template project library (based on agency type)
    - "Website Redesign" template (12 tasks, 4 phases)
    - "Brand Identity Project" template (8 tasks, 3 phases)
    - "Social Media Campaign" template (6 tasks, 2 phases)
    - Empty project (for power users who know what they want)
  
  Day 5: Onboarding email sequence
    Hour 1:  "Your [Agency Type] workspace is ready — here's what to try first"
    Day 1:   "3 features that creative agencies love" (with GIFs)
    Day 3:   "Still finding your way? Here's a 4-minute walkthrough video"
    Day 7:   "How [Customer Name] uses Alex's tool for [specific use case]"

Week 2: Kill the noise
  - Remove 4 features with < 2% usage that confuse onboarding
    (export to CSV, custom themes, API access — power features, not onboarding features)
  - Simplify navigation from 7 items to 4
  - Move complex settings behind "Advanced" toggle
  - Write 20 template help articles
```

Alex shipped this in 11 days.

### Step 5: Results

```
BEFORE vs AFTER (30 days post-launch):

Funnel comparison:
                        Before    After    Change
Monthly signups:          120      120      0%   (didn't touch marketing)
Completed onboarding:      28       62    +121%
Connected first project:   24       55    +129%
Invited a teammate:        19       44    +131%
Converted to paid:         16       38    +138%

Monthly new customers: 16 → 38
Monthly churn: 28 → 26 (slight improvement from better-fit customers)
Net MRR growth: -$1,080 to +$2,700/month

Month 1 post-launch: $12k → $14.7k MRR
Month 2: $14.7k → $16.4k MRR  
Month 3: $16.4k → $18.2k MRR

LTV/CAC improved:
  - Better-fit customers (template onboarding selects for agency users)
  - 3-month churn rate dropped from 21% to 14% for new cohorts
  - NPS went from 28 to 44
```

### Step 6: What Alex Killed (Equally Important)

```
FEATURES REMOVED:
  - Custom CSS themes: 1.8% usage, infinite support burden
  - CSV export: 2.1% usage, confusing in onboarding sidebar
  - Public project sharing: 0.9% usage, complex privacy implications
  - API access (moved to paid tier only): reduces free plan complexity

TIME SAVED:
  - Support tickets dropped 31% (simpler product = fewer questions)
  - Alex freed up 5 hours/week previously spent on exotic support requests
  - Dev team shipped 40% faster (fewer features to maintain)

Gall's Law in action: the simpler product worked BETTER than the complex one.
```

### Step 7: What Alex Should Have Done Differently

```
MISTAKE: Spent 9 months optimizing what he could see (homepage, features)
         instead of measuring what he couldn't see (activation funnel).

LESSON: Instrument your funnel on day 1. You cannot fix what you cannot measure.

MISTAKE: Added features when the product was too complex to use in the first place.
         Feature requests from churned customers are often "I'd stay if it did X"
         but the real reason they left was "I never figured out your core product."

LESSON: Before adding features, ensure existing features have > 20% weekly usage.
        If your core feature has 20% usage, you don't have a feature problem.
        You have an onboarding problem.

MISTAKE: Discounting to fight churn. Discounted customers churn faster
         because they're price-sensitive, not value-committed.

LESSON: Never discount to fight churn. Fix the product. If they're leaving,
        price isn't the problem.
```

## Real-World Example

**Company:** AgencyFlow (Alex's project management SaaS for creative agencies)
**Timeline:** 3 months from $12k MRR flatline to $18.2k MRR growth

Alex's project management tool had been stuck at $12k MRR for 9 straight months. He was acquiring ~28 new customers per month, but ~28 churned — perfect equilibrium at the wrong number. He had tried redesigning the homepage, adding 4 new features, and offering discounts. Nothing moved the needle.

He finally instrumented the full funnel with Mixpanel and discovered the real problem: of 120 monthly signups, only 28 (23%) completed onboarding. Users signed up, saw an empty dashboard with no guidance, and never came back. Meanwhile, users who did activate converted to paid at 67% — the product was good, but nobody was getting to it.

Alex applied the 5-Fold Why by watching 10 Hotjar recordings and interviewing 8 users. Root cause: creative agencies have complex workflows, and an empty project management tool with no templates or guided setup required 20+ minutes to see any value. Competitors had massive documentation libraries; Alex had nothing.

He shipped a fix in 11 days: a 4-step onboarding wizard that auto-created a template project based on agency type (digital, creative, branding), simplified navigation from 7 items to 4, and removed 4 features with under 2% usage. He also added an onboarding email sequence with GIFs showing core workflows.

Results after 30 days: activation jumped from 23% to 52%, paid conversions nearly tripled from 16 to 38 per month, and support tickets dropped 31%. By month 3: $18.2k MRR and growing. He never changed marketing spend — the same 120 signups/month now produced 2.4x more paying customers.

## Key Lessons

1. **You can't see your constraint until you measure the whole funnel.** Alex optimized the homepage for 9 months while 77% of users left at the front door of the product.

2. **New features don't fix an activation problem.** Churned users say "I'd stay if it did X" but really mean "I never understood your core value." More features in a confusing product = more confusion.

3. **Gall's Law:** The simpler product won. Removing 4 features improved retention, reduced support, and increased team velocity.

4. **5-Fold Why is only useful if you OBSERVE, not guess.** Alex watched Hotjar sessions and ran user interviews. The root cause (empty state with no templates) would not have been obvious from dashboard metrics alone.

5. **Activation is almost always the biggest lever.** For most early SaaS products, activation (trial → engaged user) is more broken than acquisition or retention. Fix it first.

## Related Skills

- **[systems-thinking](/skills/systems-thinking)** — Map the customer journey as a system with feedback loops and find the constraint
- **[market-evaluation](/skills/market-evaluation)** — Re-evaluate market positioning when growth stalls
- **[product-analytics](/skills/product-analytics)** — Instrument the activation funnel and track feature usage rates
- **[product-discovery](/skills/product-discovery)** — Run user interviews and session recordings to find root causes
- **[product-strategy](/skills/product-strategy)** — Decide what features to kill and what to double down on
