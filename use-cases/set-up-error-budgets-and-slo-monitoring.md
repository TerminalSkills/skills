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

The engineering team ships features every sprint, but nobody knows if the platform is "reliable enough." When incidents happen, the same argument erupts: "Should we freeze releases?" versus "We need to ship this feature by Thursday." The SRE team says uptime is 99.9%. Product says customers are complaining about intermittent errors. Neither side has data to settle it.

There are no formal SLOs. No error budgets. Reliability decisions are made by gut feeling and whoever argues loudest in the sprint planning meeting. The team needs a system that answers one question with data: should we ship features this week, or fix reliability?

## The Solution

Using the **data-analysis**, **report-generator**, and **cicd-pipeline** skills, this walkthrough defines SLIs from existing Prometheus and Datadog metrics, calculates SLO targets based on 90 days of historical data, builds Grafana dashboards with error budget burn-down charts, and gates deployments in a GitLab CI pipeline when budgets run low. (The **cicd-pipeline** skill covers GitLab CI and CircleCI; the gate script is plain shell, so it also runs as a step in GitHub Actions.)

## Step-by-Step Walkthrough

### Step 1: Define SLIs That Reflect User Experience

Most teams monitor server metrics -- CPU, memory, disk. But customers do not care about CPU usage. They care about whether the page loads, whether checkout works, and whether search results appear quickly. SLIs need to measure what users experience:

```text
We run 6 production services behind an API gateway. We have Prometheus metrics
for request latency (histogram), HTTP status codes (counter), and uptime
(gauge). We also have business metrics in Datadog: checkout completion rate,
search result relevance score, and notification delivery time.

For each service, recommend the right SLIs. Map each SLI to the specific
Prometheus or Datadog metric, and write the PromQL/Datadog query to calculate
it. Focus on what customers actually experience, not internal metrics.
```

Fourteen SLIs come out across 6 services. The most important ones:

**API Gateway availability** -- the percentage of requests that do not return a 5xx error:

```promql
sum(rate(http_requests_total{status!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

This is what users feel directly. Every 5xx is a user seeing an error page.

**API Gateway latency** -- the share of requests answered in under 500ms, computed from histogram buckets (the histogram needs a `le="0.5"` bucket). Users do not notice 200ms versus 300ms, but they absolutely notice when a page takes 2 seconds:

```promql
sum(rate(http_request_duration_seconds_bucket{le="0.5"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
```

**Checkout success rate** -- from Datadog business metrics, the percentage of checkout attempts that complete successfully. This ties directly to revenue.

Each SLI has a precise query and a justification for why it matters to users, not just to the operations team.

### Step 2: Set SLO Targets from Historical Data

SLO targets pulled from thin air are either too aggressive (constant alerts, team ignores them) or too lenient (meaningless). Historical data sets the right level:

```text
Pull the last 90 days of data for each SLI and calculate the baseline
reliability. For each one, recommend an SLO target that's achievable but
meaningful. Show me: current performance over 90 days,
recommended SLO, the implied error budget in minutes per month, and what
would have triggered an error budget alert in the last 90 days.
```

The analysis produces concrete targets:

| SLI | Current (90-day) | Recommended SLO | Error Budget |
|-----|-------------------|----------------|--------------|
| API availability | 99.97% | 99.95% | 21.6 minutes downtime/month |
| API latency (requests under 500ms) | 99.4% | 99% | 1% of requests may be slow |
| Checkout success | 99.72% | 99.5% | ~50 failed checkouts/month at current volume |

The API availability target of 99.95% gives the team 21.6 minutes of full downtime per 30 days as their error budget (0.05% of 43,200 minutes). In practice the budget is counted in failed requests, not minutes. The current 99.97% performance means there is headroom -- but not much. Two incidents last quarter would have burned 73% of the monthly budget. A third would have exhausted it.

This is exactly the kind of data that settles the "ship vs. fix" debate. If the budget is 80% full, the answer is obvious: fix reliability this sprint.

### Step 3: Build Error Budget Dashboards

The SLO targets need to be visible to every team, not buried in a spreadsheet:

```text
Create Grafana dashboard JSON for each service showing:
- Current SLO compliance (rolling 30-day window)
- Error budget remaining (percentage and absolute)
- Error budget burn rate (are we burning faster than expected?)
- Time until budget exhaustion at current burn rate
- Incident markers overlaid on the budget burn-down chart

Use traffic-light colors: green (>50% budget), yellow (20-50%), red (<20%).
```

The Grafana dashboards use 6 panels per service. They read from Prometheus recording rules, so the dashboard and the alerts use the same numbers; a 30-day window is too heavy to compute on every refresh. Save the rules as `slo-rules.yml`, check them with `promtool check rules slo-rules.yml`, and load them through `rule_files`:

```yaml
groups:
  - name: slo-api-availability
    rules:
      - record: slo:api_error_ratio:rate5m
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
      - record: slo:api_error_ratio:rate30m
        expr: sum(rate(http_requests_total{status=~"5.."}[30m])) / sum(rate(http_requests_total[30m]))
      - record: slo:api_error_ratio:rate1h
        expr: sum(rate(http_requests_total{status=~"5.."}[1h])) / sum(rate(http_requests_total[1h]))
      - record: slo:api_error_ratio:rate6h
        expr: sum(rate(http_requests_total{status=~"5.."}[6h])) / sum(rate(http_requests_total[6h]))
      - record: slo:api_error_ratio:rate30d
        expr: sum(rate(http_requests_total{status=~"5.."}[30d])) / sum(rate(http_requests_total[30d]))
      # share of the 30-day budget left for a 99.95% SLO (allowed error rate: 0.0005)
      - record: slo:api_error_budget_remaining:ratio
        expr: 1 - slo:api_error_ratio:rate30d / 0.0005
  - name: slo-api-availability-alerts
    rules:
      - alert: ApiErrorBudgetFastBurn
        expr: slo:api_error_ratio:rate1h > (14.4 * 0.0005) and slo:api_error_ratio:rate5m > (14.4 * 0.0005)
        labels: { severity: page }
      - alert: ApiErrorBudgetSlowBurn
        expr: slo:api_error_ratio:rate6h > (6 * 0.0005) and slo:api_error_ratio:rate30m > (6 * 0.0005)
        labels: { severity: page }
```

This is the multi-window, multi-burn-rate pattern from the [Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/):

- **1-hour burn rate above 14.4x:** 2% of the 30-day budget is gone in one hour, and at that rate the whole budget lasts about 2 days. This pages immediately.
- **6-hour burn rate above 6x:** 5% of the budget is gone in six hours, and the whole budget lasts 5 days. This also pages (the Workbook opens a ticket for a 1x burn over 3 days).
- The shorter window in each rule (5 minutes, 30 minutes) stops the alert from firing long after the problem is fixed.

The pair catches both fast incidents (service goes down hard) and slow burns (elevated error rate from a bad deploy that is not quite bad enough to trigger traditional alerting).

Traffic-light colors make the dashboard readable at a glance: green means more than 50% of budget remains, yellow means 20-50%, and red means less than 20% -- time to stop shipping features and fix reliability.

### Step 4: Gate Deployments on Error Budget

The dashboard tells humans what to do. The deployment gate enforces it automatically:

```text
Add a deployment gate to our GitLab CI pipeline. Before deploying to
production, query the error budget from the Prometheus HTTP API.
If the budget is below 20%, fail the job and say why. Allow an override by
running the pipeline with DEPLOY_OVERRIDE=true, and log who did it.
If the budget is between 20% and 50%, print a warning but allow the deploy.
```

The job runs a small script, `ci/slo-gate.sh`, that reads the recording rule through the Prometheus query API (`PROM_URL` is a masked CI/CD variable pointing at a Prometheus the runner can reach):

```bash
#!/usr/bin/env bash
set -euo pipefail
resp=$(curl -fsS --max-time 20 -G "$PROM_URL/api/v1/query" \
  --data-urlencode 'query=slo:api_error_budget_remaining:ratio')
remaining=$(printf '%s' "$resp" | jq -er '.data.result[0].value[1]')
pct=$(awk -v r="$remaining" 'BEGIN { printf "%d", r * 100 }')
echo "API availability error budget remaining: ${pct}%"
if [ "$pct" -lt 20 ]; then
  if [ "${DEPLOY_OVERRIDE:-false}" = "true" ]; then
    echo "OVERRIDE: deploying with ${pct}% budget left (run by ${GITLAB_USER_LOGIN:-unknown})"
    exit 0
  fi
  echo "Production deploy blocked: budget at ${pct}%. Fix reliability first." >&2
  exit 1
elif [ "$pct" -lt 50 ]; then
  echo "WARNING: budget at ${pct}%. Deploy with caution."
fi
```

```yaml
stages: [test, gate, deploy]

slo-gate:
  stage: gate
  image: alpine:3.22
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - apk add --no-cache bash curl jq
    - bash ci/slo-gate.sh

deploy-production:
  stage: deploy
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - ./deploy.sh production
```

Against a stub Prometheus answering 0.12, 0.35 and 0.80, the script exits 1 (blocked), prints the warning and exits 0, and exits 0 silently. With `DEPLOY_OVERRIDE=true` the 12% case passes and the log line names the person who started the pipeline.

- **Budget above 50%:** the deploy proceeds normally.
- **Budget 20-50%:** the job log carries a warning, and the deploy proceeds.
- **Budget below 20%:** `slo-gate` fails, so `deploy-production` never starts, and GitLab's pipeline-failure notifications tell the team. A new pipeline started with `DEPLOY_OVERRIDE=true` bypasses the gate, so restrict who may run pipelines on the default branch to the people allowed to override.

### Step 5: Automate the Weekly Reliability Report

The final piece turns all this data into a sprint planning input:

```text
Generate a weekly report template that automatically pulls data and shows:
- SLO compliance across all services
- Error budget consumed this week vs. previous weeks (trend)
- Top 3 error budget consumers (specific endpoints or error types)
- Recommendation: "ship features" or "focus on reliability" based on budget
- Action items from any SLO breaches

Format as Markdown that renders in Slack.
```

A GitLab pipeline schedule (cron `0 9 * * 1`) runs a Python script every Monday at 9 AM. The script queries the Prometheus API and Datadog, renders the Markdown, and posts it to a Slack incoming webhook kept in a masked CI/CD variable. The recommendation engine is simple: budget above 50% means "ship features," 20-50% means "balance both," and below 20% means "reliability sprint." The report includes sparkline-style trend indicators so the team can see whether reliability is improving or degrading week over week.

## Real-World Example

In the first month, the deployment gate blocks 2 production deploys when the error budget drops below 20%. Both times, the team investigates and finds a regression from a recent release that had been slowly burning the budget -- not enough to trigger traditional alerting, but enough to exhaust the monthly budget in a week. The regressions get fixed before they reach more customers.

The weekly reliability report becomes a fixture in sprint planning. Instead of the "ship vs. fix" argument, the team looks at the error budget number and makes a data-driven decision. When the budget is healthy, product gets their features. When it is low, engineering focuses on reliability. The heated debate disappears because both sides are looking at the same data.

Three months in, the SRE lead looks at the team's own numbers: fewer customer-facing incidents per month, and the "should we freeze releases" meetings have stopped because the budget number answers the question. Results depend on how honest the SLOs are, so review the targets every quarter.
