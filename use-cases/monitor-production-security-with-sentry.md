---
title: "Set Up Production Security Monitoring with Automated Triage"
slug: monitor-production-security-with-sentry
description: "Combine static security analysis with runtime error monitoring to catch vulnerabilities before deploy and detect exploitation attempts in production."
skills:
  - security-audit
  - sentry
category: development
tags:
  - security
  - monitoring
  - sentry
  - vulnerabilities
---

# Set Up Production Security Monitoring with Automated Triage

## The Problem

Your security audit runs once per quarter, but attackers probe your application daily. Between audits, new code ships with potential vulnerabilities, and you have no visibility into whether existing weaknesses are being actively exploited. Sentry captures runtime errors, but nobody has configured it to distinguish a user typo from a SQL injection attempt.

The security team reviews audit reports quarterly while the engineering team ignores Sentry noise daily, and neither group talks to the other. Last quarter's audit found 14 vulnerabilities. The team fixed them and moved on. There is no way to know if those same patterns have reappeared in new code, or if the 3 unfixed low-severity issues are currently being probed by automated scanners.

## The Solution

Use the **security-audit** skill to identify vulnerabilities in code before deployment, then configure the **sentry** skill to detect exploitation patterns at runtime, creating a closed loop where static findings inform monitoring rules and runtime signals trigger targeted re-audits.

## Step-by-Step Walkthrough

### 1. Run a security audit and tag findings by exploitability

Start with a full codebase scan, classifying each finding by how it can be attacked:

> Run a security audit on the src/ directory. For each finding, classify it as externally exploitable (reachable from an unauthenticated HTTP request), internally exploitable (requires authentication), or theoretical (requires local access). Focus on injection flaws, auth bypasses, and data exposure.

The audit returns 18 findings: 4 externally exploitable, 7 internally exploitable, and 7 theoretical. The 4 external issues -- SQL injection in the reports endpoint, path traversal in file downloads, an open redirect in the OAuth callback, and missing rate limiting on login -- can be attacked without any credentials.

### 2. Create Sentry alert rules for exploitation patterns

For each externally exploitable finding, configure a Sentry alert that detects the specific error pattern an attacker would trigger:

> Based on the 4 externally exploitable findings, generate Sentry alert configurations that detect exploitation attempts. For the SQL injection in /api/reports/:id, create an alert that fires when a database error contains syntax fragments like 'UNION SELECT' or 'OR 1=1'. Route these as P1 to PagerDuty.

Each alert rule includes the specific error signature, a severity level, and routing. SQL injection attempts route to PagerDuty immediately. Authentication bypass attempts post to #security-alerts in Slack with a 15-minute response SLA. The open redirect alert fires when the redirect target does not match the allowlist of known domains.

### 3. Build a feedback loop between runtime signals and audits

Configure Sentry to flag new error patterns that match known attack signatures, even on endpoints not originally flagged:

> Set up a Sentry saved search for errors matching common attack patterns: path traversal sequences, JWT decode failures from malformed tokens, rate limit violations clustered from a single IP, and unexpected 403 responses on admin endpoints. When any of these spike above baseline, trigger a targeted re-audit of the affected endpoint.

This creates a continuous monitoring layer. When a new endpoint ships and starts receiving path traversal probes, the spike triggers an automatic review rather than waiting for the next quarterly audit.

### 4. Validate the pipeline with a controlled test

Verify that the monitoring catches real exploitation patterns without false positives:

> Help me write a test script that sends benign payloads mimicking attack patterns to each patched endpoint, confirming the Sentry alerts fire correctly and route to the right channels without causing actual damage.

The test sends safe payloads that match exploit signatures, like a report ID of `1 OR 1=1` which the parameterized query handles safely but which Sentry still logs as suspicious. All 4 alert rules fire within 30 seconds and route correctly. A parallel test with 1,000 legitimate requests produces zero false positives.

### 5. Establish a weekly security digest

Create a recurring summary that bridges the gap between quarterly audits:

> Set up a weekly Sentry digest that summarizes security-related events: total attack attempts by category, any new error patterns matching exploit signatures, endpoints with unusual 4xx spikes, and a list of newly deployed endpoints that do not yet have monitoring rules.

The weekly digest ensures the security team has continuous visibility without waiting for the next formal audit. New endpoints are automatically flagged for rule coverage, closing the monitoring gap for freshly shipped code.

## Real-World Example

A fintech startup ran quarterly security audits that found 12-15 issues each cycle. After connecting audit findings to Sentry monitoring rules, they detected an active credential-stuffing attack within 3 hours of it starting. The attack targeted the login endpoint with known email/password combinations from a public data breach.

Sentry flagged the spike in authentication failures from a narrow IP range, which matched the "brute force" alert rule derived from the audit finding about missing rate limiting. The team blocked the IP range and deployed rate limiting the same afternoon.

Without the monitoring rules, the attack would have continued undetected for up to 8 weeks until the next quarterly review. The Sentry dashboard later showed 2,400 credential pairs had been tested, with 3 successful logins immediately invalidated.
