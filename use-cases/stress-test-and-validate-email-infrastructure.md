---
title: "Stress Test APIs and Validate Email Infrastructure"
slug: stress-test-and-validate-email-infrastructure
description: "Load test API endpoints to find breaking points, then verify that transactional email delivery remains reliable under high traffic using deliverability diagnostics."
skills:
  - api-load-tester
  - email-deliverability-debugger
category: devops
tags:
  - load-testing
  - email-deliverability
  - performance
  - infrastructure-testing
---

# Stress Test APIs and Validate Email Infrastructure

## The Problem

An e-commerce platform sends password resets, order confirmations, and shipping notifications through its API. Under normal load, emails arrive within 30 seconds. During a flash sale last quarter, the API hit 5x normal traffic, response times tripled, and the email queue backed up by 45 minutes. Customers who placed orders never received confirmation emails, leading to duplicate purchases and a flood of support tickets. The team does not know at what traffic level the email pipeline starts degrading, whether the bottleneck is the API, the SMTP relay, or the email provider's rate limits. Every Black Friday and product launch is a gamble on whether the email infrastructure will keep up.

## The Solution

Use the **api-load-tester** skill to simulate realistic traffic patterns against the order and email-sending endpoints, then use the **email-deliverability-debugger** skill to verify that emails actually land in inboxes under load -- checking delivery time, bounce rates, and authentication pass rates at each traffic tier. The combination reveals bottlenecks that neither tool would catch alone.

## Step-by-Step Walkthrough

### 1. Design load test scenarios that trigger email sends

Create load test scripts that exercise the full order flow, including the transactional email that fires on each order. Most load tests stop at the API response, but the real user experience includes the email that arrives afterward.

> Design a load test for our order API at POST /api/orders that includes the downstream email send. Ramp from 10 to 500 concurrent users over 10 minutes, hold at 500 for 5 minutes, then spike to 1,000 for 2 minutes. Each virtual user creates a realistic order payload with random product IDs, quantities, and shipping addresses. Track response time, error rate, and the queue depth of our email worker at each stage.

The spike phase simulates a flash sale scenario where traffic doubles in under a minute. This is when email infrastructure usually fails first because the queue fills faster than the SMTP relay can drain it.

### 2. Monitor email delivery during the load test

While the load test runs, track whether transactional emails are actually being delivered or silently failing. The API can return 200 OK for every order while the email queue silently overflows -- you only see the failure when customers complain.

> While the load test is running, monitor our email delivery pipeline. Check the SMTP relay queue depth, delivery success rate, and bounce rate in real time. After the test completes, pull delivery reports from our SendGrid account for the test window. Identify at what request rate emails started queuing, at what rate we hit SendGrid's per-second limit, and whether any emails bounced due to throttling.

Monitoring the queue depth in real time reveals the exact inflection point where the email pipeline falls behind. Once the queue starts growing faster than it drains, every subsequent order adds to the delay.

### 3. Diagnose deliverability failures under load

Investigate any emails that bounced, were delayed, or landed in spam during the high-traffic test. A 4% bounce rate during normal operations might be acceptable, but during a flash sale it means thousands of customers missing their order confirmations.

> We saw a 4% bounce rate during the 1,000-user spike. Debug the bounced emails: check the SMTP response codes, verify our SPF and DKIM records are still passing under high send volume, and determine if SendGrid's sending IP reputation was affected by the burst. Also check if any emails landed in spam for Gmail and Outlook test accounts we seeded in the test.

The SMTP response codes tell you exactly why each email bounced. A 421 (rate limit) is a fundamentally different problem than a 550 (authentication failure), and each requires a different fix.

### 4. Identify the infrastructure bottleneck

Correlate load test metrics with email delivery metrics to find the weakest link in the chain.

> Correlate the load test results with email delivery timing. At 200 RPS the API responded in 120ms and emails arrived in 15 seconds. At 400 RPS the API hit 800ms and emails took 90 seconds. At 600 RPS we started seeing 503s and email delivery times exceeded 5 minutes. Identify whether the bottleneck is API response time, the background job queue, database connection pool exhaustion, or the email provider's rate limit.

### 5. Implement fixes and re-validate

Apply targeted fixes to the bottleneck and re-run the load test to confirm improvement. The re-validation step is essential -- theoretical fixes need to be proven under the same load conditions that exposed the original problem.

> Based on the analysis, increase our database connection pool from 20 to 50, switch the email queue to a dedicated Redis instance, and configure SendGrid's dedicated IP with proper warmup. Re-run the same load test scenario. Verify that at 500 concurrent users, API p95 stays under 300ms and email delivery time stays under 60 seconds. Generate a comparison report of before and after metrics.

## Real-World Example

The e-commerce team ran the load test on a staging environment that mirrored production. At 300 requests per second, everything looked healthy. At 450 RPS, the email worker started falling behind -- not because of SendGrid, but because the job queue shared a Redis instance with the session store, and session writes were starving the email jobs.

They moved email processing to a dedicated Redis instance, re-ran the test, and confirmed email delivery stayed under 45 seconds at 800 RPS. The deliverability audit also revealed that their SPF record had 11 DNS lookups (one over the RFC limit), which caused intermittent authentication failures at Gmail. The fix was flattening the SPF record to reduce lookups from 11 to 6.

After fixing the SPF record and running the load test a final time, they confirmed zero bounces and sub-30-second delivery at their projected Black Friday traffic of 600 RPS. The total investigation and fix took three days, and Black Friday processed 42,000 orders with every confirmation email delivered within 25 seconds. The previous year's flash sale had generated 180 support tickets about missing order confirmations; this year there were zero.
