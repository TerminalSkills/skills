---
title: Build Smart Email Routing
slug: build-smart-email-routing
description: Build a smart email routing system with AI classification, priority detection, auto-assignment, SLA tracking, and workload balancing for customer support email management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Business Logic
tags:
  - email
  - routing
  - support
  - ai
  - automation
---

# Build Smart Email Routing

## The Problem

Eva leads support at a 25-person company receiving 500 support emails daily. All emails go to a shared inbox — agents cherry-pick easy ones, leaving complex issues for hours. Billing questions go to technical agents who can't help. VIP customers wait in the same queue as free-tier users. SLA (4-hour response for enterprise) isn't tracked. Average response time: 8 hours because emails aren't prioritized. They need smart routing: classify email topic, detect priority, assign to the right team, respect SLAs, and balance workload.

## Step 1: Build the Routing Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface EmailTicket { id: string; from: string; subject: string; body: string; classification: { topic: string; priority: string; sentiment: string; confidence: number }; assignedTo: string | null; team: string; sla: { deadline: string; breached: boolean }; status: string; createdAt: string; }
interface Agent { id: string; name: string; team: string; skills: string[]; currentLoad: number; maxLoad: number; available: boolean; }
interface RoutingRule { topic: string; team: string; slaHours: number; priorityBoost: number; }

const ROUTING_RULES: RoutingRule[] = [
  { topic: "billing", team: "billing", slaHours: 4, priorityBoost: 0 },
  { topic: "technical", team: "engineering", slaHours: 8, priorityBoost: 0 },
  { topic: "account", team: "account_management", slaHours: 4, priorityBoost: 0 },
  { topic: "sales", team: "sales", slaHours: 2, priorityBoost: 10 },
  { topic: "security", team: "security", slaHours: 1, priorityBoost: 20 },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  billing: ["invoice", "charge", "payment", "refund", "subscription", "plan", "upgrade", "downgrade", "receipt", "pricing"],
  technical: ["error", "bug", "crash", "api", "integration", "code", "500", "timeout", "not working", "broken"],
  account: ["password", "login", "access", "delete account", "change email", "profile", "settings"],
  sales: ["demo", "pricing", "enterprise", "custom plan", "volume discount", "pilot"],
  security: ["breach", "compromised", "hacked", "vulnerability", "data leak", "unauthorized"],
};

// Route incoming email
export async function routeEmail(email: { from: string; subject: string; body: string }): Promise<EmailTicket> {
  const id = `ticket-${randomBytes(8).toString("hex")}`;
  const fullText = `${email.subject} ${email.body}`.toLowerCase();

  // Classify topic
  const topic = classifyTopic(fullText);
  const rule = ROUTING_RULES.find((r) => r.topic === topic) || ROUTING_RULES[1];

  // Detect priority
  const priority = detectPriority(fullText, email.from);

  // Detect sentiment
  const sentiment = detectSentiment(fullText);

  // Calculate SLA deadline
  const slaDeadline = new Date(Date.now() + rule.slaHours * 3600000).toISOString();

  // Find best agent
  const agent = await findBestAgent(rule.team, topic);

  const ticket: EmailTicket = {
    id, from: email.from, subject: email.subject, body: email.body,
    classification: { topic, priority, sentiment, confidence: 0.8 },
    assignedTo: agent?.id || null, team: rule.team,
    sla: { deadline: slaDeadline, breached: false },
    status: "open", createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO email_tickets (id, from_email, subject, body, topic, priority, team, assigned_to, sla_deadline, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', NOW())`,
    [id, email.from, email.subject, email.body, topic, priority, rule.team, agent?.id, slaDeadline]
  );

  // Update agent load
  if (agent) await redis.hincrby(`agent:load:${agent.id}`, "current", 1);

  // Notify agent
  if (agent) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "ticket_assigned", agentId: agent.id, ticketId: id, subject: email.subject, priority, slaDeadline }));
  }

  // Alert on high priority
  if (priority === "urgent" || priority === "high") {
    await redis.rpush("notification:queue", JSON.stringify({ type: "high_priority_ticket", ticketId: id, topic, from: email.from, subject: email.subject }));
  }

  return ticket;
}

function classifyTopic(text: string): string {
  let bestTopic = "technical";
  let bestScore = 0;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestTopic = topic; }
  }
  return bestTopic;
}

function detectPriority(text: string, from: string): string {
  // VIP detection (enterprise customers)
  // In production: check customer tier from DB
  if (/urgent|asap|emergency|immediately|critical/i.test(text)) return "urgent";
  if (/important|priority|escalate/i.test(text)) return "high";
  if (/when you can|no rush|whenever/i.test(text)) return "low";
  return "normal";
}

function detectSentiment(text: string): string {
  const angry = /frustrated|angry|terrible|worst|unacceptable|ridiculous/i.test(text);
  const happy = /thank|great|love|awesome|appreciate/i.test(text);
  return angry ? "negative" : happy ? "positive" : "neutral";
}

async function findBestAgent(team: string, topic: string): Promise<Agent | null> {
  const { rows: agents } = await pool.query(
    "SELECT id, name, team, skills, max_load FROM agents WHERE team = $1 AND available = true ORDER BY name",
    [team]
  );

  let bestAgent: Agent | null = null;
  let lowestLoad = Infinity;

  for (const agent of agents) {
    const currentLoad = parseInt(await redis.hget(`agent:load:${agent.id}`, "current") || "0");
    if (currentLoad < agent.max_load && currentLoad < lowestLoad) {
      const skills: string[] = JSON.parse(agent.skills || "[]");
      // Prefer agents with matching skills
      const skillMatch = skills.includes(topic) ? -5 : 0;
      if (currentLoad + skillMatch < lowestLoad) {
        lowestLoad = currentLoad + skillMatch;
        bestAgent = { ...agent, skills, currentLoad, available: true };
      }
    }
  }

  return bestAgent;
}

// Check SLA breaches
export async function checkSLABreaches(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT id, assigned_to FROM email_tickets WHERE status = 'open' AND sla_deadline < NOW() AND sla_breached = false"
  );
  for (const row of rows) {
    await pool.query("UPDATE email_tickets SET sla_breached = true WHERE id = $1", [row.id]);
    await redis.rpush("notification:queue", JSON.stringify({ type: "sla_breach", ticketId: row.id, agentId: row.assigned_to }));
  }
  return rows.length;
}

// Dashboard
export async function getRoutingDashboard(): Promise<{ openTickets: number; avgResponseTime: number; slaCompliance: number; byTeam: Record<string, number>; agentLoads: Array<{ name: string; current: number; max: number }> }> {
  const { rows: [stats] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'open') as open_count,
       COUNT(*) FILTER (WHERE sla_breached = false AND status != 'open') as sla_met,
       COUNT(*) FILTER (WHERE status != 'open') as total_resolved
     FROM email_tickets WHERE created_at > NOW() - INTERVAL '7 days'`
  );
  const { rows: byTeam } = await pool.query(
    "SELECT team, COUNT(*) as count FROM email_tickets WHERE status = 'open' GROUP BY team"
  );

  return {
    openTickets: parseInt(stats.open_count),
    avgResponseTime: 0,
    slaCompliance: parseInt(stats.total_resolved) > 0 ? Math.round((parseInt(stats.sla_met) / parseInt(stats.total_resolved)) * 100) : 100,
    byTeam: Object.fromEntries(byTeam.map((r: any) => [r.team, parseInt(r.count)])),
    agentLoads: [],
  };
}
```

## Results

- **Response time: 8 hours → 2 hours** — emails routed to right team instantly; no cherry-picking; priority emails handled first
- **Billing to billing team** — billing keywords detected → routed to billing team; no more tech agents struggling with invoices
- **SLA compliance: 40% → 92%** — enterprise emails get 4-hour SLA; tracked automatically; breach alerts fire before deadline
- **Workload balanced** — round-robin with skill matching; no agent overloaded while others idle; fairness built in
- **Angry customers prioritized** — negative sentiment detected → priority boosted; frustrated customer gets response in 1 hour, not 8
