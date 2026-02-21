---
title: "Diagnose Network and Uptime Issues with Monitoring and Xray"
slug: diagnose-network-and-uptime-issues
description: "Combine Uptime Kuma monitoring with Xray network diagnostics to detect outages, trace packet paths, and pinpoint whether failures are DNS, routing, or application-level."
skills:
  - uptime-kuma
  - xray
category: devops
tags:
  - monitoring
  - network-diagnostics
  - uptime
  - troubleshooting
---

# Diagnose Network and Uptime Issues with Monitoring and Xray

## The Problem

A distributed team runs services across three cloud providers and two on-premise data centers. Users in Southeast Asia report intermittent 10-second delays reaching the API, while European users see no issues. The monitoring dashboard shows 99.9% uptime because the checks run from a single US-based server -- it cannot see the regional degradation at all. When an outage does occur, the team spends 30 minutes determining whether the problem is DNS resolution, a bad network route, a TLS handshake failure, or the application itself. By the time they identify the layer, the issue has often resolved itself, leaving no diagnostic data for root cause analysis. The post-mortem becomes "something was slow in Asia for a while, then it fixed itself." This cycle repeats monthly, eroding customer trust with each incident that the team cannot explain.

## The Solution

Deploy **Uptime Kuma** for multi-protocol monitoring with granular alerting, and use the **Xray** skill for deep network path analysis when issues arise. Uptime Kuma catches the problem; Xray pinpoints exactly where packets are being dropped, delayed, or rerouted. Together, they turn a vague "it is slow from Asia" complaint into a specific diagnosis with actionable next steps.

## Step-by-Step Walkthrough

### 1. Deploy Uptime Kuma with multi-region checks

Set up monitoring that tests endpoints from multiple vantage points to detect region-specific failures. A single monitoring location creates a blind spot -- the service could be down for half your users and your dashboard shows green.

> Deploy Uptime Kuma on our Frankfurt VPS. Add HTTP monitors for api.example.com, app.example.com, and cdn.example.com with 30-second intervals. Add TCP monitors for our PostgreSQL on port 5432 and Redis on port 6379. Configure a second Uptime Kuma instance on our Singapore VPS to monitor the same endpoints so we can compare latency between regions. Set up Slack notifications for any downtime event.

Running Uptime Kuma on two continents gives you immediate signal about whether an issue is global (both instances report degradation) or regional (only one instance sees the problem).

### 2. Configure response time thresholds and certificate monitoring

Detect degradation before it becomes a full outage by setting latency thresholds and tracking certificate expiry. A service can be technically "up" while being so slow that users abandon their requests -- latency thresholds catch this silent failure mode.

> For each HTTP monitor, set a maximum response time threshold of 2 seconds -- mark the service as degraded if response time exceeds this for 3 consecutive checks. Add TLS certificate monitors that alert 30 days before expiry for all our domains. Create a DNS monitor for api.example.com that verifies the A record resolves to our expected IP address 203.0.113.42.

The 3-consecutive-check requirement prevents alert noise from transient network blips. A single slow response is normal; three in a row indicates a real problem.

### 3. Run Xray network diagnostics on degraded paths

When monitoring detects elevated latency from a specific region, use Xray to trace the exact network path and identify the bottleneck. Standard traceroute is not enough -- it shows hops but not where time is being spent at each one.

> Our Singapore Uptime Kuma shows api.example.com response times jumped from 180ms to 4200ms. Run Xray diagnostics to trace the network path from our Singapore server to api.example.com. Identify which hop is introducing latency -- is it the transit provider, a peering point, or the destination data center? Check for packet loss at each hop and compare with a traceroute from our Frankfurt server to the same destination.

The comparison between regions is critical: if Frankfurt shows 120ms via a different route, the problem is path-specific, not server-side. This distinction determines whether you escalate to your cloud provider or investigate your own infrastructure.

### 4. Investigate DNS and TLS layer issues

When Uptime Kuma shows failures that do not appear in simple ping tests, dig into DNS resolution and TLS handshake timing.

> The Singapore monitor reports intermittent failures for app.example.com but ping works fine. Use Xray to analyze the full connection lifecycle: DNS resolution time, TCP handshake latency, TLS negotiation time, and time to first byte. Check if DNS is returning different IPs from Singapore versus Frankfurt. Test whether the issue is OCSP stapling timeout or a slow certificate chain validation.

### 5. Create a diagnostic runbook from findings

Document the diagnostic steps as a repeatable runbook so on-call engineers can triage network issues without guessing. The runbook should turn a 90-minute investigation into a 15-minute decision tree.

> Based on our investigation, create an incident response runbook for network latency issues. Include decision tree steps: first check Uptime Kuma dashboard for affected regions, then run Xray from the affected region to isolate the layer (DNS, routing, TLS, application), then check the specific provider status page. Include the exact Xray commands for each diagnostic step and the escalation path for ISP-level versus application-level issues. Add a section on how to collect evidence for provider tickets so the escalation includes actionable data.

## Real-World Example

A payments platform noticed their Singapore Uptime Kuma instance reporting 4-second response times for the checkout API while Frankfurt showed a steady 120ms. The on-call engineer ran Xray from the Singapore server and discovered 3,800ms of latency at a single hop -- a congested peering point between the regional ISP and the cloud provider's network. Packet loss at that hop was 12%. They confirmed the Frankfurt path used a completely different route with zero packet loss.

Armed with this data, they opened a ticket with the cloud provider, including the specific hop IP address, packet loss percentage, and comparison traceroute from Frankfurt. The cloud provider rerouted traffic through an alternative peering point within four hours. Response times from Singapore dropped back to 190ms.

They added the diagnostic steps to their runbook and set up a TLS certificate monitor that caught a certificate approaching expiry two weeks before it would have caused a hard outage. The next time latency spiked from a different region, the on-call engineer followed the runbook and diagnosed and escalated within 15 minutes instead of the previous 90-minute fumble. The Uptime Kuma status page also reduced customer support tickets during incidents by 60%, because customers could check the page themselves instead of emailing the support team.
