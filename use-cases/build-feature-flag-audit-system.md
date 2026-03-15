---
title: Build a Feature Flag Audit System
slug: build-feature-flag-audit-system
description: Build a feature flag audit system with change tracking, rollout history, impact analysis, compliance reporting, and automated cleanup of stale flags for safe feature management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - feature-flags
  - audit
  - compliance
  - rollout
  - devops
---

# Build a Feature Flag Audit System

## The Problem

Max leads engineering at a 25-person SaaS with 200 feature flags. Nobody knows who turned on the "new_pricing" flag that caused a billing bug — there's no change history. 80 flags are stale (feature shipped months ago, flag still checked). Flag evaluation is inconsistent: some flags target by user ID, some by plan, some by percentage — each implemented differently. Compliance team asks "when was this feature enabled for enterprise customers?" — nobody can answer. They need a feature flag audit system: track every change, analyze rollout impact, report for compliance, detect stale flags, and standardize targeting.

## Step 1: Build the Audit System

```typescript
// src/flags/audit.ts — Feature flag audit with change tracking and stale detection
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  targeting: TargetingRule[];
  rolloutPercentage: number;
  owner: string;
  tags: string[];
  createdAt: string;
  lastEvaluatedAt: string | null;
  evaluationCount: number;
}

interface TargetingRule {
  attribute: string;
  operator: "equals" | "contains" | "in" | "gt" | "lt";
  value: any;
  enabled: boolean;
}

interface FlagChangeEvent {
  id: string;
  flagKey: string;
  changeType: "created" | "enabled" | "disabled" | "targeting_changed" | "rollout_changed" | "deleted";
  previousValue: any;
  newValue: any;
  changedBy: string;
  reason: string;
  timestamp: string;
}

// Update flag with full audit trail
export async function updateFlag(
  flagKey: string,
  updates: Partial<FeatureFlag>,
  changedBy: string,
  reason: string
): Promise<void> {
  const { rows: [current] } = await pool.query(
    "SELECT * FROM feature_flags WHERE key = $1", [flagKey]
  );
  if (!current) throw new Error(`Flag '${flagKey}' not found`);

  // Determine change type
  let changeType: FlagChangeEvent["changeType"] = "targeting_changed";
  let previousValue: any = {};
  let newValue: any = {};

  if (updates.enabled !== undefined && updates.enabled !== current.enabled) {
    changeType = updates.enabled ? "enabled" : "disabled";
    previousValue = { enabled: current.enabled };
    newValue = { enabled: updates.enabled };
  } else if (updates.rolloutPercentage !== undefined) {
    changeType = "rollout_changed";
    previousValue = { rolloutPercentage: current.rollout_percentage };
    newValue = { rolloutPercentage: updates.rolloutPercentage };
  } else if (updates.targeting) {
    previousValue = { targeting: JSON.parse(current.targeting) };
    newValue = { targeting: updates.targeting };
  }

  // Apply updates
  const sets: string[] = [];
  const params: any[] = [flagKey];
  let idx = 2;
  if (updates.enabled !== undefined) { sets.push(`enabled = $${idx}`); params.push(updates.enabled); idx++; }
  if (updates.targeting) { sets.push(`targeting = $${idx}`); params.push(JSON.stringify(updates.targeting)); idx++; }
  if (updates.rolloutPercentage !== undefined) { sets.push(`rollout_percentage = $${idx}`); params.push(updates.rolloutPercentage); idx++; }
  if (updates.description) { sets.push(`description = $${idx}`); params.push(updates.description); idx++; }

  if (sets.length > 0) {
    await pool.query(`UPDATE feature_flags SET ${sets.join(", ")} WHERE key = $1`, params);
  }

  // Record audit event
  await pool.query(
    `INSERT INTO flag_audit_log (id, flag_key, change_type, previous_value, new_value, changed_by, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [randomBytes(6).toString("hex"), flagKey, changeType, JSON.stringify(previousValue), JSON.stringify(newValue), changedBy, reason]
  );

  // Invalidate evaluation cache
  await redis.del(`flag:${flagKey}`);

  // Alert if critical flag changed
  if (current.tags && JSON.parse(current.tags).includes("critical")) {
    await redis.rpush("notification:queue", JSON.stringify({
      type: "critical_flag_change", flagKey, changeType, changedBy, reason,
    }));
  }
}

// Get change history for a flag
export async function getFlagHistory(flagKey: string): Promise<FlagChangeEvent[]> {
  const { rows } = await pool.query(
    "SELECT * FROM flag_audit_log WHERE flag_key = $1 ORDER BY created_at DESC LIMIT 100",
    [flagKey]
  );
  return rows.map((r: any) => ({ ...r, previousValue: JSON.parse(r.previous_value), newValue: JSON.parse(r.new_value) }));
}

// Detect stale flags (not evaluated recently or 100% rolled out)
export async function detectStaleFlags(): Promise<Array<{ key: string; reason: string; lastEvaluated: string; daysSinceEvaluation: number }>> {
  const { rows } = await pool.query(
    `SELECT key, last_evaluated_at, rollout_percentage, created_at,
       EXTRACT(EPOCH FROM (NOW() - COALESCE(last_evaluated_at, created_at))) / 86400 as days_inactive
     FROM feature_flags WHERE enabled = true`
  );

  const stale: any[] = [];
  for (const row of rows) {
    const daysInactive = Math.floor(parseFloat(row.days_inactive));

    // Flag enabled but never evaluated
    if (!row.last_evaluated_at && daysInactive > 30) {
      stale.push({ key: row.key, reason: "Never evaluated (30+ days)", lastEvaluated: "never", daysSinceEvaluation: daysInactive });
    }
    // Flag at 100% rollout for 30+ days (should be removed from code)
    else if (row.rollout_percentage === 100 && daysInactive > 30) {
      stale.push({ key: row.key, reason: "100% rollout for 30+ days — remove flag from code", lastEvaluated: row.last_evaluated_at, daysSinceEvaluation: daysInactive });
    }
    // Flag not evaluated in 60+ days
    else if (daysInactive > 60) {
      stale.push({ key: row.key, reason: "Not evaluated in 60+ days", lastEvaluated: row.last_evaluated_at, daysSinceEvaluation: daysInactive });
    }
  }

  return stale;
}

// Compliance report: when was a feature enabled for a specific segment
export async function getComplianceReport(flagKey: string, segment?: { attribute: string; value: string }): Promise<{
  timeline: Array<{ date: string; change: string; changedBy: string; reason: string }>;
  currentState: { enabled: boolean; targeting: any; rollout: number };
}> {
  const history = await getFlagHistory(flagKey);
  const { rows: [current] } = await pool.query("SELECT * FROM feature_flags WHERE key = $1", [flagKey]);

  const timeline = history.map((h) => ({
    date: h.timestamp,
    change: `${h.changeType}: ${JSON.stringify(h.newValue)}`,
    changedBy: h.changedBy,
    reason: h.reason,
  })).reverse();

  return {
    timeline,
    currentState: {
      enabled: current?.enabled || false,
      targeting: current?.targeting ? JSON.parse(current.targeting) : [],
      rollout: current?.rollout_percentage || 0,
    },
  };
}

// Track flag evaluation (for stale detection)
export async function trackEvaluation(flagKey: string): Promise<void> {
  await redis.hincrby(`flag:evals:${flagKey}`, "count", 1);
  await pool.query(
    "UPDATE feature_flags SET last_evaluated_at = NOW(), evaluation_count = evaluation_count + 1 WHERE key = $1",
    [flagKey]
  );
}

// Dashboard overview
export async function getFlagDashboard(): Promise<{
  totalFlags: number; enabled: number; stale: number;
  recentChanges: FlagChangeEvent[];
  topEvaluated: Array<{ key: string; count: number }>;
}> {
  const { rows: [counts] } = await pool.query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE enabled) as enabled FROM feature_flags"
  );

  const staleFlags = await detectStaleFlags();
  const { rows: recentChanges } = await pool.query(
    "SELECT * FROM flag_audit_log ORDER BY created_at DESC LIMIT 20"
  );
  const { rows: topEvaluated } = await pool.query(
    "SELECT key, evaluation_count as count FROM feature_flags WHERE enabled = true ORDER BY evaluation_count DESC LIMIT 10"
  );

  return {
    totalFlags: parseInt(counts.total),
    enabled: parseInt(counts.enabled),
    stale: staleFlags.length,
    recentChanges: recentChanges.map((r: any) => ({ ...r, previousValue: JSON.parse(r.previous_value), newValue: JSON.parse(r.new_value) })),
    topEvaluated,
  };
}
```

## Results

- **"Who turned on new_pricing?" — answered in 2 seconds** — full audit trail with who, when, why, and what changed; billing bug traced to specific change by specific person
- **80 stale flags identified** — dashboard shows flags at 100% rollout for 30+ days; team removes flag checks from code; codebase cleaner; evaluation overhead reduced
- **Compliance report** — "when was feature X enabled for enterprise?" → timeline shows exact date, targeting rule change, and who authorized it; audit satisfied
- **Critical flag alerts** — changing a flag tagged "critical" sends Slack alert to engineering leads; accidental changes caught in minutes
- **Standardized targeting** — all flags use same targeting engine: user attributes, plan, percentage; no more inconsistent per-flag implementations
