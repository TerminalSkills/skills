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

After every production incident, your team needs a postmortem document. Someone has to piece together the timeline from Slack threads, pull relevant log snippets, identify the root cause, and write up action items. This takes 2-4 hours per incident, and when the on-call engineer is exhausted after a 3 AM page, the postmortem either gets delayed for weeks or written so hastily it misses critical details. A 15-person platform team handling 3-4 incidents per month loses an entire engineering day just on postmortem paperwork.

## The Solution

Use the **meeting-notes** skill to extract key events from chat transcripts, the **coding-agent** to pull and correlate log data, and the **markdown-writer** to assemble everything into a structured postmortem document with timeline, root cause analysis, and action items.

```bash
npx terminal-skills install meeting-notes markdown-writer coding-agent
```

## Step-by-Step Walkthrough

### 1. Feed the agent your incident data

Gather the raw materials and point the agent at them:

```
Here's our incident from last night. I have:
- incident-slack-thread.txt (exported Slack conversation)
- error-logs-2026-02-16.json (application logs from 02:00-04:30 UTC)
- datadog-timeline.md (exported alert timeline)

Generate a postmortem following our template: title, summary, impact, timeline, root cause, action items, lessons learned.
```

### 2. The agent extracts the timeline

The agent parses the Slack thread and correlates timestamps with log entries to build a unified chronological timeline:

```
Incident Timeline (all times UTC):
02:12 - Datadog alert: API error rate exceeded 5% threshold
02:14 - On-call engineer Dani acknowledged the page
02:17 - Dani identified connection pool exhaustion in payment-service logs
02:23 - Dani applied hotfix: increased pool size from 10 to 50
02:31 - Error rate dropped below 1%
02:45 - Dani confirmed all queued transactions processed successfully
03:10 - Incident marked resolved
```

### 3. The agent identifies root cause and contributing factors

By analyzing the log patterns, the agent traces the failure chain:

```
Root Cause:
A scheduled batch job (invoice-reconciliation) was migrated to run during
off-peak hours (02:00 UTC) without adjusting connection pool limits. The job
opened 40 concurrent database connections, starving the payment-service of
its 10-connection pool.

Contributing Factors:
- No connection pool monitoring alerts configured
- Batch job migration PR did not include load testing
- Connection pool size was hardcoded, not environment-variable driven
```

### 4. The agent generates action items with owners

```
Action Items:
| # | Action | Owner | Priority | Due |
|---|--------|-------|----------|-----|
| 1 | Add connection pool utilization alerts at 80% threshold | Dani | P1 | 2026-02-23 |
| 2 | Move connection pool size to environment config | Marta | P2 | 2026-02-28 |
| 3 | Add load test step to batch job deployment checklist | Dani | P2 | 2026-03-01 |
| 4 | Review all scheduled jobs for resource contention | Team | P3 | 2026-03-15 |
```

### 5. The agent assembles the final postmortem document

The complete postmortem is written in markdown with consistent formatting, ready to be committed to your team's incident repository or pasted into Notion.

```
Postmortem saved to: postmortem-2026-02-16-payment-service-outage.md
Document includes: summary, impact assessment (23 minutes of degraded service,
~140 failed API calls), full timeline, root cause analysis, 4 action items,
and lessons learned section.
```

## Real-World Example

Rafa is a senior SRE at a 30-person fintech team. They average four incidents per month, and the team dreads postmortem writing because it always falls on whoever was on call — usually after a rough night.

1. After a database failover incident, Rafa exports the incident Slack channel and pulls log files from their observability stack
2. He asks the agent to generate a postmortem, providing the team's standard template
3. The agent correlates 200+ Slack messages with 15,000 log lines, producing a clean 2-page document in under 3 minutes
4. Rafa reviews the draft, adds one nuance about a config change he remembers, and publishes it
5. The postmortem that used to take half a day is done in 20 minutes, and the quality is more consistent because nothing gets forgotten

## Related Skills

- [meeting-notes](../skills/meeting-notes/) -- Extracts structured information from conversation transcripts
- [markdown-writer](../skills/markdown-writer/) -- Formats the postmortem into clean, publishable markdown
- [coding-agent](../skills/coding-agent/) -- Parses logs and correlates events programmatically
