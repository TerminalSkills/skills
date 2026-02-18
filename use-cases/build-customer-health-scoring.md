---
title: "Build a Customer Health Scoring System"
slug: build-customer-health-scoring
description: "Combine product usage, support tickets, and billing data to score customer health and predict churn before it happens."
skills: [data-analysis, excel-processor, data-analysis]
category: data-ai
tags: [customer-success, churn-prediction, analytics, scoring, retention]
---

# Build a Customer Health Scoring System

## The Problem

Your B2B SaaS has 340 paying customers and a 6% monthly churn rate. Every churned customer is a surprise — the cancellation email arrives, and the customer success team scrambles to find out what went wrong. By then, it's too late. Post-mortems reveal the warning signs were there months ago: declining logins, unanswered support tickets, missed renewal discussions.

You have the data to predict churn: product analytics show who's logging in, Intercom has support ticket history, and Stripe has billing patterns. But this data lives in 3 different systems. Nobody has time to manually cross-reference 340 accounts weekly. The customer success team of 2 manages accounts by gut feel and squeaky-wheel prioritization.

## The Solution

Use **data-analysis** to build the scoring model from historical patterns, **excel-processor** to merge data from multiple exports, and **data-analysis** to create dashboards the CS team can act on daily.

```bash
npx terminal-skills install data-analysis excel-processor data-analysis
```

## Step-by-Step Walkthrough

### 1. Merge and clean multi-source data

```text
Here are three exports: product-usage.csv (daily logins, feature usage per account), support-tickets.csv (ticket history with resolution times), and billing.csv (MRR, plan changes, payment failures). Merge them into a single customer dataset.
```

```text
MERGED DATASET: 340 accounts, 24 features per account

Product: login_frequency, dau_ratio, features_used, time_in_app, last_active_days
Support: open_tickets, avg_resolution_hours, escalations_90d, sentiment_score
Billing: mrr, plan_tier, months_active, payment_failures_90d, downgrade_history
Derived: usage_trend_30d, engagement_score, support_burden

DATA QUALITY: 12 accounts missing usage data (free trial) — flagged
```

### 2. Analyze historical churn patterns

```text
Look at the 47 customers who churned in the last 6 months. What patterns predicted their churn? Compare against retained customers.
```

```text
CHURN PATTERN ANALYSIS — 47 churned vs 293 retained

STRONGEST PREDICTORS:
  1. Login frequency drop >50% in 30d — 78% of churned vs 8% retained
  2. Zero feature adoption beyond core — 71% vs 23%
  3. Unresolved support tickets >7 days — 62% vs 11%
  4. Payment failure in 90 days — 43% vs 5%

Warning signs appear 45-60 days before cancellation on average.

SEGMENTS: Ghost accounts (34%), Frustrated users (40%), Budget cuts (26%)
```

### 3. Build the health scoring model

```text
Create a weighted health score (0-100) for each customer based on the churn predictors. Categorize as Healthy, At Risk, or Critical.
```

```text
HEALTH SCORE MODEL:

Weights:
  Login frequency trend (30d): 25%
  Feature breadth (% of available features used): 20%
  Support health (resolution time, open tickets, sentiment): 20%
  Engagement depth (time in app, actions per session): 15%
  Billing stability (payment success, plan trajectory): 10%
  Relationship signals (last contact, NPS response): 10%

CURRENT DISTRIBUTION (340 accounts):
  Healthy (70-100):  218 accounts (64%) — $892K ARR
  At Risk (40-69):    87 accounts (26%) — $312K ARR
  Critical (0-39):    35 accounts (10%) — $118K ARR

TOP 10 CRITICAL ACCOUNTS:
  Account #2847 — Score: 12 — $2,400/mo — No login 23 days, 3 open tickets
  Account #1923 — Score: 18 — $1,800/mo — Usage down 67%, payment failed twice
  Account #3201 — Score: 22 — $3,200/mo — Only 1 of 8 features used
  ...
```

### 4. Create the CS team dashboard

```text
Build a dashboard showing customer health distribution, trending accounts, and daily priority list for the CS team.
```

```text
Generated: customer-health-dashboard.html (interactive)

Panels:
  Health distribution — pie chart with drill-down by segment/plan
  Trending down — accounts with score drop >15 points in 14 days (currently: 14)
  Daily priority list — top 10 accounts needing outreach, sorted by ARR × risk
  Recovery tracking — accounts that moved from Critical → Healthy (win rate: 34%)
  Churn forecast — predicted churn for next 30/60/90 days based on current scores

Auto-refresh: pulls latest data exports weekly
Export: CSV of priority list for CRM import
```

### 5. Set up automated alerts and playbooks

```text
Create alert rules: notify CS when a customer's score drops below 40 or drops more than 20 points in a week. Include suggested actions.
```

```text
Alert rules configured:

  CRITICAL ALERT (score < 40):
    "Account [name] is critical (score: [X]). Top risk factors: [list]."
    Playbook: Schedule executive check-in within 48 hours

  RAPID DECLINE (drop > 20 in 7 days):
    "Account [name] dropped from [X] to [Y]. Key change: [factor]."
    Playbook: Immediate outreach — ask about recent experience

  PAYMENT RISK (failure + score < 60):
    "Account [name] had a payment failure and is at-risk."
    Playbook: Reach out about billing issues before involuntary churn

Delivered via: Slack #cs-alerts channel + weekly email digest
```

## Real-World Example

Lena ran customer success at a 25-person B2B SaaS with 340 accounts and a painful 6% monthly churn rate. Her team of 2 couldn't monitor every account, so they focused on the loudest customers — which meant the quiet churners slipped away unnoticed.

She exported data from three systems and ran the analysis workflow on a Monday. The churn pattern analysis revealed that 34% of churners were "ghost accounts" — they never complained, just slowly stopped logging in. These accounts had been invisible to the CS team.

The health scoring model immediately flagged 35 critical accounts representing $118K in ARR. Lena's team reached out to the top 10 that week. Three had specific product issues that were fixable. Two needed training on features they didn't know existed. Over 3 months, the churn rate dropped from 6% to 3.8% — saving roughly $47K in monthly recurring revenue. The dashboard became the CS team's daily starting point.
