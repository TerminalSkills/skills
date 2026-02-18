---
title: Automate Team Workflows with ClickUp
slug: automate-team-workflows-with-clickup
description: "Automate sprint carryover, task status updates, time tracking reports, and Slack alerts using the ClickUp API with webhooks and scheduled cron jobs."
category: project-management
skills: [clickup]
tags: [clickup, automation, webhooks, time-tracking, reporting]
---

# Automate Team Workflows with ClickUp

Sami is an engineering manager at a 40-person fintech startup. They use ClickUp for project management but everything is manual — devs forget to update task statuses, sprint carryover is done by hand every two weeks, time tracking is spotty, and there's no automated reporting. The CEO wants weekly velocity reports and the team leads want Slack alerts when tasks go overdue.

Sami needs a webhook server that automates status transitions, enforces SLAs, handles sprint carryover, and generates weekly reports — all through ClickUp's API.

## Prompt

```text
We use ClickUp for our engineering team (3 squads, ~40 people). I need to automate several workflows:

1. **Auto-status transitions**: When a developer creates a branch matching our pattern (CU-{taskId}), move the task to "In Progress". When a PR is merged, move it to "QA". When QA passes (manual checkbox in ClickUp), move to "Done".

2. **SLA enforcement**: If a task is priority "Urgent" and has been in any non-done status for more than 24 hours, escalate — add a "sla-breach" tag, notify the squad lead in Slack, and bump it to the top of the sprint list.

3. **Sprint carryover**: At the end of each 2-week sprint, automatically move unfinished tasks to the next sprint list. Add a "carried-over" tag so we can track velocity impact. Create the next sprint list if it doesn't exist.

4. **Time tracking audit**: Every Friday at 5 PM, check all "Done" tasks in the current sprint. If any has zero time tracked, post a reminder to the assignee in Slack. Generate a weekly report showing hours per person, billable vs non-billable, and tasks without estimates.

5. **Weekly velocity report**: Every Monday at 9 AM, generate a report for the past sprint showing: tasks completed vs planned, story points delivered, bug vs feature ratio, carryover count, average cycle time (from "To Do" to "Done"). Post to #engineering-metrics Slack channel.

Give me the full webhook handler and cron job code. Use Express + node-cron. Include the ClickUp API calls and Slack message formatting.
```

## Agent Response

```text
Here's the complete automation server. I'll structure it as a single Express app with webhook handlers and cron jobs.

## Project Setup

mkdir clickup-automation && cd clickup-automation
npm init -y
npm install express node-cron
npm install -D typescript @types/node @types/express
npx tsc --init

## Environment variables (.env)

CLICKUP_API_TOKEN=pk_xxxxxxxxxxxx
CLICKUP_WEBHOOK_SECRET=your_webhook_secret
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxx
TEAM_ID=your_team_id
SPACE_ID=your_space_id

# Squad lead Slack user IDs for mentions
SQUAD_LEAD_PLATFORM=U01ABC
SQUAD_LEAD_PRODUCT=U02DEF
SQUAD_LEAD_MOBILE=U03GHI

## Main server (src/server.ts)

import express from "express";
import cron from "node-cron";
import crypto from "crypto";

const app = express();
app.use(express.json());

const BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN!;
const TEAM_ID = process.env.TEAM_ID!;
const SPACE_ID = process.env.SPACE_ID!;

// --- ClickUp API helper ---

async function cu(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`ClickUp API error: ${method} ${path} → ${res.status}: ${text}`);
    throw new Error(`ClickUp ${res.status}`);
  }
  return res.json();
}

// --- Slack helper ---

async function slack(text: string, channel = "#engineering") {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  });
}

// --- Squad lead mapping ---

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

// =============================================
// 1. WEBHOOK HANDLER
// =============================================

app.post("/webhooks/clickup", async (req, res) => {
  // Verify signature
  const sig = req.headers["x-signature"] as string;
  if (sig) {
    const hmac = crypto.createHmac("sha256", process.env.CLICKUP_WEBHOOK_SECRET!);
    hmac.update(JSON.stringify(req.body));
    if (hmac.digest("hex") !== sig) return res.sendStatus(401);
  }

  res.sendStatus(200);

  const { event, task_id, history_items } = req.body;

  try {
    // --- Auto-status: branch created → In Progress ---
    if (event === "taskUpdated" && history_items) {
      for (const item of history_items) {
        // Detect when a GitHub branch is linked (custom field or via integration)
        if (item.field === "git_items" && item.after) {
          const task = await cu("GET", `/task/${task_id}`);
          if (task.status.status.toLowerCase() === "to do") {
            await cu("PUT", `/task/${task_id}`, { status: "in progress" });
            console.log(`[Auto-status] ${task_id} → In Progress (branch linked)`);
          }
        }
      }
    }

    // --- Auto-status: PR merged → QA ---
    if (event === "taskUpdated" && history_items) {
      for (const item of history_items) {
        if (item.field === "git_items" && item.after?.status === "merged") {
          await cu("PUT", `/task/${task_id}`, { status: "qa" });
          console.log(`[Auto-status] ${task_id} → QA (PR merged)`);
        }
      }
    }

    // --- SLA enforcement: urgent tasks ---
    if (event === "taskPriorityUpdated") {
      const change = history_items?.[0];
      if (change?.after?.priority === "1") {
        // Schedule SLA check for this task in 24 hours
        setTimeout(() => checkSLA(task_id), 24 * 60 * 60 * 1000);
        console.log(`[SLA] Scheduled 24h check for urgent task ${task_id}`);
      }
    }

    // --- Status: when checklist item "QA Passed" is checked → Done ---
    if (event === "taskUpdated" && history_items) {
      for (const item of history_items) {
        if (item.field === "checklists") {
          const task = await cu("GET", `/task/${task_id}`);
          // Check if all checklist items with "QA" in name are resolved
          const checklists = task.checklists || [];
          const qaItems = checklists.flatMap((cl: any) =>
            cl.items.filter((i: any) => i.name.toLowerCase().includes("qa"))
          );
          const allPassed = qaItems.length > 0 && qaItems.every((i: any) => i.resolved);
          if (allPassed && task.status.status.toLowerCase() === "qa") {
            await cu("PUT", `/task/${task_id}`, { status: "done" });
            console.log(`[Auto-status] ${task_id} → Done (QA passed)`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event} for ${task_id}:`, err);
  }
});

// =============================================
// 2. SLA ENFORCEMENT
// =============================================

async function checkSLA(taskId: string) {
  try {
    const task = await cu("GET", `/task/${taskId}`);
    const status = task.status.status.toLowerCase();

    // Skip if already done/closed
    if (status === "done" || status === "closed" || task.status.type === "closed") return;

    // Check if priority is still urgent
    if (task.priority?.id !== "1") return;

    const createdAt = parseInt(task.date_created);
    const hoursOpen = (Date.now() - createdAt) / 3600000;

    if (hoursOpen > 24) {
      // Add SLA breach tag
      const existingTags = task.tags.map((t: any) => t.name);
      if (!existingTags.includes("sla-breach")) {
        await cu("POST", `/task/${taskId}/tag/sla-breach`);
      }

      // Notify squad lead
      const lead = getSquadLead(existingTags);
      const mention = lead ? `<@${lead}>` : "@here";
      await slack(
        `🚨 *SLA BREACH* — Urgent task open for ${Math.round(hoursOpen)}h\n` +
        `*${task.name}*\n` +
        `Status: ${task.status.status} | Assignee: ${task.assignees.map((a: any) => a.username).join(", ") || "Unassigned"}\n` +
        `${mention} — please escalate\n` +
        `<${task.url}|View in ClickUp>`
      );

      console.log(`[SLA] Breach flagged: ${taskId} (${Math.round(hoursOpen)}h)`);
    }
  } catch (err) {
    console.error(`[SLA] Error checking ${taskId}:`, err);
  }
}

// Run SLA check every hour for all urgent tasks
cron.schedule("0 * * * *", async () => {
  console.log("[SLA] Running hourly urgent task check...");
  try {
    // Get all tasks in the space with priority = urgent
    const spaces = await cu("GET", `/space/${SPACE_ID}/list`);
    for (const list of (spaces.lists || [])) {
      const tasks = await cu("GET", `/list/${list.id}/task?statuses[]=to%20do&statuses[]=in%20progress&statuses[]=review&statuses[]=qa`);
      for (const task of tasks.tasks) {
        if (task.priority?.id === "1") {
          await checkSLA(task.id);
        }
      }
    }
  } catch (err) {
    console.error("[SLA] Hourly check error:", err);
  }
});

// =============================================
// 3. SPRINT CARRYOVER (every other Sunday at 23:00)
// =============================================

cron.schedule("0 23 * * 0", async () => {
  console.log("[Sprint] Checking for sprint carryover...");
  try {
    const folders = await cu("GET", `/space/${SPACE_ID}/folder`);
    const sprintFolder = folders.folders.find((f: any) => f.name.toLowerCase().includes("sprint"));
    if (!sprintFolder) return;

    const lists = await cu("GET", `/folder/${sprintFolder.id}/list`);
    const sorted = lists.lists.sort((a: any, b: any) =>
      parseInt(b.date_created) - parseInt(a.date_created)
    );

    const currentSprint = sorted[0];
    if (!currentSprint) return;

    // Check if this sprint's end date has passed (based on due_date)
    if (currentSprint.due_date && parseInt(currentSprint.due_date) > Date.now()) return;

    // Create next sprint list
    const sprintNum = parseInt(currentSprint.name.match(/\d+/)?.[0] || "0") + 1;
    const nextStart = new Date();
    nextStart.setDate(nextStart.getDate() + 1); // Tomorrow (Monday)
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + 13); // 2 weeks

    let nextSprint = sorted.find((l: any) => l.name.includes(`Sprint ${sprintNum}`));
    if (!nextSprint) {
      const created = await cu("POST", `/folder/${sprintFolder.id}/list`, {
        name: `Sprint ${sprintNum}`,
        content: `${nextStart.toISOString().split("T")[0]} — ${nextEnd.toISOString().split("T")[0]}`,
        due_date: nextEnd.getTime(),
        status: "active",
      });
      nextSprint = created;
      console.log(`[Sprint] Created Sprint ${sprintNum}`);
    }

    // Move unfinished tasks
    const tasks = await cu("GET", `/list/${currentSprint.id}/task?include_closed=false`);
    let carriedOver = 0;

    for (const task of tasks.tasks) {
      if (task.status.type !== "closed") {
        await cu("PUT", `/task/${task.id}`, { list: nextSprint.id });
        // Add carried-over tag
        await cu("POST", `/task/${task.id}/tag/carried-over`);
        carriedOver++;
      }
    }

    await slack(
      `📦 *Sprint Carryover Complete*\n` +
      `Moved ${carriedOver} unfinished tasks from ${currentSprint.name} → Sprint ${sprintNum}\n` +
      `Tagged with \`carried-over\` for tracking`,
      "#engineering"
    );

    console.log(`[Sprint] Carried over ${carriedOver} tasks to Sprint ${sprintNum}`);
  } catch (err) {
    console.error("[Sprint] Carryover error:", err);
  }
});

// =============================================
// 4. TIME TRACKING AUDIT (Fridays at 17:00)
// =============================================

cron.schedule("0 17 * * 5", async () => {
  console.log("[Time] Running Friday time tracking audit...");
  try {
    const folders = await cu("GET", `/space/${SPACE_ID}/folder`);
    const sprintFolder = folders.folders.find((f: any) => f.name.toLowerCase().includes("sprint"));
    if (!sprintFolder) return;

    const lists = await cu("GET", `/folder/${sprintFolder.id}/list`);
    const currentSprint = lists.lists.sort((a: any, b: any) =>
      parseInt(b.date_created) - parseInt(a.date_created)
    )[0];

    if (!currentSprint) return;

    const tasks = await cu("GET", `/list/${currentSprint.id}/task?include_closed=true`);
    const doneTasks = tasks.tasks.filter((t: any) => t.status.type === "closed");

    // Find tasks with zero time tracked
    const zeroTime: string[] = [];
    for (const task of doneTasks) {
      if (!task.time_spent || parseInt(task.time_spent) === 0) {
        zeroTime.push(`• *${task.name}* — ${task.assignees.map((a: any) => a.username).join(", ") || "Unassigned"}`);
      }
    }

    if (zeroTime.length > 0) {
      await slack(
        `⏱️ *Time Tracking Reminder*\n` +
        `${zeroTime.length} completed tasks have zero time tracked:\n\n` +
        zeroTime.join("\n") +
        `\n\nPlease log your time before end of day!`,
        "#engineering"
      );
    }

    // Weekly time report
    const weekStart = Date.now() - 5 * 86400000; // ~Monday
    const entries = await cu("GET",
      `/team/${TEAM_ID}/time_entries?start_date=${weekStart}&end_date=${Date.now()}`
    );

    const byUser: Record<string, { total: number; billable: number; tasks: number }> = {};
    for (const entry of entries.data || []) {
      const user = entry.user.username;
      if (!byUser[user]) byUser[user] = { total: 0, billable: 0, tasks: 0 };
      byUser[user].total += parseInt(entry.duration || "0");
      if (entry.billable) byUser[user].billable += parseInt(entry.duration || "0");
      byUser[user].tasks++;
    }

    const lines = Object.entries(byUser)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([user, d]) =>
        `• ${user}: ${(d.total / 3600000).toFixed(1)}h total, ${(d.billable / 3600000).toFixed(1)}h billable (${d.tasks} entries)`
      );

    await slack(
      `📊 *Weekly Time Report*\n\n` +
      lines.join("\n") +
      `\n\n_${zeroTime.length} tasks without time entries_`,
      "#engineering-metrics"
    );
  } catch (err) {
    console.error("[Time] Audit error:", err);
  }
});

// =============================================
// 5. VELOCITY REPORT (Mondays at 09:00)
// =============================================

cron.schedule("0 9 * * 1", async () => {
  console.log("[Velocity] Generating weekly report...");
  try {
    const folders = await cu("GET", `/space/${SPACE_ID}/folder`);
    const sprintFolder = folders.folders.find((f: any) => f.name.toLowerCase().includes("sprint"));
    if (!sprintFolder) return;

    const lists = await cu("GET", `/folder/${sprintFolder.id}/list`);
    const sorted = lists.lists.sort((a: any, b: any) =>
      parseInt(b.date_created) - parseInt(a.date_created)
    );

    // Previous sprint (just ended) is the second-most recent
    const lastSprint = sorted[1];
    if (!lastSprint) return;

    const tasks = await cu("GET", `/list/${lastSprint.id}/task?include_closed=true&subtasks=true`);
    const allTasks = tasks.tasks;

    const completed = allTasks.filter((t: any) => t.status.type === "closed");
    const planned = allTasks.length;
    const bugs = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "bug"));
    const features = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "feature"));
    const carriedOver = allTasks.filter((t: any) => t.tags.some((tag: any) => tag.name === "carried-over"));

    // Story points (using time_estimate as proxy, or custom field)
    const totalEstimate = allTasks.reduce((s: number, t: any) => s + (parseInt(t.time_estimate || "0")), 0);
    const completedEstimate = completed.reduce((s: number, t: any) => s + (parseInt(t.time_estimate || "0")), 0);

    // Average cycle time (created → closed)
    const cycleTimes = completed
      .filter((t: any) => t.date_created && t.date_closed)
      .map((t: any) => (parseInt(t.date_closed) - parseInt(t.date_created)) / 86400000);
    const avgCycleTime = cycleTimes.length > 0
      ? (cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length).toFixed(1)
      : "N/A";

    const completionRate = planned > 0 ? Math.round((completed.length / planned) * 100) : 0;

    const report = [
      `📈 *Velocity Report — ${lastSprint.name}*`,
      ``,
      `*Completion:* ${completed.length}/${planned} tasks (${completionRate}%)`,
      `*Estimated hours:* ${(completedEstimate / 3600000).toFixed(0)}h / ${(totalEstimate / 3600000).toFixed(0)}h delivered`,
      `*Bug:Feature ratio:* ${bugs.length}:${features.length}`,
      `*Carried over:* ${carriedOver.length} tasks`,
      `*Avg cycle time:* ${avgCycleTime} days`,
      ``,
      `*By priority:*`,
      `• 🔴 Urgent: ${allTasks.filter((t: any) => t.priority?.id === "1").length}`,
      `• 🟠 High: ${allTasks.filter((t: any) => t.priority?.id === "2").length}`,
      `• 🟡 Normal: ${allTasks.filter((t: any) => t.priority?.id === "3").length}`,
      `• 🔵 Low: ${allTasks.filter((t: any) => t.priority?.id === "4").length}`,
    ].join("\n");

    await slack(report, "#engineering-metrics");
    console.log("[Velocity] Report posted to Slack");
  } catch (err) {
    console.error("[Velocity] Report error:", err);
  }
});

// =============================================
// START SERVER
// =============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ClickUp automation server running on port ${PORT}`);
});

## Deployment

Build and run:

npx tsc
node dist/server.js

## Register the webhook in ClickUp

curl -X POST "https://api.clickup.com/api/v2/team/${TEAM_ID}/webhook" \
  -H "Authorization: ${CLICKUP_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://your-server.com/webhooks/clickup",
    "events": [
      "taskCreated", "taskUpdated", "taskStatusUpdated",
      "taskPriorityUpdated", "taskCommentPosted",
      "taskTimeTrackedUpdated", "taskMoved"
    ],
    "space_id": "'${SPACE_ID}'"
  }'

The server handles all five automation workflows: auto-status transitions via GitHub events, hourly SLA enforcement with Slack escalation, biweekly sprint carryover with tagging, Friday time tracking audits, and Monday velocity reports. Deploy behind nginx with SSL and you're set.
```

Skills used: `clickup`
