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

Use the **dns-record-analyzer** skill to continuously validate DNS configuration across all customer domains, catching misconfigurations before they cause outages. Then use the **capacity-planner** skill to analyze historical traffic patterns, model growth, and produce a quarterly infrastructure scaling plan that stays ahead of demand. Both skills address the same fundamental problem: being proactive instead of reactive about infrastructure issues.

## Step-by-Step Walkthrough

### 1. Audit DNS records across all customer domains

Scan every custom domain to verify CNAME records, SSL certificate status, and propagation consistency across global DNS resolvers.

> Audit DNS records for all 200 customer custom domains. For each domain, verify the CNAME points to our load balancer at lb.platform.com, check that the SSL certificate is valid and not expiring within 30 days, and test resolution from 8 global DNS resolvers (US East, US West, Europe, Asia). Flag any domains with propagation inconsistencies, missing records, or upcoming certificate expirations. Output a report sorted by severity.

### 2. Set up automated DNS health checks

Create a recurring check that catches DNS drift before it affects customers. Customers rarely tell you when they change their DNS -- they change their nameservers, break the CNAME, and call support three days later wondering why their app stopped working.

> Create a daily DNS health check script that verifies all customer domains resolve correctly. Compare current DNS records against our expected configuration stored in the database. Alert the customer success team via Slack when a domain's CNAME changes or disappears, when a certificate will expire within 14 days, or when DNS propagation is inconsistent across regions. Include the customer name and account manager in each alert.

The proactive alert allows the customer success team to reach out before the customer even notices the issue, turning a potential churn event into a positive support interaction.

### 3. Analyze historical traffic patterns for capacity forecasting

Pull 12 months of traffic data and identify recurring patterns, seasonal peaks, and growth trends. Historical patterns are the best predictor of future capacity needs because B2B SaaS traffic follows predictable business cycles.

> Analyze our last 12 months of traffic data from CloudWatch. Identify weekly patterns (peak days and hours), monthly seasonality, and quarter-over-quarter growth rate. Map traffic spikes to known events: product launches, customer onboarding waves, and seasonal peaks like January return-to-work and September back-to-business. Calculate the current utilization percentage of our API servers, database, and Redis cache at peak versus off-peak.

The gap between peak utilization and infrastructure capacity is the headroom buffer. If peak utilization is at 75% of capacity, one bad day can push the system into degradation. If it is at 40%, there is room for unexpected spikes.

### 4. Build a capacity forecast for next quarter

Use the traffic analysis to predict infrastructure needs and produce a specific scaling plan with cost estimates.

> Based on the traffic analysis, forecast our infrastructure needs for Q2. Our current growth rate is 8% month-over-month in API requests and 12% in database storage. We are onboarding 15 new enterprise customers in Q2 that will add an estimated 30% more database queries. Model three scenarios: baseline growth, baseline plus the new customers, and a worst-case 50% spike scenario. For each scenario, specify the exact instance types, replica counts, and database tier needed, with monthly cost estimates.

### 5. Create a scaling calendar with pre-provisioning triggers

Translate the capacity forecast into a concrete schedule of infrastructure changes, timed ahead of predicted demand. The calendar should include both proactive upgrades (scheduled before forecasted load) and reactive auto-scaling (for unexpected spikes).

> Create a Q2 scaling calendar from our capacity forecast. Week 1 of April: add one API server replica ahead of the enterprise onboarding wave. May 15: upgrade the database from db.r6g.xlarge to db.r6g.2xlarge before the storage threshold hits 75%. Set up auto-scaling policies that add API replicas when CPU exceeds 65% for 5 minutes. Include rollback procedures for each scaling event and budget approval thresholds.

Each scaling event includes a cost estimate and a rollback plan. The budget approval threshold ensures the team can act on operational needs without waiting for executive sign-off on every infrastructure change.

## Real-World Example

The platform team ran the DNS audit on a Tuesday and found 11 customer domains with issues: three had expired CNAME records from a registrar migration, two had SSL certificates expiring within a week, and six had inconsistent propagation where Asian resolvers returned stale records. The customer success team reached out proactively, fixing all 11 before a single customer noticed. One customer's registrar had silently failed to auto-renew, and the domain would have gone offline within 72 hours if the audit had not caught it.

The capacity forecast revealed that at current growth rates, the database would hit 80% CPU during peak hours by mid-April. Instead of reacting to a Monday morning slowdown, the team pre-approved the database upgrade, executed it during a maintenance window in early April, and sailed through the enterprise onboarding wave without a blip. The 15 new customers onboarded in Q2 added exactly the query volume the model predicted within a 10% margin.

The quarterly infrastructure review, which previously consumed a full day of guesswork, now takes two hours with the forecast model generating concrete numbers. The daily DNS health check has since caught 8 more domain issues over three months, each resolved before the customer experienced any downtime.
