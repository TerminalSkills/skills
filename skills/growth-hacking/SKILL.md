---
name: growth-hacking
description: >-
  Design and execute growth experiments for rapid user acquisition and retention.
  Use when tasks involve viral loops, referral programs, conversion funnel optimization,
  A/B testing strategies, CAC/LTV analysis, product-led growth, activation rate
  improvement, cohort analysis, or scaling user growth through data-driven experimentation.
  Covers the full growth lifecycle from acquisition through retention.
license: Apache-2.0
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
    - viral
---

# Growth Hacking

Design and run growth experiments that drive user acquisition, activation, retention, and revenue. Build viral loops, optimize funnels, and scale what works.

## Growth Experiment Framework

Every growth initiative starts as an experiment with a clear hypothesis, metric, and success criteria:

```markdown
## Experiment: [Name]

**Hypothesis**: If we [change], then [metric] will [improve] because [reason].
**Primary Metric**: [e.g., signup conversion rate]
**Secondary Metrics**: [e.g., activation rate, 7-day retention]
**Success Criteria**: [e.g., +15% conversion with 95% confidence]
**Sample Size Needed**: [calculated based on baseline and MDE]
**Duration**: [e.g., 2 weeks or until statistical significance]
**Segment**: [e.g., new visitors from organic search]
```

Run experiments in this order of impact:
1. **Activation** — get users to the "aha moment" faster
2. **Retention** — keep users coming back
3. **Acquisition** — bring more users in
4. **Revenue** — monetize effectively
5. **Referral** — turn users into advocates

Activation and retention come first because acquiring users into a leaky funnel wastes money.

## Viral Loop Design

A viral loop turns each user into a channel for acquiring more users. The key metric is the viral coefficient (K-factor):

```
K = invites_per_user × conversion_rate_per_invite

K > 1.0 = exponential growth (rare, aim for K > 0.5 as amplifier)
K = 0.7 means every 10 users bring 7 more, those 7 bring ~5, etc.
```

### Types of viral loops

**Organic/inherent virality** — the product requires others to use it (Slack, Zoom, Figma). Build sharing into the core workflow, not as an add-on.

**Incentivized virality** — reward both referrer and invitee (Dropbox: 500MB free storage for both sides). The reward must connect to the product's core value.

**Content virality** — users create content that attracts others (Canva watermark, Substack newsletter sharing). Make user output carry the brand naturally.

### Referral program structure

```typescript
// referral-system.ts
// Core referral tracking with double-sided incentives

interface ReferralConfig {
  referrerReward: Reward;      // What the referrer gets
  inviteeReward: Reward;       // What the new user gets
  maxRewardsPerUser: number;   // Cap to prevent gaming (e.g., 20)
  qualifyingAction: string;    // When reward triggers (e.g., "first_purchase")
  expiryDays: number;          // Link expiry (90 days typical)
  fraudChecks: FraudRule[];    // Same IP, disposable email, etc.
}

// Key design decisions:
// 1. Double-sided rewards convert 2-3x better than single-sided
// 2. Trigger on qualifying action, not just signup (prevents fraud)
// 3. Cap rewards per user to limit abuse
// 4. Short expiry creates urgency
```

## Funnel Optimization

Map the full user journey and measure drop-off at each step:

```
Visitor → Signup → Activation → Retention → Revenue → Referral

Example baseline metrics:
Landing page → Signup:     3.2% (benchmark: 2-5%)
Signup → Activated:        34%  (benchmark: 20-40%)
Activated → Day 7 return:  28%  (benchmark: 20-35%)
Day 7 → Day 30 return:     45%  (benchmark: 40-60%)
Active → Paid:             4.8% (benchmark: 2-5%)
Paid → Referrer:           12%  (benchmark: 5-15%)
```

Focus on the biggest drop-off first — that's where the leverage is. A 10% improvement on a 34% activation rate adds more users than a 10% improvement on a 3.2% signup rate.

### Activation optimization

The "aha moment" is the action that predicts long-term retention. Find it by analyzing the behavior of retained users vs. churned users:

- Slack: sending 2000+ messages as a team
- Dropbox: putting one file in a shared folder
- Facebook: adding 7 friends in 10 days

Once you know the aha moment, redesign onboarding to get users there as fast as possible. Remove every step that doesn't lead to it.

## Cohort Analysis

Track user behavior by signup cohort (week or month) to measure retention trends over time:

```
         Week 0  Week 1  Week 2  Week 3  Week 4
Jan W1   100%    42%     28%     22%     19%
Jan W2   100%    45%     31%     25%     21%
Jan W3   100%    48%     35%     29%     24%
Feb W1   100%    52%     38%     31%     --
```

If newer cohorts retain better than older ones, your product improvements are working. If retention flattens at a certain week (e.g., Week 4 → Week 8 stays ~19%), that's your natural retention floor — focus on raising it.

## North Star Metric

Choose one metric that captures the core value delivered to users:

| Product Type | North Star Metric |
|---|---|
| SaaS | Weekly active users performing core action |
| Marketplace | Transactions completed per week |
| E-commerce | Revenue per customer per month |
| Media/Content | Time spent reading/watching per week |
| Social | Daily active users posting or engaging |

The North Star should be:
- Measurable and trackable in real time
- Leading (predicts future success, not just records past)
- Actionable (the team can influence it directly)
- Connected to revenue (not just vanity)

## Product-Led Growth

Let the product sell itself through free tiers, trials, and self-serve onboarding:

**Freemium model**: Free tier generous enough to deliver real value, paid tier unlocked by hitting usage limits or needing team features. The free tier is your acquisition channel — don't gate it behind credit cards.

**Reverse trial**: Give full paid features for 14 days, then downgrade to free. Users experience premium value first, making the upgrade decision about keeping what they have rather than imagining what they'd get.

**Usage-based pricing**: Charge based on value consumed (API calls, team members, storage). Low barrier to start, scales with customer success. Aligns your revenue with customer value.

## A/B Testing

### Statistical rigor

Before launching a test, calculate the required sample size:

```
Sample size per variant = (Z² × p × (1-p)) / MDE²

Where:
- Z = 1.96 for 95% confidence
- p = baseline conversion rate
- MDE = minimum detectable effect (e.g., 0.02 for +2%)

Example: baseline 5% conversion, want to detect +1% change
n = (1.96² × 0.05 × 0.95) / 0.01² = 18,271 per variant
```

Don't peek at results early — wait for full sample size or use sequential testing methods. Early peeking inflates false positive rates.

### What to test (in priority order)

1. **Headlines and CTAs** — highest leverage, fastest to test
2. **Pricing and packaging** — large revenue impact
3. **Onboarding flow** — affects activation rate
4. **Social proof placement** — testimonials, logos, user counts
5. **Form length** — fewer fields = higher conversion (usually)

## Retention Strategies

**Habit loops**: Trigger → Action → Variable Reward → Investment. Design your product to create a daily or weekly habit. Notifications are triggers, the core action is the routine, personalized content is the variable reward, and user data/customization is the investment that makes leaving costly.

**Re-engagement campaigns**: Segment churned users by their last action and send targeted emails:
- Never activated → show them the aha moment
- Used once → highlight new features since they left
- Was active, stopped → ask what changed, offer help
- Was paying, cancelled → offer discount or pause option

**Milestone celebrations**: Acknowledge user achievements (first project completed, 100th task done, 1-year anniversary). Builds emotional connection and reminds users of value received.

## Growth Metrics Dashboard

Track these metrics weekly:

```
ACQUISITION
- New signups: [count] ([change]% WoW)
- Signup conversion: [rate]% (from [source])
- CAC by channel: Organic $[x], Paid $[y], Referral $[z]

ACTIVATION
- Activation rate: [rate]% (target: [target]%)
- Time to activate: [hours/days] (target: [target])
- Drop-off steps: [step1] [rate]%, [step2] [rate]%

RETENTION
- Day 1: [rate]% | Day 7: [rate]% | Day 30: [rate]%
- Cohort trend: [improving/declining/stable]
- Churn rate: [rate]% monthly

REVENUE
- MRR: $[amount] ([change]% MoM)
- ARPU: $[amount]
- LTV: $[amount] | LTV:CAC ratio: [x]:1

REFERRAL
- Viral coefficient: [k-factor]
- Referral rate: [rate]% of active users
- Referral conversion: [rate]%
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
