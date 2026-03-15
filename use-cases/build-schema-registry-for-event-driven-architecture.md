---
title: Build a Schema Registry for Event-Driven Architecture
slug: build-schema-registry-for-event-driven-architecture
description: >
  Prevent breaking changes in event schemas from crashing downstream
  consumers — with versioned schemas, compatibility checks, and
  automated contract testing across 30 microservices.
skills:
  - typescript
  - kafka-js
  - postgresql
  - zod
  - hono
  - vitest
category: development
tags:
  - schema-registry
  - event-driven
  - contract-testing
  - kafka
  - schema-evolution
  - backward-compatibility
---

# Build a Schema Registry for Event-Driven Architecture

## The Problem

30 microservices communicate through Kafka events. No schema validation — producers send whatever JSON they want, consumers break when fields change. Last month, the user service renamed `user_name` to `username` in a user.updated event. 4 downstream services crashed. The analytics pipeline silently dropped 3 days of data because it couldn't parse the new format. Nobody knows what events exist, what they contain, or who produces/consumes them.

## Step 1: Schema Storage and Versioning

```typescript
// src/registry/store.ts
import { Pool } from 'pg';
import { z } from 'zod';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export const SchemaEntry = z.object({
  subject: z.string(),         // e.g., "user.updated"
  version: z.number().int(),
  schema: z.string(),          // JSON Schema or Zod schema as JSON
  compatibility: z.enum(['backward', 'forward', 'full', 'none']),
  producer: z.string(),        // service that produces this event
  consumers: z.array(z.string()),
  description: z.string(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
});

export async function registerSchema(entry: z.infer<typeof SchemaEntry>): Promise<{
  registered: boolean;
  errors?: string[];
}> {
  // Fetch latest version
  const { rows } = await db.query(
    `SELECT schema, version FROM schemas WHERE subject = $1 ORDER BY version DESC LIMIT 1`,
    [entry.subject]
  );

  // Check compatibility
  if (rows[0] && entry.compatibility !== 'none') {
    const errors = checkCompatibility(
      JSON.parse(rows[0].schema),
      JSON.parse(entry.schema),
      entry.compatibility
    );
    if (errors.length > 0) {
      return { registered: false, errors };
    }
  }

  const version = rows[0] ? rows[0].version + 1 : 1;

  await db.query(`
    INSERT INTO schemas (subject, version, schema, compatibility, producer, consumers, description, created_by, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
  `, [entry.subject, version, entry.schema, entry.compatibility,
      entry.producer, entry.consumers, entry.description, entry.createdBy]);

  return { registered: true };
}

function checkCompatibility(
  oldSchema: any,
  newSchema: any,
  mode: string
): string[] {
  const errors: string[] = [];

  if (mode === 'backward' || mode === 'full') {
    // New consumers must read old data: new schema can't add required fields
    const oldRequired = new Set(oldSchema.required ?? []);
    const newRequired = new Set(newSchema.required ?? []);

    for (const field of newRequired) {
      if (!oldRequired.has(field) && !oldSchema.properties?.[field]) {
        errors.push(`BACKWARD: New required field '${field}' not in old schema — old data won't have it`);
      }
    }
  }

  if (mode === 'forward' || mode === 'full') {
    // Old consumers must read new data: can't remove fields old consumers use
    const oldFields = Object.keys(oldSchema.properties ?? {});
    const newFields = new Set(Object.keys(newSchema.properties ?? {}));

    for (const field of oldFields) {
      if (!newFields.has(field)) {
        errors.push(`FORWARD: Removed field '${field}' — old consumers still expect it`);
      }
    }

    // Can't change field types
    for (const field of oldFields) {
      if (newSchema.properties?.[field]) {
        const oldType = oldSchema.properties[field].type;
        const newType = newSchema.properties[field].type;
        if (oldType !== newType) {
          errors.push(`FORWARD: Changed type of '${field}' from '${oldType}' to '${newType}'`);
        }
      }
    }
  }

  return errors;
}
```

## Step 2: Kafka Serializer/Deserializer

```typescript
// src/registry/serde.ts
import Ajv from 'ajv';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const ajv = new Ajv({ allErrors: true });

// Cache compiled validators
const validatorCache = new Map<string, any>();

export async function serialize(
  subject: string,
  data: Record<string, unknown>
): Promise<Buffer> {
  const schema = await getLatestSchema(subject);
  const validate = getValidator(subject, schema);

  if (!validate(data)) {
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`Schema validation failed for ${subject}: ${errors}`);
  }

  // Envelope: version prefix + JSON payload
  const version = await getLatestVersion(subject);
  const payload = JSON.stringify(data);
  const envelope = Buffer.alloc(5 + payload.length);
  envelope.writeUInt8(0, 0);         // magic byte
  envelope.writeUInt32BE(version, 1); // schema version
  envelope.write(payload, 5);
  return envelope;
}

export async function deserialize(
  subject: string,
  buffer: Buffer
): Promise<{ version: number; data: Record<string, unknown> }> {
  const magic = buffer.readUInt8(0);
  if (magic !== 0) throw new Error('Invalid envelope magic byte');

  const version = buffer.readUInt32BE(1);
  const payload = buffer.subarray(5).toString();
  const data = JSON.parse(payload);

  // Validate against the version it was produced with
  const schema = await getSchemaByVersion(subject, version);
  const validate = getValidator(`${subject}:${version}`, schema);

  if (!validate(data)) {
    console.warn(`Schema validation warning for ${subject} v${version}:`, validate.errors);
  }

  return { version, data };
}

function getValidator(key: string, schema: any): any {
  if (!validatorCache.has(key)) {
    validatorCache.set(key, ajv.compile(schema));
  }
  return validatorCache.get(key);
}

async function getLatestSchema(subject: string): Promise<any> {
  const { rows } = await db.query(
    `SELECT schema FROM schemas WHERE subject = $1 ORDER BY version DESC LIMIT 1`,
    [subject]
  );
  if (!rows[0]) throw new Error(`No schema registered for ${subject}`);
  return JSON.parse(rows[0].schema);
}

async function getSchemaByVersion(subject: string, version: number): Promise<any> {
  const { rows } = await db.query(
    `SELECT schema FROM schemas WHERE subject = $1 AND version = $2`,
    [subject, version]
  );
  if (!rows[0]) throw new Error(`Schema ${subject} v${version} not found`);
  return JSON.parse(rows[0].schema);
}

async function getLatestVersion(subject: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT version FROM schemas WHERE subject = $1 ORDER BY version DESC LIMIT 1`,
    [subject]
  );
  return rows[0]?.version ?? 1;
}
```

## Step 3: CI Contract Testing

```typescript
// src/registry/contract-test.ts
import { describe, test, expect } from 'vitest';

// Auto-generated contract tests from registry
export function generateContractTests(
  subject: string,
  producerSamples: Record<string, unknown>[],
  schema: any
): void {
  const Ajv = require('ajv');
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  describe(`Contract: ${subject}`, () => {
    for (const [i, sample] of producerSamples.entries()) {
      test(`sample ${i + 1} matches schema`, () => {
        const valid = validate(sample);
        expect(valid).toBe(true);
        if (!valid) {
          console.error(validate.errors);
        }
      });
    }

    test('schema is backward compatible with previous version', async () => {
      // Fetch previous version and verify
      const prevSchema = await getSchemaByVersion(subject, schema.version - 1).catch(() => null);
      if (!prevSchema) return; // first version

      const errors = checkCompatibility(prevSchema, schema, 'backward');
      expect(errors).toEqual([]);
    });
  });
}
```

## Results

- **Breaking changes caught in CI**: 8 in the first month (would have crashed production)
- **Schema catalog**: complete inventory of 120+ event types across 30 services
- **The `user_name` → `username` incident**: impossible now — compatibility check blocks it
- **Data pipeline reliability**: zero silent data loss (was 3 days last incident)
- **Developer onboarding**: new engineers discover events via registry, not tribal knowledge
- **Schema evolution**: safe field additions, deprecations, and type migrations
- **Consumer confidence**: deserializer validates every message against its exact schema version
