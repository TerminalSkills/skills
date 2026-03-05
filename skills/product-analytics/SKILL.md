---
name: product-analytics
description: Expert guidance for product analytics, helping product teams define metrics, build funnels, analyze retention, run A/B tests, and make data-driven decisions. The agent apply frameworks for North Star metrics, pirate metrics (AARRR), cohort analysis, and experiment design.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
  - analytics
  - metrics
  - retention
  - cohorts
  - funnels
---

# Product Analytics — Metrics, Funnels, and Growth


## Overview

You are an expert in product analytics, helping product teams define metrics, build funnels, analyze retention, run A/B tests, and make data-driven decisions. You apply frameworks for North Star metrics, pirate metrics (AARRR), cohort analysis, and experiment design.

## Instructions

### North Star Metric

```markdown
## Define Your North Star Metric

The North Star is a single metric that captures the core value
your product delivers to customers. It aligns every team around
what matters most.

### Criteria for a Good North Star
1. Reflects customer value (not just revenue)
2. Leading indicator of revenue (not lagging)
3. Measurable and actionable
4. Every team can influence it

### Examples by Product Type
- **Marketplace**: Weekly transactions (Airbnb: nights booked)
- **SaaS Productivity**: Weekly active users completing core action
  (Slack: messages sent in channels with 3+ participants)
- **Subscription Media**: Weekly engaged time (Spotify: listening hours)
- **E-commerce**: Weekly purchases from repeat customers
- **Developer Tool**: Weekly API calls in production (Stripe, Twilio)

### North Star Framework
Your North Star has 3-5 input metrics that drive it:

North Star: "Weekly active teams completing core workflow"

Input metrics:
1. **Breadth**: New teams activated this week
2. **Depth**: Core workflows completed per team per week
3. **Frequency**: Days active per week per team
4. **Efficiency**: Time to complete core workflow
5. **Quality**: Workflow completion rate (started vs finished)

Each team owns an input metric. Together they drive the North Star.
```

### AARRR Pirate Metrics

```markdown
## Pirate Metrics Funnel

### Acquisition — How do users find you?
Metrics: Website visitors, signup rate, CAC, channel attribution
Questions: Which channels bring the highest-quality users? What's the CAC by channel?

### Activation — Do users experience core value?
Metrics: Onboarding completion rate, time-to-first-value, "aha moment" reached
Questions: What % of signups complete onboarding? What's the "aha moment"?

### Retention — Do users come back?
Metrics: D1/D7/D30 retention, weekly active rate, churn rate
Questions: What does the retention curve look like? Where does it flatten?

### Revenue — Do users pay?
Metrics: Conversion rate (free → paid), ARPU, LTV, expansion revenue
Questions: What triggers the upgrade? What's the payback period on CAC?

### Referral — Do users invite others?
Metrics: Viral coefficient, referral rate, NPS, organic share rate
Questions: Do users invite others? What's the average referrals per user?

### Identify Your Bottleneck
Measure each stage. The stage with the worst drop-off is your bottleneck.
Focus there — don't optimize acquisition if nobody activates.
```

### Retention Analysis

```markdown
## Analyze Retention

### Retention Curve
Plot % of users who return on Day 1, Day 7, Day 14, Day 30.
- **Good**: Curve flattens (users who stay past day 7 stick around)
- **Bad**: Curve approaches zero (no habitual users)

### Cohort Analysis
Compare retention across weekly or monthly sign-up cohorts:

Cohort      | Week 1 | Week 2 | Week 3 | Week 4 | Week 8
Jan 1-7     |   100% |    42% |    31% |    28% |    25%
Jan 8-14    |   100% |    45% |    35% |    32% |    29%
Jan 15-21   |   100% |    51% |    40% |    38% |    —

Reading this: Jan 15-21 cohort retains better → what changed?
Check: product changes, marketing channel mix, seasonality.

### Retention by Segment
Break retention by:
- **Acquisition channel**: Do SEO users retain better than paid?
- **Plan tier**: Do Pro users retain better than Free?
- **Activation actions**: Did they complete onboarding? Use feature X?
- **Company size**: Do small teams churn more than large?

### Find the "Aha Moment"
The aha moment is the action that predicts retention.

Method:
1. List all actions a user can take in the first week
2. For each action, split users who did it vs didn't
3. Compare 30-day retention between the two groups
4. The action with the biggest retention gap is your aha moment

Example findings:
- Users who create 3+ projects in week 1: 72% D30 retention
- Users who create 0-2 projects: 18% D30 retention
→ Aha moment: creating the 3rd project
→ Action: optimize onboarding to drive users to create 3 projects
```

### A/B Testing

```markdown
## Run A/B Tests

### Before You Test
1. Define the hypothesis: "Changing X will improve Y by Z%"
2. Choose the primary metric (one!)
3. Calculate sample size: use a power calculator
   - Baseline conversion: current rate
   - Minimum detectable effect: smallest change worth detecting
   - Statistical power: 80% (standard)
   - Significance level: 95% (standard)
4. Estimate duration: sample size ÷ daily traffic

### Common Mistakes
- ❌ Stopping early because results "look significant"
- ❌ Testing too many variants (dilutes sample size)
- ❌ Changing the test mid-experiment
- ❌ Using the wrong metric (vanity vs actionable)
- ❌ Not segmenting results (overall flat, but +30% for mobile users)

### Interpreting Results
**Statistical significance ≠ practical significance**
- 2% lift with p<0.05 might not be worth the engineering cost
- Consider the confidence interval, not just the point estimate
- Always check for novelty effects (run for 2+ full weeks)

### Sequential Testing
For faster decisions, use sequential testing:
- Define stopping rules before starting
- Check daily, but only stop if the boundary is crossed
- Avoids the "peeking problem" of traditional tests

### Post-Test
- Document: hypothesis, variant, result, learnings
- If winner: roll out to 100%
- If flat: was the sample size large enough? Consider the learning.
- If loser: document why and share the learning
```

### Funnel Analysis

```markdown
## Build and Optimize Funnels

### Define the Funnel
Map every step from entry to conversion:

E-commerce: Visit → Product View → Add to Cart → Checkout → Purchase
SaaS: Visit → Signup → Onboarding → Activation → Upgrade

### Measure Drop-off
Step                 | Users  | Conversion | Drop-off
Visit                | 10,000 |       100% |       —
Signup               |  2,500 |        25% |     75%
Complete onboarding  |  1,000 |        40% |     60%
Reach aha moment     |    600 |        60% |     40%
Still active at D30  |    300 |        50% |     50%
Upgrade to paid      |     90 |        30% |     70%

### Find the Biggest Lever
The step with the biggest absolute drop-off has the most room for improvement.
In the example above: 75% drop at Signup → fix the landing page first.

### Optimize Each Step
- **Visit → Signup**: Value proposition clarity, social proof, friction reduction
- **Signup → Onboarding**: Reduce form fields, add progress indicators
- **Onboarding → Activation**: Guide to aha moment, remove unnecessary steps
- **Activation → Retention**: Habit loops, notifications, value reminders
- **Retention → Revenue**: Upgrade triggers, usage limits, feature gating
```

## Guidelines

1. **One North Star** — Align the entire product team around a single metric that reflects customer value
2. **Input metrics per team** — Each team owns an input metric that drives the North Star; this creates autonomy with alignment
3. **Retention before acquisition** — Fix retention first; acquiring users into a leaky bucket wastes money
4. **Cohort everything** — Never look at aggregate metrics; always break by cohort (signup week, plan, channel) to find patterns
5. **Find the aha moment** — Identify the action that predicts retention; then optimize onboarding to drive users to that action
6. **A/B test with discipline** — Pre-register hypothesis, sample size, and duration; never peek and stop early
7. **Instrument early** — Add analytics from day one; retroactive instrumentation means lost data you can never recover
8. **Metrics are questions** — A metric tells you WHAT happened; you need qualitative research (interviews, session recordings) to understand WHY
