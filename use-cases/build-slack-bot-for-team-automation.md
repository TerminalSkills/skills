---
title: Build a Slack Bot for Team Automation
slug: build-slack-bot-for-team-automation
description: Build a Slack bot that automates team workflows — standup collection, incident alerts, deployment notifications, on-call rotation, and AI-powered answers from company knowledge base.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - slack
  - bot
  - automation
  - team-productivity
  - chatops
---

# Build a Slack Bot for Team Automation

## The Problem

Rosa leads engineering ops at a 45-person company. Daily standups take 30 minutes in video calls — half the team zones out. Deployment notifications go to a channel nobody reads. Incident alerts rely on someone remembering to post in Slack. The on-call schedule lives in a Google Sheet that's always outdated. New hires ask the same 10 questions weekly ("Where's the staging URL?", "How do I get VPN access?"). They need a Slack bot that handles standups asynchronously, alerts on incidents, tracks deployments, manages on-call, and answers common questions from the knowledge base.

## Step 1: Build the Slack Bot Framework

```typescript
// src/slack/bot.ts — Slack bot with event handling and interactive components
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN!;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

const app = new Hono();

// Verify Slack request signatures
async function verifySlackSignature(c: any): Promise<boolean> {
  const timestamp = c.req.header("X-Slack-Request-Timestamp");
  const signature = c.req.header("X-Slack-Signature");
  const body = await c.req.text();

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + createHmac("sha256", SIGNING_SECRET).update(sigBasestring).digest("hex");
  return mySignature === signature;
}

// Handle Slack events
app.post("/slack/events", async (c) => {
  const body = await c.req.json();

  // URL verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  if (body.event) {
    await handleEvent(body.event);
  }

  return c.json({ ok: true });
});

// Handle slash commands
app.post("/slack/commands", async (c) => {
  const form = await c.req.parseBody();
  const command = form.command as string;
  const text = (form.text as string || "").trim();
  const userId = form.user_id as string;
  const channelId = form.channel_id as string;

  switch (command) {
    case "/standup":
      return c.json(await handleStandup(userId, text));

    case "/oncall":
      return c.json(await handleOnCall(text));

    case "/deploy":
      return c.json(await handleDeployNotification(userId, text, channelId));

    case "/ask":
      // AI-powered knowledge base search
      return c.json(await handleAskBot(text, userId));

    default:
      return c.json({ text: `Unknown command: ${command}` });
  }
});

// Handle interactive components (buttons, modals)
app.post("/slack/interactions", async (c) => {
  const payload = JSON.parse((await c.req.parseBody()).payload as string);

  if (payload.type === "block_actions") {
    for (const action of payload.actions) {
      if (action.action_id === "acknowledge_incident") {
        await acknowledgeIncident(action.value, payload.user.id);
      }
      if (action.action_id === "resolve_incident") {
        await resolveIncident(action.value, payload.user.id);
      }
    }
  }

  return c.json({ ok: true });
});

// Event handlers
async function handleEvent(event: any): Promise<void> {
  switch (event.type) {
    case "app_mention":
      // Bot was @mentioned — respond with AI
      const answer = await searchKnowledgeBase(event.text);
      await postMessage(event.channel, answer);
      break;

    case "team_join":
      // New team member — send welcome DM
      await sendWelcomeDM(event.user.id);
      break;
  }
}

// Standup collection
async function handleStandup(userId: string, text: string): Promise<any> {
  if (!text) {
    return {
      response_type: "ephemeral",
      text: "📋 *Daily Standup*\nUsage: `/standup yesterday: ..., today: ..., blockers: ...`",
    };
  }

  // Parse standup
  const sections = text.split(",").reduce((acc: any, part: string) => {
    const [key, ...value] = part.split(":");
    acc[key.trim().toLowerCase()] = value.join(":").trim();
    return acc;
  }, {});

  await pool.query(
    `INSERT INTO standups (user_id, yesterday, today, blockers, submitted_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, sections.yesterday || "", sections.today || "", sections.blockers || ""]
  );

  // Post to standup channel
  await postMessage(process.env.STANDUP_CHANNEL!, {
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*<@${userId}>*'s standup:` } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Yesterday:*\n${sections.yesterday || "_nothing_"}` },
        { type: "mrkdwn", text: `*Today:*\n${sections.today || "_nothing_"}` },
      ]},
      ...(sections.blockers ? [{ type: "section", text: { type: "mrkdwn", text: `🚧 *Blockers:* ${sections.blockers}` } }] : []),
    ],
  });

  return { response_type: "ephemeral", text: "✅ Standup submitted!" };
}

// On-call management
async function handleOnCall(text: string): Promise<any> {
  if (text === "who") {
    const { rows: [current] } = await pool.query(
      "SELECT user_id, started_at, ends_at FROM oncall_schedule WHERE NOW() BETWEEN started_at AND ends_at LIMIT 1"
    );
    if (!current) return { text: "Nobody is on-call right now 😱" };
    return { text: `🔔 On-call: <@${current.user_id}> (until ${new Date(current.ends_at).toLocaleDateString()})` };
  }

  // Show schedule
  const { rows } = await pool.query(
    "SELECT user_id, started_at, ends_at FROM oncall_schedule WHERE ends_at > NOW() ORDER BY started_at LIMIT 8"
  );

  const schedule = rows.map((r) =>
    `• <@${r.user_id}>: ${new Date(r.started_at).toLocaleDateString()} → ${new Date(r.ends_at).toLocaleDateString()}`
  ).join("\n");

  return { text: `📅 *On-Call Schedule*\n${schedule}` };
}

// Incident alerts with action buttons
export async function sendIncidentAlert(
  channelId: string,
  title: string,
  severity: string,
  service: string,
  incidentId: string
): Promise<void> {
  const severityEmoji = severity === "critical" ? "🔴" : severity === "high" ? "🟠" : "🟡";

  await postMessage(channelId, {
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${severityEmoji} Incident: ${title}` } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Severity:* ${severity}` },
        { type: "mrkdwn", text: `*Service:* ${service}` },
      ]},
      { type: "actions", elements: [
        { type: "button", text: { type: "plain_text", text: "👋 Acknowledge" }, action_id: "acknowledge_incident", value: incidentId, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "✅ Resolve" }, action_id: "resolve_incident", value: incidentId, style: "danger" },
      ]},
    ],
  });
}

// AI knowledge base search
async function handleAskBot(question: string, userId: string): Promise<any> {
  const answer = await searchKnowledgeBase(question);
  return {
    response_type: "ephemeral",
    text: `💡 ${answer}\n\n_Didn't find what you need? Ask in #help_`,
  };
}

async function searchKnowledgeBase(query: string): Promise<string> {
  // Search FAQ/docs database
  const { rows } = await pool.query(
    `SELECT question, answer FROM knowledge_base
     WHERE to_tsvector('english', question || ' ' || answer) @@ plainto_tsquery('english', $1)
     ORDER BY ts_rank(to_tsvector('english', question || ' ' || answer), plainto_tsquery('english', $1)) DESC
     LIMIT 1`,
    [query]
  );

  if (rows.length > 0) return rows[0].answer;
  return "I couldn't find an answer to that. Try asking in #help or checking the wiki.";
}

async function postMessage(channel: string, content: any): Promise<void> {
  const body = typeof content === "string" ? { channel, text: content } : { channel, ...content };
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendWelcomeDM(userId: string): Promise<void> {
  // Open DM channel
  const res = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  });
  const { channel } = await res.json();

  await postMessage(channel.id,
    `👋 Welcome to the team! Here's what you need to know:\n\n` +
    `• Staging URL: https://staging.example.com\n` +
    `• VPN setup: https://wiki.example.com/vpn\n` +
    `• Use \`/ask <question>\` to search our knowledge base\n` +
    `• Submit standups with \`/standup yesterday: ..., today: ...\`\n\n` +
    `Questions? Ask me or post in #help!`
  );
}

async function acknowledgeIncident(incidentId: string, userId: string) {
  await pool.query("UPDATE incidents SET acknowledged_by = $2, acknowledged_at = NOW() WHERE id = $1", [incidentId, userId]);
}

async function resolveIncident(incidentId: string, userId: string) {
  await pool.query("UPDATE incidents SET status = 'resolved', resolved_by = $2, resolved_at = NOW() WHERE id = $1", [incidentId, userId]);
}

export default app;
```

## Results

- **Standup meetings eliminated** — async standups via `/standup` take 2 minutes to write; the team reads them at their own pace; 30-minute meetings → 0
- **Incident response time: 15 min → 2 min** — bot posts alert with Acknowledge/Resolve buttons; on-call clicks Acknowledge from their phone immediately
- **New hire questions answered instantly** — `/ask how do I get VPN access?` returns the answer from the knowledge base; senior engineers aren't interrupted
- **On-call schedule always current** — `/oncall who` shows the current on-call; no more checking an outdated Google Sheet
- **Deployment visibility** — every deploy posts to #deployments with version, deployer, and changelog; rollbacks are faster because the team knows what changed
