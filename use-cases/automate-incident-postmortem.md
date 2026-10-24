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

Rafa is a senior SRE at a 30-person fintech team. They have a few production incidents a month: not catastrophic outages, but degraded-service events that trigger pages, need investigation, and need a formal write-up. After every one, somebody has to piece together the timeline from a 200-message Slack thread (most of it "looking into it" and "is this related?"), pull the relevant log lines out of the noise, find the root cause, and assign action items with owners and deadlines. For Rafa this takes a few hours per incident, and it falls on whoever was on call, usually after a night of 3 AM pages.

Postmortems get delayed for weeks. When they do get written, they are either so hasty they miss critical details (the contributing factors section just says "need better monitoring") or so long that nobody has the time. Then the next incident has the same root cause, because nobody read the last postmortem or it was never written, and the action items are still sitting in a backlog while the connection pool is still hardcoded at 10.

## The Solution

Three skills split the work:

- **meeting-notes** turns the raw chat transcript into decisions, owners and a clean sequence of events.
- **coding-agent** runs a headless coding agent (`claude -p`, `codex exec` or `gemini -p`) in the background to read the large log file and answer specific questions about it, so the logs do not fill the main conversation.
- **markdown-writer** assembles the result into a fixed postmortem template that the team commits to its incident repository.

The agent drafts; the on-call engineer verifies every claim against the logs before publishing. A model can attribute an event to the wrong person or invent a cause that fits the story, so the draft is a starting point, not a record.

## Step-by-Step Walkthrough

### Step 1: Gather and redact the raw incident data

After last night's payment service outage, Rafa has three sources:

- `incident-slack-thread.txt`: the exported incident channel, including false starts and "anyone else seeing this?" messages
- `error-logs-2026-02-16.json`: application logs from 02:00-04:30 UTC, filtered to the payment service
- `datadog-timeline.md`: the exported alert timeline with metric values at each trigger

Logs and chat often contain customer emails, tokens and card fragments. Before anything goes to a hosted model, strip them (or run a local model). A simple first pass:

```bash
REDACT='s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g; s/(Bearer |token=)[A-Za-z0-9._~+\/=-]+/\1<redacted>/g'
sed -E "$REDACT" error-logs-2026-02-16.json > logs.redacted.json
sed -E "$REDACT" incident-slack-thread.txt > thread.redacted.txt
```

Use the `.redacted` files in the steps below. Review the result by eye; a regex is not a guarantee.

### Step 2: Let a background agent mine the logs

Fifteen thousand log lines are too many to paste into a chat. The coding-agent skill runs a headless Claude Code session that may only read files, and leaves the answer in a file:

```bash
LOG=$(mktemp /tmp/pm-logs.XXXXXX)
claude -p "Read logs.redacted.json. List, in UTC, the first error of each distinct type, \
the time the database connection pool reached 100% utilization, and the time errors stopped. \
Output a markdown table with a log line number for every row." \
  --permission-mode dontAsk --allowedTools "Read" \
  --max-budget-usd 2 --output-format text > "$LOG" 2>&1 &
AGENT_PID=$!
wait $AGENT_PID; echo "exit code: $?"; cat "$LOG"
```

`-p` runs one prompt and exits; `--allowedTools "Read"` pre-approves reading only, and `dontAsk` denies anything else, because nobody can answer a permission prompt in print mode. Asking for a line number on every row lets Rafa check each fact in seconds. `codex exec` (read-only by default) and `gemini -p` do the same job if the team uses those CLIs.

### Step 3: Build the unified timeline from the chat

With the meeting-notes skill, the agent turns the Slack export into the moments that matter and normalizes timestamps: the Slack thread is in local time, Datadog and the logs are UTC.

```text
Using the meeting-notes approach, extract from thread.redacted.txt: who acknowledged
the page, every decision, every change applied to production, and who made it. Convert all
times to UTC. Ignore chatter. Then merge with the log table above and datadog-timeline.md.
```

The merged result is about seven events out of 200 messages:

| Time (UTC) | Event |
|---|---|
| 02:03 | Connection pool reaches 100% (logs, line 4121); no alert fires |
| 02:12 | Datadog alert: API error rate above the 5% threshold |
| 02:14 | On-call engineer Dani acknowledges the page |
| 02:17 | Dani identifies connection pool exhaustion in payment-service logs |
| 02:23 | Dani applies a hotfix: pool size raised from 10 to 50 |
| 02:31 | Error rate drops below 1% |
| 03:10 | Incident marked resolved |

### Step 4: Root cause, contributing factors and action items

Tracing the chain backward: errors crossed 5% at 02:12, but the pool was already full at 02:03. A scheduled batch job (`invoice-reconciliation`) had been moved to 02:00 UTC without any change to resource limits. It opened 40 concurrent connections with long-running queries, which slowed the database, so payment-service queries held their connections longer and exhausted its pool of 10.

Contributing factors are the valuable part of a postmortem:

- **No alert on pool utilization.** Alerts existed for error rate, not for resource exhaustion. An 80% alert would have paged Dani before customers saw errors.
- **The batch-job migration had no load test.** The PR review looked at the schedule, not at the resource footprint.
- **The pool size was hardcoded** (`const POOL_SIZE = 10`). Staging ran a batch one tenth the size, so it never showed the problem, and tuning needed a deploy.

| # | Action | Owner | Priority | Due |
|---|---|---|---|---|
| 1 | Alert on connection pool utilization at 80% | Dani | P1 | 2026-02-23 |
| 2 | Move pool size to environment config | Marta | P2 | 2026-02-28 |
| 3 | Add a load-test step to the batch job deployment checklist | Dani | P2 | 2026-03-01 |
| 4 | Review all scheduled jobs for resource contention | Team | P3 | 2026-03-15 |

Action 4 is the one that prevents the class of incident rather than this instance. Owners and dates come from Rafa, not from the model: the agent proposes, the team commits.

### Step 5: Assemble the document with a fixed template

The markdown-writer skill turns the pieces into the team's template, so every postmortem has the same sections and can be searched later:

```text
Write postmortem-2026-02-16-payment-service-outage.md with sections: Summary, Impact,
Timeline, Root cause, Contributing factors, Action items (table), What went well,
What went wrong. Use only the facts above; mark anything I did not give you as "TO CONFIRM".
```

The "TO CONFIRM" rule matters: impact numbers (failed requests, support tickets, customers notified) come from monitoring and the support queue, not from the logs the agent saw. Rafa fills those in himself, checks each timeline row against its log line number, corrects the owners, and commits the file to the incident repository.

## Real-World Example

Rafa does the same data gathering he would do for a manual postmortem. The difference is that the cross-referencing, which used to eat the evening, comes back as a draft with a log line behind each row. He spends his time on the parts only a human can do: he adds that a change the previous sprint made the batch job process records in parallel, which tripled its connection use, replaces two guessed impact figures with numbers from the dashboard, and fixes one action item owner.

The team reviews it at the weekly incident review. The hardcoded pool size prompts a broader question, what else is hardcoded that should be an environment variable, which becomes a small cleanup task. Because every postmortem now has the same sections, a later incident with pool errors is one repository search away from this one, complete with root cause and fix.

## Related Skills

- [meeting-notes](https://terminalskills.io/skills/meeting-notes): turns chat transcripts into events, decisions and owners
- [markdown-writer](https://terminalskills.io/skills/markdown-writer): produces the fixed postmortem template
- [coding-agent](https://terminalskills.io/skills/coding-agent): runs a headless agent to mine large log files
