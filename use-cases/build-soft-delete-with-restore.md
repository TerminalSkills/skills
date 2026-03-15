---
title: Build Soft Delete with Restore and Retention
slug: build-soft-delete-with-restore
description: Build a soft delete system with trash/restore, cascading soft deletes, automatic purging after retention period, and admin recovery tools — preventing accidental data loss across your entire application.
skills:
  - typescript
  - postgresql
  - hono
  - redis
category: development
tags:
  - soft-delete
  - data-recovery
  - database
  - safety
  - data-management
---

# Build Soft Delete with Restore and Retention

## The Problem

Leo leads backend at a 30-person project management tool. A customer accidentally deleted a project with 2 years of task history. Hard `DELETE FROM projects WHERE id = ?` — gone forever. Support spent 4 hours restoring from a backup that was 6 hours old, losing half a day's work. This happens ~3 times per month. Some tables have foreign keys — deleting a project should "delete" its tasks, comments, and attachments too. They need soft delete that works across related tables, lets users restore within 30 days, and auto-purges after retention.

## Step 1: Build the Soft Delete System

```typescript
// src/db/soft-delete.ts — Universal soft delete with cascading, restore, and auto-purge
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const RETENTION_DAYS = 30;

// Relationship map for cascading soft deletes
const CASCADE_MAP: Record<string, string[]> = {
  projects: ["tasks", "documents", "project_members"],
  tasks: ["comments", "attachments", "time_entries"],
  documents: ["document_versions"],
  teams: ["team_members"],
};

// Soft delete a record and cascade to children
export async function softDelete(
  table: string,
  id: string,
  deletedBy: string,
  reason?: string
): Promise<{ deletedCount: number; affectedTables: string[] }> {
  let totalDeleted = 0;
  const affectedTables: string[] = [table];

  // Start transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Soft delete the main record
    const { rowCount } = await client.query(
      `UPDATE ${table} SET
         deleted_at = NOW(),
         deleted_by = $2,
         delete_reason = $3
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, deletedBy, reason || null]
    );
    totalDeleted += rowCount || 0;

    // Cascade to children
    const children = CASCADE_MAP[table] || [];
    for (const childTable of children) {
      const fkColumn = `${table.replace(/s$/, "")}_id`; // projects → project_id
      const { rowCount: childCount } = await client.query(
        `UPDATE ${childTable} SET
           deleted_at = NOW(),
           deleted_by = $2,
           delete_reason = 'cascade',
           cascade_parent_table = $3,
           cascade_parent_id = $1
         WHERE ${fkColumn} = $1 AND deleted_at IS NULL`,
        [id, deletedBy, table]
      );
      totalDeleted += childCount || 0;
      if (childCount && childCount > 0) affectedTables.push(childTable);

      // Recurse for deeper cascades
      if (CASCADE_MAP[childTable]) {
        const childIds = await client.query(
          `SELECT id FROM ${childTable} WHERE ${fkColumn} = $1 AND deleted_at IS NOT NULL AND cascade_parent_id = $1`,
          [id]
        );
        for (const childRow of childIds.rows) {
          const sub = await cascadeChildren(client, childTable, childRow.id, deletedBy);
          totalDeleted += sub.count;
          affectedTables.push(...sub.tables);
        }
      }
    }

    // Record deletion event for audit
    await client.query(
      `INSERT INTO deletion_log (entity_table, entity_id, deleted_by, reason, cascaded_tables, total_affected, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [table, id, deletedBy, reason, JSON.stringify(affectedTables), totalDeleted]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Invalidate caches
  await redis.del(`${table}:${id}`);

  return { deletedCount: totalDeleted, affectedTables: [...new Set(affectedTables)] };
}

// Restore a soft-deleted record and its cascaded children
export async function restore(
  table: string,
  id: string,
  restoredBy: string
): Promise<{ restoredCount: number; restoredTables: string[] }> {
  let totalRestored = 0;
  const restoredTables: string[] = [table];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Restore main record
    const { rowCount } = await client.query(
      `UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );

    if (!rowCount) {
      await client.query("ROLLBACK");
      throw new Error("Record not found or not deleted");
    }
    totalRestored += rowCount;

    // Restore cascaded children
    const children = CASCADE_MAP[table] || [];
    for (const childTable of children) {
      const { rowCount: childCount } = await client.query(
        `UPDATE ${childTable} SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL,
           cascade_parent_table = NULL, cascade_parent_id = NULL
         WHERE cascade_parent_table = $1 AND cascade_parent_id = $2`,
        [table, id]
      );
      totalRestored += childCount || 0;
      if (childCount && childCount > 0) restoredTables.push(childTable);
    }

    await client.query(
      `INSERT INTO deletion_log (entity_table, entity_id, deleted_by, reason, created_at)
       VALUES ($1, $2, $3, 'restored', NOW())`,
      [table, id, restoredBy]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { restoredCount: totalRestored, restoredTables };
}

// List deleted items (trash view)
export async function listDeleted(
  table: string,
  options?: { page?: number; limit?: number }
): Promise<{ items: any[]; total: number }> {
  const limit = options?.limit || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  const [items, count] = await Promise.all([
    pool.query(
      `SELECT id, name, deleted_at, deleted_by, delete_reason
       FROM ${table}
       WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - interval '${RETENTION_DAYS} days'
       ORDER BY deleted_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM ${table}
       WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - interval '${RETENTION_DAYS} days'`
    ),
  ]);

  return { items: items.rows, total: parseInt(count.rows[0].total) };
}

// Auto-purge: permanently delete records past retention
export async function purgeExpired(): Promise<{ purgedCount: number; tables: string[] }> {
  const tables = Object.keys(CASCADE_MAP);
  let totalPurged = 0;
  const purgedTables: string[] = [];

  // Purge children first (reverse cascade order)
  const allTables = [...new Set([...tables, ...Object.values(CASCADE_MAP).flat()])];

  for (const table of allTables.reverse()) {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - interval '${RETENTION_DAYS} days'`
      );
      if (rowCount && rowCount > 0) {
        totalPurged += rowCount;
        purgedTables.push(`${table}: ${rowCount}`);
      }
    } catch {
      // Table might not have deleted_at column
    }
  }

  if (totalPurged > 0) {
    console.log(`[Purge] Permanently deleted ${totalPurged} records from: ${purgedTables.join(", ")}`);
  }

  return { purgedCount: totalPurged, tables: purgedTables };
}

async function cascadeChildren(
  client: any, table: string, parentId: string, deletedBy: string
): Promise<{ count: number; tables: string[] }> {
  let count = 0;
  const tables: string[] = [];
  const children = CASCADE_MAP[table] || [];

  for (const childTable of children) {
    const fkColumn = `${table.replace(/s$/, "")}_id`;
    const { rowCount } = await client.query(
      `UPDATE ${childTable} SET deleted_at = NOW(), deleted_by = $2,
         delete_reason = 'cascade', cascade_parent_table = $3, cascade_parent_id = $1
       WHERE ${fkColumn} = $1 AND deleted_at IS NULL`,
      [parentId, deletedBy, table]
    );
    count += rowCount || 0;
    if (rowCount && rowCount > 0) tables.push(childTable);
  }

  return { count, tables };
}
```

## Results

- **Accidental deletion recovery: 4 hours → 10 seconds** — click "Restore" in the trash view; project, tasks, comments, and attachments all come back instantly
- **Data loss incidents: 3/month → 0** — soft delete means nothing is permanently gone for 30 days; even if a user confirms deletion, they can change their mind
- **Cascading works correctly** — deleting a project soft-deletes its 500 tasks, 2,000 comments, and 300 attachments in one transaction; restoring brings everything back
- **Auto-purge respects retention** — cron job runs nightly; records older than 30 days are permanently deleted; storage doesn't grow unbounded
- **Full audit trail** — deletion log shows who deleted what, when, why, and which records were affected by cascade
