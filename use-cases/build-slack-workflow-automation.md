---
title: "Build Slack Workflow Automations That Replace Manual Processes"
slug: build-slack-workflow-automation
description: "Create Slack bots that automate team workflows like standups, incident response, and approval chains — replacing manual processes with interactive slash commands and scheduled messages."
skills: [slack-bot-builder, coding-agent, n8n-workflow]
category: automation
tags: [slack, bot, workflow-automation, team-productivity, integrations]
---

# Build Slack Workflow Automations That Replace Manual Processes

## The Problem

A 25-person engineering team runs everything through Slack, but their workflows are entirely manual. The team lead posts standup prompts every morning and manually compiles responses. Incident alerts from PagerDuty go to a channel where someone has to manually create a war room, tag on-call, and start a timeline. Deployment approvals happen through DMs that get lost. PTO requests are tracked in a spreadsheet someone updates twice a week. Every week, 6-8 hours of engineering time goes to coordination that could be automated.

## The Solution

Use `slack-bot-builder` to create interactive Slack bots with slash commands and scheduled messages, `coding-agent` to implement the business logic and database layer, and `n8n-workflow` to connect external services like PagerDuty, Google Calendar, and GitHub.

```bash
npx terminal-skills install slack-bot-builder coding-agent n8n-workflow
```

## Step-by-Step Walkthrough

### 1. Build the standup automation

```text
Build a Slack bot using the Bolt framework that automates daily standups.
Every weekday at 9:00 AM, it posts a standup prompt to #engineering with
three thread reply buttons: "Yesterday", "Today", "Blockers". Team members
click each button, get a modal to fill in their update, and the bot compiles
all responses into a summary posted at 9:30 AM. Include a /standup-skip
command for days off. Store responses in SQLite.
```

The agent scaffolds a Bolt.js app with node-cron for scheduling, Block Kit messages with interactive buttons, modal views for each standup section, and a compilation job that formats all responses into a clean summary with emoji indicators for blockers.

### 2. Create the incident response workflow

```text
Add an incident command: /incident-create [severity] [title]. When triggered,
the bot should:
1. Create a new channel #inc-{date}-{short-title}
2. Set the channel topic to the incident description
3. Invite the current on-call person (query PagerDuty API)
4. Post an incident template with severity, status, and timeline
5. Pin a running timeline that auto-updates when people post updates
6. Add reaction-based status updates (🔴 investigating, 🟡 identified, 🟢 resolved)

When resolved, generate a summary and post to #incidents.
```

The agent implements the full incident lifecycle: channel creation with proper naming, PagerDuty integration for on-call lookup, a pinned timeline message that appends entries when team members use `/incident-update`, and reaction-based status tracking that updates the channel topic in real time.

### 3. Set up deployment approvals

```text
Build a deployment approval flow: when someone runs /deploy [service] [env],
the bot posts an approval request to #deployments with the service name,
environment, git diff summary (from GitHub API), and Approve/Reject buttons.
For staging: any engineer can approve. For production: requires approval from
a team lead (check Slack user group membership). Track all deployments in a
database with who requested, who approved, and timestamp.
```

The agent creates a role-based approval system with GitHub integration that fetches the latest diff, Slack user group membership checks for authorization, an audit trail in SQLite, and a `/deploy-history` command showing recent deployments with their approval chain.

### 4. Automate PTO tracking

```text
Add /pto-request [dates] [reason] that creates an approval flow: posts to
the requester's manager (looked up from a team config), shows a calendar
view of team availability for those dates, and provides Approve/Deny buttons.
On approval, update Google Calendar, set a Slack status with 🏖 emoji for
those dates, and notify the team channel. Add /pto-calendar showing who's
out this week and next.
```

The agent builds a complete PTO system: manager lookup from a JSON config, team availability visualization in Block Kit, Google Calendar integration via n8n webhook, automatic Slack status updates using the users.profile.set API, and a weekly availability dashboard.

### 5. Connect everything with n8n

```text
Set up n8n workflows to connect the Slack bot with external services:
1. PagerDuty → Slack: route alerts to the right channel based on service
2. GitHub → Slack: post PR review requests to #code-review with approve/reject buttons
3. Google Calendar → Slack: morning digest of today's meetings posted to each person's DM
4. Slack → Jira: /ticket command creates a Jira issue from Slack with context

Show me the n8n workflow JSON for each integration.
```

The agent generates 4 n8n workflows with webhook triggers, HTTP nodes for API calls, and Slack nodes for posting messages. Each workflow includes error handling nodes that post failures to #bot-errors.

## Real-World Example

An engineering manager at a 30-person SaaS company spends 8 hours per week on team coordination through Slack: compiling standups, managing incidents, tracking approvals, and updating calendars.

1. She deploys the standup bot — daily compilation now takes zero manual effort, saving 3 hours/week
2. The incident workflow reduces mean-time-to-organize from 15 minutes to 30 seconds
3. Deployment approvals have a complete audit trail — no more "did anyone approve this?" conversations
4. PTO tracking moves from a spreadsheet to Slack — the team sees availability at a glance
5. Total time saved: 8+ hours per week across the team, with better documentation of every decision
