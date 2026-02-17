---
title: "Set Up Error Budgets and SLO Monitoring for Your Services"
slug: set-up-error-budgets-and-slo-monitoring
description: "Define SLIs, set SLO targets, calculate error budgets, and build dashboards that tell your team when to ship features vs. fix reliability."
skills: [data-analysis, report-generator, cicd-pipeline]
category: devops
tags: [sre, slo, error-budget, reliability, monitoring, observability]
---

# Set Up Error Budgets and SLO Monitoring for Your Services

## The Problem

The engineering team ships features every sprint, but nobody knows if the platform is "reliable enough." When incidents happen, there is a heated debate: "Should we freeze releases?" vs "We need to ship this feature." The SRE team says uptime is 99.9%, product says customers are complaining, and neither side has data to resolve the argument. There are no formal SLOs, no error budgets, and reliability decisions are made by gut feeling.

## The Solution

Use `data-analysis` to define SLIs from existing metrics and calculate baseline reliability, `report-generator` to build SLO dashboards and error budget burn-down reports, and `cicd-pipeline` to gate deployments when error budgets are exhausted.

```bash
npx terminal-skills install data-analysis report-generator cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Define SLIs from existing metrics

```
We run 6 production services behind an API gateway. We have Prometheus metrics
for request latency (histogram), HTTP status codes (counter), and uptime
(gauge). We also have business metrics in Datadog: checkout completion rate,
search result relevance score, and notification delivery time.

For each service, recommend the right SLIs. Map each SLI to the specific
Prometheus or Datadog metric, and write the PromQL/Datadog query to calculate
it. Focus on what customers actually experience, not internal metrics.
```

The agent defines 14 SLIs across 6 services. For the API gateway: availability (successful requests / total requests, PromQL: `sum(rate(http_requests_total{status!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`), and latency (p99 under 500ms). For checkout: success rate from Datadog business metrics. Each SLI has a precise query and a justification for why it matters to users.

### 2. Set SLO targets based on historical data

```
Pull the last 90 days of data for each SLI and calculate the baseline
reliability. For each one, recommend an SLO target that's achievable but
meaningful. Show me: current performance (p50, p95, p99 over 90 days),
recommended SLO, the implied error budget in minutes per month, and what
would have triggered an error budget alert in the last 90 days.
```

The agent analyzes historical data and recommends SLOs: API availability at 99.95% (allowing 21.6 minutes downtime/month), checkout success at 99.5% (allowing ~50 failed checkouts/month on current volume), search latency p99 under 800ms. It shows that the current API availability is 99.97% — tight but achievable. Two incidents last quarter would have burned 73% of the monthly budget.

### 3. Build error budget dashboards

```
Create Grafana dashboard JSON for each service showing:
- Current SLO compliance (rolling 30-day window)
- Error budget remaining (percentage and absolute)
- Error budget burn rate (are we burning faster than expected?)
- Time until budget exhaustion at current burn rate
- Incident markers overlaid on the budget burn-down chart

Use traffic-light colors: green (>50% budget), yellow (20-50%), red (<20%).
```

The agent generates complete Grafana dashboard JSON with 6 panels per service. The burn rate panel uses a multi-window approach (1h and 6h) to detect both fast and slow budget burns. Alert rules fire when the 1-hour burn rate exceeds 14.4x (budget would exhaust in 5 hours) or 6-hour burn rate exceeds 6x (budget would exhaust in 2 days).

### 4. Gate deployments on error budget

```
Add a deployment gate to our GitHub Actions pipeline. Before deploying to
production, check the current error budget status via Prometheus API.
If error budget is below 20%, block the deployment and post a Slack message
explaining why. Allow override with a "deploy-override" label on the PR,
but log every override. If budget is between 20-50%, add a warning comment
to the PR but allow deployment.
```

The agent generates a GitHub Actions job that queries Prometheus for the current error budget, blocks deploys when budget is under 20%, warns between 20-50%, and logs all override decisions to a Slack channel. The override requires approval from someone with the SRE role.

### 5. Create the weekly reliability report

```
Generate a weekly report template that automatically pulls data and shows:
- SLO compliance across all services
- Error budget consumed this week vs. previous weeks (trend)
- Top 3 error budget consumers (specific endpoints or error types)
- Recommendation: "ship features" or "focus on reliability" based on budget
- Action items from any SLO breaches

Format as markdown suitable for posting in Slack.
```

The agent creates a report generator script that queries Prometheus and Datadog, produces a markdown report with sparkline-style trend indicators, and posts to Slack every Monday at 9am. The recommendation engine uses simple logic: budget > 50% = "ship features," 20-50% = "balance both," < 20% = "reliability sprint."

## Real-World Example

An SRE lead at a 50-person B2B SaaS company is tired of the "ship vs. fix" debate happening every sprint planning. Engineering wants to ship features, customers report intermittent errors, and there is no data to settle the argument.

1. She defines 14 SLIs across 6 services using existing Prometheus and Datadog metrics
2. Historical analysis shows API availability at 99.97% — room for a 99.95% SLO with a meaningful error budget
3. Grafana dashboards give every team real-time visibility into their error budget
4. In the first month, 2 deployments are automatically blocked when budget drops below 20% — both times the team finds and fixes a regression before it reaches more customers
5. The weekly reliability report becomes a standard part of sprint planning — feature vs. reliability decisions are now data-driven, and the "should we freeze releases" debate disappears

## Related Skills

- [data-analysis](../skills/data-analysis/) — Analyzes historical metrics to establish SLI baselines
- [report-generator](../skills/report-generator/) — Builds dashboards and automated weekly reports
- [cicd-pipeline](../skills/cicd-pipeline/) — Gates deployments based on error budget status
