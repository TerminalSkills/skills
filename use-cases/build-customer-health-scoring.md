---
title: "Build a Customer Health Scoring System"
slug: build-customer-health-scoring
description: "Combine product usage, support tickets, and billing data to score customer health and predict churn before it happens."
skills: [data-analysis, excel-processor]
category: data-ai
tags: [customer-success, churn-prediction, analytics, scoring, retention]
---

# Build a Customer Health Scoring System

## The Problem

Your B2B SaaS has 340 paying customers and a 6% monthly churn rate. Every churned customer is a surprise -- the cancellation email arrives, and the customer success team scrambles to figure out what went wrong. By then, it is too late. Post-mortems reveal the warning signs were there months ago: declining logins, unanswered support tickets, missed renewal discussions.

The data to predict churn already exists. Product analytics show who is logging in. Intercom has support ticket history. Stripe has billing patterns. But this data lives in 3 different systems, and nobody has time to manually cross-reference 340 accounts every week. The two-person CS team manages accounts by gut feel and squeaky-wheel prioritization -- which means the quiet churners, the ones who never complain and just leave, slip away completely unnoticed.

At 6% monthly churn, the company loses roughly 20 customers per month. At an average contract value of $850/month, that is $17,000 in MRR walking out the door every 30 days. Even saving a third of those accounts would be worth $68,000 per year.

## The Solution

Using the **data-analysis** and **excel-processor** skills, the agent merges exports from three systems, analyzes historical churn patterns to find leading indicators, builds a weighted health score for every account, and produces a daily priority list the CS team can act on immediately.

## Step-by-Step Walkthrough

### Step 1: Merge and Clean Multi-Source Data

Start by pulling data from all three systems:

```text
Here are three exports: product-usage.csv (daily logins, feature usage per account), support-tickets.csv (ticket history with resolution times), and billing.csv (MRR, plan changes, payment failures). Merge them into a single customer dataset.
```

The merge produces a unified dataset: **340 accounts, 24 features per account.**

- **Product signals:** login frequency, DAU ratio, features used, time in app, days since last active
- **Support signals:** open tickets, average resolution hours, escalations in 90 days, sentiment score
- **Billing signals:** MRR, plan tier, months active, payment failures in 90 days, downgrade history
- **Derived signals:** 30-day usage trend, engagement score, support burden ratio

Data quality note: 12 accounts are missing usage data (recent free trial conversions) -- flagged for manual review rather than excluded, since missing data itself can be a churn signal.

### Step 2: Analyze Historical Churn Patterns

The next question is the important one: what did churned customers look like before they cancelled? If the patterns are strong enough, the same signals can be spotted in current customers before it is too late.

```text
Look at the 47 customers who churned in the last 6 months. What patterns predicted their churn? Compare against retained customers.
```

The comparison between 47 churned and 293 retained customers reveals four strong predictors:

| Signal | Churned Customers | Retained Customers |
|--------|------------------|--------------------|
| Login frequency dropped >50% in 30 days | 78% | 8% |
| Zero feature adoption beyond core | 71% | 23% |
| Unresolved support tickets older than 7 days | 62% | 11% |
| Payment failure in last 90 days | 43% | 5% |

Warning signs appear **45-60 days before cancellation** on average -- plenty of time to intervene if you are watching.

Churned customers cluster into three distinct segments, each requiring a different response:

- **Ghost accounts (34%)** -- quietly stop logging in. Never complain, never file a ticket, just fade away. These are the hardest to catch without a scoring system because they generate zero noise.
- **Frustrated users (40%)** -- escalating support tickets, declining sentiment, often stuck on a specific feature gap. These can sometimes be saved with product changes or workarounds.
- **Budget cuts (26%)** -- signaled by downgrades, payment failures, and reduced seat counts. Harder to save, but early outreach can sometimes negotiate a smaller plan instead of full churn.

### Step 3: Build the Health Scoring Model

```text
Create a weighted health score (0-100) for each customer based on the churn predictors. Categorize as Healthy, At Risk, or Critical.
```

The scoring model weights each signal based on its predictive strength from the historical analysis:

| Signal | Weight |
|--------|--------|
| Login frequency trend (30 days) | 25% |
| Feature breadth (% of available features used) | 20% |
| Support health (resolution time, open tickets, sentiment) | 20% |
| Engagement depth (time in app, actions per session) | 15% |
| Billing stability (payment success, plan trajectory) | 10% |
| Relationship signals (last contact, NPS response) | 10% |

**Current distribution across 340 accounts:**

| Health Band | Accounts | ARR | What it means |
|-------------|----------|-----|---------------|
| Healthy (70-100) | 218 (64%) | $892K | Engaged, expanding, low risk |
| At Risk (40-69) | 87 (26%) | $312K | Declining engagement, needs attention |
| Critical (0-39) | 35 (10%) | $118K | High churn probability within 60 days |

The critical list is immediately actionable. Account #2847 scores 12 -- $2,400/month, no login in 23 days, 3 open tickets sitting unanswered. Account #1923 scores 18 -- $1,800/month, usage down 67%, payment failed twice. Account #3201 scores 22 -- $3,200/month, using only 1 of 8 available features, which means they are paying for a product they barely use.

### Step 4: Create the CS Team Dashboard

```text
Build a dashboard showing customer health distribution, trending accounts, and daily priority list for the CS team.
```

The dashboard (`customer-health-dashboard.html`) has five panels designed for daily use:

- **Health distribution** -- pie chart with drill-down by segment and plan tier, showing where ARR is concentrated
- **Trending down** -- accounts whose score dropped more than 15 points in 14 days (currently 14 accounts). These are the early warnings -- still healthy enough to save, but heading the wrong direction.
- **Daily priority list** -- top 10 accounts needing outreach, sorted by ARR multiplied by risk level. A $3,200/month critical account ranks higher than a $400/month critical account.
- **Recovery tracking** -- accounts that moved from Critical back to Healthy after intervention (current win rate: 34%). This number matters because it proves the outreach is working.
- **Churn forecast** -- predicted churn for the next 30, 60, and 90 days based on current scores and historical conversion rates from each health band.

The dashboard auto-refreshes weekly from the latest data exports and can export the priority list as CSV for CRM import.

### Step 5: Set Up Automated Alerts and Playbooks

```text
Create alert rules: notify CS when a customer's score drops below 40 or drops more than 20 points in a week. Include suggested actions.
```

Three alert types, each with a recommended playbook:

**Critical Alert** (score below 40):
> "Account [name] is critical (score: [X]). Top risk factors: [list]."
> Playbook: Schedule executive check-in within 48 hours. Come prepared with specific product improvements or account adjustments.

**Rapid Decline** (drop of 20+ points in 7 days):
> "Account [name] dropped from [X] to [Y]. Key change: [factor]."
> Playbook: Immediate outreach -- something changed this week. Ask about their recent experience before they start evaluating alternatives.

**Payment Risk** (payment failure combined with score below 60):
> "Account [name] had a payment failure and is at-risk."
> Playbook: Reach out about billing issues proactively. Involuntary churn from failed payments is the easiest type to prevent -- but only if you catch it before the grace period expires.

Alerts deliver to the Slack `#cs-alerts` channel in real time, with a weekly email digest summarizing all score movements across the entire customer base.

## Real-World Example

Lena ran customer success at a 25-person B2B SaaS with 340 accounts and a painful 6% monthly churn rate. Her team of 2 could not monitor every account, so they focused on whoever was loudest -- which meant the quiet churners disappeared without warning.

She exported data from all three systems on a Monday and ran the analysis. The churn pattern analysis revealed something the team had missed entirely: 34% of churners were "ghost accounts" who never complained, never filed a ticket, and just slowly stopped logging in. These accounts had been completely invisible to the CS team because they generated zero inbound signals.

The scoring model immediately flagged 35 critical accounts representing $118K in ARR. Lena's team reached out to the top 10 that week. Three had specific product issues that were fixable in days. Two needed training on features they did not know existed. One was about to churn over a billing dispute that nobody on the team knew about. Over 3 months, the churn rate dropped from 6% to 3.8% -- saving roughly $47K in monthly recurring revenue. The dashboard became the CS team's daily starting point, replacing gut instinct with a prioritized list that told them exactly where to spend their limited time.
