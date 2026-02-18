---
title: Automate Team Workflows with ClickUp
slug: automate-team-workflows-with-clickup
description: "Automate sprint carryover, task status updates, time tracking reports, and Slack alerts using the ClickUp API with webhooks and scheduled cron jobs."
category: automation
skills: [clickup]
tags: [clickup, automation, webhooks, time-tracking, reporting]
---

# Automate Team Workflows with ClickUp

## The Problem

Sami is an engineering manager at a 40-person fintech startup. They use ClickUp for project management but everything is manual -- developers forget to update task statuses, sprint carryover is done by hand every two weeks, time tracking is spotty, and there is no automated reporting. The CEO wants weekly velocity reports and the team leads want Slack alerts when tasks go overdue.

## The Solution

Use the **clickup** skill to build an Express server with webhook handlers and cron jobs that automate five workflows: auto-status transitions tied to GitHub events, hourly SLA enforcement with Slack escalation, biweekly sprint carryover with tagging, Friday time tracking audits, and Monday velocity reports.

## Step-by-Step Walkthrough

### Step 1: Scaffold the project and configure environment

```bash
mkdir clickup-automation && cd clickup-automation
npm init -y
npm install express node-cron
npm install -D typescript @types/node @types/express
npx tsc --init
```

Create a `.env` file with your credentials:

```bash
CLICKUP_API_TOKEN=pk_xxxxxxxxxxxx
CLICKUP_WEBHOOK_SECRET=your_webhook_secret
TEAM_ID=your_team_id
SPACE_ID=your_space_id
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxx
# Squad lead Slack user IDs for @mentions in alerts
SQUAD_LEAD_PLATFORM=U01ABC
SQUAD_LEAD_PRODUCT=U02DEF
SQUAD_LEAD_MOBILE=U03GHI
```

### Step 2: Set up the Express server with API helpers

The agent creates `src/server.ts` with a ClickUp API wrapper, Slack helper, and squad lead mapping:

```typescript
import express from "express";
import cron from "node-cron";
import crypto from "crypto";

const app = express();
app.use(express.json());

const BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN!;
const TEAM_ID = process.env.TEAM_ID!;
const SPACE_ID = process.env.SPACE_ID!;

// Reusable ClickUp API helper with error logging
async function cu(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
  return res.json();
}

// Post formatted messages to any Slack channel
async function slack(text: string, channel = "#engineering") {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  });
}

// Map task tags to squad lead Slack IDs for escalation alerts
const SQUAD_LEADS: Record<string, string> = {
  platform: process.env.SQUAD_LEAD_PLATFORM!,
  product: process.env.SQUAD_LEAD_PRODUCT!,
  mobile: process.env.SQUAD_LEAD_MOBILE!,
};

function getSquadLead(tags: string[]): string | null {
  for (const [squad, slackId] of Object.entries(SQUAD_LEADS)) {
    if (tags.some(t => t.toLowerCase().includes(squad))) return slackId;
  }
  return null;
}
```

### Step 3: Build the webhook handler for auto-status transitions

The webhook endpoint verifies ClickUp's HMAC signature, then handles three transitions: branch linked moves a task to "In Progress", PR merged moves it to "QA", and QA checklist completion moves it to "Done".

```typescript
app.post("/webhooks/clickup", async (req, res) => {
  // Verify webhook signature
  const sig = req.headers["x-signature"] as string;
  if (sig) {
    const hmac = crypto.createHmac("sha256", process.env.CLICKUP_WEBHOOK_SECRET!);
    hmac.update(JSON.stringify(req.body));
    if (hmac.digest("hex") !== sig) return res.sendStatus(401);
  }

  res.sendStatus(200); // Respond immediately, process async
  const { event, task_id, history_items } = req.body;

  try {
    if (event === "taskUpdated" && history_items) {
      for (const item of history_items) {
        // Branch linked -> "In Progress"
        if (item.field === "git_items" && item.after) {
          const task = await cu("GET", `/task/${task_id}`);
          if (task.status.status.toLowerCase() === "to do") {
            await cu("PUT", `/task/${task_id}`, { status: "in progress" });
          }
        }
        // PR merged -> "QA"
        if (item.field === "git_items" && item.after?.status === "merged") {
          await cu("PUT", `/task/${task_id}`, { status: "qa" });
        }
        // QA checklist completed -> "Done"
        if (item.field === "checklists") {
          const task = await cu("GET", `/task/${task_id}`);
          const qaItems = (task.checklists || []).flatMap((cl: any) =>
            cl.items.filter((i: any) => i.name.toLowerCase().includes("qa"))
          );
          if (qaItems.length > 0 && qaItems.every((i: any) => i.resolved)) {
            if (task.status.status.toLowerCase() === "qa") {
              await cu("PUT", `/task/${task_id}`, { status: "done" });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event} for ${task_id}:`, err);
  }
});
```

### Step 4: Add SLA enforcement with hourly checks

Urgent tasks open longer than 24 hours get tagged `sla-breach` and trigger a Slack alert to the squad lead:

```typescript
async function checkSLA(taskId: string) {
  const task = await cu("GET", `/task/${taskId}`);
  if (task.status.type === "closed" || task.priority?.id !== "1") return;

  const hoursOpen = (Date.now() - parseInt(task.date_created)) / 3600000;
  if (hoursOpen > 24) {
    const existingTags = task.tags.map((t: any) => t.name);
    if (!existingTags.includes("sla-breach")) {
      await cu("POST", `/task/${taskId}/tag/sla-breach`);
    }
    const lead = getSquadLead(existingTags);
    const mention = lead ? `<@${lead}>` : "@here";
    await slack(
      `*SLA BREACH* -- Urgent task open for ${Math.round(hoursOpen)}h\n` +
      `*${task.name}* | ${task.status.status}\n` +
      `${mention} -- please escalate | <${task.url}|View in ClickUp>`
    );
  }
}

// Check all urgent tasks every hour
cron.schedule("0 * * * *", async () => {
  const spaces = await cu("GET", `/space/${SPACE_ID}/list`);
  for (const list of spaces.lists || []) {
    const tasks = await cu("GET", `/list/${list.id}/task?statuses[]=to%20do&statuses[]=in%20progress&statuses[]=qa`);
    for (const task of tasks.tasks) {
      if (task.priority?.id === "1") await checkSLA(task.id);
    }
  }
});
```

### Step 5: Automate biweekly sprint carryover

Every Sunday at 11 PM, unfinished tasks move to the next sprint with a `carried-over` tag. The next sprint list is created automatically if it does not exist:

```typescript
cron.schedule("0 23 * * 0", async () => {
  const folders = await cu("GET", `/space/${SPACE_ID}/folder`);
  const sprintFolder = folders.folders.find((f: any) =>
    f.name.toLowerCase().includes("sprint")
  );
  if (!sprintFolder) return;

  const lists = await cu("GET", `/folder/${sprintFolder.id}/list`);
  const sorted = lists.lists.sort((a: any, b: any) =>
    parseInt(b.date_created) - parseInt(a.date_created)
  );
  const currentSprint = sorted[0];
  if (!currentSprint) return;
  if (currentSprint.due_date && parseInt(currentSprint.due_date) > Date.now()) return;

  // Create the next sprint list with a 2-week window
  const sprintNum = parseInt(currentSprint.name.match(/\d+/)?.[0] || "0") + 1;
  const nextStart = new Date();
  nextStart.setDate(nextStart.getDate() + 1);
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextEnd.getDate() + 13);

  let nextSprint = sorted.find((l: any) => l.name.includes(`Sprint ${sprintNum}`));
  if (!nextSprint) {
    nextSprint = await cu("POST", `/folder/${sprintFolder.id}/list`, {
      name: `Sprint ${sprintNum}`,
      due_date: nextEnd.getTime(),
      status: "active",
    });
  }

  // Move unfinished tasks and tag them
  const tasks = await cu("GET", `/list/${currentSprint.id}/task?include_closed=false`);
  let carriedOver = 0;
  for (const task of tasks.tasks) {
    if (task.status.type !== "closed") {
      await cu("PUT", `/task/${task.id}`, { list: nextSprint.id });
      await cu("POST", `/task/${task.id}/tag/carried-over`);
      carriedOver++;
    }
  }

  await slack(
    `*Sprint Carryover Complete*\n` +
    `Moved ${carriedOver} tasks from ${currentSprint.name} to Sprint ${sprintNum}`
  );
});
```

### Step 6: Schedule Friday time tracking audits

Every Friday at 5 PM, the server flags completed tasks with zero time logged and generates a per-person hours report:

```typescript
cron.schedule("0 17 * * 5", async () => {
  const currentSprint = await getCurrentSprint(); // Helper that finds latest sprint
  if (!currentSprint) return;

  const tasks = await cu("GET", `/list/${currentSprint.id}/task?include_closed=true`);
  const doneTasks = tasks.tasks.filter((t: any) => t.status.type === "closed");

  // Flag tasks with zero time logged
  const zeroTime = doneTasks
    .filter((t: any) => !t.time_spent || parseInt(t.time_spent) === 0)
    .map((t: any) => `- *${t.name}* -- ${t.assignees[0]?.username || "Unassigned"}`);

  if (zeroTime.length > 0) {
    await slack(
      `*Time Tracking Reminder*\n${zeroTime.length} done tasks have zero time:\n` +
      zeroTime.join("\n"), "#engineering"
    );
  }

  // Weekly hours breakdown by person
  const weekStart = Date.now() - 5 * 86400000;
  const entries = await cu("GET",
    `/team/${TEAM_ID}/time_entries?start_date=${weekStart}&end_date=${Date.now()}`
  );

  const byUser: Record<string, { total: number; billable: number }> = {};
  for (const entry of entries.data || []) {
    const user = entry.user.username;
    if (!byUser[user]) byUser[user] = { total: 0, billable: 0 };
    byUser[user].total += parseInt(entry.duration || "0");
    if (entry.billable) byUser[user].billable += parseInt(entry.duration || "0");
  }

  const lines = Object.entries(byUser)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([user, d]) =>
      `- ${user}: ${(d.total / 3600000).toFixed(1)}h total, ${(d.billable / 3600000).toFixed(1)}h billable`
    );

  await slack(`*Weekly Time Report*\n` + lines.join("\n"), "#engineering-metrics");
});
```

### Step 7: Generate Monday velocity reports

Every Monday at 9 AM, the server posts a sprint summary to Slack:

```typescript
cron.schedule("0 9 * * 1", async () => {
  const folders = await cu("GET", `/space/${SPACE_ID}/folder`);
  const sprintFolder = folders.folders.find((f: any) => f.name.toLowerCase().includes("sprint"));
  if (!sprintFolder) return;

  const lists = await cu("GET", `/folder/${sprintFolder.id}/list`);
  const sorted = lists.lists.sort((a: any, b: any) => parseInt(b.date_created) - parseInt(a.date_created));
  const lastSprint = sorted[1]; // Previous sprint
  if (!lastSprint) return;

  const allTasks = (await cu("GET", `/list/${lastSprint.id}/task?include_closed=true&subtasks=true`)).tasks;

  const completed = allTasks.filter((t: any) => t.status.type === "closed");
  const bugs = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "bug"));
  const features = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "feature"));
  const carried = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "carried-over"));

  const cycleTimes = completed
    .filter((t: any) => t.date_created && t.date_closed)
    .map((t: any) => (parseInt(t.date_closed) - parseInt(t.date_created)) / 86400000);
  const avgCycle = cycleTimes.length > 0
    ? (cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length).toFixed(1)
    : "N/A";
  const rate = allTasks.length > 0
    ? Math.round((completed.length / allTasks.length) * 100) : 0;

  await slack([
    `*Velocity Report -- ${lastSprint.name}*`,
    `*Completion:* ${completed.length}/${allTasks.length} tasks (${rate}%)`,
    `*Bug:Feature ratio:* ${bugs.length}:${features.length}`,
    `*Carried over:* ${carried.length} tasks`,
    `*Avg cycle time:* ${avgCycle} days`,
  ].join("\n"), "#engineering-metrics");
});
```

### Step 8: Deploy and register the webhook

```bash
# Build and start the server
npx tsc && node dist/server.js

# Register the webhook with ClickUp
curl -X POST "https://api.clickup.com/api/v2/team/${TEAM_ID}/webhook" \
  -H "Authorization: ${CLICKUP_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://your-server.com/webhooks/clickup",
    "events": ["taskCreated","taskUpdated","taskStatusUpdated","taskPriorityUpdated","taskTimeTrackedUpdated","taskMoved"],
    "space_id": "'${SPACE_ID}'"
  }'
```

## Real-World Example

After deploying this server, Sami's team sees immediate results. The webhook handler catches 30+ status transitions per day that developers used to forget. Sprint carryover that previously took an hour every two weeks now runs automatically on Sunday night, tagging 8-12 tasks as `carried-over` and creating the next sprint list. The Friday time audit catches 5-6 tasks per week with missing time entries before the weekend, and the Monday velocity report gives the CEO a clean breakdown: 87% completion rate, 3.2-day average cycle time, and a 2:1 feature-to-bug ratio.
