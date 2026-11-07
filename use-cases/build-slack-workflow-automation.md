---
title: "Build Slack Workflow Automations That Replace Manual Processes"
slug: build-slack-workflow-automation
description: "Create Slack bots that automate team workflows like standups, incident response, and approval chains — replacing manual processes with interactive slash commands and scheduled messages."
skills: [slack-bot-builder, coding-agent, n8n]
category: automation
tags: [slack, bot, workflow-automation, team-productivity, integrations]
---

# Build Slack Workflow Automations That Replace Manual Processes

## The Problem

A 25-person engineering team runs everything through Slack, but their workflows are entirely manual. The team lead posts standup prompts every morning and manually compiles responses into a summary. Incident alerts from PagerDuty go to a channel where someone has to manually create a war room, tag the on-call engineer, and start a timeline. Deployment approvals happen through DMs that get lost in the scroll. PTO requests live in a spreadsheet that someone updates twice a week.

Every week, 6-8 hours of engineering time goes to coordination that could be automated. Worse, the manual processes have gaps: approvals get forgotten, standup summaries miss people who responded late, and the PTO spreadsheet is always a week behind reality. The information exists in Slack -- it just needs structure.

## The Solution

Use **slack-bot-builder** to create an interactive Slack bot with Bolt for JavaScript (`@slack/bolt`), slash commands, buttons and modals, **coding-agent** to implement the business logic and database layer, and **n8n** to connect external services like PagerDuty, Google Calendar, and GitHub.

## Step-by-Step Walkthrough

### Step 1: Build the Standup Automation

```text
Build a Slack bot with Bolt for JavaScript (Socket Mode, Node 20+) that
automates daily standups. Every weekday at 9:00 AM, a cron job posts a standup
prompt to #engineering with an "Add my update" button. Team members click it,
get a modal with Yesterday / Today / Blockers fields, and the bot compiles all
responses into a summary posted at 9:30 AM. Include a /standup-skip command
for days off. Store responses in SQLite.
```

Bolt has no scheduler of its own, so a cron job (`node-cron`, with an explicit timezone) calls `chat.postMessage` at 9:00 on weekdays. The message carries one Block Kit button; clicking it makes the bot call `views.open` with the click's `trigger_id` (it expires after 3 seconds, so open the modal first and do slow work afterwards). The modal has three input blocks, much cleaner than asking people to format thread replies:

```javascript
import { App } from '@slack/bolt';
import cron from 'node-cron';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,      // xoxb-...
  appToken: process.env.SLACK_APP_TOKEN,   // xapp-..., scope connections:write
  socketMode: true,
});

cron.schedule('0 9 * * 1-5', () => app.client.chat.postMessage({
  channel: process.env.STANDUP_CHANNEL_ID,
  text: 'Daily standup',
  blocks: [{ type: 'actions', elements: [{ type: 'button', action_id: 'standup_open',
    text: { type: 'plain_text', text: 'Add my update' } }] }],
}), { timezone: 'Europe/Berlin' });

app.action('standup_open', async ({ ack, body, client }) => {
  await ack();
  await client.views.open({ trigger_id: body.trigger_id, view: standupModal() });
});

app.view('standup_submit', async ({ ack, view, body }) => {
  await ack();
  saveUpdate(body.user.id, view.state.values);   // INSERT into SQLite
});

await app.start();
```

`standupModal()` returns a modal view with `callback_id: 'standup_submit'` and three `input` blocks. Socket Mode needs no public URL, which suits an internal bot; an app that goes into the Slack Marketplace must use HTTP with request signing instead.

At 9:30 AM, the bot compiles every response into a formatted summary:

```
Daily Standup — Wednesday, Feb 18

Alex Chen
  Yesterday: Shipped the notification preferences UI
  Today: Starting delivery tracking integration
  Blockers: None

Priya Nair
  Yesterday: Fixed the Redis connection pool leak
  Today: Load testing the chat WebSocket server
  Blockers: Need staging environment credentials from DevOps
```

Blockers get a special treatment -- any standup with a blocker also posts to #blockers with a mention of the team lead. `/standup-skip` marks a team member as "out today" so the summary does not flag them as missing.

Responses persist in SQLite, so a `/standup-history @alex last week` command shows what anyone reported over a given period. Useful for 1:1 prep.

### Step 2: Create the Incident Response Workflow

```text
Add an incident command: /incident-create [severity] [title]. When triggered,
the bot should:
1. Create a new channel #inc-{date}-{short-title}
2. Set the channel topic to the incident description
3. Invite the current on-call person (query PagerDuty API)
4. Post an incident template with severity, status, and timeline
5. Pin a running timeline that auto-updates when people post updates
6. Add reaction-based status updates (red for investigating, yellow for identified, green for resolved)

When resolved, generate a summary and post to #incidents.
```

When someone types `/incident-create P1 Payment processing down`, the handler calls `ack()` immediately (Slack requires an acknowledgement within 3 seconds) and then does the following:

1. A new channel `#inc-20260218-payment-processing` is created with `conversations.create` (names are lowercase letters, numbers, hyphens and underscores, at most 80 characters; the bot needs the `channels:manage` scope)
2. The channel topic is set to "P1 -- Payment processing down"
3. The current on-call engineer is fetched from the PagerDuty REST API (`GET /oncalls`), matched to a Slack user by email with `users.lookupByEmail`, and invited with `conversations.invite`
4. A pinned message appears with the incident template:

```
Incident: Payment processing down
Severity: P1
Status: Investigating
Commander: @oncall-engineer
Created: 2026-02-18 14:23 UTC

Timeline:
14:23 — Incident created by @alex
```

Team members use `/incident-update Fixed the connection pool exhaustion` to append entries to the pinned timeline. Reactions on the pinned message change the status: red circle for investigating, yellow circle for identified, green circle for resolved.

When someone marks resolved, the bot generates a summary (duration, timeline, participants) and posts it to #incidents for the historical record. The incident channel gets archived after 7 days.

The manual version of this -- creating a channel, tagging on-call, starting a doc, updating stakeholders -- took 15 minutes of scrambling during an active outage. The automated version takes a few seconds.

### Step 3: Set Up Deployment Approvals

```text
Build a deployment approval flow: when someone runs /deploy [service] [env],
the bot posts an approval request to #deployments with the service name,
environment, git diff summary (from GitHub API), and Approve/Reject buttons.
For staging: any engineer can approve. For production: requires approval from
a team lead (check Slack user group membership). Track all deployments in a
database with who requested, who approved, and timestamp.
```

`/deploy payments-api production` posts an approval request to #deployments:

```
Deployment Request
Service: payments-api
Environment: production
Requested by: @alex
Branch: fix/connection-pool (3 commits ahead of main)

Changes:
  + lib/pool.ts — Fix connection pool exhaustion under load
  + tests/pool.test.ts — Add pool stress test
  ~ config/production.json — Increase max connections 20 → 50

[Approve]  [Reject]
```

The diff summary comes from the GitHub API -- the bot fetches the compare between the branch and main, summarizing changed files. For staging deploys, any engineer can click Approve. For production, the bot reads the `@team-leads` user group with `usergroups.users.list` (scope `usergroups:read`) and only accepts approvals from its members. The requester can never approve their own deploy.

Every deployment is recorded: who requested, who approved, when, and what changed. `/deploy-history payments-api` shows the last 10 deployments with their full approval chain. No more "did anyone approve this?" conversations.

### Step 4: Automate PTO Tracking

```text
Add /pto-request [dates] [reason] that creates an approval flow: posts to
the requester's manager (looked up from a team config), shows a calendar
view of team availability for those dates, and provides Approve/Deny buttons.
On approval, create a Google Calendar out-of-office event (through an n8n
webhook) and notify the team channel. Add /pto-calendar showing who's
out this week and next.
```

`/pto-request Feb 23-27 Family vacation` sends an approval request to the requester's manager (looked up from a team config JSON):

```
PTO Request
From: @alex (Backend team)
Dates: Feb 23-27 (5 days)
Reason: Family vacation

Team availability for those dates:
  Feb 23 (Mon): 4/5 backend engineers available
  Feb 24 (Tue): 4/5 backend engineers available
  Feb 25 (Wed): 3/5 backend engineers available (Priya also out)
  Feb 26 (Thu): 4/5 backend engineers available
  Feb 27 (Fri): 4/5 backend engineers available

[Approve]  [Deny]
```

The availability visualization is the key detail -- the manager immediately sees whether approving this request leaves the team short-handed on any day.

On approval, two things happen automatically: an all-day "Out of office" event is created in Google Calendar (an n8n Webhook node feeding a Google Calendar node, operation Create with All Day on), and #engineering gets a notification. A bot cannot set another person's Slack status: `users.profile.set` needs that user's own token, or an admin token, so the status stays the employee's to set (Slack's Google Calendar integration can sync it from the calendar event). No spreadsheet to update, no calendar to maintain.

`/pto-calendar` shows a weekly availability dashboard:

```
Team Availability — This Week
  Mon Feb 16: Everyone in
  Tue Feb 17: Everyone in
  Wed Feb 18: Priya out (doctor appointment)
  Thu Feb 19: Everyone in
  Fri Feb 20: Alex out (half day)

Next Week
  Mon Feb 23 - Fri Feb 27: Alex out (vacation)
  Wed Feb 25: Priya out (personal)
```

### Step 5: Connect Everything with n8n

```text
Set up n8n workflows to connect the Slack bot with external services:
1. PagerDuty → Slack: route alerts to the right channel based on service
2. GitHub → Slack: post PR review requests to #code-review with approve/reject buttons
3. Google Calendar → Slack: morning digest of today's meetings posted to each person's DM
4. Slack → Jira: /ticket command creates a Jira issue from Slack with context

Show me the n8n workflow JSON for each integration.
```

Four n8n workflows bridge Slack with the external tools the team already uses:

- **PagerDuty -> Slack**: A Webhook node receives PagerDuty webhooks (check the `X-PagerDuty-Signature` HMAC before trusting the payload), routes to the correct channel based on the affected service (payments alerts go to #payments-alerts, infra alerts go to #infra-alerts). P1 alerts also trigger the incident creation workflow.
- **GitHub -> Slack**: A GitHub webhook (verify `X-Hub-Signature-256`) fires when a PR is tagged "ready for review"; a message then appears in #code-review with the title, description, and Approve/Request Changes buttons that map back to the GitHub review API.
- **Google Calendar -> Slack**: At 8:30 AM, each engineer gets a DM with their meetings for the day, including join links. No more checking the calendar separately.
- **Slack -> Jira**: the bot's `/ticket Bug: payments timeout on large orders` handler acks, then calls an n8n webhook that creates a Jira issue with the channel context, message permalink, and reporter automatically populated.

Each workflow has an error workflow (n8n's Error Trigger node) that posts failures to #bot-errors, so a broken PagerDuty route is noticed before the next incident.

## Real-World Example

An engineering manager at a 30-person SaaS company deploys the standup bot first. Daily compilation that used to take 20 minutes of manual work now takes zero. The incident workflow launches the following week and replaces about 15 minutes of manual setup with one command.

Deployment approvals create a complete audit trail -- the team can trace every production deploy back to who requested it, who approved it, and what changed. PTO tracking moves from a spreadsheet to Slack, and the team sees availability at a glance for the first time.

In this example the team estimates it saves 8+ hours per week. More importantly, every decision -- every deploy approval, every incident timeline, every PTO request -- is documented automatically. The team stops losing information to Slack scroll.
