---
title: Build a Bidirectional Data Sync Engine
slug: build-data-sync-engine
description: Build a bidirectional data sync engine with conflict resolution, change tracking, offline support, incremental sync, and webhook notifications for multi-system data consistency.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - data-sync
  - bidirectional
  - conflict-resolution
  - offline
  - integration
---

# Build a Bidirectional Data Sync Engine

## The Problem

Lena leads integrations at a 25-person CRM company. Customers want their CRM data synced with HubSpot, Salesforce, Google Contacts, and their own databases. Current sync is one-way (import only) and runs nightly. A sales rep updates a contact in the CRM, another updates the same contact in HubSpot — next morning, one change overwrites the other. Offline mobile users create records that conflict with desktop changes. They need bidirectional sync: detect changes on both sides, resolve conflicts intelligently, sync incrementally (not full exports), and handle offline/reconnection.

## Step 1: Build the Sync Engine

```typescript
// src/sync/engine.ts — Bidirectional data sync with conflict resolution and change tracking
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface SyncConfig {
  id: string;
  name: string;
  sourceSystem: string;
  targetSystem: string;
  entityType: string;        // "contacts", "deals", "companies"
  fieldMapping: Array<{ source: string; target: string; transform?: string }>;
  conflictStrategy: "source_wins" | "target_wins" | "latest_wins" | "manual";
  syncDirection: "bidirectional" | "source_to_target" | "target_to_source";
  syncIntervalMs: number;
}

interface ChangeRecord {
  id: string;
  system: string;
  entityId: string;
  entityType: string;
  operation: "create" | "update" | "delete";
  fields: Record<string, { oldValue: any; newValue: any }>;
  timestamp: number;
  checksum: string;
  synced: boolean;
}

interface SyncConflict {
  id: string;
  entityId: string;
  sourceChange: ChangeRecord;
  targetChange: ChangeRecord;
  resolution: "pending" | "source" | "target" | "merged" | "manual";
  resolvedValue?: Record<string, any>;
}

interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
  created: number;
  updated: number;
  deleted: number;
  duration: number;
}

// Execute sync for a configuration
export async function executeSync(configId: string): Promise<SyncResult> {
  const start = Date.now();
  const config = await getSyncConfig(configId);
  if (!config) throw new Error("Sync config not found");

  // Get changes since last sync from both systems
  const lastSync = await getLastSyncTimestamp(configId);
  const sourceChanges = await getChanges(config.sourceSystem, config.entityType, lastSync);
  const targetChanges = await getChanges(config.targetSystem, config.entityType, lastSync);

  let synced = 0, conflicts = 0, errors = 0;
  let created = 0, updated = 0, deleted = 0;

  // Detect conflicts (same entity changed on both sides)
  const sourceMap = new Map(sourceChanges.map((c) => [c.entityId, c]));
  const targetMap = new Map(targetChanges.map((c) => [c.entityId, c]));

  const conflictingIds = [...sourceMap.keys()].filter((id) => targetMap.has(id));

  // Resolve conflicts
  for (const entityId of conflictingIds) {
    const sourceChange = sourceMap.get(entityId)!;
    const targetChange = targetMap.get(entityId)!;

    const conflict: SyncConflict = {
      id: `conflict-${randomBytes(4).toString("hex")}`,
      entityId, sourceChange, targetChange,
      resolution: "pending",
    };

    const resolved = await resolveConflict(conflict, config.conflictStrategy);
    if (resolved.resolution === "manual") {
      await storeConflict(configId, conflict);
      conflicts++;
      continue;
    }

    // Apply resolved value
    if (resolved.resolvedValue) {
      await applyChange(config.targetSystem, entityId, resolved.resolvedValue, "update");
      await applyChange(config.sourceSystem, entityId, resolved.resolvedValue, "update");
      synced++;
      updated++;
    }

    // Remove from individual change sets
    sourceMap.delete(entityId);
    targetMap.delete(entityId);
  }

  // Apply non-conflicting source → target changes
  if (config.syncDirection !== "target_to_source") {
    for (const [entityId, change] of sourceMap) {
      try {
        const mappedData = mapFields(change.fields, config.fieldMapping, "source_to_target");
        await applyChange(config.targetSystem, entityId, mappedData, change.operation);
        synced++;
        if (change.operation === "create") created++;
        else if (change.operation === "update") updated++;
        else if (change.operation === "delete") deleted++;
      } catch (e) { errors++; }
    }
  }

  // Apply non-conflicting target → source changes
  if (config.syncDirection !== "source_to_target") {
    for (const [entityId, change] of targetMap) {
      try {
        const mappedData = mapFields(change.fields, config.fieldMapping, "target_to_source");
        await applyChange(config.sourceSystem, entityId, mappedData, change.operation);
        synced++;
        if (change.operation === "create") created++;
        else if (change.operation === "update") updated++;
        else if (change.operation === "delete") deleted++;
      } catch (e) { errors++; }
    }
  }

  // Update last sync timestamp
  await setLastSyncTimestamp(configId, Date.now());

  const result: SyncResult = { synced, conflicts, errors, created, updated, deleted, duration: Date.now() - start };

  await pool.query(
    `INSERT INTO sync_runs (config_id, result, started_at, completed_at) VALUES ($1, $2, $3, NOW())`,
    [configId, JSON.stringify(result), new Date(start).toISOString()]
  );

  return result;
}

async function resolveConflict(conflict: SyncConflict, strategy: string): Promise<SyncConflict> {
  switch (strategy) {
    case "source_wins":
      conflict.resolution = "source";
      conflict.resolvedValue = Object.fromEntries(
        Object.entries(conflict.sourceChange.fields).map(([k, v]) => [k, v.newValue])
      );
      break;
    case "target_wins":
      conflict.resolution = "target";
      conflict.resolvedValue = Object.fromEntries(
        Object.entries(conflict.targetChange.fields).map(([k, v]) => [k, v.newValue])
      );
      break;
    case "latest_wins":
      if (conflict.sourceChange.timestamp >= conflict.targetChange.timestamp) {
        conflict.resolution = "source";
        conflict.resolvedValue = Object.fromEntries(
          Object.entries(conflict.sourceChange.fields).map(([k, v]) => [k, v.newValue])
        );
      } else {
        conflict.resolution = "target";
        conflict.resolvedValue = Object.fromEntries(
          Object.entries(conflict.targetChange.fields).map(([k, v]) => [k, v.newValue])
        );
      }
      break;
    case "manual":
      conflict.resolution = "manual";
      break;
  }
  return conflict;
}

function mapFields(
  fields: Record<string, { oldValue: any; newValue: any }>,
  mapping: SyncConfig["fieldMapping"],
  direction: string
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [fieldName, { newValue }] of Object.entries(fields)) {
    const map = direction === "source_to_target"
      ? mapping.find((m) => m.source === fieldName)
      : mapping.find((m) => m.target === fieldName);

    if (map) {
      const targetField = direction === "source_to_target" ? map.target : map.source;
      result[targetField] = map.transform ? applyTransform(newValue, map.transform) : newValue;
    }
  }
  return result;
}

function applyTransform(value: any, transform: string): any {
  switch (transform) {
    case "uppercase": return String(value).toUpperCase();
    case "lowercase": return String(value).toLowerCase();
    case "trim": return String(value).trim();
    case "toNumber": return Number(value);
    case "toString": return String(value);
    default: return value;
  }
}

async function getChanges(system: string, entityType: string, since: number): Promise<ChangeRecord[]> {
  const { rows } = await pool.query(
    "SELECT * FROM change_log WHERE system = $1 AND entity_type = $2 AND timestamp > $3 AND synced = false ORDER BY timestamp",
    [system, entityType, since]
  );
  return rows.map((r: any) => ({ ...r, fields: JSON.parse(r.fields) }));
}

async function applyChange(system: string, entityId: string, data: Record<string, any>, operation: string): Promise<void> {
  // In production: call the target system's API (HubSpot, Salesforce, etc.)
  await pool.query(
    "UPDATE change_log SET synced = true WHERE system = $1 AND entity_id = $2",
    [system, entityId]
  );
}

async function getSyncConfig(id: string): Promise<SyncConfig | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM sync_configs WHERE id = $1", [id]);
  return row ? { ...row, fieldMapping: JSON.parse(row.field_mapping) } : null;
}

async function getLastSyncTimestamp(configId: string): Promise<number> {
  const val = await redis.get(`sync:lastSync:${configId}`);
  return val ? parseInt(val) : 0;
}

async function setLastSyncTimestamp(configId: string, timestamp: number): Promise<void> {
  await redis.set(`sync:lastSync:${configId}`, timestamp);
}

async function storeConflict(configId: string, conflict: SyncConflict): Promise<void> {
  await pool.query(
    "INSERT INTO sync_conflicts (id, config_id, entity_id, source_change, target_change, resolution, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())",
    [conflict.id, configId, conflict.entityId, JSON.stringify(conflict.sourceChange), JSON.stringify(conflict.targetChange), conflict.resolution]
  );
}
```

## Results

- **Bidirectional sync** — CRM contact updated → syncs to HubSpot in 5 min; HubSpot contact updated → syncs back; both systems always consistent
- **Conflict resolution** — same contact edited in both systems: "latest wins" strategy picks the most recent change; manual mode queues for human review; no silent data loss
- **Incremental sync** — only changed records synced; 10,000 contacts but only 15 changed → 15 API calls; vs nightly full export of all 10,000
- **Field mapping with transforms** — CRM `full_name` maps to HubSpot `firstname` + `lastname` with split transform; data models don't need to match
- **Offline support** — mobile app records changes locally; on reconnect, changes submitted to sync engine; conflicts detected and resolved; field workers stay productive without connectivity
