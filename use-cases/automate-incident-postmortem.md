---
title: "Automate Incident Postmortem Reports with AI"
slug: automate-incident-postmortem
description: "Generate structured postmortem documents from incident timelines, logs, and chat transcripts automatically."
skills: [meeting-notes, markdown-writer, coding-agent]
category: productivity
tags: [incident-response, postmortem, documentation, devops, reliability]
---

# Automate Incident Postmortem Reports with AI

## The Problem

Rafa is a senior SRE at a 30-person fintech team. They average four production incidents per month — not catastrophic outages, but the kind of degraded service events that trigger pages, require investigation, and need a formal write-up. After every one, somebody has to write a postmortem: piece together the timeline from a 200-message Slack thread (most of which is "looking into it" and "is this related?"), pull the relevant log snippets from a sea of noise, identify the root cause, and assign action items with owners and deadlines. This takes 2-4 hours per incident, and it always falls on whoever was on call — usually after a rough night of 3 AM pages and adrenaline.

The result is predictable. Postmortems get delayed for weeks. When they do get written, they are either so hasty they miss critical details (the contributing factors section just says "need better monitoring"), or so thorough they take half a day that the engineer does not have. A 15-person platform team handling 4 incidents a month loses an entire engineering day just on postmortem paperwork.

And then the real cost becomes clear: the next incident has the same root cause because nobody read the last postmortem — or because the last postmortem was never written. The action items from three months ago are still sitting in a Jira backlog tagged "post-incident follow-up," and the connection pool is still hardcoded at 10.

## The Solution

Using the **meeting-notes** skill to extract key events from chat transcripts, the **coding-agent** to pull and correlate log data, and the **markdown-writer** to assemble everything into a structured document, the agent turns raw incident data into a publication-ready postmortem in minutes instead of hours.

## Step-by-Step Walkthrough

### Step 1: Feed the Raw Incident Data

After last night's payment service outage, Rafa has three data sources sitting on his desktop:

- `incident-slack-thread.txt` — 200+ messages from the incident Slack channel, including the false starts, the "anyone else seeing this?" messages, and the 47 emoji reactions
- `error-logs-2026-02-16.json` — application logs from 02:00-04:30 UTC, filtered to the payment service
- `datadog-timeline.md` — exported alert timeline from Datadog with metric values at each trigger point

He points the agent at all three. The total raw data: about 200 Slack messages (90% of which are noise), 15,000 log lines, and a 2-page alert timeline.

```text
Here's our incident from last night. I have:
- incident-slack-thread.txt (exported Slack conversation)
- error-logs-2026-02-16.json (application logs from 02:00-04:30 UTC)
- datadog-timeline.md (exported alert timeline)

Generate a postmortem following our template: title, summary, impact,
timeline, root cause, action items, lessons learned.
```

The agent's job is to find the signal in the noise: which 7 moments out of 200 messages actually matter, which log lines correlate with those moments, and what causal chain connects the first anomaly to the resolution.

### Step 2: Build the Unified Timeline

The hardest part of any postmortem is the timeline. Slack messages are informal — timestamps are in different formats, people edit their messages after the fact, and the critical moments are buried between "looking into it" and "anyone else seeing this?" messages. The log file has 15,000 lines. The Datadog export uses UTC but the Slack thread is in local time.

Cross-referencing all three sources and normalizing timestamps produces a clean chronological sequence:

| Time (UTC) | Event |
|---|---|
| 02:12 | Datadog alert: API error rate exceeded 5% threshold |
| 02:14 | On-call engineer Dani acknowledged the page |
| 02:17 | Dani identified connection pool exhaustion in payment-service logs |
| 02:23 | Dani applied hotfix: increased pool size from 10 to 50 |
| 02:31 | Error rate dropped below 1% |
| 02:45 | Dani confirmed all queued transactions processed successfully |
| 03:10 | Incident marked resolved |

What makes this timeline valuable is what it leaves out. The Slack thread has 200+ messages, most of them noise — people checking in, asking if they should join the call, sharing screenshots of dashboards that turned out to be unrelated. The timeline distills it to the 7 moments that matter. A human doing this manually has to read every message to decide what is relevant; the correlation with log timestamps makes that filtering automatic.

### Step 3: Identify Root Cause and Contributing Factors

Log analysis traces the failure chain backward from the symptoms to the source. At 02:12, the error rate spiked. But the connection pool was already at 100% utilization by 02:03 — it just took 9 minutes for enough requests to fail that the error rate crossed the 5% threshold.

**Root cause:** A scheduled batch job (`invoice-reconciliation`) was migrated to run during off-peak hours (02:00 UTC) without adjusting connection pool limits. The job opened 40 concurrent database connections, starving the `payment-service` of its 10-connection pool.

**Contributing factors** — this is where the real value of a postmortem lives:

- **No connection pool monitoring alerts** — the team had alerts on error rate but not on resource exhaustion. The pool was full for 9 minutes before anyone knew. If an alert had fired at 80% utilization, Dani would have been paged before any customer-facing errors occurred.
- **The batch job migration PR did not include load testing** — nobody checked how many connections the reconciliation job would consume at production scale. The PR review focused on the schedule change, not the resource footprint.
- **Connection pool size was hardcoded** in the application config (`const POOL_SIZE = 10`), not driven by environment variables. Staging ran fine because the staging batch size was 1/10th of production. The hardcoded value meant there was no way to tune it without a code deploy.

This is the part that turns an incident from "bad luck" into "preventable." The root cause is one line of config, but the contributing factors reveal three systemic gaps that would eventually cause a different incident if left unfixed.

### Step 4: Generate Action Items with Owners

Action items without owners and deadlines are wishes, not commitments. The postmortem assigns each one with enough specificity to be tracked:

| # | Action | Owner | Priority | Due |
|---|---|---|---|---|
| 1 | Add connection pool utilization alerts at 80% threshold | Dani | P1 | 2026-02-23 |
| 2 | Move connection pool size to environment config | Marta | P2 | 2026-02-28 |
| 3 | Add load test step to batch job deployment checklist | Dani | P2 | 2026-03-01 |
| 4 | Review all scheduled jobs for resource contention | Team | P3 | 2026-03-15 |

Action item 1 is the immediate fix — if the pool alert had existed, Dani would have been paged 9 minutes earlier, before any customer-facing errors occurred. Action item 4 is the one that prevents the class of incident, not just this instance. If the invoice reconciliation job could exhaust the pool, other scheduled jobs might have the same problem. A review of all cron jobs, their resource footprints, and their scheduling overlaps catches the next one before it happens.

### Step 5: Assemble the Final Document

The complete postmortem is written in markdown with consistent formatting, ready to be committed to the team's incident repository or pasted into Notion. The structure follows the team's standard template:

The structure follows the team's standard template, so every postmortem is consistent and searchable:

**Title:** Payment Service Outage — Connection Pool Exhaustion (2026-02-16)

**Summary:** A scheduled batch job migrated to off-peak hours consumed all available database connections, causing 23 minutes of degraded service on the payment API. Approximately 140 API calls failed with 503 errors. No data was lost — all failed transactions were retried successfully by the client applications after resolution. Customer support received 4 tickets during the incident window; all customers were notified of the resolution within 2 hours.

The full document includes:

- **Impact assessment** — 23 minutes of degraded service, approximately 140 failed API calls, no data loss, no financial impact. Customer support received 4 tickets during the incident window.
- **Full timeline** — the 7-event sequence from Step 2, with each event linked to its source (Slack message, log line, or Datadog alert)
- **Root cause analysis** — the batch job connection exhaustion with three contributing factors, including the specific config values and code paths involved
- **4 action items** — with owners, priorities, and due dates
- **Lessons learned** — what went well (fast detection at 2 minutes to acknowledge, clean resolution in under an hour, no customer data impact), what did not (no pool monitoring, no load testing for batch jobs, hardcoded config that prevented staging from revealing the problem)

The document is saved to `postmortem-2026-02-16-payment-service-outage.md` and is ready for team review. Because every postmortem follows the same structure, they become searchable — six months from now, when someone sees connection pool issues during an incident, they can search the repository for "connection pool" and find this postmortem immediately, complete with the root cause, the fix, and the preventive measures that were taken.

The consistent structure also makes it easy to track patterns across incidents. After 6 months of postmortems, the team can see that 40% of their incidents involve resource contention and 30% involve config that was not environment-variable driven — patterns that are invisible when each postmortem is written in a different format or not written at all.

## Real-World Example

Rafa exports the Slack channel and pulls the log files — the same data-gathering step he would do for a manual postmortem. The difference is what happens next. Instead of spending 3 hours staring at timestamps and cross-referencing Slack messages with log lines — deciding which of 200 messages is timeline-worthy and which is noise — he hands the raw materials to the agent and gets a clean draft in under 3 minutes.

He reads through it, adds one nuance about a config change from the previous sprint that made the batch job run 3x faster by processing records in parallel (which also tripled the number of database connections it consumed), corrects one action item owner, and publishes it. The whole process takes 20 minutes.

The team reviews the postmortem in their weekly incident review meeting. The contributing factors spark a broader conversation: if connection pool sizes are hardcoded, what else is hardcoded that should not be? This leads to a side project that moves 12 other config values to environment variables — a systemic improvement that would not have happened without the postmortem surfacing the pattern.

Over the next month, the team ships all four action items. Action item 1 pays off almost immediately — the connection pool alert fires two weeks later during a legitimate traffic spike. This time, the on-call engineer gets paged at 80% pool utilization instead of after errors are already hitting customers. She checks the postmortem, sees the same pattern, recognizes the batch job is not the cause this time, and increases the pool size before any customer notices. The alert pays for itself in the first two weeks.

The postmortem that used to be a dreaded half-day chore is now a 20-minute task. Four incidents a month means the team reclaims roughly 12 hours of engineering time per month — time that goes toward actually fixing the systemic issues that postmortems identify instead of documenting them after the fact.
