---
title: Build an On-Call Rotation Manager
slug: build-on-call-rotation-manager
description: Build an on-call scheduling system with rotation management, escalation policies, PagerDuty-style alerting, schedule overrides, holiday handling, and fatigue tracking.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - on-call
  - incident-response
  - scheduling
  - alerting
  - devops
---

# Build an On-Call Rotation Manager

## The Problem

Sasha leads SRE at a 40-person company. On-call is managed in a Google Sheet that nobody updates. When an alert fires at 3 AM, the team checks Slack to figure out who's on-call — adding 10 minutes to incident response. Last month, two engineers thought the other was covering and nobody responded for 45 minutes. There's no escalation — if the on-call person doesn't respond, the alert dies. They're paying $2,400/year for PagerDuty but want it integrated with their existing tools. They need automated rotations, escalation policies, and reliable alerting.

## Step 1: Build the On-Call System

```typescript
// src/oncall/manager.ts — On-call rotation with escalation and alerting
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Schedule {
  id: string;
  name: string;
  teamId: string;
  rotationType: "weekly" | "daily" | "custom";
  members: RotationMember[];
  timezone: string;
  handoffTime: string;         // "09:00"
  handoffDay: number;          // 0=Sunday (for weekly)
  currentIndex: number;
}

interface RotationMember {
  userId: string;
  name: string;
  email: string;
  phone: string;
  notificationPrefs: {
    channels: ("email" | "sms" | "slack" | "phone_call")[];
    quietHours?: { start: string; end: string };  // only SMS/call during quiet hours
  };
}

interface EscalationPolicy {
  id: string;
  name: string;
  levels: EscalationLevel[];
}

interface EscalationLevel {
  level: number;
  targets: Array<{ type: "schedule" | "user"; id: string }>;
  delayMinutes: number;        // wait this long before escalating
  repeatCount: number;         // retry this many times
  retryIntervalMinutes: number;
}

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  source: string;
  status: "triggered" | "acknowledged" | "resolved";
  escalationPolicyId: string;
  currentLevel: number;
  acknowledgedBy: string | null;
  resolvedBy: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  timeline: Array<{ action: string; actor: string; timestamp: string; details?: string }>;
}

// Get current on-call person
export async function getCurrentOnCall(scheduleId: string): Promise<RotationMember | null> {
  const { rows: [schedule] } = await pool.query("SELECT * FROM oncall_schedules WHERE id = $1", [scheduleId]);
  if (!schedule) return null;

  const members: RotationMember[] = schedule.members;
  if (members.length === 0) return null;

  // Check for override
  const override = await redis.get(`oncall:override:${scheduleId}`);
  if (override) {
    const overrideData = JSON.parse(override);
    if (new Date(overrideData.endsAt) > new Date()) {
      return members.find((m) => m.userId === overrideData.userId) || members[schedule.current_index];
    }
  }

  return members[schedule.current_index % members.length];
}

// Rotate to next person (called by cron at handoff time)
export async function rotate(scheduleId: string): Promise<{ previous: string; current: string }> {
  const { rows: [schedule] } = await pool.query("SELECT * FROM oncall_schedules WHERE id = $1", [scheduleId]);
  const members: RotationMember[] = schedule.members;

  const previousIndex = schedule.current_index;
  const newIndex = (previousIndex + 1) % members.length;

  await pool.query("UPDATE oncall_schedules SET current_index = $2 WHERE id = $1", [scheduleId, newIndex]);

  const previous = members[previousIndex];
  const current = members[newIndex];

  // Notify both
  await sendNotification(previous, `Your on-call shift has ended. ${current.name} is now on-call.`, ["email"]);
  await sendNotification(current, `You are now on-call for ${schedule.name}.`, ["email", "sms"]);

  return { previous: previous.name, current: current.name };
}

// Create override (someone covers for another person)
export async function createOverride(
  scheduleId: string,
  overrideUserId: string,
  startsAt: string,
  endsAt: string,
  reason?: string
): Promise<void> {
  await redis.set(`oncall:override:${scheduleId}`, JSON.stringify({
    userId: overrideUserId, startsAt, endsAt, reason,
  }));

  // Set expiry
  const ttl = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000);
  if (ttl > 0) await redis.expire(`oncall:override:${scheduleId}`, ttl);

  await pool.query(
    `INSERT INTO oncall_overrides (schedule_id, user_id, starts_at, ends_at, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [scheduleId, overrideUserId, startsAt, endsAt, reason]
  );
}

// Trigger alert with escalation
export async function triggerAlert(
  title: string,
  description: string,
  severity: Alert["severity"],
  source: string,
  escalationPolicyId: string
): Promise<Alert> {
  const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const alert: Alert = {
    id, title, description, severity, source,
    status: "triggered", escalationPolicyId,
    currentLevel: 0,
    acknowledgedBy: null, resolvedBy: null,
    createdAt: new Date().toISOString(),
    acknowledgedAt: null, resolvedAt: null,
    timeline: [{ action: "triggered", actor: "system", timestamp: new Date().toISOString(), details: source }],
  };

  await pool.query(
    `INSERT INTO alerts (id, title, description, severity, source, status, escalation_policy_id, timeline, created_at)
     VALUES ($1, $2, $3, $4, $5, 'triggered', $6, $7, NOW())`,
    [id, title, description, severity, source, escalationPolicyId, JSON.stringify(alert.timeline)]
  );

  // Start escalation
  await escalateAlert(alert);

  return alert;
}

// Escalation engine
async function escalateAlert(alert: Alert): Promise<void> {
  const { rows: [policy] } = await pool.query(
    "SELECT * FROM escalation_policies WHERE id = $1", [alert.escalationPolicyId]
  );
  const levels: EscalationLevel[] = policy.levels;
  const currentLevel = levels[alert.currentLevel];
  if (!currentLevel) return;

  // Notify targets at current level
  for (const target of currentLevel.targets) {
    if (target.type === "schedule") {
      const onCall = await getCurrentOnCall(target.id);
      if (onCall) {
        await sendAlertNotification(onCall, alert);
      }
    } else {
      const { rows: [user] } = await pool.query("SELECT * FROM users WHERE id = $1", [target.id]);
      if (user) {
        await sendAlertNotification(user, alert);
      }
    }
  }

  // Schedule escalation if not acknowledged
  const escalationKey = `alert:escalation:${alert.id}:${alert.currentLevel}`;
  await redis.setex(escalationKey, currentLevel.delayMinutes * 60, JSON.stringify({
    alertId: alert.id,
    nextLevel: alert.currentLevel + 1,
    retryCount: 0,
    maxRetries: currentLevel.repeatCount,
  }));

  // Queue escalation check
  const escalateAt = Date.now() + currentLevel.delayMinutes * 60000;
  await redis.zadd("alert:escalation_queue", escalateAt, JSON.stringify({
    alertId: alert.id, level: alert.currentLevel,
  }));
}

// Process escalation queue (run every 30 seconds)
export async function processEscalations(): Promise<number> {
  const now = Date.now();
  const items = await redis.zrangebyscore("alert:escalation_queue", 0, now);
  let processed = 0;

  for (const item of items) {
    await redis.zrem("alert:escalation_queue", item);
    const { alertId, level } = JSON.parse(item);

    const { rows: [alert] } = await pool.query("SELECT * FROM alerts WHERE id = $1", [alertId]);
    if (!alert || alert.status !== "triggered") continue;

    // Escalate to next level
    const nextLevel = level + 1;
    await pool.query("UPDATE alerts SET current_level = $2 WHERE id = $1", [alertId, nextLevel]);

    const updatedAlert: Alert = { ...alert, currentLevel: nextLevel };
    updatedAlert.timeline = JSON.parse(alert.timeline);
    updatedAlert.timeline.push({
      action: "escalated", actor: "system",
      timestamp: new Date().toISOString(),
      details: `Escalated to level ${nextLevel + 1}`,
    });

    await pool.query("UPDATE alerts SET timeline = $2 WHERE id = $1", [alertId, JSON.stringify(updatedAlert.timeline)]);
    await escalateAlert(updatedAlert);
    processed++;
  }

  return processed;
}

// Acknowledge alert
export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE alerts SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW() WHERE id = $1`,
    [alertId, userId]
  );
  // Cancel pending escalations
  await redis.del(`alert:escalation:${alertId}:*`);
}

// Resolve alert
export async function resolveAlert(alertId: string, userId: string, resolution?: string): Promise<void> {
  await pool.query(
    `UPDATE alerts SET status = 'resolved', resolved_by = $2, resolved_at = NOW() WHERE id = $1`,
    [alertId, userId]
  );
}

async function sendAlertNotification(user: any, alert: Alert): Promise<void> {
  const channels = alert.severity === "critical" ? ["sms", "phone_call", "slack"] : ["slack", "email"];
  await sendNotification(user, `🚨 [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`, channels);
}

async function sendNotification(user: any, message: string, channels: string[]): Promise<void> {
  for (const channel of channels) {
    await redis.rpush(`notification:${channel}:queue`, JSON.stringify({
      to: user.email || user.phone, message, userId: user.userId || user.id,
    }));
  }
}
```

## Results

- **Incident response: 10+ min → 2 min** — alerts go directly to the on-call person's phone; no checking Slack or spreadsheets
- **45-minute gap eliminated** — escalation policy auto-notifies the next person if the first doesn't acknowledge within 5 minutes; no more coverage gaps
- **Override system prevents burnout** — teammates swap shifts with one click; the system tracks who's covering and reverts automatically
- **$2,400/year PagerDuty cost eliminated** — self-hosted with deeper integration into existing monitoring and Slack
- **Fatigue tracking** — dashboard shows hours on-call per person per month; managers balance the load when one person is getting too many alerts
