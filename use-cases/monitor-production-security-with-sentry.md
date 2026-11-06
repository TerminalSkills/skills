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

Use the **security-audit** skill to identify vulnerabilities in code before deployment, then use the **sentry** skill's SDK and alerting setup to detect exploitation attempts at runtime. Static findings tell you which endpoints to instrument; runtime signals tell you which endpoints to re-audit first.

## Step-by-Step Walkthrough

### 1. Run a security audit and tag findings by exploitability

Start with a full codebase scan, classifying each finding by how it can be attacked:

> Run a security audit on the src/ directory. For each finding, classify it as externally exploitable (reachable from an unauthenticated HTTP request), internally exploitable (requires authentication), or theoretical (requires local access). Cite the OWASP Top 10 2025 category. Focus on injection flaws, authentication failures, and access control.

The audit's report lists each finding with file, line, severity and category. In this example the team gets 18 findings: 4 externally exploitable, 7 internally exploitable, and 7 theoretical. The 4 external issues -- SQL injection in the reports endpoint, path traversal in file downloads, an open redirect in the OAuth callback, and missing rate limiting on login -- can be attacked without credentials.

### 2. Emit a tagged Sentry event when an exploit pattern is seen

Sentry only reports what the SDK sends, and it cannot tell a typo from an injection attempt on its own. Make the application say so: where an input check rejects a payload that matches a known attack shape, send a tagged event. With the Node SDK (`npm install @sentry/node`, `Sentry.init({ dsn: process.env.SENTRY_DSN, environment, release })` as in the sentry skill):

```ts
import * as Sentry from "@sentry/node";

export function reportAttackAttempt(kind: string, endpoint: string, ip: string) {
  Sentry.captureMessage(`attack attempt: ${kind}`, {
    level: "warning",
    tags: { security_event: kind, endpoint },
    extra: { ip },
  });
}

// in the reports handler, before the parameterized query runs
if (!/^\d+$/.test(req.params.id)) {
  reportAttackAttempt("sqli", "/api/reports/:id", req.ip);
  return res.status(400).json({ error: "invalid id" });
}
```

Use the same call for path traversal (`..` sequences in a file name), an open-redirect target outside the allowlist, and failed logins. Events from `captureMessage` with the same message group into one issue per attack kind, so a flood does not become thousands of tickets. The `ip` goes in `extra`, which is only sent if your privacy policy allows storing client addresses.

### 3. Create issue alert rules per attack kind

In the Sentry project, open Alerts, create an issue alert, and set:

- **When:** "An event or issue activity is captured"
- **If:** "Tagged event" `security_event` equals `sqli`, plus "Number of events" more than a threshold you choose, such as 5 in 5 minutes (a single probe is noise; a burst is a scan)
- **Then:** send a PagerDuty notification for `sqli` and path traversal, a Slack message to `#security-alerts` for login and redirect events

Create one rule per `security_event` value. The same rule shape works for "Tagged event" on `environment` equals `production` so staging scans do not page anyone.

### 4. Build a feedback loop between runtime signals and audits

Create a saved view in Issues (All Views, then Create View) with the query `security_event:*` sorted by frequency and scoped to production. Review it daily at first. When a new endpoint starts appearing in the `endpoint` tag column that the audit marked as clean, treat it as a trigger for a targeted re-audit:

> Run a security audit on src/routes/uploads.ts only. Sentry shows 40 `security_event:path_traversal` events against it this week.

Sentry does not start the audit by itself; the re-audit is a manual request, or a CI job you wire to an alert webhook ("Send a notification via an integration" covers custom webhooks).

### 5. Validate the pipeline with a controlled test

Send benign payloads that match each signature to a staging deployment (never production, never a third party's system) and confirm the alert fires and routes to the right channel:

```console
$ curl -s -o /dev/null -w "%{http_code}\n" "https://staging.example.com/api/reports/1%20OR%201%3D1"
400
```

The 400 shows the handler rejected the payload, and the tagged event should appear in the saved view within a minute or so. Also replay a sample of normal traffic against the same rules and check that nothing fires.

### 6. Pull a weekly digest from the Sentry API

The built-in weekly report email is not customizable, so build the security digest from the issues API, with a token that has the `event:read` scope kept in `SENTRY_AUTH_TOKEN`:

```console
$ curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/$SENTRY_ORG/issues/?query=security_event:*&statsPeriod=7d&sort=freq&limit=25"
```

Ask the agent to summarize the JSON: attack attempts by `security_event` category, issues first seen this week, and the endpoints that have no alert rule yet. Post the summary to the security channel.

## Real-World Example

A fintech startup ran quarterly security audits that found 12-15 issues each cycle. After the audit flagged missing rate limiting on the login endpoint, they added `reportAttackAttempt("credential_stuffing", ...)` to the login handler and an alert on more than 20 such events in 5 minutes. The rule fired within hours of a credential-stuffing run that used known email and password pairs from a public breach. The team blocked the IP range and shipped rate limiting the same afternoon, instead of finding the traffic in logs weeks later at the next review.

## Related Skills

- **security-audit**: finds and classifies the vulnerabilities in step 1 and runs the targeted re-audits in step 4.
- **sentry**: SDK setup, issue alerts and the Slack/PagerDuty routing used in steps 2-3.
