---
name: growth-hacking
description: >-
  Design and execute growth experiments for rapid user acquisition and retention.
  Use when tasks involve viral loops, referral programs, conversion funnel optimization,
  A/B testing strategies, CAC/LTV analysis, product-led growth, activation rate
  improvement, cohort analysis, or scaling user growth through data-driven experimentation.
  Covers the full growth lifecycle from acquisition through retention.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - growth
    - marketing
    - acquisition
    - retention
    - experimentation
---

# Growth Hacking

## Overview

Design and run growth experiments that drive user acquisition, activation, retention, and revenue. Build viral loops, optimize funnels, and scale what works.

## Instructions

### Growth experiment framework

Every growth initiative starts as an experiment:

```markdown
## Experiment: [Name]

**Hypothesis**: If we [change], then [metric] will [improve] because [reason].
**Primary Metric**: [e.g., signup conversion rate]
**Success Criteria**: [e.g., +15% conversion with 95% confidence]
**Sample Size Needed**: [calculated based on baseline and MDE]
**Duration**: [e.g., 2 weeks or until statistical significance]
```

Run experiments in this order of impact:
1. **Activation** — get users to the "aha moment" faster
2. **Retention** — keep users coming back
3. **Acquisition** — bring more users in
4. **Revenue** — monetize effectively
5. **Referral** — turn users into advocates

Activation and retention come first because acquiring users into a leaky funnel wastes money.

### Viral loop design

The key metric is the viral coefficient (K-factor):

```
K = invites_per_user × conversion_rate_per_invite
K > 1.0 = exponential growth (rare, aim for K > 0.5 as amplifier)
```

**Types of viral loops:**
- **Organic virality**: The product requires others (Slack, Zoom, Figma). Build sharing into the core workflow.
- **Incentivized virality**: Reward both sides (Dropbox: 500MB free for both). Reward must connect to core value.
- **Content virality**: Users create shareable content (Canva watermark, Substack sharing).

**Referral program design**: Double-sided rewards convert 2-3x better than single-sided. Trigger on qualifying action (not just signup) to prevent fraud. Cap rewards per user to limit abuse. Short expiry creates urgency.

### Funnel optimization

Map the full journey and measure drop-off:

```
Visitor → Signup → Activation → Retention → Revenue → Referral

Example baseline:
Landing → Signup:     3.2% (benchmark: 2-5%)
Signup → Activated:   34%  (benchmark: 20-40%)
Activated → Day 7:    28%  (benchmark: 20-35%)
Active → Paid:        4.8% (benchmark: 2-5%)
Paid → Referrer:      12%  (benchmark: 5-15%)
```

Focus on the biggest drop-off first. A 10% improvement on 34% activation adds more users than 10% on 3.2% signup.

### Activation optimization

The "aha moment" is the action predicting long-term retention. Find it by comparing retained vs. churned user behavior:
- Slack: sending 2000+ team messages
- Dropbox: putting one file in a shared folder
- Facebook: adding 7 friends in 10 days

Once identified, redesign onboarding to get users there as fast as possible. Remove every step that doesn't lead to it.

### Cohort analysis

Track behavior by signup cohort to measure retention trends:

```
         Week 0  Week 1  Week 2  Week 3  Week 4
Jan W1   100%    42%     28%     22%     19%
Jan W2   100%    45%     31%     25%     21%
Feb W1   100%    52%     38%     31%     --
```

If newer cohorts retain better, product improvements are working. If retention flattens at a certain week, that's your natural floor — focus on raising it.

### Product-led growth

- **Freemium**: Free tier delivers real value, paid tier unlocked by usage limits or team features. Don't gate behind credit cards.
- **Reverse trial**: Full paid features for 14 days, then downgrade. Users decide about keeping vs. imagining.
- **Usage-based pricing**: Charge based on value consumed. Low barrier, scales with success.

### A/B testing

Calculate required sample size before launching:

```
n per variant = (Z² × p × (1-p)) / MDE²
Example: baseline 5%, detect +1% → n = 18,271 per variant
```

Don't peek at results early — wait for full sample size. Priority: Headlines/CTAs → Pricing → Onboarding → Social proof → Form length.

### Retention strategies

- **Habit loops**: Trigger → Action → Variable Reward → Investment
- **Re-engagement**: Segment churned users by last action, send targeted emails
- **Milestone celebrations**: Acknowledge achievements (first project, 100th task, 1-year anniversary)

### Growth metrics dashboard

```
ACQUISITION: New signups, signup conversion, CAC by channel
ACTIVATION: Activation rate, time to activate, drop-off steps
RETENTION: Day 1/7/30 retention, cohort trend, churn rate
REVENUE: MRR, ARPU, LTV, LTV:CAC ratio
REFERRAL: Viral coefficient (K), referral rate, referral conversion
```

## Examples

### Design a referral program for a SaaS product

```prompt
Design a referral program for our project management SaaS. We have 5,000 active users, $49/mo average plan, and 3% monthly churn. We want to reduce CAC (currently $180) and increase organic growth. Propose the incentive structure, qualifying actions, fraud prevention, and projected K-factor.
```

### Optimize onboarding activation rate

```prompt
Our activation rate is 23% (user creates first project within 48 hours of signup). Analyze our current 6-step onboarding flow, identify likely drop-off points, and propose experiments to get activation above 35%. Include A/B test designs with sample size calculations.
```

### Build a growth metrics dashboard

```prompt
Set up a weekly growth dashboard for our marketplace. We need to track supply-side (sellers) and demand-side (buyers) separately, with cohort retention, unit economics, and liquidity metrics. Recommend the metrics, alert thresholds, and review cadence.
```

## Guidelines

- Always prioritize activation and retention experiments before acquisition — fix the leaky funnel first
- Never peek at A/B test results early; wait for statistical significance or use sequential testing
- Use double-sided incentives for referral programs (2-3x better conversion than single-sided)
- Choose a North Star metric that is measurable, leading, actionable, and connected to revenue
- Re-engagement campaigns should segment by last user action, not blast the same message to all churned users
- Run experiments for a minimum of 1-2 weeks; don't call winners after a few days
- Track cohort retention weekly to validate that product changes actually improve outcomes
