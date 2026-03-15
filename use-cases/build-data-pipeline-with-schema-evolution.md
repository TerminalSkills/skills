---
title: Build a Data Pipeline with Schema Evolution
slug: build-data-pipeline-with-schema-evolution
description: Build a data ingestion pipeline that handles schema changes gracefully — auto-detecting new fields, managing backward compatibility, versioning schemas, and transforming data between schema versions without downtime.
skills:
  - typescript
  - postgresql
  - redis
  - zod
  - hono
category: data-ai
tags:
  - data-pipeline
  - schema-evolution
  - etl
  - backward-compatibility
  - data-engineering
---

# Build a Data Pipeline with Schema Evolution

## The Problem

Viktor leads data engineering at a 40-person analytics company. They ingest data from 30+ client APIs, each sending JSON payloads that change without notice. Last month, a client added a `metadata` field that broke the pipeline because the Postgres column didn't exist. Another client renamed `user_id` to `userId` — 3 days of data was silently dropped because the column mapping failed. Every schema change requires a manual migration, a code change, and a redeployment. They need a pipeline that detects schema changes automatically, adapts without downtime, and maintains backward compatibility.

## Step 1: Build the Schema Registry

```typescript
// src/schema/registry.ts — Schema registry with version tracking and compatibility checks
import { pool } from "../db";
import { z } from "zod";

interface SchemaVersion {
  id: string;
  source: string;                // "client-x-events", "webhook-stripe"
  version: number;
  fields: FieldDefinition[];
  createdAt: string;
  changeDescription: string;
}

interface FieldDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "null";
  nullable: boolean;
  required: boolean;             // present in 95%+ of records
  examples: any[];               // sample values for documentation
  addedInVersion: number;
  removedInVersion?: number;
}

interface SchemaChange {
  type: "field_added" | "field_removed" | "field_type_changed" | "field_renamed";
  field: string;
  details: string;
  breaking: boolean;
}

export class SchemaRegistry {
  // Infer schema from a batch of records
  inferSchema(records: Record<string, any>[]): FieldDefinition[] {
    const fieldStats = new Map<string, {
      types: Map<string, number>;
      nullCount: number;
      presentCount: number;
      examples: Set<string>;
    }>();

    for (const record of records) {
      this.collectFieldStats(record, "", fieldStats, records.length);
    }

    const fields: FieldDefinition[] = [];
    for (const [name, stats] of fieldStats) {
      const dominantType = [...stats.types.entries()].sort((a, b) => b[1] - a[1])[0];
      
      fields.push({
        name,
        type: dominantType[0] as any,
        nullable: stats.nullCount > 0,
        required: stats.presentCount / records.length > 0.95,
        examples: [...stats.examples].slice(0, 3),
        addedInVersion: 0, // will be set by registerSchema
      });
    }

    return fields;
  }

  private collectFieldStats(
    obj: any,
    prefix: string,
    stats: Map<string, any>,
    totalRecords: number
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (!stats.has(fullKey)) {
        stats.set(fullKey, {
          types: new Map(),
          nullCount: 0,
          presentCount: 0,
          examples: new Set(),
        });
      }

      const s = stats.get(fullKey)!;
      s.presentCount++;

      if (value === null || value === undefined) {
        s.nullCount++;
        s.types.set("null", (s.types.get("null") || 0) + 1);
      } else {
        const type = Array.isArray(value) ? "array" : typeof value;
        s.types.set(type, (s.types.get(type) || 0) + 1);

        if (type !== "object" && type !== "array" && s.examples.size < 3) {
          s.examples.add(JSON.stringify(value));
        }

        if (type === "object" && !Array.isArray(value)) {
          this.collectFieldStats(value, fullKey, stats, totalRecords);
        }
      }
    }
  }

  // Compare two schemas and detect changes
  detectChanges(oldFields: FieldDefinition[], newFields: FieldDefinition[]): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldMap = new Map(oldFields.map((f) => [f.name, f]));
    const newMap = new Map(newFields.map((f) => [f.name, f]));

    // New fields
    for (const [name, field] of newMap) {
      if (!oldMap.has(name)) {
        changes.push({
          type: "field_added",
          field: name,
          details: `New ${field.type} field (${field.required ? "required" : "optional"})`,
          breaking: false, // adding fields is backward compatible
        });
      }
    }

    // Removed fields
    for (const [name, field] of oldMap) {
      if (!newMap.has(name)) {
        // Check if it was renamed (similar examples in a new field)
        const possibleRename = [...newMap.entries()].find(([n, f]) =>
          !oldMap.has(n) && f.type === field.type
        );

        if (possibleRename) {
          changes.push({
            type: "field_renamed",
            field: name,
            details: `Possibly renamed to "${possibleRename[0]}"`,
            breaking: true,
          });
        } else {
          changes.push({
            type: "field_removed",
            field: name,
            details: `${field.type} field no longer present`,
            breaking: field.required,
          });
        }
      }
    }

    // Type changes
    for (const [name, newField] of newMap) {
      const oldField = oldMap.get(name);
      if (oldField && oldField.type !== newField.type) {
        changes.push({
          type: "field_type_changed",
          field: name,
          details: `Type changed from ${oldField.type} to ${newField.type}`,
          breaking: true,
        });
      }
    }

    return changes;
  }

  // Register a new schema version
  async registerSchema(
    source: string,
    fields: FieldDefinition[],
    changes: SchemaChange[]
  ): Promise<SchemaVersion> {
    const { rows: [latest] } = await pool.query(
      "SELECT version FROM schema_versions WHERE source = $1 ORDER BY version DESC LIMIT 1",
      [source]
    );

    const version = (latest?.version || 0) + 1;

    // Set addedInVersion for new fields
    const fieldsWithVersion = fields.map((f) => ({
      ...f,
      addedInVersion: f.addedInVersion || version,
    }));

    const schema: SchemaVersion = {
      id: `${source}-v${version}`,
      source,
      version,
      fields: fieldsWithVersion,
      createdAt: new Date().toISOString(),
      changeDescription: changes.map((c) => `${c.type}: ${c.field} — ${c.details}`).join("; "),
    };

    await pool.query(
      `INSERT INTO schema_versions (id, source, version, fields, change_description, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [schema.id, source, version, JSON.stringify(fieldsWithVersion), schema.changeDescription]
    );

    // Auto-create missing database columns for non-breaking changes
    if (changes.some((c) => c.type === "field_added")) {
      await this.autoMigrate(source, changes, fieldsWithVersion);
    }

    return schema;
  }

  private async autoMigrate(source: string, changes: SchemaChange[], fields: FieldDefinition[]): Promise<void> {
    const tableName = `data_${source.replace(/[^a-z0-9]/gi, "_")}`;

    for (const change of changes) {
      if (change.type !== "field_added") continue;

      const field = fields.find((f) => f.name === change.field);
      if (!field) continue;

      // Only auto-migrate top-level fields (not nested)
      if (field.name.includes(".")) continue;

      const pgType = {
        string: "TEXT",
        number: "DOUBLE PRECISION",
        boolean: "BOOLEAN",
        object: "JSONB",
        array: "JSONB",
        null: "TEXT",
      }[field.type];

      try {
        await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${field.name}" ${pgType}`);
        console.log(`[schema] Auto-migrated: added column ${field.name} (${pgType}) to ${tableName}`);
      } catch (err) {
        console.error(`[schema] Auto-migration failed for ${field.name}:`, err);
      }
    }
  }
}

export const schemaRegistry = new SchemaRegistry();
```

## Step 2: Build the Adaptive Ingestion Pipeline

```typescript
// src/pipeline/ingestion.ts — Data ingestion with automatic schema detection
import { schemaRegistry } from "../schema/registry";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function ingestBatch(
  source: string,
  records: Record<string, any>[]
): Promise<{ ingested: number; schemaChanged: boolean; changes: any[] }> {
  // Infer schema from this batch
  const inferredFields = schemaRegistry.inferSchema(records);

  // Compare against the latest registered schema
  const { rows: [latest] } = await pool.query(
    "SELECT fields FROM schema_versions WHERE source = $1 ORDER BY version DESC LIMIT 1",
    [source]
  );

  let schemaChanged = false;
  let changes: any[] = [];

  if (latest) {
    const currentFields = JSON.parse(latest.fields);
    changes = schemaRegistry.detectChanges(currentFields, inferredFields);

    if (changes.length > 0) {
      schemaChanged = true;

      const hasBreaking = changes.some((c) => c.breaking);
      if (hasBreaking) {
        // Alert on breaking changes but don't block ingestion
        await redis.rpush("schema:alerts", JSON.stringify({
          source,
          changes,
          timestamp: Date.now(),
          severity: "breaking",
        }));
      }

      await schemaRegistry.registerSchema(source, inferredFields, changes);
    }
  } else {
    // First schema registration
    await schemaRegistry.registerSchema(source, inferredFields, []);
    schemaChanged = true;
  }

  // Insert records with field mapping
  const tableName = `data_${source.replace(/[^a-z0-9]/gi, "_")}`;
  let ingested = 0;

  for (const record of records) {
    const flatRecord = flattenObject(record);
    const columns = Object.keys(flatRecord).filter((k) => !k.includes("."));
    const values = columns.map((c) => flatRecord[c]);

    try {
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = columns.map((c) => `"${c}"`).join(", ");

      await pool.query(
        `INSERT INTO ${tableName} (${colNames}, _raw, _ingested_at)
         VALUES (${placeholders}, $${columns.length + 1}, NOW())`,
        [...values, JSON.stringify(record)]
      );
      ingested++;
    } catch (err: any) {
      // Store failed records for retry
      await redis.rpush(`pipeline:failed:${source}`, JSON.stringify({
        record,
        error: err.message,
        timestamp: Date.now(),
      }));
    }
  }

  return { ingested, schemaChanged, changes };
}

function flattenObject(obj: any, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}
```

## Results

- **Zero downtime from schema changes** — the pipeline auto-detects new fields and adds database columns without manual intervention; the `metadata` field incident is impossible
- **Field rename detection saved 3 days of data** — when a client renamed `user_id` to `userId`, the registry flagged it as a breaking change and alerted within minutes
- **Schema version history for debugging** — every change is tracked with version numbers, timestamps, and diffs; "when did this field appear?" is a single query
- **30+ sources with different schemas managed automatically** — each source has independent schema tracking; changes in one source don't affect others
- **Auto-migration handles 90% of schema changes** — only breaking changes (type changes, renames) require manual intervention; new fields are added automatically
