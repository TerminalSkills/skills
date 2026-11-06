---
title: "Set Up DNS Monitoring and Infrastructure Capacity Forecasting"
slug: set-up-dns-monitoring-and-capacity-forecasting
description: "Monitor DNS health and propagation across providers, then use traffic data to forecast infrastructure capacity needs and plan scaling events ahead of demand."
skills:
  - dns-record-analyzer
  - capacity-planner
category: devops
tags:
  - dns
  - capacity-planning
  - monitoring
  - scaling
  - forecasting
---

# Set Up DNS Monitoring and Infrastructure Capacity Forecasting

## The Problem

A multi-tenant B2B platform serves 200 customers across custom domains. DNS misconfigurations are a silent killer -- a customer changes their nameservers and breaks their CNAME, or a registrar auto-renewal fails, and the platform only finds out when the customer calls support. On the capacity side, the infrastructure team gets surprised every quarter by traffic spikes they could have predicted from historical patterns. Last January, a 40% traffic increase on the first business day after the holidays overwhelmed the database, and the team spent the day firefighting instead of executing the roadmap. The same January spike had happened the previous year, but nobody had looked at the historical data to predict it.

## The Solution

Use the **dns-record-analyzer** skill to validate DNS configuration across all customer domains with `dig`, catching misconfigurations before they cause outages. Then use the **capacity-planner** skill, which turns load-test results into scaling recommendations, to combine historical traffic with a measured breaking point and produce a quarterly infrastructure scaling plan. Both address the same problem: being proactive instead of reactive about infrastructure issues.

## Step-by-Step Walkthrough

### 1. Audit DNS records across all customer domains

Scan every custom domain to verify CNAME records and resolver consistency, and check each certificate's expiry.

> Audit DNS records for all 200 customer custom domains listed in domains.txt. For each domain, run `dig +short CNAME` and confirm it points to our load balancer at lb.platform.com. Query the same name against several public resolvers (`@8.8.8.8`, `@1.1.1.1`, `@9.9.9.9`) and against the domain's own authoritative servers (`dig +short NS`, then `dig +short CNAME @<ns>`), and flag any answers that differ. Use `openssl` to check that each certificate is not expiring within 30 days. Output a report sorted by severity.

The agent runs commands like these per domain (`dig` only sees DNS, so certificate expiry comes from a TLS handshake):

```bash
dig +short CNAME app.customer-one.example @8.8.8.8
dig +short NS customer-one.example
echo | openssl s_client -connect app.customer-one.example:443 -servername app.customer-one.example 2>/dev/null \
  | openssl x509 -noout -enddate -checkend 2592000   # exits 1 if it expires within 30 days
```

Public resolvers are all anycast networks, so they cannot tell you how a resolver in a particular country answers. A difference between resolvers or between a resolver and the authoritative server usually means a TTL has not yet expired or a record was changed recently.

### 2. Set up automated DNS health checks

Create a recurring check that catches DNS drift before it affects customers. Customers rarely tell you when they change their DNS -- they change their nameservers, break the CNAME, and call support three days later wondering why their app stopped working.

> Create a daily DNS health check script (run from cron or a CI schedule) that verifies all customer domains resolve correctly. Compare current DNS records against our expected configuration stored in the database. Post to a Slack incoming webhook (URL from the `SLACK_WEBHOOK_URL` environment variable) when a domain's CNAME changes or disappears, when a certificate will expire within 14 days, or when resolvers disagree. Include the customer name and account manager in each alert. Limit concurrency so 200 domains do not hit one resolver at once.

The proactive alert allows the customer success team to reach out before the customer even notices the issue, turning a potential churn event into a positive support interaction.

### 3. Analyze historical traffic patterns for capacity forecasting

Pull 12 months of traffic data and identify recurring patterns, seasonal peaks, and growth trends. Historical patterns are a good predictor of future capacity needs because B2B SaaS traffic follows business cycles.

> Export the last 12 months of request counts for our Application Load Balancer from CloudWatch (namespace `AWS/ApplicationELB`, metric `RequestCount`, Sum, one-day period) into a CSV, and the same for the last 30 days with a one-hour period. Identify weekly patterns, monthly seasonality, and quarter-over-quarter growth rate. Map spikes to known events such as product launches and the January return-to-work week. Report peak versus off-peak CPU for the API servers, database and Redis cache.

```bash
aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name RequestCount \
  --dimensions Name=LoadBalancer,Value=app/prod-alb/50dc6c495c0c9188 \
  --start-time 2025-11-07T00:00:00Z --end-time 2026-11-07T00:00:00Z \
  --period 86400 --statistics Sum --output json
```

One call returns at most 1,440 data points, so use a daily period for a year and request hourly data in 30-day pieces.

The gap between peak load and the capacity you can sustain is the headroom buffer. If peak utilization is at 75% of capacity, one bad day can push the system into degradation. If it is at 40%, there is room for unexpected spikes.

### 4. Build a capacity forecast for next quarter

The capacity-planner skill works from load-test results, so run a load test against staging first to find the breaking point (requests per second where latency or errors break your SLOs). Then give the agent that number with the traffic analysis.

> Our staging environment (3 API pods, db.r6g.xlarge) breaks at 400 requests per second. Peak production traffic today is 220 requests per second, growing 8% month-over-month in API requests and 12% in database storage. We onboard 15 new enterprise customers in Q2 that add an estimated 30% more database queries. Model three scenarios: baseline growth, baseline plus the new customers, and a worst-case 50% spike. For each, state the pod count, replica count and database class needed, check total database connections against `max_connections`, and give monthly cost estimates priced with the AWS Pricing Calculator for our region.

Treat cost figures as estimates until you have checked them against the Pricing Calculator; the skill deliberately does not rely on remembered prices.

### 5. Create a scaling calendar with pre-provisioning triggers

Translate the capacity forecast into a concrete schedule of infrastructure changes, timed ahead of predicted demand. The calendar should include both proactive upgrades (scheduled before forecasted load) and reactive auto-scaling (for unexpected spikes).

> Create a Q2 scaling calendar from our capacity forecast. Week 1 of April: add one API server replica ahead of the enterprise onboarding wave. April 5: upgrade the database from db.r6g.xlarge to db.r6g.2xlarge before peak CPU reaches 80%. Set up auto-scaling policies that add API replicas when CPU exceeds 65% for 5 minutes. Include rollback procedures for each scaling event and budget approval thresholds.

Each scaling event includes a cost estimate and a rollback plan. The budget approval threshold ensures the team can act on operational needs without waiting for executive sign-off on every infrastructure change.

## Real-World Example

In this example, the platform team ran the DNS audit on a Tuesday and found 11 customer domains with issues: three had CNAME records that vanished in a registrar migration, two had SSL certificates expiring within a week, and six returned different answers from different resolvers because of stale cached records. The customer success team reached out proactively, fixing all 11 before any of them filed a ticket. One customer's domain had stopped resolving because their registrar had silently failed to auto-renew it, and the audit flagged it before the customer called.

The capacity forecast revealed that at current growth rates, the database would hit 80% CPU during peak hours by mid-April. Instead of reacting to a Monday morning slowdown, the team pre-approved the database upgrade, executed it during a maintenance window in early April, and handled the enterprise onboarding wave without degradation. The new customers added roughly the query volume the model predicted.

The quarterly infrastructure review, which previously consumed a full day of guesswork, now takes two hours with the forecast model generating concrete numbers. The daily DNS health check has since caught 8 more domain issues over three months, each resolved before the customer experienced any downtime.

## Related Skills

- **dns-record-analyzer** -- queries CNAME, NS and other records with `dig` and compares resolvers and authoritative servers.
- **capacity-planner** -- turns the load-test breaking point and traffic growth into scaling steps, connection-budget checks and cost estimates.
